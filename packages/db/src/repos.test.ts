import { describe, expect, it, vi } from "vitest";
import type { Actor } from "@rakazo/contracts";
import type { PrismaClient } from "./client.js";
import { createRepos } from "./repos.js";
import { IsolationError } from "./scope.js";

describe("Bot Repository (repos.ts)", () => {
  const actor: Actor = {
    userId: "user-1",
    workspaceId: "ws-1",
    email: "user-1@example.com",
    isDeploymentOwner: true,
  };

  const otherActor: Actor = {
    userId: "user-2",
    workspaceId: "ws-2",
    email: "user-2@example.com",
    isDeploymentOwner: false,
  };

  const sampleDate = new Date("2026-08-22T10:00:00.000Z");

  const sampleDbBot = {
    id: "bot-1",
    workspaceId: "ws-1",
    userId: "user-1",
    name: "Sovereign Assistant",
    title: "Expert Cloud & Ops",
    description: "Assistant avec outils MCP",
    instructions: "Instructions précises",
    color: "#4F46E5",
    notifyOnFinish: true,
    pinned: false,
    archivedAt: null,
    parentBotId: null,
    computerId: "comp-1",
    computerSwitching: false,
    voiceId: null,
    autoSpeak: false,
    metadata: {
      mcp: {
        connectors: { github: true, searxng_scraperr: true },
        tools: { web_search: true, github_search_repos: true },
      },
    },
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

  describe("listBots", () => {
    it("returns mapped bots with parsed metadata and previews", async () => {
      const findMany = vi.fn().mockResolvedValue([sampleDbBot]);
      const prisma = { bot: { findMany } } as unknown as PrismaClient;
      const repos = createRepos(prisma);

      const result = await repos.listBots(actor);

      expect(findMany).toHaveBeenCalledWith({
        where: {
          workspaceId: actor.workspaceId,
          userId: actor.userId,
          archivedAt: null,
        },
        include: {
          thread: {
            include: {
              messages: { orderBy: { seq: "desc" }, take: 1 },
            },
          },
          runs: {
            where: {
              status: { in: ["running", "queued", "leased", "waiting_input", "waiting_takeover"] },
            },
            orderBy: { createdAt: "desc" },
            take: 1,
          },
          computer: { select: { scope: true } },
        },
        orderBy: [{ pinned: "desc" }, { updatedAt: "desc" }],
      });

      expect(result).toHaveLength(1);
      const first = result[0]!;
      expect(first.id).toBe("bot-1");
      expect(first.name).toBe("Sovereign Assistant");
      expect(first.preview).toBe("Bonjour !");
      expect(first.metadata).toEqual({
        mcp: {
          connectors: { github: true, searxng_scraperr: true },
          tools: { web_search: true, github_search_repos: true },
        },
      });
    });
  });

  describe("getBot", () => {
    it("fetches single bot for actor workspace", async () => {
      const findFirst = vi.fn().mockResolvedValue(sampleDbBot);
      const prisma = { bot: { findFirst } } as unknown as PrismaClient;
      const repos = createRepos(prisma);

      const bot = await repos.getBot(actor, "bot-1");
      expect(findFirst).toHaveBeenCalledWith({
        where: {
          id: "bot-1",
          workspaceId: actor.workspaceId,
          userId: actor.userId,
          archivedAt: null,
        },
        include: { thread: true, computer: true },
      });
      expect(bot.id).toBe("bot-1");
    });

    it("throws IsolationError when bot not found in actor workspace", async () => {
      const findFirst = vi.fn().mockResolvedValue(null);
      const prisma = { bot: { findFirst } } as unknown as PrismaClient;
      const repos = createRepos(prisma);

      await expect(repos.getBot(otherActor, "bot-1")).rejects.toThrow(IsolationError);
    });
  });

  describe("createBot", () => {
    it("persists metadata including MCP config in database transaction", async () => {
      const mockCreated = {
        id: "bot-new",
        workspaceId: "ws-1",
        userId: "user-1",
        name: "Nouveau Bot",
        title: "Test",
        description: "Desc",
        instructions: "Inst",
        color: "#10B981",
        notifyOnFinish: true,
        pinned: false,
        archivedAt: null,
        parentBotId: null,
        createdAt: sampleDate,
        updatedAt: sampleDate,
        metadata: {
          mcp: {
            connectors: { cloudflare: true },
            tools: { cloudflare_purge_cache: true },
          },
        },
        thread: { id: "thread-new", unread: false },
        computer: { scope: "team" },
      };

      const tx = {
        computer: {
          upsert: vi.fn().mockResolvedValue({ id: "comp-team", scope: "team" }),
        },
        bot: {
          create: vi.fn().mockResolvedValue(mockCreated),
          findFirstOrThrow: vi.fn().mockResolvedValue(mockCreated),
        },
        thread: {
          create: vi.fn().mockResolvedValue({ id: "thread-new" }),
        },
        browserProfile: {
          create: vi.fn().mockResolvedValue({ id: "bp-1" }),
        },
        memoryDocument: {
          create: vi.fn().mockResolvedValue({ id: "mem-1" }),
        },
      };

      const prisma = {
        bot: { count: vi.fn().mockResolvedValue(0) },
        deploymentSettings: { findUnique: vi.fn().mockResolvedValue(null) },
        $transaction: vi.fn().mockImplementation(async (callback) => callback(tx)),
      } as unknown as PrismaClient;

      const repos = createRepos(prisma);
      const created = await repos.createBot(actor, {
        name: "Nouveau Bot",
        title: "Test",
        description: "Desc",
        instructions: "Inst",
        notifyOnFinish: true,
        metadata: {
          mcp: {
            connectors: { cloudflare: true },
            tools: { cloudflare_purge_cache: true },
          },
        },
      });

      expect(tx.bot.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          name: "Nouveau Bot",
          workspaceId: "ws-1",
          userId: "user-1",
          metadata: {
            mcp: {
              connectors: { cloudflare: true },
              tools: { cloudflare_purge_cache: true },
            },
          },
        }),
      });
      expect(created.id).toBe("bot-new");
      expect(created.metadata).toEqual({
        mcp: {
          connectors: { cloudflare: true },
          tools: { cloudflare_purge_cache: true },
        },
      });
    });
  });

  describe("updateBot", () => {
    it("updates bot metadata and fields then returns mapped bot", async () => {
      const updatedDbBot = {
        ...sampleDbBot,
        title: "Titre Modifié",
        metadata: {
          mcp: {
            connectors: { notion: true },
            tools: { notion_search: true },
          },
        },
      };

      const findFirst = vi.fn().mockResolvedValue(sampleDbBot);
      const update = vi.fn().mockResolvedValue(updatedDbBot);
      const findMany = vi.fn().mockResolvedValue([updatedDbBot]);

      const prisma = {
        bot: { findFirst, update, findMany },
      } as unknown as PrismaClient;

      const repos = createRepos(prisma);
      const result = await repos.updateBot(actor, {
        botId: "bot-1",
        title: "Titre Modifié",
        metadata: {
          mcp: {
            connectors: { notion: true },
            tools: { notion_search: true },
          },
        },
      });

      expect(findFirst).toHaveBeenCalledWith({
        where: { id: "bot-1", workspaceId: "ws-1", userId: "user-1", archivedAt: null },
        include: { thread: true, computer: true },
      });

      expect(update).toHaveBeenCalledWith({
        where: { id: "bot-1" },
        data: {
          title: "Titre Modifié",
          metadata: {
            mcp: {
              connectors: { notion: true },
              tools: { notion_search: true },
            },
          },
        },
      });

      expect(result.title).toBe("Titre Modifié");
      expect(result.metadata).toEqual({
        mcp: {
          connectors: { notion: true },
          tools: { notion_search: true },
        },
      });
    });
  });
});
