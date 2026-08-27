import {
  MAX_CONSECUTIVE_REDUNDANT_CALLS,
  MAX_TOOL_ITERATIONS_PER_TURN,
} from "./loop-guards.js";
import { compactToolResult } from "./tool-compacting.js";
import { formatSkillsPrompt, type SkillItemLike } from "./executor.js";

// ============================================================================
// 4-BLOCK PREFIX CACHING SYSTEM PROMPT & TELEMETRY ENGINE
// ============================================================================

export const STATIC_PLATFORM_GUARDRAILS_BLOC_A = `=== BLOC A : INVARIANT PLATFORM GUARDRAILS & CORE CONSTRAINTS ===
1. Security & Principle of Least Privilege:
   - Only execute tools when strictly necessary. Prefer read-only actions before mutations.
   - Never disclose system secrets, bearer tokens, or internal credentials.
2. Anti-Loop & Execution Limits:
   - Maximum ${MAX_TOOL_ITERATIONS_PER_TURN} tool steps per single user turn.
   - Maximum ${MAX_CONSECUTIVE_REDUNDANT_CALLS} consecutive identical tool calls allowed before automated circuit break.
3. Zero-Chatter Directive & Conciseness:
   - Do not output conversational filler, polite greetings, or acknowledgments.
   - Return dense, structured Markdown directly addressing the objective.`;

export interface BotPromptConfig {
  botName: string;
  botTitle?: string;
  instructions: string;
  activeSkills?: SkillItemLike[];
}

export interface ConversationTurn {
  role: "user" | "assistant" | "system";
  content: string;
  toolResults?: Array<{ toolName: string; result: unknown }>;
}

export interface EphemeralUserTurn {
  prompt: string;
  attachedFiles?: Array<{ name: string; path: string; size: number }>;
}

export interface Assembled4BlockPrompt {
  blocA: string;
  blocB: string;
  blocC: string;
  blocD: string;
  fullSystemPrompt: string;
  fullUserPrompt: string;
  combinedContext: string;
}

/**
 * 4-Block Cache-Friendly System Prompt Assembler
 * Orders components strictly from static (Token 0) to dynamic (Ephemeral turn)
 */
export function assemble4BlockCachePrompt(params: {
  bot: BotPromptConfig;
  history?: ConversationTurn[];
  currentTurn: EphemeralUserTurn;
}): Assembled4BlockPrompt {
  const blocA = STATIC_PLATFORM_GUARDRAILS_BLOC_A;

  const botIdentity = `### Identité de l'Agent\nNom: ${params.bot.botName}${params.bot.botTitle ? ` (${params.bot.botTitle})` : ""}`;
  const botInstructions = `### Instructions Durables\n${params.bot.instructions.trim()}`;
  const sortedSkills = params.bot.activeSkills
    ? [...params.bot.activeSkills].sort((a, b) => {
        const keyA = `${a.slug ?? ""}:${a.name ?? ""}`;
        const keyB = `${b.slug ?? ""}:${b.name ?? ""}`;
        return keyA.localeCompare(keyB);
      })
    : undefined;
  const skillsSection = sortedSkills ? formatSkillsPrompt(sortedSkills) : undefined;
  const blocB = [
    "=== BLOC B : CONFIGURATION BOT & COMPÉTENCES DURABLES ===",
    botIdentity,
    botInstructions,
    skillsSection,
  ]
    .filter(Boolean)
    .join("\n\n");

  const historyTurns = params.history || [];
  const compactedHistoryBlocks: string[] = [];

  for (const turn of historyTurns) {
    if (turn.toolResults && turn.toolResults.length > 0) {
      const compactedResults = turn.toolResults.map((tr) => {
        const compacted = compactToolResult(tr.toolName, tr.result);
        return `[Tool: ${tr.toolName}] -> ${compacted}`;
      });
      compactedHistoryBlocks.push(`${turn.role.toUpperCase()}: ${turn.content}\n${compactedResults.join("\n")}`);
    } else {
      compactedHistoryBlocks.push(`${turn.role.toUpperCase()}: ${turn.content}`);
    }
  }

  const blocC = [
    "=== BLOC C : HISTORIQUE CONVERSATIONNEL COMPACTÉ ===",
    compactedHistoryBlocks.length > 0 ? compactedHistoryBlocks.join("\n\n") : "(Nouvelle conversation - aucun historique)",
  ].join("\n\n");

  const attachedFilesDesc =
    params.currentTurn.attachedFiles && params.currentTurn.attachedFiles.length > 0
      ? `Fichiers joints au tour courant :\n${params.currentTurn.attachedFiles
          .map((f) => `- ${f.name} (${f.path}, ${(f.size / 1024).toFixed(1)} Ko)`)
          .join("\n")}`
      : "";

  const blocD = [
    "=== BLOC D : REQUÊTE COURANTE & CONTEXTE ÉPHÉMÈRE ===",
    attachedFilesDesc,
    `Demande utilisateur :\n${params.currentTurn.prompt.trim()}`,
  ]
    .filter(Boolean)
    .join("\n\n");

  const fullSystemPrompt = `${blocA}\n\n${blocB}\n\n${blocC}`;
  const fullUserPrompt = blocD;
  const combinedContext = `${fullSystemPrompt}\n\n${fullUserPrompt}`;

  return {
    blocA,
    blocB,
    blocC,
    blocD,
    fullSystemPrompt,
    fullUserPrompt,
    combinedContext,
  };
}

/**
 * Token & Prefix Caching Telemetry Extractor
 */
export function extractCacheTelemetry(
  usage: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
    prompt_tokens_details?: { cached_tokens?: number };
    cached_tokens?: number;
  },
  durationMs: number,
) {
  const cachedTokens = usage.prompt_tokens_details?.cached_tokens ?? usage.cached_tokens ?? 0;
  const promptTokens = usage.prompt_tokens ?? 0;
  const completionTokens = usage.completion_tokens ?? 0;
  const totalPromptTokens = cachedTokens + promptTokens;
  const cacheHitRatio = totalPromptTokens > 0 ? cachedTokens / totalPromptTokens : 0;

  return {
    cachedTokens,
    promptTokens,
    completionTokens,
    totalPromptTokens,
    cacheHitRatio: Math.min(1.0, Math.max(0.0, cacheHitRatio)),
    durationMs,
  };
}

/**
 * Deterministic Session Affinity Key Generator for OpenRouter Sticky Routing
 */
export function computeSessionAffinityKey(params: {
  workspaceId: string;
  botId: string;
  threadId: string;
}): string {
  let hash = 2166136261;
  const input = `${params.workspaceId}:${params.botId}:${params.threadId}`;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `sess_${(hash >>> 0).toString(16)}`;
}
