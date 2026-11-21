/**
 * Préservation Asymétrique des Consignes Humaines en Mémoire (Inspiré d'Hermes Agent).
 *
 * Principe d'asymétrie :
 *  - Les messages de rôle `user` incarnent l'intention fondatrice et les consignes de l'utilisateur.
 *    Ils ne sont JAMAIS tronqués, condensés ou supprimés du fil de contexte.
 *  - Les résultats verbeux des outils (`role: "tool"`) et les narrations intermédiaires (`role: "assistant"`)
 *    sont des données dérivées : ils sont compressés, élagués ou archivés en priorité lorsque
 *    la fenêtre de contexte dépasse les seuils recommandés.
 */

import type { SanitizableMessage } from "./history-sanitize.js";

export interface AsymmetricCompactionOptions {
  /** Nombre maximal de messages total dans la fenêtre active. */
  maxMessages?: number;
  /** Nombre de messages récents (la queue) à préserver intégralement. */
  protectTailCount?: number;
  /** Longueur maximale de contenu textuel pour un résultat d'outil archivé. */
  maxArchivedToolChars?: number;
}

export interface AsymmetricCompactionResult<T extends SanitizableMessage> {
  compactedMessages: T[];
  preservedUserCount: number;
  archivedToolCount: number;
  compactedAssistantCount: number;
  isCompacted: boolean;
}

/**
 * Compacte un historique conversationnel en appliquant la règle d'asymétrie humaine :
 * - 100% des messages `user` sont sanctuarisés dans leur forme exacte.
 * - Les messages récents de la queue (`protectTailCount`, défaut 8) sont préservés intacts.
 * - Dans la zone médiane (middle), les résultats d'outils verbeux sont élagués
 *   ou remplacés par un condensé synthétique `[Résultat d'outil antérieur compacté]`.
 */
export function asymmetricCompactHistory<T extends SanitizableMessage>(
  messages: readonly T[],
  options: AsymmetricCompactionOptions = {},
): AsymmetricCompactionResult<T> {
  const {
    maxMessages = 40,
    protectTailCount = 8,
    maxArchivedToolChars = 300,
  } = options;

  if (!Array.isArray(messages) || messages.length <= maxMessages) {
    const userCount = messages.filter((m) => m.role === "user").length;
    return {
      compactedMessages: [...messages] as T[],
      preservedUserCount: userCount,
      archivedToolCount: 0,
      compactedAssistantCount: 0,
      isCompacted: false,
    };
  }

  const total = messages.length;
  const tailStartIndex = Math.max(0, total - protectTailCount);

  let preservedUserCount = 0;
  let archivedToolCount = 0;
  let compactedAssistantCount = 0;

  const result: T[] = [];

  for (let i = 0; i < total; i++) {
    const msg = messages[i]!;

    // 1. Tous les messages 'user' sont conservés intacts (Sanctuarisation humaine)
    if (msg.role === "user") {
      preservedUserCount++;
      result.push(msg);
      continue;
    }

    // 2. Les messages récents dans la queue (tail) sont conservés tels quels
    if (i >= tailStartIndex) {
      result.push(msg);
      continue;
    }

    // 3. Les messages système de tête sont conservés
    if (msg.role === "system" && i < 2) {
      result.push(msg);
      continue;
    }

    // 4. Dans la zone médiane : compactage asymétrique des outils
    if (msg.role === "tool") {
      archivedToolCount++;
      const originalContent = typeof msg.content === "string" ? msg.content : "";
      if (originalContent.length > maxArchivedToolChars) {
        const preview = originalContent.slice(0, maxArchivedToolChars).trim();
        result.push({
          ...msg,
          content: `${preview}…\n[Résultat d'outil antérieur compacté pour préserver le contexte souverain]`,
        });
      } else {
        result.push(msg);
      }
      continue;
    }

    // 5. Dans la zone médiane : assistant sans appels d'outils
    if (msg.role === "assistant") {
      const hasToolCalls = Array.isArray(msg.tool_calls) && msg.tool_calls.length > 0;
      if (!hasToolCalls && typeof msg.content === "string" && msg.content.length > 400) {
        compactedAssistantCount++;
        const preview = msg.content.slice(0, 300).trim();
        result.push({
          ...msg,
          content: `${preview}…\n[Synthèse intermédiaire conservée]`,
        });
      } else {
        result.push(msg);
      }
      continue;
    }

    result.push(msg);
  }

  return {
    compactedMessages: result,
    preservedUserCount,
    archivedToolCount,
    compactedAssistantCount,
    isCompacted: true,
  };
}
