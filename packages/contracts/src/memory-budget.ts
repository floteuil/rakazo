/**
 * Gestionnaire Dynamique de Plafond Mémoire & Archivage LRU (Inspiré d'OpenMausBot).
 *
 * Adapte automatiquement la taille maximale autorisée de mémoire persistante (MEMORY.md)
 * selon le modèle de langage utilisé (Gemini 3.1, Mistral, GPT-OSS 120B, etc.),
 * garantissant la sobriété de contexte et prévenant l'engorgement de tokens.
 */

export interface MemoryBudgetProfile {
  id: string;
  label: string;
  maxLines: number;
  maxBytes: number;
  warningPercent: number; // ex: 80%
  description: string;
}

export const SOVEREIGN_MEMORY_PROFILES: Record<string, MemoryBudgetProfile> = {
  "gemini-3.1": {
    id: "gemini-3.1",
    label: "Gemini 3.1 Pro/Flash",
    maxLines: 250,
    maxBytes: 32 * 1024, // 32 Ko
    warningPercent: 80,
    description: "Profil haute capacité et sobriété pour Gemini 3.1",
  },
  "gemini-1.5": {
    id: "gemini-1.5",
    label: "Gemini 1.5 Pro/Flash",
    maxLines: 250,
    maxBytes: 32 * 1024,
    warningPercent: 80,
    description: "Profil standard Gemini 1.5",
  },
  "gpt-oss-120b": {
    id: "gpt-oss-120b",
    label: "GPT-OSS 120B (OpenRouter)",
    maxLines: 200,
    maxBytes: 24 * 1024, // 24 Ko (standard OpenMausBot)
    warningPercent: 80,
    description: "Profil calibré pour le modèle souverain open-weights 120B",
  },
  chatgpt: {
    id: "chatgpt",
    label: "ChatGPT / GPT-4o",
    maxLines: 200,
    maxBytes: 24 * 1024,
    warningPercent: 80,
    description: "Profil équilibré pour la famille GPT",
  },
  mistral: {
    id: "mistral",
    label: "Mistral Large / Codestral",
    maxLines: 150,
    maxBytes: 16 * 1024, // 16 Ko
    warningPercent: 80,
    description: "Profil sobre et compact pour l'écosystème Mistral AI",
  },
  default: {
    id: "default",
    label: "Standard Souverain Rakazo",
    maxLines: 200,
    maxBytes: 24 * 1024, // 24 Ko
    warningPercent: 80,
    description: "Profil de sécurité par défaut (200 lignes / 24 Ko)",
  },
};

/**
 * Résout dynamiquement le profil budgétaire de mémoire selon le modèle utilisé.
 */
export function resolveMemoryBudget(modelNameOrId?: string | null): MemoryBudgetProfile {
  if (!modelNameOrId || typeof modelNameOrId !== "string") {
    return SOVEREIGN_MEMORY_PROFILES.default!;
  }
  const m = modelNameOrId.toLowerCase();

  if (m.includes("3.1") || (m.includes("gemini") && m.includes("3"))) {
    return SOVEREIGN_MEMORY_PROFILES["gemini-3.1"]!;
  }
  if (m.includes("gemini") || m.includes("google")) {
    return SOVEREIGN_MEMORY_PROFILES["gemini-1.5"]!;
  }
  if (m.includes("120b") || m.includes("gpt-oss")) {
    return SOVEREIGN_MEMORY_PROFILES["gpt-oss-120b"]!;
  }
  if (m.includes("mistral") || m.includes("codestral") || m.includes("mixtral")) {
    return SOVEREIGN_MEMORY_PROFILES.mistral!;
  }
  if (m.includes("gpt") || m.includes("openai") || m.includes("chatgpt")) {
    return SOVEREIGN_MEMORY_PROFILES.chatgpt!;
  }

  return SOVEREIGN_MEMORY_PROFILES.default!;
}

export interface MemoryBudgetStats {
  lineCount: number;
  byteSize: number;
  maxLines: number;
  maxBytes: number;
  usagePercent: number;
  status: "green" | "amber" | "red";
  isTruncated: boolean;
  modelProfile: MemoryBudgetProfile;
}

export interface MemoryBudgetEnforcement {
  activeContent: string;
  evictedLines: string[];
  stats: MemoryBudgetStats;
}

/**
 * Évalue et applique le plafond strict de mémoire (lignes et octets)
 * en isolant les entrées excédentaires pour archivage LRU.
 */
export function enforceMemoryBudget(
  content: string,
  modelNameOrId?: string | null,
): MemoryBudgetEnforcement {
  const profile = resolveMemoryBudget(modelNameOrId);
  if (!content) {
    return {
      activeContent: "",
      evictedLines: [],
      stats: {
        lineCount: 0,
        byteSize: 0,
        maxLines: profile.maxLines,
        maxBytes: profile.maxBytes,
        usagePercent: 0,
        status: "green",
        isTruncated: false,
        modelProfile: profile,
      },
    };
  }

  const rawLines = content.split("\n");
  const activeLines: string[] = [];
  const evictedLines: string[] = [];
  let currentBytes = 0;

  for (let i = 0; i < rawLines.length; i++) {
    const line = rawLines[i]!;
    const lineBytes = Buffer.byteLength(line, "utf8") + 1; // +1 pour le saut de ligne

    // Si on dépasse le quota de lignes ou le quota d'octets
    if (activeLines.length >= profile.maxLines || currentBytes + lineBytes > profile.maxBytes) {
      evictedLines.push(line);
    } else {
      activeLines.push(line);
      currentBytes += lineBytes;
    }
  }

  const activeContent = activeLines.join("\n");
  const actualBytes = Buffer.byteLength(activeContent, "utf8");
  const lineRatio = (activeLines.length / profile.maxLines) * 100;
  const byteRatio = (actualBytes / profile.maxBytes) * 100;
  const usagePercent = Math.min(100, Math.round(Math.max(lineRatio, byteRatio)));

  const isTruncated = evictedLines.length > 0;
  let status: "green" | "amber" | "red" = "green";
  if (isTruncated || usagePercent >= 100) {
    status = "red";
  } else if (usagePercent >= profile.warningPercent) {
    status = "amber";
  }

  return {
    activeContent,
    evictedLines,
    stats: {
      lineCount: activeLines.length,
      byteSize: actualBytes,
      maxLines: profile.maxLines,
      maxBytes: profile.maxBytes,
      usagePercent,
      status,
      isTruncated,
      modelProfile: profile,
    },
  };
}

/**
 * Formate les entrées délestées pour les archiver proprement dans `memory/archive.md`.
 */
export function buildMemoryArchiveEntry(
  evictedLines: readonly string[],
  date = new Date(),
): string {
  if (evictedLines.length === 0) return "";
  const isoDate = date.toISOString().split("T")[0]!;
  const header = `\n\n### · Archivé le ${isoDate} (Plafond de contexte atteint)\n`;
  return `${header}${evictedLines.join("\n")}\n`;
}
