import {
  DEFAULT_PROMPT_COMPILER_MODEL,
  type PromptCacheTelemetry,
  type PromptCompilationLevel,
  type PromptCompileInput,
  type PromptCompileOutput,
} from "@rakazo/contracts";
import { sanitizeToolError } from "./enterprise-tools.js";

export interface PromptCompilerOptions {
  apiKey?: string;
  baseUrl?: string;
  modelId?: string;
  fetchFn?: typeof fetch;
  timeoutMs?: number;
  appUrl?: string;
  appName?: string;
}

export interface PromptCompilerService {
  compile(input: PromptCompileInput): Promise<PromptCompileOutput>;
  compileLevel1(input: PromptCompileInput): PromptCompileOutput;
  compileLevel2(input: PromptCompileInput): Promise<PromptCompileOutput>;
}

/**
 * Level 1 Deterministic Fast-Path:
 * Rule-based semantic restructuring designed for fast micro-agents, short drafts, and offline fallback.
 * Transforms raw input into a 5-section hierarchical Markdown structure without any network dependency.
 */
export function compilePromptLevel1Deterministic(input: PromptCompileInput): PromptCompileOutput {
  const startTime = Date.now();
  const raw = input.rawInstruction.trim();
  const botName = input.botName?.trim();
  const botTitle = input.botTitle?.trim();

  const rawLines = raw.split("\n");
  const lines: string[] = [];
  let roleText = "";
  let explicitRoleIndex = -1;

  const rolePrefixRegex =
    /^(?:you are|tu es|agir en tant que|act as|role\s*:|identity\s*:)\s*(.+)/i;

  for (const rawLine of rawLines) {
    const trimmed = rawLine.trim();
    if (trimmed.length === 0) continue;
    const idx = lines.length;
    lines.push(trimmed);
    if (explicitRoleIndex === -1 && rolePrefixRegex.test(trimmed)) {
      explicitRoleIndex = idx;
      const match = trimmed.match(rolePrefixRegex);
      roleText = match?.[1] ? match[1].trim() : trimmed;
    }
  }

  if (!roleText) {
    if (botTitle || botName) {
      const name = botTitle || botName;
      roleText = `You are ${name}, a dedicated and specialized AI assistant configured to execute tasks with high precision and reliability.`;
    } else {
      roleText =
        "You are a professional, autonomous AI assistant focused on high-quality task execution.";
    }
  }

  // Extract rules, constraints, mission items, format, and error handling
  const missionItems: string[] = [];
  const ruleItems: string[] = [];
  const formatItems: string[] = [];
  const errorItems: string[] = [];
  const otherItems: string[] = [];

  const ruleKeywords =
    /^(?:always|never|do not|must|ensure|ne jamais|toujours|ne pas|obligatoire|strictement|rule\s*:|constraint\s*:)/i;
  const formatKeywords =
    /^(?:format|output|deliverable|markdown|json|table|bullet|structure|reponse en|sortie\s*:)/i;
  const errorKeywords =
    /^(?:if error|in case of|when missing|si erreur|en cas de|fallback|when unclear|si incertain)/i;
  const missionKeywords =
    /^(?:your mission|mission|goal|objective|help|summarize|analyze|create|manage|generate|tu dois|ton but|ton objectif)/i;
  const bulletCleanerRegex = /^(?:[-*•]|\d+\.)\s*/;

  for (const [i, line] of lines.entries()) {
    if (i === explicitRoleIndex) continue;

    const cleanLine = line.replace(bulletCleanerRegex, "").trim();
    if (!cleanLine) continue;

    if (ruleKeywords.test(cleanLine)) {
      ruleItems.push(cleanLine);
    } else if (formatKeywords.test(cleanLine)) {
      formatItems.push(cleanLine);
    } else if (errorKeywords.test(cleanLine)) {
      errorItems.push(cleanLine);
    } else if (missionKeywords.test(cleanLine)) {
      missionItems.push(cleanLine);
    } else {
      otherItems.push(cleanLine);
    }
  }

  // If mission is empty, distribute from otherItems or raw text
  if (missionItems.length === 0) {
    if (otherItems.length > 0) {
      missionItems.push(otherItems.shift()!);
    } else {
      missionItems.push(raw);
    }
  }

  // Remaining other items go to operational rules or mission
  for (const item of otherItems) {
    if (item.length > 80 || item.includes(".") || item.includes(":")) {
      ruleItems.push(item);
    } else {
      missionItems.push(item);
    }
  }

  // Ensure baseline defaults for empty sections
  if (ruleItems.length === 0) {
    ruleItems.push("Execute instructions methodically and maintain factual accuracy.");
    ruleItems.push(
      "Adhere strictly to the requested scope without hallucinating unverified information.",
    );
    ruleItems.push("Preserve context across interactions and prioritize user goals.");
  }

  if (formatItems.length === 0) {
    formatItems.push("Deliver clear, well-structured responses formatted with concise Markdown.");
    formatItems.push("Use bullet points and headings where appropriate for readability.");
  }

  if (errorItems.length === 0) {
    errorItems.push("If critical information is missing, ask targeted clarifying questions.");
    errorItems.push("State uncertainties explicitly rather than making unsupported assumptions.");
    errorItems.push(
      "If an error occurs, provide a transparent explanation and actionable fallback steps.",
    );
  }

  const compiledInstruction = [
    "# Role & Identity",
    roleText,
    "",
    "## Core Mission",
    missionItems.map((m) => `- ${m}`).join("\n"),
    "",
    "## Operational Rules & Constraints",
    ruleItems.map((r) => `- ${r}`).join("\n"),
    "",
    "## Output Format & Deliverables",
    formatItems.map((f) => `- ${f}`).join("\n"),
    "",
    "## Error Handling & Edge Cases",
    errorItems.map((e) => `- ${e}`).join("\n"),
  ].join("\n");

  const durationMs = Date.now() - startTime;
  // Estimate tokens (~4 chars per token)
  const promptTokens = Math.max(1, Math.round(raw.length / 4));
  const completionTokens = Math.max(1, Math.round(compiledInstruction.length / 4));

  const telemetry: PromptCacheTelemetry = {
    cachedTokens: 0,
    promptTokens,
    completionTokens,
    durationMs,
    cacheHitRatio: 0,
  };

  return {
    compiledInstruction,
    levelUsed: "level1_deterministic",
    explanation: "Compiled using Level 1 deterministic rule-based restructuring.",
    telemetry,
  };
}

