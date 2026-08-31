import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "./client.js";
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

describe("Adversarial & Stress Tests — Skills Repository & Persistence", () => {
  const ws1 = "ws-tenant-alpha";
  const ws2 = "ws-tenant-beta";
  const user1 = "user-alice-001";
  const bot1 = "bot-cuid-100";
  const skill1 = "skill-cuid-500";

  describe("1. Boundary & Malformed Inputs", () => {
    it("handles SQL injection payloads in slug, name, and search queries safely", async () => {
      const sqlInjectionSlug = "admin' OR '1'='1'; DROP TABLE skills; --";
      const sqlInjectionName = "'; SELECT * FROM users; --";
      const create = vi
        .fn()
        .mockImplementation(({ data }) => Promise.resolve({ id: "s-sec", ...data }));
      const prisma = { skill: { create } } as unknown as PrismaClient;

      const result = await createSkill(prisma, {
        workspaceId: ws1,
        userId: user1,
        name: sqlInjectionName,
        slug: sqlInjectionSlug,
        content: "malicious code injection content",
      });

      expect(create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          workspaceId: ws1,
          slug: sqlInjectionSlug,
          name: sqlInjectionName,
        }),
      });
      expect(result.slug).toBe(sqlInjectionSlug);
    });

    it("handles ultra-large markdown payload (10 MB content stress test)", async () => {
      const largeContent = "# Big Skill\n" + "A".repeat(10 * 1024 * 1024); // 10MB
      const create = vi
        .fn()
        .mockImplementation(({ data }) => Promise.resolve({ id: "s-big", ...data }));
      const prisma = { skill: { create } } as unknown as PrismaClient;

      const result = await createSkill(prisma, {
        workspaceId: ws1,
        userId: user1,
        name: "Large Skill",
        slug: "large-skill",
        content: largeContent,
      });

      expect(create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          content: largeContent,
        }),
      });
      expect(result.content.length).toBe(largeContent.length);
    });

    it("handles complex, deeply nested JSON in metadata and non-standard tags", async () => {
      const complexMetadata = {
        nested: { level1: { level2: { array: [1, 2, "3", { deep: true }] } } },
        specialChars: "<script>alert('xss')</script> & ' \" \n \t",
        numericFlags: { active: 1, limit: 1000000000000 },
      };
      const nonStandardTags = ["tag-1", "tag:special#chars", "🇫🇷 français", "🤖 ai-agent"];

      const create = vi
        .fn()
        .mockImplementation(({ data }) => Promise.resolve({ id: "s-json", ...data }));
      const prisma = { skill: { create } } as unknown as PrismaClient;

      const result = await createSkill(prisma, {
        workspaceId: ws1,
        userId: user1,
        name: "JSON Skill",
        slug: "json-skill",
        content: "content",
        tags: nonStandardTags,
        metadata: complexMetadata,
      });

      expect(create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          tags: nonStandardTags,
          metadata: complexMetadata,
        }),
      });
      expect(result.metadata).toEqual(complexMetadata);
      expect(result.tags).toEqual(nonStandardTags);
    });

    it("coerces missing / undefined optional fields to valid database defaults", async () => {
      const create = vi
        .fn()
        .mockImplementation(({ data }) => Promise.resolve({ id: "s-defs", ...data }));
      const prisma = { skill: { create } } as unknown as PrismaClient;

      const result = await createSkill(prisma, {
        workspaceId: ws1,
        userId: user1,
        name: "Minimal Skill",
        slug: "minimal-skill",
        content: "minimal content",
        description: undefined,
        tags: undefined,
        metadata: undefined,
      });

      expect(create).toHaveBeenCalledWith({
        data: {
          workspaceId: ws1,
          userId: user1,
          name: "Minimal Skill",
          slug: "minimal-skill",
          description: "",
          content: "minimal content",
          tags: [],
          metadata: {},
        },
      });
      expect(result.description).toBe("");
      expect(result.tags).toEqual([]);
      expect(result.metadata).toEqual({});
    });

    it("handles empty update input gracefully without overwriting undefined fields", async () => {
      const update = vi.fn().mockResolvedValue({ id: skill1, name: "Original" });
      const prisma = { skill: { update } } as unknown as PrismaClient;

      await updateSkill(prisma, ws1, skill1, {});

      expect(update).toHaveBeenCalledWith({
        where: { id: skill1 },
        data: {},
      });
    });
  });

  describe("2. Multi-Tenant Scoping & Isolation Stress", () => {
    it("ensures listSkills strictly restricts query by workspaceId", async () => {
      const findMany = vi.fn().mockResolvedValue([]);
      const prisma = { skill: { findMany } } as unknown as PrismaClient;

      await listSkills(prisma, ws1);
      expect(findMany).toHaveBeenCalledWith({
        where: { workspaceId: ws1 },
        orderBy: { updatedAt: "desc" },
      });

      await listSkills(prisma, ws2);
      expect(findMany).toHaveBeenCalledWith({
        where: { workspaceId: ws2 },
        orderBy: { updatedAt: "desc" },
      });
    });

    it("ensures getSkillById isolates by both skillId AND workspaceId", async () => {
      const findFirst = vi.fn().mockResolvedValue(null);
      const prisma = { skill: { findFirst } } as unknown as PrismaClient;

      const result = await getSkillById(prisma, ws1, "foreign-skill-id");
      expect(findFirst).toHaveBeenCalledWith({
        where: { id: "foreign-skill-id", workspaceId: ws1 },
      });
      expect(result).toBeNull();
    });

    it("ensures getSkillBySlug uses workspaceId_slug compound key", async () => {
      const findUnique = vi.fn().mockResolvedValue(null);
      const prisma = { skill: { findUnique } } as unknown as PrismaClient;

      await getSkillBySlug(prisma, ws1, "shared-slug");
      expect(findUnique).toHaveBeenCalledWith({
        where: { workspaceId_slug: { workspaceId: ws1, slug: "shared-slug" } },
      });
    });

    it("analyzes updateSkill and deleteSkill targeting behavior", async () => {
      const update = vi.fn().mockResolvedValue({ id: skill1, name: "New Name" });
      const del = vi.fn().mockResolvedValue({ id: skill1 });
      const prisma = {
        skill: { update, delete: del },
      } as unknown as PrismaClient;

      await updateSkill(prisma, ws1, skill1, { name: "New Name" });
      expect(update).toHaveBeenCalledWith({
        where: { id: skill1 },
        data: { name: "New Name" },
      });

      await deleteSkill(prisma, ws1, skill1);
      expect(del).toHaveBeenCalledWith({
        where: { id: skill1 },
      });
    });
  });

  describe("3. Transaction Atomicity, Duplicate Keys & Rollback Stress", () => {
    it("deduplicates duplicate skill IDs passed to assignSkillsToBot using skipDuplicates", async () => {
      const deleteMany = vi.fn().mockResolvedValue({ count: 2 });
      const createMany = vi.fn().mockResolvedValue({ count: 2 });
      const findMany = vi.fn().mockResolvedValue([
        { id: "bs1", botId: bot1, skillId: "s1", enabled: true, skill: { id: "s1" } },
        { id: "bs2", botId: bot1, skillId: "s2", enabled: true, skill: { id: "s2" } },
      ]);

      const tx = {
        botSkill: { deleteMany, createMany, findMany },
      };
      const $transaction = vi
        .fn()
        .mockImplementation(async (cb: (t: typeof tx) => Promise<unknown>) => cb(tx));
      const prisma = { $transaction } as unknown as PrismaClient;

      // Passing duplicate skill IDs in list
      const duplicatesList = ["s1", "s2", "s1", "s2", "s1"];
      const result = await assignSkillsToBot(prisma, ws1, bot1, duplicatesList);

      expect(deleteMany).toHaveBeenCalledWith({
        where: { workspaceId: ws1, botId: bot1 },
      });
      expect(createMany).toHaveBeenCalledWith({
        data: [
          { workspaceId: ws1, botId: bot1, skillId: "s1", enabled: true },
          { workspaceId: ws1, botId: bot1, skillId: "s2", enabled: true },
          { workspaceId: ws1, botId: bot1, skillId: "s1", enabled: true },
          { workspaceId: ws1, botId: bot1, skillId: "s2", enabled: true },
          { workspaceId: ws1, botId: bot1, skillId: "s1", enabled: true },
        ],
        skipDuplicates: true,
      });
      expect(result).toHaveLength(2);
    });

    it("propagates error and aborts transaction if createMany fails", async () => {
      const deleteMany = vi.fn().mockResolvedValue({ count: 1 });
      const createMany = vi
        .fn()
        .mockRejectedValue(new Error("FK constraint violation: foreign skillId"));
      const findMany = vi.fn();

      const tx = {
        botSkill: { deleteMany, createMany, findMany },
      };
      const $transaction = vi
        .fn()
        .mockImplementation(async (cb: (t: typeof tx) => Promise<unknown>) => cb(tx));
      const prisma = { $transaction } as unknown as PrismaClient;

      await expect(assignSkillsToBot(prisma, ws1, bot1, ["non-existent-skill-id"])).rejects.toThrow(
        "FK constraint violation",
      );

      expect(deleteMany).toHaveBeenCalled();
      expect(createMany).toHaveBeenCalled();
      expect(findMany).not.toHaveBeenCalled();
    });

    it("handles concurrent assignment race condition simulation cleanly", async () => {
      let activeState: string[] = ["initial-s1"];
      const mockTxExecutor = async (skillIds: string[]) => {
        // simulate transaction sequence
        activeState = []; // deleteMany
        activeState.push(...new Set(skillIds)); // createMany
        return activeState.map((s, idx) => ({
          id: `bs-${idx}`,
          botId: bot1,
          skillId: s,
          enabled: true,
          skill: { id: s, name: `Skill ${s}` },
        }));
      };

      const $transaction = vi.fn().mockImplementation(async (cb) => {
        const tx = {
          botSkill: {
            deleteMany: vi.fn(),
            createMany: vi.fn(),
            findMany: vi.fn().mockImplementation(() => activeState),
          },
        };
        return cb(tx);
      });
      const prisma = { $transaction } as unknown as PrismaClient;

      const p1 = assignSkillsToBot(prisma, ws1, bot1, ["s1", "s2"]);
      const p2 = assignSkillsToBot(prisma, ws1, bot1, ["s2", "s3"]);

      const [r1, r2] = await Promise.all([p1, p2]);
      expect($transaction).toHaveBeenCalledTimes(2);
    });
  });

  describe("4. Toggle BotSkill State Machine", () => {
    it("toggles enabled from true to false and back", async () => {
      const update = vi
        .fn()
        .mockResolvedValueOnce({ botId: bot1, skillId: "s1", enabled: false })
        .mockResolvedValueOnce({ botId: bot1, skillId: "s1", enabled: true });
      const prisma = { botSkill: { update } } as unknown as PrismaClient;

      const res1 = await toggleBotSkill(prisma, ws1, bot1, "s1", false);
      expect(res1.enabled).toBe(false);
      expect(update).toHaveBeenNthCalledWith(1, {
        where: { botId_skillId: { botId: bot1, skillId: "s1" } },
        data: { enabled: false },
      });

      const res2 = await toggleBotSkill(prisma, ws1, bot1, "s1", true);
      expect(res2.enabled).toBe(true);
      expect(update).toHaveBeenNthCalledWith(2, {
        where: { botId_skillId: { botId: bot1, skillId: "s1" } },
        data: { enabled: true },
      });
    });
  });

  describe("5. Repository Factory Closure Integrity", () => {
    it("createSkillRepos preserves closure binding when functions are destructured", async () => {
      const findMany = vi.fn().mockResolvedValue([]);
      const prisma = { skill: { findMany } } as unknown as PrismaClient;

      const repos = createSkillRepos(prisma);
      const { listSkills: unboundList } = repos;

      // Call without 'this' context
      const result = await unboundList(ws1);
      expect(result).toEqual([]);
      expect(findMany).toHaveBeenCalledWith({
        where: { workspaceId: ws1 },
        orderBy: { updatedAt: "desc" },
      });
    });
  });
});
