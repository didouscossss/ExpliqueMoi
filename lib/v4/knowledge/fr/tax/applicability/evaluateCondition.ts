/**
 * Évaluation déterministe des conditions d’applicabilité — V4-T.
 * Table de vérité explicite ; pas d’eval() ; absence ≠ false.
 */

import type {
  CandidateDocumentFact,
  ClarificationSession,
  FactConflict,
  TaxApplicabilityConditionEvaluation,
  TaxApplicabilityConditionNode,
  TaxApplicabilityConditionResult,
  TaxApplicabilityEvidence,
  TaxApplicabilityMissingInformation,
  UserProvidedFact
} from "../../../../types/knowledge.js";

export interface ConditionEvalContext {
  fieldCode: string;
  ruleId: string;
  facts: readonly CandidateDocumentFact[];
  userFacts: readonly UserProvidedFact[];
  conflicts: readonly FactConflict[];
  documentTypes: readonly string[];
  /** Textes bruts des documents — pour indices lexicaux sourcés (ex. régime réel). */
  documentTexts: readonly string[];
  fieldCodesPresent: readonly string[];
  yearsPresent: readonly number[];
  targetYear: number | null;
  clarificationSession?: ClarificationSession | null;
}

let evidenceSeq = 0;
export function resetApplicabilityEvidenceIdsForTests(): void {
  evidenceSeq = 0;
}

function nextEvidenceId(prefix: string): string {
  evidenceSeq += 1;
  return `ae-${prefix}-${evidenceSeq}`;
}

export function evaluateCondition(
  node: TaxApplicabilityConditionNode,
  ctx: ConditionEvalContext
): TaxApplicabilityConditionEvaluation {
  if (node.op === "allOf") {
    return combineAllOf(node.conditions || [], ctx);
  }
  if (node.op === "anyOf") {
    return combineAnyOf(node.conditions || [], ctx);
  }
  if (node.op === "not") {
    const inner = evaluateCondition(node.conditions?.[0] || {}, ctx);
    return {
      result: notResult(inner.result),
      evidence: inner.evidence,
      missingInformation: inner.missingInformation,
      conflicts: inner.conflicts,
      trace: `not(${inner.trace})=${notResult(inner.result)}`
    };
  }
  return evaluatePredicate(node, ctx);
}

function notResult(
  r: TaxApplicabilityConditionResult
): TaxApplicabilityConditionResult {
  if (r === "true") return "false";
  if (r === "false") return "true";
  return r; // unknown / conflicted
}

function combineAllOf(
  nodes: TaxApplicabilityConditionNode[],
  ctx: ConditionEvalContext
): TaxApplicabilityConditionEvaluation {
  if (!nodes.length) {
    return emptyEval("unknown", "allOf([])");
  }
  const parts = nodes.map((n) => evaluateCondition(n, ctx));
  const results = parts.map((p) => p.result);
  let result: TaxApplicabilityConditionResult = "true";
  if (results.includes("false")) result = "false";
  else if (results.includes("conflicted")) result = "conflicted";
  else if (results.includes("unknown")) result = "unknown";
  return mergeParts(parts, result, `allOf[${results.join(",")}]`);
}

function combineAnyOf(
  nodes: TaxApplicabilityConditionNode[],
  ctx: ConditionEvalContext
): TaxApplicabilityConditionEvaluation {
  if (!nodes.length) {
    return emptyEval("unknown", "anyOf([])");
  }
  const parts = nodes.map((n) => evaluateCondition(n, ctx));
  const results = parts.map((p) => p.result);
  let result: TaxApplicabilityConditionResult = "false";
  if (results.includes("true")) result = "true";
  else if (results.includes("conflicted")) result = "conflicted";
  else if (results.includes("unknown")) result = "unknown";
  return mergeParts(parts, result, `anyOf[${results.join(",")}]`);
}

function mergeParts(
  parts: TaxApplicabilityConditionEvaluation[],
  result: TaxApplicabilityConditionResult,
  trace: string
): TaxApplicabilityConditionEvaluation {
  return {
    result,
    evidence: parts.flatMap((p) => p.evidence),
    missingInformation: parts.flatMap((p) => p.missingInformation),
    conflicts: [...new Set(parts.flatMap((p) => p.conflicts))],
    trace: `${trace}=${result}`
  };
}

function emptyEval(
  result: TaxApplicabilityConditionResult,
  trace: string
): TaxApplicabilityConditionEvaluation {
  return {
    result,
    evidence: [],
    missingInformation: [],
    conflicts: [],
    trace
  };
}

