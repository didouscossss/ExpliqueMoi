/**
 * Fixtures cases fiscales V4-P — synthétiques, sans données personnelles.
 */

export const FIELD_FIXTURES = {
  /** A — case 1AJ reconnue avec valeur */
  case1AJWithValue: `
Direction générale des Finances publiques
Déclaration des revenus — Formulaire 2042
Revenus de l'année 2024
Traitements et salaires
déclarant 1
Case 1AJ : 32 450 €
`.trim(),

  /** B — case inconnue */
  unknownFieldCode: `
Direction générale des Finances publiques
Déclaration des revenus — Formulaire 2042
Case 9ZZ : 100 €
`.trim(),

  /** D — valeur correctement associée */
  case1BJValue: `
Direction générale des Finances publiques
Formulaire n°2042 — Déclaration des revenus
Traitements et salaires déclarant 2
1BJ 28 100,00 €
`.trim(),

  /** E — plusieurs valeurs ambiguës */
  ambiguousValues: `
Direction générale des Finances publiques
Formulaire 2042
Case 1AJ 10 000 € 20 000 € 30 000 €
`.trim(),

  /** F — case vide */
  emptyField: `
Direction générale des Finances publiques
Formulaire n°2042
Traitements et salaires
Case 1AJ
Corrigez si le montant est inexact
`.trim(),

  /** G — checkbox */
  checkbox8UU: `
Direction générale des Finances publiques
Formulaire 2042
Comptes bancaires à l'étranger
Case 8UU [x] cochée
Joignez la déclaration n°3916
`.trim(),

  /** H — OCR dégradé */
  ocr1AJ: `
Direction generale des Finances publiques
FormuIaire 2042
Case lAJ : 41 200 EUR
`.trim(),

  /** I / O — hors contexte / facture */
  invoiceLooksLike1AJ: `
Facture n°FAC-991
Référence produit 1AJ
Quantité : 2
Total TTC : 49,90 €
`.trim(),

  /** J — mention explicative sans champ rempli */
  explanatoryMention: `
Notice pour remplir le formulaire 2042
Voir la case 1AJ pour les traitements et salaires.
Cette notice n'est pas la déclaration.
`.trim(),

  /** K — plusieurs cases sur une ligne */
  multiFieldsLine: `
Direction générale des Finances publiques
Formulaire 2042
Traitements et salaires 1AJ 32 450 1BJ 18 200 1CJ 0
`.trim(),

  /** L — multi-pages */
  multiPageFields: [
    {
      page: 1,
      text: `Direction générale des Finances publiques
Formulaire 2042 — page 1
Case 1AJ : 22 000 €`
    },
    {
      page: 2,
      text: `Formulaire 2042 — page 2
Case 4BA : 4 500 €`
    }
  ],

  /** M — multi-déclarants */
  multiDeclarants: `
Direction générale des Finances publiques
Déclaration des revenus — Formulaire 2042
déclarant 1 Case 1AJ : 40 000 €
déclarant 2 Case 1BJ : 25 000 €
`.trim(),

  /** N — formulaire inconnu */
  unknownFormField: `
Document administratif divers
Case 1AJ mentionnée sans formulaire identifiable
Montant : 1 000 €
`.trim(),

  /** 2044 / foncier */
  case4BA: `
Direction générale des Finances publiques
Formulaire n°2042
Revenus fonciers — régime réel
Case 4BA : 6 200 €
`.trim(),

  /** RICI / emploi domicile */
  case7DB: `
Direction générale des Finances publiques
Formulaire n°2042-RICI
Services à la personne
Case 7DB : 3 600 €
Case 7DR : 400 €
`.trim(),

  /** pensions */
  case1AS: `
Direction générale des Finances publiques
Formulaire 2042
Pensions, retraites
Case 1AS : 15 800 €
`.trim()
};

export const FIELD_FALSE_POSITIVE_CORPUS = {
  address: `Livraison\nAppartement 1AJ, 12 rue des Lilas\n75011 Paris`,
  clientRef: `Bon de commande\nClient 4BA\nArticle chaise\nMontant : 85,00 €`,
  invoiceNumber: `Facture n°7DB-2024\nTotal TTC : 120,00 €`,
  iban: `IBAN FR76 1234 5678 9012 3456 7890 123\nRéf 1AJ`,
  productSku: `Catalogue\nSKU 1CJ-PRO\nPrix : 19,99 €`,
  plate: `Immatriculation AA-123-AJ\nContrôle technique`,
  dossier: `Dossier n°2025-1AJ-88\nService client`
};
