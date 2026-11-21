import { MAX_ACTIVE_SKILLS_PER_BOT } from "@rakazo/contracts";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { BotSkillSelector } from "./BotSkillSelector";
import { SkillAdvisorModal } from "./SkillAdvisorModal";

describe("SkillAdvisorModal & Unified BotSkillSelector UI", () => {
  it("renders BotSkillSelector with prominent AI Skill Advisor button, 20-skill ceiling badge, and 3,538 catalog tab", () => {
    const html = renderToStaticMarkup(
      <BotSkillSelector
        selectedSkillIds={[]}
        onChange={() => {}}
        botName="Rédacteur Blog"
        botTitle="Expert Éditorial SEO"
      />,
    );

    expect(html).toContain("open-skill-advisor-btn");
    expect(html).toContain("Conseiller &amp; Activer par IA");
    expect(html).toContain(`Plafond ${MAX_ACTIVE_SKILLS_PER_BOT} / agent`);
    expect(html).toContain("Catalogue Complet (3 538)");
    expect(html).toContain("Packs Métier (51)");
    expect(html).toContain("0 compétence active (Aucune par défaut)");
  });

  it("renders SkillAdvisorModal with OmniRoute ($0) primary engine, mobile-first 16px inputs, >=44px targets, and grouped French recommendations", () => {
    const html = renderToStaticMarkup(
      <SkillAdvisorModal
        isOpen={true}
        onClose={() => {}}
        botName="Atlas Blog"
        botTitle="Rédacteur d'articles de blog SEO"
        currentSkillIds={["sov-skill:seo"]}
        onApplySkills={() => {}}
        initialResult={{
          recommended: [
            {
              id: "sov-skill:copywriting",
              slug: "copywriting",
              name: "Copywriting & Rédaction orientée Conversion",
              description: "Structurer des accroches et articles engageants.",
              categoryId: "11_Divers_et_Autres",
              categoryLabel: "Méta-Skills, Ingénierie & Expertise Métier",
              tags: ["copywriting", "blog"],
              risk: "safe",
              requiresOptIn: false,
              isStarter: true,
              sizeBytes: 3800,
              groupFr: "Rédaction Éditoriale & Copywriting",
              reasonFr: "Indispensable pour rédiger des introductions captivantes et structurer l'argumentaire.",
            },
            {
              id: "sov-skill:seo",
              slug: "seo",
              name: "Audit & Stratégie SEO Globale",
              description: "Optimisation on-page, intentions de recherche et balisage.",
              categoryId: "02_Developpement_Web",
              categoryLabel: "Développement Web, React, Next.js & CMS",
              tags: ["seo", "serp"],
              risk: "safe",
              requiresOptIn: false,
              isStarter: true,
              sizeBytes: 6400,
              groupFr: "Référencement Naturel (SEO / AEO)",
              reasonFr: "Garantit l'alignement avec l'intention de recherche et le maillage interne.",
            },
          ],
          summaryFr:
            "Combinaison ciblée alliant plume éditoriale persuasive et optimisation SEO technique.",
          facetsExplored: ["Copywriting", "SEO Longue Traîne"],
          totalCatalogScanned: 3538,
          candidatesEvaluated: 90,
          engineUsed: "omniroute",
          resolvedModel: "gemini/gemini-2.5-flash",
          durationMs: 1420,
        }}
      />,
    );

    expect(html).toContain("skill-advisor-modal");
    expect(html).toContain("Conseiller IA de Compétences");
    expect(html).toContain("OmniRoute ($0)");
    expect(html).toContain("text-[16px]");
    expect(html).toContain("min-h-[44px]");
    expect(html).toContain("OmniRoute (gemini/gemini-2.5-flash)");
    expect(html).toContain("Rédaction Éditoriale &amp; Copywriting");
    expect(html).toContain("Déjà active");
    expect(html).toContain("Fusionner avec l&#x27;existant (max 20)");
    expect(html).toContain("Activer ces 2 compétences");
  });
});
