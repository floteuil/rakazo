import { describe, expect, it } from "vitest";
import {
  jsonSchemaParameters,
  jsonField,
} from "../../../adapters/src/pi-runtime.js";
import {
  createStreamingRedactor,
  isHighSurrogate,
  isLowSurrogate,
  redactSecrets,
} from "../../../core/src/events.js";
import {
  reduceThreadSnapshot,
  mergeThreadSnapshot,
  isThreadSnapshotEvent,
} from "../../../../apps/web/src/lib/thread-events.js";
import {
  RakazoFreePolicyEngine,
  FREE_INFERENCE_UNAVAILABLE_MESSAGE,
  APPROVED_FREE_PROVIDERS,
  AVOIDED_PROVIDERS,
} from "../../../adapters/src/free-policy-engine.js";
import {
  createToolCallTracker,
  evaluateToolCallGuard,
  computeToolCallSignature,
  MAX_TOOL_ITERATIONS_PER_TURN,
  MAX_CONSECUTIVE_REDUNDANT_CALLS,
} from "../../../adapters/src/loop-guards.js";
import {
  SubagentExecutor,
  SUBAGENT_MAX_DEPTH,
  SUBAGENT_TOKEN_BUDGET_CEILING,
  DELEGATION_NAMES_SET,
} from "../../../adapters/src/subagent-inheritance.js";
import type { ThreadSnapshot, ProductEvent, ThreadMessage } from "@rakazo/contracts";

