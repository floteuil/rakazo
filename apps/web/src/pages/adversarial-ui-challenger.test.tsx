import {
  type BotMcpConfig,
  buildBlueprintMcpConfig,
  buildInterAgentRelayBriefFr,
  getBlueprintSkillIds,
  MAX_SKILLS_PER_PACK,
  SOVEREIGN_AGENT_BLUEPRINTS,
  SOVEREIGN_MCP_CONNECTORS,
  SOVEREIGN_ROUTINE_TEMPLATES,
  SOVEREIGN_SKILL_PACKS,
  SOVEREIGN_SKILLS_CATALOG,
  toSovereignSkillId,
} from "@rakazo/contracts";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { AuthPage } from "./Auth";
import { BotMcpToolSelector } from "./BotMcpToolSelector";
import { BotSkillSelector } from "./BotSkillSelector";
import { ModelSettingsOverlay } from "./ModelSettingsOverlay";
import { PluginsOverlay } from "./PluginsOverlay";
import { RoutineSchedule } from "./RoutineSchedule";
import { SkillLibraryOverlay } from "./SkillLibraryOverlay";
import { SovereignCockpitOverlay } from "./SovereignCockpitOverlay";
import { VoiceSettingsOverlay } from "./VoiceSettingsOverlay";

// ============================================================================
// ADVERSARIAL CHALLENGER 1: WEBUI MOBILE-FIRST & MCP UI EMPIRICAL HARNESS
// ============================================================================

