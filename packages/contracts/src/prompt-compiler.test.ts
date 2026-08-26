import { describe, expect, it } from "vitest";
import {
  appContract,
  DEFAULT_PROMPT_COMPILER_MODEL,
  PromptCacheTelemetrySchema,
  PromptCompilationLevelSchema,
  PromptCompileInputSchema,
  PromptCompileOutputSchema,
} from "./index.js";

describe("Prompt Compiler Contracts", () => {
  describe("PromptCompilationLevelSchema", () => {
    it("accepts valid compilation levels", () => {
      expect(PromptCompilationLevelSchema.parse("level1_deterministic")).toBe("level1_deterministic");
      expect(PromptCompilationLevelSchema.parse("level2_llm")).toBe("level2_llm");
    });

    it("rejects invalid compilation levels", () => {
      expect(() => PromptCompilationLevelSchema.parse("level3_custom")).toThrow();
      expect(() => PromptCompilationLevelSchema.parse("deterministic")).toThrow();
      expect(() => PromptCompilationLevelSchema.parse("")).toThrow();
    });
  });

  describe("PromptCacheTelemetrySchema", () => {
    it("accepts valid telemetry objects with cache metrics", () => {
      const parsed = PromptCacheTelemetrySchema.parse({
        cachedTokens: 1024,
        promptTokens: 2048,
        completionTokens: 256,
        durationMs: 450,
        cacheHitRatio: 0.5,
      });
      expect(parsed.cachedTokens).toBe(1024);
      expect(parsed.promptTokens).toBe(2048);
      expect(parsed.cacheHitRatio).toBe(0.5);
    });

    it("allows optional fields and empty object", () => {
      const parsed = PromptCacheTelemetrySchema.parse({});
      expect(parsed).toEqual({});
    });

    it("enforces cacheHitRatio to be between 0 and 1", () => {
      expect(PromptCacheTelemetrySchema.parse({ cacheHitRatio: 0 }).cacheHitRatio).toBe(0);
      expect(PromptCacheTelemetrySchema.parse({ cacheHitRatio: 1 }).cacheHitRatio).toBe(1);
      expect(() => PromptCacheTelemetrySchema.parse({ cacheHitRatio: 1.5 })).toThrow();
      expect(() => PromptCacheTelemetrySchema.parse({ cacheHitRatio: -0.1 })).toThrow();
    });

    it("rejects negative token counts", () => {
      expect(() => PromptCacheTelemetrySchema.parse({ cachedTokens: -10 })).toThrow();
      expect(() => PromptCacheTelemetrySchema.parse({ promptTokens: -1 })).toThrow();
      expect(() => PromptCacheTelemetrySchema.parse({ completionTokens: -5 })).toThrow();
      expect(() => PromptCacheTelemetrySchema.parse({ durationMs: -100 })).toThrow();
    });
  });

  describe("PromptCompileInputSchema", () => {
    it("parses minimal valid input", () => {
      const parsed = PromptCompileInputSchema.parse({
        rawInstruction: "You are a customer support agent. Help users with billing issues.",
      });
      expect(parsed.rawInstruction).toBe("You are a customer support agent. Help users with billing issues.");
      expect(parsed.botName).toBeUndefined();
      expect(parsed.level).toBeUndefined();
    });

    it("parses comprehensive input with metadata and level", () => {
      const parsed = PromptCompileInputSchema.parse({
        rawInstruction: "Fais des résumés de mails professionnels.",
        botName: "email-summarizer",
        botTitle: "Email Summarizer Assistant",
        level: "level2_llm",
        existingMetadata: {
          mcp: { tools: ["web_search", "web_scrape"] },
          category: "productivity",
        },
      });
      expect(parsed.botName).toBe("email-summarizer");
      expect(parsed.botTitle).toBe("Email Summarizer Assistant");
      expect(parsed.level).toBe("level2_llm");
      expect(parsed.existingMetadata).toBeDefined();
    });

    it("rejects empty rawInstruction", () => {
      expect(() => PromptCompileInputSchema.parse({ rawInstruction: "" })).toThrow();
    });

    it("enforces character length limits", () => {
      const maxInstruction = "a".repeat(20000);
      expect(PromptCompileInputSchema.parse({ rawInstruction: maxInstruction }).rawInstruction).toHaveLength(20000);

      const overflowInstruction = "a".repeat(20001);
      expect(() => PromptCompileInputSchema.parse({ rawInstruction: overflowInstruction })).toThrow();

      const overflowName = "b".repeat(81);
      expect(() => PromptCompileInputSchema.parse({ rawInstruction: "test", botName: overflowName })).toThrow();

      const overflowTitle = "c".repeat(161);
      expect(() => PromptCompileInputSchema.parse({ rawInstruction: "test", botTitle: overflowTitle })).toThrow();
    });
  });

  describe("PromptCompileOutputSchema", () => {
    it("parses valid compile output", () => {
      const parsed = PromptCompileOutputSchema.parse({
        compiledInstruction: "# Role & Identity\nYou are a professional assistant.\n\n## Core Mission\nAssist users.",
        levelUsed: "level1_deterministic",
        explanation: "Compiled using Level 1 deterministic rule-based restructuring.",
        telemetry: {
          cachedTokens: 0,
          promptTokens: 120,
          completionTokens: 80,
          durationMs: 5,
          cacheHitRatio: 0,
        },
      });
      expect(parsed.compiledInstruction).toContain("# Role & Identity");
      expect(parsed.levelUsed).toBe("level1_deterministic");
      expect(parsed.telemetry?.durationMs).toBe(5);
    });

    it("rejects empty compiledInstruction or missing levelUsed", () => {
      expect(() =>
        PromptCompileOutputSchema.parse({
          compiledInstruction: "",
          levelUsed: "level1_deterministic",
        }),
      ).toThrow();

      expect(() =>
        PromptCompileOutputSchema.parse({
          compiledInstruction: "Some prompt",
        }),
      ).toThrow();
    });
  });

  describe("RPC & Default Exports", () => {
    it("registers prompts.compile in appContract", () => {
      expect(appContract.prompts).toBeDefined();
      expect(appContract.prompts.compile).toBeDefined();
    });

    it("exposes DEFAULT_PROMPT_COMPILER_MODEL as gpt-oss-120b", () => {
      expect(DEFAULT_PROMPT_COMPILER_MODEL).toBe("openai/gpt-oss-120b");
    });
  });
});
