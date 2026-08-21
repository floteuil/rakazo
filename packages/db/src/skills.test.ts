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

describe("Skills Repository", () => {
  const workspaceId = "ws-test-123";
  const userId = "user-test-456";
  const botId = "bot-test-789";
  const skillId = "skill-test-abc";

  describe("listSkills", () => {
    it("finds all skills for the specified workspace ordered by updatedAt desc", async () => {
      const findMany = vi.fn().mockResolvedValue([
        { id: "s1", name: "Skill 1", workspaceId },
        { id: "s2", name: "Skill 2", workspaceId },
      ]);
      const prisma = { skill: { findMany } } as unknown as PrismaClient;

      const results = await listSkills(prisma, workspaceId);

      expect(findMany).toHaveBeenCalledWith({
        where: { workspaceId },
        orderBy: { updatedAt: "desc" },
      });
      expect(results).toHaveLength(2);
    });
  });

  describe("getSkillById", () => {
    it("finds a skill by id within the workspace boundary", async () => {
      const mockSkill = { id: skillId, name: "Docling Parser", workspaceId };
      const findFirst = vi.fn().mockResolvedValue(mockSkill);
      const prisma = { skill: { findFirst } } as unknown as PrismaClient;

      const result = await getSkillById(prisma, workspaceId, skillId);

      expect(findFirst).toHaveBeenCalledWith({
        where: { id: skillId, workspaceId },
      });
      expect(result).toEqual(mockSkill);
    });
  });

  describe("getSkillBySlug", () => {
    it("finds a skill by unique workspaceId and slug combination", async () => {
      const slug = "docling-parser";
      const mockSkill = { id: skillId, name: "Docling Parser", slug, workspaceId };
      const findUnique = vi.fn().mockResolvedValue(mockSkill);
      const prisma = { skill: { findUnique } } as unknown as PrismaClient;

      const result = await getSkillBySlug(prisma, workspaceId, slug);

      expect(findUnique).toHaveBeenCalledWith({
        where: { workspaceId_slug: { workspaceId, slug } },
      });
      expect(result).toEqual(mockSkill);
    });
  });

  describe("createSkill", () => {
    it("creates a skill with provided and default values", async () => {
      const create = vi.fn().mockImplementation(({ data }) => Promise.resolve({ id: "s-new", ...data }));
      const prisma = { skill: { create } } as unknown as PrismaClient;

      const input = {
        workspaceId,
        userId,
        name: "PostgreSQL Optimizer",
        slug: "postgres-optimizer",
        content: "# Instructions\nOptimize queries",
        tags: ["database", "sql"],
        metadata: { version: "1.0" },
      };

      const result = await createSkill(prisma, input);

      expect(create).toHaveBeenCalledWith({
        data: {
          workspaceId,
          userId,
          name: "PostgreSQL Optimizer",
          slug: "postgres-optimizer",
          description: "",
          content: "# Instructions\nOptimize queries",
          tags: ["database", "sql"],
          metadata: { version: "1.0" },
        },
      });
      expect(result.id).toBe("s-new");
    });
  });

  describe("updateSkill", () => {
    it("updates only specified fields for a skill", async () => {
      const update = vi.fn().mockResolvedValue({ id: skillId, name: "Updated Name" });
      const prisma = { skill: { update } } as unknown as PrismaClient;

      const result = await updateSkill(prisma, workspaceId, skillId, {
        name: "Updated Name",
        description: "New description",
      });

      expect(update).toHaveBeenCalledWith({
        where: { id: skillId },
        data: {
          name: "Updated Name",
          description: "New description",
        },
      });
      expect(result.name).toBe("Updated Name");
    });
  });

  describe("deleteSkill", () => {
    it("deletes a skill by id", async () => {
      const del = vi.fn().mockResolvedValue({ id: skillId });
      const prisma = { skill: { delete: del } } as unknown as PrismaClient;

      const result = await deleteSkill(prisma, workspaceId, skillId);

      expect(del).toHaveBeenCalledWith({
        where: { id: skillId },
      });
      expect(result.id).toBe(skillId);
    });
  });

  describe("listBotSkills", () => {
    it("lists skills attached to a bot with included skill data", async () => {
      const mockBotSkills = [
        {
          id: "bs1",
          workspaceId,
          botId,
          skillId: "s1",
          enabled: true,
          skill: { id: "s1", name: "Skill 1" },
        },
      ];
      const findMany = vi.fn().mockResolvedValue(mockBotSkills);
      const prisma = { botSkill: { findMany } } as unknown as PrismaClient;

      const results = await listBotSkills(prisma, workspaceId, botId);

      expect(findMany).toHaveBeenCalledWith({
        where: { workspaceId, botId },
        include: { skill: true },
        orderBy: { createdAt: "asc" },
      });
      expect(results).toHaveLength(1);
      expect(results[0]?.skill.name).toBe("Skill 1");
    });
  });

  describe("assignSkillsToBot", () => {
    it("atomically replaces bot skills within a transaction", async () => {
      const deleteMany = vi.fn().mockResolvedValue({ count: 1 });
      const createMany = vi.fn().mockResolvedValue({ count: 2 });
      const findMany = vi.fn().mockResolvedValue([
        { id: "bs1", botId, skillId: "s1", enabled: true, skill: { id: "s1", name: "Skill 1" } },
        { id: "bs2", botId, skillId: "s2", enabled: true, skill: { id: "s2", name: "Skill 2" } },
      ]);

      const tx = {
        botSkill: {
          deleteMany,
          createMany,
          findMany,
        },
      };

      const $transaction = vi.fn().mockImplementation(async (callback: (txArg: typeof tx) => Promise<unknown>) => {
        return callback(tx);
      });

      const prisma = { $transaction } as unknown as PrismaClient;

      const result = await assignSkillsToBot(prisma, workspaceId, botId, ["s1", "s2"]);

      expect(deleteMany).toHaveBeenCalledWith({
        where: { workspaceId, botId },
      });
      expect(createMany).toHaveBeenCalledWith({
        data: [
          { workspaceId, botId, skillId: "s1", enabled: true },
          { workspaceId, botId, skillId: "s2", enabled: true },
        ],
        skipDuplicates: true,
      });
      expect(result).toHaveLength(2);
    });

    it("handles empty skillIds array cleanly by only clearing existing skills", async () => {
      const deleteMany = vi.fn().mockResolvedValue({ count: 1 });
      const createMany = vi.fn();
      const findMany = vi.fn().mockResolvedValue([]);

      const tx = {
        botSkill: {
          deleteMany,
          createMany,
          findMany,
        },
      };

      const $transaction = vi.fn().mockImplementation(async (callback: (txArg: typeof tx) => Promise<unknown>) => {
        return callback(tx);
      });

      const prisma = { $transaction } as unknown as PrismaClient;

      const result = await assignSkillsToBot(prisma, workspaceId, botId, []);

      expect(deleteMany).toHaveBeenCalledWith({
        where: { workspaceId, botId },
      });
      expect(createMany).not.toHaveBeenCalled();
      expect(result).toHaveLength(0);
    });
  });

  describe("toggleBotSkill", () => {
    it("updates the enabled flag for a bot-skill relation", async () => {
      const update = vi.fn().mockResolvedValue({
        botId,
        skillId,
        enabled: false,
      });
      const prisma = { botSkill: { update } } as unknown as PrismaClient;

      const result = await toggleBotSkill(prisma, workspaceId, botId, skillId, false);

      expect(update).toHaveBeenCalledWith({
        where: { botId_skillId: { botId, skillId } },
        data: { enabled: false },
      });
      expect(result.enabled).toBe(false);
    });
  });

  describe("createSkillRepos factory", () => {
    it("creates repository bundle with all methods bound to prisma client", async () => {
      const findMany = vi.fn().mockResolvedValue([]);
      const prisma = { skill: { findMany } } as unknown as PrismaClient;

      const repos = createSkillRepos(prisma);

      await repos.listSkills(workspaceId);
      expect(findMany).toHaveBeenCalledWith({
        where: { workspaceId },
        orderBy: { updatedAt: "desc" },
      });
    });
  });
});
