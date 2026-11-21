import { type PromptCompileInput, verifyMcpImmutabilityAtContractLevel } from "@rakazo/contracts";
import { describe, expect, it, vi } from "vitest";
import {
  compilePromptLevel1Deterministic,
  createPromptCompilerService,
  extractThoughtTrace,
} from "./prompt-compiler.js";

describe("PromptCompilerService (@rakazo/adapters)", () => {
  describe("extractThoughtTrace", () => {
    it("extracts thought tokens and returns clean content", () => {
      const raw =
        "<thought>\nAnalyzing user request...\nFocus on customer satisfaction.\n</thought>\n# Role & Identity\nYou are a support agent.";
      const { cleanContent, thoughtTrace } = extractThoughtTrace(raw);

      expect(thoughtTrace).toBe("Analyzing user request...\nFocus on customer satisfaction.");
      expect(cleanContent).toBe("# Role & Identity\nYou are a support agent.");
      expect(cleanContent).not.toContain("<thought>");
      expect(cleanContent).not.toContain("</thought>");
    });

    it("returns undefined thoughtTrace when no thought tags are present", () => {
      const raw = "# Role & Identity\nYou are a helpful assistant.";
      const { cleanContent, thoughtTrace } = extractThoughtTrace(raw);

      expect(thoughtTrace).toBeUndefined();
      expect(cleanContent).toBe(raw);
    });

    it("strips wrapping markdown codeblocks if returned by model", () => {
      const raw = "```markdown\n# Role & Identity\nYou are an agent.\n```";
      const { cleanContent } = extractThoughtTrace(raw);

      expect(cleanContent).toBe("# Role & Identity\nYou are an agent.");
    });
  });

  describe("Level 1 Deterministic Fast-Path (compileLevel1)", () => {
    it("restructures raw instruction into 5 mandatory hierarchical sections", () => {
      const input: PromptCompileInput = {
        rawInstruction: "Help users manage their calendar appointments and reply promptly.",
        botName: "calendar-bot",
        botTitle: "Calendar Scheduler Assistant",
      };

      const result = compilePromptLevel1Deterministic(input);

      expect(result.levelUsed).toBe("level1_deterministic");
      expect(result.compiledInstruction).toContain("# Role & Identity");
      expect(result.compiledInstruction).toContain("## Core Mission");
      expect(result.compiledInstruction).toContain("## Operational Rules & Constraints");
      expect(result.compiledInstruction).toContain("## Output Format & Deliverables");
      expect(result.compiledInstruction).toContain("## Error Handling & Edge Cases");

      expect(result.compiledInstruction).toContain("Calendar Scheduler Assistant");
      expect(result.compiledInstruction).toContain("Help users manage their calendar appointments");

      expect(result.telemetry).toBeDefined();
      expect(result.telemetry?.cachedTokens).toBe(0);
      expect(result.telemetry?.cacheHitRatio).toBe(0);
      expect(result.telemetry?.promptTokens).toBeGreaterThan(0);
      expect(result.telemetry?.completionTokens).toBeGreaterThan(0);
    });

    it("extracts explicit role, rules, format and error handling from multi-line text", () => {
      const input: PromptCompileInput = {
        rawInstruction: [
          "You are a Senior Python Architect.",
          "Mission: Review PRs and suggest performance improvements.",
          "Always verify typing with mypy strict.",
          "Never approve code with SQL injection vulnerabilities.",
          "Format: Output code diffs in unified diff format.",
          "If missing requirements, ask for clarifying specifications.",
        ].join("\n"),
      };

      const result = compilePromptLevel1Deterministic(input);

      expect(result.compiledInstruction).toContain("Senior Python Architect");
      expect(result.compiledInstruction).toContain(
        "Review PRs and suggest performance improvements",
      );
      expect(result.compiledInstruction).toContain("Always verify typing with mypy strict");
      expect(result.compiledInstruction).toContain(
        "Never approve code with SQL injection vulnerabilities",
      );
      expect(result.compiledInstruction).toContain("Output code diffs in unified diff format");
      expect(result.compiledInstruction).toContain(
        "If missing requirements, ask for clarifying specifications",
      );
    });

    it("handles French instructions and formats cleanly", () => {
      const input: PromptCompileInput = {
        rawInstruction:
          "Tu es un expert comptable. Analyse les factures et ne jamais divulguer les données bancaires.",
        botName: "expert-comptable",
      };

      const result = compilePromptLevel1Deterministic(input);
      expect(result.compiledInstruction).toContain("expert comptable");
      expect(result.compiledInstruction).toContain("ne jamais divulguer les données bancaires");
    });

    it("is completely deterministic with 0 network calls", () => {
      const input: PromptCompileInput = {
        rawInstruction: "Quick micro-agent task: format this CSV to JSON.",
      };

      const result1 = compilePromptLevel1Deterministic(input);
      const result2 = compilePromptLevel1Deterministic(input);

      expect(result1.compiledInstruction).toBe(result2.compiledInstruction);
      expect(result1.levelUsed).toBe(result2.levelUsed);
    });
  });

  describe("Level 2 LLM Path (compileLevel2)", () => {
    it("calls OpenRouter API with gpt-oss-120b and extracts telemetry and thought tokens", async () => {
      const mockCompletion = {
        choices: [
          {
            message: {
              content:
                "<thought>\nStructuring prompt for e-commerce bot.\nApplying strict constraints.\n</thought>\n# Role & Identity\nYou are an E-commerce Support Bot.\n\n## Core Mission\nAssist customers with order tracking.",
            },
          },
        ],
        usage: {
          prompt_tokens: 500,
          completion_tokens: 150,
          total_tokens: 650,
          prompt_tokens_details: {
            cached_tokens: 250,
          },
        },
      };

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockCompletion,
      });

      const service = createPromptCompilerService({
        apiKey: "sk-or-v1-mock-key",
        fetchFn: mockFetch as unknown as typeof fetch,
      });

      const input: PromptCompileInput = {
        rawInstruction:
          "You are a customer support agent for our store. Help users track their packages.",
        botName: "support-bot",
        botTitle: "E-Commerce Support",
        level: "level2_llm",
      };

      const result = await service.compileLevel2(input);

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const call = mockFetch.mock.calls[0]!;
      const [url, init] = call;
      expect(url).toBe("https://openrouter.ai/api/v1/chat/completions");
      expect(init.headers["Authorization"]).toBe("Bearer sk-or-v1-mock-key");

      const body = JSON.parse(init.body);
      expect(body.model).toBe("openai/gpt-oss-120b");
      expect(body.messages[0].role).toBe("system");
      expect(body.messages[0].content).toContain("<system_directive>");
      expect(body.messages[1].role).toBe("user");
      expect(body.messages[1].content).toContain("<raw_user_draft>");

      expect(result.levelUsed).toBe("level2_llm");
      expect(result.compiledInstruction).toContain("# Role & Identity");
      expect(result.compiledInstruction).not.toContain("<thought>");
      expect(result.explanation).toContain("Structuring prompt for e-commerce bot");

      expect(result.telemetry?.promptTokens).toBe(500);
      expect(result.telemetry?.completionTokens).toBe(150);
      expect(result.telemetry?.cachedTokens).toBe(250);
      expect(result.telemetry?.cacheHitRatio).toBe(0.5);
    });

    it("falls back to Level 1 when API key is missing", async () => {
      const service = createPromptCompilerService({
        apiKey: undefined,
      });

      const input: PromptCompileInput = {
        rawInstruction: "Create a blog writer bot that writes tech articles.",
        level: "level2_llm",
      };

      const result = await service.compileLevel2(input);

      expect(result.levelUsed).toBe("level1_deterministic");
      expect(result.explanation).toContain("OpenRouter API key not configured");
      expect(result.compiledInstruction).toContain("# Role & Identity");
    });

    it("falls back to Level 1 on OpenRouter HTTP error (500 / 429)", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        text: async () => "Internal Server Error from upstream provider",
      });

      const service = createPromptCompilerService({
        apiKey: "sk-or-v1-mock-key",
        fetchFn: mockFetch as unknown as typeof fetch,
      });

      const input: PromptCompileInput = {
        rawInstruction: "Analyze stock market trends and provide daily reports.",
        level: "level2_llm",
      };

      const result = await service.compileLevel2(input);

      expect(result.levelUsed).toBe("level1_deterministic");
      expect(result.explanation).toContain("Level 2 compilation unavailable");
      expect(result.explanation).toContain("HTTP 500");
      expect(result.compiledInstruction).toContain("# Role & Identity");
      expect(result.compiledInstruction).toContain("Analyze stock market trends");
    });

    it("falls back to Level 1 on network failure / exception", async () => {
      const mockFetch = vi.fn().mockRejectedValue(new Error("Network connection reset"));

      const service = createPromptCompilerService({
        apiKey: "sk-or-v1-mock-key",
        fetchFn: mockFetch as unknown as typeof fetch,
      });

      const input: PromptCompileInput = {
        rawInstruction: "Draft email responses to prospective clients.",
        level: "level2_llm",
      };

      const result = await service.compileLevel2(input);

      expect(result.levelUsed).toBe("level1_deterministic");
      expect(result.explanation).toContain("Network connection reset");
      expect(result.compiledInstruction).toContain("# Role & Identity");
    });
  });

  describe("Automatic Level Routing (compile)", () => {
    it("routes short micro-tasks (<= 120 chars) to Level 1 deterministic", async () => {
      const service = createPromptCompilerService({
        apiKey: "sk-or-v1-mock-key",
      });

      const input: PromptCompileInput = {
        rawInstruction: "Extract email addresses from text and return a JSON list.",
      };

      const result = await service.compile(input);
      expect(result.levelUsed).toBe("level1_deterministic");
    });

    it("routes long or complex instructions (> 120 chars) to Level 2 LLM", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content:
                  "# Role & Identity\nYou are an enterprise code reviewer.\n\n## Core Mission\nAudit code for security.",
              },
            },
          ],
          usage: { prompt_tokens: 300, completion_tokens: 100 },
        }),
      });

      const service = createPromptCompilerService({
        apiKey: "sk-or-v1-mock-key",
        fetchFn: mockFetch as unknown as typeof fetch,
      });

      const longInstruction =
        "You are an enterprise code reviewer. Audit repository PRs for security vulnerabilities, race conditions, memory leaks, and adherence to clean code principles. Suggest targeted patches in unified diff format with thorough explanations.";

      const input: PromptCompileInput = {
        rawInstruction: longInstruction,
      };

      const result = await service.compile(input);
      expect(result.levelUsed).toBe("level2_llm");
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it("respects explicit level parameter overriding heuristic", async () => {
      const service = createPromptCompilerService({
        apiKey: "sk-or-v1-mock-key",
      });

      const input: PromptCompileInput = {
        rawInstruction:
          "A very long detailed instruction that would normally trigger Level 2 LLM routing because it exceeds one hundred and twenty characters in length.",
        level: "level1_deterministic",
      };

      const result = await service.compile(input);
      expect(result.levelUsed).toBe("level1_deterministic");
    });
  });

  describe("Invariant Strict MCP Immutability (F1.3)", () => {
    it("never mutates, adds, or returns MCP configuration or tool permissions", async () => {
      const inputWithMcp: PromptCompileInput = {
        rawInstruction: "Search the web for news and summarize.",
        botName: "news-agent",
        existingMetadata: {
          mcp: {
            activeMcpTools: ["web_search", "web_scrape", "github_search"],
            permissions: { allowTerminal: false },
          },
          connectors: ["custom_mcp_1"],
        },
      };

      const service = createPromptCompilerService();
      const output = await service.compile(inputWithMcp);

      // Verify contract helper
      const mcpVerification = verifyMcpImmutabilityAtContractLevel(inputWithMcp, output);
      expect(mcpVerification.isMcpUntouched).toBe(true);
      expect(mcpVerification.mcpFieldsInOutput).toHaveLength(0);

      // Output object must only contain compiledInstruction, levelUsed, explanation, telemetry
      const outputKeys = Object.keys(output);
      expect(outputKeys).not.toContain("mcp");
      expect(outputKeys).not.toContain("mcpConfig");
      expect(outputKeys).not.toContain("connectors");
      expect(outputKeys).not.toContain("tools");

      // Verify existingMetadata was not mutated
      expect(
        (inputWithMcp.existingMetadata?.mcp as Record<string, unknown>).activeMcpTools,
      ).toEqual(["web_search", "web_scrape", "github_search"]);
    });
  });
});
