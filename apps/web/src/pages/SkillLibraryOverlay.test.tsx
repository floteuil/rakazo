import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  parseMarkdownContent,
  SkillCard,
  SkillLibraryOverlay,
  SkillSizeBadge,
  slugify,
} from "./SkillLibraryOverlay";

// ============================================================================
// 4-TIER WEBUI TEST SUITE
// ============================================================================

describe("Skill Library WebUI & Overlays (4-Tier Suite)", () => {
  const sampleSkills = [
    {
      id: "sk-1",
      name: "TypeScript Pro",
      slug: "typescript-pro",
      description: "Directives TypeScript strictes",
      tags: ["dev", "typescript"],
      sizeBytes: 1500, // <4KB -> Direct
    },
    {
      id: "sk-2",
      name: "Docling Document Parser",
      slug: "docling-document-parser",
      description: "Guide complet IBM Docling pour documents complexes",
      tags: ["rag", "parser", "pdf"],
      sizeBytes: 8192, // 8KB -> Indexé
    },
    {
      id: "sk-3",
      name: "HDS Healthcare Security",
      slug: "hds-healthcare-security",
      description: "Sécurité des données de santé HDS",
      tags: ["securite", "sante", "hds"],
      sizeBytes: 2500, // <4KB -> Direct
    },
  ];

  // --------------------------------------------------------------------------
  // TIER 1: FEATURE COVERAGE (>=5 tests per feature)
  // --------------------------------------------------------------------------
  describe("Tier 1: Feature Coverage", () => {
    it("1.1 renders SkillLibraryOverlay with correct design tokens and French title", () => {
      const html = renderToStaticMarkup(<SkillLibraryOverlay skills={sampleSkills} />);
      expect(html).toContain("Bibliothèque de Compétences");
      expect(html).toContain("Gérez vos instructions spécialisées souveraines");
      expect(html).toContain("bg-[#141416]");
      expect(html).toContain("border-[#26262A]");
    });

    it("1.2 renders Drag & Drop upload container with French instructions and 2MB limit", () => {
      const html = renderToStaticMarkup(<SkillLibraryOverlay skills={sampleSkills} />);
      expect(html).toContain("Glissez un fichier Markdown (.md) ici");
      expect(html).toContain("Taille max : 2 Mo");
      expect(html).toContain("Support YAML Frontmatter &amp; Markdown brut");
    });

    it("1.3 renders direct injection badge (<4KB) with green styling", () => {
      const html = renderToStaticMarkup(<SkillSizeBadge sizeBytes={1500} />);
      expect(html).toContain("&lt; 4 Ko : Direct");
      expect(html).toContain("text-emerald-400");
    });

    it("1.4 renders indexed badge (>=4KB) with blue styling and calculated KB", () => {
      const html = renderToStaticMarkup(<SkillSizeBadge sizeBytes={8192} />);
      expect(html).toContain("8.0 Ko : Indexé");
      expect(html).toContain("text-blue-400");
    });

    it("1.5 renders tag filter pills with 'Tous' default and skill tags", () => {
      const html = renderToStaticMarkup(<SkillLibraryOverlay skills={sampleSkills} />);
      expect(html).toContain("Tous");
      expect(html).toContain("typescript");
      expect(html).toContain("rag");
      expect(html).toContain("securite");
    });

    it("1.6 renders action buttons (Éditer, Supprimer, Importer)", () => {
      const html = renderToStaticMarkup(<SkillLibraryOverlay skills={sampleSkills} />);
      expect(html).toContain("Éditer");
      expect(html).toContain("Supprimer");
      expect(html).toContain("+ Importer un skill (.md)");
    });
  });

  // --------------------------------------------------------------------------
  // TIER 2: BOUNDARY & CORNER CASES
  // --------------------------------------------------------------------------
  describe("Tier 2: Boundary & Corner Cases", () => {
    it("2.1 displays French empty state when no skills exist", () => {
      const html = renderToStaticMarkup(<SkillLibraryOverlay skills={[]} />);
      expect(html).toContain("Aucune compétence enregistrée pour le moment");
    });

    it("2.2 displays no results message when search query finds nothing", () => {
      const html = renderToStaticMarkup(
        <SkillLibraryOverlay skills={sampleSkills} searchQuery="non-existent-search" />,
      );
      expect(html).toContain("Aucun skill ne correspond à votre recherche");
    });

    it("2.3 filters catalog cards by selected tag", () => {
      const html = renderToStaticMarkup(
        <SkillLibraryOverlay skills={sampleSkills} selectedTag="securite" />,
      );
      expect(html).toContain("HDS Healthcare Security");
      expect(html).not.toContain("TypeScript Pro");
      expect(html).not.toContain("Docling Document Parser");
    });

    it("2.4 filters catalog cards by search query", () => {
      const html = renderToStaticMarkup(
        <SkillLibraryOverlay skills={sampleSkills} searchQuery="typescript" />,
      );
      expect(html).toContain("TypeScript Pro");
      expect(html).not.toContain("Docling Document Parser");
    });
  });

  // --------------------------------------------------------------------------
  // TIER 3: CROSS-FEATURE COMBINATIONS & MARKDOWN/YAML PARSER
  // --------------------------------------------------------------------------
  describe("Tier 3: Cross-Feature Combinations & Parser", () => {
    it("3.1 renders multiple cards in 3-column responsive grid", () => {
      const html = renderToStaticMarkup(<SkillLibraryOverlay skills={sampleSkills} />);
      expect(html).toContain("grid-cols-3");
      expect(html).toContain("skill-card-sk-1");
      expect(html).toContain("skill-card-sk-2");
      expect(html).toContain("skill-card-sk-3");
    });

    it("3.2 accurately parses YAML frontmatter with tags list and metadata", () => {
      const raw = `---
name: "FastAPI Modular Architect"
slug: "fastapi-modular-architect"
description: "Expert backend FastAPI et SQLAlchemy 2.0"
tags:
  - fastapi
  - python
  - backend
author: "Groupe Floteuil"
---
# Directives FastAPI

Utiliser les modèles Pydantic v2 et asyncpg.`;

      const parsed = parseMarkdownContent(raw);
      expect(parsed.name).toBe("FastAPI Modular Architect");
      expect(parsed.slug).toBe("fastapi-modular-architect");
      expect(parsed.description).toBe("Expert backend FastAPI et SQLAlchemy 2.0");
      expect(parsed.tags).toEqual(["fastapi", "python", "backend"]);
      expect(parsed.content).toContain("# Directives FastAPI");
      expect(parsed.metadata.author).toBe("Groupe Floteuil");
    });

    it("3.3 parses raw markdown without frontmatter using H1 and paragraph fallback", () => {
      const raw = `# Guide de Développement Docker

Ce guide explique comment créer des Dockerfile multi-stages optimisés pour la production.

## Directives
- Utiliser Alpine ou Distroless`;

      const parsed = parseMarkdownContent(raw, "docker-guide.md");
      expect(parsed.name).toBe("Guide de Développement Docker");
      expect(parsed.slug).toBe("guide-de-developpement-docker");
      expect(parsed.description).toContain("Ce guide explique comment créer des Dockerfile");
      expect(parsed.content).toBe(raw);
    });

    it("3.4 converts strings into URL-safe slugs", () => {
      expect(slugify("Compétence Élite / RAG & Hybride !")).toBe("competence-elite-rag-hybride");
      expect(slugify("  TypeScript & Next.js 15+  ")).toBe("typescript-next-js-15");
    });
  });

  // --------------------------------------------------------------------------
  // TIER 4: REAL-WORLD SCENARIOS
  // --------------------------------------------------------------------------
  describe("Tier 4: Real-World Scenarios", () => {
    it("4.1 renders real-world enterprise skill cards with tags and badges", () => {
      const html = renderToStaticMarkup(
        <div className="flex flex-col gap-4">
          <SkillCard
            id="docling-1"
            name="Docling Document Parser"
            slug="docling-document-parser"
            description="Expert en extraction structurée PDF/DOCX"
            tags={["rag", "parser", "ibm"]}
            sizeBytes={12000}
          />
          <SkillCard
            id="hds-1"
            name="HDS Healthcare Security"
            slug="hds-healthcare-security"
            description="Sécurité HDS et chiffrement AES-256"
            tags={["hds", "rgpd", "sante"]}
            sizeBytes={2800}
          />
        </div>,
      );

      expect(html).toContain("Docling Document Parser");
      expect(html).toContain("11.7 Ko : Indexé");
      expect(html).toContain("#ibm");
      expect(html).toContain("HDS Healthcare Security");
      expect(html).toContain("&lt; 4 Ko : Direct");
      expect(html).toContain("#rgpd");
    });
  });
});
