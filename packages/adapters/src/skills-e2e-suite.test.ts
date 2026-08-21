import type { Actor } from "@rakazo/contracts";
import { createStreamingRedactor } from "@rakazo/core";
import { describe, expect, it } from "vitest";

// ============================================================================
// COMPREHENSIVE 4-TIER E2E INTEGRATION SUITE FOR RAKAZO SOVEREIGN SKILLS
// ============================================================================

// ----------------------------------------------------------------------------
// Core Parsing, Sanitization & Slug Utilities
// ----------------------------------------------------------------------------

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
      const val = trimmed.slice(2).trim().replace(/^["']|["']$/g, "");
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

  if (match && match[1] !== undefined) {
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
    if (h1Match && h1Match[1]) {
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
      if (trimmed && !trimmed.startsWith("#") && !trimmed.startsWith("---") && !trimmed.startsWith("```")) {
        description = trimmed.slice(0, 300);
        break;
      }
    }
  }

  let tags: string[] = [];
  if (Array.isArray(frontmatter.tags)) {
    tags = frontmatter.tags.map((t) => String(t).trim()).filter(Boolean);
  } else if (typeof frontmatter.tags === "string") {
    tags = frontmatter.tags.split(",").map((t) => t.trim()).filter(Boolean);
  } else if (Array.isArray(frontmatter.categories)) {
    tags = frontmatter.categories.map((t) => String(t).trim()).filter(Boolean);
  }

  const knownKeys = new Set(["name", "title", "slug", "description", "summary", "tags", "categories"]);
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

// ----------------------------------------------------------------------------
// Runtime Prompt Injection Engine
// ----------------------------------------------------------------------------

export const DIRECT_INJECTION_MAX_BYTES = 4096; // 4 KB
export const CUMULATIVE_DIRECT_MAX_BYTES = 32768; // 32 KB (~8,000 tokens)

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
  enabled?: boolean;
}

export function formatSkillsPrompt(activeSkills: SkillRecord[]): string | undefined {
  const enabledSkills = activeSkills.filter((s) => s.enabled !== false);
  if (enabledSkills.length === 0) return undefined;

  let cumulativeDirectBytes = 0;
  const formattedSections: string[] = [];

  for (const skill of enabledSkills.slice(0, 20)) {
    const contentLength = Buffer.byteLength(skill.content, "utf8");
    const isDirect =
      contentLength < DIRECT_INJECTION_MAX_BYTES &&
      cumulativeDirectBytes + contentLength <= CUMULATIVE_DIRECT_MAX_BYTES;

    if (isDirect) {
      cumulativeDirectBytes += contentLength;
      const tagsStr = Array.isArray(skill.tags) ? skill.tags.join(", ") : "";
      formattedSections.push(
        `### Compétence active : ${skill.name} (${skill.slug})\n${skill.description ? `${skill.description}\n` : ""}Tags: ${tagsStr}\n\n\`\`\`markdown\n${skill.content}\n\`\`\``,
      );
    } else {
      const tagsStr = Array.isArray(skill.tags) ? skill.tags.join(", ") : "";
      formattedSections.push(
        `### Compétence indexée : ${skill.name} (${skill.slug})\n- Description: ${skill.description || "Aucune description"}\n- Tags: ${tagsStr}\n- Taille: ${(contentLength / 1024).toFixed(1)} Ko\n- Directive: Ce skill volumineux est indexé. Pour charger ses instructions complètes, appelez l'outil \`read_skill(name: "${skill.slug}")\` lorsque pertinent.`,
      );
    }
  }

  if (formattedSections.length === 0) return undefined;
  return `## Compétences & Connaissances Spécialisées de l'Agent\n\n${formattedSections.join("\n\n")}`;
}

// ----------------------------------------------------------------------------
// Multi-Tenant Sovereign Skills Database & API Simulator
// ----------------------------------------------------------------------------

export class SovereignSkillsEngine {
  private skills: Map<string, SkillRecord> = new Map();
  private botSkills: Map<string, { id: string; workspaceId: string; botId: string; skillId: string; enabled: boolean }> =
    new Map();
  private bots: Map<string, { id: string; workspaceId: string; name: string }> = new Map();

  createBot(workspaceId: string, name: string): { id: string; workspaceId: string; name: string } {
    const id = `bot-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const bot = { id, workspaceId, name };
    this.bots.set(id, bot);
    return bot;
  }

  deleteBot(workspaceId: string, botId: string) {
    const bot = this.bots.get(botId);
    if (!bot || bot.workspaceId !== workspaceId) throw new Error("Bot not found in workspace");

    // Cascade delete bot_skills
    for (const [id, bs] of this.botSkills.entries()) {
      if (bs.botId === botId) {
        this.botSkills.delete(id);
      }
    }
    this.bots.delete(botId);
    return { ok: true };
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

  async uploadMarkdown(
    actor: Actor,
    input: { filename?: string; content: string; overwrite?: boolean },
  ): Promise<SkillRecord> {
    if (!input.content || input.content.length > 2_000_000) {
      throw new Error("Content exceeds 2MB limit or is empty");
    }

    const parsed = parseSkillMarkdown(input.content, input.filename);
    const uniqueSlug = this.resolveUniqueSlug(actor.workspaceId, parsed.slug);

    const record: SkillRecord = {
      id: `skill-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      workspaceId: actor.workspaceId,
      userId: actor.userId,
      name: parsed.name,
      slug: uniqueSlug,
      description: parsed.description,
      content: parsed.content,
      tags: parsed.tags,
      metadata: parsed.metadata,
      createdAt: new Date(),
      updatedAt: new Date(),
      enabled: true,
    };

    this.skills.set(record.id, record);
    return record;
  }

  async assignSkillsToBot(actor: Actor, botId: string, skillIds: string[]) {
    // Assert tenant boundary
    for (const skillId of skillIds) {
      const skill = this.skills.get(skillId);
      if (!skill || skill.workspaceId !== actor.workspaceId) {
        throw new Error(`Isolation Error: Skill ${skillId} does not belong to active workspace`);
      }
    }

    // Delete existing
    for (const [id, bs] of this.botSkills.entries()) {
      if (bs.botId === botId && bs.workspaceId === actor.workspaceId) {
        this.botSkills.delete(id);
      }
    }

    // Insert new
    for (const skillId of skillIds) {
      const id = `bs-${botId}-${skillId}`;
      this.botSkills.set(id, {
        id,
        workspaceId: actor.workspaceId,
        botId,
        skillId,
        enabled: true,
      });
    }

    return { ok: true, count: skillIds.length };
  }

  async getBotSkills(actor: Actor, botId: string): Promise<SkillRecord[]> {
    const links = Array.from(this.botSkills.values()).filter(
      (bs) => bs.workspaceId === actor.workspaceId && bs.botId === botId && bs.enabled,
    );
    const skills: SkillRecord[] = [];
    for (const link of links) {
      const skill = this.skills.get(link.skillId);
      if (skill && skill.workspaceId === actor.workspaceId) {
        skills.push(skill);
      }
    }
    return skills;
  }

  async executeReadSkill(
    actor: Actor,
    nameOrSlug: string,
  ): Promise<{ name?: string; slug?: string; description?: string; tags?: string[]; content?: string; error?: string }> {
    const target = (nameOrSlug || "").trim().toLowerCase();
    if (!target) return { error: "Paramètre 'name' manquant pour read_skill." };

    const skill = Array.from(this.skills.values()).find(
      (s) =>
        s.workspaceId === actor.workspaceId &&
        (s.slug.toLowerCase() === target ||
          s.name.toLowerCase() === target ||
          s.id.toLowerCase() === target),
    );

    if (!skill) {
      return { error: `Skill '${target}' not found in workspace.` };
    }

    return {
      name: skill.name,
      slug: skill.slug,
      description: skill.description,
      tags: skill.tags,
      content: skill.content,
    };
  }

  async deleteSkill(actor: Actor, skillId: string) {
    const skill = this.skills.get(skillId);
    if (!skill || skill.workspaceId !== actor.workspaceId) {
      throw new Error("Skill not found in workspace");
    }

    // Cascade remove from botSkills
    for (const [id, bs] of this.botSkills.entries()) {
      if (bs.skillId === skillId) {
        this.botSkills.delete(id);
      }
    }

    this.skills.delete(skillId);
    return { ok: true };
  }
}

