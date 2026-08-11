/**
 * D — Interprétation des rôles (une valeur ≠ information importante).
 */

/**
 * Attribue un rôle probable à un montant selon son contexte.
 * @param {object} amount
 * @param {{ family?: string, documentType?: string|null }} meta
 */
export function interpretAmountRole(amount, meta = {}) {
  const ctx = String(amount?.context || "").toLowerCase();
  const family = meta.family || "";
  const type = String(meta.documentType || "").toLowerCase();

  if (/exemple|sample|pour information/.test(ctx)) {
    return { role: "example", confidence: 40, important: false };
  }
  if (/tableau|ligne|case|rubrique/.test(ctx) && family === "fiscal") {
    return { role: "table_value", confidence: 45, important: false };
  }
  if (/quittanc|loyer\s+payé|loyer\s+perçu|montant\s+perçu|reçu la somme|recu la somme|atteste.+paiement/.test(ctx) || /quittance/.test(type)) {
    if (/loyer|quittanc|payé|perçu|reglé|réglé/.test(ctx) || /quittance/.test(type)) {
      return { role: "paymentAmount", confidence: 85, important: true };
    }
  }
  if (/à payer|a payer|net à payer|montant dû|reste à|total ttc|ttc/.test(ctx)) {
    if (/ttc|total ttc/.test(ctx)) return { role: "amountDue", confidence: 80, important: true };
    return { role: "amountDue", confidence: 78, important: true };
  }
  if (/\bht\b/.test(ctx)) return { role: "ht", confidence: 70, important: false };
  if (/\btva\b/.test(ctx)) return { role: "vat", confidence: 70, important: false };
  if (/rembours/.test(ctx)) return { role: "refund", confidence: 75, important: true };
  if (/salaire|net à payer/.test(ctx)) return { role: "salary", confidence: 75, important: true };
  if (/acompte|dépôt|depot/.test(ctx)) return { role: "deposit", confidence: 65, important: false };
  if (/pénalité|penalite|majoration|amende/.test(ctx)) {
    return { role: "penalty", confidence: 70, important: true };
  }

  return { role: "unknown", confidence: 35, important: false };
}

/**
 * Attribue un rôle probable à une date.
 */
export function interpretDateRole(date, meta = {}) {
  const ctx = String(date?.context || date?.hint || "").toLowerCase();
  const family = meta.family || "";
  const type = String(meta.documentType || "").toLowerCase();

  if (/assemblée|assemblee|convocation|ordre du jour|réunion|reunion/.test(ctx) || family === "copropriete") {
    if (/assemblée|assemblee|ag\b|convocation|réunion|reunion/.test(ctx) || /assemblée|convocation/.test(type)) {
      return { role: "meetingDate", confidence: 85, important: true };
    }
  }
  if (/avant le|date limite|au plus tard|échéance|echeance|à retourner|a retourner/.test(ctx)) {
    return { role: "deadline", confidence: 85, important: true };
  }
  if (/période|periode|loyer de|au titre de|mois de/.test(ctx) || /quittance/.test(type)) {
    if (/période|periode|loyer|mois|du .+ au/.test(ctx) || /quittance/.test(type)) {
      return { role: "coveredPeriod", confidence: 80, important: true };
    }
  }
  if (/payé le|reglé le|réglé le|date de paiement|paiement effectué/.test(ctx)) {
    return { role: "paymentDate", confidence: 75, important: true };
  }
  if (/émis|emission|émission|édité|edite|fait à|date du courrier/.test(ctx)) {
    return { role: "issueDate", confidence: 70, important: false };
  }
  if (/historique|exercice\s+\d{4}|année\s+\d{4}/.test(ctx) || family === "fiscal") {
    if (/exercice|historique|année/.test(ctx)) {
      return { role: "historical", confidence: 55, important: false };
    }
  }
  if (/mention légale|cgv|article/.test(ctx)) {
    return { role: "legalMention", confidence: 40, important: false };
  }

  return { role: "unknown", confidence: 30, important: false };
}

/**
 * Enrichit l'extraction avec des rôles.
 */
export function interpretExtraction(extraction, meta) {
  const amounts = (extraction.amounts || []).map((item) => {
    const roleInfo = interpretAmountRole(item, meta);
    return { ...item, ...roleInfo };
  });
  const dates = (extraction.dates || []).map((item) => {
    const roleInfo = interpretDateRole(item, meta);
    return { ...item, ...roleInfo };
  });
  const periods = (extraction.periods || []).map((item) => ({
    ...item,
    role: "coveredPeriod",
    important: true,
    confidence: Math.max(item.confidence || 70, 75)
  }));

  return { ...extraction, amounts, dates, periods };
}
