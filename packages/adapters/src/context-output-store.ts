import { createHash } from "node:crypto";
import type {
  AdapterContext,
  ComputerRef,
  MemoryStore,
  SandboxProvider,
} from "@rakazo/adapter-kit";
import {
  buildWorkspaceOutputPointer,
  evaluateRoutineObservationDelta,
  LEARNED_SKILLS_MEMORY_PATH,
  type LearnedSkillMutationResult,
  type LearnedSkillStoreDocument,
  markLearnedSkillUsed,
  normalizeWatchKey,
  parseLearnedSkillDocument,
  patchLearnedSkillInDocument,
  type RoutineDeltaDecision,
  type RoutineObservationInput,
  type RoutineObservationRecord,
  saveLearnedSkillInDocument,
  WORKSPACE_OUTPUT_OFFLOAD_THRESHOLD_CHARS,
} from "@rakazo/contracts";
import { resolveBotWorkspacePath } from "./computer-support.js";

/**
 * Déporte de façon sans perte (`lossless`) les résultats d'outils volumineux (> 16 000 caractères)
 * vers un fichier adressé par SHA-256 dans `.rakazo/outputs/<sha256>.txt` au sein du workspace du bot,
 * et retourne un pointeur JSON compact contenant le début (`preview`) et la fin (`tail`).
 *
 * En cas d'échec d'écriture disque (ex. sandbox simulé sans écriture), retourne `null` afin de
 * retomber en toute transparence sur le compactage mémoire habituel.
 */
export async function offloadLargeToolOutputIfNeeded(params: {
  sandbox: SandboxProvider;
  computer: ComputerRef;
  computerMode: "team" | "dedicated";
  botId: string;
  context: AdapterContext;
  compactedText: string;
  thresholdChars?: number;
}): Promise<string | null> {
  const threshold = params.thresholdChars ?? WORKSPACE_OUTPUT_OFFLOAD_THRESHOLD_CHARS;
  if (!params.compactedText || params.compactedText.length <= threshold) {
    return null;
  }

  try {
    const hash = createHash("sha256").update(params.compactedText, "utf8").digest("hex");
    const relativePath = `.rakazo/outputs/${hash.slice(0, 24)}.txt`;
    const storedPath = resolveBotWorkspacePath(params.computerMode, params.botId, relativePath);

    await params.sandbox.writeFile(
      params.computer,
      {
        path: storedPath,
        content: new TextEncoder().encode(params.compactedText),
      },
      params.context,
    );

    return buildWorkspaceOutputPointer({
      workspaceFile: relativePath,
      fullText: params.compactedText,
      previewChars: 1_600,
    });
  } catch {
    return null;
  }
}

/**
 * Charge le document de compétences procédurales auto-apprises depuis le `MemoryStore` du bot.
 */
export async function loadBotLearnedSkillsDocument(
  memory: MemoryStore,
  botId: string,
  context: AdapterContext,
): Promise<LearnedSkillStoreDocument> {
  try {
    const snapshot = await memory.read(
      { scope: "bot", botId, path: LEARNED_SKILLS_MEMORY_PATH },
      context,
    );
    const doc = snapshot.documents.find((d) => d.path === LEARNED_SKILLS_MEMORY_PATH);
    return parseLearnedSkillDocument(doc?.content);
  } catch {
    return parseLearnedSkillDocument(null);
  }
}

/**
 * Persiste le document de compétences auto-apprises dans le `MemoryStore` du bot.
 */
export async function saveBotLearnedSkillsDocument(
  memory: MemoryStore,
  params: {
    botId: string;
    document: LearnedSkillStoreDocument;
    runId?: string;
    threadId?: string;
  },
  context: AdapterContext,
): Promise<void> {
  await memory.commit(
    {
      scope: "bot",
      botId: params.botId,
      path: LEARNED_SKILLS_MEMORY_PATH,
      content: JSON.stringify(params.document, null, 2),
      sourceRunId: params.runId,
      sourceThreadId: params.threadId,
    },
    context,
  );
}

/**
 * Exécute une opération `save` ou `patch` sur les compétences auto-apprises d'un bot.
 */
export async function mutateBotLearnedSkill(
  memory: MemoryStore,
  params:
    | {
        mode: "save";
        botId: string;
        name: string;
        description: string;
        body: string;
        builtInSlugs?: ReadonlySet<string>;
        trigger?: string;
        isSubagent?: boolean;
        runId?: string;
        threadId?: string;
      }
    | {
        mode: "patch";
        botId: string;
        name: string;
        oldText: string;
        newText: string;
        trigger?: string;
        isSubagent?: boolean;
        runId?: string;
        threadId?: string;
      },
  context: AdapterContext,
): Promise<LearnedSkillMutationResult> {
  const currentDoc = await loadBotLearnedSkillsDocument(memory, params.botId, context);
  const result =
    params.mode === "save"
      ? saveLearnedSkillInDocument(currentDoc, {
          name: params.name,
          description: params.description,
          body: params.body,
          builtInSlugs: params.builtInSlugs,
          trigger: params.trigger,
          isSubagent: params.isSubagent,
        })
      : patchLearnedSkillInDocument(currentDoc, {
          name: params.name,
          oldText: params.oldText,
          newText: params.newText,
          trigger: params.trigger,
          isSubagent: params.isSubagent,
        });

  if (result.ok) {
    await saveBotLearnedSkillsDocument(
      memory,
      {
        botId: params.botId,
        document: result.document,
        runId: params.runId,
        threadId: params.threadId,
      },
      context,
    );
  }
  return result;
}

/**
 * Lit une compétence auto-apprise par nom ou slug et rafraîchit son horodatage `lastUsedAt` (LRU).
 */
export async function readBotLearnedSkill(
  memory: MemoryStore,
  params: {
    botId: string;
    nameOrSlug: string;
    runId?: string;
    threadId?: string;
  },
  context: AdapterContext,
) {
  const currentDoc = await loadBotLearnedSkillsDocument(memory, params.botId, context);
  const marked = markLearnedSkillUsed(currentDoc, params.nameOrSlug);
  if (!marked.found) return undefined;

  await saveBotLearnedSkillsDocument(
    memory,
    {
      botId: params.botId,
      document: marked.document,
      runId: params.runId,
      threadId: params.threadId,
    },
    context,
  ).catch(() => undefined);

  return marked.found;
}

/**
 * Enregistre une observation de routine de veille et évalue le delta par rapport à la baseline précédente.
 */
export async function recordBotRoutineObservation(
  memory: MemoryStore,
  params: {
    botId: string;
    observation: RoutineObservationInput;
    runId?: string;
    threadId?: string;
  },
  context: AdapterContext,
): Promise<RoutineDeltaDecision> {
  const watchKey = normalizeWatchKey(params.observation.watchKey);
  const storagePath = `routines/observations/${watchKey}.json`;

  let previous: RoutineObservationRecord | null = null;
  try {
    const snap = await memory.read({ scope: "bot", botId: params.botId, path: storagePath }, context);
    const doc = snap.documents.find((d) => d.path === storagePath);
    if (doc?.content) {
      previous = JSON.parse(doc.content) as RoutineObservationRecord;
    }
  } catch {
    previous = null;
  }

  const decision = evaluateRoutineObservationDelta(previous, params.observation);

  await memory.commit(
    {
      scope: "bot",
      botId: params.botId,
      path: storagePath,
      content: JSON.stringify(decision.updatedRecord, null, 2),
      sourceRunId: params.runId,
      sourceThreadId: params.threadId,
    },
    context,
  );

  return decision;
}