function evaluatePredicate(
  node: TaxApplicabilityConditionNode,
  ctx: ConditionEvalContext
): TaxApplicabilityConditionEvaluation {
  const pred = node.predicate;
  if (!pred) {
    return emptyEval("unknown", "missing_predicate");
  }

  switch (pred) {
    case "fieldPresent":
      return boolKnown(
        ctx.fieldCodesPresent.includes(
          (node.fieldCode || ctx.fieldCode).toUpperCase()
        ),
        `fieldPresent:${node.fieldCode || ctx.fieldCode}`,
        ctx,
        node,
        "officialKnowledge"
      );
    case "documentTypePresent": {
      const want = (node.documentType || "").toLowerCase();
      const hit = ctx.documentTypes.some(
        (t) => t.toLowerCase() === want || t.toLowerCase().includes(want)
      );
      return boolKnown(
        hit,
        `documentTypePresent:${want}`,
        ctx,
        node,
        "document"
      );
    }
    case "yearIs": {
      const y = node.year;
      if (y == null) return emptyEval("unknown", "yearIs:missing");
      if (!ctx.yearsPresent.length) {
        return withMissing(
          "unknown",
          `yearIs:${y}:absent`,
          ctx,
          node,
          "Année des revenus non déterminée."
        );
      }
      if (ctx.yearsPresent.includes(y)) {
        return boolKnown(true, `yearIs:${y}`, ctx, node, "document");
      }
      // mauvaise année présente ≠ absente : false explicite pour exact match
      return boolKnown(false, `yearIs:${y}:mismatch`, ctx, node, "document");
    }
    case "roleIs":
      return evalRole(node, ctx);
    case "regimeIs":
      return evalRegime(node, ctx);
    case "booleanIs":
    case "userFactEquals":
    case "factEquals":
      return evalEquals(node, ctx);
    case "factIn":
      return evalIn(node, ctx);
    case "factExists":
    case "amountPresent":
      return evalExists(node, ctx);
    default:
      return emptyEval("unknown", `unsupported:${pred}`);
  }
}

function evalRole(
  node: TaxApplicabilityConditionNode,
  ctx: ConditionEvalContext
): TaxApplicabilityConditionEvaluation {
  const want = node.role;
  if (!want) return emptyEval("unknown", "roleIs:missing");
  const code = (node.fieldCode || ctx.fieldCode).toUpperCase();
  const docRoles = ctx.facts
    .filter(
      (f) =>
        f.fieldCode === code &&
        (f.factType === "declarantRole" ||
          (f.declarantRole && f.factType !== "amount"))
    )
    .map((f) => f.declarantRole || String(f.value || f.displayValue || ""));
  const userRoles = ctx.userFacts
    .filter((u) => {
      if (u.active === false) return false;
      if (u.fieldCode !== code && !u.requirementId?.includes("role")) {
        return false;
      }
      // Préférer le champ role explicite ; ne pas lire un montant comme rôle
      if (u.role && u.role !== "unknown") return true;
      if (u.requirementId?.includes("role") && u.normalizedValue != null) {
        return typeof u.normalizedValue === "string";
      }
      return false;
    })
    .map((u) =>
      u.role && u.role !== "unknown"
        ? String(u.role)
        : String(u.normalizedValue)
    );

  const all = [...docRoles, ...userRoles].filter(Boolean);
  if (!all.length) {
    return withMissing(
      "unknown",
      `roleIs:${want}:absent`,
      ctx,
      node,
      `Le rôle déclarant pour ${code} n’est pas encore connu.`
    );
  }
  const unique = [...new Set(all)];
  if (unique.length > 1 && !unique.every((r) => r === want)) {
    // document vs user conflict on role
    const docHas = docRoles.some((r) => r === want || r !== want);
    const userHas = userRoles.length > 0;
    if (
      docRoles.length &&
      userRoles.length &&
      docRoles.some((r) => !userRoles.includes(r))
    ) {
      return {
        result: "conflicted",
        evidence: [
          evid("document", `Rôles document : ${docRoles.join(", ")}`, ctx),
          evid("user", `Rôles utilisateur : ${userRoles.join(", ")}`, ctx)
        ],
        missingInformation: [],
        conflicts: [
          `Rôle contradictoire pour ${code} (document vs utilisateur).`
        ],
        trace: `roleIs:${want}:conflicted`
      };
    }
    void docHas;
    void userHas;
  }
  const match = unique.includes(want);
  return boolKnown(match, `roleIs:${want}`, ctx, node, "document");
}

