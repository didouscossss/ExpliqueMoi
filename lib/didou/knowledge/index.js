import {
  ASSURANCE_KNOWLEDGE
} from "./assurance.js";

import {
  FISCAL_KNOWLEDGE
} from "./fiscal.js";

import {
  FACTURE_KNOWLEDGE
} from "./facture.js";

import {
  EMPLOI_KNOWLEDGE
} from "./emploi.js";

import {
  BANQUE_KNOWLEDGE
} from "./banque.js";

import {
  LOGEMENT_KNOWLEDGE
} from "./logement.js";

import {
  SANTE_KNOWLEDGE
} from "./sante.js";

import {
  SOCIAL_KNOWLEDGE
} from "./social.js";

import {
  COPROPRIETE_KNOWLEDGE
} from "./copropriete.js";

import {
  JURIDIQUE_KNOWLEDGE
} from "./juridique.js";

/**
 * =====================================================
 * BASE DE CONNAISSANCES DIDOU
 * =====================================================
 *
 * Toutes les fiches documentaires locales
 * sont regroupées ici.
 */

export const DIDOU_KNOWLEDGE = [
  ...ASSURANCE_KNOWLEDGE,
  ...FISCAL_KNOWLEDGE,
  ...FACTURE_KNOWLEDGE,
  ...EMPLOI_KNOWLEDGE,
  ...BANQUE_KNOWLEDGE,
  ...LOGEMENT_KNOWLEDGE,
  ...SANTE_KNOWLEDGE,
  ...SOCIAL_KNOWLEDGE,
  ...COPROPRIETE_KNOWLEDGE,
  ...JURIDIQUE_KNOWLEDGE
];
