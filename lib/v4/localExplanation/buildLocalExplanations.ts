/**
 * Orchestrateur d’explications locales — V4-X.
 * READ-ONLY : ne modifie ni faits, ni règles, ni calculs.
 */

import type {
  DocumentCase,
  LocalExplanation,
  LocalExplanationInvariants
} from "../types/knowledge.js";
import { collectSourceFactsForSubject } from "./explainDocumentFacts.js";
import { explainApplicabilityLocal } from "./explainApplicabilityLocal.js";
import { explainDerivedValueLocal } from "./explainDerivedValueLocal.js";

export function emptyLocalExplanationInvariants(): LocalExplanationInvariants {
  return {
    unsupportedExplanationPromoted: 0,
    unknownExplanationPromoted: 0,
    unsourcedExplanation: 0,
    explanationChangedFacts: 0,
    explanationPromotedToDeclaration: 0,
    explanationPromotedToEligibility: 0,
    implicitExplanationAggregation: 0
  };
}

let seq = 0;
export function resetLocalExplanationIdsForTests(): void {
  seq = 0;
}

/**
 * Construit les explications locales à partir d’un DocumentCase déjà évalué
 * (faits + applicabilité + calculs). Aucune réévaluation de règles.
 */
export function buildLocalExplanations(docCase: DocumentCase): {
  explanations: LocalExplanation[];
  invariants: LocalExplanationInvariants;
} {
  const invariants = emptyLocalExplanationInvariants();
  const explanations: LocalExplanation[] = [];

  // Snapshot des faits avant composition — détecte toute mutation accidentelle
  const factsFingerprint = JSON.stringify(
    (docCase.factIndex || []).map((f) => [f.factId, f.value, f.fieldCode])
  );
  const suggestedBefore = docCase.suggestedDeclaredAmount;
  const eligibilityBefore = docCase.eligibilityDecision;

  const subjects = [
    ...new Set([
      ...(docCase.taxContext?.fieldCodesPresent || []),
      ...(docCase.caseCentricViews || []).map((v) => v.fieldCode),
      ...(docCase.calculationResults || []).map((r) => r.fieldCode),
      ...(docCase.applicabilityEvaluations || []).map((e) => e.fieldCode)
    ])
  ]
    .map((c) => c.toUpperCase())
    .sort();

  for (const subject of subjects) {
    const view =
      (docCase.caseCentricViews || []).find(
        (v) => v.fieldCode.toUpperCase() === subject
      ) || null;
    const app =
      (docCase.applicabilityEvaluations || []).find(
        (e) => e.fieldCode.toUpperCase() === subject
      ) ||
      view?.applicability ||
      null;
    const calc =
      (docCase.calculationResults || []).find(
        (r) => r.fieldCode.toUpperCase() === subject
      ) ||
      view?.calculation ||
      null;

    const factsPart = collectSourceFactsForSubject({
      subject,
      facts: docCase.factIndex || [],
      userFacts: docCase.userAnswers || [],
      view
    });
    const appPart = explainApplicabilityLocal(app);
    const calcPart = explainDerivedValueLocal(calc);

    const title =
      view?.label ||
      (subject === "4BE"
        ? "Revenus fonciers (micro-foncier)"
        : `Case ${subject}`);

    const status = mergeStatus(appPart.status, calcPart.status, factsPart);
    const details: string[] = [];
    if (factsPart.foundSummary) details.push(factsPart.foundSummary);
    details.push(...factsPart.details);
    if (view?.whatIsIt) {
      details.push(view.whatIsIt);
    }
    details.push(...appPart.details);
    details.push(...calcPart.details);

    const missingInformation = [
      ...appPart.missingInformation,
      ...calcPart.missingInformation
    ];

    const summary = buildSummary({
      status,
      subject,
      title,
      foundSummary: factsPart.foundSummary,
      appSummary: appPart.summary,
      calcSummary: calcPart.summary,
      whatIsIt: view?.whatIsIt || null
    });

    const sourceRefs = uniqueSources([
      ...appPart.sourceRefs,
      ...calcPart.sourceRefs,
      ...(view?.officialSources || [])
    ]);

    const ruleRefs = [...appPart.ruleRefs, ...calcPart.ruleRefs];
    const sourceFacts = [...factsPart.sourceFacts, ...calcPart.derivedFacts];

    const why = [
      ...factsPart.details.slice(0, 1),
      ...appPart.why,
      ...calcPart.why
    ];

    let sourceExplanation: string | null = null;
    if (sourceRefs.length) {
      sourceExplanation = `Sources utilisées : ${sourceRefs
        .map((s) => s.title)
        .join(" ; ")}.`;
    } else if (status === "explained" && calcPart.status === "explained") {
      // Calcul explained doit avoir des sources — sinon compteur
      invariants.unsourcedExplanation += 1;
      sourceExplanation =
        "Aucune source officielle n’est attachée à cette explication.";
    } else if (!sourceRefs.length && status === "explained" && !factsPart.sourceFacts.length) {
      invariants.unsourcedExplanation += 1;
    } else {
      sourceExplanation = sourceRefs.length
        ? null
        : "Les éléments présentés s’appuient sur les faits du dossier et les règles modélisées disponibles.";
    }

    const limits = [
      "Cette explication ne modifie aucune information du dossier.",
      "Une valeur calculée n’est pas automatiquement un montant à déclarer.",
      "Cette explication ne constitue pas une décision d’éligibilité."
    ];

    // Safety language scan
    const blob = [summary, ...details, calcPart.calculationExplanation || ""].join(
      " "
    );
    if (
      /vous devez déclarer|montant à reporter|vous êtes éligible|vous avez droit/i.test(
        blob
      )
    ) {
      invariants.explanationPromotedToDeclaration += 1;
      invariants.explanationPromotedToEligibility += 1;
    }

    // Never promote uncertain statuses into "explained" certainty
    if (
      status === "explained" &&
      (app?.status === "unknown" || app?.status === "needsInformation")
    ) {
      // Only allowed if we only explain a raw document fact without claiming rule applicability
      if (!factsPart.foundSummary) {
        invariants.unknownExplanationPromoted += 1;
      }
    }
    if (
      status === "explained" &&
      calc?.status === "unsupported" &&
      calcPart.status === "explained"
    ) {
      invariants.unsupportedExplanationPromoted += 1;
    }

    seq += 1;
    explanations.push({
      id: `lex-${subject}-${seq}`,
      domain: "fiscal",
      subject,
      title,
      summary,
      details: [...new Set(details)].filter(Boolean),
      importance: calcPart.status === "explained" ? "primary" : "secondary",
      status,
      sourceFacts,
      ruleRefs,
      sourceRefs,
      taxYear:
        calc?.rule?.taxYear ??
        (docCase.taxContext.yearsPresent.length === 1
          ? docCase.taxContext.yearsPresent[0]
          : null),
      calculation: calcPart.calculation,
      calculationExplanation: calcPart.calculationExplanation,
      sourceExplanation,
      missingInformation: [...new Set(missingInformation)],
      why: [...new Set(why)].filter(Boolean),
      limits
    });
  }

  // Post-conditions read-only
  const factsFingerprintAfter = JSON.stringify(
    (docCase.factIndex || []).map((f) => [f.factId, f.value, f.fieldCode])
  );
  if (factsFingerprint !== factsFingerprintAfter) {
    invariants.explanationChangedFacts += 1;
  }
  if (docCase.suggestedDeclaredAmount !== suggestedBefore) {
    invariants.explanationPromotedToDeclaration += 1;
  }
  if (docCase.eligibilityDecision !== eligibilityBefore) {
    invariants.explanationPromotedToEligibility += 1;
  }
  if (docCase.suggestedDeclaredAmount != null) {
    invariants.explanationPromotedToDeclaration += 1;
  }
  if (docCase.eligibilityDecision != null) {
    invariants.explanationPromotedToEligibility += 1;
  }

  // Stable order
  explanations.sort((a, b) => a.subject.localeCompare(b.subject));

  return { explanations, invariants };
}

