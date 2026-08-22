import {
  type BotMcpConfig,
  SOVEREIGN_MCP_CONNECTORS,
} from "@rakazo/contracts";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  BotMcpToolSelector,
  getAllActiveMcpConfig,
  getAllDisabledMcpConfig,
  getRecommendedMcpConfig,
  isToolActive,
} from "./BotMcpToolSelector";

describe("BotMcpToolSelector Component & MCP Assignment Suite", () => {
  describe("Static Catalog & Helper Functions", () => {
    it("renders all 8 Sovereign MCP Connectors from contracts", () => {
      expect(SOVEREIGN_MCP_CONNECTORS).toHaveLength(8);
      const ids = SOVEREIGN_MCP_CONNECTORS.map((c) => c.id);
      expect(ids).toEqual([
        "searxng_scraperr",
        "github",
        "notion",
        "postiz",
        "wordpress_novamira",
        "n8n",
        "cloudflare",
        "system_platform",
      ]);
    });

    it("getAllActiveMcpConfig enables all connectors and all 40 tools", () => {
      const config = getAllActiveMcpConfig();
      expect(Object.keys(config.connectors || {})).toHaveLength(8);
      expect(Object.keys(config.tools || {})).toHaveLength(40);
      for (const val of Object.values(config.connectors || {})) {
        expect(val).toBe(true);
      }
      for (const val of Object.values(config.tools || {})) {
        expect(val).toBe(true);
      }
    });

    it("getAllDisabledMcpConfig disables all connectors and all 40 tools", () => {
      const config = getAllDisabledMcpConfig();
      expect(Object.keys(config.connectors || {})).toHaveLength(8);
      expect(Object.keys(config.tools || {})).toHaveLength(40);
      for (const val of Object.values(config.connectors || {})) {
        expect(val).toBe(false);
      }
      for (const val of Object.values(config.tools || {})) {
        expect(val).toBe(false);
      }
    });

    it("getRecommendedMcpConfig provides standard sovereign suite", () => {
      const config = getRecommendedMcpConfig();
      expect(config.connectors?.searxng_scraperr).toBe(true);
      expect(config.connectors?.github).toBe(true);
      expect(config.connectors?.notion).toBe(true);
      expect(config.connectors?.system_platform).toBe(true);
      expect(config.tools?.web_search).toBe(true);
    });

    it("isToolActive correctly falls back to true when unconfigured", () => {
      expect(isToolActive(undefined, "web_search")).toBe(true);
      expect(isToolActive({}, "web_search")).toBe(true);
      expect(isToolActive({ tools: { web_search: false } }, "web_search")).toBe(false);
      expect(isToolActive({ tools: { web_search: true } }, "web_search")).toBe(true);
    });
  });

  describe("BotMcpToolSelector Rendering & Markup", () => {
    it("renders selector with 8 connectors, status badges and active counters", () => {
      const handleChange = vi.fn();
      const markup = renderToStaticMarkup(
        <BotMcpToolSelector value={{ connectors: {}, tools: {} }} onChange={handleChange} />,
      );

      // Verify title & badges
      expect(markup).toContain("Connecteurs &amp; Outils MCP Souverains");
      expect(markup).toContain("Souverain");
      expect(markup).toContain("40 / 40 outils actifs");

      // Verify Quick Action Buttons
      expect(markup).toContain("Tout activer");
      expect(markup).toContain("Recommandé");
      expect(markup).toContain("Tout désactiver");

      // Verify all 8 connector names are rendered
      expect(markup).toContain("Recherche &amp; Scraping Web Souverain");
      expect(markup).toContain("GitHub Enterprise MCP");
      expect(markup).toContain("Notion Workspace MCP");
      expect(markup).toContain("Postiz Social Media MCP");
      expect(markup).toContain("WordPress / Novamira MCP");
      expect(markup).toContain("n8n Workflow MCP");
      expect(markup).toContain("Cloudflare MCP");
      expect(markup).toContain("Système, Fichiers &amp; Multi-Agents");
    });

    it("renders custom status text and connector categories", () => {
      const markup = renderToStaticMarkup(
        <BotMcpToolSelector value={{ connectors: {}, tools: {} }} onChange={() => {}} />,
      );

      expect(markup).toContain("Recherche &amp; Scraping");
      expect(markup).toContain("Ingénierie &amp; Dépôts");
      expect(markup).toContain("Connaissances &amp; Workspace");
      expect(markup).toContain("Marketing &amp; Réseaux Sociaux");
      expect(markup).toContain("CMS &amp; Multi-Sites");
      expect(markup).toContain("Automatisation &amp; Workflows");
      expect(markup).toContain("Réseau &amp; CDN");
      expect(markup).toContain("Système &amp; Sandbox");
    });

    it("reflects partial/disabled tools count in connector badges", () => {
      const partialConfig: BotMcpConfig = {
        connectors: { searxng_scraperr: true, github: false },
        tools: {
          web_search: true,
          web_scrape: false, // 1/2 for searxng_scraperr
          github_search_repos: false,
          github_get_file_contents: false,
          github_list_issues: false,
          github_create_issue: false,
          github_get_pull_request: false,
          github_create_issue_comment: false, // 0/6 for github
        },
      };

      const markup = renderToStaticMarkup(
        <BotMcpToolSelector value={partialConfig} onChange={() => {}} />,
      );

      expect(markup).toContain("1 / 2 actifs");
      expect(markup).toContain("0 / 6 actifs");
    });
  });

  describe("Interactive Logic Simulation", () => {
    it("simulates full toggle cycle of a connector", () => {
      let currentConfig: BotMcpConfig = {
        connectors: { cloudflare: true },
        tools: {
          cloudflare_list_zones: true,
          cloudflare_list_dns_records: true,
          cloudflare_create_dns_record: true,
          cloudflare_purge_cache: true,
        },
      };

      const cfConnector = SOVEREIGN_MCP_CONNECTORS.find((c) => c.id === "cloudflare")!;
      expect(cfConnector).toBeDefined();

      // 1. When all active, clicking connector toggle turns all off
      const activeCount = cfConnector.tools.filter((t) =>
        isToolActive(currentConfig, t.name),
      ).length;
      expect(activeCount).toBe(4);

      const isAllActive = activeCount === cfConnector.tools.length;
      const nextActive = !isAllActive; // false

      const newTools: Record<string, boolean> = { ...(currentConfig.tools || {}) };
      for (const t of cfConnector.tools) {
        newTools[t.name] = nextActive;
      }
      currentConfig = {
        connectors: { ...(currentConfig.connectors || {}), [cfConnector.id]: nextActive },
        tools: newTools,
      };

      expect(currentConfig.connectors?.cloudflare).toBe(false);
      expect(currentConfig.tools?.cloudflare_purge_cache).toBe(false);
      expect(currentConfig.tools?.cloudflare_list_zones).toBe(false);

      // 2. When all off, clicking connector toggle turns all on
      const nextActiveCount = cfConnector.tools.filter((t) =>
        isToolActive(currentConfig, t.name),
      ).length;
      expect(nextActiveCount).toBe(0);

      const nextState = !(nextActiveCount === cfConnector.tools.length); // true
      const restoredTools: Record<string, boolean> = { ...(currentConfig.tools || {}) };
      for (const t of cfConnector.tools) {
        restoredTools[t.name] = nextState;
      }
      currentConfig = {
        connectors: { ...(currentConfig.connectors || {}), [cfConnector.id]: nextState },
        tools: restoredTools,
      };

      expect(currentConfig.connectors?.cloudflare).toBe(true);
      expect(currentConfig.tools?.cloudflare_purge_cache).toBe(true);
      expect(currentConfig.tools?.cloudflare_list_zones).toBe(true);
    });

    it("simulates fine-grained individual tool toggle", () => {
      const currentConfig: BotMcpConfig = getAllActiveMcpConfig();

      const githubConnector = SOVEREIGN_MCP_CONNECTORS.find((c) => c.id === "github")!;
      expect(githubConnector).toBeDefined();

      // Disable sensitive tool `github_create_issue_comment`
      const toolToToggle = "github_create_issue_comment";
      const currentStatus = isToolActive(currentConfig, toolToToggle);
      expect(currentStatus).toBe(true);

      const nextStatus = !currentStatus;
      const newTools: Record<string, boolean> = {
        ...(currentConfig.tools || {}),
        [toolToToggle]: nextStatus,
      };

      const newActiveCount = githubConnector.tools.filter((t) =>
        t.name === toolToToggle ? nextStatus : isToolActive({ tools: newTools }, t.name),
      ).length;

      // 5 out of 6 tools remain active
      expect(newActiveCount).toBe(5);
      expect(newTools[toolToToggle]).toBe(false);
      expect(newTools["github_search_repos"]).toBe(true);
    });
  });
});
