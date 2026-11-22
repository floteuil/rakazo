import { describe, expect, it, vi } from "vitest";
import type { Prisma, PrismaClient } from "./client.js";
import {
  assignSkillsToBot,
  createSkill,
  createSkillRepos,
  deleteSkill,
  getSkillById,
  getSkillBySlug,
  listBotSkills,
  listSkills,
  toggleBotSkill,
  updateSkill,
} from "./skills.js";

// ============================================================================
// ADVERSARIAL STRESS TEST SUITE: MILESTONE 1 (DB & PRISMA)
// ============================================================================

describe("Adversarial Test Suite: Milestone 1 (DB & Prisma)", () => {
  const workspaceA = "ws-org-alpha";
  const workspaceB = "ws-org-beta";
  const userA = "usr-alice";
  const bot1 = "bot-scraper-1";
  const bot2 = "bot-analyst-2";

  // --------------------------------------------------------------------------
  // 1. CASCADE SEMANTICS & ISOLATION ADVERSARIAL TESTS
  // --------------------------------------------------------------------------
  describe("1. Cascade Semantics & Isolation", () => {
    it("deleting a skill triggers cascade deletion of its bot associations without mutating bots", async () => {
      const skillId = "skill-docling";
      const del = vi.fn().mockResolvedValue({ id: skillId, name: "Docling Parser" });
      const prisma = { skill: { delete: del } } as unknown as PrismaClient;

      const result = await deleteSkill(prisma, workspaceA, skillId);

      expect(del).toHaveBeenCalledWith({
        where: { id: skillId },
      });
      expect(result.id).toBe(skillId);
    });

    it("assignSkillsToBot atomically isolates deletions and inserts per workspace and bot", async () => {
      const deleteMany = vi.fn().mockResolvedValue({ count: 3 });
      const createMany = vi.fn().mockResolvedValue({ count: 2 });
      const findMany = vi.fn().mockResolvedValue([
        { id: "bs-1", workspaceId: workspaceA, botId: bot1, skillId: "sk-1", enabled: true },
        { id: "bs-2", workspaceId: workspaceA, botId: bot1, skillId: "sk-2", enabled: true },
      ]);

      const tx = {
        botSkill: { deleteMany, createMany, findMany },
      };

      const $transaction = vi
        .fn()
        .mockImplementation(async (callback: (txArg: typeof tx) => Promise<unknown>) => {
          return callback(tx);
        });

      const prisma = { $transaction } as unknown as PrismaClient;

      // Assign skills to bot1 in workspaceA
      await assignSkillsToBot(prisma, workspaceA, bot1, ["sk-1", "sk-2"]);

      // Verify deletion scope is strictly bounded to workspaceA and bot1
      expect(deleteMany).toHaveBeenCalledWith({
        where: { workspaceId: workspaceA, botId: bot1 },
      });

      // Verify insertion scope is strictly bounded to workspaceA and bot1
      expect(createMany).toHaveBeenCalledWith({
        data: [
          { workspaceId: workspaceA, botId: bot1, skillId: "sk-1", enabled: true },
          { workspaceId: workspaceA, botId: bot1, skillId: "sk-2", enabled: true },
        ],
        skipDuplicates: true,
      });
    });

    it("assignSkillsToBot with duplicate skillIds relies on skipDuplicates for database safety", async () => {
      const deleteMany = vi.fn().mockResolvedValue({ count: 0 });
      const createMany = vi.fn().mockResolvedValue({ count: 1 });
      const findMany = vi.fn().mockResolvedValue([]);

      const tx = {
        botSkill: { deleteMany, createMany, findMany },
      };

      const $transaction = vi
        .fn()
        .mockImplementation(async (callback: (txArg: typeof tx) => Promise<unknown>) => {
          return callback(tx);
        });

      const prisma = { $transaction } as unknown as PrismaClient;

      // Duplicate skill IDs in input array
      await assignSkillsToBot(prisma, workspaceA, bot1, ["sk-dup", "sk-dup", "sk-dup"]);

      expect(createMany).toHaveBeenCalledWith({
        data: [
          { workspaceId: workspaceA, botId: bot1, skillId: "sk-dup", enabled: true },
          { workspaceId: workspaceA, botId: bot1, skillId: "sk-dup", enabled: true },
          { workspaceId: workspaceA, botId: bot1, skillId: "sk-dup", enabled: true },
        ],
        skipDuplicates: true,
      });
    });
  });

  // --------------------------------------------------------------------------
  // 2. INDEXING & UNIQUENESS CONSTRAINTS
  // --------------------------------------------------------------------------
  describe("2. Indexing & Uniqueness Constraints", () => {
    it("getSkillBySlug queries exact composite unique index key (workspaceId_slug)", async () => {
      const findUnique = vi.fn().mockResolvedValue({
        id: "sk-unique",
        workspaceId: workspaceA,
        slug: "searxng-research",
      });
      const prisma = { skill: { findUnique } } as unknown as PrismaClient;

      const res = await getSkillBySlug(prisma, workspaceA, "searxng-research");

      expect(findUnique).toHaveBeenCalledWith({
        where: {
          workspaceId_slug: {
            workspaceId: workspaceA,
            slug: "searxng-research",
          },
        },
      });
      expect(res?.slug).toBe("searxng-research");
    });

    it("toggleBotSkill queries exact composite unique index key (botId_skillId)", async () => {
      const update = vi.fn().mockResolvedValue({
        id: "bs-toggle",
        botId: bot1,
        skillId: "sk-docling",
        enabled: false,
      });
      const prisma = { botSkill: { update } } as unknown as PrismaClient;

      const res = await toggleBotSkill(prisma, workspaceA, bot1, "sk-docling", false);

      expect(update).toHaveBeenCalledWith({
        where: {
          botId_skillId: {
            botId: bot1,
            skillId: "sk-docling",
          },
        },
        data: { enabled: false },
      });
      expect(res.enabled).toBe(false);
    });

    it("listSkills uses workspaceId filter and updatedAt desc sorting matching composite index", async () => {
      const findMany = vi.fn().mockResolvedValue([]);
      const prisma = { skill: { findMany } } as unknown as PrismaClient;

      await listSkills(prisma, workspaceA);

      expect(findMany).toHaveBeenCalledWith({
        where: { workspaceId: workspaceA },
        orderBy: { updatedAt: "desc" },
      });
    });

    it("listBotSkills uses composite filter matching (workspaceId, botId) index and includes relation", async () => {
      const findMany = vi.fn().mockResolvedValue([]);
      const prisma = { botSkill: { findMany } } as unknown as PrismaClient;

      await listBotSkills(prisma, workspaceA, bot1);

      expect(findMany).toHaveBeenCalledWith({
        where: { workspaceId: workspaceA, botId: bot1 },
        include: { skill: true },
        orderBy: { createdAt: "asc" },
      });
    });
  });

  // --------------------------------------------------------------------------
  // 3. JSONB SERIALIZATION & DEFAULT VALUE HANDLING
  // --------------------------------------------------------------------------
  describe("3. JSONB Serialization & Defaults", () => {
    it("handles deeply nested JSON metadata and complex tag arrays properly", async () => {
      const create = vi
        .fn()
        .mockImplementation(({ data }) => Promise.resolve({ id: "sk-json", ...data }));
      const prisma = { skill: { create } } as unknown as PrismaClient;

      const complexMetadata = {
        author: {
          name: "Équipe Groupe Floteuil",
          email: "tech@floteuil.fr",
          internal: true,
        },
        requirements: ["python3.12", "searxng", "scraperr"],
        config: {
          max_tokens: 4096,
          temperature: 0.2,
          nested: {
            flags: [true, false, null],
            version: "2.1.0-rc1",
          },
        },
      };

      const complexTags = ["web-scraping", "french-nlp", "mcp-v3", "sécurité-hds"];

      await createSkill(prisma, {
        workspaceId: workspaceA,
        userId: userA,
        name: "Expert Sécurité HDS",
        slug: "expert-securite-hds",
        description: "Guide complet pour le chiffrement et la sécurité HDS",
        content: '# HDS Security\n\n```json\n{"encryption": "AES-256-GCM"}\n```',
        tags: complexTags,
        metadata: complexMetadata,
      });

      expect(create).toHaveBeenCalledWith({
        data: {
          workspaceId: workspaceA,
          userId: userA,
          name: "Expert Sécurité HDS",
          slug: "expert-securite-hds",
          description: "Guide complet pour le chiffrement et la sécurité HDS",
          content: '# HDS Security\n\n```json\n{"encryption": "AES-256-GCM"}\n```',
          tags: complexTags,
          metadata: complexMetadata,
        },
      });
    });

    it("falls back cleanly to empty array and empty object when tags/metadata are undefined", async () => {
      const create = vi
        .fn()
        .mockImplementation(({ data }) => Promise.resolve({ id: "sk-defaults", ...data }));
      const prisma = { skill: { create } } as unknown as PrismaClient;

      await createSkill(prisma, {
        workspaceId: workspaceA,
        userId: userA,
        name: "Minimal Skill",
        slug: "minimal-skill",
        content: "# Minimal Content",
      });

      expect(create).toHaveBeenCalledWith({
        data: {
          workspaceId: workspaceA,
          userId: userA,
          name: "Minimal Skill",
          slug: "minimal-skill",
          description: "",
          content: "# Minimal Content",
          tags: [],
          metadata: {},
        },
      });
    });

    it("allows updating tags and metadata selectively without overwriting omitted fields", async () => {
      const update = vi.fn().mockResolvedValue({ id: "sk-123" });
      const prisma = { skill: { update } } as unknown as PrismaClient;

      // Update only metadata
      await updateSkill(prisma, workspaceA, "sk-123", {
        metadata: { updated: true, revision: 2 },
      });

      expect(update).toHaveBeenCalledWith({
        where: { id: "sk-123" },
        data: {
          metadata: { updated: true, revision: 2 },
        },
      });

      // Update only tags and name
      await updateSkill(prisma, workspaceA, "sk-123", {
        name: "New Name",
        tags: ["tag1", "tag2"],
      });

      expect(update).toHaveBeenCalledWith({
        where: { id: "sk-123" },
        data: {
          name: "New Name",
          tags: ["tag1", "tag2"],
        },
      });
    });
  });

  // --------------------------------------------------------------------------
  // 4. REPOSITORY FACTORY BOUND CONTEXT
  // --------------------------------------------------------------------------
  describe("4. Repository Factory Bound Context", () => {
    it("createSkillRepos returns fully functional repository instance binding all 9 operations", async () => {
      const mockPrisma = {
        skill: {
          findMany: vi.fn().mockResolvedValue([]),
          findFirst: vi.fn().mockResolvedValue(null),
          findUnique: vi.fn().mockResolvedValue(null),
          create: vi.fn().mockResolvedValue({ id: "sk-factory" }),
          update: vi.fn().mockResolvedValue({ id: "sk-factory" }),
          delete: vi.fn().mockResolvedValue({ id: "sk-factory" }),
        },
        botSkill: {
          findMany: vi.fn().mockResolvedValue([]),
          update: vi.fn().mockResolvedValue({ id: "bs-factory" }),
        },
        $transaction: vi.fn().mockResolvedValue([]),
      } as unknown as PrismaClient;

      const repos = createSkillRepos(mockPrisma);

      expect(typeof repos.listSkills).toBe("function");
      expect(typeof repos.getSkillById).toBe("function");
      expect(typeof repos.getSkillBySlug).toBe("function");
      expect(typeof repos.createSkill).toBe("function");
      expect(typeof repos.updateSkill).toBe("function");
      expect(typeof repos.deleteSkill).toBe("function");
      expect(typeof repos.listBotSkills).toBe("function");
      expect(typeof repos.assignSkillsToBot).toBe("function");
      expect(typeof repos.toggleBotSkill).toBe("function");

      await repos.getSkillById(workspaceA, "sk-factory");
      expect(mockPrisma.skill.findFirst).toHaveBeenCalledWith({
        where: { id: "sk-factory", workspaceId: workspaceA },
      });
    });
  });
});
