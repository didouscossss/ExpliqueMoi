/**
 * Résolution générique des FieldExpectation.
 * Pas de findFirst / regex[0] comme décision finale :
 * scoring multi-candidats + cohérence V4-C + ambiguïté explicite.
 */

import { toConfidence, clamp01 } from "../types/confidence.js";
import type {
  DocumentProfile,
  DocumentProfileContext,
  FieldAlternative,
  FieldExpectation,
  ProfileCompleteness,
  ProfileResolutionResult,
  ProfileValidationResult,
  ResolvedField
} from "../types/documentProfile.js";
import type { EntityCandidate, ScoreReason } from "../types/entityCandidate.js";
import type { EvidenceSpan, FieldEvidence } from "../types/evidence.js";
import { bestRole, roleScore } from "../relations/helpers.js";
import { normalizeLex } from "../candidates/normalize.js";

interface ScoredOption {
  value: unknown;
  candidate: EntityCandidate;
  score: number;
  reasons: ScoreReason[];
}

function candidateContextBlob(c: EntityCandidate): string {
  return normalizeLex(
    [
      c.context?.previousLine,
      c.context?.sameLine,
      c.context?.nextLine,
      c.raw,
      typeof c.value === "string" ? c.value : ""
    ]
      .filter(Boolean)
      .join(" ")
  );
}

function scoreCandidateForField(
  c: EntityCandidate,
  exp: FieldExpectation,
  ctx: DocumentProfileContext
): ScoredOption | null {
  if (!exp.candidateTypes.includes(c.type)) return null;

  const reasons: ScoreReason[] = [];
  let score = 0;

  const roles = exp.preferredRoles?.length
    ? exp.preferredRoles
    : [bestRole(c) || ""].filter(Boolean);

  let best = 0;
  for (const role of roles) {
    const rs = roleScore(c, role);
    if (rs > best) best = rs;
    if (rs > 0) reasons.push({ signal: `role:${role}`, delta: rs * 0.7 });
  }
  score += best * 0.7;

  // Hypothèse top même hors preferredRoles (faible)
  const top = c.hypotheses[0];
  if (top && !roles.includes(top.role)) {
    score += top.score * 0.12;
    reasons.push({ signal: `topHypothesis:${top.role}`, delta: top.score * 0.12 });
  }

  // Bonus cohérence globale V4-C
  const assigned = ctx.consistency?.best?.assignments.find(
    (a) => a.candidateId === c.id && roles.includes(a.role)
  );
  if (assigned) {
    score += 0.28;
    reasons.push({ signal: "consistency:assigned", delta: 0.28 });
  } else if (
    ctx.consistency?.best?.assignments.some((a) => a.candidateId === c.id)
  ) {
    score += 0.08;
    reasons.push({ signal: "consistency:otherRole", delta: 0.08 });
  }

  // Relations attendues
  const rels = ctx.relations || [];
  for (const rt of exp.expectedRelations || []) {
    const hit = rels.some(
      (r) =>
        r.type === rt &&
        (r.sourceCandidateId === c.id || r.targetCandidateId === c.id)
    );
    if (hit) {
      score += 0.12;
      reasons.push({ signal: `relation:${rt}`, delta: 0.12 });
    }
  }

  const blob = candidateContextBlob(c);
  for (const re of exp.positiveContext || []) {
    if (re.test(blob) || re.test(String(c.raw || ""))) {
      score += 0.1;
      reasons.push({ signal: `positiveContext:${re.source}`, delta: 0.1 });
    }
  }
  for (const re of exp.negativeSignals || []) {
    if (re.test(blob)) {
      score -= 0.25;
      reasons.push({ signal: `negative:${re.source}`, delta: -0.25 });
    }
  }

  // Contradictions visant ce candidat
  const contrad = (ctx.consistency?.contradictions || []).some((x) =>
    (x.subjectIds || []).includes(c.id)
  );
  if (contrad) {
    score -= 0.2;
    reasons.push({ signal: "contradiction", delta: -0.2 });
  }

  score = clamp01(score);
  if (score < 0.05 && best < 0.05) return null;

  return { value: c.value, candidate: c, score, reasons };
}

function evidenceOf(c: EntityCandidate): EvidenceSpan[] {
  return [...(c.evidence || [])];
}

