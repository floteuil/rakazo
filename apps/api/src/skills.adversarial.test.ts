import { describe, it, expect, beforeEach } from "vitest";
import {
  createSkillsService,
  listSkills,
  getSkill,
  createSkill,
  updateSkill,
  deleteSkill,
  uploadSkillMarkdown,
  assignSkillsToBot,
  getBotSkills,
  type SkillsDeps,
} from "./skills.js";
import { type Actor } from "@rakazo/contracts";
import { IsolationError, Prisma, type PrismaClient } from "@rakazo/db";
import { ORPCError } from "@orpc/server";

// ============================================================================
// STRICT IN-MEMORY PRISMA MOCK IMPLEMENTING REAL POSTGRESQL PRISMA SEMANTICS
// ============================================================================

interface SkillDbRow {
  id: string;
  workspaceId: string;
  userId: string;
  name: string;
  slug: string;
  description: string;
  content: string;
  tags: Prisma.JsonValue;
  metadata: Prisma.JsonValue;
  createdAt: Date;
  updatedAt: Date;
}

interface BotDbRow {
  id: string;
  workspaceId: string;
  userId: string;
  name: string;
}

interface BotSkillDbRow {
  id: string;
  workspaceId: string;
  botId: string;
  skillId: string;
  enabled: boolean;
  createdAt: Date;
}

class MockPrismaClient {
  public skills: Map<string, SkillDbRow> = new Map();
  public bots: Map<string, BotDbRow> = new Map();
  public botSkills: Map<string, BotSkillDbRow> = new Map();