function mergeStatus(
  appStatus: LocalExplanation["status"],
  calcStatus: LocalExplanation["status"] | null,
  facts: { foundSummary: string | null; sourceFacts: unknown[] }
): LocalExplanation["status"] {
  // Priority: conflicted > needsInformation > notApplicable > unsupported > unknown > explained
  const ranks: Record<LocalExplanation["status"], number> = {
    conflicted: 5,
    needsInformation: 4,
    notApplicable: 3,
    unsupported: 2,
    unknown: 1,
    explained: 0
  };
  let status: LocalExplanation["status"] = appStatus;
  if (calcStatus && ranks[calcStatus] > ranks[status]) {
    // Exception: raw document fact can still be "explained" at fact level when calc unsupported
    if (
      calcStatus === "unsupported" &&
      facts.foundSummary &&
      appStatus === "explained"
    ) {
      status = "explained";
    } else if (
      calcStatus === "unsupported" &&
      facts.foundSummary &&
      (appStatus === "unknown" || !facts.sourceFacts.length)
    ) {
      status = "explained"; // explain the fact only
    } else {
      status = calcStatus;
    }
  }
  // Fact-only subject (no app, no calc): explained if fact present else unknown
  if (
    appStatus === "unknown" &&
    (calcStatus == null || calcStatus === "unsupported") &&
    facts.foundSummary
  ) {
    return "explained";
  }
  if (
    appStatus === "unknown" &&
    (calcStatus == null || calcStatus === "unsupported") &&
    !facts.foundSummary
  ) {
    return calcStatus === "unsupported" ? "unsupported" : "unknown";
  }
  return status;
}

