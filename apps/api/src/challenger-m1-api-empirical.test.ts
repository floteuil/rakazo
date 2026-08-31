import { createRouterClient } from "@orpc/server";
import type { Actor, BotInferenceConfig, InferenceUsageTag } from "@rakazo/contracts";
import type { PrismaClient } from "@rakazo/db";
import { createRepos } from "@rakazo/db";
import { describe, expect, it, vi } from "vitest";
import { createRouter, type RouterDeps } from "./router.js";

describe("Empirical Challenger M1: API Router Persistence & Escalation Defenses", () => {
  const actor: Actor = {
    userId: "user-challenger-api",
    workspaceId: "ws-challenger-api",
    email: "challenger@example.com",
    isDeploymentOwner: true,
  };

  const sampleDate = new Date("2026-08-31T10:00:00.000Z");

  const sampleDbBot = {
    id: "bot_api_base",
    workspaceId: actor.workspaceId,
    userId: actor.userId,
    name: "Base Bot",
    title: "Base Title",
    description: "Base Desc",
    instructions: "Base Prompt",
    color: "#3B82F6",
    notifyOnFinish: true,
    pinned: false,
    archivedAt: null,
    parentBotId: null,
    spawnKey: null,
    computerId: "comp-1",
    computerSwitching: false,
    voiceId: null,
    autoSpeak: false,
    metadata: {},
    createdAt: sampleDate,
    updatedAt: sampleDate,
    thread: { id: "thr_001", unread: false, messages: [] },
    computer: { id: "comp-1", scope: "team", kind: "docker" },
    runs: [],
  };

  function createMockDeps(prismaMock: Partial<PrismaClient>): RouterDeps {
    return {
      prisma: prismaMock as PrismaClient,
      events: {
        follow: vi.fn(),
        sendUserMessage: vi.fn(),
        clearThread: vi.fn(),
        answerRunInput: vi.fn(),
      } as any,
      auth: {
        api: { getSession: vi.fn() },
      } as any,
      jobs: {
        enqueue: vi.fn(),
        cancel: vi.fn(),
      } as any,
      sandbox: {
        stop: vi.fn(),
        releaseScreen: vi.fn(),
      } as any,
      memory: {} as any,
      home: {} as any,
      secrets: {} as any,
      oauthLogins: {
        begin: vi.fn(),
        complete: vi.fn(),
        finish: vi.fn(),
        cancel: vi.fn(),
      } as any,
      artifacts: {} as any,
      dataDir: "/tmp/rakazo-challenger-api-test",
      env: {
        defaultProvider: "meta-llama",
        defaultModel: "meta-llama/llama-3.3-70b-instruct:free",
        webOrigin: "http://127.0.0.1:5173",
        screenProxySecret: "secret",
        sandboxProvider: "docker",
      },
    };
  }

  // =========================================================================
  // 1. ALL 5 USAGE TAGS IN ISOLATION & COMBINATIONS (API LEVEL)
  // =========================================================================
  describe("1. All 5 Usage Tags via API", () => {
    const allTags: InferenceUsageTag[] = ["coding", "writing", "reasoning", "fast", "analysis"];

    it.each(allTags)("creates and returns bot with isolated tag: %s", async (tag) => {
      const createdBot = {
        ...sampleDbBot,
        id: `bot_tag_${tag}`,
        name: `Bot ${tag}`,
        metadata: {
          inference: { mode: "free", tags: [tag] },
        },
      };

      const tx = {
        computer: { upsert: vi.fn().mockResolvedValue({ id: "comp-1", scope: "team" }) },
        bot: {
          create: vi.fn().mockResolvedValue(createdBot),
          findFirstOrThrow: vi.fn().mockResolvedValue(createdBot),
        },
        thread: { create: vi.fn().mockResolvedValue({ id: "thr_new" }) },
        browserProfile: { create: vi.fn().mockResolvedValue({ id: "bp_new" }) },
        memoryDocument: { create: vi.fn().mockResolvedValue({ id: "mem_new" }) },
      };

      const prisma = {
        bot: { count: vi.fn().mockResolvedValue(0) },
        deploymentSettings: { findUnique: vi.fn().mockResolvedValue(null) },
        $transaction: vi.fn().mockImplementation(async (cb) => cb(tx)),
      };

      const router = createRouter(createMockDeps(prisma as any));
      const client = createRouterClient(router, { context: { actor } });

      const res = await client.bots.create({
        name: `Bot ${tag}`,
        title: "Test Title",
        description: "Test Desc",
        instructions: "Test Inst",
        notifyOnFinish: true,
        inference: {
          mode: "free",
          tags: [tag],
        },
      });

      expect(res.inference).toEqual({ mode: "free", tags: [tag] });
      expect(tx.bot.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          metadata: {
            inference: { mode: "free", tags: [tag] },
          },
        }),
      });
    });
  });

  // =========================================================================
  // 2. PRIVILEGE ESCALATION DEFENSE & DUPLICATION INFERENCE FIDELITY
  // =========================================================================
  describe("2. Privilege Escalation Defense & Duplication Integrity", () => {
    it("neutralizes premium request when creating child bot for Free parent", async () => {
      const parentFreeBot = {
        ...sampleDbBot,
        id: "parent_free_api",
        name: "Parent Free",
        metadata: {
          inference: { mode: "free", tags: ["reasoning"] },
        },
      };

      const childForcedFreeBot = {
        ...sampleDbBot,
        id: "child_free_api",
        name: "Child Attacker",
        parentBotId: "parent_free_api",
        metadata: {
          inference: { mode: "free", tags: ["coding"] },
        },
      };

      const tx = {
        computer: { upsert: vi.fn().mockResolvedValue({ id: "comp-1", scope: "team" }) },
        bot: {
          create: vi.fn().mockResolvedValue(childForcedFreeBot),
          findFirstOrThrow: vi.fn().mockResolvedValue(childForcedFreeBot),
        },
        thread: { create: vi.fn().mockResolvedValue({ id: "thr_child" }) },
        browserProfile: { create: vi.fn().mockResolvedValue({ id: "bp_child" }) },
        memoryDocument: { create: vi.fn().mockResolvedValue({ id: "mem_child" }) },
      };

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
        name: "Child Attacker",
        title: "Child",
        description: "Attempting escalation to premium",
        instructions: "Do stuff",
        notifyOnFinish: false,
        parentBotId: "parent_free_api",
        inference: {
          mode: "premium" as any,
          tags: ["coding"],
        },
      });

      expect(child.inference).toEqual({ mode: "free", tags: ["coding"] });
      expect(tx.bot.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          parentBotId: "parent_free_api",
          metadata: {
            inference: { mode: "free", tags: ["coding"] },
          },
        }),
      });
    });

    it("faithfully clones Free mode and tags during bots.duplicate procedure", async () => {
      const sourceBot = {
        ...sampleDbBot,
        id: "bot_source_free",
        name: "Source Free Bot",
        metadata: {
          inference: { mode: "free", tags: ["coding", "fast"] },
        },
      };

      const duplicatedBot = {
        ...sampleDbBot,
        id: "bot_dup_free",
        name: "Source Free Bot copy",
        metadata: {
          inference: { mode: "free", tags: ["coding", "fast"] },
        },
      };

      const tx = {
        computer: { upsert: vi.fn().mockResolvedValue({ id: "comp-1", scope: "team" }) },
        bot: {
          create: vi.fn().mockResolvedValue(duplicatedBot),
          findFirstOrThrow: vi.fn().mockResolvedValue(duplicatedBot),
        },
        thread: { create: vi.fn().mockResolvedValue({ id: "thr_dup" }) },
        browserProfile: { create: vi.fn().mockResolvedValue({ id: "bp_dup" }) },
        memoryDocument: { create: vi.fn().mockResolvedValue({ id: "mem_dup" }) },
      };

      const prisma = {
        bot: {
          findFirst: vi.fn().mockResolvedValue(sourceBot),
          count: vi.fn().mockResolvedValue(1),
        },
        deploymentSettings: { findUnique: vi.fn().mockResolvedValue(null) },
        $transaction: vi.fn().mockImplementation(async (cb) => cb(tx)),
      };

      const router = createRouter(createMockDeps(prisma as any));
      const client = createRouterClient(router, { context: { actor } });

      const res = await client.bots.duplicate({
        botId: "bot_source_free",
      });

      expect(res.name).toBe("Source Free Bot copy");
      expect(res.inference).toEqual({ mode: "free", tags: ["coding", "fast"] });
    });
  });

  // =========================================================================
  // 3. LEGACY COMPATIBILITY & BOOTSTRAP (API LEVEL)
  // =========================================================================
  describe("3. Legacy Compatibility via API", () => {
    it("returns undefined inference for legacy bots in bootstrap procedure", async () => {
      const legacyBot = {
        ...sampleDbBot,
        id: "bot_legacy_boot",
        name: "Legacy Boot Bot",
        metadata: {
          mcp: { connectors: { github: true } },
        },
      };

      const prisma = {
        user: { findUniqueOrThrow: vi.fn().mockResolvedValue({ id: actor.userId, email: actor.email, name: "User" }) },
        userModelCredential: { findFirst: vi.fn().mockResolvedValue(null) },
        deploymentSettings: { findUnique: vi.fn().mockResolvedValue(null) },
        bot: {
          findMany: vi.fn().mockResolvedValue([legacyBot]),
          findFirst: vi.fn().mockResolvedValue(legacyBot),
        },
        message: { findMany: vi.fn().mockResolvedValue([]) },
        run: { findFirst: vi.fn().mockResolvedValue(null) },
        event: { findFirst: vi.fn().mockResolvedValue(null), findMany: vi.fn().mockResolvedValue([]) },
        routine: { findMany: vi.fn().mockResolvedValue([]) },
      };

      const router = createRouter(createMockDeps(prisma as any));
      const client = createRouterClient(router, { context: { actor } });

      const bootstrap = await client.bootstrap({
        botId: "bot_legacy_boot",
      });

      expect(bootstrap.bot?.inference).toBeUndefined();
      expect(bootstrap.bots[0]?.inference).toBeUndefined();
    });
  });

  // =========================================================================
  // 4. SEQUENTIAL MUTATIONS (API LEVEL)
  // =========================================================================
  describe("4. Sequential Mutations via API", () => {
    it("updates inference through sequential updates maintaining correct state", async () => {
      let currentBot = {
        ...sampleDbBot,
        id: "bot_seq_api",
        name: "Sequential Bot",
        metadata: {
          mcp: { connectors: { searxng: true } },
          inference: { mode: "free", tags: ["coding"] },
        },
      };

      const prisma = {
        bot: {
          findFirst: vi.fn().mockImplementation(async () => currentBot),
          findMany: vi.fn().mockImplementation(async () => [currentBot]),
          update: vi.fn().mockImplementation(async ({ data }) => {
            currentBot = {
              ...currentBot,
              ...data,
              metadata: data.metadata ?? currentBot.metadata,
            };
            return currentBot;
          }),
        },
      };

      const router = createRouter(createMockDeps(prisma as any));
      const client = createRouterClient(router, { context: { actor } });

      // Step 1: Update tags
      const update1 = await client.bots.update({
        botId: "bot_seq_api",
        inference: { mode: "free", tags: ["reasoning", "writing"] },
      });
      expect(update1.inference).toEqual({ mode: "free", tags: ["reasoning", "writing"] });

      // Step 2: Update scalar only
      const update2 = await client.bots.update({
        botId: "bot_seq_api",
        title: "Updated Title API",
      });
      expect(update2.title).toBe("Updated Title API");
      expect(update2.inference).toEqual({ mode: "free", tags: ["reasoning", "writing"] });

      // Step 3: Switch to premium
      const update3 = await client.bots.update({
        botId: "bot_seq_api",
        inference: { mode: "premium", tags: [] },
      });
      expect(update3.inference).toEqual({ mode: "premium", tags: [] });
    });
  });
});
