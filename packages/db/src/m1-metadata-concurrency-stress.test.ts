import type {
  Actor,
  Bot,
  BotInferenceConfig,
  BotMcpConfig,
  InferenceUsageTag,
} from "@rakazo/contracts";
import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "./client.js";
import { createRepos } from "./repos.js";
import { IsolationError } from "./scope.js";

describe("Milestone 1 Challenger 2: Metadata Coexistence & Concurrency Integrity (@rakazo/db)", () => {
  const actor: Actor = {
    userId: "user-challenger-1",
    workspaceId: "ws-challenger-prod",
    email: "challenger@rakazo.internal",
    isDeploymentOwner: true,
  };

  const sampleDate = new Date("2026-08-31T12:00:00.000Z");

  // Complex multi-connector MCP config
  const complexMcpConfig: BotMcpConfig = {
    connectors: {
      github: true,
      notion: true,
      searxng_scraperr: true,
      cloudflare: false,
      postgres: true,
      custom_mcp_ops: true,
    },
    tools: {
      web_search: true,
      web_scrape: true,
      github_search_repos: true,
      github_list_issues: false,
      notion_search: true,
      cloudflare_purge_cache: false,
      sql_query_readonly: true,
      custom_execute_playbook: true,
    },
  };

  const richCustomMetadata = {
    mcp: complexMcpConfig,
    uiPreferences: {
      theme: "monochrome-dark",
      compactMode: true,
      sidebarWidth: 280,
      zoomLevel: 1.0,
      tags: ["ops", "production", "critical"],
    },
    telemetry: {
      costCenter: "CC-90210",
      ownerGroup: "SRE-Alpha",
      retentionDays: 90,
      compliance: {
        gdpr: true,
        hipaa: false,
        soc2: true,
      },
    },
    i18n: {
      defaultLocale: "fr-FR",
      supported: ["fr-FR", "en-US", "ja-JP"],
      greeting: "Bonjour, système opérationnel 🚀",
    },
    numericalMetrics: {
      maxParallelRuns: 4,
      timeoutSeconds: 300,
      priorityWeight: 0.95,
      zeroValue: 0,
      negativeVal: -1,
    },
  };

  function createMockDbBot(overrides: Record<string, unknown> = {}) {
    return {
      id: "bot-stress-001",
      workspaceId: "ws-challenger-prod",
      userId: "user-challenger-1",
      name: "Sovereign Enterprise Ops",
      title: "Chief Cloud & SRE Officer",
      description: "Mission-critical autonomous bot with dense MCP toolchain",
      instructions: "Execute tasks with zero data loss and strict tool parsimony.",
      color: "#6366F1",
      notifyOnFinish: true,
      pinned: true,
      archivedAt: null,
      parentBotId: null,
      spawnKey: null,
      computerId: "comp-team-001",
      computerSwitching: false,
      voiceId: null,
      autoSpeak: false,
      metadata: JSON.parse(JSON.stringify(richCustomMetadata)),
      createdAt: sampleDate,
      updatedAt: sampleDate,
      thread: {
        id: "thread-stress-001",
        unread: false,
        messages: [{ blocks: [{ text: "Système prêt." }] }],
      },
      runs: [{ status: "idle" }],
      computer: { scope: "team" },
      ...overrides,
    };
  }

  // ==========================================================================
  // 1. METADATA COEXISTENCE & IMMUTABILITY UNDER INFERENCE UPDATES
  // ==========================================================================
  describe("1. Metadata Coexistence Stress Testing", () => {
    it("1.1 Creates a bot with complex MCP + custom metadata + explicit Free inference", async () => {
      const mockCreated = createMockDbBot({
        id: "bot-created-free-001",
        metadata: {
          ...richCustomMetadata,
          inference: {
            mode: "free",
            tags: ["coding", "reasoning"],
          },
        },
      });

      const tx = {
        computer: { upsert: vi.fn().mockResolvedValue({ id: "comp-team", scope: "team" }) },
        bot: {
          create: vi.fn().mockResolvedValue(mockCreated),
          findFirstOrThrow: vi.fn().mockResolvedValue(mockCreated),
        },
        thread: { create: vi.fn().mockResolvedValue({ id: "thread-001" }) },
        browserProfile: { create: vi.fn().mockResolvedValue({ id: "bp-001" }) },
        memoryDocument: { create: vi.fn().mockResolvedValue({ id: "mem-001" }) },
      };

      const prisma = {
        bot: { count: vi.fn().mockResolvedValue(0) },
        deploymentSettings: { findUnique: vi.fn().mockResolvedValue(null) },
        $transaction: vi.fn().mockImplementation(async (cb) => cb(tx)),
      } as unknown as PrismaClient;

      const repos = createRepos(prisma);
      const created = await repos.createBot(actor, {
        name: "Sovereign Enterprise Ops",
        title: "Chief Cloud & SRE Officer",
        description: "Mission-critical autonomous bot with dense MCP toolchain",
        instructions: "Execute tasks with zero data loss.",
        notifyOnFinish: true,
        metadata: richCustomMetadata,
        inference: {
          mode: "free",
          tags: ["coding", "reasoning"],
        },
      });

      // Verify DB create payload has intact metadata and inference
      expect(tx.bot.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          name: "Sovereign Enterprise Ops",
          metadata: {
            ...richCustomMetadata,
            inference: {
              mode: "free",
              tags: ["coding", "reasoning"],
            },
          },
        }),
      });

      // Verify mapped bot structure
      expect(created.inference).toEqual({
        mode: "free",
        tags: ["coding", "reasoning"],
      });
      expect(created.metadata).toEqual({
        ...richCustomMetadata,
        inference: {
          mode: "free",
          tags: ["coding", "reasoning"],
        },
      });

      // Assert MCP config preserved 100%
      const mcp = (created.metadata as Record<string, unknown>).mcp as BotMcpConfig;
      expect(mcp).toBeDefined();
      expect(mcp.connectors).toEqual(complexMcpConfig.connectors);
      expect(mcp.tools).toEqual(complexMcpConfig.tools);

      // Assert custom deeply nested fields preserved
      expect((created.metadata as any).telemetry.compliance).toEqual({
        gdpr: true,
        hipaa: false,
        soc2: true,
      });
      expect((created.metadata as any).i18n.greeting).toBe("Bonjour, système opérationnel 🚀");
    });

    it("1.2 Updating ONLY inference (switching to Premium) 100% preserves MCP and custom metadata", async () => {
      const existingDbBot = createMockDbBot({
        metadata: {
          ...richCustomMetadata,
          inference: {
            mode: "free",
            tags: ["coding", "analysis"],
          },
        },
      });

      const updatedDbBot = {
        ...existingDbBot,
        metadata: {
          ...richCustomMetadata,
          inference: {
            mode: "premium",
            tags: [],
          },
        },
      };

      const findFirst = vi.fn().mockResolvedValue(existingDbBot);
      const update = vi.fn().mockResolvedValue(updatedDbBot);
      const findMany = vi.fn().mockResolvedValue([updatedDbBot]);

      const prisma = {
        bot: { findFirst, update, findMany },
      } as unknown as PrismaClient;

      const repos = createRepos(prisma);

      // Call updateBot with ONLY inference
      const result = await repos.updateBot(actor, {
        botId: "bot-stress-001",
        inference: {
          mode: "premium",
          tags: [],
        },
      });

      // Verify Prisma update call received full merged metadata with new inference
      expect(update).toHaveBeenCalledWith({
        where: { id: "bot-stress-001" },
        data: {
          metadata: {
            ...richCustomMetadata,
            inference: {
              mode: "premium",
              tags: [],
            },
          },
        },
      });

      // Verify resulting bot object
      expect(result.inference).toEqual({
        mode: "premium",
        tags: [],
      });

      // Assert every non-inference key in metadata is byte-identical
      const meta = result.metadata as typeof richCustomMetadata;
      expect(meta.mcp).toEqual(complexMcpConfig);
      expect(meta.uiPreferences).toEqual(richCustomMetadata.uiPreferences);
      expect(meta.telemetry).toEqual(richCustomMetadata.telemetry);
      expect(meta.i18n).toEqual(richCustomMetadata.i18n);
      expect(meta.numericalMetrics).toEqual(richCustomMetadata.numericalMetrics);
    });

    it("1.3 Updating ONLY metadata 100% preserves existing inference configuration", async () => {
      const existingDbBot = createMockDbBot({
        metadata: {
          ...richCustomMetadata,
          inference: {
            mode: "free",
            tags: ["reasoning", "writing"],
          },
        },
      });

      const updatedMetadataFragment = {
        uiPreferences: {
          ...richCustomMetadata.uiPreferences,
          theme: "solarized-light",
          zoomLevel: 1.25,
        },
        newRuntimeAnnotation: {
          deployedBy: "deploy-pipeline-v4",
          clusterId: "vps-coolify-01",
        },
      };

      const updatedDbBot = {
        ...existingDbBot,
        metadata: {
          ...richCustomMetadata,
          ...updatedMetadataFragment,
          inference: {
            mode: "free",
            tags: ["reasoning", "writing"],
          },
        },
      };

      const findFirst = vi.fn().mockResolvedValue(existingDbBot);
      const update = vi.fn().mockResolvedValue(updatedDbBot);
      const findMany = vi.fn().mockResolvedValue([updatedDbBot]);

      const prisma = {
        bot: { findFirst, update, findMany },
      } as unknown as PrismaClient;

      const repos = createRepos(prisma);

      // Call updateBot with ONLY metadata, no inference argument
      const result = await repos.updateBot(actor, {
        botId: "bot-stress-001",
        metadata: updatedMetadataFragment,
      });

      expect(update).toHaveBeenCalledWith({
        where: { id: "bot-stress-001" },
        data: {
          metadata: expect.objectContaining({
            ...richCustomMetadata,
            ...updatedMetadataFragment,
            inference: {
              mode: "free",
              tags: ["reasoning", "writing"],
            },
          }),
        },
      });

      // Assert inference was NOT wiped out or changed to default
      expect(result.inference).toEqual({
        mode: "free",
        tags: ["reasoning", "writing"],
      });
      expect((result.metadata as any).uiPreferences.theme).toBe("solarized-light");
      expect((result.metadata as any).newRuntimeAnnotation.clusterId).toBe("vps-coolify-01");
    });

    it("1.4 Updating ONLY scalar fields (title, pinned, color) leaves metadata and inference untouched", async () => {
      const existingDbBot = createMockDbBot({
        metadata: {
          ...richCustomMetadata,
          inference: {
            mode: "free",
            tags: ["fast"],
          },
        },
      });

      const updatedDbBot = {
        ...existingDbBot,
        title: "Brand New Title",
        color: "#10B981",
        pinned: false,
      };

      const findFirst = vi.fn().mockResolvedValue(existingDbBot);
      const update = vi.fn().mockResolvedValue(updatedDbBot);
      const findMany = vi.fn().mockResolvedValue([updatedDbBot]);

      const prisma = {
        bot: { findFirst, update, findMany },
      } as unknown as PrismaClient;

      const repos = createRepos(prisma);

      const result = await repos.updateBot(actor, {
        botId: "bot-stress-001",
        title: "Brand New Title",
        color: "#10B981",
        pinned: false,
      });

      // Ensure data sent to prisma.bot.update DOES NOT contain metadata key at all
      expect(update).toHaveBeenCalledWith({
        where: { id: "bot-stress-001" },
        data: {
          title: "Brand New Title",
          color: "#10B981",
          pinned: false,
        },
      });

      expect(result.title).toBe("Brand New Title");
      expect(result.color).toBe("#10B981");
      expect(result.pinned).toBe(false);
      expect(result.inference).toEqual({
        mode: "free",
        tags: ["fast"],
      });
      expect((result.metadata as any).mcp).toEqual(complexMcpConfig);
    });

    it("1.5 Simultaneous update of both metadata and inference applies both cleanly", async () => {
      const existingDbBot = createMockDbBot({
        metadata: {
          ...richCustomMetadata,
          inference: {
            mode: "premium",
            tags: [],
          },
        },
      });

      const nextMcp: BotMcpConfig = {
        connectors: { ...complexMcpConfig.connectors, cloudflare: true },
        tools: { ...complexMcpConfig.tools, cloudflare_purge_cache: true },
      };

      const updatedDbBot = {
        ...existingDbBot,
        metadata: {
          ...richCustomMetadata,
          mcp: nextMcp,
          inference: {
            mode: "free",
            tags: ["coding", "analysis", "fast"],
          },
        },
      };

      const findFirst = vi.fn().mockResolvedValue(existingDbBot);
      const update = vi.fn().mockResolvedValue(updatedDbBot);
      const findMany = vi.fn().mockResolvedValue([updatedDbBot]);

      const prisma = {
        bot: { findFirst, update, findMany },
      } as unknown as PrismaClient;

      const repos = createRepos(prisma);

      const result = await repos.updateBot(actor, {
        botId: "bot-stress-001",
        metadata: { mcp: nextMcp },
        inference: {
          mode: "free",
          tags: ["coding", "analysis", "fast"],
        },
      });

      expect(result.inference).toEqual({
        mode: "free",
        tags: ["coding", "analysis", "fast"],
      });
      expect((result.metadata as any).mcp.connectors.cloudflare).toBe(true);
      expect((result.metadata as any).mcp.tools.cloudflare_purge_cache).toBe(true);
      expect((result.metadata as any).telemetry.ownerGroup).toBe("SRE-Alpha");
    });
  });

  // ==========================================================================
  // 2. CONCURRENT UPDATES & DATABASE JSON TRANSACTIONS
  // ==========================================================================
  describe("2. Concurrent Updates & Transactional Stress Testing", () => {
    it("2.1 Simulates concurrent interleaved bot updates without metadata corruption", async () => {
      // In-memory atomic store simulating PostgreSQL JSONB column behavior
      let dbStore = createMockDbBot({
        metadata: {
          ...richCustomMetadata,
          inference: { mode: "free", tags: ["coding"] },
          version: 1,
        },
      });

      const mockPrisma = {
        bot: {
          findFirst: vi.fn().mockImplementation(async () => ({ ...dbStore })),
          findMany: vi.fn().mockImplementation(async () => [{ ...dbStore }]),
          update: vi.fn().mockImplementation(async ({ data }: { data: any }) => {
            // Apply atomic merge as in PostgreSQL update
            dbStore = {
              ...dbStore,
              ...data,
              metadata: data.metadata ? { ...data.metadata } : dbStore.metadata,
              updatedAt: new Date(),
            };
            return { ...dbStore };
          }),
        },
      } as unknown as PrismaClient;

      const repos = createRepos(mockPrisma);

      // Launch 8 concurrent updates targeting various fields
      const tasks = [
        repos.updateBot(actor, { botId: "bot-stress-001", title: "Concurrent Title 1" }),
        repos.updateBot(actor, {
          botId: "bot-stress-001",
          inference: { mode: "free", tags: ["reasoning", "writing"] },
        }),
        repos.updateBot(actor, {
          botId: "bot-stress-001",
          metadata: { workerFieldA: "computed-a" },
        }),
        repos.updateBot(actor, { botId: "bot-stress-001", pinned: true, color: "#EF4444" }),
        repos.updateBot(actor, {
          botId: "bot-stress-001",
          metadata: { workerFieldB: "computed-b" },
        }),
        repos.updateBot(actor, {
          botId: "bot-stress-001",
          inference: { mode: "free", tags: ["coding", "fast"] },
        }),
        repos.updateBot(actor, { botId: "bot-stress-001", description: "Updated concurrent desc" }),
        repos.updateBot(actor, {
          botId: "bot-stress-001",
          metadata: { mcp: { connectors: { github: true, notion: false } } },
        }),
      ];

      const results = await Promise.all(tasks);

      expect(results).toHaveLength(8);
      for (const res of results) {
        expect(res).toBeDefined();
        expect(res.id).toBe("bot-stress-001");
        // Verify metadata is always a valid object
        expect(typeof res.metadata).toBe("object");
        expect(res.metadata).not.toBeNull();
      }

      // Final state verification
      const finalBot = (await repos.listBots(actor))[0]!;
      expect(finalBot).toBeDefined();
      expect(finalBot.metadata).toBeDefined();
      // Ensure JSON structure didn't become corrupted or [object Object]
      const serialized = JSON.stringify(finalBot.metadata);
      expect(() => JSON.parse(serialized)).not.toThrow();
      const parsed = JSON.parse(serialized);
      expect(parsed.inference).toBeDefined();
      expect(parsed.inference.mode).toBe("free");
    });

    it("2.2 Resiliently parses stringified metadata (SQLite compatibility / legacy JSON column)", async () => {
      const rawJsonString = JSON.stringify({
        mcp: complexMcpConfig,
        customKey: "stringified-value",
        inference: {
          mode: "free",
          tags: ["analysis"],
        },
      });

      const dbBotWithStringMeta = createMockDbBot({
        metadata: rawJsonString,
      });

      const findMany = vi.fn().mockResolvedValue([dbBotWithStringMeta]);
      const prisma = { bot: { findMany } } as unknown as PrismaClient;
      const repos = createRepos(prisma);

      const [bot] = await repos.listBots(actor);
      expect(bot).toBeDefined();
      expect(bot!.metadata).toEqual({
        mcp: complexMcpConfig,
        customKey: "stringified-value",
        inference: {
          mode: "free",
          tags: ["analysis"],
        },
      });
      expect(bot!.inference).toEqual({
        mode: "free",
        tags: ["analysis"],
      });
    });

    it("2.3 Gracefully handles corrupt or non-object metadata in database without throwing uncaught exceptions", async () => {
      const corruptedBots = [
        createMockDbBot({ id: "bot-corrupt-1", metadata: "{ invalid json garbage %$#@" }),
        createMockDbBot({ id: "bot-corrupt-2", metadata: null }),
        createMockDbBot({ id: "bot-corrupt-3", metadata: 12345 }),
        createMockDbBot({ id: "bot-corrupt-4", metadata: "plain string not json" }),
        createMockDbBot({ id: "bot-corrupt-5", metadata: ["array", "not", "object"] }),
      ];

      const findMany = vi.fn().mockResolvedValue(corruptedBots);
      const prisma = { bot: { findMany } } as unknown as PrismaClient;
      const repos = createRepos(prisma);

      const bots = await repos.listBots(actor);
      expect(bots).toHaveLength(5);

      for (const bot of bots) {
        expect(bot).toBeDefined();
        // Should default safely to undefined inference rather than throwing
        expect(bot.inference).toBeUndefined();
        expect(typeof bot.metadata).toBe("object");
      }
    });

    it("2.4 updateBot with malformed existing metadata recovers and creates clean merged metadata", async () => {
      const corruptDbBot = createMockDbBot({
        metadata: "CORRUPTED_STRING_NOT_JSON",
      });

      const updatedDbBot = {
        ...corruptDbBot,
        metadata: {
          inference: { mode: "free", tags: ["coding"] },
        },
      };

      const findFirst = vi.fn().mockResolvedValue(corruptDbBot);
      const update = vi.fn().mockResolvedValue(updatedDbBot);
      const findMany = vi.fn().mockResolvedValue([updatedDbBot]);

      const prisma = {
        bot: { findFirst, update, findMany },
      } as unknown as PrismaClient;

      const repos = createRepos(prisma);
      const result = await repos.updateBot(actor, {
        botId: "bot-stress-001",
        inference: {
          mode: "free",
          tags: ["coding"],
        },
      });

      expect(result.inference).toEqual({
        mode: "free",
        tags: ["coding"],
      });
      expect(result.metadata).toEqual({
        inference: {
          mode: "free",
          tags: ["coding"],
        },
      });
    });
  });

  // ==========================================================================
  // 3. FULL DB PERSISTENCE & MAPPING ROUNDTRIP
  // ==========================================================================
  describe("3. Full DB Persistence & Mapping Roundtrip", () => {
    it("3.1 Free bot createBot -> mapBot roundtrip preserves explicit Free mode and tags", async () => {
      const dbRecord = createMockDbBot({
        id: "bot-chain-free",
        metadata: {
          mcp: complexMcpConfig,
          inference: {
            mode: "free",
            tags: ["coding", "analysis"],
          },
        },
      });

      const tx = {
        computer: { upsert: vi.fn().mockResolvedValue({ id: "comp-team", scope: "team" }) },
        bot: {
          create: vi.fn().mockResolvedValue(dbRecord),
          findFirstOrThrow: vi.fn().mockResolvedValue(dbRecord),
        },
        thread: { create: vi.fn().mockResolvedValue({ id: "thr-1" }) },
        browserProfile: { create: vi.fn().mockResolvedValue({ id: "bp-1" }) },
        memoryDocument: { create: vi.fn().mockResolvedValue({ id: "mem-1" }) },
      };

      const prisma = {
        bot: { count: vi.fn().mockResolvedValue(0) },
        deploymentSettings: { findUnique: vi.fn().mockResolvedValue(null) },
        $transaction: vi.fn().mockImplementation(async (cb) => cb(tx)),
      } as unknown as PrismaClient;

      const repos = createRepos(prisma);

      const bot = await repos.createBot(actor, {
        name: "Chain Bot Free",
        title: "Test Chain",
        description: "Desc",
        instructions: "Inst",
        notifyOnFinish: true,
        metadata: { mcp: complexMcpConfig },
        inference: {
          mode: "free",
          tags: ["coding", "analysis"],
        },
      });

      expect(bot.inference).toEqual({
        mode: "free",
        tags: ["coding", "analysis"],
      });
      expect((bot.metadata as any).mcp).toEqual(complexMcpConfig);
    });

    it("3.2 Legacy bot without inference maps to inference: undefined", async () => {
      const dbRecord = createMockDbBot({
        id: "bot-chain-legacy",
        metadata: { mcp: complexMcpConfig },
      });

      const tx = {
        computer: { upsert: vi.fn().mockResolvedValue({ id: "comp-team", scope: "team" }) },
        bot: {
          create: vi.fn().mockResolvedValue(dbRecord),
          findFirstOrThrow: vi.fn().mockResolvedValue(dbRecord),
        },
        thread: { create: vi.fn().mockResolvedValue({ id: "thr-1" }) },
        browserProfile: { create: vi.fn().mockResolvedValue({ id: "bp-1" }) },
        memoryDocument: { create: vi.fn().mockResolvedValue({ id: "mem-1" }) },
      };

      const prisma = {
        bot: { count: vi.fn().mockResolvedValue(0) },
        deploymentSettings: { findUnique: vi.fn().mockResolvedValue(null) },
        $transaction: vi.fn().mockImplementation(async (cb) => cb(tx)),
      } as unknown as PrismaClient;

      const repos = createRepos(prisma);
      const bot = await repos.createBot(actor, {
        name: "Legacy Bot",
        title: "Legacy",
        description: "Desc",
        instructions: "Inst",
        notifyOnFinish: true,
        metadata: { mcp: complexMcpConfig },
      });

      expect(bot.inference).toBeUndefined();
    });

    it("3.3 Subagent bot created by Free parent inherits Free mode with anti-escalation", async () => {
      const parentDbBot = createMockDbBot({
        id: "parent-free-001",
        metadata: {
          inference: {
            mode: "free",
            tags: ["reasoning"],
          },
        },
      });

      let createdChildRecord: any = null;
      const tx = {
        computer: { upsert: vi.fn().mockResolvedValue({ id: "comp-team", scope: "team" }) },
        bot: {
          create: vi.fn().mockImplementation(async ({ data }: { data: any }) => {
            createdChildRecord = createMockDbBot({
              ...data,
              id: "child-free-001",
            });
            return createdChildRecord;
          }),
          findFirstOrThrow: vi.fn().mockImplementation(async () => createdChildRecord),
        },
        thread: { create: vi.fn().mockResolvedValue({ id: "thr-child" }) },
        browserProfile: { create: vi.fn().mockResolvedValue({ id: "bp-child" }) },
        memoryDocument: { create: vi.fn().mockResolvedValue({ id: "mem-child" }) },
      };

      const prisma = {
        bot: {
          count: vi.fn().mockResolvedValue(1),
          findFirst: vi.fn().mockResolvedValue(parentDbBot),
        },
        deploymentSettings: { findUnique: vi.fn().mockResolvedValue(null) },
        $transaction: vi.fn().mockImplementation(async (cb) => cb(tx)),
      } as unknown as PrismaClient;

      const repos = createRepos(prisma);

      // Child attempts privilege escalation to premium
      const childBot = await repos.createBot(actor, {
        name: "Spawned Child Subagent",
        title: "Subagent",
        description: "Task helper",
        instructions: "Do bounded task",
        notifyOnFinish: false,
        parentBotId: "parent-free-001",
        inference: {
          mode: "premium" as any,
          tags: ["coding"],
        },
      });

      expect(childBot.inference).toEqual({
        mode: "free",
        tags: ["coding"],
      });
    });
  });

  // ==========================================================================
  // 4. EDGE CASES & MALFORMED INPUT RESILIENCE
  // ==========================================================================
  describe("4. Edge Cases, Tag Clamping & Sanitization", () => {
    it("4.1 Clamps inference tags to maximum 3 in mapBot and createRepos", async () => {
      const dbBotWith5Tags = createMockDbBot({
        metadata: {
          inference: {
            mode: "free",
            tags: ["coding", "writing", "reasoning", "fast", "analysis"],
          },
        },
      });

      const findMany = vi.fn().mockResolvedValue([dbBotWith5Tags]);
      const prisma = { bot: { findMany } } as unknown as PrismaClient;
      const repos = createRepos(prisma);

      const [bot] = await repos.listBots(actor);
      expect(bot).toBeDefined();
      expect(bot!.inference?.tags).toHaveLength(3);
      expect(bot!.inference?.tags).toEqual(["coding", "writing", "reasoning"]);
    });

    it("4.2 Filters out invalid tag values and unexpected types", async () => {
      const dbBotWithInvalidTags = createMockDbBot({
        metadata: {
          inference: {
            mode: "free",
            tags: ["coding", "INVALID_TAG", "", null, 42, "analysis", undefined, {}],
          },
        },
      });

      const findMany = vi.fn().mockResolvedValue([dbBotWithInvalidTags]);
      const prisma = { bot: { findMany } } as unknown as PrismaClient;
      const repos = createRepos(prisma);

      const [bot] = await repos.listBots(actor);
      expect(bot).toBeDefined();
      expect(bot!.inference?.tags).toEqual(["coding", "analysis"]);
    });

    it("4.3 Unrecognized mode values default safely to premium", async () => {
      const dbBotWithUnknownMode = createMockDbBot({
        metadata: {
          inference: {
            mode: "QUANTUM_ULTRA_SPEED" as any,
            tags: ["coding"],
          },
        },
      });

      const findMany = vi.fn().mockResolvedValue([dbBotWithUnknownMode]);
      const prisma = { bot: { findMany } } as unknown as PrismaClient;
      const repos = createRepos(prisma);

      const [bot] = await repos.listBots(actor);
      expect(bot).toBeDefined();
      expect(bot!.inference?.mode).toBe("premium");
    });

    it("4.4 Prototype pollution attempts in metadata do not alter global Object prototype", async () => {
      const maliciousPayload = JSON.parse(
        '{"__proto__":{"polluted":"yes"},"constructor":{"prototype":{"polluted":"yes"}},"normalField":"safe"}',
      );

      const existingDbBot = createMockDbBot({
        metadata: {
          inference: { mode: "free", tags: ["coding"] },
        },
      });

      const updatedDbBot = {
        ...existingDbBot,
        metadata: {
          ...maliciousPayload,
          inference: { mode: "free", tags: ["coding"] },
        },
      };

      const findFirst = vi.fn().mockResolvedValue(existingDbBot);
      const update = vi.fn().mockResolvedValue(updatedDbBot);
      const findMany = vi.fn().mockResolvedValue([updatedDbBot]);

      const prisma = { bot: { findFirst, update, findMany } } as unknown as PrismaClient;
      const repos = createRepos(prisma);

      await repos.updateBot(actor, {
        botId: "bot-stress-001",
        metadata: maliciousPayload,
      });

      // Verify Object prototype is NOT polluted
      expect(({} as any).polluted).toBeUndefined();
    });

    it("4.5 High-contention 20-operation concurrency simulation maintains data integrity", async () => {
      let state = createMockDbBot({
        id: "bot-high-contention",
        metadata: {
          mcp: complexMcpConfig,
          inference: { mode: "free", tags: ["coding"] },
          counter: 0,
        },
      });

      const cloneState = () => ({
        ...state,
        metadata: JSON.parse(JSON.stringify(state.metadata)),
        createdAt: new Date(state.createdAt),
        updatedAt: new Date(state.updatedAt),
      });

      const mockPrisma = {
        bot: {
          findFirst: vi.fn().mockImplementation(async () => cloneState()),
          findMany: vi.fn().mockImplementation(async () => [cloneState()]),
          update: vi.fn().mockImplementation(async ({ data }: { data: any }) => {
            const current = cloneState();
            state = {
              ...current,
              ...data,
              metadata: data.metadata
                ? JSON.parse(JSON.stringify(data.metadata))
                : current.metadata,
              createdAt: current.createdAt,
              updatedAt: new Date(),
            };
            return cloneState();
          }),
        },
      } as unknown as PrismaClient;

      const repos = createRepos(mockPrisma);

      const operations = Array.from({ length: 20 }, (_, i) => {
        const opType = i % 4;
        if (opType === 0) {
          return repos.updateBot(actor, {
            botId: "bot-high-contention",
            inference: {
              mode: "free",
              tags: i % 2 === 0 ? ["reasoning", "coding"] : ["writing"],
            },
          });
        } else if (opType === 1) {
          return repos.updateBot(actor, {
            botId: "bot-high-contention",
            metadata: {
              [`concurrentKey_${i}`]: `val_${i}`,
            },
          });
        } else if (opType === 2) {
          return repos.updateBot(actor, {
            botId: "bot-high-contention",
            title: `Title update #${i}`,
          });
        } else {
          return repos.updateBot(actor, {
            botId: "bot-high-contention",
            pinned: i % 2 === 0,
            color: `#${i.toString(16).padStart(6, "0")}`,
          });
        }
      });

      const results = await Promise.all(operations);
      expect(results).toHaveLength(20);

      // Verify final state is healthy and uncorrupted
      const finalBot = (await repos.listBots(actor))[0]!;
      expect(finalBot).toBeDefined();
      expect(typeof finalBot.metadata).toBe("object");
      expect(finalBot.inference).toBeDefined();
      expect(["free", "premium"]).toContain(finalBot.inference?.mode);
    });

    it("4.6 Cross-workspace multi-tenant isolation throws IsolationError", async () => {
      const otherActor: Actor = {
        userId: "hacker-user-999",
        workspaceId: "other-workspace-999",
        email: "intruder@evil.org",
        isDeploymentOwner: false,
      };

      const prisma = {
        bot: {
          findFirst: vi.fn().mockResolvedValue(null), // not found in other actor's workspace
        },
      } as unknown as PrismaClient;

      const repos = createRepos(prisma);

      await expect(repos.getBot(otherActor, "bot-stress-001")).rejects.toThrow(IsolationError);
      await expect(
        repos.updateBot(otherActor, { botId: "bot-stress-001", title: "Compromised" }),
      ).rejects.toThrow(IsolationError);
    });
  });
});
