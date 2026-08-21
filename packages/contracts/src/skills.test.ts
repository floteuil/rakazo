import { describe, expect, it } from "vitest";
import {
  AssignSkillsToBotInput,
  type BotSkillAssignment,
  BotSkillAssignmentSchema,
  CreateSkillInput,
  DeleteSkillInput,
  GetBotSkillsInput,
  GetSkillInput,
  ListSkillsInput,
  type Skill,
  SkillSchema,
  type SkillSummary,
  SkillSummarySchema,
  UpdateSkillInput,
  UploadSkillMarkdownInput,
} from "./domain.js";
import {
  type ParsedSkillMarkdown,
  parseSimpleYaml,
  parseSkillMarkdown,
  sanitizeMarkdownContent,
  slugify,
} from "./skill-parser.js";

// ============================================================================
// 4-TIER TEST SUITE
// ============================================================================

describe("Sovereign Skills Contracts & Parser (4-Tier Suite)", () => {
  // --------------------------------------------------------------------------
  // TIER 1: FEATURE COVERAGE (>=5 tests per feature)
  // --------------------------------------------------------------------------
  describe("Tier 1: Feature Coverage", () => {
    describe("Markdown & Frontmatter Parsing", () => {
      it("1.1 parses valid YAML frontmatter with full fields", () => {
        const markdown = `---
name: Docling Document Parser
slug: docling-parser
description: Extract structured data from PDF and DOCX
tags: [document, parser, rag]
author: Rakazo
version: 1.0.0
---

# Overview
This skill handles complex document parsing.
`;
        const result = parseSkillMarkdown(markdown);
        expect(result.name).toBe("Docling Document Parser");
        expect(result.slug).toBe("docling-parser");
        expect(result.description).toBe("Extract structured data from PDF and DOCX");
        expect(result.tags).toEqual(["document", "parser", "rag"]);
        expect(result.metadata).toEqual({ author: "Rakazo", version: "1.0.0" });
        expect(result.content).toContain("# Overview");
        expect(result.content).not.toContain("name: Docling Document Parser");
      });

      it("1.2 falls back to H1 header when name is omitted in frontmatter", () => {
        const markdown = `---
tags: [analysis, data]
---

# Advanced Data Analytics Tool

This is a comprehensive guide to analyzing data.
`;
        const result = parseSkillMarkdown(markdown);
        expect(result.name).toBe("Advanced Data Analytics Tool");
        expect(result.slug).toBe("advanced-data-analytics-tool");
        expect(result.tags).toEqual(["analysis", "data"]);
      });

      it("1.3 extracts description from first non-heading paragraph when omitted", () => {
        const markdown = `# TypeScript Expert

Master TypeScript with advanced types, generics, and strict safety.

## Best Practices
- Always enable strict mode.
`;
        const result = parseSkillMarkdown(markdown);
        expect(result.name).toBe("TypeScript Expert");
        expect(result.description).toBe("Master TypeScript with advanced types, generics, and strict safety.");
      });

      it("1.4 parses comma-separated string tags in frontmatter", () => {
        const markdown = `---
name: Docker Master
tags: devops, containers, docker, infrastructure
---

Containerization best practices.
`;
        const result = parseSkillMarkdown(markdown);
        expect(result.tags).toEqual(["devops", "containers", "docker", "infrastructure"]);
      });

      it("1.5 preserves complex markdown body elements (code blocks, tables, lists)", () => {
        const markdown = `---
name: API Designer
---

# REST Guidelines

| Method | Idempotent | Safe |
|:---|:---:|:---:|
| GET | Yes | Yes |
| POST | No | No |

\`\`\`typescript
interface UserResponse {
  id: string;
  name: string;
}
\`\`\`
`;
        const result = parseSkillMarkdown(markdown);
        expect(result.content).toContain("| Method | Idempotent | Safe |");
        expect(result.content).toContain("```typescript\ninterface UserResponse {");
      });

      it("1.6 uses fallback filename when markdown has no frontmatter and no H1", () => {
        const markdown = "Simple prompt instructions without heading.";
        const result = parseSkillMarkdown(markdown, "github-automation-helper.md");
        expect(result.name).toBe("github automation helper");
        expect(result.slug).toBe("github-automation-helper");
        expect(result.content).toBe(markdown);
      });
    });

    describe("Zod Contracts Validation", () => {
      it("1.7 validates valid CreateSkillInput", () => {
        const input = {
          name: "Kubernetes Operator",
          slug: "k8s-operator",
          description: "Manage K8s clusters",
          content: "Instructions for kubectl and helm.",
          tags: ["k8s", "devops"],
        };
        const parsed = CreateSkillInput.parse(input);
        expect(parsed.name).toBe("Kubernetes Operator");
        expect(parsed.slug).toBe("k8s-operator");
        expect(parsed.tags).toHaveLength(2);
      });

      it("1.8 validates SkillSummarySchema omits large content body", () => {
        const fullSkill: Skill = {
          id: "skill-123",
          workspaceId: "ws-456",
          userId: "user-789",
          name: "PostgreSQL Optimizer",
          slug: "postgres-optimizer",
          description: "Database tuning",
          content: "A".repeat(50_000), // 50KB
          tags: ["db", "sql"],
          metadata: { engine: "postgres" },
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };

        const summary = SkillSummarySchema.parse(fullSkill);
        expect(summary.id).toBe("skill-123");
        expect((summary as Record<string, unknown>).content).toBeUndefined();
      });

      it("1.9 validates AssignSkillsToBotInput with array of IDs", () => {
        const input = {
          botId: "bot-1",
          skillIds: ["skill-1", "skill-2", "skill-3"],
        };
        const parsed = AssignSkillsToBotInput.parse(input);
        expect(parsed.botId).toBe("bot-1");
        expect(parsed.skillIds).toEqual(["skill-1", "skill-2", "skill-3"]);
      });

      it("1.10 validates GetSkillInput accepting either skillId or slug", () => {
        expect(GetSkillInput.parse({ skillId: "skill-99" })).toEqual({ skillId: "skill-99" });
        expect(GetSkillInput.parse({ slug: "docling-parser" })).toEqual({ slug: "docling-parser" });
        expect(() => GetSkillInput.parse({})).toThrow("Either skillId or slug must be provided");
      });
    });
  });

  // --------------------------------------------------------------------------
  // TIER 2: BOUNDARY & CORNER CASES
  // --------------------------------------------------------------------------
  describe("Tier 2: Boundary & Corner Cases", () => {
    it("2.1 enforces 2MB size cap on skill content (2,000,000 chars pass, 2,000,001 chars fail)", () => {
      const validLargeContent = "a".repeat(2_000_000);
      expect(() =>
        CreateSkillInput.parse({
          name: "Large Skill",
          content: validLargeContent,
        }),
      ).not.toThrow();

      const invalidOversizeContent = "a".repeat(2_000_001);
      expect(() =>
        CreateSkillInput.parse({
          name: "Oversize Skill",
          content: invalidOversizeContent,
        }),
      ).toThrow(/2MB/);
    });

    it("2.2 rejects empty or whitespace-only markdown content", () => {
      expect(() =>
        CreateSkillInput.parse({
          name: "Empty Skill",
          content: "",
        }),
      ).toThrow(/empty/i);

      expect(() =>
        UploadSkillMarkdownInput.parse({
          content: "",
        }),
      ).toThrow(/empty/i);
    });

    it("2.3 handles missing frontmatter gracefully without errors", () => {
      const rawMarkdown = "Direct markdown content without any header or title.";
      const result = parseSkillMarkdown(rawMarkdown);
      expect(result.name).toBe("Compétence sans titre");
      expect(result.slug).toBe("competence-sans-titre");
      expect(result.tags).toEqual([]);
      expect(result.content).toBe(rawMarkdown);
    });

    it("2.4 normalizes accents and special characters into clean slug", () => {
      const title = "Sécurité & Conformité (HDS) — Édition Spéciale 2026!";
      const slug = slugify(title);
      expect(slug).toBe("securite-conformite-hds-edition-speciale-2026");
      expect(slug).toMatch(/^[a-z0-9-]+$/);
    });

    it("2.5 defends against ReDoS attacks with deeply nested and repetitive markdown", () => {
      const startTime = Date.now();
      const maliciousPayload = "---\nname: " + "a".repeat(50_000) + "\n---\n" + "# ".repeat(25_000);
      const result = parseSkillMarkdown(maliciousPayload);
      const elapsed = Date.now() - startTime;

      expect(elapsed).toBeLessThan(200); // Must complete in under 200ms
      expect(result.name).toBeDefined();
    });

    it("2.6 sanitizes dangerous HTML/script tags (anti-XSS)", () => {
      const maliciousMarkdown = `---
name: Injected Skill
---

# Safe Heading
<script>alert("xss")</script>
<iframe src="https://evil.com" onload="stealTokens()"></iframe>
<a href="javascript:void(0)" onclick="hack()">Click me</a>
<img src="x" onerror="alert(1)">

Regular safe paragraph.
`;
      const result = parseSkillMarkdown(maliciousMarkdown);
      expect(result.content).not.toContain("<script");
      expect(result.content).not.toContain("<iframe");
      expect(result.content).not.toContain("javascript:");
      expect(result.content).not.toContain("onload=");
      expect(result.content).not.toContain("onclick=");
      expect(result.content).not.toContain("onerror=");
      expect(result.content).toContain("# Safe Heading");
      expect(result.content).toContain("Regular safe paragraph.");
    });
  });

  // --------------------------------------------------------------------------
  // TIER 3: CROSS-FEATURE COMBINATIONS
  // --------------------------------------------------------------------------
  describe("Tier 3: Cross-Feature Combinations", () => {
    it("3.1 transforms raw uploaded markdown into validated CreateSkillInput and Skill record", () => {
      const uploadedFile = `---
name: Next.js 15 Architect
slug: nextjs-15-architect
description: Master Next.js App Router, Server Actions and Turbopack
tags: [react, nextjs, frontend]
framework_version: "15.0"
---

# Core Principles
- Always use React Server Components by default.
- Use 'use server' for mutation actions.
`;
      // Step 1: Parse
      const parsed = parseSkillMarkdown(uploadedFile);

      // Step 2: Validate against CreateSkillInput
      const createInput = CreateSkillInput.parse({
        name: parsed.name,
        slug: parsed.slug,
        description: parsed.description,
        content: parsed.content,
        tags: parsed.tags,
        metadata: parsed.metadata,
      });

      // Step 3: Simulate DB persistence and validate against SkillSchema
      const mockDbRecord: Skill = {
        id: "cuid-skill-101",
        workspaceId: "ws-paris-01",
        userId: "user-floteuil",
        name: createInput.name,
        slug: createInput.slug || "nextjs-15-architect",
        description: createInput.description,
        content: createInput.content,
        tags: createInput.tags,
        metadata: createInput.metadata,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const validatedSkill = SkillSchema.parse(mockDbRecord);
      expect(validatedSkill.id).toBe("cuid-skill-101");
      expect(validatedSkill.metadata.framework_version).toBe("15.0");
    });
  });

  // --------------------------------------------------------------------------
  // TIER 4: REAL-WORLD PRODUCTION SCENARIOS
  // --------------------------------------------------------------------------
  describe("Tier 4: Real-World Scenarios", () => {
    it("4.1 parses Docling Document Parser real-world skill payload", () => {
      const doclingMarkdown = `---
name: Docling Document Parser
slug: docling-document-parser
description: "Expert en parsing, extraction et structuration de documents complexes (PDF, DOCX, HTML, tableaux) via la bibliothèque IBM Docling pour ingestion dans la base de connaissances et pipelines RAG."
tags: [parsing, pdf, docling, rag, ibm]
category: data-engineering
---

# Docling Document Parser

Utilisez ce skill pour extraire fidèlement les tableaux, figures et hiérarchies de documents complexes.

## Instructions
1. Charger le document source.
2. Détecter la structure des tableaux avec TableFormer.
3. Exporter en Markdown structuré pour le pipeline RAG.
`;
      const parsed = parseSkillMarkdown(doclingMarkdown);
      expect(parsed.name).toBe("Docling Document Parser");
      expect(parsed.slug).toBe("docling-document-parser");
      expect(parsed.description).toContain("Expert en parsing");
      expect(parsed.tags).toContain("rag");
      expect(parsed.tags).toContain("docling");
      expect(parsed.metadata.category).toBe("data-engineering");
    });

    it("4.2 parses Healthcare HDS Security French compliance skill payload", () => {
      const hdsMarkdown = `---
name: HDS Healthcare Security
slug: hds-healthcare-security
description: "Expert en sécurité applicative pour données de santé (HDS / RGPD Santé France), chiffrement AES-256-GCM, journalisation d'audit immuable."
tags: [securite, hds, sante, rgpd, chiffrement]
compliance: "HDS-FR-2026"
---

# Sécurité des Données de Santé

Règles impératives :
- Chiffrement au repos (AES-256-GCM).
- Masquage systématique des secrets et données identifiantes.
- Audit trail immuable.
`;
      const parsed = parseSkillMarkdown(hdsMarkdown);
      expect(parsed.name).toBe("HDS Healthcare Security");
      expect(parsed.slug).toBe("hds-healthcare-security");
      expect(parsed.tags).toEqual(["securite", "hds", "sante", "rgpd", "chiffrement"]);
      expect(parsed.metadata.compliance).toBe("HDS-FR-2026");
      expect(parsed.content).toContain("Chiffrement au repos (AES-256-GCM)");
    });
  });
});
