/**
 * Fixtures fiscales synthétiques V4-L / V4-M.
 * Aucune donnée personnelle réelle.
 */

export const FISCAL_FIXTURES = {
  form2042Identity: `
Direction générale des Finances publiques
Déclaration des revenus — Formulaire 2042
Revenus de l'année 2024
Déclarant 1 : Jean Dupont
Traitements et salaires : 32 450,00 €
Foyer fiscal
Date de signature : 12/05/2025
`.trim(),

  form2042Mentioned: `
Direction générale des Finances publiques
Courrier — Service des impôts des particuliers
Madame, Monsieur,
Veuillez vous reporter à votre déclaration 2042.
Conformément à votre dossier, aucune pièce complémentaire n'est demandée.
Cordialement
`.trim(),

  form2042CIdentity: `
Direction générale des Finances publiques
Formulaire n°2042-C
Déclaration de revenus complémentaire
Revenus de l'année 2024
`.trim(),

  form2042CAttach: `
Direction générale des Finances publiques
Courrier administratif
Madame, Monsieur,
Joignez le formulaire 2042-C à votre dossier.
Cordialement
`.trim(),

  form2044: `
Direction générale des Finances publiques
Formulaire n°2044 — Déclaration des revenus fonciers
Loyers bruts : 12 000,00 €
`.trim(),

  form2047: `
Direction générale des Finances publiques
Formulaire n°2047 — Déclaration des revenus encaissés à l'étranger
Pays : Espagne
`.trim(),

  form2042Rici: `
Direction générale des Finances publiques
Formulaire n°2042-RICI
Déclaration des réductions et crédits d'impôt
`.trim(),

  form2065: `
Direction générale des Finances publiques
Formulaire 2065-SD — Impôt sur les sociétés
Exercice clos le 31/12/2025
`.trim(),

  form3310: `
Direction générale des Finances publiques
Formulaire 3310-CA3-SD — Déclaration de TVA
Période : janvier 2026
`.trim(),

  form2074: `
Direction générale des Finances publiques
Formulaire n°2074 — Déclaration des plus ou moins values
`.trim(),

  withholdingPas: `
Direction générale des Finances publiques
Information sur le prélèvement à la source
Taux de prélèvement : 8 %
Montant prélevé : 240,00 €
`.trim(),

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

  propertyTax: `
Direction générale des Finances publiques
Avis de taxe foncière sur les propriétés bâties
Année d'imposition 2025
Cotisation : 1 156,00 €
Montant total à payer : 1 156,00 €
Date limite de paiement : 15/10/2025
`.trim(),

  unknownTax: `
Direction générale des Finances publiques
Document fiscal — notice informative
Votre situation fiscale fait l'objet d'un examen.
Numéro de dossier : FIS-EXAM-77821
Aucun formulaire standard n'est joint.
`.trim(),

  instructionNotice2042: `
Direction générale des Finances publiques
Notice pour remplir le formulaire 2042
Cette notice explique comment déclarer vos revenus.
Elle ne constitue pas la déclaration elle-même.
`.trim(),

  multiReference2042: `
Direction générale des Finances publiques
Déclaration des revenus — Formulaire 2042
Vous pouvez également renseigner les annexes 2042-C, 2044 et 2047.
Traitements et salaires : 28 000,00 €
`.trim(),

  conflictTitleVsBody: `
Direction générale des Finances publiques
Déclaration des revenus — Formulaire 2042
Voir aussi la notice 2042-NOT pour le détail.
Les revenus étrangers figurent éventuellement sur la 2047.
Traitements et salaires : 30 000,00 €
`.trim(),

  taxpayerId13: `
Direction générale des Finances publiques
Avis d'impôt sur les revenus
Numéro fiscal : 1890123456789
Revenu fiscal de référence : 28 100,00 €
`.trim(),

  noticeReference: `
Direction générale des Finances publiques
Avis d'impôt sur les revenus — année 2024
Référence de l'avis : 24IRX9K2M7P4
Impôt sur le revenu : 1 240,00 €
`.trim(),

  form2042NoisyOcr: `
Direccion generale des Finances publiques
Declaratlon des revenus — FormuIaire 2042
Revenus de I'annee 2023
Traitements et saIaires : 41 200,00 EUR
`.trim(),

  /** OCR O→0 only with fiscal context */
  form2042OcrO: `
Direction générale des Finances publiques
Formulaire n°2O42 — Déclaration des revenus
Revenus de l'année 2024
`.trim(),

  knownRefWrongStructure: `
Catalogue produits
Formulaire 2042
Référence client interne uniquement
Facture n° CMD-8891
Total TTC : 49,90 €
`.trim(),

  falsePositive2042: `
Bail d'habitation
Appartement 2042, 12 rue des Lilas
75011 Paris
Loyer mensuel : 890,00 €
Charges : 80,00 €
Total mensuel : 970,00 €
`.trim(),

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

  noticeAmbiguousAmounts: `
Direction générale des Finances publiques
Avis d'impôt sur le revenu
Impôt : 1 000,00 €
Montant : 250,00 €
Autre montant : 75,00 €
`.trim()
};

/** Corpus faux positifs numériques (non fiscaux). */
export const FALSE_POSITIVE_CORPUS = {
  invoice2042: `
Facture n°2042
Client : ACME
Total HT : 100,00 €
TVA 20 % : 20,00 €
Total TTC : 120,00 €
`.trim(),
  client2042C: `
Bon de commande
Client 2042-C
Article : chaise
Montant : 85,00 €
`.trim(),
  contract2065: `
Contrat 2065
Entre la société ALPHA et Monsieur Martin
Durée : 12 mois
`.trim(),
  address2044: `
Livraison
Adresse : 2044 route des Vignes
33000 Bordeaux
`.trim(),
  phone3310: `
Contact support
Appelez le 33 10 20 30 40
Référence dossier : SAV-991
`.trim(),
  product2572: `
Catalogue
Référence produit 2572
Prix : 19,99 €
`.trim()
};

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