function evalRegime(
  node: TaxApplicabilityConditionNode,
  ctx: ConditionEvalContext
): TaxApplicabilityConditionEvaluation {
  const want = String(node.value || "").toLowerCase(); // "reel" | "micro"
  const fromDocs = detectRegimeFromFacts(
    ctx.facts,
    ctx.fieldCode,
    ctx.documentTexts
  );
  const fromUser = detectRegimeFromUser(ctx.userFacts, ctx.fieldCode);

  if (fromDocs && fromUser && fromDocs !== fromUser) {
    return {
      result: "conflicted",
      evidence: [
        evid(
          "document",
          `Régime d’après document : ${fromDocs}`,
          ctx
        ),
        evid("user", `Régime d’après votre réponse : ${fromUser}`, ctx)
      ],
      missingInformation: [],
      conflicts: [
        "Les informations se contredisent sur le régime d’imposition des revenus fonciers (document vs réponse utilisateur)."
      ],
      trace: `regimeIs:${want}:conflicted`
    };
  }
  const regime = fromDocs || fromUser;
  if (!regime) {
    return withMissing(
      "unknown",
      `regimeIs:${want}:absent`,
      ctx,
      node,
      "Le régime d’imposition des revenus fonciers (micro-foncier ou réel) n’est pas encore connu."
    );
  }
  return boolKnown(
    regime === want,
    `regimeIs:${want}:${regime}`,
    ctx,
    node,
    fromDocs ? "document" : "user"
  );
}

function detectRegimeFromFacts(
  facts: readonly CandidateDocumentFact[],
  fieldCode: string,
  documentTexts: readonly string[] = []
): "reel" | "micro" | null {
  const blob = [
    ...facts
      .filter(
        (f) =>
          !f.fieldCode ||
          f.fieldCode.startsWith("4B") ||
          f.fieldCode === fieldCode ||
          /foncier|2044|régime/i.test(f.provenanceNote || "")
      )
      .map((f) =>
        [f.displayValue, f.provenanceNote, f.value, f.documentType]
          .filter(Boolean)
          .join(" ")
      ),
    ...documentTexts
  ]
    .join(" ")
    .toLowerCase();
  // Prefer explicit micro before réel
  if (/micro[-\s]?foncier|r[eé]gime\s+micro/.test(blob)) return "micro";
  if (/r[eé]gime\s+r[eé]el/.test(blob)) return "reel";
  return null;
}

function detectRegimeFromUser(
  userFacts: readonly UserProvidedFact[],
  fieldCode: string
): "reel" | "micro" | null {
  for (const u of userFacts) {
    if (u.active === false) continue;
    if (
      u.fieldCode &&
      u.fieldCode !== fieldCode &&
      !u.fieldCode.startsWith("4B")
    ) {
      continue;
    }
    const raw = String(u.normalizedValue ?? u.answer ?? u.rawAnswer ?? "")
      .toLowerCase()
      .trim();
    if (/^micro|micro[-\s]?foncier/.test(raw)) return "micro";
    if (/^r[eé]el|regime\s*reel|régime\s*réel/.test(raw)) return "reel";
    if (u.requirementId?.includes("regime") || u.requirementId?.includes("2044")) {
      if (raw === "true" || raw === "oui") return "reel";
      if (raw === "false" || raw === "non") return "micro";
    }
  }
  return null;
}

function evalEquals(
  node: TaxApplicabilityConditionNode,
  ctx: ConditionEvalContext
): TaxApplicabilityConditionEvaluation {
  const code = (node.fieldCode || ctx.fieldCode).toUpperCase();
  const want = node.value;
  const docVals = ctx.facts
    .filter((f) => f.fieldCode === code && f.displayValue != null)
    .map((f) => normalizeComparable(f.displayValue ?? f.value));
  const userVals = node.allowUserFact !== false
    ? ctx.userFacts
        .filter(
          (u) =>
            u.active !== false &&
            u.fieldCode === code &&
            (u.normalizedValue != null || u.answer)
        )
        .map((u) => normalizeComparable(u.normalizedValue ?? u.answer))
    : [];

  if (!docVals.length && !userVals.length) {
    return withMissing(
      "unknown",
      `equals:${code}:absent`,
      ctx,
      node,
      `Information manquante pour ${code}.`
    );
  }
  if (
    docVals.length &&
    userVals.length &&
    docVals.some((d) => userVals.every((u) => u !== d))
  ) {
    return {
      result: "conflicted",
      evidence: [
        evid("document", `Document : ${docVals.join(", ")}`, ctx),
        evid("user", `Vous : ${userVals.join(", ")}`, ctx)
      ],
      missingInformation: [],
      conflicts: [`Valeurs contradictoires pour ${code}.`],
      trace: `equals:${code}:conflicted`
    };
  }
  const have = [...docVals, ...userVals];
  const ok = have.some((v) => v === normalizeComparable(want));
  return boolKnown(
    ok,
    `equals:${code}`,
    ctx,
    node,
    docVals.length ? "document" : "user"
  );
}

