/**
 * Déduplicateur sémantique de requêtes (Token Saver - Inspiré d'OpenMausBot).
 *
 * Évite les exécutions redondantes et les doubles coûts LLM lorsqu'un utilisateur,
 * un script ou un sous-agent soumet la même requête textuelle identique (>= 40 caractères)
 * pendant qu'un tour est déjà en cours ou a été récemment traité.
 */

/** Longueur minimale en caractères de mots pour déclencher la déduplication. */
export const SAME_REQUEST_MIN_CHARS = 40;

/**
 * Normalise le texte en éliminant la casse, la ponctuation et les espaces superflus.
 * "5-6 jours" reste distinct de "56 jours" grâce au remplacement de la ponctuation par un espace.
 */
export function normalizeRequestWords(text: string): string {
  if (!text || typeof text !== "string") return "";
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Vérifie si deux textes correspondent à la même requête essentielle.
 * Retourne false si le texte normalisé fait moins de 40 caractères (pour ne pas confondre "ok", "merci", "continue").
 */
export function isSameRequest(a: string, b: string): boolean {
  if (!a || !b) return false;
  const left = normalizeRequestWords(a);
  if (left.length < SAME_REQUEST_MIN_CHARS) return false;
  const right = normalizeRequestWords(b);
  return left === right;
}

/**
 * Recherche une exécution active ou en file d'attente portant exactement sur la même requête.
 */
export function findDuplicateActiveRun<T extends { id: string; prompt: string; status: string }>(
  activeRuns: readonly T[],
  incomingText: string,
): T | null {
  if (!incomingText || activeRuns.length === 0) return null;
  const incomingNorm = normalizeRequestWords(incomingText);
  if (incomingNorm.length < SAME_REQUEST_MIN_CHARS) return null;

  for (const run of activeRuns) {
    if (run.status === "queued" || run.status === "running") {
      if (normalizeRequestWords(run.prompt) === incomingNorm) {
        return run;
      }
    }
  }
  return null;
}