describe("Challenger 2 Empirical Adversarial Stress & Invariants Test Suite", () => {
  // ============================================================================
  // 1. MCP SCHEMA PARSING FUZZING & NORMALIZATION STRESS
  // ============================================================================
  describe("1. MCP Schema Parsing Fuzzing & Normalization Stress", () => {
    it("1.1 Handles non-object, null, undefined, primitive, and corrupt input schemas without throwing", () => {
      const corruptInputs = [
        null,
        undefined,
        12345,
        "invalid_string_schema",
        true,
        false,
        [],
        [1, 2, 3],
        Symbol("corrupt"),
      ];

      for (const input of corruptInputs) {
        expect(() => {
          const res = jsonSchemaParameters(input as any);
          expect(res).toBeDefined();
          expect((res as any).type).toBe("object");
        }).not.toThrow();
      }
    });

    it("1.2 Handles missing properties, null properties, and empty property objects", () => {
      const edgeSchemas = [
        {},
        { type: "object" },
        { type: "object", properties: null },
        { type: "object", properties: undefined },
        { type: "object", properties: "invalid" },
        { type: "object", properties: 42 },
        { type: "object", properties: {} },
        { properties: { key1: null, key2: undefined, key3: {} } },
      ];

      for (const schema of edgeSchemas) {
        expect(() => {
          const res = jsonSchemaParameters(schema);
          expect(res).toBeDefined();
        }).not.toThrow();
      }
    });

    it("1.3 Handles single-item enums, null in enums, and empty enum arrays", () => {
      // Single item enum
      const singleEnum = jsonField({ enum: ["unique_value"] });
      expect(singleEnum).toBeDefined();
      expect((singleEnum as any).const || (singleEnum as any).literal || (singleEnum as any).type).toBeDefined();

      // Single item null enum
      const nullSingleEnum = jsonField({ enum: [null] });
      expect(nullSingleEnum).toBeDefined();

      // Multi-item enum with null
      const multiNullEnum = jsonField({ enum: ["active", "paused", null] });
      expect(multiNullEnum).toBeDefined();
      expect((multiNullEnum as any).anyOf).toBeDefined();

      // Empty enum array
      const emptyEnum = jsonField({ enum: [] });
      expect(emptyEnum).toBeDefined();
    });

    it("1.4 Handles nested TypeBox unions (anyOf, oneOf, type arrays)", () => {
      // anyOf with single item
      const singleAnyOf = jsonField({ anyOf: [{ type: "string" }] });
      expect(singleAnyOf).toBeDefined();

      // anyOf with multiple items
      const multiAnyOf = jsonField({ anyOf: [{ type: "string" }, { type: "number" }] });
      expect(multiAnyOf).toBeDefined();
      expect((multiAnyOf as any).anyOf).toBeDefined();

      // oneOf with nested schemas
      const nestedOneOf = jsonField({
        oneOf: [
          { type: "object", properties: { id: { type: "string" } } },
          { type: "null" },
        ],
      });
      expect(nestedOneOf).toBeDefined();

      // Type array (e.g. ["string", "null", "number"])
      const typeArray = jsonField({ type: ["string", "null", "number"] });
      expect(typeArray).toBeDefined();
      expect((typeArray as any).anyOf).toBeDefined();
    });

    it("1.5 Fuzzes 1,000 randomized and malformed JSON schemas without uncaught exceptions", () => {
      const types = ["string", "number", "integer", "boolean", "object", "array", "null", "custom_unknown", undefined, null, 123];
      for (let i = 0; i < 1000; i++) {
        const randomType = types[Math.floor(Math.random() * types.length)];
        const randomEnum = Math.random() > 0.5 ? [null, "val1", 42, true].slice(0, Math.floor(Math.random() * 4)) : undefined;
        const randomAnyOf = Math.random() > 0.7 ? [{ type: "string" }, { type: "number" }] : undefined;

        const fuzzSchema = {
          type: "object",
          properties: {
            [`field_${i}`]: {
              type: randomType,
              enum: randomEnum,
              anyOf: randomAnyOf,
              required: Math.random() > 0.5,
            },
          },
          required: Math.random() > 0.5 ? [`field_${i}`] : [],
        };

        expect(() => {
          const res = jsonSchemaParameters(fuzzSchema);
          expect(res).toBeDefined();
        }).not.toThrow();
      }
    });
  });

  // ============================================================================
  // 2. SSE STREAMING UTF-16 SURROGATE PAIRS & SECRET REDACTION
  // ============================================================================
  describe("2. SSE Streaming UTF-16 Surrogate Pairs & Multi-Byte Splitting", () => {
    it("2.1 Correctly detects high and low surrogates", () => {
      const rocket = "🚀"; // \uD83D \uDE80
      const high = rocket.charCodeAt(0);
      const low = rocket.charCodeAt(1);

      expect(isHighSurrogate(high)).toBe(true);
      expect(isLowSurrogate(high)).toBe(false);
      expect(isHighSurrogate(low)).toBe(false);
      expect(isLowSurrogate(low)).toBe(true);

      const regularChar = "A".charCodeAt(0);
      expect(isHighSurrogate(regularChar)).toBe(false);
      expect(isLowSurrogate(regularChar)).toBe(false);
    });

    it("2.2 Slices multi-byte emojis (🚀, 🤖, 🎉) across 1-char chunk boundaries without corruption", () => {
      const redactor = createStreamingRedactor([]);
      const rocket = "🚀"; // Length 2 (high + low surrogate)
      const robot = "🤖";
      const party = "🎉";
      const stream = `Hello ${rocket} World ${robot} End ${party}!`;

      let output = "";
      for (let i = 0; i < stream.length; i++) {
        output += redactor.push(stream[i]!);
      }
      output += redactor.finish();

      expect(output).toBe(stream);
      expect(output).toContain("🚀");
      expect(output).toContain("🤖");
      expect(output).toContain("🎉");
    });

    it("2.3 Slices complex ZWJ family sequences (👨‍👩‍👧‍👦) across 1-char chunk boundaries", () => {
      const redactor = createStreamingRedactor([]);
      const family = "👨‍👩‍👧‍👦"; // ZWJ sequence of 11 UTF-16 code units
      const input = `Family: ${family} is together.`;

      let output = "";
      for (let i = 0; i < input.length; i++) {
        output += redactor.push(input[i]!);
      }
      output += redactor.finish();

      expect(output).toBe(input);
      expect(output).toContain("👨‍👩‍👧‍👦");
    });

    it("2.4 Redacts secret tokens adjacent to split UTF-16 surrogates across 1-char chunk stream", () => {
      const secretToken = "sk-live-secret-token-999";
      const redactor = createStreamingRedactor([secretToken]);
      const rocket = "🚀";
      const robot = "🤖";

      // String with secret sandwiched between emojis
      const source = `${rocket}${secretToken}${robot}`;

      let output = "";
      for (let i = 0; i < source.length; i++) {
        output += redactor.push(source[i]!);
      }
      output += redactor.finish();

      expect(output).not.toContain(secretToken);
      expect(output).toBe(`🚀[redacted]🤖`);
    });

    it("2.5 Handles multi-secret overlap and high-volume 10,000 1-char chunk streaming without data loss", () => {
      const secrets = ["sk-live-12345", "sk-live-123", "bearer_token_xyz"];
      const redactor = createStreamingRedactor(secrets);

      let text = "";
      for (let i = 0; i < 500; i++) {
        text += `Turn ${i}: 🚀 sk-live-12345 🤖 bearer_token_xyz 🎉 normal text `;
      }

      let output = "";
      for (let i = 0; i < text.length; i++) {
        output += redactor.push(text[i]!);
      }
      output += redactor.finish();

      for (const s of secrets) {
        expect(output).not.toContain(s);
      }
      expect(output).toContain("🚀");
      expect(output).toContain("🤖");
      expect(output).toContain("🎉");
    });
  });

  // ============================================================================
  // 3. ERROR BANNER CLEANUP & THREAD LIFECYCLE
  // ============================================================================
  describe("3. Error Banner Cleanup & State Transitions", () => {
    const baseSnapshot: ThreadSnapshot = {
      threadId: "thread-123",
      cursor: 10,
      olderCursor: null,
      messages: [
        {
          id: "msg-1",
          threadId: "thread-123",
          seq: 1,
          role: "user",
          blocks: [{ kind: "text", text: "Hello" }],
          createdAt: new Date().toISOString(),
        },
        {
          id: "progress:run-123",
          threadId: "thread-123",
          seq: 2,
          role: "bot",
          blocks: [{ kind: "progress", text: "Computing response..." }],
          createdAt: new Date().toISOString(),
        },
      ],
      run: {
        id: "run-123",
        threadId: "thread-123",
        status: "running",
        createdAt: new Date().toISOString(),
      },
    };

    it("3.1 run.failed clears transient progress messages and cleans up run state", () => {
      const failedEvent: ProductEvent = {
        id: "evt-failed",
        threadId: "thread-123",
        runId: "run-123",
        seq: 11,
        type: "run.failed",
        payload: { error: "Inference gateway unavailable" },
        createdAt: new Date().toISOString(),
      };

      const next = reduceThreadSnapshot(baseSnapshot, failedEvent);
      expect(next).toBeDefined();
      expect(next!.messages.some((m) => m.id.startsWith("progress:"))).toBe(false);
      expect(next!.run).toBeNull();
      expect(next!.cursor).toBe(11);
    });

    it("3.2 run.cancelled clears transient progress messages and cleans up run state", () => {
      const cancelledEvent: ProductEvent = {
        id: "evt-cancel",
        threadId: "thread-123",
        runId: "run-123",
        seq: 12,
        type: "run.cancelled",
        payload: { reason: "User cancelled run" },
        createdAt: new Date().toISOString(),
      };

      const next = reduceThreadSnapshot(baseSnapshot, cancelledEvent);
      expect(next).toBeDefined();
      expect(next!.messages.some((m) => m.id.startsWith("progress:"))).toBe(false);
      expect(next!.run).toBeNull();
    });

    it("3.3 thread.cleared purges all messages, runs, cursors, and subagents completely", () => {
      const clearedEvent: ProductEvent = {
        id: "evt-clear",
        threadId: "thread-123",
        seq: 20,
        type: "thread.cleared",
        payload: {},
        createdAt: new Date().toISOString(),
      };

      const next = reduceThreadSnapshot(baseSnapshot, clearedEvent);
      expect(next).toBeDefined();
      expect(next!.messages).toHaveLength(0);
      expect(next!.run).toBeNull();
      expect(next!.olderCursor).toBeNull();
      expect(next!.cursor).toBe(20);
    });

    it("3.4 Recovery after failure: new user message and successful run does not retain old progress tokens", () => {
      // Step 1: run fails
      const failed = reduceThreadSnapshot(baseSnapshot, {
        id: "evt-failed",
        threadId: "thread-123",
        runId: "run-123",
        seq: 11,
        type: "run.failed",
        payload: {},
        createdAt: new Date().toISOString(),
      });

      // Step 2: user sends retry follow-up
      const retryUserMsg: ProductEvent = {
        id: "msg-retry",
        threadId: "thread-123",
        seq: 12,
        type: "thread.message.created",
        payload: {
          messageId: "msg-retry",
          role: "user",
          blocks: [{ kind: "text", text: "Retry query" }],
        },
        createdAt: new Date().toISOString(),
      };
      const afterRetry = reduceThreadSnapshot(failed, retryUserMsg);

      // Step 3: bot answers cleanly
      const botResponse: ProductEvent = {
        id: "msg-bot-ok",
        threadId: "thread-123",
        seq: 13,
        type: "thread.message.created",
        payload: {
          messageId: "msg-bot-ok",
          role: "bot",
          blocks: [{ kind: "text", text: "Success response" }],
          resolvedModel: "codestral-latest",
          resolvedProvider: "mistral",
        },
        createdAt: new Date().toISOString(),
      };
      const finalState = reduceThreadSnapshot(afterRetry, botResponse);

      expect(finalState!.messages).toHaveLength(3); // msg-1, msg-retry, msg-bot-ok
      expect(finalState!.messages.some((m) => m.id.startsWith("progress:"))).toBe(false);
      expect(finalState!.run).toBeNull();
    });
  });

  // ============================================================================
  // 4. INVARIANT STRESS & SECURITY BARRIERS
  // ============================================================================
  describe("4. Invariant Stress & Security Barriers", () => {
    it("4.1 $0.00 Zero-Cost strict barrier rejects positive costs, NaN, negative, and unapproved providers", () => {
      const engine = new RakazoFreePolicyEngine();

      // Zero cost on approved provider must succeed
      expect(() => engine.assertZeroCostAndAllowed("omniroute", 0.0)).not.toThrow();
      expect(() => engine.assertZeroCostAndAllowed("mistralai", 0.0)).not.toThrow();

      // Positive cost must fail-closed
      expect(() => engine.assertZeroCostAndAllowed("omniroute", 0.00001)).toThrow(FREE_INFERENCE_UNAVAILABLE_MESSAGE);
      expect(() => engine.assertZeroCostAndAllowed("omniroute", 0.01)).toThrow(FREE_INFERENCE_UNAVAILABLE_MESSAGE);
      expect(() => engine.assertZeroCostAndAllowed("omniroute", 1.0)).toThrow(FREE_INFERENCE_UNAVAILABLE_MESSAGE);

      // NaN or negative must fail-closed
      expect(() => engine.assertZeroCostAndAllowed("omniroute", NaN)).toThrow(FREE_INFERENCE_UNAVAILABLE_MESSAGE);
      expect(() => engine.assertZeroCostAndAllowed("omniroute", -0.01)).toThrow(FREE_INFERENCE_UNAVAILABLE_MESSAGE);

      // Avoided or unapproved provider must fail-closed
      for (const avoided of AVOIDED_PROVIDERS) {
        expect(() => engine.assertZeroCostAndAllowed(avoided, 0.0)).toThrow(FREE_INFERENCE_UNAVAILABLE_MESSAGE);
      }
      expect(() => engine.assertZeroCostAndAllowed("unapproved_foreign_proxy", 0.0)).toThrow(FREE_INFERENCE_UNAVAILABLE_MESSAGE);

      // Veto paid fallback models
      expect(() => engine.vetoPaidFallback("openai/gpt-oss-120b")).toThrow(FREE_INFERENCE_UNAVAILABLE_MESSAGE);
      expect(() => engine.vetoPaidFallback("anthropic/claude-3-opus")).toThrow(FREE_INFERENCE_UNAVAILABLE_MESSAGE);
      expect(() => engine.vetoPaidFallback("gpt-4o")).toThrow(FREE_INFERENCE_UNAVAILABLE_MESSAGE);

      // Allowed combo models
      expect(() => engine.vetoPaidFallback("combo/rakazo-coding")).not.toThrow();
      expect(() => engine.vetoPaidFallback("combo/rakazo-fast")).not.toThrow();
      expect(() => engine.vetoPaidFallback("meta-llama/llama-3-70b:free")).not.toThrow();
    });

    it("4.2 25-turn loop guards & 3-step consecutive redundancy detector", () => {
      const tracker = createToolCallTracker();

      // Execute 25 valid tool steps
      for (let step = 1; step <= MAX_TOOL_ITERATIONS_PER_TURN; step++) {
        const guard = evaluateToolCallGuard(tracker, `tool_${step % 5}`, { step });
        expect(guard.allow).toBe(true);
      }

      // Step 26 must trigger circuit breaker and terminate
      const breaker = evaluateToolCallGuard(tracker, "tool_any", { step: 26 });
      expect(breaker.allow).toBe(false);
      if (!breaker.allow) {
        expect(breaker.terminate).toBe(true);
        expect(breaker.reason).toContain("Circuit breaker triggered");
        expect(breaker.reason).toContain("25");
      }

      // Test redundancy detector: 3 consecutive calls with identical arguments
      const redundancyTracker = createToolCallTracker();
      const call1 = evaluateToolCallGuard(redundancyTracker, "search_web", { q: "same query" });
      expect(call1.allow).toBe(true);

      const call2 = evaluateToolCallGuard(redundancyTracker, "search_web", { q: "same query" });
      expect(call2.allow).toBe(true);

      const call3 = evaluateToolCallGuard(redundancyTracker, "search_web", { q: "same query" });
      expect(call3.allow).toBe(false);
      if (!call3.allow) {
        expect(call3.terminate).toBe(true);
        expect(call3.reason).toContain("Loop detected");
        expect(call3.reason).toContain("search_web");
      }
    });

    it("4.3 Subagent depth 1 restriction, privilege escalation veto, and delegation tool stripping", () => {
      const executor = new SubagentExecutor();

      // Parent at depth 0 spawning child (child is depth 1) -> SUCCEEDS
      const rootParent = {
        id: "parent-bot-1",
        name: "Parent Free Bot",
        inferenceMode: "free" as const,
        tools: ["web_search", "run_subagent", "spawn_bot", "delegate_task", "shell"],
        depth: 0,
      };

      const childContext = executor.spawnSubagent({
        parentBot: rootParent,
        taskPrompt: "Execute subtask",
      });

      expect(childContext).toBeDefined();
      expect(childContext.parentBotId).toBe("parent-bot-1");
      expect(childContext.inferenceMode).toBe("free"); // Strict inheritance
      expect(childContext.maxTokens).toBe(SUBAGENT_TOKEN_BUDGET_CEILING); // 8,192 token limit

      // Child tools must STRIP all delegation tools
      for (const tool of childContext.availableTools) {
        expect(DELEGATION_NAMES_SET.has(tool)).toBe(false);
      }
      expect(childContext.availableTools).toContain("web_search");
      expect(childContext.availableTools).toContain("shell");

      // Attempting to spawn at depth 1 -> MUST THROW recursion depth error
      const childBot = {
        id: childContext.botId,
        name: "Child Subagent",
        inferenceMode: "free" as const,
        depth: 1, // Depth 1 cannot spawn subagents
      };

      expect(() => {
        executor.spawnSubagent({
          parentBot: childBot,
          taskPrompt: "Illegal recursive subtask",
        });
      }).toThrow(/Subagent recursion depth 2 exceeds maximum allowed depth 1/);

      // Privilege escalation attempt: parent is free, but request asks for "paid" -> MUST BE VETOED TO "free"
      const escalationAttempt = executor.spawnSubagent({
        parentBot: rootParent,
        requestedInferenceMode: "paid" as any,
        taskPrompt: "Escalation test",
      });
      expect(escalationAttempt.inferenceMode).toBe("free");

      // Token budget validation: 8,192 limit
      expect(() => executor.validateTokenBudget(8000)).not.toThrow();
      expect(() => executor.validateTokenBudget(8192)).not.toThrow();
      expect(() => executor.validateTokenBudget(8193)).toThrow(/Subagent token budget exceeded/);
    });
  });
});