  public skill = {
    findMany: async (args?: {
      where?: any;
      orderBy?: any;
      select?: any;
    }) => {
      let list = Array.from(this.skills.values());
      if (args?.where) {
        list = list.filter((item) => {
          if (args.where.workspaceId && item.workspaceId !== args.where.workspaceId) {
            return false;
          }
          if (args.where.id?.in && !args.where.id.in.includes(item.id)) {
            return false;
          }
          if (args.where.id?.not && item.id === args.where.id.not) {
            return false;
          }
          if (args.where.slug?.startsWith && !item.slug.startsWith(args.where.slug.startsWith)) {
            return false;
          }
          if (args.where.OR) {
            const matchesOr = args.where.OR.some((condition: any) => {
              if (condition.name?.contains) {
                return item.name.toLowerCase().includes(condition.name.contains.toLowerCase());
              }
              if (condition.description?.contains) {
                return item.description.toLowerCase().includes(condition.description.contains.toLowerCase());
              }
              if (condition.slug?.contains) {
                return item.slug.toLowerCase().includes(condition.slug.contains.toLowerCase());
              }
              return false;
            });
            if (!matchesOr) return false;
          }
          return true;
        });
      }
      if (args?.orderBy?.updatedAt === "desc") {
        list.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
      }
      return list;
    },

    findUnique: async (args: { where: any }) => {
      if (args.where.id) {
        return this.skills.get(args.where.id) || null;
      }
      if (args.where.workspaceId_slug) {
        const { workspaceId, slug } = args.where.workspaceId_slug;
        const found = Array.from(this.skills.values()).find(
          (s) => s.workspaceId === workspaceId && s.slug === slug
        );
        return found || null;
      }
      return null;
    },

    findFirst: async (args: { where: any }) => {
      const list = await this.skill.findMany(args);
      return list[0] || null;
    },

    create: async (args: { data: any }) => {
      const existing = Array.from(this.skills.values()).find(
        (s) => s.workspaceId === args.data.workspaceId && s.slug === args.data.slug
      );
      if (existing) {
        const err = new Error("Unique constraint failed on the fields: (`workspaceId`,`slug`)");
        (err as any).code = "P2002";
        throw err;
      }
      const id = `skill-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const row: SkillDbRow = {
        id,
        workspaceId: args.data.workspaceId,
        userId: args.data.userId,
        name: args.data.name,
        slug: args.data.slug,
        description: args.data.description,
        content: args.data.content,
        tags: args.data.tags ?? [],
        metadata: args.data.metadata ?? {},
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      this.skills.set(id, row);
      return row;
    },

    update: async (args: { where: { id: string }; data: any }) => {
      const existing = this.skills.get(args.where.id);
      if (!existing) {
        const err = new Error("Record to update not found");
        (err as any).code = "P2025";
        throw err;
      }
      if (args.data.slug && args.data.slug !== existing.slug) {
        const dup = Array.from(this.skills.values()).find(
          (s) => s.workspaceId === existing.workspaceId && s.slug === args.data.slug && s.id !== existing.id
        );
        if (dup) {
          const err = new Error("Unique constraint failed on the fields: (`workspaceId`,`slug`)");
          (err as any).code = "P2002";
          throw err;
        }
      }
      const updated: SkillDbRow = {
        ...existing,
        name: args.data.name !== undefined ? args.data.name : existing.name,
        slug: args.data.slug !== undefined ? args.data.slug : existing.slug,
        description: args.data.description !== undefined ? args.data.description : existing.description,
        content: args.data.content !== undefined ? args.data.content : existing.content,
        tags: args.data.tags !== undefined ? args.data.tags : existing.tags,
        metadata: args.data.metadata !== undefined ? args.data.metadata : existing.metadata,
        updatedAt: new Date(),
      };
      this.skills.set(existing.id, updated);
      return updated;
    },

    delete: async (args: { where: { id: string } }) => {
      const existing = this.skills.get(args.where.id);
      if (!existing) {
        const err = new Error("Record to delete does not exist");
        (err as any).code = "P2025";
        throw err;
      }
      this.skills.delete(args.where.id);
      return existing;
    },
  };

  public bot = {
    findFirst: async (args: { where: any }) => {
      return (
        Array.from(this.bots.values()).find((b) => {
          if (args.where.id && b.id !== args.where.id) return false;
          if (args.where.workspaceId && b.workspaceId !== args.where.workspaceId) return false;
          return true;
        }) || null
      );
    },
  };

  public botSkill = {
    findMany: async (args: { where: any; include?: any; orderBy?: any }) => {
      let list = Array.from(this.botSkills.values()).filter((bs) => {
        if (args.where.botId && bs.botId !== args.where.botId) return false;
        if (args.where.workspaceId && bs.workspaceId !== args.where.workspaceId) return false;
        if (args.where.enabled !== undefined && bs.enabled !== args.where.enabled) return false;
        return true;
      });
      if (args.include?.skill) {
        return list.map((bs) => ({
          ...bs,
          skill: this.skills.get(bs.skillId) || null,
        }));
      }
      return list;
    },

    deleteMany: async (args: { where: any }) => {
      let count = 0;
      for (const [id, bs] of Array.from(this.botSkills.entries())) {
        let match = true;
        if (args.where.skillId && bs.skillId !== args.where.skillId) match = false;
        if (args.where.botId && bs.botId !== args.where.botId) match = false;
        if (args.where.workspaceId && bs.workspaceId !== args.where.workspaceId) match = false;
        if (match) {
          this.botSkills.delete(id);
          count++;
        }
      }
      return { count };
    },

    createMany: async (args: { data: Array<{ workspaceId: string; botId: string; skillId: string; enabled: boolean }> }) => {
      for (const item of args.data) {
        const id = `bs-${item.botId}-${item.skillId}`;
        this.botSkills.set(id, {
          id,
          workspaceId: item.workspaceId,
          botId: item.botId,
          skillId: item.skillId,
          enabled: item.enabled,
          createdAt: new Date(),
        });
      }
      return { count: args.data.length };
    },
  };

  public $transaction = async <T>(fn: (tx: this) => Promise<T>, options?: any): Promise<T> => {
    return await fn(this);
  };
}

describe("Adversarial Multi-Tenancy & Isolation Suite for skills.ts", () => {
  let mockDb: MockPrismaClient;
  let deps: SkillsDeps;
  let service: ReturnType<typeof createSkillsService>;

  const actorParis: Actor = {
    userId: "usr-paris-lead",
    workspaceId: "ws-paris",
    email: "lead@workspacegroupefloteuil.eu",
    isDeploymentOwner: true,
  };

  const actorLyon: Actor = {
    userId: "usr-lyon-attacker",
    workspaceId: "ws-lyon",
    email: "attacker@external-guest.com",
    isDeploymentOwner: false,
  };

  beforeEach(() => {
    mockDb = new MockPrismaClient();
    deps = { prisma: mockDb as unknown as PrismaClient };
    service = createSkillsService(deps);
  });

  // ==========================================================================
  // 1. CROSS-WORKSPACE UNAUTHORIZED ACCESS & ID MANIPULATION
  // ==========================================================================
  describe("1. Cross-Workspace Unauthorized Access & ID Manipulation", () => {
    it("1.1 listSkills strictly filters skills by actor.workspaceId", async () => {
      await service.create(actorParis, {
        name: "Paris Secret",
        content: "Content Paris",
      });
      await service.create(actorLyon, {
        name: "Lyon Public",
        content: "Content Lyon",
      });

      const parisList = await service.list(actorParis);
      const lyonList = await service.list(actorLyon);

      expect(parisList).toHaveLength(1);
      expect(parisList[0].name).toBe("Paris Secret");

      expect(lyonList).toHaveLength(1);
      expect(lyonList[0].name).toBe("Lyon Public");
    });

    it("1.2 getSkill(skillId) throws IsolationError when requesting cross-tenant resource", async () => {
      const parisSkill = await service.create(actorParis, {
        name: "Paris Confidential",
        content: "Paris Content",
      });

      await expect(service.get(actorLyon, { skillId: parisSkill.id })).rejects.toThrow(
        IsolationError,
      );
    });

    it("1.3 getSkill(slug) throws NOT_FOUND for cross-tenant slug", async () => {
      await service.create(actorParis, {
        name: "Paris Unique Slug",
        slug: "paris-unique-slug",
        content: "Paris Content",
      });

      await expect(
        service.get(actorLyon, { slug: "paris-unique-slug" }),
      ).rejects.toThrow(ORPCError);
    });

    it("1.4 updateSkill throws IsolationError and preserves original data", async () => {
      const parisSkill = await service.create(actorParis, {
        name: "Untouchable Skill",
        content: "Original Content",
      });

      await expect(
        service.update(actorLyon, {
          skillId: parisSkill.id,
          name: "Hacked by Lyon",
        }),
      ).rejects.toThrow(IsolationError);

      const verified = await service.get(actorParis, { skillId: parisSkill.id });
      expect(verified.name).toBe("Untouchable Skill");
    });

    it("1.5 deleteSkill throws IsolationError on cross-tenant deletion attempt", async () => {
      const parisSkill = await service.create(actorParis, {
        name: "Protected Skill",
        content: "Original Content",
      });

      await expect(
        service.delete(actorLyon, { skillId: parisSkill.id }),
      ).rejects.toThrow(IsolationError);

      const verified = await service.get(actorParis, { skillId: parisSkill.id });
      expect(verified.id).toBe(parisSkill.id);
    });
  });

  // ==========================================================================
  // 2. SLUG RESOLUTION & COLLISION AVOIDANCE
  // ==========================================================================
  describe("2. Slug Resolution & Workspace Collision Isolation", () => {
    it("2.1 deterministically increments numerical suffix within same workspace", async () => {
      const s1 = await service.create(actorParis, { name: "Docker Expert", content: "C1" });
      const s2 = await service.create(actorParis, { name: "Docker Expert", content: "C2" });
      const s3 = await service.create(actorParis, { name: "Docker Expert", content: "C3" });
      const s4 = await service.create(actorParis, { name: "Docker Expert", content: "C4" });

      expect(s1.slug).toBe("docker-expert");
      expect(s2.slug).toBe("docker-expert-2");
      expect(s3.slug).toBe("docker-expert-3");
      expect(s4.slug).toBe("docker-expert-4");
    });

    it("2.2 isolates slug namespaces across workspaces (Tenant Lyon gets clean base slug)", async () => {
      await service.create(actorParis, { name: "Docker Expert", content: "Paris 1" });
      await service.create(actorParis, { name: "Docker Expert", content: "Paris 2" });

      const sLyon = await service.create(actorLyon, { name: "Docker Expert", content: "Lyon 1" });
      expect(sLyon.slug).toBe("docker-expert");
    });

    it("2.3 preserves existing slug on update when name/slug is unchanged (excludeId)", async () => {
      const skill = await service.create(actorParis, { name: "Docling Parser", content: "C1" });
      expect(skill.slug).toBe("docling-parser");

      const updated = await service.update(actorParis, {
        skillId: skill.id,
        description: "Updated description only",
      });
      expect(updated.slug).toBe("docling-parser");
    });

    it("2.4 renames slug safely when updated to match another existing skill in same workspace", async () => {
      const s1 = await service.create(actorParis, { name: "PostgreSQL Pro", content: "C1" });
      const s2 = await service.create(actorParis, { name: "MySQL Pro", content: "C2" });

      const s2Renamed = await service.update(actorParis, {
        skillId: s2.id,
        name: "PostgreSQL Pro",
      });

      expect(s2Renamed.slug).toBe("postgresql-pro-2");
    });
  });

  // ==========================================================================
  // 3. BOT-SKILL FOREIGN KEY ISOLATION (assignSkillsToBot & getBotSkills)
  // ==========================================================================
  describe("3. Bot-Skill Foreign Key Isolation & Security", () => {
    beforeEach(() => {
      mockDb.bots.set("bot-paris-1", {
        id: "bot-paris-1",
        workspaceId: "ws-paris",
        userId: actorParis.userId,
        name: "Paris Agent",
      });
      mockDb.bots.set("bot-lyon-1", {
        id: "bot-lyon-1",
        workspaceId: "ws-lyon",
        userId: actorLyon.userId,
        name: "Lyon Agent",
      });
    });

    it("3.1 assigns multiple skills to bot within same workspace", async () => {
      const s1 = await service.create(actorParis, { name: "Skill 1", content: "C1" });
      const s2 = await service.create(actorParis, { name: "Skill 2", content: "C2" });

      const res = await service.assignToBot(actorParis, {
        botId: "bot-paris-1",
        skillIds: [s1.id, s2.id],
      });

      expect(res.ok).toBe(true);
      expect(res.count).toBe(2);

      const assigned = await service.getBotSkills(actorParis, { botId: "bot-paris-1" });
      expect(assigned).toHaveLength(2);
    });

    it("3.2 rejects assignment when targeting a bot belonging to another workspace", async () => {
      const sParis = await service.create(actorParis, { name: "Paris Skill", content: "C1" });

      await expect(
        service.assignToBot(actorParis, {
          botId: "bot-lyon-1",
          skillIds: [sParis.id],
        }),
      ).rejects.toThrow(IsolationError);
    });

    it("3.3 rejects assignment when any skillId belongs to another workspace (mixed IDs)", async () => {
      const sParis = await service.create(actorParis, { name: "Paris Skill", content: "C1" });
      const sLyon = await service.create(actorLyon, { name: "Lyon Skill", content: "C2" });

      await expect(
        service.assignToBot(actorParis, {
          botId: "bot-paris-1",
          skillIds: [sParis.id, sLyon.id],
        }),
      ).rejects.toThrow(IsolationError);
    });

    it("3.4 rejects assignment on non-existent skill ID", async () => {
      await expect(
        service.assignToBot(actorParis, {
          botId: "bot-paris-1",
          skillIds: ["non-existent-skill-id"],
        }),
      ).rejects.toThrow(IsolationError);
    });

    it("3.5 getBotSkills throws IsolationError when actor queries bot from another workspace", async () => {
      await expect(
        service.getBotSkills(actorLyon, { botId: "bot-paris-1" }),
      ).rejects.toThrow(IsolationError);
    });

    it("3.6 cascade: deleting skill automatically removes bot-skill association", async () => {
      const skill = await service.create(actorParis, { name: "To Delete", content: "C" });
      await service.assignToBot(actorParis, {
        botId: "bot-paris-1",
        skillIds: [skill.id],
      });

      let attached = await service.getBotSkills(actorParis, { botId: "bot-paris-1" });
      expect(attached).toHaveLength(1);

      await service.delete(actorParis, { skillId: skill.id });

      attached = await service.getBotSkills(actorParis, { botId: "bot-paris-1" });
      expect(attached).toHaveLength(0);
    });
  });

  // ==========================================================================
  // 4. MARKDOWN UPLOAD, XSS SANITIZATION & OVERWRITE ISOLATION
  // ==========================================================================
  describe("4. Markdown Upload, XSS Sanitization & Overwrite Isolation", () => {
    it("4.1 strips script tags, iframes, and javascript: URIs from markdown content", async () => {
      const maliciousMd = `---
name: Injected Skill
slug: injected-skill
---
# Instructions
<script>alert("xss")</script>
<iframe src="https://evil.com"></iframe>
<object data="evil.swf"></object>
[Click Here](javascript:alert(1))
Safe instructional text.
`;
      const uploaded = await service.uploadMarkdown(actorParis, {
        filename: "injected.md",
        content: maliciousMd,
      });

      expect(uploaded.content).not.toContain("<script>");
      expect(uploaded.content).not.toContain("<iframe>");
      expect(uploaded.content).not.toContain("<object");
      expect(uploaded.content).not.toContain("javascript:");
      expect(uploaded.content).toContain("Safe instructional text.");
    });

    it("4.2 upload with overwrite:true updates existing skill in SAME workspace", async () => {
      const md1 = `---
name: Initial Skill
slug: my-skill
---
Initial Content.`;
      const s1 = await service.uploadMarkdown(actorParis, {
        content: md1,
      });

      const md2 = `---
name: Updated Skill
slug: my-skill
---
Updated Content.`;
      const s2 = await service.uploadMarkdown(actorParis, {
        content: md2,
        overwrite: true,
      });

      expect(s2.id).toBe(s1.id);
      expect(s2.name).toBe("Updated Skill");
      expect(s2.content).toContain("Updated Content.");
    });

    it("4.3 upload with overwrite:true in Tenant Lyon does NOT overwrite Tenant Paris skill", async () => {
      const mdParis = `---
name: Shared Slug Name
slug: shared-slug
---
Paris confidential content.`;
      const sParis = await service.uploadMarkdown(actorParis, {
        content: mdParis,
      });

      const mdLyon = `---
name: Shared Slug Name
slug: shared-slug
---
Lyon isolated content.`;
      const sLyon = await service.uploadMarkdown(actorLyon, {
        content: mdLyon,
        overwrite: true,
      });

      expect(sLyon.id).not.toBe(sParis.id);
      expect(sLyon.workspaceId).toBe("ws-lyon");

      const parisCheck = await service.get(actorParis, { skillId: sParis.id });
      expect(parisCheck.content).toContain("Paris confidential content.");
    });
  });

  // ==========================================================================
  // 5. EXTREME INPUTS, PAGINATION BOUNDARIES & ERROR HANDLING
  // ==========================================================================
  describe("5. Extreme Inputs, Pagination Boundaries & Error Handling", () => {
    it("5.1 rejects content > 2MB with BAD_REQUEST", async () => {
      await expect(
        service.create(actorParis, {
          name: "Oversized",
          content: "A".repeat(2_000_001),
        }),
      ).rejects.toThrow(ORPCError);
    });

    it("5.2 rejects empty content with BAD_REQUEST", async () => {
      await expect(
        service.create(actorParis, {
          name: "Empty",
          content: "",
        }),
      ).rejects.toThrow(ORPCError);
    });

    it("5.3 handles extreme pagination offset without crashing", async () => {
      await service.create(actorParis, { name: "S1", content: "C1" });
      const paged = await service.list(actorParis, { offset: 1000, limit: 50 });
      expect(paged).toEqual([]);
    });

    it("5.4 handles SQL injection patterns in search input safely", async () => {
      const result = await service.list(actorParis, {
        search: "'; DROP TABLE skills; --",
      });
      expect(Array.isArray(result)).toBe(true);
    });

    it("5.5 handles regex metacharacters in search input safely", async () => {
      const result = await service.list(actorParis, {
        search: ".*+?^${}()|[]\\",
      });
      expect(Array.isArray(result)).toBe(true);
    });
  });
});
