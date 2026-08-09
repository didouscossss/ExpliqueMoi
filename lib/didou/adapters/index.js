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
