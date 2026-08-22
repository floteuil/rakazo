import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  ALL_SOVEREIGN_TOOL_NAMES,
  DEFAULT_ENABLED_SOVEREIGN_TOOLS,
  getAllSovereignToolNames,
  getAllSovereignTools,
  getConnectorForTool,
  getSovereignConnector,
  getSovereignToolsByCategory,
  isSovereignTool,
  SOVEREIGN_CATEGORIES,
  SOVEREIGN_MCP_CONNECTORS,
} from "@rakazo/contracts";
import { PluginsOverlay } from "./PluginsOverlay";

describe("PluginsOverlay and Sovereign MCP Catalog (Comprehensive Unit Tests)", () => {
  describe("Sovereign MCP Catalog Contracts & Integrity", () => {
    it("exports exactly 8 Sovereign MCP connectors", () => {
      expect(SOVEREIGN_MCP_CONNECTORS).toHaveLength(8);
      const ids = SOVEREIGN_MCP_CONNECTORS.map((c) => c.id);
      expect(ids).toContain("searxng_scraperr");
      expect(ids).toContain("github");
      expect(ids).toContain("notion");
      expect(ids).toContain("postiz");
      expect(ids).toContain("wordpress_novamira");
      expect(ids).toContain("n8n");
      expect(ids).toContain("cloudflare");
      expect(ids).toContain("system_platform");
    });

    it("contains exactly 40 sovereign tools across all 8 connectors", () => {
      const allTools = getAllSovereignTools();
      expect(allTools).toHaveLength(40);
      expect(ALL_SOVEREIGN_TOOL_NAMES).toHaveLength(40);
      expect(DEFAULT_ENABLED_SOVEREIGN_TOOLS).toHaveLength(40);
    });

    it("correctly identifies sovereign tools with isSovereignTool", () => {
      expect(isSovereignTool("web_search")).toBe(true);
      expect(isSovereignTool("github_search_repos")).toBe(true);
      expect(isSovereignTool("notion_search")).toBe(true);
      expect(isSovereignTool("postiz_create_post")).toBe(true);
      expect(isSovereignTool("wordpress_create_post")).toBe(true);
      expect(isSovereignTool("n8n_trigger_webhook")).toBe(true);
      expect(isSovereignTool("cloudflare_purge_cache")).toBe(true);
      expect(isSovereignTool("shell")).toBe(true);
      expect(isSovereignTool("unknown_fake_tool")).toBe(false);
    });

    it("locates the parent connector for any given tool name", () => {
      const searchConn = getConnectorForTool("web_search");
      expect(searchConn?.id).toBe("searxng_scraperr");

      const ghConn = getConnectorForTool("github_create_issue");
      expect(ghConn?.id).toBe("github");

      const notionConn = getConnectorForTool("notion_query_database");
      expect(notionConn?.id).toBe("notion");

      const postizConn = getConnectorForTool("postiz_list_integrations");
      expect(postizConn?.id).toBe("postiz");

      const wpConn = getConnectorForTool("wordpress_list_posts");
      expect(wpConn?.id).toBe("wordpress_novamira");

      const n8nConn = getConnectorForTool("n8n_get_execution");
      expect(n8nConn?.id).toBe("n8n");

      const cfConn = getConnectorForTool("cloudflare_create_dns_record");
      expect(cfConn?.id).toBe("cloudflare");

      const sysConn = getConnectorForTool("write_file");
      expect(sysConn?.id).toBe("system_platform");
    });

    it("filters tools by category using getSovereignToolsByCategory", () => {
      const searchTools = getSovereignToolsByCategory("search");
      expect(searchTools).toHaveLength(2);

      const codeTools = getSovereignToolsByCategory("code");
      expect(codeTools).toHaveLength(6);

      const systemTools = getSovereignToolsByCategory("system");
      expect(systemTools).toHaveLength(12);

      const allTools = getSovereignToolsByCategory("all");
      expect(allTools).toHaveLength(40);
    });

    it("defines valid SOVEREIGN_CATEGORIES matching specifications", () => {
      expect(SOVEREIGN_CATEGORIES.length).toBeGreaterThanOrEqual(10);
      const catIds = SOVEREIGN_CATEGORIES.map((c) => c.id);
      expect(catIds).toContain("all");
      expect(catIds).toContain("connected");
      expect(catIds).toContain("search");
      expect(catIds).toContain("code");
      expect(catIds).toContain("workspace");
      expect(catIds).toContain("social");
      expect(catIds).toContain("cms");
      expect(catIds).toContain("automation");
      expect(catIds).toContain("infra");
      expect(catIds).toContain("system");
    });
  });

  describe("PluginsOverlay UI Rendering & Interaction Structure", () => {
    it("renders the main dialog container with accessible attributes", () => {
      const html = renderToStaticMarkup(<PluginsOverlay onClose={() => {}} />);
      expect(html).toContain('role="dialog"');
      expect(html).toContain('aria-modal="true"');
      expect(html).toContain("Connecteurs MCP Souverains");
    });

    it("renders all 8 sovereign connector cards in the default catalog view", () => {
      const html = renderToStaticMarkup(<PluginsOverlay onClose={() => {}} initialCatalog={[]} />);
      for (const connector of SOVEREIGN_MCP_CONNECTORS) {
        expect(html).toContain(`data-testid="connector-card-${connector.id}"`);
        expect(html).toContain(connector.slug);
      }
    });

    it("renders glowing emerald status badges for operational connectors", () => {
      const html = renderToStaticMarkup(<PluginsOverlay onClose={() => {}} initialCatalog={[]} />);
      expect(html).toContain("Connecté &amp; Opérationnel");
      expect(html).toContain("animate-pulse");
      expect(html).toContain("bg-emerald-500/10");
    });

    it("renders category tabs in tablist role", () => {
      const html = renderToStaticMarkup(<PluginsOverlay onClose={() => {}} initialCatalog={[]} />);
      expect(html).toContain('role="tablist"');
      expect(html).toContain("Tous");
      expect(html).toContain("Connectés");
      expect(html).toContain("Recherche");
      expect(html).toContain("Ingénierie");
      expect(html).toContain("Workspace");
      expect(html).toContain("Social");
      expect(html).toContain("CMS");
      expect(html).toContain("Automatisation");
      expect(html).toContain("Infrastructure");
      expect(html).toContain("Système");
    });

    it("renders the detail inspector when initialConnectorId is specified", () => {
      const html = renderToStaticMarkup(
        <PluginsOverlay onClose={() => {}} initialConnectorId="github" initialCatalog={[]} />,
      );
      expect(html).toContain("GitHub Enterprise MCP");
      expect(html).toContain("Vue d&#x27;ensemble");
      expect(html).toContain("Outils &amp; Capacités (6)");
      expect(html).toContain("Sécurité &amp; Secrets");
      expect(html).toContain("https://api.github.com");
      expect(html).toContain("GITHUB_TOKEN");
    });

    it("renders all tools and parameters in inspector when initialized with a connector", () => {
      const html = renderToStaticMarkup(
        <PluginsOverlay
          onClose={() => {}}
          initialConnectorId="searxng_scraperr"
          initialCatalog={[]}
        />,
      );
      expect(html).toContain("Recherche &amp; Scraping Web Souverain");
      expect(html).toContain("Floteuil Enterprise · Souverain");
      expect(html).toContain("https://search.groupefloteuil.internal");
      expect(html).toContain("Zero-Tracking");
    });

    it("renders graceful pure sovereign explanation when Composio is unconfigured", () => {
      const html = renderToStaticMarkup(<PluginsOverlay onClose={() => {}} initialCatalog={[]} />);
      expect(html).toContain("Mode Souverain Pur Actif");
      expect(html).toContain("Les 8 Connecteurs MCP Souverains ci-dessus couvrent 100% des opérations");
    });

    it("includes responsive bottom-sheet / modal layout styles", () => {
      const html = renderToStaticMarkup(<PluginsOverlay onClose={() => {}} initialCatalog={[]} />);
      expect(html).toContain("items-end md:items-center");
      expect(html).toContain("h-[92vh] md:h-[780px]");
      expect(html).toContain("rounded-t-[24px] md:rounded-[26px]");
    });
  });
});
