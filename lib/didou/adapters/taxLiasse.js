/**
 * E — Adaptateur liasse fiscale / déclaration de résultats.
 * Ne pas dump tous les montants/dates de tableaux.
 */

export function adaptTaxLiasse(ctx) {
  const { text, extraction, detection } = ctx;
  const formRef =
    extraction.entities.references.find((r) => /2031|cerfa|2042|2035/i.test(r.value)) ||
    null;

const period =
  pickFiscalPeriod(
    extraction,
    text
  );

  const issuer =
    extraction.entities.organizations.find((o) =>
      /dgfip|finances|imp[oô]t/i.test(o)
    ) ||
    (/dgfip|finances publiques|impots\.gouv/i.test(text)
      ? "Direction générale des Finances publiques"
      : null);

  // Montants de tableau : non importants par défaut
  const reliableAmount = extraction.amounts.find(
    (a) => a.important && !["table_value", "example", "unknown"].includes(a.role)
  );

  const documentType =
    detection.documentType ||
    (formRef ? `Liasse fiscale — formulaire ${formRef.value}` : "Liasse fiscale");

  const importantFacts = [
    {
      kind: "type",
      label: "Type de document",
      value: documentType,
      confidence: detection.confidence
    },
    formRef && {
      kind: "reference",
      label: "Formulaire",
      value: formRef.value,
      confidence: 85
    },
    period && {
      kind: "period",
      label: "Exercice / période",
      value: period.raw,
      confidence: period.confidence || 70
    },
    /bénéfices?\s+(industriels|professionnels|commerciaux)|bic\b/i.test(text) && {
      kind: "rubric",
      label: "Rubrique",
      value: "Déclaration de résultats — bénéfices industriels et commerciaux",
      confidence: 70
    }
  ].filter(Boolean);

  // Ne jamais promouvoir "Bénéfices professionnels" comme type
  const cleanType = /bénéfices professionnels/i.test(documentType)
    ? formRef
      ? `Liasse fiscale — formulaire ${formRef.value}`
      : "Liasse fiscale / déclaration de résultats"
    : documentType;

  return {
    family: "fiscal",
    documentType: cleanType,
    understandingLevel: formRef || /liasse/i.test(text) ? "strong" : "family",
    confidence: Math.max(detection.confidence || 0, formRef ? 90 : 65),
    issuer,
    recipient: null,
    mainDate: period
      ? {
          date: period.raw,
          label: "Exercice",
          meaning: "Période fiscale concernée",
          role: "coveredPeriod"
        }
      : null,
    mainAmount: reliableAmount
      ? {
          value: reliableAmount.value,
          label: reliableAmount.role,
          meaning: "Montant suffisamment contextualisé",
          role: reliableAmount.role
        }
      : null,
    importantFacts: importantFacts.slice(0, 5),
    actions: [],
    deadlines: [],
    whyReceived:
      "Ce document relève de vos obligations déclaratives fiscales (liasse / déclaration de résultats).",
    documentPurpose:
      "Déclarer ou présenter les résultats professionnels pour une période fiscale.",
    attentionLevel: "none",
    // Pas de tables massives ni dump montants
    tables: [],
    evidence: [
      formRef && {
        page: "Page 1",
        quote: formRef.context || formRef.value,
        explanation: "Identifiant du formulaire fiscal"
      },
      /liasse fiscale/i.test(text) && {
        page: "Page 1",
        quote: "liasse fiscale",
        explanation: "Mention structurante du type de document"
      }
    ].filter(Boolean),
    warnings: [
      "Les montants présents dans les tableaux fiscaux ne sont listés que s’ils ont un rôle clairement établi."
    ],
    uncertainties: reliableAmount
      ? []
      : [
          "Aucun montant principal suffisamment fiable n’a été retenu (valeurs de tableau ignorées)."
        ]
  };
}
function pickFiscalPeriod(
  extraction,
  text
) {
  const periods =
    Array.isArray(
      extraction?.periods
    )
      ? extraction.periods
      : [];

  const dates =
    Array.isArray(
      extraction?.dates
    )
      ? extraction.dates
      : [];

  const candidates = [];

  for (const period of periods) {
    const context =
      String(
        period?.context || ""
      ).toLowerCase();

    let score = 0;

    if (
      period.kind === "range"
    ) {
      score += 120;
    }

    if (
      /exercice|exercice fiscal|exercice comptable|clos le|periode fiscale/.test(
        context
      )
    ) {
      score += 180;
    }

    if (
      /liasse fiscale|declaration de resultats|2031|2035|2065/.test(
        context
      )
    ) {
      score += 80;
    }

    if (
      /cerfa|loi|decret|notice|article|historique/.test(
        context
      )
    ) {
      score -= 250;
    }

    candidates.push({
      item: period,
      score
    });
  }

  for (const date of dates) {
    const context =
      String(
        date?.context || ""
      ).toLowerCase();

    let score = 0;

    if (
      date.role ===
      "coveredPeriod"
    ) {
      score += 150;
    }

    if (
      /exercice|clos le|periode fiscale/.test(
        context
      )
    ) {
      score += 180;
    }

    if (
      /cerfa|loi|decret|notice|historique|article/.test(
        context
      )
    ) {
      score -= 250;
    }

    candidates.push({
      item: date,
      score
    });
  }

  candidates.sort(
    (a, b) =>
      b.score - a.score
  );

  if (
    !candidates.length ||
    candidates[0].score < 80
  ) {
    return null;
  }

  return candidates[0].item;
}
