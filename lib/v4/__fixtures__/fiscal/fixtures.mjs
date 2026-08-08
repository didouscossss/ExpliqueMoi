/**
 * Fixtures fiscales synthétiques V4-L.
 * Aucune donnée personnelle réelle. Aucun avis/déclaration utilisateur.
 */

export const FISCAL_FIXTURES = {
  /** §27 — 2042 identitaire */
  form2042Identity: `
Direction générale des Finances publiques
Déclaration des revenus — Formulaire 2042
Revenus de l'année 2024
Déclarant 1 : Jean Dupont
Traitements et salaires : 32 450,00 €
Foyer fiscal
Date de signature : 12/05/2025
`.trim(),

  /** §28 — 2042 mentionné (courrier ≠ déclaration) */
  form2042Mentioned: `
Direction générale des Finances publiques
Courrier — Service des impôts des particuliers
Madame, Monsieur,
Veuillez vous reporter à votre déclaration 2042.
Conformément à votre dossier, aucune pièce complémentaire n'est demandée.
Cordialement
`.trim(),

  /** §29 — numéro fiscal 13 chiffres */
  taxpayerId13: `
Direction générale des Finances publiques
Avis d'impôt sur les revenus
Numéro fiscal : 1890123456789
Revenu fiscal de référence : 28 100,00 €
`.trim(),

  /** §30 — référence d'avis */
  noticeReference: `
Direction générale des Finances publiques
Avis d'impôt sur les revenus — année 2024
Référence de l'avis : 24IRX9K2M7P4
Impôt sur le revenu : 1 240,00 €
`.trim(),

  /** §31 — avis avec remboursement */
  noticeRefund: `
Direction générale des Finances publiques
Avis d'impôt sur le revenu
Au titre des revenus 2024
Impôt calculé : 2 180,00 €
Prélèvement à la source déjà effectué : 2 640,00 €
Crédit d'impôt : 120,00 €
Montant à rembourser : 580,00 €
Aucun paiement n'est demandé.
`.trim(),

  /** §32 — avis avec solde à payer + échéancier */
  noticeAmountDue: `
Direction générale des Finances publiques
Avis d'impôt sur le revenu
Au titre des revenus 2024
Impôt calculé : 3 420,00 €
Prélèvement à la source déjà effectué : 2 100,00 €
Reste à payer : 1 320,00 €
Échéancier de paiement :
- 15/10/2025 : 660,00 €
- 15/11/2025 : 660,00 €
Date limite de paiement : 15/11/2025
`.trim(),

  /** §33 — taxe foncière */
  propertyTax: `
Direction générale des Finances publiques
Avis de taxe foncière sur les propriétés bâties
Année d'imposition 2025
Propriété bâtie — base d'imposition indicative
Cotisation : 1 156,00 €
Montant total à payer : 1 156,00 €
Date limite de paiement : 15/10/2025
`.trim(),

  /** §34 — fiscal inconnu */
  unknownTax: `
Direction générale des Finances publiques
Document fiscal — notice informative
Votre situation fiscale fait l'objet d'un examen.
Numéro de dossier : FIS-EXAM-77821
Aucun formulaire standard n'est joint.
`.trim(),

  /** §35 — faux positif 2042 (adresse) */
  falsePositive2042: `
Bail d'habitation
Appartement 2042, 12 rue des Lilas
75011 Paris
Loyer mensuel : 890,00 €
Charges : 80,00 €
Total mensuel : 970,00 €
`.trim(),

  /** OCR légèrement bruité */
  form2042NoisyOcr: `
Direccion generale des Finances publiques
Declaratlon des revenus — FormuIaire 2042
Revenus de I'annee 2023
Traitements et saIaires : 41 200,00 EUR
`.trim(),

  /** Multi-page synthétique (blocs page 1/2) */
  noticeMultiPageParts: [
    {
      page: 1,
      text: `Direction générale des Finances publiques
Avis d'impôt sur le revenu
Page 1/2
Référence de l'avis : 25IRABCD1234
Impôt calculé : 900,00 €`
    },
    {
      page: 2,
      text: `Page 2/2
Prélèvement à la source déjà effectué : 400,00 €
Reste à payer : 500,00 €
Date limite de paiement : 30/09/2025`
    }
  ],

  /** Ambiguïté montants */
  noticeAmbiguousAmounts: `
Direction générale des Finances publiques
Avis d'impôt sur le revenu
Impôt : 1 000,00 €
Montant : 250,00 €
Autre montant : 75,00 €
`.trim()
};

/** Générateur de variations synthétiques (infrastructure, pas corpus massif). */
export function makeIncomeNoticeVariant(opts = {}) {
  const year = opts.year ?? 2024;
  const tax = opts.tax ?? 2000;
  const withheld = opts.withheld ?? 1500;
  const balance = tax - withheld;
  const refund = balance < 0;
  return `
Direction générale des Finances publiques
Avis d'impôt sur le revenu
Au titre des revenus ${year}
Impôt calculé : ${tax.toFixed(2).replace(".", ",")} €
Prélèvement à la source déjà effectué : ${withheld.toFixed(2).replace(".", ",")} €
${
  refund
    ? `Montant à rembourser : ${Math.abs(balance).toFixed(2).replace(".", ",")} €`
    : `Reste à payer : ${balance.toFixed(2).replace(".", ",")} €`
}
`.trim();
}