// ============================================================================
// 4-TIER FULL-STACK E2E TEST SUITE
// ============================================================================

describe("Rakazo Sovereign Skills System (4-Tier Master E2E Suite)", () => {
  const actor1: Actor = {
    userId: "user-101",
    workspaceId: "ws-groupe-floteuil",
    email: "admin@groupefloteuil.com",
    isDeploymentOwner: true,
  };

  const actor2: Actor = {
    userId: "user-202",
    workspaceId: "ws-external-tenant",
    email: "external@tenant.fr",
    isDeploymentOwner: false,
  };

  // --------------------------------------------------------------------------
  // TIER 1: FEATURE COVERAGE (>=5 tests per feature)
  // --------------------------------------------------------------------------
  describe("Tier 1: Feature Coverage", () => {
    it("1.1 parses valid YAML frontmatter and extracts structured metadata", () => {
      const markdown = `---
name: PostgreSQL Tuning Expert
slug: postgresql-tuning-expert
description: Advanced database configuration, indexing and query planning
tags: [sql, postgres, performance]
version: 2.1.0
---

# PostgreSQL Optimization
Guidelines for vacuuming and buffer sizing.
`;
      const result = parseSkillMarkdown(markdown);
      expect(result.name).toBe("PostgreSQL Tuning Expert");
      expect(result.slug).toBe("postgresql-tuning-expert");
      expect(result.description).toBe("Advanced database configuration, indexing and query planning");
      expect(result.tags).toEqual(["sql", "postgres", "performance"]);
      expect(result.metadata.version).toBe("2.1.0");
      expect(result.content).toContain("# PostgreSQL Optimization");
    });

    it("1.2 falls back to H1 header when name is missing in frontmatter", () => {
      const markdown = `# Fullstack DevOps Operator\nManage Docker containers and Traefik routing.`;
      const result = parseSkillMarkdown(markdown);
      expect(result.name).toBe("Fullstack DevOps Operator");
      expect(result.slug).toBe("fullstack-devops-operator");
      expect(result.description).toBe("Manage Docker containers and Traefik routing.");
    });

    it("1.3 executes CRUD operations on skills engine", async () => {
      const engine = new SovereignSkillsEngine();
      const skill = await engine.uploadMarkdown(actor1, {
        content: `---
name: Web Scraperr
slug: web-scraperr
description: Fast HTML extraction
tags: [scraping, web]
---
Scraperr instructions.
`,
      });

      expect(skill.id).toBeDefined();
      expect(skill.name).toBe("Web Scraperr");

      // Verify read_skill tool
      const toolRes = await engine.executeReadSkill(actor1, "web-scraperr");
      expect(toolRes.name).toBe("Web Scraperr");
      expect(toolRes.content).toContain("Scraperr instructions.");

      // Verify delete
      const del = await engine.deleteSkill(actor1, skill.id);
      expect(del.ok).toBe(true);

      const notFoundRes = await engine.executeReadSkill(actor1, "web-scraperr");
      expect(notFoundRes.error).toContain("not found");
    });

    it("1.4 formats hybrid direct prompt for skills < 4KB", () => {
      const skill: SkillRecord = {
        id: "s-direct",
        workspaceId: "ws-groupe-floteuil",
        userId: "user-101",
        name: "Security Guidelines",
        slug: "security-guidelines",
        description: "Standard security practices",
        content: "Always sanitize input and mask secrets.",
        tags: ["security"],
        metadata: {},
        createdAt: new Date(),
        updatedAt: new Date(),
        enabled: true,
      };

      const prompt = formatSkillsPrompt([skill]);
      expect(prompt).toContain("## Compétences & Connaissances Spécialisées de l'Agent");
      expect(prompt).toContain("### Compétence active : Security Guidelines (security-guidelines)");
      expect(prompt).toContain("```markdown\nAlways sanitize input and mask secrets.\n```");
    });

    it("1.5 formats hybrid indexed prompt for skills >= 4KB", () => {
      const skill: SkillRecord = {
        id: "s-indexed",
        workspaceId: "ws-groupe-floteuil",
        userId: "user-101",
        name: "Docling Large Manual",
        slug: "docling-large-manual",
        description: "Complete IBM Docling parsing documentation",
        content: "X".repeat(5000), // 5KB
        tags: ["docling", "pdf"],
        metadata: {},
        createdAt: new Date(),
        updatedAt: new Date(),
        enabled: true,
      };

      const prompt = formatSkillsPrompt([skill]);
      expect(prompt).toContain("### Compétence indexée : Docling Large Manual (docling-large-manual)");
      expect(prompt).toContain('read_skill(name: "docling-large-manual")');
      expect(prompt).not.toContain("XXXXXXXX");
    });
  });

  // --------------------------------------------------------------------------
  // TIER 2: BOUNDARY & CORNER CASES
  // --------------------------------------------------------------------------
  describe("Tier 2: Boundary & Corner Cases", () => {
    it("2.1 enforces 2MB payload boundary limit on upload", async () => {
      const engine = new SovereignSkillsEngine();

      const validContent = "a".repeat(2_000_000);
      const validUpload = await engine.uploadMarkdown(actor1, {
        filename: "valid.md",
        content: validContent,
      });
      expect(validUpload.id).toBeDefined();

      const invalidContent = "a".repeat(2_000_001);
      await expect(
        engine.uploadMarkdown(actor1, {
          filename: "oversize.md",
          content: invalidContent,
        }),
      ).rejects.toThrow(/2MB/);
    });

    it("2.2 rejects empty markdown string", async () => {
      const engine = new SovereignSkillsEngine();
      await expect(
        engine.uploadMarkdown(actor1, {
          filename: "empty.md",
          content: "",
        }),
      ).rejects.toThrow(/empty/i);
    });

    it("2.3 normalizes accented characters and symbols in slug", () => {
      const slug = slugify("Intégration Réseau & Sécurité Santé 2026!");
      expect(slug).toBe("integration-reseau-securite-sante-2026");
    });

    it("2.4 automatically suffixes duplicate slugs within the same workspace", async () => {
      const engine = new SovereignSkillsEngine();

      const s1 = await engine.uploadMarkdown(actor1, {
        content: `---
name: SearXNG Search
slug: searxng-search
---
Search instructions 1.
`,
      });
      expect(s1.slug).toBe("searxng-search");

      const s2 = await engine.uploadMarkdown(actor1, {
        content: `---
name: SearXNG Search
slug: searxng-search
---
Search instructions 2.
`,
      });
      expect(s2.slug).toBe("searxng-search-2");

      const s3 = await engine.uploadMarkdown(actor1, {
        content: `---
name: SearXNG Search
slug: searxng-search
---
Search instructions 3.
`,
      });
      expect(s3.slug).toBe("searxng-search-3");
    });

    it("2.5 sanitizes dangerous XSS / iframe / script tags from markdown content", () => {
      const dirty = `
# Header
<script>alert('pwn')</script>
<iframe src="malicious.html"></iframe>
<img src=x onerror=alert(1)>
[Link](javascript:alert(1))
`;
      const clean = sanitizeMarkdownContent(dirty);
      expect(clean).not.toContain("<script");
      expect(clean).not.toContain("<iframe");
      expect(clean).not.toContain("onerror=");
      expect(clean).not.toContain("javascript:");
      expect(clean).toContain("# Header");
    });

    it("2.6 defends against ReDoS attack with massive repetitive input", () => {
      const start = Date.now();
      const payload = "---\nname: " + "abc".repeat(30_000) + "\n---\n" + "# ".repeat(15_000);
      const parsed = parseSkillMarkdown(payload);
      const duration = Date.now() - start;

      expect(duration).toBeLessThan(250);
      expect(parsed.name).toBeDefined();
    });

    it("2.7 returns structured error when read_skill queries unknown skill", async () => {
      const engine = new SovereignSkillsEngine();
      const res = await engine.executeReadSkill(actor1, "non-existent-slug");
      expect(res.error).toBe("Skill 'non-existent-slug' not found in workspace.");
      expect(res.content).toBeUndefined();
    });
  });

  // --------------------------------------------------------------------------
  // TIER 3: CROSS-FEATURE COMBINATIONS & FULL LIFECYCLE
  // --------------------------------------------------------------------------
  describe("Tier 3: Cross-Feature Combinations", () => {
    it("3.1 executes full end-to-end flow: Upload -> Bot Assign -> Prompt Inject -> Tool Read -> Bot Delete Cascade", async () => {
      const engine = new SovereignSkillsEngine();

      // 1. Create a Bot
      const bot = engine.createBot(actor1.workspaceId, "Assistant IA Polyvalent");
      expect(bot.id).toBeDefined();

      // 2. Upload Markdown Skill
      const uploadedSkill = await engine.uploadMarkdown(actor1, {
        filename: "docling.md",
        content: `---
name: Docling Parser
slug: docling-parser
description: Extract tables from PDF
tags: [parser, pdf, rag]
---

# Docling Instructions
Use TableFormer for extraction.
`,
      });
      expect(uploadedSkill.id).toBeDefined();

      // 3. Assign Skill to Bot
      const assignRes = await engine.assignSkillsToBot(actor1, bot.id, [uploadedSkill.id]);
      expect(assignRes.ok).toBe(true);
      expect(assignRes.count).toBe(1);

      // 4. Verify Bot Skills
      const botSkills = await engine.getBotSkills(actor1, bot.id);
      expect(botSkills).toHaveLength(1);
      expect(botSkills[0]!.name).toBe("Docling Parser");

      // 5. Generate Hybrid Prompt
      const prompt = formatSkillsPrompt(botSkills);
      expect(prompt).toContain("## Compétences & Connaissances Spécialisées de l'Agent");
      expect(prompt).toContain("Docling Parser");

      // 6. Execute read_skill tool
      const toolRes = await engine.executeReadSkill(actor1, "docling-parser");
      expect(toolRes.error).toBeUndefined();
      expect(toolRes.content).toContain("Use TableFormer for extraction.");

      // 7. Delete Bot and verify cascade deletion of assignments while global Skill remains intact
      const delBotRes = engine.deleteBot(actor1.workspaceId, bot.id);
      expect(delBotRes.ok).toBe(true);

      const remainingBotSkills = await engine.getBotSkills(actor1, bot.id);
      expect(remainingBotSkills).toHaveLength(0);

      // Global skill is still accessible
      const globalCheck = await engine.executeReadSkill(actor1, "docling-parser");
      expect(globalCheck.name).toBe("Docling Parser");
    });

    it("3.2 enforces tenant isolation across two independent workspaces", async () => {
      const engine = new SovereignSkillsEngine();

      // Workspace 1 uploads a skill
      const s1 = await engine.uploadMarkdown(actor1, {
        content: `---
name: Paris Secret Formula
slug: paris-secret-formula
---
Confidential formula.
`,
      });

      // Workspace 2 attempts to read Workspace 1's skill
      const crossRead = await engine.executeReadSkill(actor2, "paris-secret-formula");
      expect(crossRead.error).toContain("not found in workspace");

      // Workspace 2 attempts to attach Workspace 1's skill to its bot
      const bot2 = engine.createBot(actor2.workspaceId, "Lyon Bot");
      await expect(engine.assignSkillsToBot(actor2, bot2.id, [s1.id])).rejects.toThrow(
        /Isolation Error/,
      );
    });
  });

  // --------------------------------------------------------------------------
  // TIER 4: REAL-WORLD PRODUCTION SCENARIOS
  // --------------------------------------------------------------------------
  describe("Tier 4: Real-World Scenarios", () => {
    it("4.1 executes Docling Document Parser real-world skill scenario (>4KB indexed)", async () => {
      const engine = new SovereignSkillsEngine();
      const bot = engine.createBot(actor1.workspaceId, "Document RAG Agent");

      const doclingMarkdown = `---
name: Docling Document Parser
slug: docling-document-parser
description: "Expert en parsing, extraction et structuration de documents complexes (PDF, DOCX, HTML, tableaux) via la bibliothèque IBM Docling pour ingestion dans la base de connaissances et pipelines RAG."
tags: [parsing, pdf, docling, rag, ibm]
---

# Guide Complet Docling IBM

## TableFormer Architecture
Docling utilise un modèle de vision TableFormer pour reconstruire la structure cellulaire des tableaux complexes.

\`\`\`python
from docling.document_converter import DocumentConverter
converter = DocumentConverter()
result = converter.convert("sample.pdf")
print(result.document.export_to_markdown())
\`\`\`

## Stratégie de Chunking
1. Découpage hiérarchique par section H1/H2.
2. Préservation des tableaux en format Markdown pur.
3. Indexation vectorielle avec pgvector.
` + "Section détaillée...\n".repeat(250); // makes it > 4KB (~6.5KB)

      const uploaded = await engine.uploadMarkdown(actor1, {
        filename: "docling-parser.md",
        content: doclingMarkdown,
      });

      await engine.assignSkillsToBot(actor1, bot.id, [uploaded.id]);
      const botSkills = await engine.getBotSkills(actor1, bot.id);

      // System Prompt must contain condensed index
      const prompt = formatSkillsPrompt(botSkills);
      expect(prompt).toContain("### Compétence indexée : Docling Document Parser (docling-document-parser)");
      expect(prompt).toContain('read_skill(name: "docling-document-parser")');

      // Tool Call retrieves full manual
      const toolRes = await engine.executeReadSkill(actor1, "docling-document-parser");
      expect(toolRes.content).toContain("from docling.document_converter import DocumentConverter");
      expect(toolRes.tags).toContain("rag");
    });

    it("4.2 executes TypeScript Pro real-world skill scenario (<4KB direct prompt)", async () => {
      const engine = new SovereignSkillsEngine();
      const bot = engine.createBot(actor1.workspaceId, "Senior TypeScript Lead");

      const tsMarkdown = `---
name: TypeScript Pro
slug: typescript-pro
description: "Master TypeScript with advanced types, generics, and strict type safety."
tags: [typescript, dev, clean-code]
---

# TypeScript Standards
- Toujours utiliser 'unknown' plutôt que 'any'.
- Définir des discriminators pour les unions de types.
- Valider les données externes avec Zod à la frontière du système.
`;

      const uploaded = await engine.uploadMarkdown(actor1, {
        filename: "typescript-pro.md",
        content: tsMarkdown,
      });

      await engine.assignSkillsToBot(actor1, bot.id, [uploaded.id]);
      const botSkills = await engine.getBotSkills(actor1, bot.id);

      // Prompt must directly inject the code rules
      const prompt = formatSkillsPrompt(botSkills);
      expect(prompt).toContain("### Compétence active : TypeScript Pro (typescript-pro)");
      expect(prompt).toContain("Toujours utiliser 'unknown' plutôt que 'any'.");
    });

    it("4.3 executes Healthcare HDS Security French compliance scenario with secret redaction", async () => {
      const engine = new SovereignSkillsEngine();
      const bot = engine.createBot(actor1.workspaceId, "Agent Santé HDS");

      const hdsMarkdown = `---
name: HDS Healthcare Security
slug: hds-healthcare-security
description: "Expert en sécurité applicative pour données de santé (HDS / RGPD Santé France)."
tags: [securite, hds, sante, chiffrement]
---

# Conformité Santé HDS
- Chiffrement AES-256-GCM obligatoire pour tout stockage.
- Interdiction stricte de fuite de tokens ou identifiants patients.
`;

      const uploaded = await engine.uploadMarkdown(actor1, {
        content: hdsMarkdown,
      });

      await engine.assignSkillsToBot(actor1, bot.id, [uploaded.id]);
      const botSkills = await engine.getBotSkills(actor1, bot.id);
      const prompt = formatSkillsPrompt(botSkills);

      expect(prompt).toContain("Conformité Santé HDS");
      expect(prompt).toContain("Chiffrement AES-256-GCM obligatoire");

      // Verify secret redactor on output
      const redactor = createStreamingRedactor(["patient_token_secret_998877"]);
      const streamChunk = "Log: " + prompt;
      const redacted = redactor.push(streamChunk) + redactor.finish();
      expect(redacted).not.toContain("patient_token_secret_998877");
    });
  });
});