/** Fallback soft : blocs textuels scorés (jamais findFirst aveugle). */
function scoreBlocksForField(
  exp: FieldExpectation,
  ctx: DocumentProfileContext
): ScoredOption[] {
  const softTypes = new Set([
    "documentTitle",
    "sectionTitle",
    "action",
    "obligation",
    "warning",
    "period"
  ]);
  if (!exp.candidateTypes.some((t) => softTypes.has(t))) return [];
  if (!exp.positiveContext?.length && !softTypes.has(exp.candidateTypes[0])) {
    return [];
  }

  const out: ScoredOption[] = [];
  for (const [i, block] of ctx.blocks.entries()) {
    const text = block.text?.trim();
    if (!text || text.length < 3) continue;
    const lex = normalizeLex(text);
    const reasons: ScoreReason[] = [];
    let score = 0;

    // Titre probable : premiers blocs courts (insuffisant seul pour sections génériques)
    if (exp.candidateTypes.includes("documentTitle") && i === 0 && text.length <= 80) {
      score += 0.32;
      reasons.push({ signal: "layout:earlyShortBlock", delta: 0.32 });
    }

    for (const re of exp.positiveContext || []) {
      if (re.test(text) || re.test(lex)) {
        score += 0.35;
        reasons.push({ signal: `blockContext:${re.source}`, delta: 0.35 });
      }
    }

    // Objet :
    if (/\bobjet\s*:/i.test(text) && exp.field === "subject") {
      score += 0.4;
      reasons.push({ signal: "block:objet", delta: 0.4 });
    }

    if (/^\d+\s*[.)-]/.test(text) && exp.field === "keyPoints") {
      score += 0.3;
      reasons.push({ signal: "block:numberedPoint", delta: 0.3 });
    }

    if (score < 0.25) continue;

    // Candidat synthétique local (non persisté) pour evidence
    const synthetic: EntityCandidate = {
      id: `block:${block.id || i}`,
      type: exp.candidateTypes[0],
      value: text.replace(/^objet\s*:\s*/i, "").trim(),
      hypotheses: [{ role: exp.preferredRoles?.[0] || "other", score, reasons }],
      evidence: [
        {
          text,
          page: block.page,
          bbox: block.bbox ?? null,
          blockId: block.id,
          lineId: block.lineId ?? null
        }
      ],
      page: block.page
    };
    out.push({ value: synthetic.value, candidate: synthetic, score: clamp01(score), reasons });
  }
  return out;
}

function resolveOne(
  exp: FieldExpectation,
  ctx: DocumentProfileContext
): ResolvedField {
  if (exp.notApplicable) {
    return { field: exp.field, status: "notApplicable", expectation: exp };
  }

  const threshold = exp.confidenceThreshold ?? 0.55;
  const fromCandidates = ctx.candidates
    .map((c) => scoreCandidateForField(c, exp, ctx))
    .filter((o): o is ScoredOption => Boolean(o));
  const fromBlocks = scoreBlocksForField(exp, ctx);
  const options = [...fromCandidates, ...fromBlocks].sort(
    (a, b) => b.score - a.score
  );

  if (!options.length) {
    return {
      field: exp.field,
      status: "missing",
      expectation: exp,
      reasons: [{ signal: "noCandidate", delta: 0 }]
    };
  }

  if (exp.cardinality === "multiple") {
    const kept = options.filter((o) => o.score >= threshold * 0.75);
    if (!kept.length) {
      return {
        field: exp.field,
        status: "missing",
        expectation: exp,
        reasons: [{ signal: "belowThreshold", delta: 0 }]
      };
    }
    return {
      field: exp.field,
      status: "resolved",
      value: kept.map((o) => o.value),
      confidence: toConfidence(
        kept.reduce((a, o) => a + o.score, 0) / kept.length
      ),
      evidence: kept.flatMap((o) => evidenceOf(o.candidate)),
      candidateIds: kept.map((o) => o.candidate.id),
      reasons: kept.flatMap((o) => o.reasons).slice(0, 12),
      expectation: exp
    };
  }

  const top = options[0];
  const second = options[1];
  const alts: FieldAlternative[] = options.slice(0, 4).map((o) => ({
    value: o.value,
    confidence: o.score,
    candidateIds: [o.candidate.id],
    reasons: o.reasons
  }));

  if (
    second &&
    second.score >= threshold * 0.85 &&
    Math.abs(top.score - second.score) < 0.12 &&
    String(top.value) !== String(second.value)
  ) {
    return {
      field: exp.field,
      status: "ambiguous",
      value: top.value,
      confidence: toConfidence(top.score * 0.7),
      evidence: evidenceOf(top.candidate),
      candidateIds: [top.candidate.id],
      alternatives: alts,
      reasons: [
        ...top.reasons,
        {
          signal: `ambiguous:${String(top.value)}≈${String(second.value)}`,
          delta: -0.1
        }
      ],
      expectation: exp
    };
  }

  if (top.score < threshold) {
    return {
      field: exp.field,
      status: "missing",
      alternatives: alts,
      reasons: [
        ...top.reasons,
        { signal: "belowThreshold", delta: top.score - threshold }
      ],
      expectation: exp
    };
  }

  return {
    field: exp.field,
    status: "resolved",
    value: top.value,
    confidence: toConfidence(top.score),
    evidence: evidenceOf(top.candidate),
    candidateIds: [top.candidate.id],
    alternatives: alts.slice(1),
    reasons: top.reasons,
    expectation: exp
  };
}

