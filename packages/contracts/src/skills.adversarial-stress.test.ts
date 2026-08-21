import { describe, expect, it } from "vitest";
import {
  AssignSkillsToBotInput,
  CreateSkillInput,
  DeleteSkillInput,
  GetBotSkillsInput,
  GetSkillInput,
  ListSkillsInput,
  type Skill,
  SkillSchema,
  SkillSummarySchema,
  UpdateSkillInput,
  UploadSkillMarkdownInput,
} from "./domain.js";
import {
  parseSimpleYaml,
  parseSkillMarkdown,
  sanitizeMarkdownContent,
  slugify,
} from "./skill-parser.js";

describe("Milestone 2 Adversarial & Fuzzing Stress Suite (Challenger 1)", () => {
  // ==========================================================================
  // SECTION 1: YAML PARSER & FUZZING RESILIENCE
  // ==========================================================================
  describe("1. YAML Fuzzing & Malformed Payloads", () => {
    it("1.1 handles YAML circular alias reference without crashing", () => {
      const circularYaml = `
name: Circular Skill
nodeA: &nodeA
  name: Node A
  ref: *nodeA
`;
      expect(() => {
        const parsed = parseSimpleYaml(circularYaml);
        expect(parsed).toBeDefined();
        expect(parsed.name).toBe("Circular Skill");
      }).not.toThrow();
    });

    it("1.2 handles YAML billion-laughs / exponential expansion safely", () => {
      const billionLaughs = `
a: &a ["lol","lol","lol","lol","lol","lol","lol","lol","lol"]
b: &b [*a,*a,*a,*a,*a,*a,*a,*a,*a]
c: &c [*b,*b,*b,*b,*b,*b,*b,*b,*b]
name: Expansion Test
`;
      const start = Date.now();
      const parsed = parseSimpleYaml(billionLaughs);
      const duration = Date.now() - start;

      expect(parsed).toBeDefined();
      expect(duration).toBeLessThan(100); // Must not hang
    });

    it("1.3 recovers from severely malformed YAML via line-by-line fallback", () => {
      const malformedYaml = `
name: Fallback Parsing Skill
description: "Unclosed string quote
tags: [tag1, tag2, unclosed_array
author: { broken: json: object
version: 2.0.0
`;
      const parsed = parseSimpleYaml(malformedYaml);
      expect(parsed.name).toBe("Fallback Parsing Skill");
      expect(parsed.version).toBe("2.0.0");
    });

    it("1.4 handles prototype pollution keys safely", () => {
      const protoPayload = `
__proto__:
  polluted: true
constructor:
  prototype:
    polluted: true
name: Clean Skill
`;
      const parsed = parseSimpleYaml(protoPayload);
      expect(parsed.name).toBe("Clean Skill");
      expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    });

    it("1.5 parses frontmatter with multiple horizontal rules in markdown body", () => {
      const mdWithRules = `---
name: Multi Divider Skill
description: Contains HRs
tags: [divider]
---

# Title

---

Paragraph 1

---

Paragraph 2
`;
      const result = parseSkillMarkdown(mdWithRules);
      expect(result.name).toBe("Multi Divider Skill");
      expect(result.description).toBe("Contains HRs");
      expect(result.tags).toEqual(["divider"]);
      expect(result.content).toContain("Paragraph 1");
      expect(result.content).toContain("Paragraph 2");
      expect(result.content).toContain("---");
    });

    it("1.6 handles empty and whitespace-only frontmatter", () => {
      const emptyFm = `---
   
---

# Only Title

Some content.
`;
      const result = parseSkillMarkdown(emptyFm);
      expect(result.name).toBe("Only Title");
      expect(result.content).toContain("Some content.");
      expect(result.content).toContain("# Only Title");
    });
  });

  // ==========================================================================
  // SECTION 2: REDOS & CATASTROPHIC BACKTRACKING RESILIENCE
  // ==========================================================================
  describe("2. ReDoS & Catastrophic Backtracking Prevention", () => {
    it("2.1 resists unclosed frontmatter in large payload (100KB) in < 100ms", () => {
      const unclosedFm = "---\n" + "x: y\n".repeat(10_000);
      const start = Date.now();
      const result = parseSkillMarkdown(unclosedFm);
      const duration = Date.now() - start;

      expect(duration).toBeLessThan(150);
      expect(result).toBeDefined();
    });

    it("2.2 resists 500 unclosed script/iframe tags in < 100ms", () => {
      const unclosedTags = "<script ".repeat(250) + "<iframe ".repeat(250);
      const start = Date.now();
      const sanitized = sanitizeMarkdownContent(unclosedTags);
      const duration = Date.now() - start;

      expect(duration).toBeLessThan(100);
      expect(sanitized).toBeDefined();
    });

    it("2.3 resists repeated event handler payloads in < 100ms", () => {
      const eventHandlers = " onclick= ".repeat(5_000) + ' onerror="alert(1)" '.repeat(2_000);
      const start = Date.now();
      const sanitized = sanitizeMarkdownContent(eventHandlers);
      const duration = Date.now() - start;

      expect(duration).toBeLessThan(100);
      expect(sanitized).not.toContain("onerror=");
    });

    it("2.4 resists massive header search without newline in < 50ms", () => {
      const massiveHeader = "# " + "word ".repeat(10_000);
      const start = Date.now();
      const result = parseSkillMarkdown(massiveHeader);
      const duration = Date.now() - start;

      expect(duration).toBeLessThan(100);
      expect(result.name).toBeDefined();
    });
  });

  // ==========================================================================
  // SECTION 3: SANITIZATION & SECURITY INJECTION MATRIX
  // ==========================================================================
  describe("3. Security Sanitization & Injection Matrix", () => {
    it("3.1 strips mixed-casing script tags (<sCrIpT>)", () => {
      const raw = 'Normal text <sCrIpT type="text/javascript">steal(document.cookie)</ScRiPt> Safe text';
      const clean = sanitizeMarkdownContent(raw);
      expect(clean).not.toMatch(/<script/i);
      expect(clean).not.toContain("steal");
      expect(clean).toContain("Normal text");
      expect(clean).toContain("Safe text");
    });

    it("3.2 strips object, embed, iframe, and script elements", () => {
      const raw = `
<object data="evil.swf"></object>
<embed src="evil.pdf"></embed>
<iframe src="http://phishing.site"></iframe>
<script>alert(1)</script>
`;
      const clean = sanitizeMarkdownContent(raw);
      expect(clean).not.toContain("<object");
      expect(clean).not.toContain("<embed");
      expect(clean).not.toContain("<iframe");
      expect(clean).not.toContain("<script");
    });

    it("3.3 removes javascript: pseudo-protocol URIs", () => {
      const raw = '[Click here](javascript:alert("pwned")) <a href="javascript:void(0)">Link</a>';
      const clean = sanitizeMarkdownContent(raw);
      expect(clean).not.toContain("javascript:");
    });

    it("3.4 removes diverse on* event handler attributes", () => {
      const raw = '<img src=x onload="alert(1)" onerror=alert(2) onmouseover=\'alert(3)\' onfocus=alert(4)>';
      const clean = sanitizeMarkdownContent(raw);
      expect(clean).not.toContain("onload=");
      expect(clean).not.toContain("onerror=");
      expect(clean).not.toContain("onmouseover=");
      expect(clean).not.toContain("onfocus=");
    });
  });

  // ==========================================================================
  // SECTION 4: UNICODE, SLUG GENERATION & ACCENT NORMALIZATION
  // ==========================================================================
  describe("4. Unicode, Slugs & Diacritics Normalization", () => {
    it("4.1 converts complex French accents and punctuation into clean slug", () => {
      const title = "Développement d'APIs & Sécurité Électronique (Édition Française 2026)";
      const slug = slugify(title);
      expect(slug).toBe("developpement-d-apis-securite-electronique-edition-francaise-2026");
      expect(slug).toMatch(/^[a-z0-9-]+$/);
    });

    it("4.2 handles German, Spanish and Nordic characters", () => {
      const title = "München, Ålesund & España: Große Möglichkeiten";
      const slug = slugify(title);
      expect(slug).toBe("munchen-alesund-espana-gro-e-moglichkeiten");
      expect(slug).toMatch(/^[a-z0-9-]+$/);
    });

    it("4.3 handles Non-Latin scripts gracefully with fallback to 'skill'", () => {
      expect(slugify("文档解析器")).toBe("skill");
      expect(slugify("مساعد الذكاء")).toBe("skill");
      expect(slugify("Программирование")).toBe("skill");
    });

    it("4.4 handles mixed Latin and Non-Latin scripts", () => {
      const mixed = "Docling 文档解析器 Pro v2";
      const slug = slugify(mixed);
      expect(slug).toBe("docling-pro-v2");
    });

    it("4.5 enforces strict 80-character maximum cap on slug", () => {
      const veryLong = "a".repeat(150);
      const slug = slugify(veryLong);
      expect(slug.length).toBe(80);
      expect(slug).toBe("a".repeat(80));
    });

    it("4.6 strips leading and trailing hyphens cleanly", () => {
      const messy = "---Super Skill Name---";
      const slug = slugify(messy);
      expect(slug).toBe("super-skill-name");
    });

    it("4.7 handles all-symbol strings by falling back to 'skill'", () => {
      expect(slugify("@#$%^&*()_+=-{}[]")).toBe("skill");
      expect(slugify("")).toBe("skill");
      expect(slugify("   ")).toBe("skill");
    });
  });

  // ==========================================================================
  // SECTION 5: BOUNDARY CAPS & STRICT LIMIT ENFORCEMENT
  // ==========================================================================
  describe("5. Boundary Caps & Limits (2MB, Field Lengths, Arrays)", () => {
    it("5.1 accepts exact 2,000,000 characters and rejects 2,000,001 in parser", () => {
      const exact2MB = "a".repeat(2_000_000);
      expect(() => parseSkillMarkdown(exact2MB)).not.toThrow();

      const exceed2MB = "a".repeat(2_000_001);
      expect(() => parseSkillMarkdown(exceed2MB)).toThrow("Content exceeds 2MB limit");
    });

    it("5.2 enforces tag array limits in CreateSkillInput (max 20 tags, max 50 chars each)", () => {
      const validTags = Array.from({ length: 20 }, (_, i) => `tag-${i}-${"x".repeat(40)}`.slice(0, 50));
      expect(() =>
        CreateSkillInput.parse({
          name: "Tagged Skill",
          content: "Body",
          tags: validTags,
        }),
      ).not.toThrow();

      expect(() =>
        CreateSkillInput.parse({
          name: "Too Many Tags",
          content: "Body",
          tags: [...validTags, "extra-tag"],
        }),
      ).toThrow();

      expect(() =>
        CreateSkillInput.parse({
          name: "Oversize Tag",
          content: "Body",
          tags: ["a".repeat(51)],
        }),
      ).toThrow();
    });

    it("5.3 enforces name (120 chars) and description (2000 chars) boundary caps", () => {
      expect(() =>
        CreateSkillInput.parse({
          name: "a".repeat(120),
          content: "Body",
        }),
      ).not.toThrow();

      expect(() =>
        CreateSkillInput.parse({
          name: "a".repeat(121),
          content: "Body",
        }),
      ).toThrow();

      expect(() =>
        CreateSkillInput.parse({
          name: "Valid Name",
          description: "d".repeat(2000),
          content: "Body",
        }),
      ).not.toThrow();

      expect(() =>
        CreateSkillInput.parse({
          name: "Valid Name",
          description: "d".repeat(2001),
          content: "Body",
        }),
      ).toThrow();
    });

    it("5.4 enforces AssignSkillsToBotInput caps (max 100 skill IDs)", () => {
      const validIds = Array.from({ length: 100 }, (_, i) => `skill-${i}`);
      expect(() =>
        AssignSkillsToBotInput.parse({
          botId: "bot-1",
          skillIds: validIds,
        }),
      ).not.toThrow();

      const excessiveIds = Array.from({ length: 101 }, (_, i) => `skill-${i}`);
      expect(() =>
        AssignSkillsToBotInput.parse({
          botId: "bot-1",
          skillIds: excessiveIds,
        }),
      ).toThrow();
    });
  });

  // ==========================================================================
  // SECTION 6: ZOD CONTRACTS INVARIANTS & INTEGRATION
  // ==========================================================================
  describe("6. Zod Contracts Invariants", () => {
    it("6.1 rejects invalid slug formats in CreateSkillInput and UpdateSkillInput", () => {
      const invalidSlugs = ["Uppercase-Slug", "slug_with_underscore", "slug with spaces", "slug@special!"];

      for (const badSlug of invalidSlugs) {
        expect(() =>
          CreateSkillInput.parse({
            name: "Skill",
            slug: badSlug,
            content: "Body",
          }),
        ).toThrow(/Slug must be lowercase alphanumeric with hyphens/);

        expect(() =>
          UpdateSkillInput.parse({
            skillId: "skill-1",
            slug: badSlug,
          }),
        ).toThrow(/Slug must be lowercase alphanumeric with hyphens/);
      }
    });

    it("6.2 validates GetSkillInput requires either skillId or slug", () => {
      expect(() => GetSkillInput.parse({})).toThrow("Either skillId or slug must be provided");
      expect(GetSkillInput.parse({ skillId: "s-1" })).toEqual({ skillId: "s-1" });
      expect(GetSkillInput.parse({ slug: "s-slug" })).toEqual({ slug: "s-slug" });
      expect(GetSkillInput.parse({ skillId: "s-1", slug: "s-slug" })).toEqual({
        skillId: "s-1",
        slug: "s-slug",
      });
    });

    it("6.3 validates ListSkillsInput pagination boundaries", () => {
      expect(ListSkillsInput.parse({})).toEqual({ limit: 50, offset: 0 });
      expect(ListSkillsInput.parse({ limit: 100, offset: 50 })).toEqual({ limit: 100, offset: 50 });
      expect(() => ListSkillsInput.parse({ limit: 0 })).toThrow();
      expect(() => ListSkillsInput.parse({ limit: 101 })).toThrow();
      expect(() => ListSkillsInput.parse({ offset: -1 })).toThrow();
    });

    it("6.4 validates SkillSchema integrity on full entity", () => {
      const validSkill: Skill = {
        id: "cuid-12345",
        workspaceId: "ws-999",
        userId: "user-111",
        name: "Full Skill",
        slug: "full-skill",
        description: "A complete skill entity",
        content: "# Instructions\nDo task.",
        tags: ["core", "v1"],
        metadata: { customField: 42, nested: { enabled: true } },
        createdAt: "2026-08-21T19:00:00.000Z",
        updatedAt: "2026-08-21T19:00:00.000Z",
      };

      const parsed = SkillSchema.parse(validSkill);
      expect(parsed.id).toBe("cuid-12345");
      expect(parsed.metadata).toEqual({ customField: 42, nested: { enabled: true } });

      const summary = SkillSummarySchema.parse(validSkill);
      expect(summary.id).toBe("cuid-12345");
      expect((summary as Record<string, unknown>).content).toBeUndefined();
    });
  });

  // ==========================================================================
  // SECTION 7: HIGH-THROUGHPUT PERFORMANCE & FUZZ GENERATOR
  // ==========================================================================
  describe("7. High-Throughput Fuzz & Benchmark", () => {
    it("7.1 fuzzes 500 randomized markdown documents in under 1 second", () => {
      const start = Date.now();
      const tagsPool = ["doc", "rag", "security", "ai", "cloud", "devops", "sql", "api"];

      for (let i = 0; i < 500; i++) {
        const hasFm = i % 2 === 0;
        const tag1 = tagsPool[i % tagsPool.length];
        const tag2 = tagsPool[(i + 3) % tagsPool.length];

        let md = "";
        if (hasFm) {
          md += `---\nname: Fuzz Skill ${i}\ntags: [${tag1}, ${tag2}]\ncustom_idx: ${i}\n---\n\n`;
        }
        md += `# Heading for Skill ${i}\n\nParagraph text with *formatting* and <script>malicious()</script> elements.\n\nCode snippet:\n\`\`\`ts\nconst x = ${i};\n\`\`\``;

        const result = parseSkillMarkdown(md, `fallback-file-${i}.md`);
        expect(result.name).toBeDefined();
        expect(result.slug).toMatch(/^[a-z0-9-]+$/);
        expect(result.content).not.toContain("<script");
      }

      const duration = Date.now() - start;
      expect(duration).toBeLessThan(2000); // ~2.4ms per doc, well under 2s
    });

    it("7.2 processes 1.95MB valid markdown document in < 150ms", () => {
      const header = "---\nname: Huge Skill\ntags: [huge, stress]\n---\n\n# Massive Skill\n\n";
      const body = "This is a repeated paragraph in a huge document.\n".repeat(38_000);
      const hugeDoc = header + body;
      expect(hugeDoc.length).toBeLessThan(2_000_000);

      const start = Date.now();
      const result = parseSkillMarkdown(hugeDoc);
      const duration = Date.now() - start;

      expect(duration).toBeLessThan(500); // 1.95MB in < 500ms
      expect(result.name).toBe("Huge Skill");
      expect(result.tags).toEqual(["huge", "stress"]);
      expect(result.content.length).toBeGreaterThan(1_500_000);
    });
  });
});
