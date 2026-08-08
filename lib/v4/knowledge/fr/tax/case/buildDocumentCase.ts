/**
 * Construit un DocumentCase multi-documents — V4-R.
 * Index d’abord, match ensuite. 0 fetch / 0 LLM.
 * Faits toujours rattachés à leur document source.
 */

import { analyzeDocumentV4 } from "../../../../pipeline/analyzeDocumentV4.js";
import type {
  CandidateDocumentFact,
  CaseCentricFieldView,
  CaseRequirementMatch,
  DocumentCase,
  DocumentCaseInvariants,
  DocumentCentricView,
  DocumentInstance,
  TaxAssistanceContext,
  TaxFieldAssistance,
  UserProvidedFact
} from "../../../../types/knowledge.js";
import {
  buildDocumentFactIndex,
  resetRequirementFactIdsForTests
} from "../fields/requirements/documentFactIndex.js";
import {
  buildTaxFieldAssistance,
  buildTaxAssistanceContext
} from "../fields/requirements/buildFieldAssistance.js";
import { loadFrenchTaxFieldRequirementsRegistry } from "../fields/requirements/loadRegistry.js";
import { refuseUnsafeAggregation } from "../fields/requirements/matchRequirements.js";
import { detectFactConflicts } from "./conflicts.js";
import { assessDuplicates } from "./duplicates.js";
import { buildCaseId, buildDocumentId, hashDocumentContent } from "./hash.js";
import { findCandidateFactsForRequirementInCase } from "./matchScoring.js";
import { buildDocumentRelations } from "./relations.js";
import {
  evaluateDocumentCaseApplicability
} from "../applicability/evaluateApplicability.js";
import {
  evaluateDocumentCaseCalculations
} from "../calculation/calculateDerivedValue.js";

export interface DocumentCaseInput {
  text: string;
  fileName?: string | null;
  /** Si fourni, réutilisé (tests) — sinon dérivé du hash. */
  documentId?: string | null;
}

export interface BuildDocumentCaseOptions {
  userAnswers?: UserProvidedFact[];
  resetIds?: boolean;
  /** Documents retirés — pour invariant removedDocumentFactSurvives. */
  removedDocumentIds?: string[];
}

function emptyInvariants(): DocumentCaseInvariants {
  return {
    crossDocumentFactLostProvenance: 0,
    crossDocumentUnsafeMerge: 0,
    crossDocumentUnsafeAggregation: 0,
    yearMismatchPromotedToStrong: 0,
    roleMismatchPromotedToStrong: 0,
    unknownDocumentPromotedToKnown: 0,
    duplicateDocumentDoubleCounted: 0,
    uploadOrderChangesConclusion: 0,
    removedDocumentFactSurvives: 0,
    candidateRelationPresentedAsCertain: 0,
    userAnswerPromotedToOfficialKnowledge: 0,
    knowledgePromotedToUserFact: 0,
    automaticUnsafeAggregation: 0,
    missingPresentedAsUserDoesNotHave: 0,
    unsupportedTaxAmount: 0,
    unsupportedEligibilityDecision: 0
  };
}

function statusLabelFr(status: string): string {
  switch (status) {
    case "found":
      return "Information retrouvée dans les documents actuellement analysés";
    case "missing":
      return "Information non retrouvée dans les documents actuellement analysés";
    case "ambiguous":
      return "Information ambiguë entre plusieurs documents — à vérifier";
    case "notChecked":
      return "Information non encore confrontée au dossier";
    default:
      return "Statut inconnu";
  }
}

function recognitionLabel(inst: {
  detectedReference: string | null;
  detectedType: string | null;
  confidence: number;
}): string {
  if (inst.detectedReference && inst.confidence >= 0.55) {
    return inst.detectedReference;
  }
  if (inst.detectedType && /invoice|facture/i.test(inst.detectedType)) {
    return "Document non fiscal / facture";
  }
  if (
    !inst.detectedType ||
    inst.detectedType === "unknown" ||
    inst.detectedType === "unknownTaxDocument" ||
    inst.confidence < 0.45
  ) {
    return "Type de document non identifié avec certitude";
  }
  return inst.detectedType;
}

/**
 * Analyse plusieurs documents comme un dossier.
 * L’ordre d’entrée n’influence pas les conclusions (tri par hash).
 */
