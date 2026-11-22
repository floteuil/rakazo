export const REMASTER_SUGGESTION_THRESHOLD = 12;

export const ROUTINE_SILENT_CLAUSE_FR =
  "[Mode Routine Silencieuse : Si aucune nouveauté ou anomalie n'est détectée dès la première vérification, réponds uniquement « NO_SIGNAL — Aucun élément nouveau à signaler aujourd'hui. » et arrête-toi immédiatement sans inventer de rapport.]";

export interface RemasterableMessage {
  role: string;
  blocks?: Array<Record<string, unknown>>;
  content?: string;
}

export interface BuildFiveLineHandoffInput {
  botName: string;
  botTitle?: string | null;
  botDescription?: string | null;
  messages: RemasterableMessage[];
}

export function shouldSuggestThreadRemaster(messageCount: number): boolean {
  return messageCount >= REMASTER_SUGGESTION_THRESHOLD;
}

export function extractMessagePlainText(message: RemasterableMessage): string {
  if (typeof message.content === "string" && message.content.trim().length > 0) {
    return compactSingleLine(message.content);
  }
  if (!Array.isArray(message.blocks)) return "";
  const parts: string[] = [];
  for (const block of message.blocks) {
    if (block && typeof block === "object" && typeof block.text === "string") {
      const trimmed = block.text.trim();
      if (trimmed) parts.push(trimmed);
    }
  }
  return compactSingleLine(parts.join(" "));
}

function compactSingleLine(text: string, maxChars = 220): string {
  const normalized = text
    .replace(/\[HANDOFF DE CONTINUITÉ\s*—\s*FIL REMASTERISÉ\]/gi, "")
    .replace(/\s+/g, " ")
    .trim();
  if (normalized.length <= maxChars) return normalized;
  return `${normalized.slice(0, maxChars - 1).trimEnd()}…`;
}

/**
 * Construit de manière 100 % déterministe (0 token LLM consommé) un Handoff de continuité
 * en 5 lignes en français, inspiré de grok-bot-token-saver (REVIVE.md).
 */
export function buildFiveLineThreadHandoff(input: BuildFiveLineHandoffInput): string {
  const botLabel = input.botTitle?.trim()
    ? `${input.botName.trim()} — ${input.botTitle.trim()}`
    : input.botName.trim() || "Agent Rakazo";

  const userMessages = input.messages
    .filter((m) => m.role === "user")
    .map((m) => extractMessagePlainText(m))
    .filter(Boolean);

  const botMessages = input.messages
    .filter((m) => m.role === "bot" || m.role === "assistant")
    .map((m) => extractMessagePlainText(m))
    .filter(Boolean);

  const firstObjective =
    userMessages[0] ??
    (input.botDescription?.trim()
      ? compactSingleLine(input.botDescription, 180)
      : "Assurer le suivi opérationnel de la mission confiée.");

  const latestUserRequest =
    userMessages.length > 1
      ? userMessages[userMessages.length - 1]!
      : (userMessages[0] ?? "Poursuivre la tâche en cours.");

  const latestBotState =
    botMessages.length > 0
      ? botMessages[botMessages.length - 1]!
      : "En attente de la première synthèse d'exécution.";

  const recentHighlights =
    userMessages.length > 2
      ? compactSingleLine(userMessages.slice(-3, -1).join(" ; "), 200)
      : botMessages.length > 1
        ? compactSingleLine(botMessages[botMessages.length - 2]!, 200)
        : "Continuité directe du fil précédent.";

  const totalMessages = input.messages.length;

  return [
    "[HANDOFF DE CONTINUITÉ — FIL REMASTERISÉ]",
    `1. Agent & Rôle : ${botLabel}`,
    `2. Objectif initial : ${firstObjective}`,
    `3. Dernier état validé : ${latestBotState}`,
    `4. Contexte condensé (${totalMessages} msg) : ${recentHighlights}`,
    `5. Prochaine étape immédiate : ${latestUserRequest}`,
  ].join("\n");
}

export function estimateTokensSavedByRemaster(
  messages: RemasterableMessage[],
  handoffText: string,
): {
  originalTokens: number;
  handoffTokens: number;
  savedTokens: number;
  reductionPercent: number;
} {
  const rawChars = messages.reduce((acc, msg) => acc + extractMessagePlainText(msg).length, 0);
  const originalTokens = Math.max(1, Math.round(rawChars / 4));
  const handoffTokens = Math.max(1, Math.round(handoffText.length / 4));
  const savedTokens = Math.max(0, originalTokens - handoffTokens);
  const reductionPercent =
    originalTokens > handoffTokens
      ? Math.min(99, Math.round((savedTokens / originalTokens) * 100))
      : 0;

  return {
    originalTokens,
    handoffTokens,
    savedTokens,
    reductionPercent,
  };
}

export function hasSilentRoutineClause(prompt: string | null | undefined): boolean {
  if (!prompt) return false;
  return (
    prompt.includes("NO_SIGNAL") ||
    prompt.includes("Mode Routine Silencieuse") ||
    prompt.includes("SILENCE = RÉSULTAT VALIDE")
  );
}

export function applySilentRoutineClause(prompt: string, silentModeEnabled: boolean): string {
  const cleaned = prompt.replace(ROUTINE_SILENT_CLAUSE_FR, "").trim();
  if (!silentModeEnabled) {
    return cleaned;
  }
  if (hasSilentRoutineClause(cleaned)) {
    return cleaned;
  }
  return cleaned ? `${cleaned}\n\n${ROUTINE_SILENT_CLAUSE_FR}` : ROUTINE_SILENT_CLAUSE_FR;
}

export function stripSilentRoutineClauseForEditor(prompt: string): string {
  return prompt.replace(ROUTINE_SILENT_CLAUSE_FR, "").trim();
}
