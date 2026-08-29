import type { PrismaClient } from "./client.js";

export interface PromptExecutionLogInput {
  botId?: string | null;
  executionId?: string | null;
  provider?: string | null;
  model?: string | null;
  levelUsed: string;
  promptTokens?: number;
  completionTokens?: number;
  cachedTokens?: number;
  cacheHitRatio?: number;
  durationMs?: number;
  costEstimatedUsd?: number | null;
  inferenceMode?: string | null;
  requestedCategory?: string | null;
  resolvedProvider?: string | null;
  resolvedModel?: string | null;
  isFree?: boolean | null;
}

/**
 * Asynchronously persists prompt execution & prefix cache telemetry in a non-blocking fire-and-forget manner.
 * Database errors are caught and logged non-fatally to prevent disrupting caller execution flow.
 */
export function recordPromptExecutionLogAsync(
  prisma: PrismaClient,
  data: PromptExecutionLogInput,
): void {
  void prisma.promptExecutionLog
    .create({
      data: {
        botId: data.botId ?? null,
        executionId: data.executionId ?? null,
        provider: data.provider ?? null,
        model: data.model ?? null,
        levelUsed: data.levelUsed,
        promptTokens: Math.max(0, data.promptTokens ?? 0),
        completionTokens: Math.max(0, data.completionTokens ?? 0),
        cachedTokens: Math.max(0, data.cachedTokens ?? 0),
        cacheHitRatio: Math.min(1, Math.max(0, data.cacheHitRatio ?? 0)),
        durationMs: Math.max(0, data.durationMs ?? 0),
        costEstimatedUsd: data.costEstimatedUsd ?? null,
        inferenceMode: data.inferenceMode ?? (data.isFree ? "free" : null),
        requestedCategory: data.requestedCategory ?? null,
        resolvedProvider: data.resolvedProvider ?? null,
        resolvedModel: data.resolvedModel ?? null,
        isFree: data.isFree ?? (data.inferenceMode === "free" ? true : false),
      },
    })
    .catch((err) => {
      console.warn(
        "[Telemetry:PromptExecutionLog] Non-fatal persistence error:",
        err instanceof Error ? err.message : err,
      );
    });
}

/**
 * Retrieves prompt execution telemetry logs with optional filtering by botId, model, inferenceMode, or isFree.
 */
export async function listPromptExecutionLogs(
  prisma: PrismaClient,
  filter?: {
    botId?: string;
    model?: string;
    inferenceMode?: string;
    isFree?: boolean;
    limit?: number;
  },
) {
  return prisma.promptExecutionLog.findMany({
    where: {
      ...(filter?.botId ? { botId: filter.botId } : {}),
      ...(filter?.model ? { model: filter.model } : {}),
      ...(filter?.inferenceMode ? { inferenceMode: filter.inferenceMode } : {}),
      ...(filter?.isFree !== undefined ? { isFree: filter.isFree } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: filter?.limit ?? 50,
  });
}
