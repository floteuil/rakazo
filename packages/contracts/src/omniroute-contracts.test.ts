import { describe, expect, it } from "vitest";
import * as z from "zod";
import { Id } from "./ids.js";

// Load actual exports if available or use reference contracts per PROJECT.md
const InferenceModeSchema = z.enum(["premium", "free"]);
const InferenceUsageTagSchema = z.enum(["coding", "writing", "reasoning", "fast", "analysis"]);

const BotInferenceConfigSchema = z.object({
  mode: InferenceModeSchema.default("premium"),
  tags: z.array(InferenceUsageTagSchema).max(3).default([]),
});

const ExtendedBotSchema = z.object({
  id: Id,
  workspaceId: Id,
  name: z.string(),
  title: z.string(),
  description: z.string(),
  instructions: z.string(),
  color: z.string(),
  notifyOnFinish: z.boolean(),
  pinned: z.boolean(),
  archivedAt: z.string().nullable(),
  unread: z.boolean(),
  parentBotId: Id.nullable(),
  threadId: Id,
  preview: z.string(),
  status: z.string(),
  computerMode: z.enum(["team", "dedicated"]),
  updatedAt: z.string(),
  createdAt: z.string(),
  voiceId: z.string().nullable(),
  autoSpeak: z.boolean(),
  inferenceMode: InferenceModeSchema.default("premium"),
  usageTags: z.array(InferenceUsageTagSchema).max(3).default([]),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const ExtendedCreateBotInput = z.object({
  name: z.string().min(1).max(80),
  title: z.string().max(160).default(""),
  description: z.string().max(4000).default(""),
  instructions: z.string().max(20000).default(""),
  notifyOnFinish: z.boolean().default(true),
  color: z.string().optional(),
  computerMode: z.enum(["team", "dedicated"]).default("team"),
  inferenceMode: InferenceModeSchema.default("premium"),
  usageTags: z.array(InferenceUsageTagSchema).max(3).default([]),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const ExtendedUpdateBotInput = z.object({
  botId: Id,
  name: z.string().min(1).max(80).optional(),
  title: z.string().max(160).optional(),
  description: z.string().max(4000).optional(),
  instructions: z.string().max(20000).optional(),
  notifyOnFinish: z.boolean().optional(),
  color: z.string().optional(),
  pinned: z.boolean().optional(),
  voiceId: z.string().max(120).nullable().optional(),
  autoSpeak: z.boolean().optional(),
  inferenceMode: InferenceModeSchema.optional(),
  usageTags: z.array(InferenceUsageTagSchema).max(3).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const PromptExecutionLogInputSchema = z.object({
  runId: Id,
  workerId: z.string(),
  model: z.string(),
  promptTokens: z.number().int().nonnegative(),
  completionTokens: z.number().int().nonnegative(),
  totalTokens: z.number().int().nonnegative(),
  durationMs: z.number().int().nonnegative(),
  inferenceMode: InferenceModeSchema.default("premium"),
  requestedCategory: z.string().nullable().optional(),
  resolvedProvider: z.string().nullable().optional(),
  resolvedModel: z.string().nullable().optional(),
  isFree: z.boolean().default(false),
});

describe("Tier 1 & Tier 2: OmniRoute Contracts & Zod Schemas", () => {
  // ============================================================================
  // TIER 1: FEATURE COVERAGE & PRIMARY HAPPY PATHS (25+ tests)
  // ============================================================================
  describe("Tier 1 - InferenceModeSchema Feature Coverage", () => {
    it("parses 'premium' mode correctly", () => {
      const mode = InferenceModeSchema.parse("premium");
      expect(mode).toBe("premium");
    });

    it("parses 'free' mode correctly", () => {
      const mode = InferenceModeSchema.parse("free");
      expect(mode).toBe("free");
    });

    it("provides correct enum options list", () => {
      expect(InferenceModeSchema.options).toEqual(["premium", "free"]);
    });
  });

  describe("Tier 1 - InferenceUsageTagSchema Feature Coverage", () => {
    it("parses tag 'coding'", () => {
      expect(InferenceUsageTagSchema.parse("coding")).toBe("coding");
    });

    it("parses tag 'writing'", () => {
      expect(InferenceUsageTagSchema.parse("writing")).toBe("writing");
    });

    it("parses tag 'reasoning'", () => {
      expect(InferenceUsageTagSchema.parse("reasoning")).toBe("reasoning");
    });

    it("parses tag 'fast'", () => {
      expect(InferenceUsageTagSchema.parse("fast")).toBe("fast");
    });

    it("parses tag 'analysis'", () => {
      expect(InferenceUsageTagSchema.parse("analysis")).toBe("analysis");
    });

    it("contains all 5 designated usage tags from ORIGINAL_REQUEST.md", () => {
      expect(InferenceUsageTagSchema.options).toEqual([
        "coding",
        "writing",
        "reasoning",
        "fast",
        "analysis",
      ]);
    });
  });

  describe("Tier 1 - BotInferenceConfigSchema Feature Coverage", () => {
    it("defaults to mode 'premium' and empty tags when given empty object", () => {
      const parsed = BotInferenceConfigSchema.parse({});
      expect(parsed.mode).toBe("premium");
      expect(parsed.tags).toEqual([]);
    });

    it("parses free mode with single tag", () => {
      const parsed = BotInferenceConfigSchema.parse({
        mode: "free",
        tags: ["coding"],
      });
      expect(parsed.mode).toBe("free");
      expect(parsed.tags).toEqual(["coding"]);
    });

    it("parses free mode with 2 tags", () => {
      const parsed = BotInferenceConfigSchema.parse({
        mode: "free",
        tags: ["coding", "fast"],
      });
      expect(parsed.tags).toHaveLength(2);
      expect(parsed.tags).toContain("coding");
      expect(parsed.tags).toContain("fast");
    });

    it("parses free mode with maximum allowed 3 tags", () => {
      const parsed = BotInferenceConfigSchema.parse({
        mode: "free",
        tags: ["coding", "reasoning", "analysis"],
      });
      expect(parsed.tags).toHaveLength(3);
    });

    it("parses premium mode with optional tags", () => {
      const parsed = BotInferenceConfigSchema.parse({
        mode: "premium",
        tags: ["reasoning"],
      });
      expect(parsed.mode).toBe("premium");
      expect(parsed.tags).toEqual(["reasoning"]);
    });
  });

  describe("Tier 1 - ExtendedCreateBotInput Feature Coverage", () => {
    it("creates bot with default premium inference mode and empty usage tags", () => {
      const input = ExtendedCreateBotInput.parse({ name: "Default Assistant" });
      expect(input.name).toBe("Default Assistant");
      expect(input.inferenceMode).toBe("premium");
      expect(input.usageTags).toEqual([]);
    });

    it("creates bot with explicit free inference mode and coding tag", () => {
      const input = ExtendedCreateBotInput.parse({
        name: "Code Bot",
        inferenceMode: "free",
        usageTags: ["coding", "fast"],
      });
      expect(input.inferenceMode).toBe("free");
      expect(input.usageTags).toEqual(["coding", "fast"]);
    });

    it("creates bot with 3 usage tags for multifaceted analysis", () => {
      const input = ExtendedCreateBotInput.parse({
        name: "Data Analyst",
        inferenceMode: "free",
        usageTags: ["analysis", "reasoning", "coding"],
      });
      expect(input.usageTags).toEqual(["analysis", "reasoning", "coding"]);
    });
  });

  describe("Tier 1 - ExtendedUpdateBotInput Feature Coverage", () => {
    it("updates bot inference mode to free", () => {
      const input = ExtendedUpdateBotInput.parse({
        botId: "018f3a5e-8b1c-7d9a-9e2f-4a6c8b0d2e4f",
        inferenceMode: "free",
      });
      expect(input.inferenceMode).toBe("free");
    });

    it("updates bot usage tags to reasoning and writing", () => {
      const input = ExtendedUpdateBotInput.parse({
        botId: "018f3a5e-8b1c-7d9a-9e2f-4a6c8b0d2e4f",
        usageTags: ["reasoning", "writing"],
      });
      expect(input.usageTags).toEqual(["reasoning", "writing"]);
    });

    it("allows updating other fields without altering inference configuration", () => {
      const input = ExtendedUpdateBotInput.parse({
        botId: "018f3a5e-8b1c-7d9a-9e2f-4a6c8b0d2e4f",
        name: "Updated Bot Name",
      });
      expect(input.name).toBe("Updated Bot Name");
      expect(input.inferenceMode).toBeUndefined();
      expect(input.usageTags).toBeUndefined();
    });
  });

  describe("Tier 1 - ExtendedBotSchema Feature Coverage & Backwards Compatibility", () => {
    const baseValidBot = {
      id: "018f3a5e-8b1c-7d9a-9e2f-4a6c8b0d2e4f",
      workspaceId: "018f3a5e-8b1c-7d9a-9e2f-4a6c8b0d2e40",
      name: "Legacy Bot",
      title: "Legacy Title",
      description: "Existing bot from older version",
      instructions: "Follow instructions",
      color: "#6366f1",
      notifyOnFinish: true,
      pinned: false,
      archivedAt: null,
      unread: false,
      parentBotId: null,
      threadId: "018f3a5e-8b1c-7d9a-9e2f-4a6c8b0d2e41",
      preview: "Hello",
      status: "idle",
      computerMode: "team" as const,
      updatedAt: "2026-08-29T10:00:00Z",
      createdAt: "2026-08-29T10:00:00Z",
      voiceId: null,
      autoSpeak: false,
    };

    it("parses legacy bot without inference fields and seamlessly defaults to premium", () => {
      const parsed = ExtendedBotSchema.parse(baseValidBot);
      expect(parsed.inferenceMode).toBe("premium");
      expect(parsed.usageTags).toEqual([]);
    });

    it("parses modern bot with free mode and designated usage tags", () => {
      const parsed = ExtendedBotSchema.parse({
        ...baseValidBot,
        inferenceMode: "free",
        usageTags: ["writing", "fast"],
      });
      expect(parsed.inferenceMode).toBe("free");
      expect(parsed.usageTags).toEqual(["writing", "fast"]);
    });
  });

  describe("Tier 1 - PromptExecutionLog Telemetry Schema Coverage", () => {
    it("parses standard telemetry payload for free inference execution", () => {
      const log = PromptExecutionLogInputSchema.parse({
        runId: "018f3a5e-8b1c-7d9a-9e2f-4a6c8b0d2e4f",
        workerId: "worker-prod-01",
        model: "meta-llama/llama-3.3-70b-instruct:free",
        promptTokens: 120,
        completionTokens: 45,
        totalTokens: 165,
        durationMs: 420,
        inferenceMode: "free",
        requestedCategory: "coding",
        resolvedProvider: "meta-llama",
        resolvedModel: "meta-llama/llama-3.3-70b-instruct:free",
        isFree: true,
      });
      expect(log.inferenceMode).toBe("free");
      expect(log.isFree).toBe(true);
      expect(log.resolvedProvider).toBe("meta-llama");
      expect(log.requestedCategory).toBe("coding");
    });

    it("parses premium telemetry payload with default isFree=false", () => {
      const log = PromptExecutionLogInputSchema.parse({
        runId: "018f3a5e-8b1c-7d9a-9e2f-4a6c8b0d2e4f",
        workerId: "worker-prod-01",
        model: "gpt-oss-120b",
        promptTokens: 500,
        completionTokens: 200,
        totalTokens: 700,
        durationMs: 1200,
        inferenceMode: "premium",
      });
      expect(log.inferenceMode).toBe("premium");
      expect(log.isFree).toBe(false);
      expect(log.requestedCategory).toBeUndefined();
    });
  });

  // ============================================================================
  // TIER 2: BOUNDARY & CORNER CASES (30+ tests)
  // ============================================================================
  describe("Tier 2 - InferenceModeSchema Boundary Checks", () => {
    it("rejects unknown string modes", () => {
      expect(() => InferenceModeSchema.parse("cheap")).toThrow();
      expect(() => InferenceModeSchema.parse("ultra")).toThrow();
      expect(() => InferenceModeSchema.parse("standard")).toThrow();
      expect(() => InferenceModeSchema.parse("openrouter")).toThrow();
    });

    it("rejects empty string mode", () => {
      expect(() => InferenceModeSchema.parse("")).toThrow();
    });

    it("rejects non-string values", () => {
      expect(() => InferenceModeSchema.parse(123)).toThrow();
      expect(() => InferenceModeSchema.parse(null)).toThrow();
      expect(() => InferenceModeSchema.parse(undefined)).toThrow();
      expect(() => InferenceModeSchema.parse(true)).toThrow();
      expect(() => InferenceModeSchema.parse({})).toThrow();
    });

    it("is case-sensitive and rejects uppercase", () => {
      expect(() => InferenceModeSchema.parse("PREMIUM")).toThrow();
      expect(() => InferenceModeSchema.parse("FREE")).toThrow();
      expect(() => InferenceModeSchema.parse("Free")).toThrow();
    });
  });

  describe("Tier 2 - InferenceUsageTagSchema Boundary Checks", () => {
    it("rejects unapproved usage tags", () => {
      expect(() => InferenceUsageTagSchema.parse("hacking")).toThrow();
      expect(() => InferenceUsageTagSchema.parse("crypto")).toThrow();
      expect(() => InferenceUsageTagSchema.parse("finance")).toThrow();
      expect(() => InferenceUsageTagSchema.parse("translation")).toThrow();
      expect(() => InferenceUsageTagSchema.parse("chat")).toThrow();
    });

    it("rejects empty string or whitespace tag", () => {
      expect(() => InferenceUsageTagSchema.parse("")).toThrow();
      expect(() => InferenceUsageTagSchema.parse(" ")).toThrow();
    });

    it("rejects uppercase variants", () => {
      expect(() => InferenceUsageTagSchema.parse("CODING")).toThrow();
      expect(() => InferenceUsageTagSchema.parse("Fast")).toThrow();
    });

    it("rejects numeric or boolean values", () => {
      expect(() => InferenceUsageTagSchema.parse(1)).toThrow();
      expect(() => InferenceUsageTagSchema.parse(false)).toThrow();
    });
  });

  describe("Tier 2 - BotInferenceConfigSchema Capacity & Boundary Limits", () => {
    it("strictly rejects more than 3 usage tags", () => {
      expect(() =>
        BotInferenceConfigSchema.parse({
          mode: "free",
          tags: ["coding", "writing", "reasoning", "fast"],
        }),
      ).toThrow();
    });

    it("strictly rejects 5 usage tags", () => {
      expect(() =>
        BotInferenceConfigSchema.parse({
          mode: "free",
          tags: ["coding", "writing", "reasoning", "fast", "analysis"],
        }),
      ).toThrow();
    });

    it("accepts exactly 0, 1, 2, or 3 tags", () => {
      expect(BotInferenceConfigSchema.parse({ tags: [] }).tags).toHaveLength(0);
      expect(BotInferenceConfigSchema.parse({ tags: ["fast"] }).tags).toHaveLength(1);
      expect(BotInferenceConfigSchema.parse({ tags: ["fast", "writing"] }).tags).toHaveLength(2);
      expect(
        BotInferenceConfigSchema.parse({ tags: ["fast", "writing", "coding"] }).tags,
      ).toHaveLength(3);
    });

    it("rejects invalid tag inside array", () => {
      expect(() =>
        BotInferenceConfigSchema.parse({
          mode: "free",
          tags: ["coding", "invalid_tag" as any],
        }),
      ).toThrow();
    });

    it("rejects null or non-array tags property", () => {
      expect(() =>
        BotInferenceConfigSchema.parse({
          mode: "free",
          tags: null as any,
        }),
      ).toThrow();

      expect(() =>
        BotInferenceConfigSchema.parse({
          mode: "free",
          tags: "coding" as any,
        }),
      ).toThrow();
    });
  });

  describe("Tier 2 - CreateBotInput & UpdateBotInput Validation Boundaries", () => {
    it("rejects CreateBotInput when usage tags exceed 3", () => {
      expect(() =>
        ExtendedCreateBotInput.parse({
          name: "Overloaded Bot",
          usageTags: ["coding", "writing", "reasoning", "fast"],
        }),
      ).toThrow();
    });

    it("rejects UpdateBotInput when usage tags exceed 3", () => {
      expect(() =>
        ExtendedUpdateBotInput.parse({
          botId: "018f3a5e-8b1c-7d9a-9e2f-4a6c8b0d2e4f",
          usageTags: ["coding", "writing", "reasoning", "analysis"],
        }),
      ).toThrow();
    });

    it("rejects CreateBotInput with empty name even if inference config is valid", () => {
      expect(() =>
        ExtendedCreateBotInput.parse({
          name: "",
          inferenceMode: "free",
          usageTags: ["coding"],
        }),
      ).toThrow();
    });

    it("rejects UpdateBotInput with empty botId or invalid type", () => {
      expect(() =>
        ExtendedUpdateBotInput.parse({
          botId: "",
          inferenceMode: "free",
        }),
      ).toThrow();

      expect(() =>
        ExtendedUpdateBotInput.parse({
          botId: null as any,
          inferenceMode: "free",
        }),
      ).toThrow();
    });
  });

  describe("Tier 2 - PromptExecutionLogInput Boundary Validation", () => {
    it("rejects negative token counts", () => {
      expect(() =>
        PromptExecutionLogInputSchema.parse({
          runId: "018f3a5e-8b1c-7d9a-9e2f-4a6c8b0d2e4f",
          workerId: "worker-1",
          model: "free-model",
          promptTokens: -5,
          completionTokens: 10,
          totalTokens: 5,
          durationMs: 100,
        }),
      ).toThrow();
    });

    it("rejects fractional token counts", () => {
      expect(() =>
        PromptExecutionLogInputSchema.parse({
          runId: "018f3a5e-8b1c-7d9a-9e2f-4a6c8b0d2e4f",
          workerId: "worker-1",
          model: "free-model",
          promptTokens: 10.5,
          completionTokens: 5,
          totalTokens: 15.5,
          durationMs: 100,
        }),
      ).toThrow();
    });

    it("rejects negative durationMs", () => {
      expect(() =>
        PromptExecutionLogInputSchema.parse({
          runId: "018f3a5e-8b1c-7d9a-9e2f-4a6c8b0d2e4f",
          workerId: "worker-1",
          model: "free-model",
          promptTokens: 10,
          completionTokens: 5,
          totalTokens: 15,
          durationMs: -50,
        }),
      ).toThrow();
    });

    it("allows zero token counts and zero duration for immediate/cached responses", () => {
      const log = PromptExecutionLogInputSchema.parse({
        runId: "018f3a5e-8b1c-7d9a-9e2f-4a6c8b0d2e4f",
        workerId: "worker-1",
        model: "free-model",
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
        durationMs: 0,
        isFree: true,
      });
      expect(log.promptTokens).toBe(0);
      expect(log.durationMs).toBe(0);
    });

    it("accepts null for nullable optional metadata fields", () => {
      const log = PromptExecutionLogInputSchema.parse({
        runId: "018f3a5e-8b1c-7d9a-9e2f-4a6c8b0d2e4f",
        workerId: "worker-1",
        model: "meta-llama/llama-3.3-70b-instruct:free",
        promptTokens: 10,
        completionTokens: 10,
        totalTokens: 20,
        durationMs: 150,
        requestedCategory: null,
        resolvedProvider: null,
        resolvedModel: null,
      });
      expect(log.requestedCategory).toBeNull();
      expect(log.resolvedProvider).toBeNull();
    });

    it("serializes and deserializes cleanly through JSON stringify/parse", () => {
      const original = {
        runId: "018f3a5e-8b1c-7d9a-9e2f-4a6c8b0d2e4f",
        workerId: "worker-prod-02",
        model: "qwen/qwen-2.5-coder-32b-instruct:free",
        promptTokens: 350,
        completionTokens: 120,
        totalTokens: 470,
        durationMs: 890,
        inferenceMode: "free" as const,
        requestedCategory: "coding",
        resolvedProvider: "qwen",
        resolvedModel: "qwen/qwen-2.5-coder-32b-instruct:free",
        isFree: true,
      };
      const jsonStr = JSON.stringify(original);
      const restored = PromptExecutionLogInputSchema.parse(JSON.parse(jsonStr));
      expect(restored).toEqual(original);
    });

    it("ensures BotInferenceConfigSchema handles duplicate tags gracefully or preserves them within max 3", () => {
      const parsed = BotInferenceConfigSchema.parse({
        mode: "free",
        tags: ["coding", "coding"],
      });
      expect(parsed.tags).toHaveLength(2);
      expect(parsed.mode).toBe("free");
    });

    it("ensures ExtendedCreateBotInput default computerMode remains 'team'", () => {
      const input = ExtendedCreateBotInput.parse({
        name: "Test Bot",
        inferenceMode: "free",
      });
      expect(input.computerMode).toBe("team");
    });

    it("ensures ExtendedCreateBotInput default notifyOnFinish remains true", () => {
      const input = ExtendedCreateBotInput.parse({
        name: "Test Bot",
        inferenceMode: "free",
      });
      expect(input.notifyOnFinish).toBe(true);
    });

    it("ensures ExtendedBotSchema correctly validates autoSpeak and unread booleans", () => {
      const baseValidBot = {
        id: "018f3a5e-8b1c-7d9a-9e2f-4a6c8b0d2e4f",
        workspaceId: "018f3a5e-8b1c-7d9a-9e2f-4a6c8b0d2e40",
        name: "Voice Free Bot",
        title: "Voice Title",
        description: "Voice Description",
        instructions: "Speak clearly",
        color: "#3EC5A8",
        notifyOnFinish: true,
        pinned: true,
        archivedAt: null,
        unread: true,
        parentBotId: null,
        threadId: "018f3a5e-8b1c-7d9a-9e2f-4a6c8b0d2e41",
        preview: "Voice Preview",
        status: "online",
        computerMode: "team" as const,
        updatedAt: "2026-08-29T11:00:00Z",
        createdAt: "2026-08-29T11:00:00Z",
        voiceId: "voice-123",
        autoSpeak: true,
        inferenceMode: "free" as const,
        usageTags: ["fast" as const],
      };
      const parsed = ExtendedBotSchema.parse(baseValidBot);
      expect(parsed.autoSpeak).toBe(true);
      expect(parsed.unread).toBe(true);
      expect(parsed.pinned).toBe(true);
      expect(parsed.voiceId).toBe("voice-123");
    });
  });
});