/**
 * Strips reasoning thought tokens (<thought>...</thought>) and accidental markdown fences.
 */
export function extractThoughtTrace(content: string): {
  cleanContent: string;
  thoughtTrace?: string;
} {
  let thoughtTrace: string | undefined;
  const thoughtMatch = content.match(/<thought>([\s\S]*?)<\/thought>/i);
  if (thoughtMatch?.[1]) {
    thoughtTrace = thoughtMatch[1].trim();
  }

  let cleanContent = content.replace(/<thought>[\s\S]*?<\/thought>/gi, "").trim();

  // Strip wrapping markdown code fences if the model wrapped the entire prompt
  if (cleanContent.startsWith("```markdown") && cleanContent.endsWith("```")) {
    cleanContent = cleanContent.slice(11, -3).trim();
  } else if (cleanContent.startsWith("```") && cleanContent.endsWith("```")) {
    cleanContent = cleanContent.slice(3, -3).trim();
  }

  return { cleanContent, thoughtTrace };
}

/**
 * Creates an instance of PromptCompilerService.
 */
export function createPromptCompilerService(
  options: PromptCompilerOptions = {},
): PromptCompilerService {
  const baseUrl = (
    options.baseUrl ??
    process.env.OPENROUTER_BASE_URL ??
    "https://openrouter.ai/api/v1"
  ).replace(/\/+$/, "");
  const modelId =
    options.modelId ??
    process.env.PI_DEFAULT_MODEL ??
    process.env.OPENROUTER_MODEL ??
    DEFAULT_PROMPT_COMPILER_MODEL;
  const apiKey = options.apiKey ?? process.env.OPENROUTER_API_KEY ?? process.env.PI_MODEL_API_KEY;
  const fetchFn = options.fetchFn ?? fetch;
  const timeoutMs = options.timeoutMs ?? 15000;
  const appUrl = options.appUrl ?? "https://rakazo.app";
  const appName = options.appName ?? "Rakazo Prompt Compiler";

  const service: PromptCompilerService = {
    compileLevel1(input: PromptCompileInput): PromptCompileOutput {
      return compilePromptLevel1Deterministic(input);
    },

    async compileLevel2(input: PromptCompileInput): Promise<PromptCompileOutput> {
      const startTime = Date.now();

      // If no API key is available, gracefully fall back to Level 1
      if (!apiKey) {
        const fallback = compilePromptLevel1Deterministic(input);
        return {
          ...fallback,
          explanation:
            "OpenRouter API key not configured. Gracefully fell back to Level 1 deterministic compilation.",
        };
      }

      const systemDirective = [
        "<system_directive>",
        "You are Rakazo's Prompt Compiler Engine, specifically calibrated for OpenAI gpt-oss-120b.",
        "Your task is to transform messy, conversational, or draft user instructions into a crisp, hierarchical, production-grade system prompt.",
        "</system_directive>",
        "",
        "<operational_rules>",
        "1. Restructure the input into 5 mandatory hierarchical Markdown sections:",
        "   # Role & Identity",
        "   ## Core Mission",
        "   ## Operational Rules & Constraints",
        "   ## Output Format & Deliverables",
        "   ## Error Handling & Edge Cases",
        "2. Strict Zero-Chatter Directive: Output ONLY the compiled system prompt. Do NOT include conversational opening, greetings, preambles ('Here is your prompt:'), or postambles.",
        "3. Invariant Strict MCP Immutability: NEVER inject, modify, enable, or configure MCP tools or tool permissions. MCP tools are managed strictly by the user.",
        "4. If internal reasoning is necessary, encapsulate thinking strictly inside <thought>...</thought> tags.",
        "5. Preserve all domain constraints, business rules, and intentions from the raw draft without omission or hallucination.",
        "</operational_rules>",
      ].join("\n");

      const userPayload = [
        "<bot_context>",
        `<bot_name>${input.botName ?? "AI Assistant"}</bot_name>`,
        `<bot_title>${input.botTitle ?? ""}</bot_title>`,
        "</bot_context>",
        "",
        "<raw_user_draft>",
        input.rawInstruction,
        "</raw_user_draft>",
      ].join("\n");

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const response = await fetchFn(`${baseUrl}/chat/completions`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
            "HTTP-Referer": appUrl,
            "X-Title": appName,
          },
          body: JSON.stringify({
            model: modelId,
            temperature: 0.2,
            messages: [
              { role: "system", content: systemDirective },
              { role: "user", content: userPayload },
            ],
          }),
          signal: controller.signal,
        });

        if (!response.ok) {
          const errText = await response.text().catch(() => "");
          const sanitizedErrText = sanitizeToolError(errText.slice(0, 300));
          throw new Error(`OpenRouter HTTP ${response.status}: ${sanitizedErrText}`);
        }

        const data = (await response.json()) as {
          choices?: Array<{ message?: { content?: string } }>;
          usage?: {
            prompt_tokens?: number;
            completion_tokens?: number;
            total_tokens?: number;
            prompt_tokens_details?: { cached_tokens?: number };
            cached_tokens?: number;
          };
        };

        const rawContent = data.choices?.[0]?.message?.content;
        if (!rawContent || rawContent.trim().length === 0) {
          throw new Error("Received empty completion from OpenRouter");
        }

        const { cleanContent, thoughtTrace } = extractThoughtTrace(rawContent);
        const durationMs = Date.now() - startTime;

        const promptTokens =
          data.usage?.prompt_tokens ?? Math.max(1, Math.round(userPayload.length / 4));
        const completionTokens =
          data.usage?.completion_tokens ?? Math.max(1, Math.round(cleanContent.length / 4));
        const cachedTokens =
          data.usage?.prompt_tokens_details?.cached_tokens ?? data.usage?.cached_tokens ?? 0;
        const cacheHitRatio =
          promptTokens > 0 ? Math.min(1, Math.max(0, cachedTokens / promptTokens)) : 0;

        const telemetry: PromptCacheTelemetry = {
          cachedTokens,
          promptTokens,
          completionTokens,
          durationMs,
          cacheHitRatio,
        };

        const explanation = thoughtTrace
          ? `Compiled via ${modelId} with reasoning trace (${thoughtTrace.slice(0, 120)}...).`
          : `Compiled via ${modelId} via OpenRouter with prefix caching.`;

        return {
          compiledInstruction: cleanContent,
          levelUsed: "level2_llm",
          explanation,
          telemetry,
        };
      } catch (err: unknown) {
        const rawErrorMessage = err instanceof Error ? err.message : String(err);
        const errorMessage = sanitizeToolError(rawErrorMessage);
        const fallback = compilePromptLevel1Deterministic(input);
        const durationMs = Date.now() - startTime;

        return {
          ...fallback,
          explanation: `Level 2 compilation unavailable (${errorMessage}). Gracefully fell back to Level 1 deterministic compilation.`,
          telemetry: {
            ...fallback.telemetry,
            durationMs,
          },
        };
      } finally {
        clearTimeout(timeoutId);
      }
    },

    async compile(input: PromptCompileInput): Promise<PromptCompileOutput> {
      let targetLevel: PromptCompilationLevel;

      if (input.level) {
        targetLevel = input.level;
      } else {
        // Automatic routing logic:
        // Micro-tasks / concise drafts (<= 120 characters) -> Level 1 Deterministic Fast-Path
        // Complex or multi-line instructions (> 120 characters) -> Level 2 LLM Path
        const raw = input.rawInstruction.trim();
        const isShortOrSingleLine = raw.length <= 120 && !raw.includes("\n\n");
        targetLevel = isShortOrSingleLine ? "level1_deterministic" : "level2_llm";
      }

      if (targetLevel === "level1_deterministic") {
        return service.compileLevel1(input);
      }

      return service.compileLevel2(input);
    },
  };

  return service;
}
