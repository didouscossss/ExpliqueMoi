/**
 * F — Générateur d'explication à partir des faits structurés.
 * Ne transforme jamais une hypothèse faible en affirmation.
 */

/**
 * @param {object} partial — sortie adaptateur + détection
 */
export function buildUserFacingExplanation(partial) {
  const type = partial.documentType;
  const family = partial.family;
  const level = partial.understandingLevel;

  let documentLabel;
  if (type && (level === "strong" || level === "probable")) {
    documentLabel =
      level === "probable" && !/^ce document semble/i.test(type)
        ? `Ce document semble être : ${type}`
        : type;
  } else if (family && family !== "autre") {
    documentLabel = `Document ${familyLabel(family)}`;
  } else {
    documentLabel = "Document";
  }

  const parts = [];
  if (type) {
    parts.push(
      level === "strong"
        ? `C’est ${indefiniteArticle(type)}${type}.`
        : `Ce document semble être ${indefiniteArticle(type)}${type}.`
    );
  } else if (family && family !== "autre") {
    parts.push(`C’est un document de type ${familyLabel(family)}.`);
  } else {
    parts.push(
      "Le document a été lu localement, mais son type précis n’est pas encore certain."
    );
  }

  if (partial.mainAmount?.value) {
    parts.push(
      `${partial.mainAmount.label || "Montant"} : ${partial.mainAmount.value}.`
    );
  }
  if (partial.mainDate?.date) {
    parts.push(
      `${partial.mainDate.label || "Date"} : ${partial.mainDate.date}.`
    );
  }
  if (partial.documentPurpose) {
    parts.push(partial.documentPurpose);
  }

  const importantPoints = (partial.importantFacts || [])
    .slice(0, 5)
    .map((fact) => {
      if (fact.label && fact.value) return `${fact.label} : ${fact.value}`;
      return fact.value || fact.label || "";
    })
    .filter(Boolean);

  return {
    document_label: documentLabel,
    one_sentence: parts.join(" ").replace(/\s+/g, " ").trim(),
    important_points: importantPoints
  };
}

function familyLabel(family) {
  const map = {
    fiscal: "fiscal",
    administratif: "administratif",
    facture: "facture / paiement",
    bancaire: "bancaire",
    assurance: "assurance",
    logement: "logement",
    copropriete: "copropriété",
    emploi: "emploi",
    social: "social",
    sante: "santé",
    juridique: "juridique",
    courrier: "courrier",
    contrat: "contrat",
    formulaire: "formulaire",
    autre: "administratif"
  };
  return map[family] || family;
}

function indefiniteArticle(type) {
  const t = String(type || "").toLowerCase();
  if (/^[aeiouéèêàâîôû]/i.test(t) || t.startsWith("h")) return "une ";
  if (/quittance|facture|convocation|liasse|déclaration|attestation|notification/.test(t)) {
    return "une ";
  }
  return "un ";
}