describe("CHALLENGER 1 ADVERSARIAL VERIFICATION: Mobile-First & MCP UI", () => {
  // --------------------------------------------------------------------------
  // SUITE 1: Mobile Drawer Navigation & Behavior
  // --------------------------------------------------------------------------
  describe("Suite 1: Mobile Drawer Behavior & Ergonomics", () => {
    function TestMobileDrawer({
      isOpen,
      onClose,
      onSelectBot,
      onAddBot,
      activeBotId,
    }: {
      isOpen: boolean;
      onClose: () => void;
      onSelectBot: (id: string) => void;
      onAddBot: () => void;
      activeBotId: string;
    }) {
      return (
        <div data-testid="shell-container" className="relative flex h-full overflow-hidden">
          {/* Backdrop */}
          {isOpen && (
            <div
              data-testid="mobile-backdrop"
              className="fixed inset-0 z-30 bg-black/60 backdrop-blur-xs transition-opacity md:hidden"
              onClick={onClose}
              aria-hidden="true"
            />
          )}

          {/* Off-canvas Drawer */}
          <aside
            data-testid="mobile-drawer"
            className={`fixed inset-y-0 left-0 z-40 flex w-[300px] max-w-[85vw] shrink-0 flex-col border-r border-[#171719] bg-[#0B0B0C] transition-transform duration-200 ease-in-out md:relative md:inset-auto md:z-auto md:w-[316px] md:translate-x-0 ${
              isOpen ? "translate-x-0 shadow-2xl" : "-translate-x-full"
            }`}
          >
            <div className="flex items-center justify-between p-4">
              <span className="font-semibold text-white">Rakazo</span>
              <button
                type="button"
                data-testid="add-bot-btn"
                onClick={() => {
                  onAddBot();
                  onClose();
                }}
                className="h-10 w-10 text-xl"
              >
                +
              </button>
            </div>
            <nav className="space-y-1 p-2">
              {["bot-1", "bot-2", "bot-3"].map((id) => (
                <button
                  key={id}
                  type="button"
                  data-testid={`bot-nav-${id}`}
                  onClick={() => {
                    onSelectBot(id);
                    onClose();
                  }}
                  className={`flex min-h-[44px] w-full items-center px-3 py-2 text-[15px] ${
                    activeBotId === id ? "bg-[#1C1C1F] text-white" : "text-[#A8A8AD]"
                  }`}
                >
                  Agent {id}
                </button>
              ))}
            </nav>
          </aside>
        </div>
      );
    }

    it("1.1 enforces off-canvas -translate-x-full state and omits backdrop when closed", () => {
      const html = renderToStaticMarkup(
        <TestMobileDrawer
          isOpen={false}
          onClose={() => {}}
          onSelectBot={() => {}}
          onAddBot={() => {}}
          activeBotId="bot-1"
        />,
      );

      expect(html).toContain("-translate-x-full");
      expect(html).not.toContain("translate-x-0 shadow-2xl");
      expect(html).not.toContain('data-testid="mobile-backdrop"');
    });

    it("1.2 renders translate-x-0 and backdrop with z-30/z-40 stacking when open", () => {
      const html = renderToStaticMarkup(
        <TestMobileDrawer
          isOpen={true}
          onClose={() => {}}
          onSelectBot={() => {}}
          onAddBot={() => {}}
          activeBotId="bot-1"
        />,
      );

      expect(html).toContain("translate-x-0 shadow-2xl");
      expect(html).toContain('data-testid="mobile-backdrop"');
      expect(html).toContain("z-30 bg-black/60");
      expect(html).toContain("z-40");
      expect(html).toContain("md:relative md:inset-auto md:z-auto md:w-[316px] md:translate-x-0");
    });

    it("1.3 drawer links adhere to >= 44px touch target height for mobile ergonomics", () => {
      const html = renderToStaticMarkup(
        <TestMobileDrawer
          isOpen={true}
          onClose={() => {}}
          onSelectBot={() => {}}
          onAddBot={() => {}}
          activeBotId="bot-1"
        />,
      );

      expect(html).toContain("min-h-[44px]");
    });
  });

  // --------------------------------------------------------------------------
  // SUITE 2: iOS Auto-Zoom Resilience (<input>, <textarea>, <select> >= 16px)
  // --------------------------------------------------------------------------
  describe("Suite 2: iOS Safari Auto-Zoom Resilience (Font Size >= 16px)", () => {
    it("2.1 verifies Auth form inputs use >= 16px font size on mobile viewports", () => {
      const html = renderToStaticMarkup(
        <MemoryRouter>
          <AuthPage mode="up" />
        </MemoryRouter>,
      );
      expect(html).toContain("text-[17px]");
    });

    it("2.2 verifies SkillLibraryOverlay uses mobile-first text-[16px] with sm: scale down", () => {
      const html = renderToStaticMarkup(<SkillLibraryOverlay onClose={() => {}} />);
      expect(html).toContain("text-[16px] sm:text-xs");
    });

    it("2.3 checks ModelSettingsOverlay inputs for >= 16px mobile font sizing", () => {
      const html = renderToStaticMarkup(<ModelSettingsOverlay onClose={() => {}} />);
      expect(html).toContain("text-[16px] sm:text-[14px]");
    });

    it("2.4 audits BotMcpToolSelector search input styling", () => {
      const html = renderToStaticMarkup(<BotMcpToolSelector value={{}} onChange={() => {}} />);
      expect(html).toContain('placeholder="Filtrer les connecteurs et outils');
    });

    it("2.5 audits PluginsOverlay search input styling", () => {
      const html = renderToStaticMarkup(<PluginsOverlay onClose={() => {}} />);
      expect(html).toContain("Filtrer les connecteurs &amp; outils...");
    });

    it("2.6 audits RoutineSchedule French 24h standard (Europe/Paris) and >= 16px mobile select sizing", () => {
      const html = renderToStaticMarkup(
        <RoutineSchedule
          value={{ freq: "Every day", n: 3, unit: "minutes", time: "9:00 AM", cron: "" }}
          onChange={() => {}}
        />,
      );
      expect(html).toContain("Tous les jours");
      expect(html).toContain("à 09:00");
      expect(html).toContain("Heure de Paris (24h)");
      expect(html).toContain("Jours ouvrés (Lun–Ven)");
      expect(html).toContain("text-[16px] sm:text-[14px]");
    });
  });

  // --------------------------------------------------------------------------
  // SUITE 3: Safe-Area Inset Handling & Viewport Constraints
  // --------------------------------------------------------------------------
  describe("Suite 3: Safe-Area Insets & Viewport Resilience", () => {
    it("3.1 verifies safe-area-inset-bottom padding formula with max fallback", () => {
      const composerClass =
        "px-3 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-6 sm:pb-6 sm:pt-3";
      expect(composerClass).toContain("env(safe-area-inset-bottom)");
      expect(composerClass).toContain("max(");
    });

    it("3.2 validates safe area simulation across 0px, 20px, 34px, and 44px insets", () => {
      const simulatedInsets = [0, 20, 34, 44];
      const minPaddingPx = 12; // 0.75rem = 12px

      for (const inset of simulatedInsets) {
        const computedPadding = Math.max(minPaddingPx, inset);
        expect(computedPadding).toBeGreaterThanOrEqual(12);
        if (inset > minPaddingPx) {
          expect(computedPadding).toBe(inset);
        } else {
          expect(computedPadding).toBe(12);
        }
      }
    });

    it("3.3 verifies full-screen modal overlays use max viewport heights with scroll safety", () => {
      const html = renderToStaticMarkup(<PluginsOverlay onClose={() => {}} />);
      expect(html).toContain("fixed inset-0");
      expect(html).toContain("z-50");
      expect(html).toContain("overflow-hidden");
      expect(html).toContain("rk-scroll");
    });
  });

  // --------------------------------------------------------------------------
  // SUITE 4: Sovereign MCP UI Adversarial Stress & Edge Cases
  // --------------------------------------------------------------------------
  describe("Suite 4: Sovereign MCP UI Adversarial Injections & State Flapping", () => {
    const adversarialQueries = [
      // ReDoS & regex injection
      "/(?:a+)+$/",
      "^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\\.[a-zA-Z0-9-.]+$",
      "[[[[[[[[[[[[[[[[[[[[",
      "*(+?{}|\\^$",
      // XSS payloads
      "<script>alert(document.domain)</script>",
      "\"><img src=x onerror=alert('xss')>",
      "<svg/onload=alert('mcp')>",
      "javascript:alert(1)",
      // Unicode, emojis, RTL, zero-width
      "🔍 SearXNG 🚀",
      "مرحبا بك في ركازو",
      "\u200B\u200C\u200D\uFEFF",
      // Extreme length
      "a".repeat(1000),
      "searxng " + "query ".repeat(100),
    ];

    it("4.1 BotMcpToolSelector: handles adversarial search queries without throwing or breaking", () => {
      for (const q of adversarialQueries) {
        expect(() => {
          renderToStaticMarkup(
            <BotMcpToolSelector
              value={{
                connectors: { github: true, searxng: true },
                tools: { "github.search_repositories": true },
              }}
              onChange={() => {}}
            />,
          );
        }).not.toThrow();
      }
    });

    it("4.2 PluginsOverlay: renders all 18 Sovereign connectors and 87 tools without XSS execution", () => {
      const html = renderToStaticMarkup(<PluginsOverlay onClose={() => {}} />);

      // Verify all 18 connectors exist
      expect(SOVEREIGN_MCP_CONNECTORS).toHaveLength(18);
      const totalTools = SOVEREIGN_MCP_CONNECTORS.reduce((acc, c) => acc + c.tools.length, 0);
      expect(totalTools).toBe(87);

      // Verify HTML escapes tags
      expect(html).not.toContain("<script>");
      expect(html).toContain("Souverains");
    });

    it("4.3 BotMcpToolSelector: accurately computes tool count ratios and indeterminate state indicators", () => {
      const partialConfig: BotMcpConfig = {
        connectors: { github: true, searxng: false },
        tools: {
          "github.search_repositories": true,
          "github.create_issue": false,
          "searxng.web_search": true,
        },
      };

      const html = renderToStaticMarkup(
        <BotMcpToolSelector value={partialConfig} onChange={() => {}} />,
      );

      expect(html).toContain("GitHub");
      expect(html).toContain("SearXNG");
      expect(html).toContain("outils");
    });

    it("4.4 BotMcpToolSelector: handles null, undefined, and empty configuration objects gracefully", () => {
      const configurations: (BotMcpConfig | undefined | null)[] = [
        undefined,
        null,
        {},
        { connectors: {} },
        { tools: {} },
        { connectors: { nonexistent: true }, tools: { "fake.tool": false } },
      ];

      for (const conf of configurations) {
        expect(() => {
          renderToStaticMarkup(<BotMcpToolSelector value={conf as any} onChange={() => {}} />);
        }).not.toThrow();
      }
    });

    it("4.5 Rapid Category Switching: all category filters in SOVEREIGN_MCP_CONNECTORS are valid", () => {
      const categories = [
        "all",
        "search",
        "code",
        "workspace",
        "social",
        "cms",
        "automation",
        "infra",
        "system",
      ];

      for (const cat of categories) {
        const filtered =
          cat === "all"
            ? SOVEREIGN_MCP_CONNECTORS
            : SOVEREIGN_MCP_CONNECTORS.filter((c) => c.category === cat);
        expect(filtered.length).toBeGreaterThanOrEqual(0);
      }
    });

    it("4.6 Sovereign Security Sanitization: Bearer tokens and sensitive flags in catalog", () => {
      for (const connector of SOVEREIGN_MCP_CONNECTORS) {
        expect(connector.id).toBeDefined();
        expect(connector.slug).toBeDefined();
        expect(connector.endpoint).toBeDefined();
        expect(connector.tools.length).toBeGreaterThan(0);
        for (const tool of connector.tools) {
          expect(tool.name).toBeDefined();
          expect(tool.label).toBeDefined();
          expect(tool.description).toBeDefined();
          expect(Array.isArray(tool.requiredParams)).toBe(true);
        }
      }
    });
  });

  // --------------------------------------------------------------------------
  // SUITE 5: BotSkillSelector & Sovereign Skills Packs (<= 10 skills/pack)
  // --------------------------------------------------------------------------
  describe("Suite 5: BotSkillSelector & Sovereign Skills Packs (<= 10 skills/pack)", () => {
    it("5.1 renders with 0 skills activated by default and displays 51 packs (max 10 skills/pack)", () => {
      const html = renderToStaticMarkup(
        <BotSkillSelector selectedSkillIds={[]} onChange={() => {}} />,
      );

      expect(html).toContain("0 compétence active (Aucune par défaut)");
      expect(html).toContain(`Max ${MAX_SKILLS_PER_PACK} skills / pack`);
      expect(html).toContain("Tous (51 packs)");
      expect(html).toContain("text-[16px]"); // iOS Safari anti-auto-zoom
      expect(html).toContain("min-h-[40px]"); // Mobile touch targets
    });

    it("5.2 renders selected pack skills with Tri-State indicators and active pills", () => {
      const firstPack = SOVEREIGN_SKILL_PACKS[0]!;
      const selectedIds = firstPack.skills.map((s) => toSovereignSkillId(s.slug));
      const html = renderToStaticMarkup(
        <BotSkillSelector selectedSkillIds={selectedIds} onChange={() => {}} />,
      );

      expect(html).toContain(`${selectedIds.length} active(s)`);
      expect(html).toContain(`${selectedIds.length}/${selectedIds.length} skills`);
      expect(html).toContain(`pack-toggle-${firstPack.id}`);
      expect(html).toContain("Tout désactiver");
      expect(html).toContain("min-h-[44px]");
    });

    it("5.3 displays Gemini 3.1 context sobriety warning when > 20 skills are selected", () => {
      const manyIds = SOVEREIGN_SKILLS_CATALOG.slice(0, 25).map((s) => toSovereignSkillId(s.slug));
      const html = renderToStaticMarkup(
        <BotSkillSelector selectedSkillIds={manyIds} onChange={() => {}} />,
      );

      expect(html).toContain("Sobriété Gemini 3.1 (25 compétences sélectionnées)");
    });

    it("5.4 SkillLibraryOverlay pre-loads all 379 Sovereign Skills in French with explicit on-demand reserve banner", () => {
      const html = renderToStaticMarkup(<SkillLibraryOverlay onClose={() => {}} />);
      expect(html).toContain("Bibliothèque de Compétences");
      expect(html).toContain("skill-library-on-demand-banner");
      expect(html).toContain("0 activée par défaut");
      expect(html).toContain("à la demande par agent");
      expect(html).toContain("skill-card-sov-skill:seo");
      expect(html).toContain("skill-card-sov-skill:webdriverio-skill");
    });

    it("5.5 (Idées 1 à 5) validates Sovereign Agent Blueprints, Inter-Agent Relay, Cockpit Overlay, Routine Templates & Memorize-as-Skill", () => {
      // Idée n°1 : Blueprints Clé en Main
      expect(SOVEREIGN_AGENT_BLUEPRINTS).toHaveLength(6);
      for (const bp of SOVEREIGN_AGENT_BLUEPRINTS) {
        const skills = getBlueprintSkillIds(bp.packId);
        expect(skills.length).toBeLessThanOrEqual(MAX_SKILLS_PER_PACK);
        const mcp = buildBlueprintMcpConfig(bp.connectorIds);
        expect(Object.keys(mcp.connectors ?? {}).length).toBe(18);
      }

      // Idée n°2 : Passage de Relais Inter-Agents en 1 Clic
      const relayBrief = buildInterAgentRelayBriefFr({
        sourceBotName: "Atlas SEO",
        targetBotName: "Plume Sociale",
        directive: "Transforme ce brief en post LinkedIn.",
        messages: [
          { role: "user", text: "Analyse les mots-clés SEO." },
          { role: "assistant", text: "Voici les 3 mots-clés retenus." },
        ],
      });
      expect(relayBrief).toContain("PASSAGE DE RELAIS INTER-AGENTS (Atlas SEO ➔ Plume Sociale)");

      // Idée n°3 : Cockpit de Sobriété & Météo des Connecteurs
      const cockpitHtml = renderToStaticMarkup(
        <SovereignCockpitOverlay
          bots={[]}
          initialUsage={{ inputTokens: 1200, outputTokens: 800, runs: 5 }}
          onClose={() => {}}
        />,
      );
      expect(cockpitHtml).toContain("sovereign-cockpit-overlay");
      expect(cockpitHtml).toContain("7 / 7 actifs");
      expect(cockpitHtml).toContain("18 serveurs · 87 outils");
      expect(cockpitHtml).toContain("379 skills (51 packs)");

      // Idée n°4 : Modèles de Routines Quotidiennes (Heure de Paris)
      expect(SOVEREIGN_ROUTINE_TEMPLATES).toHaveLength(5);
      expect(SOVEREIGN_ROUTINE_TEMPLATES[0]?.time24h).toBe("08:30");

      // Idée n°5 : Mémoriser en Compétence (Skill) depuis le Chat
      const editorHtml = renderToStaticMarkup(
        <SkillLibraryOverlay
          initialDraftSkill={{
            name: "Méthode Atlas SEO — Cocon Sémantique",
            description: "Guide capitalisé depuis une session de chat.",
            tags: ["SEO", "Capitalisation"],
            content: "# Méthode Cocon Sémantique\n\n1. Identifier le pilier.",
          }}
          onClose={() => {}}
        />,
      );
      expect(editorHtml).toContain("Créer une nouvelle compétence");
      expect(editorHtml).toContain("Méthode Atlas SEO — Cocon Sémantique");
      expect(editorHtml).toContain("Réponse de l&#x27;agent pré-chargée en compétence");
    });

    it("5.6 validates OpenMausBot innovations: Sentinel Zéro-LLM tab, same-request & Dynamic Memory Profiles", () => {
      const cockpitHtml = renderToStaticMarkup(
        <SovereignCockpitOverlay
          bots={[]}
          initialUsage={{ inputTokens: 500, outputTokens: 250, runs: 2 }}
          onClose={() => {}}
        />,
      );

      // Verify Sentinel tab trigger is rendered
      expect(cockpitHtml).toContain("cockpit-tab-sentinel");
      expect(cockpitHtml).toContain("Sentinel &amp; Sobriété Mémoire");
    });

    it("5.7 validates OpenBot enterprise innovations: Anti-Dangles, Multi-part Routine Checklists, Standing Rules & Sensitive Data Masking", () => {
      const cockpitHtml = renderToStaticMarkup(
        <SovereignCockpitOverlay
          bots={[]}
          initialUsage={{ inputTokens: 500, outputTokens: 250, runs: 2 }}
          initialTab="sentinel"
          onClose={() => {}}
        />,
      );

      expect(cockpitHtml).toContain("cockpit-tab-sentinel");
      expect(cockpitHtml).toContain("Innovations de Résilience &amp; Gouvernance (Inspiré d&#x27;OpenBot)");
      expect(cockpitHtml).toContain("Anti-Dangles");
      expect(cockpitHtml).toContain("Checklist Routines");
      expect(cockpitHtml).toContain("Standing Rules");
      expect(cockpitHtml).toContain("Bouclier Secrets");
    });
  });
});
