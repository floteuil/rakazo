import * as z from "zod";

/**
 * Prompt Compilation Levels:
 * - `level1_deterministic`: Rule-based semantic restructuring for fast micro-agents and offline fallback.
 * - `level2_llm`: Calibrated LLM compilation (gpt-oss-120b) with XML tags, thought extraction, and prefix caching.
 */
export const PromptCompilationLevelSchema = z.enum(["level1_deterministic", "level2_llm"]);
export type PromptCompilationLevel = z.infer<typeof PromptCompilationLevelSchema>;

/**
 * Telemetry details captured during prompt compilation (especially OpenRouter KV cache metrics).
 */
export const PromptCacheTelemetrySchema = z.object({
  cachedTokens: z.number().int().nonnegative().optional(),
  promptTokens: z.number().int().nonnegative().optional(),
  completionTokens: z.number().int().nonnegative().optional(),
  durationMs: z.number().int().nonnegative().optional(),
  cacheHitRatio: z.number().min(0).max(1).optional(),
});
export type PromptCacheTelemetry = z.infer<typeof PromptCacheTelemetrySchema>;

/**
 * Input schema for prompt compilation.
 * Invariant: `existingMetadata` is strictly read-only for context. MCP configs/permissions are never modified.
 */
export const PromptCompileInputSchema = z.object({
  rawInstruction: z
    .string()
    .min(1, "rawInstruction must not be empty")
    .max(20000, "rawInstruction must not exceed 20000 characters"),
  botName: z.string().max(80).optional(),
  botTitle: z.string().max(160).optional(),
  level: PromptCompilationLevelSchema.optional(),
  existingMetadata: z.record(z.string(), z.unknown()).optional(),
});
export type PromptCompileInput = z.infer<typeof PromptCompileInputSchema>;

/**
 * Output schema for prompt compilation.
 * Contains the compiled instruction, compilation level used, explanation, and telemetry.
 */
export const PromptCompileOutputSchema = z.object({
  compiledInstruction: z.string().min(1, "compiledInstruction must not be empty"),
  levelUsed: PromptCompilationLevelSchema,
  explanation: z.string().optional(),
  telemetry: PromptCacheTelemetrySchema.optional(),
});
export type PromptCompileOutput = z.infer<typeof PromptCompileOutputSchema>;

/**
 * Constant model default for Prompt Compiler Level 2.
 */
export const DEFAULT_PROMPT_COMPILER_MODEL = "openai/gpt-oss-120b";

/**
 * Contract invariant verification helper:
 * Verifies that the prompt compile output does not modify or introduce MCP tool configs.
 */
export function verifyMcpImmutabilityAtContractLevel(
  _input: PromptCompileInput,
  output: PromptCompileOutput,
): { isMcpUntouched: boolean; mcpFieldsInOutput: string[] } {
  const forbiddenMcpFields = ["mcp", "mcpConfig", "connectors", "tools", "activeMcpTools"];
  const outObj = output as unknown as Record<string, unknown>;
  const foundFields = forbiddenMcpFields.filter((key) => key in outObj);

  return {
    isMcpUntouched: foundFields.length === 0,
    mcpFieldsInOutput: foundFields,
  };
}