export function computeCompleteness(
  fields: ResolvedField[]
): ProfileCompleteness {
  const required = fields.filter((f) => f.expectation.required);
  const missingRequired = required
    .filter((f) => f.status === "missing")
    .map((f) => f.field);
  const ambiguous = fields
    .filter((f) => f.status === "ambiguous")
    .map((f) => f.field);
  const resolved = fields
    .filter((f) => f.status === "resolved")
    .map((f) => f.field);
  const resolvedHighConfidence = fields
    .filter(
      (f) =>
        f.status === "resolved" &&
        (f.confidence?.score ?? 0) >= 0.75
    )
    .map((f) => f.field);
  const notApplicable = fields
    .filter((f) => f.status === "notApplicable")
    .map((f) => f.field);

  const weighted = required.length
    ? required.reduce((acc, f) => {
        if (f.status === "resolved") return acc + 1;
        if (f.status === "ambiguous") return acc + 0.4;
        return acc;
      }, 0) / required.length
    : fields.filter((f) => f.status === "resolved").length /
        Math.max(
          1,
          fields.filter((f) => f.status !== "notApplicable").length
        );

  // Pénalité douce pour ambiguïtés optionnelles
  const ambPenalty = Math.min(0.15, ambiguous.length * 0.03);
  const completeness = clamp01(weighted - ambPenalty);

  return {
    completeness: Number(completeness.toFixed(4)),
    missingRequired,
    ambiguous,
    resolvedHighConfidence,
    resolved,
    notApplicable
  };
}

export function resolveProfileFields(
  profile: DocumentProfile,
  ctx: DocumentProfileContext
): ProfileResolutionResult {
  const expectations: FieldExpectation[] = [
    ...profile.expectedFields,
    ...profile.optionalFields,
    ...(profile.notApplicableFields || []),
    ...(profile.forbiddenOrSuspiciousFields || []).map((f) => ({
      ...f,
      // champs suspects : on résout quand même pour signaler
      required: false
    }))
  ];

  // Dédupliquer par nom de champ (expected > optional > na)
  const seen = new Set<string>();
  const ordered: FieldExpectation[] = [];
  for (const exp of expectations) {
    if (seen.has(exp.field)) continue;
    seen.add(exp.field);
    ordered.push(exp);
  }

  const fields = ordered.map((exp) => resolveOne(exp, ctx));
  const completeness = computeCompleteness(fields);
  const warnings: string[] = [];

  for (const f of fields) {
    if (f.status === "missing" && f.expectation.required) {
      warnings.push(`missingRequired:${f.field}`);
    }
    if (f.status === "ambiguous") {
      warnings.push(`ambiguous:${f.field}`);
    }
  }

  // Champs suspects présents
  for (const sus of profile.forbiddenOrSuspiciousFields || []) {
    const hit = fields.find((f) => f.field === sus.field);
    if (hit && (hit.status === "resolved" || hit.status === "ambiguous")) {
      warnings.push(`suspicious:${sus.field}`);
    }
  }

  return {
    profileId: profile.id,
    fields,
    completeness,
    relations: [...(ctx.relations || [])],
    warnings
  };
}

export function validateProfile(
  profile: DocumentProfile,
  ctx: DocumentProfileContext
): ProfileValidationResult {
  const resolution = profile.resolveFields(ctx);
  const issues = [...resolution.warnings];
  if (resolution.completeness.missingRequired.length) {
    issues.push(
      `completeness:missingRequired=${resolution.completeness.missingRequired.join(",")}`
    );
  }
  return {
    ok: resolution.completeness.missingRequired.length === 0,
    resolution,
    issues
  };
}

export function resolutionToAnalysis(
  resolution: ProfileResolutionResult
): {
  fields: FieldEvidence[];
  relations: typeof resolution.relations;
  warnings: string[];
  resolution: ProfileResolutionResult;
} {
  const fields: FieldEvidence[] = resolution.fields
    .filter((f) => f.status === "resolved" || f.status === "ambiguous")
    .filter((f) => f.value !== undefined)
    .map((f) => ({
      field: f.field,
      value: f.value,
      confidence: f.confidence || toConfidence(0.5),
      evidence: f.evidence || [],
      candidateIds: f.candidateIds
    }));
  return {
    fields,
    relations: resolution.relations,
    warnings: resolution.warnings,
    resolution
  };
}