function buildSummary(input: {
  status: LocalExplanation["status"];
  subject: string;
  title: string;
  foundSummary: string | null;
  appSummary: string;
  calcSummary: string | null;
  whatIsIt: string | null;
}): string {
  if (input.status === "conflicted") {
    return "Les informations disponibles sont contradictoires.";
  }
  if (input.status === "needsInformation") {
    return "Une information supplémentaire est nécessaire pour déterminer si cette règle s’applique ou pour calculer une valeur.";
  }
  if (input.status === "notApplicable") {
    return input.appSummary;
  }
  if (input.status === "unsupported" && !input.foundSummary) {
    return "ExpliqueMoi ne dispose pas encore d’une règle suffisamment vérifiée pour expliquer ce point.";
  }
  if (input.status === "unknown" && !input.foundSummary) {
    return "Cette information ne peut pas encore être déterminée avec les éléments disponibles.";
  }
  // Explained / fact present
  const parts: string[] = [];
  if (input.foundSummary) parts.push(input.foundSummary);
  else if (input.whatIsIt) parts.push(input.whatIsIt);
  if (input.calcSummary && input.status === "explained") {
    parts.push(input.calcSummary);
  } else if (input.appSummary && input.status === "explained") {
    parts.push(input.appSummary);
  }
  return parts.join(" ") || input.appSummary;
}

function uniqueSources(
  list: Array<{ title: string; url: string }>
): Array<{ title: string; url: string }> {
  const seen = new Set<string>();
  const out: Array<{ title: string; url: string }> = [];
  for (const s of list) {
    if (!s?.url || seen.has(s.url)) continue;
    seen.add(s.url);
    out.push(s);
  }
  return out;
}

/** Recalcule et attache les explications sur un DocumentCase (immutably). */
export function attachLocalExplanations(docCase: DocumentCase): DocumentCase {
  const { explanations, invariants } = buildLocalExplanations(docCase);
  const bySubject = new Map(explanations.map((e) => [e.subject, e]));
  const views = (docCase.caseCentricViews || []).map((v) => ({
    ...v,
    localExplanation: bySubject.get(v.fieldCode.toUpperCase()) || null
  }));
  const existing = new Set(views.map((v) => v.fieldCode.toUpperCase()));
  // Sujets expliqués absents des vues assistance → vue minimale (Preview)
  for (const e of explanations) {
    if (existing.has(e.subject)) continue;
    // Uniquement si un fait/calcul/applicabilité existe réellement
    if (
      !e.sourceFacts.length &&
      !e.calculation &&
      e.status === "unsupported"
    ) {
      continue;
    }
    views.push({
      fieldCode: e.subject,
      label: e.title,
      whatIsIt: e.summary,
      foundByDocument: [],
      toVerify: [...e.missingInformation],
      supportingDocuments: [],
      generalConditions: [],
      officialSources: [...e.sourceRefs],
      informationStatus: "missingInformation",
      priorityQuestions: [],
      applicability:
        (docCase.applicabilityEvaluations || []).find(
          (a) => a.fieldCode.toUpperCase() === e.subject
        ) || null,
      calculation:
        (docCase.calculationResults || []).find(
          (r) => r.fieldCode.toUpperCase() === e.subject
        ) || null,
      localExplanation: e,
      suggestedDeclaredAmount: null
    });
  }
  views.sort((a, b) => a.fieldCode.localeCompare(b.fieldCode));
  return {
    ...docCase,
    localExplanations: explanations,
    localExplanationInvariants: invariants,
    caseCentricViews: views,
    suggestedDeclaredAmount: null,
    eligibilityDecision: null
  };
}
