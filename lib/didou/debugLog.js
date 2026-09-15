/**
 * Log de diagnostic interne, désactivé par défaut.
 *
 * Beaucoup de moteurs Didou loggaient directement avec
 * console.log() pendant leur mise au point — jusqu'à dumper le
 * texte intégral d'un document utilisateur dans les logs Vercel
 * à chaque requête. Ce module centralise ces logs derrière un
 * interrupteur explicite (DIDOU_DEBUG=1) pour :
 *
 * - ne plus exposer de contenu documentaire en production ;
 * - ne plus polluer stdout sur chaque analyse ;
 * - garder la capacité de debug en local sans la retirer partout.
 */

const enabled =
  String(process.env.DIDOU_DEBUG || "") === "1";

export function debugLog(...args) {
  if (!enabled) {
    return;
  }

  console.log(...args);
}

export function isDidouDebugEnabled() {
  return enabled;
}