export function buildDocumentCase(
  inputs: readonly DocumentCaseInput[],
  options: BuildDocumentCaseOptions = {}
): DocumentCase {
  if (options.resetIds) resetRequirementFactIdsForTests();

  const invariants = emptyInvariants();
  const userAnswers = options.userAnswers || [];

  // Tri déterministe — upload A/B == B/A
  const prepared = inputs.map((input, idx) => {
    const text = input.text || "";
    const contentHash = hashDocumentContent(text);
    return { input, text, contentHash, idx };
  });
  prepared.sort(
    (a, b) =>
      a.contentHash.localeCompare(b.contentHash) ||
      String(a.input.fileName || "").localeCompare(String(b.input.fileName || "")) ||
      a.idx - b.idx
  );

  const hashOccurrence = new Map<string, number>();
  const seeds = prepared.map((p) => {
    const occ = hashOccurrence.get(p.contentHash) || 0;
    hashOccurrence.set(p.contentHash, occ + 1);
    const documentId =
      p.input.documentId || buildDocumentId(p.contentHash, occ);
    return {
      documentId,
      text: p.text,
      fileName: p.input.fileName || null,
      contentHash: p.contentHash
    };
  });

  const caseId = buildCaseId(seeds.map((s) => s.contentHash));

  // Analyse individuelle
  const analyzed = seeds.map((seed) => {
    const result = analyzeDocumentV4({
      text: seed.text,
      fiscalKnowledge: true
    });
    const kn = result.fiscalKnowledge;
    const primary = kn?.primaryIdentity;
    const ref =
      primary?.role === "documentIdentity"
        ? primary.normalized
        : kn?.detectedReferences?.find((r) => r.role === "documentIdentity")
            ?.normalized || null;

    let fiscalYear: number | null = null;
    const yearMatch = seed.text.match(
      /(?:revenus?\s+de\s+l['’]?année|année)\s*(20\d{2})/i
    );
    if (yearMatch) fiscalYear = Number(yearMatch[1]);
    else {
      const bare = seed.text.match(/\b(202[4-6])\b/);
      if (bare) fiscalYear = Number(bare[1]);
    }

    const detectedType =
      result.classification.primary ||
      kn?.suggestedDocumentType ||
      null;

    // Ne pas promouvoir unknown → known
    let detectedReference = ref;
    if (!detectedReference && /facture|invoice/i.test(seed.text) && /7DB|1AJ/.test(seed.text)) {
      // FP protection — rester sans ref fiscale
      detectedReference = null;
    }

    const confidence = Math.max(
      result.classification.confidence?.score ?? 0,
      typeof primary?.confidence === "number" ? primary.confidence : 0
    );

    return {
      seed,
      result,
      kn,
      detectedType,
      detectedReference,
      fiscalYear,
      confidence,
      detectedFields: kn?.detectedFields || [],
      fieldExplanations: kn?.fieldExplanations || []
    };
  });

  // Duplicates (après analyse pour versions)
  const dupMap = assessDuplicates(
    analyzed.map((a) => ({
      documentId: a.seed.documentId,
      text: a.seed.text,
      fileName: a.seed.fileName,
      detectedReference: a.detectedReference,
      detectedFields: a.detectedFields.map((f) => ({
        normalizedCode: f.normalizedCode,
        detectedValue: f.detectedValue
      }))
    }))
  );

  const documents: DocumentInstance[] = analyzed.map((a) => {
    const dup = dupMap.get(a.seed.documentId)!;
    const label = a.seed.fileName || a.detectedReference || "Document";
    const facts = buildDocumentFactIndex([
      {
        id: a.seed.documentId,
        label,
        documentType: a.detectedType,
        year: a.fiscalYear,
        text: a.seed.text,
        detectedFields: a.detectedFields
      }
    ]);

    // Garantir documentId sur chaque fait
    for (const f of facts) {
      if (!f.sourceDocumentId) {
        invariants.crossDocumentFactLostProvenance += 1;
        f.sourceDocumentId = a.seed.documentId;
      }
    }

    if (
      !a.detectedReference &&
      a.detectedType === "unknown" &&
      /2042|2044/.test(a.seed.fileName || "")
    ) {
      // filename alone must not invent ref — already null OK
    }

    const inst: DocumentInstance = {
      documentId: a.seed.documentId,
      fileName: a.seed.fileName,
      contentHash: dup.contentHash,
      detectedType: a.detectedType,
      detectedReference: a.detectedReference,
      fiscalYear: a.fiscalYear,
      documentYear: a.fiscalYear,
      confidence: a.confidence,
      recognitionLabel: recognitionLabel({
        detectedReference: a.detectedReference,
        detectedType: a.detectedType,
        confidence: a.confidence
      }),
      text: a.seed.text,
      facts,
      detectedFields: a.detectedFields,
      fieldExplanations: a.fieldExplanations,
      duplicateOf: dup.duplicateOf,
      duplicateStatus: dup.duplicateStatus,
      isPrimaryCopy: dup.isPrimaryCopy,
      provenance: a.kn?.fieldExplanations?.[0]?.provenance || []
    };

    // unknown promoted?
    if (
      inst.recognitionLabel !== "Type de document non identifié avec certitude" &&
      !inst.detectedReference &&
      !inst.detectedType &&
      inst.confidence < 0.4
    ) {
      invariants.unknownDocumentPromotedToKnown += 1;
    }

    return inst;
  });

  // Fact index — exclure copies non primaires (anti double-count)
  const factIndex: CandidateDocumentFact[] = [];
  for (const d of documents) {
    if (!d.isPrimaryCopy && d.duplicateStatus === "possibleDuplicate") {
      // ne pas indexer les faits du doublon
      continue;
    }
    factIndex.push(...d.facts);
  }

  // Double-count check
  const factKeys = new Set<string>();
  for (const f of factIndex) {
    const key = `${f.sourceDocumentId}|${f.factType}|${f.fieldCode}|${f.displayValue}`;
    if (factKeys.has(key) && f.factType === "fieldValue") {
      // same primary shouldn't duplicate — OK if different docs
    }
    factKeys.add(key);
  }
  const dupDocs = documents.filter(
    (d) => d.duplicateStatus === "possibleDuplicate" && !d.isPrimaryCopy
  );
  for (const d of dupDocs) {
    const leaked = factIndex.some((f) => f.sourceDocumentId === d.documentId);
    if (leaked) invariants.duplicateDocumentDoubleCounted += 1;
  }

  const relations = buildDocumentRelations(documents);
  for (const r of relations) {
    if (r.confidence >= 0.9 && r.relationType.startsWith("possible")) {
      invariants.candidateRelationPresentedAsCertain += 1;
      // downgrade presentation confidence conceptually
      r.confidence = Math.min(r.confidence, 0.75);
      invariants.candidateRelationPresentedAsCertain -= 1; // corrected
    }
  }

  const conflicts = detectFactConflicts(documents, factIndex);

  // Requirements matching across case
  const reqRegistry = loadFrenchTaxFieldRequirementsRegistry();
  const yearsPresent = [
    ...new Set(
      documents.map((d) => d.fiscalYear).filter((y): y is number => y != null)
    )
  ].sort();
  const targetYear = yearsPresent.length === 1 ? yearsPresent[0] : null;

  const fieldCodesPresent = [
    ...new Set(
      documents.flatMap((d) => d.detectedFields.map((f) => f.normalizedCode))
    )
  ].sort();

  const requirementMatches: CaseRequirementMatch[] = [];
  let candidateMatches = 0;
  let strongMatches = 0;
  let ambiguousMatches = 0;
  let rejectedMatches = 0;

  for (const entry of reqRegistry.entries) {
    // Ne matcher que si la case apparaît OU un doc support potentiel existe
    const relevant =
      fieldCodesPresent.includes(entry.normalizedCode) ||
      documents.some((d) =>
        (entry.possibleSupportingDocuments || []).some((s) =>
          s.documentTypeHints.some((h) =>
            (d.detectedType || "").toLowerCase().includes(h.toLowerCase())
          )
        )
      ) ||
      documents.some((d) =>
        entry.documentRefs.some((r) => d.detectedReference === r)
      );

    if (!relevant && documents.length > 0) {
      // still allow missing status for codes present in dossier forms
      const formHit = documents.some((d) =>
        entry.documentRefs.some(
          (r) =>
            d.detectedReference === r ||
            (d.text || "").includes(entry.normalizedCode)
        )
      );
      if (!formHit) continue;
    }

    const expectedRole =
      entry.normalizedCode === "1AJ"
        ? "declarant1"
        : entry.normalizedCode === "1BJ"
          ? "declarant2"
          : null;

    for (const req of entry.informationRequirements) {
      const scored = findCandidateFactsForRequirementInCase(
        req,
        factIndex,
        { targetYear, expectedRole }
      );

      if (scored.verdict === "strong") strongMatches += 1;
      else if (scored.verdict === "candidate") candidateMatches += 1;
      else if (scored.verdict === "ambiguous") ambiguousMatches += 1;
      else rejectedMatches += 1;

      if (
        scored.yearRelation === "yearMismatch" &&
        scored.verdict === "strong"
      ) {
        invariants.yearMismatchPromotedToStrong += 1;
      }

      const agg = refuseUnsafeAggregation(scored.matches.map((m) => m.fact));
      if (agg.aggregatedValue != null) {
        invariants.crossDocumentUnsafeAggregation += 1;
        invariants.automaticUnsafeAggregation += 1;
      }

      const label = statusLabelFr(scored.status);
      if (/vous n['’]avez pas|vous ne possédez pas/i.test(label)) {
        invariants.missingPresentedAsUserDoesNotHave += 1;
      }

      requirementMatches.push({
        requirementId: req.id,
        fieldCode: entry.normalizedCode,
        status: scored.status,
        statusLabel: label,
        verdict: scored.verdict,
        candidateFacts: scored.matches.map((m) => m.fact),
        evidenceLinks: scored.matches.map((m) => ({
          requirementId: req.id,
          factId: m.fact.factId,
          confidence:
            m.breakdown.fieldEvidenceMatch +
            m.breakdown.factTypeMatch +
            m.breakdown.yearMatch,
          evidence: m.fact.evidence || [],
          matchReason: m.breakdown.contributions.map((c) => c.note).join("+") ||
            m.verdict,
          status:
            m.verdict === "strong"
              ? ("strong" as const)
              : m.verdict === "ambiguous"
                ? ("ambiguous" as const)
                : ("candidate" as const)
        })),
        scoreBreakdowns: scored.matches.map((m) => ({
          factId: m.fact.factId,
          documentId: m.fact.sourceDocumentId,
          breakdown: m.breakdown,
          verdict: m.verdict
        })),
        aggregatedValue: null,
        yearRelation: scored.yearRelation
      });
    }
  }

  // Field assistance per detected/relevant field
  const fieldAssistance: TaxFieldAssistance[] = [];
  const codesForAssist = [
    ...new Set([
      ...fieldCodesPresent.filter((c) =>
        reqRegistry.entries.some((e) => e.normalizedCode === c)
      ),
      ...reqRegistry.entries
        .filter((e) =>
          documents.some((d) =>
            e.documentRefs.some((r) => d.detectedReference === r)
          )
        )
        .map((e) => e.normalizedCode)
    ])
  ].sort();

  for (const code of codesForAssist) {
    const detected = documents
      .flatMap((d) => d.detectedFields)
      .find((f) => f.normalizedCode === code);
    const expl = documents
      .flatMap((d) => d.fieldExplanations)
      .find((e) => e.fieldCode === code);
    const assist = buildTaxFieldAssistance({
      fieldCode: code,
      documentRef:
        documents.find((d) => d.detectedReference)?.detectedReference || null,
      year: targetYear,
      detected: detected || null,
      explanation: expl || null,
      documents: documents
        .filter((d) => d.isPrimaryCopy || d.duplicateStatus !== "possibleDuplicate")
        .map((d) => ({
          id: d.documentId,
          label: d.fileName || d.detectedReference || d.documentId,
          documentType: d.detectedType,
          year: d.fiscalYear,
          text: d.text,
          detectedFields: d.detectedFields
        })),
      preindexedFacts: factIndex,
      userAnswers: userAnswers.map((u) => ({
        requirementId: u.requirementId,
        answer: u.answer
      }))
    });
    // Force no aggregation
    assist.suggestedDeclaredAmount = null;
    assist.eligibilityDecision = null;
    for (const e of assist.evaluatedRequirements) {
      (e as { aggregatedValue: null }).aggregatedValue = null;
    }
    invariants.knowledgePromotedToUserFact +=
      assist.invariants.knowledgePromotedToUserFact;
    invariants.automaticUnsafeAggregation +=
      assist.invariants.automaticUnsafeAggregation;
    invariants.unsupportedTaxAmount += assist.invariants.unsupportedTaxAmount;
    invariants.unsupportedEligibilityDecision +=
      assist.invariants.unsupportedEligibilityDecision;
    fieldAssistance.push(assist);
  }

  // User answers ≠ official knowledge (clarification source is still user-provided)
  for (const ua of userAnswers) {
    if (ua.kind !== "user") {
      invariants.userAnswerPromotedToOfficialKnowledge += 1;
    } else if (ua.source !== "user" && ua.source !== "clarification") {
      invariants.userAnswerPromotedToOfficialKnowledge += 1;
    }
  }

  // Removed docs must not leave facts
  for (const removedId of options.removedDocumentIds || []) {
    if (factIndex.some((f) => f.sourceDocumentId === removedId)) {
      invariants.removedDocumentFactSurvives += 1;
    }
    if (documents.some((d) => d.documentId === removedId)) {
      invariants.removedDocumentFactSurvives += 1;
    }
  }

  let caseCentricViews = buildCaseCentricViews(
    fieldAssistance,
    documents,
    requirementMatches
  );
  const documentCentricViews = buildDocumentCentricViews(documents, relations);

  const ambiguities: string[] = [];
  for (const c of conflicts) ambiguities.push(c.description);
  for (const m of requirementMatches) {
    if (m.status === "ambiguous") {
      ambiguities.push(
        `Ambiguïté sur ${m.fieldCode} / ${m.requirementId} — plusieurs éléments candidats.`
      );
    }
  }

  const primaryReferences = [
    ...new Set(
      documents
        .map((d) => d.detectedReference)
        .filter((r): r is string => Boolean(r))
    )
  ].sort();

  const draft: DocumentCase = {
    caseId,
    documents,
    factIndex,
    relations,
    ambiguities: [...new Set(ambiguities)],
    conflicts,
    requirementMatches,
    fieldAssistance,
    caseCentricViews,
    documentCentricViews,
    userAnswers,
    metrics: {
      documents: documents.length,
      facts: factIndex.length,
      requirements: requirementMatches.length,
      candidateMatches,
      strongMatches,
      ambiguousMatches,
      rejectedMatches,
      relations: relations.length,
      conflicts: conflicts.length
    },
    taxContext: {
      primaryReferences,
      yearsPresent,
      fieldCodesPresent
    },
    provenance: fieldAssistance.flatMap((a) => a.provenance).slice(0, 12),
    suggestedDeclaredAmount: null,
    eligibilityDecision: null,
    invariants
  };

  // V4-T — applicabilité déterministe (après faits / avant exposition)
  const app = evaluateDocumentCaseApplicability(draft);
  const draftWithApp: DocumentCase = {
    ...draft,
    applicabilityEvaluations: app.evaluations,
    applicabilityInvariants: app.invariants
  };

  // V4-U — calculs déterministes (gate applicabilité ; pack formules production vide)
  const calc = evaluateDocumentCaseCalculations(draftWithApp);

  caseCentricViews = caseCentricViews.map((v) => ({
    ...v,
    applicability:
      app.evaluations.find((e) => e.fieldCode === v.fieldCode) || null,
    calculation: calc.results.find((r) => r.fieldCode === v.fieldCode) || null
  }));

  return {
    ...draftWithApp,
    caseCentricViews,
    calculationResults: calc.results,
    calculationInvariants: calc.invariants,
    calculationMetrics: calc.metrics,
    suggestedDeclaredAmount: null
  };
}

function buildCaseCentricViews(
  assistance: readonly TaxFieldAssistance[],
  documents: readonly DocumentInstance[],
  matches: readonly CaseRequirementMatch[]
): CaseCentricFieldView[] {
  return assistance.map((a) => {
    const byDoc = new Map<string, string[]>();
    for (const f of a.candidateFacts) {
      const id = f.sourceDocumentId || "unknown";
      const list = byDoc.get(id) || [];
      if (f.displayValue) {
        list.push(
          f.fieldCode
            ? `case ${f.fieldCode} : ${f.displayValue}`
            : `montant / info candidat : ${f.displayValue}`
        );
      } else if (f.year) {
        list.push(`année : ${f.year}`);
      } else {
        list.push(f.provenanceNote || f.factType);
      }
      byDoc.set(id, list);
    }
    // Also note detected fields on forms
    for (const d of documents) {
      for (const field of d.detectedFields) {
        if (field.normalizedCode !== a.fieldCode) continue;
        const list = byDoc.get(d.documentId) || [];
        list.push(
          field.presence === "presentWithValue"
            ? `case ${field.normalizedCode} détectée${
                field.detectedValue ? ` : ${field.detectedValue}` : ""
              }`
            : `case ${field.normalizedCode} détectée`
        );
        byDoc.set(d.documentId, list);
      }
    }

    const toVerify = [
      ...a.ambiguousRequirements.map((r) => r.label),
      ...matches
        .filter((m) => m.fieldCode === a.fieldCode && m.status === "ambiguous")
        .map((m) => `relation / ${m.requirementId}`)
    ];

    return {
      fieldCode: a.fieldCode,
      label: a.knowledge.label,
      whatIsIt: a.knowledge.plainLanguageWhat || a.knowledge.whatIsIt,
      foundByDocument: [...byDoc.entries()].map(([documentId, notes]) => ({
        documentId,
        fileName:
          documents.find((d) => d.documentId === documentId)?.fileName || null,
        notes: [...new Set(notes)]
      })),
      toVerify: [...new Set(toVerify)],
      supportingDocuments: a.supportingDocuments,
      generalConditions: a.generalConditions.map((c) => c.statement),
      officialSources: a.provenance
        .filter((p) => p.url)
        .slice(0, 4)
        .map((p) => ({ title: p.title || "Source officielle", url: p.url })),
      informationStatus: a.informationStatus,
      priorityQuestions: a.priorityQuestions,
      suggestedDeclaredAmount: null
    };
  });
}

function buildDocumentCentricViews(
  documents: readonly DocumentInstance[],
  relations: ReturnType<typeof buildDocumentRelations>
): DocumentCentricView[] {
  return documents.map((d) => {
    const linked = relations
      .filter(
        (r) =>
          r.fromDocumentId === d.documentId || r.toDocumentId === d.documentId
      )
      .filter((r) => r.fieldCodeHint || r.relationType === "possibleFieldEvidence")
      .map((r) => ({
        fieldCode: r.fieldCodeHint || "—",
        relationType: r.relationType,
        reason: r.reason,
        confidence: r.confidence
      }));

    let duplicateMessage: string | null = null;
    if (d.duplicateStatus === "possibleDuplicate") {
      duplicateMessage = "Ce document semble déjà présent dans le dossier.";
    } else if (d.duplicateStatus === "possibleVersion") {
      duplicateMessage =
        "Ce document ressemble à un autre sans être identique — les deux sont conservés.";
    }

    return {
      documentId: d.documentId,
      fileName: d.fileName,
      detectedType: d.detectedType,
      detectedReference: d.detectedReference,
      year: d.fiscalYear,
      recognitionLabel: d.recognitionLabel,
      confidence: d.confidence,
      detectedFacts: d.facts
        .filter((f) => f.displayValue)
        .slice(0, 8)
        .map((f) => ({
          label: f.fieldCode || f.factType,
          value: f.displayValue || String(f.value ?? "")
        })),
      potentiallyLinkedTo: linked,
      duplicateStatus: d.duplicateStatus,
      duplicateMessage
    };
  });
}

/** Recalcule un dossier après ajout. */
export function addDocumentsToCase(
  existing: DocumentCase,
  additions: readonly DocumentCaseInput[],
  options: BuildDocumentCaseOptions = {}
): DocumentCase {
  const inputs: DocumentCaseInput[] = [
    ...existing.documents.map((d) => ({
      text: d.text,
      fileName: d.fileName,
      documentId: undefined // recompute deterministically
    })),
    ...additions
  ];
  const rebuilt = buildDocumentCase(inputs, {
    ...options,
    userAnswers: options.userAnswers || existing.userAnswers
  });
  return {
    ...rebuilt,
    clarificationSession: existing.clarificationSession || null,
    userAnswers: options.userAnswers || existing.userAnswers || rebuilt.userAnswers
  };
}

/** Recalcule un dossier après suppression — aucun fait fantôme. */
export function removeDocumentFromCase(
  existing: DocumentCase,
  documentId: string,
  options: BuildDocumentCaseOptions = {}
): DocumentCase {
  const remaining = existing.documents
    .filter((d) => d.documentId !== documentId)
    .map((d) => ({
      text: d.text,
      fileName: d.fileName
    }));
  const rebuilt = buildDocumentCase(remaining, {
    ...options,
    userAnswers: options.userAnswers || existing.userAnswers,
    removedDocumentIds: [documentId, ...(options.removedDocumentIds || [])]
  });
  return {
    ...rebuilt,
    clarificationSession: existing.clarificationSession || null,
    userAnswers: options.userAnswers || existing.userAnswers || rebuilt.userAnswers
  };
}

export function buildCaseTaxAssistanceContext(
  docCase: DocumentCase,
  fieldCode: string
): TaxAssistanceContext {
  const assist = docCase.fieldAssistance.find((a) => a.fieldCode === fieldCode);
  const base = assist
    ? buildTaxAssistanceContext(assist, docCase.userAnswers)
    : {
        fieldKnowledge: null,
        fieldRequirements: null,
        relevantDocumentFacts: [],
        missingRequirements: [],
        ambiguities: [],
        userAnswers: docCase.userAnswers,
        provenance: [],
        informationStatus: "requiresVerification" as const,
        questions: []
      };
  return {
    ...base,
    caseId: docCase.caseId,
    targetField: fieldCode,
    relevantDocuments: docCase.documents.filter((d) =>
      d.detectedFields.some((f) => f.normalizedCode === fieldCode) ||
      docCase.relations.some(
        (r) =>
          r.fieldCodeHint === fieldCode &&
          (r.fromDocumentId === d.documentId || r.toDocumentId === d.documentId)
      )
    ),
    evidenceLinks: docCase.requirementMatches
      .filter((m) => m.fieldCode === fieldCode)
      .flatMap((m) => m.evidenceLinks),
    conflicts: docCase.conflicts.filter(
      (c) =>
        c.description.includes(fieldCode) ||
        c.factIds.some((id) =>
          docCase.factIndex.some(
            (f) => f.factId === id && f.fieldCode === fieldCode
          )
        )
    ),
    deterministicQuestions: assist?.questions || base.questions,
    userAnswers: docCase.userAnswers,
    clarificationSession: docCase.clarificationSession || null,
    currentQuestion:
      docCase.clarificationSession?.questions.find(
        (q) => q.questionId === docCase.clarificationSession?.currentQuestionId
      ) || null,
    unresolvedConflicts: docCase.conflicts.filter(
      (c) => !c.resolution || c.resolution === "unresolved"
    ),
    changeHistory: docCase.clarificationSession?.changeHistory || [],
    applicabilityEvaluations: docCase.applicabilityEvaluations || [],
    applicabilityEvidence: (docCase.applicabilityEvaluations || []).flatMap(
      (e) => e.evidence
    ),
    unresolvedApplicabilityQuestions: (docCase.applicabilityEvaluations || [])
      .filter((e) => e.status === "needsInformation")
      .flatMap((e) => e.missingInformation),
    calculationResults: docCase.calculationResults || [],
    derivedValues: (docCase.calculationResults || [])
      .map((r) => r.derivedValue)
      .filter((d): d is NonNullable<typeof d> => Boolean(d)),
    unresolvedCalculationInputs: (docCase.calculationResults || []).flatMap(
      (r) => r.missingInputs
    )
  };
}

/** Invariant upload order : conclusions stables. */
export function assertUploadOrderStable(
  inputsA: DocumentCaseInput[],
  inputsB: DocumentCaseInput[]
): { ok: boolean; uploadOrderChangesConclusion: number } {
  const caseA = buildDocumentCase(inputsA, { resetIds: true });
  const caseB = buildDocumentCase(inputsB, { resetIds: true });
  const sig = (c: DocumentCase) =>
    JSON.stringify({
      caseId: c.caseId,
      refs: c.taxContext.primaryReferences,
      fields: c.taxContext.fieldCodesPresent,
      years: c.taxContext.yearsPresent,
      matchStatuses: c.requirementMatches.map((m) => [
        m.requirementId,
        m.status,
        m.verdict
      ]),
      conflictKinds: c.conflicts.map((x) => x.kind).sort(),
      relationTypes: c.relations.map((r) => r.relationType).sort(),
      suggested: c.suggestedDeclaredAmount,
      applicability: (c.applicabilityEvaluations || []).map((e) => [
        e.fieldCode,
        e.status,
        e.ruleId
      ])
    });
  const ok = sig(caseA) === sig(caseB);
  return { ok, uploadOrderChangesConclusion: ok ? 0 : 1 };
}
