import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  getByteLength,
  type ParsedMarkdownSkill,
  parseMarkdownContent,
  SkillCard,
  type SkillItem,
  SkillLibraryOverlay,
  SkillSizeBadge,
  slugify,
} from "./SkillLibraryOverlay";

// ============================================================================
// ADVERSARIAL CHALLENGE & EMPIRICAL STRESS SUITE — SKILL LIBRARY OVERLAY
// ============================================================================

describe("Adversarial Stress Test: SkillLibraryOverlay & Markdown Engine", () => {
  const dummyDate = "2026-08-21T18:30:00.000Z";

  const standardSkills: SkillItem[] = [
    {
      id: "sk-1",
      name: "FastAPI Modular Architect",
      slug: "fastapi-modular-architect",
      description: "Architecture FastAPI avancée avec SQLAlchemy 2.0 et Pydantic v2.",
      tags: ["python", "fastapi", "backend"],
      content: "# FastAPI Guidelines\n\nDirectives pour architectures modulaires.",
      sizeBytes: 1200,
      createdAt: dummyDate,
      updatedAt: dummyDate,
    },
    {
      id: "sk-2",
      name: "Docling Document Parser",
      slug: "docling-document-parser",
      description: "Extraction structurée haute précision pour documents PDF, DOCX et tableaux complexes.",
      tags: ["rag", "parser", "docling", "pdf"],
      content: "# Docling Parser Guide\n\nDirectives complètes pour documents complexes.\n" + "D".repeat(6000),
      sizeBytes: 6500,
      createdAt: dummyDate,
      updatedAt: dummyDate,
    },
    {
      id: "sk-3",
      name: "HDS Healthcare Security",
      slug: "hds-healthcare-security",
      description: "Sécurité des données de santé HDS et chiffrement AES-256-GCM souverain.",
      tags: ["security", "hds", "health", "rgpd"],
      content: "# HDS Security\n\nChiffrement de bout en bout et audit immuable.",
      sizeBytes: 3100,
      createdAt: dummyDate,
      updatedAt: dummyDate,
    },
  ];

  // --------------------------------------------------------------------------
  // DIMENSION 1: EXTREME & ADVERSARIAL SEARCH QUERIES
  // --------------------------------------------------------------------------
  describe("Dimension 1: Extreme & Adversarial Search Queries", () => {
    it("1.1 does not crash on regex special characters (ReDoS / SyntaxError resilience)", () => {
      const maliciousQueries = [
        ".*",
        "+",
        "?",
        "^",
        "$",
        "(",
        ")",
        "[",
        "]",
        "{",
        "}",
        "|",
        "\\",
        "/",
        "(a+)+$",
        "[[[",
        "(((.*)))",
        "(?<=foo)",
      ];

      for (const q of maliciousQueries) {
        expect(() => {
          const html = renderToStaticMarkup(
            <SkillLibraryOverlay skills={standardSkills} searchQuery={q} />,
          );
          expect(typeof html).toBe("string");
        }).not.toThrow();
      }
    });

    it("1.2 handles massive 10,000-character search strings without freezing or throwing", () => {
      const massiveQuery = "a".repeat(10000);
      const start = Date.now();
      const html = renderToStaticMarkup(
        <SkillLibraryOverlay skills={standardSkills} searchQuery={massiveQuery} />,
      );
      const duration = Date.now() - start;

      expect(duration).toBeLessThan(3000); // Must execute rapidly
      expect(html).toContain("Aucun skill ne correspond à votre recherche");
    });

    it("1.3 handles SQL injection and XSS payloads in search queries safely", () => {
      const dangerousQueries = [
        "' OR '1'='1' --",
        "'; DROP TABLE skills; --",
        "<script>alert('xss')</script>",
        "<img src=x onerror=alert(1)>",
        "${7*7}",
        "{{constructor.constructor('alert(1)')()}}",
      ];

      for (const q of dangerousQueries) {
        const html = renderToStaticMarkup(
          <SkillLibraryOverlay skills={standardSkills} searchQuery={q} />,
        );
        expect(html).toContain("Aucun skill ne correspond à votre recherche");
        expect(html).not.toContain("<script>alert('xss')</script>");
      }
    });

    it("1.4 handles exotic Unicode, emojis, RTL scripts, and zero-width characters in search", () => {
      const unicodeSkills: SkillItem[] = [
        {
          id: "sk-uni-1",
          name: "RAG 🚀 Recherche Multilingue",
          slug: "rag-multilingue",
          description: "Système de recherche avec support اللغة العربية et 日本語.",
          tags: ["ia", "العربية", "🚀"],
          sizeBytes: 1500,
        },
      ];

      // Match emoji tag
      const htmlEmoji = renderToStaticMarkup(
        <SkillLibraryOverlay skills={unicodeSkills} searchQuery="🚀" />,
      );
      expect(htmlEmoji).toContain("RAG 🚀 Recherche Multilingue");

      // Match Arabic script
      const htmlArabic = renderToStaticMarkup(
        <SkillLibraryOverlay skills={unicodeSkills} searchQuery="العربية" />,
      );
      expect(htmlArabic).toContain("RAG 🚀 Recherche Multilingue");

      // Match Japanese script
      const htmlJapanese = renderToStaticMarkup(
        <SkillLibraryOverlay skills={unicodeSkills} searchQuery="日本語" />,
      );
      expect(htmlJapanese).toContain("RAG 🚀 Recherche Multilingue");

      // Zero-width space search does not crash
      const htmlZeroWidth = renderToStaticMarkup(
        <SkillLibraryOverlay skills={unicodeSkills} searchQuery="\u200B\uFEFF" />,
      );
      expect(typeof htmlZeroWidth).toBe("string");
    });

    it("1.5 searches across all attributes: name, slug, description, and tags", () => {
      // Search by name
      const html1 = renderToStaticMarkup(
        <SkillLibraryOverlay skills={standardSkills} searchQuery="FastAPI" />,
      );
      expect(html1).toContain("FastAPI Modular Architect");
      expect(html1).not.toContain("Docling Document Parser");

      // Search by slug
      const html2 = renderToStaticMarkup(
        <SkillLibraryOverlay skills={standardSkills} searchQuery="docling-document" />,
      );
      expect(html2).toContain("Docling Document Parser");
      expect(html2).not.toContain("FastAPI Modular Architect");

      // Search by description keyword
      const html3 = renderToStaticMarkup(
        <SkillLibraryOverlay skills={standardSkills} searchQuery="chiffrement" />,
      );
      expect(html3).toContain("HDS Healthcare Security");
      expect(html3).not.toContain("Docling Document Parser");

      // Search by tag
      const html4 = renderToStaticMarkup(
        <SkillLibraryOverlay skills={standardSkills} searchQuery="rgpd" />,
      );
      expect(html4).toContain("HDS Healthcare Security");
      expect(html4).not.toContain("FastAPI Modular Architect");
    });
  });

  // --------------------------------------------------------------------------
  // DIMENSION 2: TAG SELECTION & FILTER COMBINATIONS
  // --------------------------------------------------------------------------
  describe("Dimension 2: Tag Selection & Filter Combinations", () => {
    it("2.1 aggregates unique tags from skills and always prepends 'Tous'", () => {
      const skillsWithDuplicates: SkillItem[] = [
        {
          id: "sk-a",
          name: "Skill A",
          slug: "skill-a",
          description: "Desc A",
          tags: ["dev", "python", "dev"], // intra-skill duplicate
          sizeBytes: 1000,
        },
        {
          id: "sk-b",
          name: "Skill B",
          slug: "skill-b",
          description: "Desc B",
          tags: ["python", "backend", ""], // inter-skill duplicate + empty tag
          sizeBytes: 1000,
        },
      ];

      const html = renderToStaticMarkup(<SkillLibraryOverlay skills={skillsWithDuplicates} />);
      expect(html).toContain("Tous");
      expect(html).toContain("dev");
      expect(html).toContain("python");
      expect(html).toContain("backend");
    });

    it("2.2 handles tags with special characters (C++, node.js, #hash, spaces, slashes)", () => {
      const specialTagSkills: SkillItem[] = [
        {
          id: "sk-spec-1",
          name: "C++ Optimization Engine",
          slug: "cpp-engine",
          description: "Directives C++ avancées",
          tags: ["c++", "node.js", "sys/admin", ".net core"],
          sizeBytes: 1200,
        },
      ];

      const html = renderToStaticMarkup(
        <SkillLibraryOverlay skills={specialTagSkills} selectedTag="c++" />,
      );
      expect(html).toContain("C++ Optimization Engine");

      const htmlDotNet = renderToStaticMarkup(
        <SkillLibraryOverlay skills={specialTagSkills} selectedTag=".net core" />,
      );
      expect(htmlDotNet).toContain("C++ Optimization Engine");
    });

    it("2.3 combines tag selection and search query with strict intersection", () => {
      const multiSkills: SkillItem[] = [
        {
          id: "sk-t1",
          name: "Python API Fast",
          slug: "python-api-fast",
          description: "FastAPI builder",
          tags: ["python", "api"],
          sizeBytes: 1000,
        },
        {
          id: "sk-t2",
          name: "Python Data Science",
          slug: "python-data-science",
          description: "Pandas et NumPy",
          tags: ["python", "data"],
          sizeBytes: 1000,
        },
        {
          id: "sk-t3",
          name: "Node.js API Express",
          slug: "nodejs-api-express",
          description: "Express API builder",
          tags: ["javascript", "api"],
          sizeBytes: 1000,
        },
      ];

      // Selected tag 'python' + search 'API' -> only sk-t1 matches
      const html = renderToStaticMarkup(
        <SkillLibraryOverlay
          skills={multiSkills}
          selectedTag="python"
          searchQuery="API"
        />,
      );
      expect(html).toContain("Python API Fast");
      expect(html).not.toContain("Python Data Science");
      expect(html).not.toContain("Node.js API Express");
    });

    it("2.4 displays empty state when tag and search combination yield no match", () => {
      const html = renderToStaticMarkup(
        <SkillLibraryOverlay
          skills={standardSkills}
          selectedTag="security"
          searchQuery="fastapi"
        />,
      );
      expect(html).toContain("Aucun skill ne correspond à votre recherche");
    });
  });

  // --------------------------------------------------------------------------
  // DIMENSION 3: OVERSIZED MARKDOWN & BOUNDARY CALCULATIONS
  // --------------------------------------------------------------------------
  describe("Dimension 3: Oversized Content & Byte Length Boundaries", () => {
    it("3.1 calculates byte length correctly for single-byte, multi-byte UTF-8, and emojis", () => {
      // ASCII: 1 char = 1 byte
      expect(getByteLength("Hello World")).toBe(11);

      // French accents: é, è, à, ç are 2 bytes each in UTF-8
      const frenchText = "Éléphant français à l'opéra";
      const expectedFrenchBytes = new TextEncoder().encode(frenchText).length;
      expect(getByteLength(frenchText)).toBe(expectedFrenchBytes);

      // 4-byte Emojis
      const emojiText = "🚀🤖⚡️🛡️";
      const expectedEmojiBytes = new TextEncoder().encode(emojiText).length;
      expect(getByteLength(emojiText)).toBe(expectedEmojiBytes);
    });

    it("3.2 validates precise boundary of 4096 bytes for Direct (<4KB) vs Indexed (>=4KB)", () => {
      // 0 bytes
      const html0 = renderToStaticMarkup(<SkillSizeBadge sizeBytes={0} />);
      expect(html0).toContain("&lt; 4 Ko : Direct");

      // 4095 bytes: Direct
      const html4095 = renderToStaticMarkup(<SkillSizeBadge sizeBytes={4095} />);
      expect(html4095).toContain("&lt; 4 Ko : Direct");
      expect(html4095).toContain("text-emerald-400");

      // 4096 bytes: Indexed
      const html4096 = renderToStaticMarkup(<SkillSizeBadge sizeBytes={4096} />);
      expect(html4096).toContain("4.0 Ko : Indexé");
      expect(html4096).toContain("text-blue-400");

      // 4097 bytes: Indexed
      const html4097 = renderToStaticMarkup(<SkillSizeBadge sizeBytes={4097} />);
      expect(html4097).toContain("4.0 Ko : Indexé");

      // 102400 bytes (100 KB)
      const html100KB = renderToStaticMarkup(<SkillSizeBadge sizeBytes={102400} />);
      expect(html100KB).toContain("100.0 Ko : Indexé");
    });

    it("3.3 handles massive 2.5 MB markdown content in getByteLength without stack overflow", () => {
      const massive2_5MB = "X".repeat(2_500_000);
      const byteLen = getByteLength(massive2_5MB);
      expect(byteLen).toBe(2_500_000);
    });
  });

  // --------------------------------------------------------------------------
  // DIMENSION 4: YAML FRONTMATTER & MARKDOWN PARSER STRESS-TESTING
  // --------------------------------------------------------------------------
  describe("Dimension 4: Frontmatter & Markdown Parser Stress-Testing", () => {
    it("4.1 handles missing or partial frontmatter fields with intelligent defaults", () => {
      const raw = `---
author: "Admin"
---
# Compétence par H1

Description tirée du premier paragraphe textuel.

Plus de texte.`;

      const parsed = parseMarkdownContent(raw);
      expect(parsed.name).toBe("Compétence par H1");
      expect(parsed.slug).toBe("competence-par-h1");
      expect(parsed.description).toBe("Description tirée du premier paragraphe textuel.");
      expect(parsed.tags).toEqual([]);
      expect(parsed.metadata.author).toBe("Admin");
    });

    it("4.2 handles malformed frontmatter (unclosed quotes, strange characters, invalid YAML)", () => {
      const malformedRaw = `---
name: "Skill with "quotes" inside"
slug: invalid slug with spaces & symbols !!!
description: 'Unclosed single quote description
tags: [tag1, "tag2", 'tag3', , unclosed]
unknown_field: 12345
---
Content body here.`;

      const parsed = parseMarkdownContent(malformedRaw);
      expect(parsed.name).toBeTruthy();
      expect(parsed.slug).toBe("invalid-slug-with-spaces-symbols");
      expect(parsed.tags).toContain("tag1");
      expect(parsed.tags).toContain("tag2");
      expect(parsed.tags).toContain("tag3");
      expect(parsed.content).toBe("Content body here.");
    });

    it("4.3 handles raw markdown with no frontmatter and no H1 heading by using filename fallback", () => {
      const raw = `Just some text without any headings or frontmatter.`;
      const parsed = parseMarkdownContent(raw, "my-custom-skill-guide.md");

      expect(parsed.name).toBe("my custom skill guide");
      expect(parsed.slug).toBe("my-custom-skill-guide");
      expect(parsed.description).toBe("Just some text without any headings or frontmatter.");
      expect(parsed.content).toBe(raw);
    });

    it("4.4 handles pure blank or whitespace markdown safely", () => {
      const parsed = parseMarkdownContent("   \n\n   ");
      expect(parsed.name).toBe("Nouvelle compétence");
      expect(parsed.slug).toBe("nouvelle-competence");
      expect(parsed.description).toBe("");
      expect(parsed.tags).toEqual([]);
    });

    it("4.5 generates clean, URL-safe slugs from complex multi-language names", () => {
      expect(slugify("   ")).toBe("");
      expect(slugify("---test---")).toBe("test");
      expect(slugify("Intelligence Artificielle & Système RAG / 2026")).toBe(
        "intelligence-artificielle-systeme-rag-2026",
      );
      expect(slugify("Docling + IBM & Docker: Fast-Track (v2.0)")).toBe(
        "docling-ibm-docker-fast-track-v2-0",
      );
      expect(slugify("Français: déjà, vôtre, naïve, Noël")).toBe(
        "francais-deja-votre-naive-noel",
      );
    });
  });

  // --------------------------------------------------------------------------
  // DIMENSION 5: SECURITY, XSS & SCRIPT INJECTION SAFETY
  // --------------------------------------------------------------------------
  describe("Dimension 5: Security, XSS & Script Tag Injection in Markdown", () => {
    it("5.1 parses and isolates markdown containing executable script tags and iframes", () => {
      const maliciousMarkdown = `---
name: "<script>alert('XSS_NAME')</script> Malicious Skill"
description: "<img src=x onerror=alert('XSS_DESC')>"
tags: ["<script>alert(1)</script>", "xss"]
---
# Directives avec Injection

<script>
  window.__xss_executed = true;
  document.cookie = "stolen";
</script>

<iframe src="javascript:alert('XSS_IFRAME')"></iframe>

<a href="javascript:alert('XSS_LINK')">Cliquez ici</a>

<svg onload="alert('XSS_SVG')"></svg>

Texte légitime de la compétence.`;

      const parsed = parseMarkdownContent(maliciousMarkdown);

      // Verify metadata parsing does not execute anything
      expect(parsed.name).toContain("Malicious Skill");
      expect(parsed.tags).toContain("<script>alert(1)</script>");
      expect(parsed.content).toContain("<script>");

      // Verify component rendering of card with malicious content does not break
      const html = renderToStaticMarkup(
        <SkillCard
          id="mal-1"
          name={parsed.name}
          slug={parsed.slug}
          description={parsed.description}
          tags={parsed.tags}
          sizeBytes={1000}
        />,
      );

      expect(typeof html).toBe("string");
      // React server markup encodes HTML entities in text nodes by default
      expect(html).toContain("&lt;script&gt;");
      expect(html).toContain("&lt;img src=x");
    });
  });

  // --------------------------------------------------------------------------
  // DIMENSION 6: SCALE & HIGH-DENSITY CARD GRIDS
  // --------------------------------------------------------------------------
  describe("Dimension 6: Scale & High-Density Card Grids", () => {
    it("6.1 renders 100 skills in catalog grid without performance degradation", () => {
      const bulkSkills: SkillItem[] = Array.from({ length: 100 }, (_, i) => ({
        id: `bulk-sk-${i + 1}`,
        name: `Sovereign Skill ${i + 1}`,
        slug: `sovereign-skill-${i + 1}`,
        description: `Description for sovereign skill number ${i + 1} with custom directives.`,
        tags: [`tag-${i % 10}`, i % 2 === 0 ? "even" : "odd"],
        sizeBytes: (i + 1) * 200,
        createdAt: dummyDate,
        updatedAt: dummyDate,
      }));

      const start = Date.now();
      const html = renderToStaticMarkup(<SkillLibraryOverlay skills={bulkSkills} />);
      const duration = Date.now() - start;

      expect(duration).toBeLessThan(5000); // 100 skills rendered in < 5s
      expect(html).toContain("Sovereign Skill 1");
      expect(html).toContain("Sovereign Skill 100");
      expect(html).toContain("tag-0");
      expect(html).toContain("tag-9");
      expect(html).toContain("even");
      expect(html).toContain("odd");
    });
  });

  // --------------------------------------------------------------------------
  // DIMENSION 7: COMPONENT INTERFACE & EVENT HANDLERS
  // --------------------------------------------------------------------------
  describe("Dimension 7: Component Interface & Event Callbacks", () => {
    it("7.1 renders card action triggers (Éditer, Prévisualiser, Supprimer) with correct callbacks", () => {
      const onEdit = vi.fn();
      const onPreview = vi.fn();
      const onDelete = vi.fn();

      const html = renderToStaticMarkup(
        <SkillCard
          id="sk-action-test"
          name="Action Test Skill"
          slug="action-test"
          description="Testing card action buttons"
          tags={["test"]}
          sizeBytes={2048}
          onEdit={onEdit}
          onPreview={onPreview}
          onDelete={onDelete}
        />,
      );

      expect(html).toContain("Action Test Skill");
      expect(html).toContain("Éditer");
      expect(html).toContain("Prévisualiser");
      expect(html).toContain("Supprimer");
      expect(html).toContain("data-testid=\"skill-card-sk-action-test\"");
    });

    it("7.2 handles empty description gracefully with French fallback placeholder", () => {
      const html = renderToStaticMarkup(
        <SkillCard
          id="sk-no-desc"
          name="No Desc Skill"
          slug="no-desc"
          description=""
          tags={[]}
          sizeBytes={100}
        />,
      );

      expect(html).toContain("Aucune description fournie");
    });

    it("7.3 renders modal close button with accessible aria-label", () => {
      const onClose = vi.fn();
      const html = renderToStaticMarkup(
        <SkillLibraryOverlay skills={standardSkills} onClose={onClose} />,
      );

      expect(html).toContain('aria-label="Fermer"');
      expect(html).toContain('aria-label="Téléverser un fichier Markdown"');
    });
  });
});