function evalIn(
  node: TaxApplicabilityConditionNode,
  ctx: ConditionEvalContext
): TaxApplicabilityConditionEvaluation {
  const values = node.values || [];
  const code = (node.fieldCode || ctx.fieldCode).toUpperCase();
  const docVals = ctx.facts
    .filter((f) => f.fieldCode === code && f.displayValue != null)
    .map((f) => normalizeComparable(f.displayValue ?? f.value));
  if (!docVals.length) {
    return withMissing(
      "unknown",
      `in:${code}:absent`,
      ctx,
      node,
      `Information manquante pour ${code}.`
    );
  }
  const ok = docVals.some((v) =>
    values.map(normalizeComparable).includes(v)
  );
  return boolKnown(ok, `in:${code}`, ctx, node, "document");
}

function evalExists(
  node: TaxApplicabilityConditionNode,
  ctx: ConditionEvalContext
): TaxApplicabilityConditionEvaluation {
  const code = (node.fieldCode || ctx.fieldCode).toUpperCase();
  const amountOnly = node.predicate === "amountPresent";
  const docs = ctx.facts.filter((f) => {
    if (f.fieldCode !== code) return false;
    if (amountOnly) {
      if (f.factType === "declarantRole" || f.factType === "fiscalYear") {
        return false;
      }
      if (typeof f.value === "number" && Number.isFinite(f.value)) return true;
      if (f.displayValue != null && /\d/.test(String(f.displayValue))) {
        return true;
      }
      return false;
    }
    return true;
  });
  const users =
    node.allowUserFact !== false
      ? ctx.userFacts.filter((u) => {
          if (u.active === false || u.fieldCode !== code) return false;
          if (u.answerStatus !== "accepted") return false;
          if (amountOnly) {
            return (
              typeof u.normalizedValue === "number" ||
              (typeof u.normalizedValue === "string" &&
                /\d/.test(u.normalizedValue))
            );
          }
          return u.normalizedValue != null;
        })
      : [];
  if (!docs.length && !users.length) {
    return withMissing(
      "unknown",
      `exists:${code}:absent`,
      ctx,
      node,
      amountOnly
        ? `Montant non retrouvé pour ${code}.`
        : `Aucun élément trouvé concernant ${code}.`
    );
  }
  return boolKnown(
    true,
    `exists:${code}`,
    ctx,
    node,
    docs.length ? "document" : "user"
  );
}

function boolKnown(
  value: boolean,
  trace: string,
  ctx: ConditionEvalContext,
  _node: TaxApplicabilityConditionNode,
  kind: TaxApplicabilityEvidence["sourceKind"]
): TaxApplicabilityConditionEvaluation {
  return {
    result: value ? "true" : "false",
    evidence: [
      evid(kind, `${trace} → ${value ? "vrai" : "faux"}`, ctx)
    ],
    missingInformation: [],
    conflicts: [],
    trace: `${trace}=${value ? "true" : "false"}`
  };
}

function withMissing(
  result: TaxApplicabilityConditionResult,
  trace: string,
  ctx: ConditionEvalContext,
  node: TaxApplicabilityConditionNode,
  reason: string
): TaxApplicabilityConditionEvaluation {
  const missing: TaxApplicabilityMissingInformation[] = [];
  if (node.missingInformationId && node.missingQuestion) {
    missing.push({
      id: node.missingInformationId,
      fieldCode: node.fieldCode || ctx.fieldCode,
      question: node.missingQuestion,
      expectedAnswerType: node.expectedAnswerType || "text",
      reason,
      ruleId: ctx.ruleId
    });
  }
  return {
    result,
    evidence: [],
    missingInformation: missing,
    conflicts: [],
    trace
  };
}

function evid(
  kind: TaxApplicabilityEvidence["sourceKind"],
  detail: string,
  ctx: ConditionEvalContext
): TaxApplicabilityEvidence {
  return {
    evidenceId: nextEvidenceId(kind),
    sourceKind: kind,
    label:
      kind === "document"
        ? "Information trouvée dans le document"
        : kind === "user"
          ? "Information fournie par vous"
          : "Connaissance officielle",
    detail,
    ruleId: ctx.ruleId
  };
}

function normalizeComparable(v: unknown): string {
  if (typeof v === "boolean") return v ? "true" : "false";
  if (typeof v === "number") return String(v);
  return String(v ?? "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}
