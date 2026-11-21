/**
 * Assainissement déterministe de l'historique conversationnel anti-dangles.
 *
 * Résout le problème critique de production où un tour interrompu (bouton Stop, déconnexion,
 * rechargement de page ou crash) laisse des `tool_calls` sans message `tool` correspondant.
 * Lorsqu'un tel historique est rejoué, les API LLM (Gemini, OpenAI, OpenRouter, Anthropic)
 * renvoient une erreur fatale 400 (MissingToolResultsError) rendant le fil de discussion mort.
 *
 * Ce filtre de pré-vol déterministe (coût 0.00 € / 0 token) garantit la stricte intégrité
 * des paires call / result avant transmission au transport d'inférence.
 */

export interface SanitizableMessage {
  role: "system" | "user" | "assistant" | "tool";
  content?: string | unknown[] | null;
  tool_calls?: Array<{
    id: string;
    type: "function";
    function: {
      name: string;
      arguments: string;
    };
  }>;
  tool_call_id?: string;
  name?: string;
}

/** Vérifie si un message est silencieux (aucun texte utile à présenter). */
export function isSilentMessage(message: SanitizableMessage): boolean {
  const content = message.content;
  if (content === undefined || content === null) return true;
  if (typeof content === "string") return content.trim().length === 0;
  if (Array.isArray(content)) return content.length === 0;
  return false;
}

/**
 * Assainit un historique conversationnel pour garantir la validité stricte des appels d'outils.
 *
 * Règles appliquées :
 *  1. Un `tool_call` est considéré comme répondu s'il existe un message ultérieur `role: "tool"`
 *     portant le même `tool_call_id` avant le prochain message `user` (ou s'il est résolu ailleurs).
 *  2. Un message assistant ne conserve que ses appels d'outils effectivement répondus.
 *     Si cela vide tous ses appels et qu'il n'avait aucun texte, la coquille vide (assistant husk) est supprimée.
 *  3. Un résultat d'outil (`role: "tool"`) ne survit que s'il correspond à un appel d'outil conservé.
 *     Les résultats orphelins (dont le call a été tronqué) sont éliminés.
 */
export function sanitizeSeededHistory<T extends SanitizableMessage>(
  history: T[],
  answeredElsewhere: ReadonlySet<string> = new Set(),
): T[] {
  if (!Array.isArray(history) || history.length === 0) {
    return [];
  }

  // 1. Calcul des frontières : le prochain message utilisateur après chaque index
  const boundaryAfter: number[] = new Array(history.length).fill(history.length);
  for (let index = history.length - 1, nextUser = history.length; index >= 0; index -= 1) {
    boundaryAfter[index] = nextUser;
    if (history[index]?.role === "user") {
      nextUser = index;
    }
  }

  // 2. Localisation des déclarations d'appels d'outils (assistant)
  const callAt = new Map<string, number>();
  for (const [index, message] of history.entries()) {
    if (message.role === "assistant" && Array.isArray(message.tool_calls)) {
      for (const call of message.tool_calls) {
        if (call?.id && !callAt.has(call.id)) {
          callAt.set(call.id, index);
        }
      }
    }
  }

  // 3. Localisation des réponses d'outils valides (tool)
  const answerAt = new Map<string, number>();
  for (const [index, message] of history.entries()) {
    if (message.role === "tool" && message.tool_call_id) {
      const callId = message.tool_call_id;
      if (answerAt.has(callId)) continue; // Premier résultat valide uniquement
      const calledIndex = callAt.get(callId);
      if (calledIndex === undefined || index <= calledIndex) continue;
      const boundary = boundaryAfter[calledIndex] ?? history.length;
      if (index >= boundary) continue; // La réponse doit être reçue avant le prochain message user
      answerAt.set(callId, index);
    }
  }

  // 4. Filtrage et élagage des appels et coquilles vides
  const survivingCallIds = new Set<string>();
  const cleaned: (T | undefined)[] = history.map((message) => {
    if (message.role === "assistant" && Array.isArray(message.tool_calls)) {
      const answeredCalls = message.tool_calls.filter(
        (call) => call?.id && (answeredElsewhere.has(call.id) || answerAt.has(call.id)),
      );

      for (const call of answeredCalls) {
        if (call?.id) survivingCallIds.add(call.id);
      }

      // Si aucun appel ne survit et qu'aucun texte n'a été produit, on élimine la coquille vide
      if (answeredCalls.length === 0 && isSilentMessage(message)) {
        return undefined;
      }

      // Si tous les appels sont sains, conserver le message intact
      if (answeredCalls.length === message.tool_calls.length) {
        return message;
      }

      // Sinon, recréer le message assistant avec uniquement les appels valides
      const updated: SanitizableMessage = {
        ...message,
        tool_calls: answeredCalls.length > 0 ? answeredCalls : undefined,
      };
      return updated as T;
    }

    if (message.role === "tool") {
      const callId = message.tool_call_id;
      if (!callId || !survivingCallIds.has(callId)) {
        return undefined; // Orphelin ou rejeté
      }
      return message;
    }

    return message;
  });

  return cleaned.filter((msg): msg is T => msg !== undefined);
}

/** Compte le nombre d'appels d'outils sans réponse dans un historique brut. */
export function countDanglingToolCalls(history: SanitizableMessage[]): number {
  const sanitized = sanitizeSeededHistory(history);
  const rawCalls = history.reduce((count, m) => count + (m.tool_calls?.length ?? 0), 0);
  const safeCalls = sanitized.reduce((count, m) => count + (m.tool_calls?.length ?? 0), 0);
  return Math.max(0, rawCalls - safeCalls);
}
