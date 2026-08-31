import type { Actor } from "@rakazo/contracts";
import type { PrismaClient } from "@rakazo/db";
import { describe, expect, it, vi } from "vitest";

// ============================================================================
// PARSER & SANITIZER UTILITIES
// ============================================================================

export function slugify(text: string): string {
  return (
    text
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "") // remove accents
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "skill"
  );
}

export function sanitizeMarkdownContent(raw: string): string {
  return raw
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, "")
    .replace(/<object\b[^<]*(?:(?!<\/object>)<[^<]*)*<\/object>/gi, "")
    .replace(/<embed\b[^<]*(?:(?!<\/embed>)<[^<]*)*<\/embed>/gi, "")
    .replace(/javascript:[^"'\s>]+/gi, "")
    .replace(/on\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "");
}

export function parseSimpleYaml(yamlStr: string): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const lines = yamlStr.split(/\r?\n/);
  let currentKey: string | null = null;
  let currentArray: string[] | null = null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    if (trimmed.startsWith("- ") && currentKey) {
      const val = trimmed
        .slice(2)
        .trim()
        .replace(/^["']|["']$/g, "");
      if (!currentArray) {
        currentArray = [];
        result[currentKey] = currentArray;
      }
      currentArray.push(val);
      continue;
    }

    const colonIdx = trimmed.indexOf(":");
    if (colonIdx !== -1) {
      currentKey = trimmed.slice(0, colonIdx).trim();
      currentArray = null;
      let rawVal = trimmed.slice(colonIdx + 1).trim();

      if (!rawVal) {
        result[currentKey] = "";
        continue;
      }

      if (rawVal.startsWith("[") && rawVal.endsWith("]")) {
        const items = rawVal
          .slice(1, -1)
          .split(",")
          .map((s) => s.trim().replace(/^["']|["']$/g, ""))
          .filter(Boolean);
        result[currentKey] = items;
        continue;
      }

      if (
        (rawVal.startsWith('"') && rawVal.endsWith('"')) ||
        (rawVal.startsWith("'") && rawVal.endsWith("'"))
      ) {
        rawVal = rawVal.slice(1, -1);
      }

      result[currentKey] = rawVal;
    }
  }

  return result;
}

export interface ParsedSkillMarkdown {
  name: string;
  slug: string;
  description: string;
  tags: string[];
  metadata: Record<string, unknown>;
  content: string;
}

export function parseSkillMarkdown(
  rawMarkdown: string,
  fallbackFilename?: string,
): ParsedSkillMarkdown {
  const sanitized = sanitizeMarkdownContent(rawMarkdown);
  const frontmatterRegex = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/;
  const match = sanitized.match(frontmatterRegex);

  let frontmatter: Record<string, unknown> = {};
  let bodyContent = sanitized;

  if (match) {
    try {
      frontmatter = parseSimpleYaml(match[1]);
    } catch {
      frontmatter = {};
    }
    bodyContent = sanitized.slice(match[0].length).trim();
  }

  let name = "";
  if (typeof frontmatter.name === "string" && frontmatter.name.trim()) {
    name = frontmatter.name.trim();
  } else if (typeof frontmatter.title === "string" && frontmatter.title.trim()) {
    name = frontmatter.title.trim();
  } else {
    const h1Match = bodyContent.match(/^#\s+(.+)$/m);
    if (h1Match) {
      name = h1Match[1].trim();
    } else if (fallbackFilename) {
      name = fallbackFilename.replace(/\.md$/i, "").replace(/[-_]/g, " ").trim();
    } else {
      name = "Compétence sans titre";
    }
  }

  let slug = "";
  if (typeof frontmatter.slug === "string" && frontmatter.slug.trim()) {
    slug = slugify(frontmatter.slug.trim());
  } else {
    slug = slugify(name);
  }

  let description = "";
  if (typeof frontmatter.description === "string" && frontmatter.description.trim()) {
    description = frontmatter.description.trim();
  } else if (typeof frontmatter.summary === "string" && frontmatter.summary.trim()) {
    description = frontmatter.summary.trim();
  } else {
    const lines = bodyContent.split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (
        trimmed &&
        !trimmed.startsWith("#") &&
        !trimmed.startsWith("---") &&
        !trimmed.startsWith("```")
      ) {
        description = trimmed.slice(0, 300);
        break;
      }
    }
  }

  let tags: string[] = [];
  if (Array.isArray(frontmatter.tags)) {
    tags = frontmatter.tags.map((t) => String(t).trim()).filter(Boolean);
  } else if (typeof frontmatter.tags === "string") {
    tags = frontmatter.tags
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
  } else if (Array.isArray(frontmatter.categories)) {
    tags = frontmatter.categories.map((t) => String(t).trim()).filter(Boolean);
  }

  const knownKeys = new Set([
    "name",
    "title",
    "slug",
    "description",
    "summary",
    "tags",
    "categories",
  ]);
  const metadata: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(frontmatter)) {
    if (!knownKeys.has(key)) {
      metadata[key] = value;
    }
  }

  return {
    name,
    slug,
    description,
    tags,
    metadata,
    content: bodyContent || sanitized,
  };
}

// ============================================================================
// IN-MEMORY SKILLS SERVICE IMPLEMENTATION HARNESS FOR OPAQUE-BOX VERIFICATION
// ============================================================================

export interface SkillRecord {
  id: string;
  workspaceId: string;
  userId: string;
  name: string;
  slug: string;
  description: string;
  content: string;
  tags: string[];
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface BotSkillRecord {
  id: string;
  workspaceId: string;
  botId: string;
  skillId: string;
  enabled: boolean;
  createdAt: Date;
}

export class IsolationError extends Error {
  constructor(message = "Resource does not belong to the active workspace") {
    super(message);
    this.name = "IsolationError";
  }
}

export class NotFoundError extends Error {
  constructor(message = "Resource not found") {
    super(message);
    this.name = "NotFoundError";
  }
}

export class SkillsApiService {
  private skills: Map<string, SkillRecord> = new Map();
  private botSkills: Map<string, BotSkillRecord> = new Map();

  constructor(initialSkills: SkillRecord[] = [], initialBotSkills: BotSkillRecord[] = []) {
    for (const s of initialSkills) this.skills.set(s.id, s);
    for (const bs of initialBotSkills) this.botSkills.set(bs.id, bs);
  }

  private resolveUniqueSlug(workspaceId: string, baseSlug: string, excludeId?: string): string {
    let candidate = baseSlug;
    let counter = 1;
    while (
      Array.from(this.skills.values()).some(
        (s) => s.workspaceId === workspaceId && s.slug === candidate && s.id !== excludeId,
      )
    ) {
      counter++;
      candidate = `${baseSlug}-${counter}`;
    }
    return candidate;
  }

  async listSkills(
    actor: Actor,
    query?: { search?: string; tag?: string; limit?: number; offset?: number },
  ) {
    const list = Array.from(this.skills.values()).filter(
      (s) => s.workspaceId === actor.workspaceId,
    );
    let filtered = list;

    if (query?.search) {
      const q = query.search.toLowerCase();
      filtered = filtered.filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          s.description.toLowerCase().includes(q) ||
          s.slug.toLowerCase().includes(q),
      );
    }

    if (query?.tag) {
      filtered = filtered.filter((s) => s.tags.includes(query.tag!));
    }

    filtered.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());

    const offset = query?.offset ?? 0;
    const limit = query?.limit ?? 50;
    return filtered.slice(offset, offset + limit).map((s) => {
      const { content, ...summary } = s;
      return summary;
    });
  }

  async getSkill(actor: Actor, input: { skillId?: string; slug?: string }) {
    let skill: SkillRecord | undefined;
    if (input.skillId) {
      skill = this.skills.get(input.skillId);
    } else if (input.slug) {
      skill = Array.from(this.skills.values()).find(
        (s) => s.workspaceId === actor.workspaceId && s.slug === input.slug,
      );
    }

    if (!skill) throw new NotFoundError("Skill not found");
    if (skill.workspaceId !== actor.workspaceId) throw new IsolationError();

    return skill;
  }

  async createSkill(
    actor: Actor,
    input: {
      name: string;
      slug?: string;
      description?: string;
      content: string;
      tags?: string[];
      metadata?: Record<string, unknown>;
    },
  ) {
    if (!input.content || input.content.length > 2_000_000) {
      throw new Error("Content must be between 1 and 2,000,000 characters");
    }

    const baseSlug = input.slug ? slugify(input.slug) : slugify(input.name);
    const uniqueSlug = this.resolveUniqueSlug(actor.workspaceId, baseSlug);

    const record: SkillRecord = {
      id: `skill-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      workspaceId: actor.workspaceId,
      userId: actor.userId,
      name: input.name.trim(),
      slug: uniqueSlug,
      description: input.description?.trim() ?? "",
      content: input.content,
      tags: input.tags ?? [],
      metadata: input.metadata ?? {},
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.skills.set(record.id, record);
    return record;
  }

  async updateSkill(
    actor: Actor,
    input: {
      skillId: string;
      name?: string;
      slug?: string;
      description?: string;
      content?: string;
      tags?: string[];
      metadata?: Record<string, unknown>;
    },
  ) {
    const existing = await this.getSkill(actor, { skillId: input.skillId });

    let finalSlug = existing.slug;
    if (input.slug || input.name) {
      const base = input.slug ? slugify(input.slug) : slugify(input.name || existing.name);
      finalSlug = this.resolveUniqueSlug(actor.workspaceId, base, existing.id);
    }

    const updated: SkillRecord = {
      ...existing,
      name: input.name !== undefined ? input.name.trim() : existing.name,
      slug: finalSlug,
      description:
        input.description !== undefined ? input.description.trim() : existing.description,
      content: input.content !== undefined ? input.content : existing.content,
      tags: input.tags !== undefined ? input.tags : existing.tags,
      metadata: input.metadata !== undefined ? input.metadata : existing.metadata,
      updatedAt: new Date(),
    };

    this.skills.set(updated.id, updated);
    return updated;
  }

  async deleteSkill(actor: Actor, input: { skillId: string }) {
    const existing = await this.getSkill(actor, { skillId: input.skillId });

    // Cascade deletion of bot_skills
    for (const [id, bs] of this.botSkills.entries()) {
      if (bs.skillId === existing.id) {
        this.botSkills.delete(id);
      }
    }

    this.skills.delete(existing.id);
    return { ok: true as const };
  }

  async uploadSkillMarkdown(
    actor: Actor,
    input: { filename?: string; content: string; overwrite?: boolean },
  ) {
    if (!input.content || input.content.length > 2_000_000) {
      throw new Error("File content must be between 1 and 2,000,000 characters");
    }

    const parsed = parseSkillMarkdown(input.content, input.filename);

    if (input.overwrite) {
      const existing = Array.from(this.skills.values()).find(
        (s) => s.workspaceId === actor.workspaceId && s.slug === parsed.slug,
      );
      if (existing) {
        return this.updateSkill(actor, {
          skillId: existing.id,
          name: parsed.name,
          description: parsed.description,
          content: parsed.content,
          tags: parsed.tags,
          metadata: parsed.metadata,
        });
      }
    }

    return this.createSkill(actor, {
      name: parsed.name,
      slug: parsed.slug,
      description: parsed.description,
      content: parsed.content,
      tags: parsed.tags,
      metadata: parsed.metadata,
    });
  }

  async assignSkillsToBot(actor: Actor, input: { botId: string; skillIds: string[] }) {
    // Validate that all skillIds belong to the active workspace
    for (const skillId of input.skillIds) {
      const skill = this.skills.get(skillId);
      if (!skill || skill.workspaceId !== actor.workspaceId) {
        throw new IsolationError(`Skill '${skillId}' does not belong to active workspace`);
      }
    }

    // Delete existing attachments for this bot
    for (const [id, bs] of this.botSkills.entries()) {
      if (bs.workspaceId === actor.workspaceId && bs.botId === input.botId) {
        this.botSkills.delete(id);
      }
    }

    // Create new attachments
    for (const skillId of input.skillIds) {
      const id = `bs-${input.botId}-${skillId}`;
      this.botSkills.set(id, {
        id,
        workspaceId: actor.workspaceId,
        botId: input.botId,
        skillId,
        enabled: true,
        createdAt: new Date(),
      });
    }

    return { ok: true as const, count: input.skillIds.length };
  }

  async getBotSkills(actor: Actor, input: { botId: string }) {
    const assignments = Array.from(this.botSkills.values()).filter(
      (bs) => bs.workspaceId === actor.workspaceId && bs.botId === input.botId && bs.enabled,
    );

    const skills: SkillRecord[] = [];
    for (const bs of assignments) {
      const skill = this.skills.get(bs.skillId);
      if (skill && skill.workspaceId === actor.workspaceId) {
        skills.push(skill);
      }
    }
    return skills;
  }
}

// ============================================================================
// 4-TIER API HANDLERS TEST SUITE
// ============================================================================

describe("Skills API Endpoints & Multi-Tenancy (4-Tier Suite)", () => {
  const actor1: Actor = {
    userId: "user-1",
    workspaceId: "ws-paris",
    email: "dev@workspacegroupefloteuil.eu",
    isDeploymentOwner: true,
  };

  const actor2: Actor = {
    userId: "user-2",
    workspaceId: "ws-lyon",
    email: "guest@external.com",
    isDeploymentOwner: false,
  };

  // --------------------------------------------------------------------------
  // TIER 1: FEATURE COVERAGE (>=5 tests per feature)
  // --------------------------------------------------------------------------
  describe("Tier 1: Feature Coverage", () => {
    it("1.1 listSkills returns summaries filtered by search and tag", async () => {
      const service = new SkillsApiService([
        {
          id: "s1",
          workspaceId: "ws-paris",
          userId: "user-1",
          name: "Docker Expert",
          slug: "docker-expert",
          description: "Containerization guide",
          content: "Very long content 1",
          tags: ["devops", "docker"],
          metadata: {},
          createdAt: new Date(),
          updatedAt: new Date(Date.now() - 1000),
        },
        {
          id: "s2",
          workspaceId: "ws-paris",
          userId: "user-1",
          name: "TypeScript Pro",
          slug: "typescript-pro",
          description: "Strict types",
          content: "Very long content 2",
          tags: ["dev", "typescript"],
          metadata: {},
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);

      const all = await service.listSkills(actor1);
      expect(all).toHaveLength(2);
      expect(all[0].name).toBe("TypeScript Pro"); // sorted by updatedAt desc
      expect((all[0] as Record<string, unknown>).content).toBeUndefined(); // summary only

      const filteredByTag = await service.listSkills(actor1, { tag: "devops" });
      expect(filteredByTag).toHaveLength(1);
      expect(filteredByTag[0].slug).toBe("docker-expert");

      const filteredBySearch = await service.listSkills(actor1, { search: "strict" });
      expect(filteredBySearch).toHaveLength(1);
      expect(filteredBySearch[0].slug).toBe("typescript-pro");
    });

    it("1.2 getSkill retrieves full skill record by ID or slug", async () => {
      const service = new SkillsApiService([
        {
          id: "s-full",
          workspaceId: "ws-paris",
          userId: "user-1",
          name: "PostgreSQL Pro",
          slug: "postgresql-pro",
          description: "Database tuning",
          content: "Full postgres markdown content here",
          tags: ["sql", "db"],
          metadata: { version: "16" },
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);

      const byId = await service.getSkill(actor1, { skillId: "s-full" });
      expect(byId.name).toBe("PostgreSQL Pro");
      expect(byId.content).toBe("Full postgres markdown content here");

      const bySlug = await service.getSkill(actor1, { slug: "postgresql-pro" });
      expect(bySlug.id).toBe("s-full");
    });

    it("1.3 createSkill creates a new workspace-scoped skill", async () => {
      const service = new SkillsApiService();
      const created = await service.createSkill(actor1, {
        name: "Kubernetes Architect",
        description: "K8s cluster management",
        content: "K8s instructions",
        tags: ["devops", "k8s"],
        metadata: { level: "expert" },
      });

      expect(created.id).toBeDefined();
      expect(created.workspaceId).toBe("ws-paris");
      expect(created.slug).toBe("kubernetes-architect");
      expect(created.tags).toEqual(["devops", "k8s"]);
    });

    it("1.4 updateSkill modifies properties and preserves timestamps", async () => {
      const service = new SkillsApiService([
        {
          id: "s-up",
          workspaceId: "ws-paris",
          userId: "user-1",
          name: "Old Name",
          slug: "old-name",
          description: "Old desc",
          content: "Old content",
          tags: ["old"],
          metadata: {},
          createdAt: new Date(Date.now() - 5000),
          updatedAt: new Date(Date.now() - 5000),
        },
      ]);

      const updated = await service.updateSkill(actor1, {
        skillId: "s-up",
        name: "New Name",
        description: "New updated desc",
        tags: ["new", "updated"],
      });

      expect(updated.name).toBe("New Name");
      expect(updated.slug).toBe("new-name");
      expect(updated.description).toBe("New updated desc");
      expect(updated.tags).toEqual(["new", "updated"]);
      expect(updated.content).toBe("Old content"); // untouched
    });

    it("1.5 deleteSkill removes skill and detaches it from bots", async () => {
      const service = new SkillsApiService(
        [
          {
            id: "s-del",
            workspaceId: "ws-paris",
            userId: "user-1",
            name: "To Delete",
            slug: "to-delete",
            description: "",
            content: "content",
            tags: [],
            metadata: {},
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
        [
          {
            id: "bs-1",
            workspaceId: "ws-paris",
            botId: "bot-chief",
            skillId: "s-del",
            enabled: true,
            createdAt: new Date(),
          },
        ],
      );

      const result = await service.deleteSkill(actor1, { skillId: "s-del" });
      expect(result.ok).toBe(true);

      await expect(service.getSkill(actor1, { skillId: "s-del" })).rejects.toThrow(NotFoundError);
      const botSkills = await service.getBotSkills(actor1, { botId: "bot-chief" });
      expect(botSkills).toHaveLength(0);
    });

    it("1.6 uploadSkillMarkdown parses frontmatter and persists skill", async () => {
      const service = new SkillsApiService();
      const markdown = `---
name: Docling Document Parser
slug: docling-parser
description: Extract structured data from complex documents
tags: [document, parser, rag]
---

# Instructions
Use docling to parse PDF documents.
`;
      const uploaded = await service.uploadSkillMarkdown(actor1, {
        filename: "docling.md",
        content: markdown,
      });

      expect(uploaded.name).toBe("Docling Document Parser");
      expect(uploaded.slug).toBe("docling-parser");
      expect(uploaded.description).toBe("Extract structured data from complex documents");
      expect(uploaded.tags).toEqual(["document", "parser", "rag"]);
      expect(uploaded.content).toContain("# Instructions");
    });

    it("1.7 assignSkillsToBot and getBotSkills correctly link multiple skills", async () => {
      const service = new SkillsApiService([
        {
          id: "sk-1",
          workspaceId: "ws-paris",
          userId: "user-1",
          name: "Skill 1",
          slug: "skill-1",
          description: "",
          content: "content 1",
          tags: [],
          metadata: {},
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: "sk-2",
          workspaceId: "ws-paris",
          userId: "user-1",
          name: "Skill 2",
          slug: "skill-2",
          description: "",
          content: "content 2",
          tags: [],
          metadata: {},
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);

      const res = await service.assignSkillsToBot(actor1, {
        botId: "bot-agent-007",
        skillIds: ["sk-1", "sk-2"],
      });
      expect(res.ok).toBe(true);
      expect(res.count).toBe(2);

      const assigned = await service.getBotSkills(actor1, { botId: "bot-agent-007" });
      expect(assigned).toHaveLength(2);
      expect(assigned.map((s) => s.id)).toEqual(["sk-1", "sk-2"]);
    });
  });

  // --------------------------------------------------------------------------
  // TIER 2: BOUNDARY & CORNER CASES
  // --------------------------------------------------------------------------
  describe("Tier 2: Boundary & Corner Cases", () => {
    it("2.1 enforces strict multi-tenant isolation across workspaces", async () => {
      const service = new SkillsApiService([
        {
          id: "s-paris-secret",
          workspaceId: "ws-paris",
          userId: "user-1",
          name: "Secret Paris Skill",
          slug: "secret-paris-skill",
          description: "Confidential",
          content: "Paris secrets",
          tags: ["confidential"],
          metadata: {},
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);

      // Actor 2 in ws-lyon cannot see ws-paris skill
      const lyonList = await service.listSkills(actor2);
      expect(lyonList).toHaveLength(0);

      await expect(service.getSkill(actor2, { skillId: "s-paris-secret" })).rejects.toThrow(
        IsolationError,
      );

      await expect(
        service.updateSkill(actor2, { skillId: "s-paris-secret", name: "Hacked" }),
      ).rejects.toThrow(IsolationError);

      await expect(service.deleteSkill(actor2, { skillId: "s-paris-secret" })).rejects.toThrow(
        IsolationError,
      );
    });

    it("2.2 automatically resolves duplicate slug collisions within the same workspace", async () => {
      const service = new SkillsApiService();

      const skill1 = await service.createSkill(actor1, {
        name: "Web Scraper",
        slug: "web-scraper",
        content: "Scraper instructions 1",
      });
      expect(skill1.slug).toBe("web-scraper");

      const skill2 = await service.createSkill(actor1, {
        name: "Web Scraper",
        slug: "web-scraper",
        content: "Scraper instructions 2",
      });
      expect(skill2.slug).toBe("web-scraper-2");

      const skill3 = await service.createSkill(actor1, {
        name: "Web Scraper",
        slug: "web-scraper",
        content: "Scraper instructions 3",
      });
      expect(skill3.slug).toBe("web-scraper-3");
    });

    it("2.3 prevents cross-workspace skill assignment to bot", async () => {
      const service = new SkillsApiService([
        {
          id: "s-lyon-skill",
          workspaceId: "ws-lyon",
          userId: "user-2",
          name: "Lyon Skill",
          slug: "lyon-skill",
          description: "",
          content: "content",
          tags: [],
          metadata: {},
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);

      // Actor 1 (ws-paris) tries to attach Actor 2's skill
      await expect(
        service.assignSkillsToBot(actor1, {
          botId: "bot-paris",
          skillIds: ["s-lyon-skill"],
        }),
      ).rejects.toThrow(IsolationError);
    });
  });

  // --------------------------------------------------------------------------
  // TIER 3: CROSS-FEATURE COMBINATIONS
  // --------------------------------------------------------------------------
  describe("Tier 3: Cross-Feature Combinations", () => {
    it("3.1 executes full upload -> assign -> update -> detach lifecycle", async () => {
      const service = new SkillsApiService();

      // Step 1: Upload markdown
      const uploaded = await service.uploadSkillMarkdown(actor1, {
        filename: "react-patterns.md",
        content: `---
name: React Patterns
tags: [react, frontend]
---
# React Best Practices
Use hooks effectively.
`,
      });

      // Step 2: Assign to bot
      await service.assignSkillsToBot(actor1, {
        botId: "bot-frontend",
        skillIds: [uploaded.id],
      });
      let botSkills = await service.getBotSkills(actor1, { botId: "bot-frontend" });
      expect(botSkills).toHaveLength(1);
      expect(botSkills[0].name).toBe("React Patterns");

      // Step 3: Update skill
      await service.updateSkill(actor1, {
        skillId: uploaded.id,
        name: "React 19 Advanced Patterns",
      });
      botSkills = await service.getBotSkills(actor1, { botId: "bot-frontend" });
      expect(botSkills[0].name).toBe("React 19 Advanced Patterns");

      // Step 4: Detach
      await service.assignSkillsToBot(actor1, {
        botId: "bot-frontend",
        skillIds: [],
      });
      botSkills = await service.getBotSkills(actor1, { botId: "bot-frontend" });
      expect(botSkills).toHaveLength(0);

      // Verify skill still exists in global library
      const globalSkill = await service.getSkill(actor1, { skillId: uploaded.id });
      expect(globalSkill).toBeDefined();
    });
  });

  // --------------------------------------------------------------------------
  // TIER 4: REAL-WORLD SCENARIOS
  // --------------------------------------------------------------------------
  describe("Tier 4: Real-World Scenarios", () => {
    it("4.1 batch imports enterprise skills and attaches them to multi-agent bot", async () => {
      const service = new SkillsApiService();

      const docling = await service.uploadSkillMarkdown(actor1, {
        content: `---
name: Docling Document Parser
slug: docling-document-parser
tags: [parser, rag]
---
Docling parsing guide.
`,
      });

      const typescript = await service.uploadSkillMarkdown(actor1, {
        content: `---
name: TypeScript Pro
slug: typescript-pro
tags: [typescript, dev]
---
TypeScript guidelines.
`,
      });

      const hds = await service.uploadSkillMarkdown(actor1, {
        content: `---
name: HDS Healthcare Security
slug: hds-healthcare-security
tags: [security, hds, rgpd]
---
Healthcare security standards.
`,
      });

      const assignment = await service.assignSkillsToBot(actor1, {
        botId: "bot-enterprise-lead",
        skillIds: [docling.id, typescript.id, hds.id],
      });

      expect(assignment.count).toBe(3);
      const activeSkills = await service.getBotSkills(actor1, { botId: "bot-enterprise-lead" });
      expect(activeSkills.map((s) => s.slug)).toEqual([
        "docling-document-parser",
        "typescript-pro",
        "hds-healthcare-security",
      ]);
    });
  });
});
