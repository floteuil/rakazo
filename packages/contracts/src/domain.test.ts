import { describe, expect, it } from "vitest";
import {
  BotInferenceConfigSchema,
  BotSchema,
  CreateBotInput,
  FREE_INFERENCE_ERROR_CODES,
  FREE_INFERENCE_UNAVAILABLE_MESSAGE,
  InferenceModeSchema,
  InferenceUsageTagSchema,
  UpdateBotInput,
} from "./domain.js";

describe("Domain Contracts — Free Intelligence Gateway (OmniRoute)", () => {
  describe("InferenceModeSchema", () => {
    it("accepts valid inference modes 'premium' and 'free'", () => {
      expect(InferenceModeSchema.parse("premium")).toBe("premium");
      expect(InferenceModeSchema.parse("free")).toBe("free");
    });

    it("rejects invalid inference modes", () => {
      expect(() => InferenceModeSchema.parse("ultra")).toThrow();
      expect(() => InferenceModeSchema.parse("paid")).toThrow();
      expect(() => InferenceModeSchema.parse("")).toThrow();
      expect(() => InferenceModeSchema.parse(null)).toThrow();
      expect(() => InferenceModeSchema.parse(123)).toThrow();
    });
  });

  describe("InferenceUsageTagSchema", () => {
    const validTags = ["coding", "writing", "reasoning", "fast", "analysis"] as const;

    it.each(validTags)("accepts valid tag '%s'", (tag) => {
      expect(InferenceUsageTagSchema.parse(tag)).toBe(tag);
    });

    it("rejects unknown tags", () => {
      expect(() => InferenceUsageTagSchema.parse("hacking")).toThrow();
      expect(() => InferenceUsageTagSchema.parse("chat")).toThrow();
      expect(() => InferenceUsageTagSchema.parse("general")).toThrow();
      expect(() => InferenceUsageTagSchema.parse("")).toThrow();
    });
  });

  describe("BotInferenceConfigSchema", () => {
    it("applies default values when empty object is passed", () => {
      const config = BotInferenceConfigSchema.parse({});
      expect(config).toEqual({
        mode: "premium",
        tags: [],
      });
    });

    it("accepts valid configuration with free mode and up to 3 tags", () => {
      const config1 = BotInferenceConfigSchema.parse({
        mode: "free",
        tags: ["coding"],
      });
      expect(config1).toEqual({
        mode: "free",
        tags: ["coding"],
      });

      const config2 = BotInferenceConfigSchema.parse({
        mode: "free",
        tags: ["coding", "writing", "reasoning"],
      });
      expect(config2.tags).toHaveLength(3);
      expect(config2.mode).toBe("free");
    });

    it("rejects configurations with more than 3 tags", () => {
      expect(() =>
        BotInferenceConfigSchema.parse({
          mode: "free",
          tags: ["coding", "writing", "reasoning", "fast"],
        }),
      ).toThrow(/Maximum 3 usage tags/);
    });

    it("rejects invalid tags inside the tags array", () => {
      expect(() =>
        BotInferenceConfigSchema.parse({
          mode: "free",
          tags: ["coding", "invalid_tag"],
        }),
      ).toThrow();
    });

    it("rejects invalid mode values", () => {
      expect(() =>
        BotInferenceConfigSchema.parse({
          mode: "unsupported",
          tags: ["coding"],
        }),
      ).toThrow();
    });
  });

  describe("BotSchema backward compatibility and extension", () => {
    const baseBotPayload = {
      id: "bot_123456789012345678901234",
      workspaceId: "wks_123456789012345678901234",
      name: "Assistant Bot",
      title: "Assistant",
      description: "Helper bot",
      instructions: "Assist the user",
      color: "#3B82F6",
      notifyOnFinish: true,
      pinned: false,
      archivedAt: null,
      unread: false,
      parentBotId: null,
      threadId: "thr_123456789012345678901234",
      preview: "Ready",
      status: "ready",
      computerMode: "team" as const,
      updatedAt: "2026-08-29T10:00:00.000Z",
      createdAt: "2026-08-29T10:00:00.000Z",
      voiceId: null,
      autoSpeak: false,
    };

    it("parses legacy bots without inference property", () => {
      const parsed = BotSchema.parse(baseBotPayload);
      expect(parsed.inference).toBeUndefined();
      expect(parsed.name).toBe("Assistant Bot");
    });

    it("parses bots with explicit free inference configuration", () => {
      const botWithInference = {
        ...baseBotPayload,
        inference: {
          mode: "free" as const,
          tags: ["coding" as const, "fast" as const],
        },
      };
      const parsed = BotSchema.parse(botWithInference);
      expect(parsed.inference).toBeDefined();
      expect(parsed.inference?.mode).toBe("free");
      expect(parsed.inference?.tags).toEqual(["coding", "fast"]);
    });
  });

  describe("CreateBotInput extension", () => {
    it("parses create input without inference (defaults preserved)", () => {
      const parsed = CreateBotInput.parse({
        name: "New Bot",
      });
      expect(parsed.name).toBe("New Bot");
      expect(parsed.inference).toBeUndefined();
      expect(parsed.computerMode).toBe("team");
    });

    it("parses create input with inference config", () => {
      const parsed = CreateBotInput.parse({
        name: "Free Coding Bot",
        inference: {
          mode: "free",
          tags: ["coding", "reasoning"],
        },
      });
      expect(parsed.inference).toEqual({
        mode: "free",
        tags: ["coding", "reasoning"],
      });
    });

    it("rejects create input with > 3 inference tags", () => {
      expect(() =>
        CreateBotInput.parse({
          name: "Invalid Bot",
          inference: {
            mode: "free",
            tags: ["coding", "writing", "reasoning", "fast"],
          },
        }),
      ).toThrow(/Maximum 3 usage tags/);
    });
  });

  describe("UpdateBotInput extension", () => {
    it("parses update input without inference", () => {
      const parsed = UpdateBotInput.parse({
        botId: "bot_123456789012345678901234",
        name: "Updated Name",
      });
      expect(parsed.botId).toBe("bot_123456789012345678901234");
      expect(parsed.inference).toBeUndefined();
    });

    it("parses update input with inference", () => {
      const parsed = UpdateBotInput.parse({
        botId: "bot_123456789012345678901234",
        inference: {
          mode: "free",
          tags: ["analysis"],
        },
      });
      expect(parsed.inference).toEqual({
        mode: "free",
        tags: ["analysis"],
      });
    });
  });

  describe("Error constants & messages", () => {
    it("defines exact French user-facing fail-closed error message", () => {
      expect(FREE_INFERENCE_UNAVAILABLE_MESSAGE).toBe(
        "Capacité gratuite temporairement indisponible",
      );
    });

    it("exposes structured error codes", () => {
      expect(FREE_INFERENCE_ERROR_CODES.CAPACITY_UNAVAILABLE).toBe("FREE_CAPACITY_UNAVAILABLE");
      expect(FREE_INFERENCE_ERROR_CODES.POLICY_VIOLATION).toBe("FREE_POLICY_VIOLATION");
      expect(FREE_INFERENCE_ERROR_CODES.TIMEOUT).toBe("FREE_TIMEOUT");
    });
  });
});
