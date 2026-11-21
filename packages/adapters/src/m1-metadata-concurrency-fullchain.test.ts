import type {
  Actor,
  Bot,
  BotInferenceConfig,
  BotMcpConfig,
  InferenceUsageTag,
} from "@rakazo/contracts";
import type { PrismaClient } from "@rakazo/db";
import { createRepos } from "@rakazo/db";
import { describe, expect, it, vi } from "vitest";
import { extractBotInferenceConfig, extractBotMcpConfig, isToolPermitted } from "./executor.js";
import { RakazoFreePolicyEngine } from "./free-policy-engine.js";

describe("Milestone 1 Challenger 2: Full-Chain Inference & MCP Integration (@rakazo/adapters)", () => {
  const actor: Actor = {
    userId: "user-fullchain-1",
    workspaceId: "ws-fullchain-prod",
    email: "fullchain@rakazo.internal",
    isDeploymentOwner: true,
  };

  const sampleDate = new Date("2026-08-31T12:00:00.000Z");

  const complexMcpConfig: BotMcpConfig = {
    connectors: {
      github: true,
      notion: true,
      searxng_scraperr: true,
      cloudflare: false,
      postgres: true,
    },
    tools: {
      web_search: true,
      web_scrape: true,
      github_search_repos: true,
      github_list_issues: false,
      notion_search: true,
      cloudflare_purge_cache: false,
    },
  };

  function createMockDbBot(overrides: Record<string, unknown> = {}) {
    return {
      id: "bot-fc-001",
      workspaceId: "ws-fullchain-prod",
      userId: "user-fullchain-1",
      name: "Sovereign FullChain Bot",
      title: "FullChain Specialist",
      description: "Integration tester",
      instructions: "Follow zero-loss principles.",
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
      metadata: { mcp: complexMcpConfig },
      createdAt: sampleDate,
      updatedAt: sampleDate,
      thread: {
        id: "thread-fc-001",
        unread: false,
        messages: [{ blocks: [{ text: "Initial message" }] }],
      },
      runs: [{ status: "idle" }],
      computer: { scope: "team" },
      ...overrides,
    };
  }

  // ==========================================================================
  // 1. FULL CHAIN ROUNDTRIP (createBot -> mapBot -> extract -> isFreeMode -> Policy)
  // ==========================================================================
  describe("1. Full-Chain Roundtrip & Policy Validation", () => {
    it("1.1 Free bot roundtrip: createBot -> mapBot -> extractBotInferenceConfig -> isFreeMode = true -> Policy routing", async () => {
      const dbRecord = createMockDbBot({
        id: "bot-chain-free-001",
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

      // Step 1: createBot & mapBot
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

      // Step 2: extractBotInferenceConfig
      const extractedInference = extractBotInferenceConfig(bot);
      expect(extractedInference).toBeDefined();
      expect(extractedInference?.mode).toBe("free");
      expect(extractedInference?.tags).toEqual(["coding", "analysis"]);

      // Step 3: extractBotMcpConfig & tool permission check
      const extractedMcp = extractBotMcpConfig(bot);
      expect(extractedMcp).toBeDefined();
      expect(extractedMcp?.connectors?.github).toBe(true);
      expect(isToolPermitted("github_search_repos", extractedMcp)).toBe(true);
      expect(isToolPermitted("github_list_issues", extractedMcp)).toBe(false);

      // Step 4: isFreeMode evaluation
      const isFreeMode = extractedInference?.mode === "free";
      expect(isFreeMode).toBe(true);

      // Step 5: Policy engine route resolution (coding 80 > analysis 60)
      const policyEngine = new RakazoFreePolicyEngine();
      const decision = policyEngine.resolveRoute(extractedInference!.tags);
      expect(decision.model).toBe("combo/rakazo-coding");
      expect(decision.category).toBe("coding");
      expect(decision.provider).toBe("omniroute");
      expect(decision.isFree).toBe(true);
      expect(decision.costPerToken).toBe(0.0);
    });

    it("1.2 Multi-tag priority resolution roundtrip: reasoning (100) > writing (40) > fast (20)", async () => {
      const dbRecord = createMockDbBot({
        id: "bot-chain-multitag",
        metadata: {
          inference: {
            mode: "free",
            tags: ["writing", "fast", "reasoning"],
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
        name: "Multi-tag Bot",
        title: "Test",
        description: "Desc",
        instructions: "Inst",
        notifyOnFinish: true,
        inference: {
          mode: "free",
          tags: ["writing", "fast", "reasoning"],
        },
      });

      const extracted = extractBotInferenceConfig(bot);
      expect(extracted?.mode).toBe("free");

      const policyEngine = new RakazoFreePolicyEngine();
      const decision = policyEngine.resolveRoute(extracted!.tags);
      expect(decision.model).toBe("combo/rakazo-reasoning");
      expect(decision.category).toBe("reasoning");
    });

    it("1.3 Legacy bot roundtrip: createBot without inference -> extractBotInferenceConfig undefined -> isFreeMode = false", async () => {
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

      const extractedInference = extractBotInferenceConfig(bot);
      expect(extractedInference).toBeUndefined();

      const isFreeMode = extractedInference?.mode === "free";
      expect(isFreeMode).toBe(false);
    });

    it("1.4 Subagent full chain: child bot created by Free parent inherits Free mode with anti-escalation", async () => {
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

      const extractedChildInference = extractBotInferenceConfig(childBot);
      expect(extractedChildInference?.mode).toBe("free");
      expect(extractedChildInference?.tags).toEqual(["coding"]);

      const isChildFree = extractedChildInference?.mode === "free";
      expect(isChildFree).toBe(true);
    });
  });

  // ==========================================================================
  // 2. EXHAUSTIVE MULTI-TAG PERMUTATION MATRIX
  // ==========================================================================
  describe("2. Cognitive Priority Permutation Matrix", () => {
    it("2.1 Resolves all 16 tag permutations with 100% mathematical determinism", () => {
      const policyEngine = new RakazoFreePolicyEngine();

      const testCases: Array<{
        tags: InferenceUsageTag[];
        expectedModel: string;
        expectedCategory: string;
      }> = [
        // 0 tags (fallback)
        { tags: [], expectedModel: "combo/rakazo-fast", expectedCategory: "general" },
        // 1 tag
        { tags: ["coding"], expectedModel: "combo/rakazo-coding", expectedCategory: "coding" },
        {
          tags: ["reasoning"],
          expectedModel: "combo/rakazo-reasoning",
          expectedCategory: "reasoning",
        },
        { tags: ["fast"], expectedModel: "combo/rakazo-fast", expectedCategory: "fast" },
        { tags: ["writing"], expectedModel: "combo/rakazo-writing", expectedCategory: "writing" },
        {
          tags: ["analysis"],
          expectedModel: "combo/rakazo-analysis",
          expectedCategory: "analysis",
        },
        // 2 tags (Priority: reasoning 100 > coding 80 > analysis 60 > writing 40 > fast 20)
        {
          tags: ["coding", "reasoning"],
          expectedModel: "combo/rakazo-reasoning",
          expectedCategory: "reasoning",
        },
        {
          tags: ["fast", "coding"],
          expectedModel: "combo/rakazo-coding",
          expectedCategory: "coding",
        },
        {
          tags: ["writing", "analysis"],
          expectedModel: "combo/rakazo-analysis",
          expectedCategory: "analysis",
        },
        {
          tags: ["fast", "writing"],
          expectedModel: "combo/rakazo-writing",
          expectedCategory: "writing",
        },
        {
          tags: ["analysis", "reasoning"],
          expectedModel: "combo/rakazo-reasoning",
          expectedCategory: "reasoning",
        },
        {
          tags: ["coding", "analysis"],
          expectedModel: "combo/rakazo-coding",
          expectedCategory: "coding",
        },
        // 3 tags
        {
          tags: ["fast", "writing", "coding"],
          expectedModel: "combo/rakazo-coding",
          expectedCategory: "coding",
        },
        {
          tags: ["fast", "analysis", "reasoning"],
          expectedModel: "combo/rakazo-reasoning",
          expectedCategory: "reasoning",
        },
        {
          tags: ["writing", "coding", "analysis"],
          expectedModel: "combo/rakazo-coding",
          expectedCategory: "coding",
        },
        {
          tags: ["fast", "writing", "analysis"],
          expectedModel: "combo/rakazo-analysis",
          expectedCategory: "analysis",
        },
      ];

      for (const tc of testCases) {
        const decision = policyEngine.resolveRoute(tc.tags);
        expect(decision.model).toBe(tc.expectedModel);
        expect(decision.category).toBe(tc.expectedCategory);
        expect(decision.provider).toBe("omniroute");
      }
    });

    it("2.2 extractBotInferenceConfig handles raw object shapes without metadata wrapper", () => {
      const directBotShape = {
        id: "bot-direct",
        inference: {
          mode: "free",
          tags: ["fast"],
        },
      };

      const extracted = extractBotInferenceConfig(directBotShape);
      expect(extracted).toEqual({
        mode: "free",
        tags: ["fast"],
      });
    });

    it("2.3 extractBotInferenceConfig handles primitive non-objects safely", () => {
      expect(extractBotInferenceConfig(null)).toBeUndefined();
      expect(extractBotInferenceConfig(undefined)).toBeUndefined();
      expect(extractBotInferenceConfig("a string")).toBeUndefined();
      expect(extractBotInferenceConfig(42)).toBeUndefined();
      expect(extractBotInferenceConfig([])).toBeUndefined();
      expect(extractBotInferenceConfig({})).toBeUndefined();
    });
  });
});
