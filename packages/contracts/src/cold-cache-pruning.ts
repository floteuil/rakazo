/**
 * Élagage « Cold-Cache » des Anciens Résultats d'Outils & Pointeurs de Déport Disque
 * (Inspiré de la gestion du contexte et du Prompt Cache de n8n-io/nod).
 *
 * Principe fondamental :
 *  - Tant que le cache de préfixe du modèle est CHAUD (< 5 minutes depuis la dernière requête
 *    avec le même couple provider/modèle), la frontière des résultats d'outils antérieurs
 *    NE BOUGE PAS : cela garantit 100 % de Cache Hit sans invalider le préfixe mis en cache.
 *  - Dès que le cache devient FROID (≥ 5 minutes d'inactivité ou changement de modèle/provider),
 *    tous les résultats d'outils des tours précédents dépassant 2 000 caractères sont remplacés
 *    par une note compacte indiquant le nom de l'outil et la taille initiale, tout en gardant
 *    intacts les résultats du tour courant et la queue récente.
 */

import type { SanitizableMessage } from "./history-sanitize.js";

/** Durée au-delà de laquelle le Prompt Cache fournisseur est considéré comme expiré (5 minutes). */
export const COLD_CACHE_IDLE_MS = 5 * 60 * 1000;

/** Seuil de taille (en caractères) au-delà duquel un ancien résultat d'outil est élagué à froid. */
export const COLD_TOOL_PRUNE_THRESHOLD_CHARS = 2_000;

/** Seuil au-delà duquel un résultat d'outil volumineux est déporté vers `.rakazo/outputs/`. */
export const WORKSPACE_OUTPUT_OFFLOAD_THRESHOLD_CHARS = 16_000;

/** Nombre maximal d'entrées de sessions conservées en mémoire dans le traqueur LRU. */
const MAX_TRACKED_CACHE_SESSIONS = 500;

export interface SessionCacheState {
  lastRequestAtMs: number;
  provider: string;
  model: string;
  /** Frontière (index exclusif) figée tant que le cache reste chaud. */
  frozenPruneBoundaryIndex: number;
}

export interface ColdCacheEvaluation {
  isCold: boolean;
  reason: "first_request" | "idle_timeout" | "model_changed" | "warm_cache";
  pruneBeforeIndex: number;
}

/**
 * Traqueur d'état thermique du Prompt Cache par session (`sessionKey`).
 */
export class ColdCacheTracker {
  private readonly sessions = new Map<string, SessionCacheState>();
  private readonly idleThresholdMs: number;

  constructor(idleThresholdMs = COLD_CACHE_IDLE_MS) {
    this.idleThresholdMs = Math.max(1_000, idleThresholdMs);
  }

  /**
   * Évalue si le cache de la session est froid ou chaud au moment d'émettre une requête LLM,
   * et met à jour l'horodatage ainsi que la frontière d'élagage.
   */
  public evaluateAndRecord(params: {
    sessionKey: string;
    provider: string;
    model: string;
    candidatePruneBeforeIndex: number;
    nowMs?: number;
  }): ColdCacheEvaluation {
    const now = params.nowMs ?? Date.now();
    const key = params.sessionKey || "default-session";
    const prev = this.sessions.get(key);

    let isCold = false;
    let reason: ColdCacheEvaluation["reason"] = "warm_cache";
    let pruneBeforeIndex = 0;

    if (!prev) {
      // Première requête d'une session reprise avec historique : cache froid
      isCold = true;
      reason = "first_request";
      pruneBeforeIndex = Math.max(0, params.candidatePruneBeforeIndex);
    } else if (prev.provider !== params.provider || prev.model !== params.model) {
      isCold = true;
      reason = "model_changed";
      pruneBeforeIndex = Math.max(0, params.candidatePruneBeforeIndex);
    } else if (now - prev.lastRequestAtMs >= this.idleThresholdMs) {
      isCold = true;
      reason = "idle_timeout";
      pruneBeforeIndex = Math.max(0, params.candidatePruneBeforeIndex);
    } else {
      // Cache CHAUD : on conserve strictement la frontière précédente sans la déplacer !
      isCold = false;
      reason = "warm_cache";
      pruneBeforeIndex = prev.frozenPruneBoundaryIndex;
    }

    // Rafraîchissement LRU
    if (this.sessions.has(key)) {
      this.sessions.delete(key);
    } else if (this.sessions.size >= MAX_TRACKED_CACHE_SESSIONS) {
      const oldestKey = this.sessions.keys().next().value;
      if (oldestKey !== undefined) {
        this.sessions.delete(oldestKey);
      }
    }

    this.sessions.set(key, {
      lastRequestAtMs: now,
      provider: params.provider,
      model: params.model,
      frozenPruneBoundaryIndex: pruneBeforeIndex,
    });

    return { isCold, reason, pruneBeforeIndex };
  }

