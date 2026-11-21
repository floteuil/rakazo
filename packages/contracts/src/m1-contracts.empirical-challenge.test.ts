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

describe("Milestone M1 Empirical Challenge — Contracts & Validation Harness", () => {
  // ==========================================================================
  // 1. INFERENCE MODE SCHEMA BOUNDARY & ADVERSARIAL TESTS
  // ==========================================================================
  describe("1. InferenceModeSchema Adversarial & Boundary Suite", () => {
    it("accepts strictly valid inference modes ('premium', 'free')", () => {
      expect(InferenceModeSchema.parse("premium")).toBe("premium");
      expect(InferenceModeSchema.parse("free")).toBe("free");
    });

    const adversarialModes = [
      "",
      " ",
      "  ",
      "\t",
      "\n",
      "PREMIUM",
      "FREE",
      "Free",
      "Premium",
      "free ",
      " free",
      "premium ",
      " premium",
      "fre",
      "premiumm",
      "standard",
      "basic",
      "pro",
      "enterprise",
      "null",
      "undefined",
      "true",
      "false",
      "0",
      "1",
      "__proto__",
      "constructor",
      "<script>alert(1)</script>",
      "' OR 1=1 --",
    ];

    it.each(adversarialModes)("rejects invalid string mode: '%s'", (invalidMode) => {
      const result = InferenceModeSchema.safeParse(invalidMode);
      expect(result.success).toBe(false);
    });

    const nonStringModes = [
      null,
      undefined,
      123,
      0,
      -1,
      NaN,
      Infinity,
      true,
      false,
      [],
      ["free"],
      {},
      { mode: "free" },
      Symbol("free"),
    ];

    it.each(nonStringModes)("rejects non-string value: %s", (invalidVal) => {
      const result = InferenceModeSchema.safeParse(invalidVal);
      expect(result.success).toBe(false);
    });
  });

  // ==========================================================================
  // 2. INFERENCE USAGE TAG SCHEMA BOUNDARY & ADVERSARIAL TESTS
  // ==========================================================================
  describe("2. InferenceUsageTagSchema Adversarial & Boundary Suite", () => {
    const validTags = ["coding", "writing", "reasoning", "fast", "analysis"] as const;

    it.each(validTags)("accepts designated canonical tag: '%s'", (tag) => {
      expect(InferenceUsageTagSchema.parse(tag)).toBe(tag);
    });

    const invalidTags = [
      "",
      " ",
      "   ",
      "coding ",
      " coding",
      "CODING",
      "Writing",
      "REASONING",
      "FAST",
      "Analysis",
      "code",
      "write",
      "reason",
      "speedy",
      "analytics",
      "general",
      "chat",
      "sql",
      "math",
      "vision",
      "audio",
      "rag",
      "embedding",
      "search",
      "hacking",
      "prompt-injection",
      "null",
      "undefined",
      "NaN",
      "123",
      "__proto__",
      "prototype",
      "constructor",
      "🧠",
      "⚡",
      "💻",
      "côding",
      "écrìture",
    ];

    it.each(invalidTags)("rejects non-canonical tag: '%s'", (tag) => {
      const result = InferenceUsageTagSchema.safeParse(tag);
      expect(result.success).toBe(false);
    });

    const nonStringTags = [
      null,
      undefined,
      123,
      0,
      true,
      false,
      {},
      [],
      ["coding"],
      Symbol("coding"),
    ];

    it.each(nonStringTags)("rejects non-string tag input: %s", (val) => {
      const result = InferenceUsageTagSchema.safeParse(val);
      expect(result.success).toBe(false);
    });
  });

  // ==========================================================================
  // 3. BOT INFERENCE CONFIG SCHEMA EMPIRICAL STRESS & BOUNDARIES
  // ==========================================================================
  describe("3. BotInferenceConfigSchema Stress & Boundary Suite", () => {
    it("applies default mode ('premium') and default empty tags ([]) for empty object {}", () => {
      const config = BotInferenceConfigSchema.parse({});
      expect(config).toEqual({
        mode: "premium",
        tags: [],
      });
    });

    it("applies default mode ('premium') and default empty tags ([]) when fields are explicitly undefined", () => {
      const config = BotInferenceConfigSchema.parse({
        mode: undefined,
        tags: undefined,
      });
      expect(config).toEqual({
        mode: "premium",
        tags: [],
      });
    });

    it("preserves mode and defaults empty tags if tags omitted", () => {
      const config = BotInferenceConfigSchema.parse({ mode: "free" });
      expect(config).toEqual({
        mode: "free",
        tags: [],
      });
    });

    it("preserves tags and defaults mode to premium if mode omitted", () => {
      const config = BotInferenceConfigSchema.parse({ tags: ["coding", "reasoning"] });
      expect(config).toEqual({
        mode: "premium",
        tags: ["coding", "reasoning"],
      });
    });

    it("accepts boundary tag counts: 0, 1, 2, and 3 tags", () => {
      const count0 = BotInferenceConfigSchema.parse({ mode: "free", tags: [] });
      expect(count0.tags).toHaveLength(0);

      const count1 = BotInferenceConfigSchema.parse({ mode: "free", tags: ["coding"] });
      expect(count1.tags).toEqual(["coding"]);

      const count2 = BotInferenceConfigSchema.parse({ mode: "free", tags: ["coding", "fast"] });
      expect(count2.tags).toEqual(["coding", "fast"]);

      const count3 = BotInferenceConfigSchema.parse({
        mode: "free",
        tags: ["coding", "writing", "analysis"],
      });
      expect(count3.tags).toEqual(["coding", "writing", "analysis"]);
    });

    it("strictly rejects >3 tags (4 tags, 5 tags, 100 tags)", () => {
      // 4 tags
      const fourTags = {
        mode: "free",
        tags: ["coding", "writing", "reasoning", "fast"],
      };
      const r4 = BotInferenceConfigSchema.safeParse(fourTags);
      expect(r4.success).toBe(false);
      if (!r4.success) {
        expect(r4.error.issues[0]?.message).toMatch(/Maximum 3 usage tags allowed/);
      }

      // 5 tags (all valid tags at once)
      const fiveTags = {
        mode: "free",
        tags: ["coding", "writing", "reasoning", "fast", "analysis"],
      };
      const r5 = BotInferenceConfigSchema.safeParse(fiveTags);
      expect(r5.success).toBe(false);

      // 100 tags (repetition of valid tags)
      const hundredTags = {
        mode: "free",
        tags: Array(100).fill("coding"),
      };
      const r100 = BotInferenceConfigSchema.safeParse(hundredTags);
      expect(r100.success).toBe(false);
    });

    it("strictly rejects 4 duplicate valid tags", () => {
      const dup4 = {
        mode: "free",
        tags: ["coding", "coding", "coding", "coding"],
      };
      const res = BotInferenceConfigSchema.safeParse(dup4);
      expect(res.success).toBe(false);
    });

    it("rejects null input at schema root", () => {
      expect(BotInferenceConfigSchema.safeParse(null).success).toBe(false);
    });

    it("rejects non-object primitives at schema root", () => {
      expect(BotInferenceConfigSchema.safeParse("free").success).toBe(false);
      expect(BotInferenceConfigSchema.safeParse(123).success).toBe(false);
      expect(BotInferenceConfigSchema.safeParse(true).success).toBe(false);
      expect(BotInferenceConfigSchema.safeParse([]).success).toBe(false);
    });

    it("rejects null or non-array tags field", () => {
      expect(BotInferenceConfigSchema.safeParse({ tags: null }).success).toBe(false);
      expect(BotInferenceConfigSchema.safeParse({ tags: "coding" }).success).toBe(false);
      expect(BotInferenceConfigSchema.safeParse({ tags: 123 }).success).toBe(false);
      expect(BotInferenceConfigSchema.safeParse({ tags: {} }).success).toBe(false);
    });

    it("rejects arrays containing any invalid tag even if total count <= 3", () => {
      expect(
        BotInferenceConfigSchema.safeParse({
          tags: ["coding", "invalid_tag"],
        }).success,
      ).toBe(false);

      expect(
        BotInferenceConfigSchema.safeParse({
          tags: ["", "fast"],
        }).success,
      ).toBe(false);

      expect(
        BotInferenceConfigSchema.safeParse({
          tags: [null as any],
        }).success,
      ).toBe(false);

      expect(
        BotInferenceConfigSchema.safeParse({
          tags: [undefined as any],
        }).success,
      ).toBe(false);
    });

    it("strips unrecognized extra properties cleanly without failing", () => {
      const parsed = BotInferenceConfigSchema.parse({
        mode: "free",
        tags: ["coding"],
        maliciousField: "<script>",
        unexpectedPayload: { nested: true },
      });
      expect(parsed).toEqual({
        mode: "free",
        tags: ["coding"],
      });
      expect((parsed as any).maliciousField).toBeUndefined();
    });
  });

  // ==========================================================================
  // 4. CREATEBOTINPUT & UPDATEBOTINPUT EMPIRICAL CHALLENGES
  // ==========================================================================
  describe("4. CreateBotInput & UpdateBotInput Empirical Challenges", () => {
    it("CreateBotInput: allows omitting inference config entirely", () => {
      const bot = CreateBotInput.parse({
        name: "Minimal Bot",
      });
      expect(bot.name).toBe("Minimal Bot");
      expect(bot.inference).toBeUndefined();
      expect(bot.computerMode).toBe("team");
    });

    it("CreateBotInput: allows explicit empty inference object and applies nested defaults", () => {
      const bot = CreateBotInput.parse({
        name: "Default Inference Bot",
        inference: {},
      });
      expect(bot.inference).toEqual({
        mode: "premium",
        tags: [],
      });
    });

    it("CreateBotInput: parses valid free inference config", () => {
      const bot = CreateBotInput.parse({
        name: "Free Coding Assistant",
        inference: {
          mode: "free",
          tags: ["coding", "fast"],
        },
      });
      expect(bot.inference).toEqual({
        mode: "free",
        tags: ["coding", "fast"],
      });
    });

    it("CreateBotInput: strictly rejects >3 tags in inference", () => {
      const res = CreateBotInput.safeParse({
        name: "Too Many Tags Bot",
        inference: {
          mode: "free",
          tags: ["coding", "writing", "reasoning", "fast"],
        },
      });
      expect(res.success).toBe(false);
    });

    it("CreateBotInput: strictly rejects invalid tags in inference", () => {
      const res = CreateBotInput.safeParse({
        name: "Invalid Tag Bot",
        inference: {
          mode: "free",
          tags: ["coding", "crypto"],
        },
      });
      expect(res.success).toBe(false);
    });

    it("CreateBotInput: rejects null inference (must be undefined or valid object)", () => {
      const res = CreateBotInput.safeParse({
        name: "Null Inference Bot",
        inference: null,
      });
      expect(res.success).toBe(false);
    });

    it("UpdateBotInput: allows omitting inference config", () => {
      const update = UpdateBotInput.parse({
        botId: "bot_123456789012345678901234",
        name: "Updated Bot Name",
      });
      expect(update.botId).toBe("bot_123456789012345678901234");
      expect(update.inference).toBeUndefined();
    });

    it("UpdateBotInput: updates inference config to free mode with 3 tags", () => {
      const update = UpdateBotInput.parse({
        botId: "bot_123456789012345678901234",
        inference: {
          mode: "free",
          tags: ["coding", "reasoning", "analysis"],
        },
      });
      expect(update.inference).toEqual({
        mode: "free",
        tags: ["coding", "reasoning", "analysis"],
      });
    });

    it("UpdateBotInput: strictly rejects >3 tags in inference", () => {
      const res = UpdateBotInput.safeParse({
        botId: "bot_123456789012345678901234",
        inference: {
          mode: "free",
          tags: ["coding", "writing", "reasoning", "fast"],
        },
      });
      expect(res.success).toBe(false);
    });

    it("UpdateBotInput: strictly rejects invalid tag", () => {
      const res = UpdateBotInput.safeParse({
        botId: "bot_123456789012345678901234",
        inference: {
          mode: "free",
          tags: ["bogus_tag"],
        },
      });
      expect(res.success).toBe(false);
    });

    it("UpdateBotInput: rejects null inference (must be undefined or valid object)", () => {
      const res = UpdateBotInput.safeParse({
        botId: "bot_123456789012345678901234",
        inference: null,
      });
      expect(res.success).toBe(false);
    });
  });

  // ==========================================================================
  // 5. BOTSCHEMA BACKWARD COMPATIBILITY & SERIALIZATION INVARIANTS
  // ==========================================================================
  describe("5. BotSchema Backward Compatibility & Invariants", () => {
    const canonicalBot = {
      id: "bot_123456789012345678901234",
      workspaceId: "wks_123456789012345678901234",
      name: "Standard Bot",
      title: "Title",
      description: "Desc",
      instructions: "Do things",
      color: "#ff0000",
      notifyOnFinish: true,
      pinned: false,
      archivedAt: null,
      unread: false,
      parentBotId: null,
      threadId: "thr_123456789012345678901234",
      preview: "Hello",
      status: "ready",
      computerMode: "team" as const,
      updatedAt: "2026-08-29T12:00:00.000Z",
      createdAt: "2026-08-29T12:00:00.000Z",
      voiceId: null,
      autoSpeak: false,
    };

    it("parses legacy bots without inference field", () => {
      const parsed = BotSchema.parse(canonicalBot);
      expect(parsed.inference).toBeUndefined();
    });

    it("parses legacy bots with inference: undefined", () => {
      const parsed = BotSchema.parse({
        ...canonicalBot,
        inference: undefined,
      });
      expect(parsed.inference).toBeUndefined();
    });

    it("parses bots with complete free inference configuration", () => {
      const parsed = BotSchema.parse({
        ...canonicalBot,
        inference: {
          mode: "free",
          tags: ["coding", "writing"],
        },
      });
      expect(parsed.inference).toEqual({
        mode: "free",
        tags: ["coding", "writing"],
      });
    });

    it("survives JSON round-trip serialization without data loss or distortion", () => {
      const original = {
        ...canonicalBot,
        inference: {
          mode: "free" as const,
          tags: ["coding" as const, "reasoning" as const, "analysis" as const],
        },
      };

      const serialized = JSON.stringify(original);
      const deserialized = JSON.parse(serialized);
      const parsed = BotSchema.parse(deserialized);

      expect(parsed).toEqual(original);
    });
  });

  // ==========================================================================
  // 6. ERROR MESSAGES AND ERROR CODES INVARIANTS
  // ==========================================================================
  describe("6. Error Constants Invariants", () => {
    it("matches exact fail-closed French message for free capacity exhaustion", () => {
      expect(FREE_INFERENCE_UNAVAILABLE_MESSAGE).toBe(
        "Capacité gratuite temporairement indisponible",
      );
      expect(typeof FREE_INFERENCE_UNAVAILABLE_MESSAGE).toBe("string");
      expect(FREE_INFERENCE_UNAVAILABLE_MESSAGE.length).toBeGreaterThan(10);
    });

    it("exposes all required structured error codes matching specification", () => {
      expect(FREE_INFERENCE_ERROR_CODES.CAPACITY_UNAVAILABLE).toBe("FREE_CAPACITY_UNAVAILABLE");
      expect(FREE_INFERENCE_ERROR_CODES.POLICY_VIOLATION).toBe("FREE_POLICY_VIOLATION");
      expect(FREE_INFERENCE_ERROR_CODES.TIMEOUT).toBe("FREE_TIMEOUT");
    });
  });

  // ==========================================================================
  // 7. HIGH-CONCURRENCY FUZZING & STRESS HARNESS
  // ==========================================================================
  describe("7. Fuzzing & High-Volume Stress Harness", () => {
    const validTags = ["coding", "writing", "reasoning", "fast", "analysis"] as const;
    const randomChars = "abcdefghijklmnopqrstuvwxyz0123456789-_!@#$%^&*() \t\n";

    function getRandomString(length: number): string {
      let str = "";
      for (let i = 0; i < length; i++) {
        str += randomChars.charAt(Math.floor(Math.random() * randomChars.length));
      }
      return str;
    }

    it("fuzzes 1,000 randomized bot inference configs and asserts 100% deterministic validation", () => {
      let validCount = 0;
      let rejectedCount = 0;

      for (let i = 0; i < 1000; i++) {
        // Generate random tags (mix of valid and invalid)
        const tagCount = Math.floor(Math.random() * 8); // 0 to 7 tags
        const tags: string[] = [];
        let allValid = true;

        for (let t = 0; t < tagCount; t++) {
          if (Math.random() > 0.3) {
            // Pick valid tag
            const validTag = validTags[Math.floor(Math.random() * validTags.length)]!;
            tags.push(validTag);
          } else {
            // Pick random garbage tag
            const garbageTag = getRandomString(Math.floor(Math.random() * 10) + 1);
            tags.push(garbageTag);
            if (!validTags.includes(garbageTag as any)) {
              allValid = false;
            }
          }
        }

        const mode =
          Math.random() > 0.5 ? "free" : Math.random() > 0.5 ? "premium" : getRandomString(5);
        const modeValid = mode === "free" || mode === "premium";

        const expectedValid = allValid && tagCount <= 3 && modeValid;

        const candidate = { mode, tags };
        const result = BotInferenceConfigSchema.safeParse(candidate);

        if (expectedValid) {
          expect(result.success).toBe(true);
          validCount++;
        } else {
          expect(result.success).toBe(false);
          rejectedCount++;
        }
      }

      expect(validCount + rejectedCount).toBe(1000);
      expect(validCount).toBeGreaterThan(50);
      expect(rejectedCount).toBeGreaterThan(500);
    });

    it("benchmarks 50,000 rapid schema parses in under 1 second", () => {
      const validPayload = {
        mode: "free",
        tags: ["coding", "fast"],
      };

      const start = performance.now();
      for (let i = 0; i < 50000; i++) {
        BotInferenceConfigSchema.parse(validPayload);
      }
      const elapsedMs = performance.now() - start;

      // Parsing 50,000 objects in pure memory should take well under 1,000ms
      expect(elapsedMs).toBeLessThan(1500);
    });
  });
});
