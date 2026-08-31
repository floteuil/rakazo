import { createRouterClient } from "@orpc/server";
import type { Actor, BotInferenceConfig } from "@rakazo/contracts";
import type { PrismaClient } from "@rakazo/db";
import { describe, expect, it, vi } from "vitest";
import { createRouter, type RouterDeps } from "./router.js";

describe("API Router — Bot Procedures & Inference Persistence Integration", () => {
  const actor1: Actor = {
    userId: "user-paris-1",
    workspaceId: "ws-paris-org",
    email: "dev@workspacegroupefloteuil.eu",
    isDeploymentOwner: true,
  };

  const actor2: Actor = {
    userId: "user-lyon-2",
    workspaceId: "ws-lyon-org",
    email: "outsider@other.org",
    isDeploymentOwner: false,
  };

  const sampleDbBot = {
    id: "bot_free_001",
    workspaceId: "ws-paris-org",
    userId: "user-paris-1",
    name: "Architect Bot",
    title: "Chief Architect",
    description: "Designs systems",
    instructions: "Follow Clean Architecture",
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
    metadata: {
      inference: {
        mode: "free" as const,
        tags: ["coding" as const, "fast" as const],
      },
    },
    createdAt: new Date("2026-08-30T10:00:00.000Z"),
    updatedAt: new Date("2026-08-30T10:00:00.000Z"),
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
      dataDir: "/tmp/rakazo-test",
      env: {
        defaultProvider: "meta-llama",
        defaultModel: "meta-llama/llama-3.3-70b-instruct:free",
        webOrigin: "http://127.0.0.1:5173",
        screenProxySecret: "secret",
        sandboxProvider: "docker",
      },
    };
  }

  // ==========================================================================
  // 1. BOTS.CREATE PROCEDURE INFERENCE PERSISTENCE
  // ==========================================================================
  describe("bots.create procedure", () => {
    it("creates a bot with explicit Free mode and multi-tags", async () => {
      const createdDbBot = {
        ...sampleDbBot,
        id: "bot_created_123",
        name: "Omni Coder",
        metadata: {
          inference: {
            mode: "free",
            tags: ["coding", "reasoning"],
          },
        },
      };

      const tx = {
        computer: { upsert: vi.fn().mockResolvedValue({ id: "comp-1", scope: "team" }) },
        bot: {
          create: vi.fn().mockResolvedValue(createdDbBot),
          findFirstOrThrow: vi.fn().mockResolvedValue(createdDbBot),
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
      const client = createRouterClient(router, { context: { actor: actor1 } });

      const res = await client.bots.create({
        name: "Omni Coder",
        title: "Senior Coder",
        description: "Coding assistant",
        instructions: "Write clean code",
        notifyOnFinish: true,
        inference: {
          mode: "free",
          tags: ["coding", "reasoning"],
        },
      });

      expect(res.name).toBe("Omni Coder");
      expect(res.inference).toEqual({
        mode: "free",
        tags: ["coding", "reasoning"],
      });
      expect(tx.bot.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          name: "Omni Coder",
          metadata: {
            inference: {
              mode: "free",
              tags: ["coding", "reasoning"],
            },
          },
        }),
      });
    });

    it("creates a bot without inference config defaulting to undefined (legacy)", async () => {
      const legacyCreatedDbBot = {
        ...sampleDbBot,
        id: "bot_legacy_123",
        name: "Legacy Bot",
        metadata: {},
      };

      const tx = {
        computer: { upsert: vi.fn().mockResolvedValue({ id: "comp-1", scope: "team" }) },
        bot: {
          create: vi.fn().mockResolvedValue(legacyCreatedDbBot),
          findFirstOrThrow: vi.fn().mockResolvedValue(legacyCreatedDbBot),
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
      const client = createRouterClient(router, { context: { actor: actor1 } });

      const res = await client.bots.create({
        name: "Legacy Bot",
        title: "Legacy",
        description: "No inference config",
        instructions: "Standard legacy prompt",
        notifyOnFinish: true,
      });

      expect(res.name).toBe("Legacy Bot");
      expect(res.inference).toBeUndefined();
    });
  });

  // ==========================================================================
  // 2. BOTS.DUPLICATE PROCEDURE INFERENCE PROPAGATION
  // ==========================================================================
  describe("bots.duplicate procedure", () => {
    it("duplicates Free bot and faithfully propagates inference configuration", async () => {
      const sourceBotDb = {
        ...sampleDbBot,
        id: "bot_source_free",
        name: "Master Free Bot",
        metadata: {
          mcp: { connectors: { github: true } },
          inference: {
            mode: "free" as const,
            tags: ["coding" as const, "fast" as const],
          },
        },
      };

      const duplicatedDbBot = {
        ...sampleDbBot,
        id: "bot_dup_free",
        name: "Master Free Bot copy",
        metadata: {
          mcp: { connectors: { github: true } },
          inference: {
            mode: "free" as const,
            tags: ["coding" as const, "fast" as const],
          },
        },
      };

      const tx = {
        computer: { upsert: vi.fn().mockResolvedValue({ id: "comp-1", scope: "team" }) },
        bot: {
          create: vi.fn().mockResolvedValue(duplicatedDbBot),
          findFirstOrThrow: vi.fn().mockResolvedValue(duplicatedDbBot),
        },
        thread: { create: vi.fn().mockResolvedValue({ id: "thr_dup" }) },
        browserProfile: { create: vi.fn().mockResolvedValue({ id: "bp_dup" }) },
        memoryDocument: { create: vi.fn().mockResolvedValue({ id: "mem_dup" }) },
      };

      const prisma = {
        bot: {
          findFirst: vi.fn().mockResolvedValue(sourceBotDb),
          count: vi.fn().mockResolvedValue(1),
        },
        deploymentSettings: { findUnique: vi.fn().mockResolvedValue(null) },
        $transaction: vi.fn().mockImplementation(async (cb) => cb(tx)),
      };

      const router = createRouter(createMockDeps(prisma as any));
      const client = createRouterClient(router, { context: { actor: actor1 } });

      const res = await client.bots.duplicate({
        botId: "bot_source_free",
      });

      expect(res.name).toBe("Master Free Bot copy");
      expect(res.inference).toEqual({
        mode: "free",
        tags: ["coding", "fast"],
      });

      expect(tx.bot.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          name: "Master Free Bot copy",
          metadata: {
            mcp: { connectors: { github: true } },
            inference: {
              mode: "free",
              tags: ["coding", "fast"],
            },
          },
        }),
      });
    });

    it("duplicates legacy bot without creating synthetic inference configuration", async () => {
      const sourceLegacyBotDb = {
        ...sampleDbBot,
        id: "bot_source_legacy",
        name: "Old Legacy Bot",
        metadata: {
          mcp: { connectors: { github: true } },
        },
      };

      const duplicatedLegacyDbBot = {
        ...sampleDbBot,
        id: "bot_dup_legacy",
        name: "Old Legacy Bot copy",
        metadata: {
          mcp: { connectors: { github: true } },
        },
      };

      const tx = {
        computer: { upsert: vi.fn().mockResolvedValue({ id: "comp-1", scope: "team" }) },
        bot: {
          create: vi.fn().mockResolvedValue(duplicatedLegacyDbBot),
          findFirstOrThrow: vi.fn().mockResolvedValue(duplicatedLegacyDbBot),
        },
        thread: { create: vi.fn().mockResolvedValue({ id: "thr_dup" }) },
        browserProfile: { create: vi.fn().mockResolvedValue({ id: "bp_dup" }) },
        memoryDocument: { create: vi.fn().mockResolvedValue({ id: "mem_dup" }) },
      };

      const prisma = {
        bot: {
          findFirst: vi.fn().mockResolvedValue(sourceLegacyBotDb),
          count: vi.fn().mockResolvedValue(1),
        },
        deploymentSettings: { findUnique: vi.fn().mockResolvedValue(null) },
        $transaction: vi.fn().mockImplementation(async (cb) => cb(tx)),
      };

      const router = createRouter(createMockDeps(prisma as any));
      const client = createRouterClient(router, { context: { actor: actor1 } });

      const res = await client.bots.duplicate({
        botId: "bot_source_legacy",
      });

      expect(res.name).toBe("Old Legacy Bot copy");
      expect(res.inference).toBeUndefined();
    });
  });

  // ==========================================================================
  // 3. BOTS.UPDATE PROCEDURE INFERENCE MODIFICATIONS
  // ==========================================================================
  describe("bots.update procedure", () => {
    it("updates bot inference settings while preserving existing metadata", async () => {
      const existingBot = {
        ...sampleDbBot,
        id: "bot_to_update",
        metadata: {
          customTheme: "dark",
          inference: { mode: "premium", tags: [] },
        },
      };

      const updatedDbBot = {
        ...existingBot,
        metadata: {
          customTheme: "dark",
          inference: {
            mode: "free",
            tags: ["reasoning", "writing"],
          },
        },
      };

      const prisma = {
        bot: {
          findFirst: vi.fn().mockResolvedValue(existingBot),
          update: vi.fn().mockResolvedValue(updatedDbBot),
          findMany: vi.fn().mockResolvedValue([updatedDbBot]),
        },
      };

      const router = createRouter(createMockDeps(prisma as any));
      const client = createRouterClient(router, { context: { actor: actor1 } });

      const res = await client.bots.update({
        botId: "bot_to_update",
        inference: {
          mode: "free",
          tags: ["reasoning", "writing"],
        },
      });

      expect(res.inference).toEqual({
        mode: "free",
        tags: ["reasoning", "writing"],
      });

      expect(prisma.bot.update).toHaveBeenCalledWith({
        where: { id: "bot_to_update" },
        data: {
          metadata: {
            customTheme: "dark",
            inference: {
              mode: "free",
              tags: ["reasoning", "writing"],
            },
          },
        },
      });
    });
  });

  // ==========================================================================
  // 4. BOTS.GET, BOTS.LIST & BOOTSTRAP INFERENCE RESTITUTION
  // ==========================================================================
  describe("restitution across bots.get, bots.list and bootstrap", () => {
    it("bots.list and bots.get return bots with complete inference configuration", async () => {
      const freeBot = {
        ...sampleDbBot,
        id: "bot_free_listed",
        metadata: {
          inference: {
            mode: "free",
            tags: ["analysis", "coding"],
          },
        },
      };

      const prisma = {
        bot: {
          findMany: vi.fn().mockResolvedValue([freeBot]),
        },
      };

      const router = createRouter(createMockDeps(prisma as any));
      const client = createRouterClient(router, { context: { actor: actor1 } });

      const listRes = await client.bots.list();
      expect(listRes).toHaveLength(1);
      expect(listRes[0].inference).toEqual({
        mode: "free",
        tags: ["analysis", "coding"],
      });

      const getRes = await client.bots.get({
        botId: "bot_free_listed",
      });
      expect(getRes.id).toBe("bot_free_listed");
      expect(getRes.inference).toEqual({
        mode: "free",
        tags: ["analysis", "coding"],
      });
    });

    it("bootstrap returns active bot snapshot and bot list preserving inference config", async () => {
      const activeFreeBot = {
        ...sampleDbBot,
        id: "bot_active_free",
        metadata: {
          inference: {
            mode: "free",
            tags: ["writing"],
          },
        },
      };

      const prisma = {
        user: { findUniqueOrThrow: vi.fn().mockResolvedValue({ id: "user-paris-1", email: "dev@workspacegroupefloteuil.eu", name: "Dev" }) },
        userModelCredential: { findFirst: vi.fn().mockResolvedValue(null) },
        deploymentSettings: { findUnique: vi.fn().mockResolvedValue(null) },
        bot: {
          findMany: vi.fn().mockResolvedValue([activeFreeBot]),
          findFirst: vi.fn().mockResolvedValue(activeFreeBot),
        },
        message: { findMany: vi.fn().mockResolvedValue([]) },
        run: { findFirst: vi.fn().mockResolvedValue(null) },
        event: { findFirst: vi.fn().mockResolvedValue(null), findMany: vi.fn().mockResolvedValue([]) },
        routine: { findMany: vi.fn().mockResolvedValue([]) },
      };

      const router = createRouter(createMockDeps(prisma as any));
      const client = createRouterClient(router, { context: { actor: actor1 } });

      const bootRes = await client.bootstrap({
        botId: "bot_active_free",
      });

      expect(bootRes.bots).toHaveLength(1);
      expect(bootRes.bots[0].inference).toEqual({
        mode: "free",
        tags: ["writing"],
      });
      expect(bootRes.thread?.botId).toBe("bot_active_free");
    });
  });

  // ==========================================================================
  // 5. MULTI-TENANT ISOLATION & VALIDATION BOUNDARY
  // ==========================================================================
  describe("Multi-tenant workspace isolation & boundary guards", () => {
    it("strictly prevents cross-workspace bot duplication", async () => {
      const prisma = {
        bot: {
          findFirst: vi.fn().mockResolvedValue(null), // not found in actor2's workspace
        },
      };

      const router = createRouter(createMockDeps(prisma as any));
      const client = createRouterClient(router, { context: { actor: actor2 } });

      await expect(
        client.bots.duplicate({
          botId: "bot_free_001",
        }),
      ).rejects.toThrow();
    });

    it("strictly prevents unauthenticated access", async () => {
      const prisma = { bot: {} };
      const router = createRouter(createMockDeps(prisma as any));
      const client = createRouterClient(router, { context: { actor: null } });

      await expect(
        client.bots.create({
          name: "No Auth",
        }),
      ).rejects.toThrow();
    });
  });
});
