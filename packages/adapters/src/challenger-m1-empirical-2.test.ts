import { describe, expect, it, vi } from "vitest";
import {
  PromptCacheTelemetrySchema,
  PromptCompileInputSchema,
  PromptCompileOutputSchema,
  verifyMcpImmutabilityAtContractLevel,
} from "@rakazo/contracts";
import {
  compilePromptLevel1Deterministic,
  createPromptCompilerService,
  extractThoughtTrace,
} from "./prompt-compiler.js";

describe("Challenger 2 Empirical Verification Suite for Milestone 1", () => {
  describe("1. Security & Zero Secret Leak in Production Service (createPromptCompilerService)", () => {
    it("1.1 does NOT leak Authorization Bearer token or OpenRouter sk-or key in explanation when fetchFn rejects", async () => {
      const mockFetch = vi.fn().mockRejectedValue(
        new Error("HTTP 401 Unauthorized: Authorization: Bearer sk-or-v1-secret-key-1234567890abcdef and ghp_MYGITHUBSECRET"),
      );

      const service = createPromptCompilerService({
        apiKey: "sk-or-v1-secret-key-1234567890abcdef",
        fetchFn: mockFetch as unknown as typeof fetch,
      });

      const output = await service.compileLevel2({
        rawInstruction: "Create a support bot for e-commerce.",
      });

      expect(output.levelUsed).toBe("level1_deterministic");
      expect(output.explanation).toBeDefined();

      // Check for leaks in output explanation
      const explanation = output.explanation || "";
      const hasSecretKeyLeak = explanation.includes("sk-or-v1-secret-key-1234567890abcdef");
      const hasGithubSecretLeak = explanation.includes("ghp_MYGITHUBSECRET");
      const hasBearerLeak = /Bearer\s+sk-or/i.test(explanation);

      expect(hasSecretKeyLeak).toBe(false);
      expect(hasGithubSecretLeak).toBe(false);
      expect(hasBearerLeak).toBe(false);
    });

    it("1.2 does NOT leak secrets when OpenRouter returns non-ok status with secret in response text", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        text: async () => "Invalid token sk-or-v1-abcdef9876543210 for account ntn_1234567890",
      });

      const service = createPromptCompilerService({
        apiKey: "sk-or-v1-abcdef9876543210",
        fetchFn: mockFetch as unknown as typeof fetch,
      });

      const output = await service.compileLevel2({
        rawInstruction: "Test instructions",
      });

      const explanation = output.explanation || "";
      expect(explanation).not.toContain("sk-or-v1-abcdef9876543210");
      expect(explanation).not.toContain("ntn_1234567890");
    });
  });

  describe("2. Telemetry Calculation & Defense", () => {
    it("2.1 handles zero prompt tokens without division by zero (NaN/Infinity)", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: "# Role\nAssistant" } }],
          usage: {
            prompt_tokens: 0,
            completion_tokens: 10,
            total_tokens: 10,
            prompt_tokens_details: { cached_tokens: 0 },
          },
        }),
      });

      const service = createPromptCompilerService({
        apiKey: "sk-or-test",
        fetchFn: mockFetch as unknown as typeof fetch,
      });

      const output = await service.compileLevel2({
        rawInstruction: "Short task",
      });

      expect(output.telemetry?.cacheHitRatio).toBeDefined();
      expect(Number.isFinite(output.telemetry?.cacheHitRatio)).toBe(true);
      expect(output.telemetry?.cacheHitRatio).toBeGreaterThanOrEqual(0);
      expect(output.telemetry?.cacheHitRatio).toBeLessThanOrEqual(1);
    });

    it("2.2 clamps cacheHitRatio strictly within [0, 1] even if cached_tokens > prompt_tokens", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: "# Role\nAssistant" } }],
          usage: {
            prompt_tokens: 100,
            completion_tokens: 50,
            prompt_tokens_details: { cached_tokens: 500 }, // Abnormal anomaly
          },
        }),
      });

      const service = createPromptCompilerService({
        apiKey: "sk-or-test",
        fetchFn: mockFetch as unknown as typeof fetch,
      });

      const output = await service.compileLevel2({
        rawInstruction: "Test cache anomaly",
      });

      expect(output.telemetry?.cacheHitRatio).toBeLessThanOrEqual(1.0);
      expect(output.telemetry?.cacheHitRatio).toBeGreaterThanOrEqual(0.0);
    });

    it("2.3 conforms to PromptCompileOutputSchema validation", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: "# Role & Identity\nBot" } }],
          usage: {
            prompt_tokens: 200,
            completion_tokens: 80,
            prompt_tokens_details: { cached_tokens: 150 },
          },
        }),
      });

      const service = createPromptCompilerService({
        apiKey: "sk-or-test",
        fetchFn: mockFetch as unknown as typeof fetch,
      });

      const output = await service.compileLevel2({
        rawInstruction: "Verify schema conformance",
      });

      expect(() => PromptCompileOutputSchema.parse(output)).not.toThrow();
    });
  });

  describe("3. Thought Token Extraction (<thought>...</thought>)", () => {
    it("3.1 extracts multiple <thought> tags without leaving residual tags in cleanContent", () => {
      const multiThought =
        "<thought>First reasoning step</thought>\n# Role & Identity\nYou are an agent.\n<thought>Second reasoning step</thought>\n## Core Mission\nHelp users.";

      const { cleanContent, thoughtTrace } = extractThoughtTrace(multiThought);

      expect(cleanContent).not.toContain("<thought>");
      expect(cleanContent).not.toContain("</thought>");
      expect(cleanContent).toContain("# Role & Identity");
      expect(cleanContent).toContain("## Core Mission");
      expect(thoughtTrace).toBe("First reasoning step");
    });

    it("3.2 handles case-insensitive tags (<THOUGHT>, <Thought>, </THOUGHT>)", () => {
      const caseThought =
        "<THOUGHT>\nReasoning in uppercase...\n</THOUGHT>\n# Role & Identity\nAssistant";

      const { cleanContent, thoughtTrace } = extractThoughtTrace(caseThought);

      expect(cleanContent).not.toContain("<THOUGHT>");
      expect(cleanContent).not.toContain("</THOUGHT>");
      expect(cleanContent).toBe("# Role & Identity\nAssistant");
      expect(thoughtTrace).toBe("Reasoning in uppercase...");
    });

    it("3.3 strips markdown fences around prompt when model outputs ```markdown ... ```", () => {
      const fenced =
        "<thought>Plan</thought>\n```markdown\n# Role & Identity\nAgent\n```";

      const { cleanContent } = extractThoughtTrace(fenced);
      expect(cleanContent).toBe("# Role & Identity\nAgent");
    });
  });

  describe("4. MCP Immutability Invariant", () => {
    it("4.1 ensures existing metadata with MCP permissions is untouched and excluded from output", async () => {
      const input = {
        rawInstruction: "Do some analysis",
        botName: "analyst-bot",
        existingMetadata: {
          mcp: {
            connectors: { github: true, notion: false },
            tools: { run_command: true },
          },
        },
      };

      const service = createPromptCompilerService();
      const output = await service.compile(input);

      const check = verifyMcpImmutabilityAtContractLevel(input, output);
      expect(check.isMcpUntouched).toBe(true);
      expect(check.mcpFieldsInOutput).toHaveLength(0);
    });
  });
});
