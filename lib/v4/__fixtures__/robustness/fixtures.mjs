/**
 * Fixtures synthétiques V4-J — stress / robustesse / adversariaux.
 * Génériques : aucune marque, aucun hardcode entreprise.
 */

export const FIXTURES = {
  complexMultiAmount: `
Facture n° F-9001
Date : 01/06/2026
Sous-total HT : 100,00 €
Remise : -10,00 €
Net HT : 90,00 €
TVA 20 % : 18,00 €
Total TTC : 108,00 €
Déjà payé : 50,00 €
Reste à payer : 58,00 €
`.trim(),

  energyInvoice: `
Facture d'énergie
Référence client : CLI-77821
Référence contrat : CTR-44521
Période : 01/04/2026 au 30/04/2026
Ancien index : 12450 kWh
Nouvel index : 12680 kWh
Consommation : 230 kWh
Abonnement HT : 12,40 €
Consommation HT : 41,20 €
Taxes et contributions : 8,15 €
Total HT : 61,75 €
TVA 20 % : 12,35 €
Total TTC : 74,10 €
Déjà prélevé : 30,00 €
Reste à payer : 44,10 €
Prélèvement automatique le 12/05/2026
Mandat SEPA : FR12ZZZ999999
IBAN FR76 3000 6000 0112 3456 7890 189
`.trim(),

  falseBankStatement: `
Vos coordonnées bancaires pour le prélèvement automatique
IBAN FR76 3000 6000 0112 3456 7890 189
BIC AGRIFRPP
RIB : 30006 00001 12345678901 89
Mandat SEPA : FR12ZZZ123456
Date de prélèvement : 10/06/2026
Aucun historique d'opérations n'est fourni dans ce document.
`.trim(),

  noisyBankStatement: `
RELEVÉ DE COMPTE
SOLDE PRÉCÉDENT : 1 250,00 €
01/05 VIREMENT SALAIRE crédit 2200,00 €
03/05 CARTE SUPERMARCHÉ débit 82,43 €
05/05 PRÉLÈVEMENT ÉNERGIE débit 96,00 €
08/05 VIREMENT débit 250,00 €
SOLDE AU 31/05 : 3 021,57 €
IBAN FR76 3000 6000 0112 3456 7890 189
BIC AGRIFRPP
Adresse : 12 rue Exemple 75001 Paris
Numéro client : 998877
Frais de tenue : 2,00 €
Taux créditeur : 0,10 %
Mentions contractuelles : voir conditions générales
`.trim(),

  footerNoise: `
Facture
Date : 01/06/2026
Total HT : 40,00 €
TVA 20 % : 8,00 €
Total TTC : 48,00 €
---
Société Exemple SA — capital social 1 000 000 €
TVA intracommunautaire FR12345678901
SIRET 123 456 789 00012
RCS Paris 123 456 789
Tél : 01 23 45 67 89
IBAN FR76 3000 6000 0112 3456 7890 189
Date de création de la société : 12/03/1998
`.trim(),

  numericIds: `
Facture
N° client : 2009682949
Facture : 5251633503
Contrat : 20260915001
Téléphone : 0549479000
SIRET : 12345678901234
Montant HT : 32,00 €
TVA 20 % : 6,40 €
Total TTC : 38,40 €
`.trim(),

  multiDates: `
Facture n° F-DATES
Date facture : 01/06/2026
Période : 01/05/2026 au 31/05/2026
Prélèvement : 10/06/2026
Contrat signé : 14/03/2024
Retour demandé avant : 15/06/2026
Total HT : 45,83 €
TVA 20 % : 9,17 €
Total TTC : 55,00 €
`.trim(),

  ambiguousDate: `
Document daté du 01/06/2026
Référence : DOC-1
02/06/2026
Informations générales sans autre contexte de date.
`.trim(),

  actionObligation: `Vous devez retourner le formulaire avant le 15 septembre 2026.`,
  actionAvailability: `Le formulaire sera disponible à partir du 15 septembre 2026.`,
  actionPossibility: `Vous pouvez nous contacter avant le 15 septembre si vous avez des questions.`,
  actionNegation: `Aucun document ne doit être retourné.`,

  illustrativeAmounts: `
Guide pratique des montants.
À titre d'exemple, une facture de 100 € HT avec 20 € de TVA représente 120 € TTC.
Ces montants sont donnés uniquement à titre illustratif.
`.trim(),

  multiContradictions: `
Facture
Total HT : 100 €
TVA 20 % : 20 €
Total TTC : 150 €
À payer : 140 €
`.trim(),

  ocrNoise: `
Facture
T0TAL TTC : 25,99 €
TVA2O% : 4,33 €
M0NTANT HT : 21,66 €
`.trim(),

  hybridLetterInvoice: `
Madame, Monsieur,
Veuillez trouver ci-joint votre facture détaillée.
Cordialement.

--- ANNEXE FACTURE ---
Facture n° F-HYB
Date : 01/06/2026
Total HT : 50,00 €
TVA 20 % : 10,00 €
Total TTC : 60,00 €
`.trim(),

  fiscalGeneric: `
AVIS D'IMPÔT SUR LE REVENU
Revenu fiscal de référence : 28 400 €
Base imposable : 24 100 €
Taux : 11 %
Impôt calculé : 1 250 €
Acomptes déjà versés : 800 €
Solde à régler : 450 €
Date limite de paiement : 15/09/2026
Référence fiscale : 25 13 0 123 456 789
`.trim(),

  contractGeneric: `
CONTRAT DE LOCATION
Entre le bailleur et le locataire.
Date de signature : 01/02/2026
Date d'effet : 01/03/2026
Durée : 12 mois
Loyer mensuel : 750,00 €
Dépôt de garantie : 1500,00 €
IBAN FR76 3000 6000 0112 3456 7890 189
Préavis : 3 mois avant la fin du bail.
`.trim(),

  certificateGeneric: `
ATTESTATION
Je soussigné, Maire de la commune, atteste que Madame Dupont réside au 10 rue des Lilas.
Date : 02/04/2026
Référence : ATT-7788
Nombre d'enfants à charge : 2
Année de naissance : 1990
`.trim(),

  unknownMeeting: `
Notes de réunion interne du 3 mai.
Participants : Alice, Bob.
Ordre du jour : préparation du séminaire d'été.
Décisions : réserver la salle polyvalente et commander les badges.
Prochaine réunion : à définir.
`.trim(),

  keywordAdversarial: `
Madame, Monsieur,
Concernant votre relevé de consommation du mois dernier et vos coordonnées bancaires déjà enregistrées,
nous vous informons que la facture précédente a été soldée.
Le contrat n° CTR-99 reste actif.
Le montant TTC précédent ne doit pas être repris.
La date limite indiquée sur votre facture reste inchangée.
Cordialement.
`.trim(),

  negationBundle: `
Courrier
aucun paiement n'est demandé
ne retournez pas ce document
ce document n'est pas une facture
aucune somme n'est due
aucun prélèvement ne sera effectué
`.trim(),

  /** Facture énergie clôture / remboursement (synthétique) — V4-K.2. */
  complexEnergyInvoiceK1: `
Facture de clôture Energie Electricité
Période de consommation : 01/12/2025 au 31/12/2025
Votre consommation
Energie : 631,85 € HTVA
Services : 21,83 € HTVA
Total HTVA : 653,68 € HTVA
TVA : 123,69 €
Total TTC : 777,37 € TTC
Mensualités facturées : -1 175,00 € TTC
Nous vous rembourserons 397,63 € TTC
Le tarif d'utilisation des réseaux publics représente 222,51 € TTC (188,68 € HT) sur cette facture.
Votre facture arrive à échéance le 18/01/2026.
Vous êtes en prélèvement automatique, votre facture sera remboursée le 18/01/2026, vous n'avez rien à faire.
Mandat SEPA actif
Des questions sur votre facture Energie Electricité 631,85 € HTVA
Sur les réseaux sociaux : = 397,63 € TTC
Support client : 0 800 00 00 00
`.trim(),

  multiPageNatural: null // built as blocks in the test script
};
