import { MAX_ACTIVE_SKILLS_PER_BOT, SOVEREIGN_SKILLS_CATALOG } from "@rakazo/contracts";
import { describe, expect, it } from "vitest";
import {
  expandQueryWithBilingualFacets,
  recommendSkillsForBot,
  searchUnifiedSkillCatalog,
} from "./skill-advisor.js";
import {
  getSovereignSkillContent,
  getSovereignSkillFull,
  getUnifiedSkillBySlug,
  loadUnifiedSkillCatalogIndex,
} from "./sovereign-skills-store.js";

describe("Unified 3,538-Skill Native Library & OmniRoute AI Skill Advisor", () => {
  it("loads all 3,538 unified skills across 11 French categories and preserves all 379 starter slugs", () => {
    const index = loadUnifiedSkillCatalogIndex();
    expect(index.totalSkills).toBeGreaterThanOrEqual(3536);
    expect(index.skills.length).toBe(index.totalSkills);
    expect(index.categories).toHaveLength(11);

    // Every single one of the 379 Sovereign Starter skills must resolve cleanly
    for (const starter of SOVEREIGN_SKILLS_CATALOG) {
      const unified = getUnifiedSkillBySlug(starter.slug);
      expect(unified, `Missing starter slug ${starter.slug}`).toBeDefined();
      expect(unified?.isStarter).toBe(true);
    }

    // Verify lazy category-shard decompression works across all 11 categories
    for (const cat of index.categories) {
      expect(cat.count).toBeGreaterThan(50);
      const sample = index.skills.find((s) => s.categoryId === cat.id && !s.isStarter);
      expect(sample).toBeDefined();
      const full = getSovereignSkillFull(sample!.slug);
      expect(full).toBeDefined();
      expect(full!.content.length).toBeGreaterThan(20);
      expect(getSovereignSkillContent(sample!.id)?.length).toBeGreaterThan(20);
    }
  });

  it("contains zero confidential paths, private tokens, or real API keys across catalog metadata", () => {
    const index = loadUnifiedSkillCatalogIndex();
    const forbiddenRegex =
      /(?:\/Users\/[A-Za-z0-9._-]+\/|\bsk-(?:proj-|live-|srv-)[A-Za-z0-9_-]{20,}|\bghp_[A-Za-z0-9]{25,}|\bAIza[0-9A-Za-z_-]{30,})/i;

    for (const skill of index.skills) {
      const blob = `${skill.name}\n${skill.description}\n${skill.tags.join(",")}`;
      expect(forbiddenRegex.test(blob), `Leak in skill ${skill.slug}`).toBe(false);
    }
  });

  it("performs fast bilingual FR->EN manual search, category filtering, and offensive exclusion by default", () => {
    // Warm up BM25 engine once, then measure interactive query latency
    searchUnifiedSkillCatalog({ query: "seo", limit: 5 });

    const start = performance.now();
    const blogRes = searchUnifiedSkillCatalog({
      query: "rédaction articles de blog référencement",
      limit: 25,
    });
    const elapsedMs = performance.now() - start;

    expect(elapsedMs).toBeLessThan(80);
    expect(blogRes.total).toBeGreaterThan(20);
    expect(blogRes.items.length).toBe(25);
    // Must not expose offensive pentest skills by default
    expect(blogRes.items.every((item) => item.risk === "safe" && !item.requiresOptIn)).toBe(true);

    const topSlugsAndNames = blogRes.items
      .map((i) => `${i.slug} ${i.name}`.toLowerCase())
      .join(" ");
    expect(
      topSlugsAndNames.includes("seo") ||
        topSlugsAndNames.includes("copywriting") ||
        topSlugsAndNames.includes("blog"),
    ).toBe(true);

    // Batch onlySlugs lookup for UI resolution
    const batch = searchUnifiedSkillCatalog({
      onlySlugs: ["copywriting", "docs-as-marketing", "faq-generator"],
    });
    expect(batch.items.map((i) => i.slug)).toEqual([
      "copywriting",
      "docs-as-marketing",
      "faq-generator",
    ]);
  });

  it("curates <= 20 skills via OmniRoute primary engine, strips hallucinated/offensive slugs, and parses <thought> blocks", async () => {
    const index = loadUnifiedSkillCatalogIndex();
    const offensiveSample = index.skills.find((s) => s.requiresOptIn);
    expect(offensiveSample).toBeDefined();

    const manyValidSlugs = index.skills
      .filter((s) => !s.requiresOptIn)
      .slice(0, 26)
      .map((s) => s.slug);

    const res = await recommendSkillsForBot(
      {
        goal: "Cet agent va être spécialisé dans la rédaction d'articles de blog SEO et leur publication sur WordPress.",
        botName: "Plume Blog",
        botTitle: "Rédacteur SEO",
        maxSkills: 20,
        engine: "omniroute",
      },
      {
        llmCompleteFn: async ({ preferredEngine }) => {
          expect(preferredEngine).toBe("omniroute");
          const fakeSelections = [
            {
              slug: "hallucinated-non-existent-skill-xyz",
              groupFr: "Invention",
              reasonFr: "Ne doit jamais passer la validation.",
            },
            {
              slug: offensiveSample!.slug,
              groupFr: "Offensif non sollicité",
              reasonFr: "Doit être filtré car requiresOptIn=true.",
            },
            ...manyValidSlugs.map((slug, idx) => ({
              slug,
              groupFr: idx < 10 ? "Pôle Rédaction & Copywriting" : "Pôle SEO & Publication",
              reasonFr: `Apporte une brique méthodologique clé (${slug}).`,
            })),
          ];
          return {
            engineUsed: "omniroute",
            resolvedModel: "gemini/gemini-2.5-flash",
            rawContent: `<thought>Analysons les 90 candidats...</thought>\n\`\`\`json\n${JSON.stringify(
              {
                summaryFr:
                  "Architecture éditoriale équilibrée entre copywriting persuasif, SEO longue traîne et publication structurée.",
                facetsExplored: ["Copywriting", "SEO Longue Traîne", "Publication CMS"],
                selections: fakeSelections,
              },
            )}\n\`\`\``,
          };
        },
      },
    );

    expect(res.engineUsed).toBe("omniroute");
    expect(res.resolvedModel).toBe("gemini/gemini-2.5-flash");
    expect(res.totalCatalogScanned).toBeGreaterThanOrEqual(3536);
    // Strictly capped at 20 even though 26 valid slugs were returned by the LLM
    expect(res.recommended.length).toBe(MAX_ACTIVE_SKILLS_PER_BOT);
    expect(
      res.recommended.some((r) => r.slug === "hallucinated-non-existent-skill-xyz"),
    ).toBe(false);
    expect(res.recommended.some((r) => r.slug === offensiveSample!.slug)).toBe(false);
  });

  it("falls back cleanly to diversified deterministic BM25 when inference gateways are offline", async () => {
    const res = await recommendSkillsForBot(
      {
        goal: "Développeur full-stack React Next.js TypeScript avec tests automatisés Playwright et base PostgreSQL",
        maxSkills: 14,
      },
      {
        llmCompleteFn: async () => {
          throw new Error("Simulated gateway timeout");
        },
      },
    );

    expect(res.engineUsed).toBe("deterministic_bm25");
    expect(res.recommended.length).toBe(14);
    expect(res.recommended.length).toBeLessThanOrEqual(MAX_ACTIVE_SKILLS_PER_BOT);
    expect(res.facetsExplored.length).toBeGreaterThan(0);
    for (const rec of res.recommended) {
      expect(rec.reasonFr.length).toBeGreaterThan(15);
      expect(rec.groupFr.length).toBeGreaterThan(3);
    }

    const { facetsExplored } = expandQueryWithBilingualFacets(
      "Rédaction d'articles de blog SEO sur WordPress",
    );
    expect(facetsExplored.length).toBeGreaterThanOrEqual(2);
  });
});
