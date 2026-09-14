/**
 * E — Routage des adaptateurs par famille / type.
 */

import { adaptRentReceipt } from "./rentReceipt.js";
import { adaptInvoice } from "./invoice.js";
import { adaptTaxLiasse } from "./taxLiasse.js";
import { adaptCondoMeeting } from "./condoMeeting.js";
import { adaptGeneric } from "./generic.js";

/**
 * @param {{ text: string, extraction: object, detection: object }} ctx
 */
export function runFamilyAdapter(ctx) {
  const family = ctx.detection?.family;
  const type = String(ctx.detection?.documentType || "").toLowerCase();

  /*
   * Un simple accord de famille (encore moins un mot-clé isolé
   * comme "convocation" dans le type) ne suffit pas à router vers
   * un adaptateur spécialisé qui PART DU PRINCIPE que le document
   * est bien de ce genre précis (ex. adaptCondoMeeting construit
   * toute sa sortie autour d'une AG de copropriété). Trouvé sur une
   * notification de radiation France Travail : le seul mot
   * "convocation" ("suite à votre absence à la convocation du...")
   * donnait family="copropriete" avec une confiance de 30/100 — pas
   * assez pour même nommer un type de document — et routait quand
   * même vers l'adaptateur AG, qui affichait alors "Convocation à
   * une assemblée générale de copropriété" avec des actions
   * n'ayant aucun rapport, alors que le Knowledge Reasoner avait
   * par ailleurs correctement identifié "Convocation France
   * Travail". En dessous de ce seuil, on préfère le générique.
   */

  const confidence =
    Number(ctx.detection?.confidence || 0);

  if (confidence < 50) {
    return adaptGeneric(ctx);
  }

  if (family === "logement" || /quittance/.test(type)) {
    return adaptRentReceipt(ctx);
  }
  if (family === "facture" || /facture|avoir|devis/.test(type)) {
    return adaptInvoice(ctx);
  }
  if (family === "fiscal" || /liasse|2031|déclaration de résultats/.test(type)) {
    return adaptTaxLiasse(ctx);
  }
  if (
    family === "copropriete" ||
    /assemblée|assemblee|convocation|copropriété|copropriete/.test(type)
  ) {
    return adaptCondoMeeting(ctx);
  }

  return adaptGeneric(ctx);
}