  public getState(sessionKey: string): SessionCacheState | undefined {
    return this.sessions.get(sessionKey);
  }

  public clear(): void {
    this.sessions.clear();
  }
}

/**
 * Construit la note synthétique de remplacement d'un ancien résultat d'outil élagué à froid.
 */
export function buildColdPrunedToolNoteFr(toolName: string, originalCharCount: number): string {
  const safeName = (toolName || "outil").trim() || "outil";
  return `[Résultat antérieur de l'outil '${safeName}' (${originalCharCount} caractères) omis après expiration du cache — relisez la source si des détails précis sont nécessaires ; ne répétez jamais une action mutante uniquement pour revoir son résultat.]`;
}

/**
 * Détermine l'index du dernier message `user` (début de la requête courante),
 * afin de ne JAMAIS élaguer les résultats d'outils générés pendant le tour actif.
 */
export function findCurrentRequestStartIndex<T extends SanitizableMessage>(
  messages: readonly T[],
): number {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i]?.role === "user") {
      return i;
    }
  }
  return messages.length;
}

export interface ColdCachePruneResult<T extends SanitizableMessage> {
  messages: T[];
  prunedToolCount: number;
  savedChars: number;
  evaluation: ColdCacheEvaluation;
}

/**
 * Applique l'élagage « Cold-Cache » sur une séquence de messages :
 * - Respecte intégralement la frontière gelée tant que le cache est chaud (< 5 min).
 * - Lorsque le cache est froid, remplace uniquement les résultats `role === "tool"` situés
 *   AVANT `pruneBeforeIndex` et dépassant `maxToolChars` (défaut 2 000 car.).
 * - Ne supprime aucun message ni appel d'outil (zéro rupture de séquence `tool_call_id`).
 */
export function applyColdCacheToolPruning<T extends SanitizableMessage>(
  messages: readonly T[],
  params: {
    tracker: ColdCacheTracker;
    sessionKey: string;
    provider: string;
    model: string;
    nowMs?: number;
    maxToolChars?: number;
  },
): ColdCachePruneResult<T> {
  const maxToolChars = params.maxToolChars ?? COLD_TOOL_PRUNE_THRESHOLD_CHARS;
  const currentReqStart = findCurrentRequestStartIndex(messages);

  const evaluation = params.tracker.evaluateAndRecord({
    sessionKey: params.sessionKey,
    provider: params.provider,
    model: params.model,
    candidatePruneBeforeIndex: currentReqStart,
    nowMs: params.nowMs,
  });

  if (evaluation.pruneBeforeIndex <= 0 || messages.length === 0) {
    return {
      messages: [...messages] as T[],
      prunedToolCount: 0,
      savedChars: 0,
      evaluation,
    };
  }

  const limitIndex = Math.min(evaluation.pruneBeforeIndex, messages.length);
  let prunedToolCount = 0;
  let savedChars = 0;
  const output: T[] = new Array(messages.length);

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i]!;
    if (
      i < limitIndex &&
      msg.role === "tool" &&
      typeof msg.content === "string" &&
      msg.content.length > maxToolChars
    ) {
      const note = buildColdPrunedToolNoteFr(msg.name ?? "tool", msg.content.length);
      if (note.length < msg.content.length) {
        prunedToolCount++;
        savedChars += msg.content.length - note.length;
        output[i] = {
          ...msg,
          content: note,
        };
        continue;
      }
    }
    output[i] = msg;
  }

  return {
    messages: output,
    prunedToolCount,
    savedChars,
    evaluation,
  };
}

/**
 * Construit un pointeur JSON déterministe lorsqu'un résultat d'outil massif a été sauvegardé
 * intégralement sur le disque du workspace (`.rakazo/outputs/<sha256>.txt`), en conservant le début
 * (`preview`) et la fin (`tail`) pour un contexte immédiat sans perte de données.
 */
export function buildWorkspaceOutputPointer(params: {
  workspaceFile: string;
  fullText: string;
  previewChars?: number;
}): string {
  const previewBudget = Math.max(200, params.previewChars ?? 1_600);
  const halfBudget = Math.floor(previewBudget / 2);
  const totalLen = params.fullText.length;

  if (totalLen <= previewBudget) {
    return JSON.stringify({
      workspaceFile: params.workspaceFile,
      characters: totalLen,
      preview: params.fullText,
    });
  }

  return JSON.stringify({
    workspaceFile: params.workspaceFile,
    characters: totalLen,
    directive:
      "Résultat complet sauvegardé dans workspaceFile. Utilisez read_file ou shell (grep/jq) sur ce chemin si vous avez besoin d'examiner le contenu intégral.",
    preview: params.fullText.slice(0, previewBudget - halfBudget),
    tail: params.fullText.slice(-halfBudget),
  });
}
