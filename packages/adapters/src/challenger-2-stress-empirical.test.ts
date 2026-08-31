import { describe, expect, it, vi } from "vitest";
import {
  APPROVED_FREE_PROVIDERS,
  AVOIDED_PROVIDERS,
  FREE_INFERENCE_UNAVAILABLE_MESSAGE,
  RakazoFreePolicyEngine,
  resolveDeterministicTag,
  VALID_TAGS,
} from "./free-policy-engine.js";
import { FreeOmniRouteAdapter } from "./omniroute-adapter.js";
import { OmniRouteInferenceTransport } from "./omniroute-transport.js";
import { computeSessionAffinityKey } from "./prefix-caching.js";
import {
  DELEGATION_NAMES_SET,
  SUBAGENT_DELEGATION_TOOL_NAMES,
  SUBAGENT_MAX_DEPTH,
  SUBAGENT_TOKEN_BUDGET_CEILING,
  SubagentExecutor,
} from "./subagent-inheritance.js";

describe("Challenger 2 Empirical Stress-Testing Suite", () => {
  // ============================================================================
  // AXIS 1: DYNAMIC FAILOVER SIMULATION & METADATA OBSERVABILITY
  // ============================================================================
  describe("Axis 1: Dynamic Failover Simulation & Metadata Resilience", () => {
    it("1.1 Simulates primary provider outage (503 Service Unavailable) -> Secondary resolution -> Smooth turn metadata", async () => {
      let callCount = 0;
      const originalFetch = globalThis.fetch;

      // Mock fetch simulating failover:
      // Turn 1 fails on primary provider (HTTP 503)
      // Gateway / Client fallback succeeds on secondary provider (Groq / LLaMA-3.3-70B)
      globalThis.fetch = vi.fn().mockImplementation(async (url, init) => {
        callCount++;
        if (callCount === 1) {
          // Primary provider error
          return new Response(JSON.stringify({ error: "Primary provider mistralai overloaded" }), {
            status: 503,
            headers: {
              "Content-Type": "application/json",
            },
          });
        }

        // Secondary provider fallback resolution
        const sseStream = [
          `data: ${JSON.stringify({
            choices: [{ delta: { content: "Fallback response resolved via secondary provider." } }],
          })}\n\n`,
          `data: ${JSON.stringify({
            usage: {
              prompt_tokens: 150,
              completion_tokens: 45,
              total_tokens: 195,
              cached_tokens: 120,
            },
          })}\n\n`,
          "data: [DONE]\n\n",
        ].join("");

        return new Response(sseStream, {
          status: 200,
          headers: {
            "Content-Type": "text/event-stream",
            "x-omniroute-cost": "0.000000",
            "x-omniroute-provider": "qwen",
            "x-omniroute-model": "qwen-2.5-coder-32b-instruct",
            "x-omniroute-latency-ms": "240",
            "x-omniroute-session-id": "session-12345",
          },
        });
      }) as any;

      try {
        const transport = new OmniRouteInferenceTransport({
          baseUrl: "http://mock-omniroute:8080/v1",
          defaultModel: "combo/rakazo-coding",
        });

        // Call 1 fails fail-closed on 503
        const chunksCall1: any[] = [];
        await expect(async () => {
          for await (const chunk of transport.stream({
            model: "combo/rakazo-coding",
            messages: [{ role: "user", content: "Write a quicksort in Rust" }],
          })) {
            chunksCall1.push(chunk);
          }
        }).rejects.toThrow(FREE_INFERENCE_UNAVAILABLE_MESSAGE);

        // Call 2 executes secondary provider fallback
        const chunksCall2: any[] = [];
        for await (const chunk of transport.stream({
          model: "combo/rakazo-coding",
          messages: [{ role: "user", content: "Write a quicksort in Rust" }],
        })) {
          chunksCall2.push(chunk);
        }

        expect(chunksCall2.length).toBeGreaterThanOrEqual(2);
        const textChunk = chunksCall2.find((c) => c.type === "text");
        expect(textChunk?.text).toContain("Fallback response resolved via secondary provider.");

        const usageChunk = chunksCall2.find((c) => c.type === "usage");
        expect(usageChunk?.usage).toBeDefined();
        expect(usageChunk.usage.inputTokens).toBe(150);
        expect(usageChunk.usage.outputTokens).toBe(45);
        expect(usageChunk.usage.cachedTokens).toBe(120);
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it("1.2 Guarantees FNV-1a session affinity key is provider-independent across failover", () => {
      const sessionKey1 = computeSessionAffinityKey({
        workspaceId: "ws-enterprise-01",
        botId: "bot-coding-01",
        threadId: "thread-failover-test",
      });

      const sessionKey2 = computeSessionAffinityKey({
        workspaceId: "ws-enterprise-01",
        botId: "bot-coding-01",
        threadId: "thread-failover-test",
      });

      // Pure deterministic identity without provider pollution
      expect(sessionKey1).toBe(sessionKey2);
      expect(typeof sessionKey1).toBe("string");
      expect(sessionKey1.length).toBeGreaterThan(0);
      expect(sessionKey1).not.toContain("mistralai");
      expect(sessionKey1).not.toContain("groq");
      expect(sessionKey1).not.toContain("qwen");
    });
  });

  // ============================================================================
  // AXIS 2: SUBAGENT RECURSION, TOKEN CEILING & DELEGATION TOOL STRIPPING
  // ============================================================================
  describe("Axis 2: Subagent Confinement & Invariants", () => {
    const subagentExecutor = new SubagentExecutor();

    it("2.1 Strictly allows depth 1 spawn but blocks depth 2 recursion with explicit error", () => {
      // Depth 0 parent -> Depth 1 child (ALLOWED)
      const childContext = subagentExecutor.spawnSubagent({
        parentBot: {
          id: "parent-bot-01",
          name: "Parent Root Bot",
          inferenceMode: "free",
          depth: 0,
        },
        taskPrompt: "Summarize codebase architecture",
      });

      expect(childContext.parentBotId).toBe("parent-bot-01");
      expect(childContext.maxDepth).toBe(1);
      expect(childContext.maxTokens).toBe(8192);

      // Depth 1 child trying to spawn depth 2 grandchild (BLOCKED FAIL-CLOSED)
      expect(() => {
        subagentExecutor.spawnSubagent({
          parentBot: {
            id: childContext.botId,
            name: "Child Subagent",
            inferenceMode: "free",
            depth: 1, // Depth is already 1!
          },
          taskPrompt: "Try to spawn grandchild",
        });
      }).toThrow(/Subagent recursion depth 2 exceeds maximum allowed depth 1/i);
    });

    it("2.2 Strictly enforces 8,192 token ceiling on subagents", () => {
      expect(() => subagentExecutor.validateTokenBudget(0)).not.toThrow();
      expect(() => subagentExecutor.validateTokenBudget(4096)).not.toThrow();
      expect(() => subagentExecutor.validateTokenBudget(8192)).not.toThrow();

      // 8,193 tokens (1 token over ceiling) must throw
      expect(() => subagentExecutor.validateTokenBudget(8193)).toThrow(
        /Subagent token budget exceeded: 8193 tokens > 8192 limit/i,
      );

      // Extreme bloated prompt must throw
      expect(() => subagentExecutor.validateTokenBudget(100000)).toThrow(
        /Subagent token budget exceeded: 100000 tokens > 8192 limit/i,
      );
    });

    it("2.3 Strictly strips ALL 8 delegation tools from subagents", () => {
      const allDelegationTools = [
        "web_search",
        "web_scrape",
        "spawn_subagent",
        "delegate_task",
        "child_bot_spawn",
        "create_child_agent",
        "run_subagent",
        "spawn_bot",
        "archive_bot",
        "delete_bot",
        "bash_exec",
      ];

      const childContext = subagentExecutor.spawnSubagent({
        parentBot: {
          id: "parent-all-tools",
          name: "Parent With All Tools",
          inferenceMode: "free",
          tools: allDelegationTools,
          depth: 0,
        },
        taskPrompt: "Execute search only",
      });

      // Allowed safe tools remain
      expect(childContext.availableTools).toContain("web_search");
      expect(childContext.availableTools).toContain("web_scrape");
      expect(childContext.availableTools).toContain("bash_exec");

      // All 8 delegation tools MUST be completely removed
      for (const delTool of SUBAGENT_DELEGATION_TOOL_NAMES) {
        expect(childContext.availableTools).not.toContain(delTool);
        expect(DELEGATION_NAMES_SET.has(delTool)).toBe(true);
      }
    });

    it("2.4 Strictly prevents privilege escalation from Free parent to Premium subagent", () => {
      const childContext = subagentExecutor.spawnSubagent({
        parentBot: {
          id: "free-parent",
          name: "Free Parent",
          inferenceMode: "free",
          depth: 0,
        },
        requestedInferenceMode: "premium", // Attempted escalation
        taskPrompt: "Try to get premium access",
      });

      expect(childContext.inferenceMode).toBe("free");
      expect(childContext.systemPrompt).toContain("InferenceMode: free");
      expect(childContext.systemPrompt).not.toContain("InferenceMode: premium");
    });
  });

  // ============================================================================
  // AXIS 3: ZERO-COST ENFORCEMENT & FAIL-CLOSED BARRIERS
  // ============================================================================
  describe("Axis 3: Zero-Cost Enforcement & Fail-Closed Barriers", () => {
    const policyEngine = new RakazoFreePolicyEngine();

    it("3.1 Rejects any positive cost header fail-closed immediately with FREE_INFERENCE_UNAVAILABLE_MESSAGE", async () => {
      const originalFetch = globalThis.fetch;
      const positiveCosts = ["0.00001", "0.0042", "0.01", "1.00", "99.99"];

      for (const cost of positiveCosts) {
        globalThis.fetch = vi.fn().mockResolvedValue({
          ok: true,
          headers: new Headers({
            "x-omniroute-cost": cost,
            "x-omniroute-provider": "qwen",
            "Content-Type": "text/event-stream",
          }),
          body: new ReadableStream({
            start(controller) {
              controller.enqueue(new TextEncoder().encode("data: [DONE]\n\n"));
              controller.close();
            },
          }),
        }) as any;

        try {
          const transport = new OmniRouteInferenceTransport({
            baseUrl: "http://mock-omniroute:8080/v1",
            defaultModel: "combo/rakazo-coding",
          });

          await expect(async () => {
            for await (const _ of transport.stream({
              model: "combo/rakazo-coding",
              messages: [{ role: "user", content: "test" }],
            })) {
              // Should never reach here
            }
          }).rejects.toThrow(FREE_INFERENCE_UNAVAILABLE_MESSAGE);
        } finally {
          globalThis.fetch = originalFetch;
        }
      }
    });

    it("3.2 Rejects corrupted, NaN, negative, or Infinity cost headers fail-closed", async () => {
      const originalFetch = globalThis.fetch;
      const invalidCosts = ["-0.05", "NaN", "Infinity", "-Infinity", "free_cost_string"];

      for (const cost of invalidCosts) {
        globalThis.fetch = vi.fn().mockResolvedValue({
          ok: true,
          headers: new Headers({
            "x-omniroute-cost": cost,
            "x-omniroute-provider": "qwen",
            "Content-Type": "text/event-stream",
          }),
          body: new ReadableStream({
            start(controller) {
              controller.enqueue(new TextEncoder().encode("data: [DONE]\n\n"));
              controller.close();
            },
          }),
        }) as any;

        try {
          const transport = new OmniRouteInferenceTransport({
            baseUrl: "http://mock-omniroute:8080/v1",
            defaultModel: "combo/rakazo-fast",
          });

          await expect(async () => {
            for await (const _ of transport.stream({
              model: "combo/rakazo-fast",
              messages: [{ role: "user", content: "test" }],
            })) {
              // Should not emit
            }
          }).rejects.toThrow(FREE_INFERENCE_UNAVAILABLE_MESSAGE);
        } finally {
          globalThis.fetch = originalFetch;
        }
      }
    });

    it("3.3 Rejects SSE payload chunks containing pricing > 0 fail-closed", async () => {
      const originalFetch = globalThis.fetch;

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        headers: new Headers({
          "x-omniroute-cost": "0.000000",
          "x-omniroute-provider": "mistralai",
          "Content-Type": "text/event-stream",
        }),
        body: new ReadableStream({
          start(controller) {
            const chunkWithPaidPricing = `data: ${JSON.stringify({
              choices: [{ delta: { content: "Paid chunk leaked" } }],
              pricing: {
                prompt: 0.002,
                completion: 0.003,
                total_cost: 0.005,
              },
            })}\n\n`;
            controller.enqueue(new TextEncoder().encode(chunkWithPaidPricing));
            controller.enqueue(new TextEncoder().encode("data: [DONE]\n\n"));
            controller.close();
          },
        }),
      }) as any;

      try {
        const transport = new OmniRouteInferenceTransport({
          baseUrl: "http://mock-omniroute:8080/v1",
          defaultModel: "combo/rakazo-coding",
        });

        await expect(async () => {
          for await (const _ of transport.stream({
            model: "combo/rakazo-coding",
            messages: [{ role: "user", content: "test" }],
          })) {
            // Should fail closed on paid chunk
          }
        }).rejects.toThrow(FREE_INFERENCE_UNAVAILABLE_MESSAGE);
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it("3.4 Rejects avoided and unapproved providers fail-closed", () => {
      // Avoided providers
      for (const avoided of AVOIDED_PROVIDERS) {
        expect(() => policyEngine.assertZeroCostAndAllowed(avoided, 0.0)).toThrow(
          FREE_INFERENCE_UNAVAILABLE_MESSAGE,
        );
      }

      // Unapproved arbitrary third party vendors
      const unapproved = [
        "unapproved_commercial_proxy",
        "unknown_vendor",
        "tos_violating_mirror",
        "aws_bedrock_paid",
        "openai_direct",
        "anthropic_direct",
      ];
      for (const vendor of unapproved) {
        expect(() => policyEngine.assertZeroCostAndAllowed(vendor, 0.0)).toThrow(
          FREE_INFERENCE_UNAVAILABLE_MESSAGE,
        );
      }

      // Approved providers succeed
      for (const approved of APPROVED_FREE_PROVIDERS) {
        expect(() => policyEngine.assertZeroCostAndAllowed(approved, 0.0)).not.toThrow();
      }
    });

    it("3.5 Vetoes paid model families in vetoPaidFallback()", () => {
      const commercialPaidModels = [
        "gpt-4o",
        "gpt-4-turbo",
        "gpt-4",
        "claude-3-opus",
        "claude-3-5-sonnet",
        "claude-3-haiku",
        "sonnet",
        "opus",
        "gpt-oss-120b", // Paid OpenRouter variant without :free
        "",
        "   ",
      ];

      for (const model of commercialPaidModels) {
        expect(() => policyEngine.vetoPaidFallback(model)).toThrow(
          FREE_INFERENCE_UNAVAILABLE_MESSAGE,
        );
      }

      // Approved combos and free models pass
      const validModels = [
        "combo/rakazo-coding",
        "combo/rakazo-reasoning",
        "combo/rakazo-fast",
        "combo/rakazo-writing",
        "combo/rakazo-analysis",
        "combo-fast",
        "meta-llama/llama-3.3-70b-instruct:free",
        "qwen/qwen-2.5-coder-32b-instruct:free",
        "deepseek/deepseek-chat:free",
      ];

      for (const model of validModels) {
        expect(() => policyEngine.vetoPaidFallback(model)).not.toThrow();
      }
    });
  });
});
