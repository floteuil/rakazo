import type { Actor, BotInferenceConfig, InferenceUsageTag } from "@rakazo/contracts";
import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "./client.js";
import { createRepos } from "./repos.js";
import { IsolationError } from "./scope.js";

describe("Empirical Challenger M1: Free Mode Persistence Integrity & Escalation Defenses", () => {
  const actor: Actor = {
    userId: "user-challenger-1",
    workspaceId: "ws-challenger-1",
    email: "challenger@example.com",
    isDeploymentOwner: true,
  };

  const sampleDate = new Date("2026-08-31T10:00:00.000Z");

  const baseDbBot = {
    id: "bot-base",
    workspaceId: actor.workspaceId,
    userId: actor.userId,
    name: "Base Test Bot",
    title: "Base Title",
    description: "Base Description",
    instructions: "Base Instructions",
    color: "#4F46E5",
    notifyOnFinish: true,
    pinned: false,
    archivedAt: null,
    parentBotId: null,
    computerId: "comp-1",
    computerSwitching: false,
    voiceId: null,
    autoSpeak: false,
    metadata: {},
    createdAt: sampleDate,
    updatedAt: sampleDate,
    thread: {
      id: "thread-1",
      unread: false,
      messages: [{ blocks: [{ text: "Bonjour !" }] }],
    },
    runs: [{ status: "idle" }],
    computer: { scope: "team" },
  };

  function createMockTx(createdBot: any) {
    return {
      computer: { upsert: vi.fn().mockResolvedValue({ id: "comp-team", scope: "team" }) },
      bot: {
        create: vi.fn().mockResolvedValue(createdBot),
        findFirstOrThrow: vi.fn().mockResolvedValue(createdBot),
      },
      thread: { create: vi.fn().mockResolvedValue({ id: "thread-new" }) },
      browserProfile: { create: vi.fn().mockResolvedValue({ id: "bp-1" }) },
      memoryDocument: { create: vi.fn().mockResolvedValue({ id: "mem-1" }) },
    };
  }

  // =========================================================================
  // 1. PERSISTENCE OF ALL 5 USAGE TAGS IN ISOLATION & COMBINATIONS
  // =========================================================================
  describe("1. Usage Tags Persistence (Isolation & Combinations)", () => {
    const allTags: InferenceUsageTag[] = ["coding", "writing", "reasoning", "fast", "analysis"];

    it.each(allTags)("persists single tag in isolation: %s", async (tag) => {
      const mockCreated = {
        ...baseDbBot,
        id: `bot-iso-${tag}`,
        metadata: {
          inference: { mode: "free", tags: [tag] },
        },
      };
      const tx = createMockTx(mockCreated);
      const prisma = {
        bot: { count: vi.fn().mockResolvedValue(0) },
        deploymentSettings: { findUnique: vi.fn().mockResolvedValue(null) },
        $transaction: vi.fn().mockImplementation(async (cb) => cb(tx)),
      } as unknown as PrismaClient;

      const repos = createRepos(prisma);
      const bot = await repos.createBot(actor, {
        name: `Bot-${tag}`,
        title: "Test",
        description: "Test",
        instructions: "Test",
        notifyOnFinish: true,
        inference: { mode: "free", tags: [tag] },
      });

      expect(tx.bot.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          metadata: {
            inference: { mode: "free", tags: [tag] },
          },
        }),
      });
      expect(bot.inference).toEqual({
        mode: "free",
        tags: [tag],
      });
    });

    const multiTagCombinations: InferenceUsageTag[][] = [
      ["coding", "reasoning"],
      ["writing", "fast"],
      ["analysis", "coding"],
      ["reasoning", "analysis"],
      ["fast", "writing"],
      ["coding", "reasoning", "analysis"],
      ["fast", "writing", "coding"],
      ["reasoning", "writing", "analysis"],
    ];

    it.each(multiTagCombinations)(
      "persists multi-tag combinations correctly: %j",
      async (...tags) => {
        const tagList = tags;
        const mockCreated = {
          ...baseDbBot,
          id: `bot-multi-${tagList.join("-")}`,
          metadata: {
            inference: { mode: "free", tags: tagList },
          },
        };
        const tx = createMockTx(mockCreated);
        const prisma = {
          bot: { count: vi.fn().mockResolvedValue(0) },
          deploymentSettings: { findUnique: vi.fn().mockResolvedValue(null) },
          $transaction: vi.fn().mockImplementation(async (cb) => cb(tx)),
        } as unknown as PrismaClient;

        const repos = createRepos(prisma);
        const bot = await repos.createBot(actor, {
          name: `Bot-${tagList.join("-")}`,
          title: "Multi-tag",
          description: "Test",
          instructions: "Test",
          notifyOnFinish: true,
          inference: { mode: "free", tags: tagList },
        });

        expect(tx.bot.create).toHaveBeenCalledWith({
          data: expect.objectContaining({
            metadata: {
              inference: { mode: "free", tags: tagList },
            },
          }),
        });
        expect(bot.inference).toEqual({
          mode: "free",
          tags: tagList,
        });
      },
    );
  });

  // =========================================================================
  // 2. BOUNDARY TESTS (EMPTY ARRAY, UNDEFINED, MAX 3, OVERFLOW, INVALID TAGS)
  // =========================================================================
  describe("2. Boundary & Edge Case Mining", () => {
    it("handles empty tags array cleanly", async () => {
      const mockCreated = {
        ...baseDbBot,
        id: "bot-empty-tags",
        metadata: {
          inference: { mode: "free", tags: [] },
        },
      };
      const tx = createMockTx(mockCreated);
      const prisma = {
        bot: { count: vi.fn().mockResolvedValue(0) },
        deploymentSettings: { findUnique: vi.fn().mockResolvedValue(null) },
        $transaction: vi.fn().mockImplementation(async (cb) => cb(tx)),
      } as unknown as PrismaClient;

      const repos = createRepos(prisma);
      const bot = await repos.createBot(actor, {
        name: "Bot Empty Tags",
        title: "Test",
        description: "Test",
        instructions: "Test",
        notifyOnFinish: true,
        inference: { mode: "free", tags: [] },
      });

      expect(bot.inference).toEqual({ mode: "free", tags: [] });
    });

    it("handles undefined inference parameter without populating inference metadata", async () => {
      const mockCreated = {
        ...baseDbBot,
        id: "bot-undef-inference",
        metadata: {},
      };
      const tx = createMockTx(mockCreated);
      const prisma = {
        bot: { count: vi.fn().mockResolvedValue(0) },
        deploymentSettings: { findUnique: vi.fn().mockResolvedValue(null) },
        $transaction: vi.fn().mockImplementation(async (cb) => cb(tx)),
      } as unknown as PrismaClient;

      const repos = createRepos(prisma);
      const bot = await repos.createBot(actor, {
        name: "Bot Undefined",
        title: "Test",
        description: "Test",
        instructions: "Test",
        notifyOnFinish: true,
      });

      expect(tx.bot.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          metadata: {},
        }),
      });
      expect(bot.inference).toBeUndefined();
    });

    it("strictly bounds tags to maximum 3 when raw DB metadata contains >3 tags", async () => {
      const dbBotOverflow = {
        ...baseDbBot,
        id: "bot-overflow",
        metadata: {
          inference: {
            mode: "free",
            tags: ["coding", "writing", "reasoning", "fast", "analysis"],
          },
        },
      };

      const prisma = {
        bot: {
          findMany: vi.fn().mockResolvedValue([dbBotOverflow]),
        },
      } as unknown as PrismaClient;

      const repos = createRepos(prisma);
      const bots = await repos.listBots(actor);

      expect(bots).toHaveLength(1);
      expect(bots[0]!.inference).toEqual({
        mode: "free",
        tags: ["coding", "writing", "reasoning"],
      });
      expect(bots[0]!.inference?.tags).toHaveLength(3);
    });

    it("filters out invalid/corrupted tag values in raw DB metadata", async () => {
      const dbBotCorruptedTags = {
        ...baseDbBot,
        id: "bot-corrupt-tags",
        metadata: {
          inference: {
            mode: "free",
            tags: ["coding", "malicious_script", 1234, null, "reasoning", true, "writing"],
          },
        },
      };

      const prisma = {
        bot: {
          findMany: vi.fn().mockResolvedValue([dbBotCorruptedTags]),
        },
      } as unknown as PrismaClient;

      const repos = createRepos(prisma);
      const bots = await repos.listBots(actor);

      expect(bots[0]!.inference).toEqual({
        mode: "free",
        tags: ["coding", "reasoning", "writing"],
      });
    });

    it("recovers gracefully when metadata is a stringified JSON object", async () => {
      const dbBotStringMeta = {
        ...baseDbBot,
        id: "bot-json-string",
        metadata: JSON.stringify({
          inference: {
            mode: "free",
            tags: ["analysis", "fast"],
          },
        }),
      };

      const prisma = {
        bot: {
          findMany: vi.fn().mockResolvedValue([dbBotStringMeta]),
        },
      } as unknown as PrismaClient;

      const repos = createRepos(prisma);
      const bots = await repos.listBots(actor);

      expect(bots[0]!.inference).toEqual({
        mode: "free",
        tags: ["analysis", "fast"],
      });
    });

    it("recovers gracefully when metadata is malformed JSON string without throwing", async () => {
      const dbBotMalformed = {
        ...baseDbBot,
        id: "bot-malformed",
        metadata: "{invalid-json-content",
      };

      const prisma = {
        bot: {
          findMany: vi.fn().mockResolvedValue([dbBotMalformed]),
        },
      } as unknown as PrismaClient;

      const repos = createRepos(prisma);
      const bots = await repos.listBots(actor);

      expect(bots[0]!.inference).toBeUndefined();
    });
  });

  // =========================================================================
  // 3. PRIVILEGE ESCALATION DEFENSE (CHILD BOTS OF FREE PARENTS)
  // =========================================================================
  describe("3. Privilege Escalation Defense", () => {
    it("forces child bot to Free mode when parent is Free, even if child requests Premium", async () => {
      const parentFreeBot = {
        ...baseDbBot,
        id: "parent-free-1",
        metadata: {
          inference: {
            mode: "free",
            tags: ["reasoning"],
          },
        },
      };

      const mockChild = {
        ...baseDbBot,
        id: "child-bot-1",
        parentBotId: "parent-free-1",
        metadata: {
          inference: {
            mode: "free",
            tags: ["coding"],
          },
        },
      };

      const tx = createMockTx(mockChild);
      const prisma = {
        bot: {
          count: vi.fn().mockResolvedValue(1),
          findFirst: vi.fn().mockResolvedValue(parentFreeBot),
        },
        deploymentSettings: { findUnique: vi.fn().mockResolvedValue(null) },
        $transaction: vi.fn().mockImplementation(async (cb) => cb(tx)),
      } as unknown as PrismaClient;

      const repos = createRepos(prisma);
      const child = await repos.createBot(actor, {
        name: "Child Bot Escalation Attempt",
        title: "Escalation",
        description: "Attempting premium override",
        instructions: "Do stuff",
        notifyOnFinish: true,
        parentBotId: "parent-free-1",
        inference: {
          mode: "premium" as any,
          tags: ["coding"],
        },
      });

      expect(tx.bot.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          parentBotId: "parent-free-1",
          metadata: {
            inference: {
              mode: "free",
              tags: ["coding"],
            },
          },
        }),
      });
      expect(child.inference).toEqual({
        mode: "free",
        tags: ["coding"],
      });
    });

    it("inherits parent Free tags if child provides no explicit inference", async () => {
      const parentFreeBot = {
        ...baseDbBot,
        id: "parent-free-2",
        metadata: {
          inference: {
            mode: "free",
            tags: ["writing", "analysis"],
          },
        },
      };

      const mockChild = {
        ...baseDbBot,
        id: "child-bot-2",
        parentBotId: "parent-free-2",
        metadata: {
          inference: {
            mode: "free",
            tags: ["writing", "analysis"],
          },
        },
      };

      const tx = createMockTx(mockChild);
      const prisma = {
        bot: {
          count: vi.fn().mockResolvedValue(1),
          findFirst: vi.fn().mockResolvedValue(parentFreeBot),
        },
        deploymentSettings: { findUnique: vi.fn().mockResolvedValue(null) },
        $transaction: vi.fn().mockImplementation(async (cb) => cb(tx)),
      } as unknown as PrismaClient;

      const repos = createRepos(prisma);
      const child = await repos.createBot(actor, {
        name: "Child Bot Inherit Tags",
        title: "Inherit",
        description: "Test",
        instructions: "Test",
        notifyOnFinish: true,
        parentBotId: "parent-free-2",
      });

      expect(tx.bot.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          parentBotId: "parent-free-2",
          metadata: {
            inference: {
              mode: "free",
              tags: ["writing", "analysis"],
            },
          },
        }),
      });
      expect(child.inference).toEqual({
        mode: "free",
        tags: ["writing", "analysis"],
      });
    });

    it("allows child to be Premium if parent bot is Premium", async () => {
      const parentPremiumBot = {
        ...baseDbBot,
        id: "parent-premium-1",
        metadata: {
          inference: {
            mode: "premium",
            tags: [],
          },
        },
      };

      const mockChild = {
        ...baseDbBot,
        id: "child-premium-1",
        parentBotId: "parent-premium-1",
        metadata: {
          inference: {
            mode: "premium",
            tags: [],
          },
        },
      };

      const tx = createMockTx(mockChild);
      const prisma = {
        bot: {
          count: vi.fn().mockResolvedValue(1),
          findFirst: vi.fn().mockResolvedValue(parentPremiumBot),
        },
        deploymentSettings: { findUnique: vi.fn().mockResolvedValue(null) },
        $transaction: vi.fn().mockImplementation(async (cb) => cb(tx)),
      } as unknown as PrismaClient;

      const repos = createRepos(prisma);
      const child = await repos.createBot(actor, {
        name: "Child Premium",
        title: "Premium",
        description: "Test",
        instructions: "Test",
        notifyOnFinish: true,
        parentBotId: "parent-premium-1",
        inference: {
          mode: "premium",
          tags: [],
        },
      });

      expect(child.inference).toEqual({
        mode: "premium",
        tags: [],
      });
    });

    it("throws IsolationError when parentBotId does not belong to actor workspace", async () => {
      const prisma = {
        bot: {
          count: vi.fn().mockResolvedValue(0),
          findFirst: vi.fn().mockResolvedValue(null),
        },
      } as unknown as PrismaClient;

      const repos = createRepos(prisma);
      await expect(
        repos.createBot(actor, {
          name: "Child Bot Unauthorized Parent",
          title: "Test",
          description: "Test",
          instructions: "Test",
          notifyOnFinish: true,
          parentBotId: "foreign-parent-id",
        }),
      ).rejects.toThrow(IsolationError);
    });
  });

  // =========================================================================
  // 4. LEGACY COMPATIBILITY
  // =========================================================================
  describe("4. Legacy Compatibility & Backward Mapping", () => {
    it("maps bots without inference in metadata cleanly to undefined", async () => {
      const legacyDbBot = {
        ...baseDbBot,
        id: "bot-legacy-1",
        metadata: {
          mcp: {
            connectors: { github: true },
            tools: { search_repos: true },
          },
        },
      };

      const prisma = {
        bot: {
          findMany: vi.fn().mockResolvedValue([legacyDbBot]),
        },
      } as unknown as PrismaClient;

      const repos = createRepos(prisma);
      const bots = await repos.listBots(actor);

      expect(bots).toHaveLength(1);
      expect(bots[0]!.inference).toBeUndefined();
      expect(bots[0]!.metadata).toEqual({
        mcp: {
          connectors: { github: true },
          tools: { search_repos: true },
        },
      });
    });

    it("maps bots with null or empty metadata cleanly to undefined", async () => {
      const nullMetaBot = {
        ...baseDbBot,
        id: "bot-null-meta",
        metadata: null,
      };

      const prisma = {
        bot: {
          findMany: vi.fn().mockResolvedValue([nullMetaBot]),
        },
      } as unknown as PrismaClient;

      const repos = createRepos(prisma);
      const bots = await repos.listBots(actor);

      expect(bots[0]!.inference).toBeUndefined();
      expect(bots[0]!.metadata).toEqual({});
    });
  });

  // =========================================================================
  // 5. SEQUENTIAL MUTATION INTEGRITY & IDEMPOTENCY
  // =========================================================================
  describe("5. Sequential Mutation Integrity", () => {
    it("preserves, updates, and transitions tags correctly over sequential mutations", async () => {
      let currentDbBot = {
        ...baseDbBot,
        id: "bot-mutate-1",
        title: "Initial Title",
        metadata: {
          mcp: { connectors: { searxng: true } },
          inference: { mode: "free", tags: ["coding"] },
        },
      };

      const findFirst = vi.fn().mockImplementation(async () => currentDbBot);
      const update = vi.fn().mockImplementation(async ({ data }) => {
        currentDbBot = {
          ...currentDbBot,
          ...data,
          metadata: data.metadata ?? currentDbBot.metadata,
        };
        return currentDbBot;
      });
      const findMany = vi.fn().mockImplementation(async () => [currentDbBot]);

      const prisma = {
        bot: { findFirst, update, findMany },
      } as unknown as PrismaClient;

      const repos = createRepos(prisma);

      // Mutation 1: Update tags to ["reasoning", "fast"]
      const step1 = await repos.updateBot(actor, {
        botId: "bot-mutate-1",
        inference: { mode: "free", tags: ["reasoning", "fast"] },
      });
      expect(step1.inference).toEqual({ mode: "free", tags: ["reasoning", "fast"] });
      expect(step1.metadata).toEqual({
        mcp: { connectors: { searxng: true } },
        inference: { mode: "free", tags: ["reasoning", "fast"] },
      });

      // Mutation 2: Update only scalar field (title) — inference MUST remain intact
      const step2 = await repos.updateBot(actor, {
        botId: "bot-mutate-1",
        title: "Mutated Title V2",
      });
      expect(step2.title).toBe("Mutated Title V2");
      expect(step2.inference).toEqual({ mode: "free", tags: ["reasoning", "fast"] });

      // Mutation 3: Update tags to [] (empty tags array)
      const step3 = await repos.updateBot(actor, {
        botId: "bot-mutate-1",
        inference: { mode: "free", tags: [] },
      });
      expect(step3.inference).toEqual({ mode: "free", tags: [] });

      // Mutation 4: Switch mode to premium
      const step4 = await repos.updateBot(actor, {
        botId: "bot-mutate-1",
        inference: { mode: "premium", tags: [] },
      });
      expect(step4.inference).toEqual({ mode: "premium", tags: [] });

      // Mutation 5: Switch back to free with 3 tags
      const step5 = await repos.updateBot(actor, {
        botId: "bot-mutate-1",
        inference: { mode: "free", tags: ["coding", "analysis", "writing"] },
      });
      expect(step5.inference).toEqual({
        mode: "free",
        tags: ["coding", "analysis", "writing"],
      });
      expect(step5.metadata).toEqual({
        mcp: { connectors: { searxng: true } },
        inference: { mode: "free", tags: ["coding", "analysis", "writing"] },
      });
    });
  });
});
