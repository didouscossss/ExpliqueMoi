/**
 * Registre des sources externes V4-L.
 * « Gratuitement accessible » ≠ redistribution commerciale autorisée
 * sauf licence explicite.
 */

import type { ExternalSourceRecord } from "../../types/knowledge.js";

export const FISCAL_EXTERNAL_SOURCES: readonly ExternalSourceRecord[] = [
  {
    id: "impots-gouv-fr",
    source: "https://www.impots.gouv.fr",
    owner: "Direction générale des Finances publiques (DGFiP)",
    license: "Licence Ouverte Etalab 2.0 (informations du site, sauf mention contraire)",
    termsUrl: "https://www.impots.gouv.fr/mentions-legales",
    redistributionAllowed: true,
    commercialUseAllowed: true,
    localBundlingAllowed: true,
    retrievalMethod:
      "manual-curation + optional build refresh of public HTML form pages; no PDF bulk scrape; no iframe embedding; graphics excluded",
    notes:
      "Identité visuelle / éléments graphiques DGFiP exclus. Métadonnées structurées (titres, n° formulaires, descriptions) uniquement."
  },
  {
    id: "service-public-fr",
    source: "https://www.service-public.fr",
    owner: "Direction de l'information légale et administrative (DILA)",
    license: "UNKNOWN — vérifier licence page / Licence Ouverte lorsque indiquée",
    termsUrl: "https://www.service-public.fr/P10047",
    redistributionAllowed: "UNKNOWN",
    commercialUseAllowed: "UNKNOWN",
    localBundlingAllowed: "UNKNOWN",
    retrievalMethod: "not used as primary source in V4-L curated seed",
    notes: "Source secondaire éventuelle ; impots.gouv.fr prioritaire pour formulaires."
  },
  {
    id: "data-gouv-fr",
    source: "https://www.data.gouv.fr",
    owner: "Etalab / producteurs divers",
    license: "UNKNOWN — dépend du jeu de données",
    termsUrl: "https://www.data.gouv.fr/fr/terms/",
    redistributionAllowed: "UNKNOWN",
    commercialUseAllowed: "UNKNOWN",
    localBundlingAllowed: "UNKNOWN",
    retrievalMethod: "not used in V4-L seed — no structured fiscal form catalog adopted yet",
    notes: "À réévaluer si un dataset officiel DGFiP pertinent apparaît."
  }
] as const;
