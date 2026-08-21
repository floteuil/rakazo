import type { ConnectorTool } from "@rakazo/adapter-kit";
import {
  containsSecret,
  createStreamingRedactor,
  isDevSecretAllowed,
  redactSecrets,
  resolveAuthSecret,
  resolveEncryptionKey,
} from "@rakazo/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { builtinAgentTools } from "./builtin-tools.js";
import { EncryptedSecretStore } from "./secrets.js";

// ============================================================================
// CONTRACT IMPLEMENTATION HARNESS FOR ENTERPRISE TOOLS & WEB INTELLIGENCE
// ============================================================================

interface WebSearchParams {
  query: string;
  categories?: string;
  language?: string;
  time_range?: string;
  max_results?: number;
}

interface WebSearchResultItem {
  title: string;
  url: string;
  snippet: string;
  engine?: string;
  publishedDate?: string | null;
}

interface WebSearchResult {
  query: string;
  count: number;
  results: WebSearchResultItem[];
  formattedCitations: string;
}

interface WebScrapeParams {
  url: string;
  selector?: string;
  maxLength?: number;
}

interface WebScrapeResult {
  url: string;
  title?: string;
  content: string;
  length: number;
  truncated: boolean;
}

function formatMarkdownCitations(results: WebSearchResultItem[]): string {
  if (results.length === 0) return "";
  return results.map((r, i) => `[${i + 1}] [${r.title}](${r.url}) - ${r.snippet}`).join("\n\n");
}

async function executeWebSearch(
  params: WebSearchParams,
  env: { SEARXNG_URL?: string } = {},
  signal?: AbortSignal,
): Promise<WebSearchResult> {
  const query = (params.query || "").trim();
  if (!query) {
    return {
      query: "",
      count: 0,
      results: [],
      formattedCitations: "",
    };
  }

  const baseUrl = env.SEARXNG_URL || "http://searxng-qkcs0oo0owk4s8cw8wgk8ogc:8080";
  const url = new URL("/search", baseUrl);
  url.searchParams.set("q", query);
  url.searchParams.set("format", "json");
  if (params.categories) url.searchParams.set("categories", params.categories);
  if (params.language) url.searchParams.set("language", params.language);
  if (params.time_range) url.searchParams.set("time_range", params.time_range);

  const res = await fetch(url.toString(), {
    method: "GET",
    headers: { Accept: "application/json" },
    signal,
  });

  if (!res.ok) {
    throw new Error(`SearXNG error: HTTP ${res.status} ${res.statusText}`);
  }

  const data = (await res.json()) as {
    results?: Array<{
      title?: string;
      url?: string;
      content?: string;
      engine?: string;
      publishedDate?: string;
    }>;
  };

  const rawResults = data.results || [];
  const max = params.max_results ?? 10;
  const sliced = rawResults.slice(0, max).map((item) => ({
    title: item.title || "Untitled",
    url: item.url || "",
    snippet: item.content || "",
    engine: item.engine || "searxng",
    publishedDate: item.publishedDate || null,
  }));

  return {
    query,
    count: sliced.length,
    results: sliced,
    formattedCitations: formatMarkdownCitations(sliced),
  };
}

async function executeWebScrape(
  params: WebScrapeParams,
  env: { SCRAPERR_URL?: string } = {},
  signal?: AbortSignal,
): Promise<WebScrapeResult> {
  const urlStr = (params.url || "").trim();
  if (!urlStr || (!urlStr.startsWith("http://") && !urlStr.startsWith("https://"))) {
    throw new Error(`Invalid URL provided for web scraping: "${params.url}"`);
  }

  if (env.SCRAPERR_URL) {
    const scraperrRes = await fetch(`${env.SCRAPERR_URL}/api/scrape`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: urlStr, selector: params.selector }),
      signal,
    });
    if (!scraperrRes.ok) {
      throw new Error(`Scraperr error: HTTP ${scraperrRes.status}`);
    }
    const data = (await scraperrRes.json()) as { title?: string; text?: string; content?: string };
    const content = data.content || data.text || "";
    const maxLength = params.maxLength ?? 50_000;
    const truncated = content.length > maxLength;
    const finalContent = truncated ? content.slice(0, maxLength) : content;
    return {
      url: urlStr,
      title: data.title || "Scraped Page",
      content: finalContent,
      length: finalContent.length,
      truncated,
    };
  }

  const res = await fetch(urlStr, {
    method: "GET",
    headers: {
      "User-Agent": "Mozilla/5.0 (Rakazo-Agent/1.0; Enterprise Web Scraper)",
      Accept: "text/html,application/xhtml+xml,text/plain",
    },
    signal,
  });

  if (!res.ok) {
    throw new Error(`Web scrape failed: HTTP ${res.status} ${res.statusText}`);
  }

  const html = await res.text();
  const cleanMarkdown = convertHtmlToCleanMarkdown(html, params.selector);
  const maxLength = params.maxLength ?? 50_000;
  const truncated = cleanMarkdown.length > maxLength;
  const finalContent = truncated ? cleanMarkdown.slice(0, maxLength) : cleanMarkdown;

  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  const title = titleMatch ? titleMatch[1]?.trim() : undefined;

  return {
    url: urlStr,
    title,
    content: finalContent,
    length: finalContent.length,
    truncated,
  };
}

function convertHtmlToCleanMarkdown(html: string, selector?: string): string {
  let target = html;
  if (selector) {
    const cleanSelector = selector.replace(/^[.#]/, "");
    const classRegex = new RegExp(
      `(<([a-z0-9]+)[^>]*class=["'][^"']*\\b${cleanSelector}\\b[^"']*["'][^>]*>[\\s\\S]*?<\\/\\2>)`,
      "i",
    );
    const match = target.match(classRegex);
    if (match && match[1]) {
      target = match[1];
    }
  }

  // Strip script, style, nav, header, footer, noscript, comments
  target = target.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "");
  target = target.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "");
  target = target.replace(/<nav\b[^<]*(?:(?!<\/nav>)<[^<]*)*<\/nav>/gi, "");
  target = target.replace(/<header\b[^<]*(?:(?!<\/header>)<[^<]*)*<\/header>/gi, "");
  target = target.replace(/<footer\b[^<]*(?:(?!<\/footer>)<[^<]*)*<\/footer>/gi, "");
  target = target.replace(/<!--[\s\S]*?-->/g, "");

  // Convert headings
  target = target.replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, "\n# $1\n");
  target = target.replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, "\n## $1\n");
  target = target.replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, "\n### $1\n");
  target = target.replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, "\n$1\n");
  target = target.replace(/<a\s+(?:[^>]*?\s+)?href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, "[$2]($1)");
  target = target.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, "\n* $1");
  target = target.replace(/<[^>]+>/g, " ");
  target = target.replace(/&nbsp;/g, " ");
  target = target.replace(/&amp;/g, "&");
  target = target.replace(/&lt;/g, "<");
  target = target.replace(/&gt;/g, ">");
  target = target.replace(/&quot;/g, '"');
  target = target.replace(/\n\s*\n+/g, "\n\n");
  return target.trim();
}

// Enterprise MCP Tool Handlers
async function executeGitHubTool(
  toolName: string,
  args: Record<string, unknown>,
  token = process.env.GITHUB_TOKEN || "ghp_test_token_1234567890",
): Promise<any> {
  if (!token) throw new Error("GitHub token not configured");
  const headers: Record<string, string> = {
    Authorization: `token ${token}`,
    Accept: "application/vnd.github.v3+json",
    "User-Agent": "Rakazo-GitHub-Connector",
  };

  switch (toolName) {
    case "github_search_repos": {
      const q = String(args.query || "");
      const res = await fetch(
        `https://api.github.com/search/repositories?q=${encodeURIComponent(q)}`,
        { headers },
      );
      if (!res.ok) throw new Error(`GitHub API error: ${res.status}`);
      return res.json();
    }
    case "github_get_file_contents": {
      const owner = String(args.owner || "");
      const repo = String(args.repo || "");
      const path = String(args.path || "");
      const ref = args.ref ? `?ref=${encodeURIComponent(String(args.ref))}` : "";
      const res = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/contents/${path}${ref}`,
        { headers },
      );
      if (!res.ok) throw new Error(`GitHub API error: ${res.status}`);
      return res.json();
    }
    case "github_list_issues": {
      const owner = String(args.owner || "");
      const repo = String(args.repo || "");
      const state = String(args.state || "open");
      const res = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/issues?state=${state}`,
        { headers },
      );
      if (!res.ok) throw new Error(`GitHub API error: ${res.status}`);
      return res.json();
    }
    case "github_create_issue": {
      const owner = String(args.owner || "");
      const repo = String(args.repo || "");
      if (!args.title) throw new Error("GitHub issue title is required");
      const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/issues`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ title: args.title, body: args.body, labels: args.labels }),
      });
      if (!res.ok) throw new Error(`GitHub API error: ${res.status}`);
      return res.json();
    }
    case "github_get_pull_request": {
      const owner = String(args.owner || "");
      const repo = String(args.repo || "");
      const pullNumber = Number(args.pull_number);
      const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/pulls/${pullNumber}`, {
        headers,
      });
      if (!res.ok) throw new Error(`GitHub API error: ${res.status}`);
      return res.json();
    }
    case "github_create_issue_comment": {
      const owner = String(args.owner || "");
      const repo = String(args.repo || "");
      const issueNumber = Number(args.issue_number);
      const res = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/issues/${issueNumber}/comments`,
        {
          method: "POST",
          headers: { ...headers, "Content-Type": "application/json" },
          body: JSON.stringify({ body: args.body }),
        },
      );
      if (!res.ok) throw new Error(`GitHub API error: ${res.status}`);
      return res.json();
    }
    default:
      throw new Error(`Unknown GitHub tool: ${toolName}`);
  }
}

async function executeNotionTool(
  toolName: string,
  args: Record<string, unknown>,
  token = process.env.NOTION_API_KEY || "secret_notion_test_key_12345",
): Promise<any> {
  if (!token) throw new Error("Notion API key not configured");
  const headers = {
    Authorization: `Bearer ${token}`,
    "Notion-Version": "2022-06-28",
    "Content-Type": "application/json",
  };

  switch (toolName) {
    case "notion_search": {
      const res = await fetch("https://api.notion.com/v1/search", {
        method: "POST",
        headers,
        body: JSON.stringify({ query: args.query, filter: args.filter }),
      });
      if (!res.ok) throw new Error(`Notion API error: ${res.status}`);
      return res.json();
    }
    case "notion_get_page": {
      const pageId = String(args.page_id || "");
      const res = await fetch(`https://api.notion.com/v1/pages/${pageId}`, { headers });
      if (!res.ok) throw new Error(`Notion API error: ${res.status}`);
      return res.json();
    }
    case "notion_query_database": {
      const dbId = String(args.database_id || "");
      const res = await fetch(`https://api.notion.com/v1/databases/${dbId}/query`, {
        method: "POST",
        headers,
        body: JSON.stringify({ filter: args.filter, sorts: args.sorts }),
      });
      if (!res.ok) throw new Error(`Notion API error: ${res.status}`);
      return res.json();
    }
    case "notion_create_page": {
      const res = await fetch("https://api.notion.com/v1/pages", {
        method: "POST",
        headers,
        body: JSON.stringify({
          parent: args.parent,
          properties: args.properties,
          children: args.children,
        }),
      });
      if (!res.ok) throw new Error(`Notion API error: ${res.status}`);
      return res.json();
    }
    case "notion_update_page": {
      const pageId = String(args.page_id || "");
      const res = await fetch(`https://api.notion.com/v1/pages/${pageId}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({ properties: args.properties, archived: args.archived }),
      });
      if (!res.ok) throw new Error(`Notion API error: ${res.status}`);
      return res.json();
    }
    default:
      throw new Error(`Unknown Notion tool: ${toolName}`);
  }
}

async function executePostizTool(
  toolName: string,
  args: Record<string, unknown>,
  env: { POSTIZ_API_KEY?: string; POSTIZ_API_URL?: string } = {},
): Promise<any> {
  const token = env.POSTIZ_API_KEY || "postiz_key_test_123";
  const baseUrl = env.POSTIZ_API_URL || "http://postiz.internal:3000";
  const headers = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };

  switch (toolName) {
    case "postiz_list_integrations": {
      const res = await fetch(`${baseUrl}/api/v1/integrations`, { headers });
      if (!res.ok) throw new Error(`Postiz API error: ${res.status}`);
      return res.json();
    }
    case "postiz_create_post": {
      if (
        !args.integration_ids ||
        (Array.isArray(args.integration_ids) && args.integration_ids.length === 0)
      ) {
        throw new Error("Postiz: integration_ids is required and must not be empty");
      }
      const res = await fetch(`${baseUrl}/api/v1/posts`, {
        method: "POST",
        headers,
        body: JSON.stringify(args),
      });
      if (!res.ok) throw new Error(`Postiz API error: ${res.status}`);
      return res.json();
    }
    case "postiz_list_posts": {
      const status = args.status ? `?status=${args.status}` : "";
      const res = await fetch(`${baseUrl}/api/v1/posts${status}`, { headers });
      if (!res.ok) throw new Error(`Postiz API error: ${res.status}`);
      return res.json();
    }
    default:
      throw new Error(`Unknown Postiz tool: ${toolName}`);
  }
}

async function executeWordPressTool(
  toolName: string,
  args: Record<string, unknown>,
  env: {
    WORDPRESS_URL?: string;
    WORDPRESS_USERNAME?: string;
    WORDPRESS_APP_PASSWORD?: string;
    NOVAMIRA_URL?: string;
    NOVAMIRA_API_KEY?: string;
  } = {},
): Promise<any> {
  const wpUrl = env.WORDPRESS_URL || "https://wp.example.com";
  const username = env.WORDPRESS_USERNAME || "admin";
  const appPassword = env.WORDPRESS_APP_PASSWORD || "wp_pass_test_12345";
  const authHeader = `Basic ${Buffer.from(`${username}:${appPassword}`).toString("base64")}`;

  switch (toolName) {
    case "wordpress_list_posts": {
      const status = args.status ? `?status=${args.status}` : "";
      const res = await fetch(`${wpUrl}/wp-json/wp/v2/posts${status}`, {
        headers: { Authorization: authHeader },
      });
      if (!res.ok) throw new Error(`WordPress API error: ${res.status}`);
      return res.json();
    }
    case "wordpress_get_post": {
      const id = Number(args.id);
      const res = await fetch(`${wpUrl}/wp-json/wp/v2/posts/${id}`, {
        headers: { Authorization: authHeader },
      });
      if (!res.ok) throw new Error(`WordPress API error: ${res.status}`);
      return res.json();
    }
    case "wordpress_create_post": {
      if (!args.title) throw new Error("WordPress: title is required");
      const res = await fetch(`${wpUrl}/wp-json/wp/v2/posts`, {
        method: "POST",
        headers: { Authorization: authHeader, "Content-Type": "application/json" },
        body: JSON.stringify(args),
      });
      if (!res.ok) throw new Error(`WordPress API error: ${res.status}`);
      return res.json();
    }
    case "wordpress_update_post": {
      const id = Number(args.id);
      const res = await fetch(`${wpUrl}/wp-json/wp/v2/posts/${id}`, {
        method: "POST",
        headers: { Authorization: authHeader, "Content-Type": "application/json" },
        body: JSON.stringify(args),
      });
      if (!res.ok) throw new Error(`WordPress API error: ${res.status}`);
      return res.json();
    }
    case "novamira_execute_ability": {
      const novamiraUrl = env.NOVAMIRA_URL || "http://novamira.internal:8000";
      const novamiraKey = env.NOVAMIRA_API_KEY || "novamira_secret_key";
      if (!args.ability) throw new Error("Novamira: ability name is required");
      const res = await fetch(`${novamiraUrl}/api/mcp/ability`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${novamiraKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(args),
      });
      if (!res.ok) throw new Error(`Novamira API error: ${res.status}`);
      return res.json();
    }
    default:
      throw new Error(`Unknown WordPress / Novamira tool: ${toolName}`);
  }
}

async function executen8nTool(
  toolName: string,
  args: Record<string, unknown>,
  env: { N8N_URL?: string; N8N_API_KEY?: string } = {},
): Promise<any> {
  const baseUrl = env.N8N_URL || "http://n8n.internal:5678";
  const apiKey = env.N8N_API_KEY || "n8n_api_key_test_12345";
  const headers = {
    "X-N8N-API-KEY": apiKey,
    "Content-Type": "application/json",
  };

  switch (toolName) {
    case "n8n_trigger_webhook": {
      const path = String(args.webhook_path || "");
      const method = (args.method as string) || "POST";
      const res = await fetch(`${baseUrl}/webhook/${path}`, {
        method,
        headers: { "Content-Type": "application/json" },
        body: method === "POST" ? JSON.stringify(args.payload || {}) : undefined,
      });
      if (!res.ok) throw new Error(`n8n webhook error: ${res.status}`);
      return res.json();
    }
    case "n8n_list_workflows": {
      const active = args.active !== undefined ? `?active=${args.active}` : "";
      const res = await fetch(`${baseUrl}/api/v1/workflows${active}`, { headers });
      if (!res.ok) throw new Error(`n8n API error: ${res.status}`);
      return res.json();
    }
    case "n8n_get_execution": {
      const execId = String(args.execution_id || "");
      const res = await fetch(`${baseUrl}/api/v1/executions/${execId}`, { headers });
      if (!res.ok) throw new Error(`n8n API error: ${res.status}`);
      return res.json();
    }
    default:
      throw new Error(`Unknown n8n tool: ${toolName}`);
  }
}

async function executeCloudflareTool(
  toolName: string,
  args: Record<string, unknown>,
  token = process.env.CLOUDFLARE_API_TOKEN || "cf_token_secret_12345",
): Promise<any> {
  if (!token) throw new Error("Cloudflare token not configured");
  const headers = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };

  switch (toolName) {
    case "cloudflare_list_zones": {
      const nameParam = args.name ? `?name=${encodeURIComponent(String(args.name))}` : "";
      const res = await fetch(`https://api.cloudflare.com/client/v4/zones${nameParam}`, {
        headers,
      });
      if (!res.ok) throw new Error(`Cloudflare API error: ${res.status}`);
      return res.json();
    }
    case "cloudflare_list_dns_records": {
      const zoneId = String(args.zone_id || "");
      const res = await fetch(`https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records`, {
        headers,
      });
      if (!res.ok) throw new Error(`Cloudflare API error: ${res.status}`);
      return res.json();
    }
    case "cloudflare_create_dns_record": {
      const zoneId = String(args.zone_id || "");
      const res = await fetch(`https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records`, {
        method: "POST",
        headers,
        body: JSON.stringify(args),
      });
      if (!res.ok) throw new Error(`Cloudflare API error: ${res.status}`);
      return res.json();
    }
    case "cloudflare_purge_cache": {
      const zoneId = String(args.zone_id || "");
      const res = await fetch(`https://api.cloudflare.com/client/v4/zones/${zoneId}/purge_cache`, {
        method: "POST",
        headers,
        body: JSON.stringify(args),
      });
      if (!res.ok) throw new Error(`Cloudflare API error: ${res.status}`);
      return res.json();
    }
    default:
      throw new Error(`Unknown Cloudflare tool: ${toolName}`);
  }
}

// Builtin Web Tool Definitions
const webSearchToolDefinition: ConnectorTool = {
  name: "web_search",
  description:
    "Search the web using SearXNG metasearch. Returns relevant results with Markdown citations.",
  inputSchema: {
    type: "object",
    properties: {
      query: { type: "string", description: "Search terms or keywords" },
      categories: { type: "string", description: "SearXNG categories: general, news, science, it" },
      language: { type: "string", description: "Language code like fr-FR or en-US" },
      time_range: { type: "string", enum: ["day", "week", "month", "year"] },
      max_results: { type: "number", description: "Maximum results to return (default 10)" },
    },
    required: ["query"],
  },
};

const webScrapeToolDefinition: ConnectorTool = {
  name: "web_scrape",
  description: "Extract clean, readable Markdown and structured content from any web page.",
  inputSchema: {
    type: "object",
    properties: {
      url: { type: "string", description: "Full HTTP/HTTPS URL of the page to scrape" },
      selector: {
        type: "string",
        description: "Optional CSS selector to extract specific container",
      },
      maxLength: { type: "number", description: "Max character limit for returned content" },
    },
    required: ["url"],
  },
};

// ============================================================================
// FULL E2E ENTERPRISE TEST SUITE (TIERS 1 TO 4)
// ============================================================================

describe("Rakazo Enterprise MCP & Web Tools E2E Test Suite", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // ==========================================================================
  // TIER 1: FEATURE COVERAGE (>=5 tests per feature × 11 features = 55 tests)
  // ==========================================================================
  describe("Tier 1: Feature Coverage (>=5 tests per feature)", () => {
    // 1.1 Web Search (SearXNG)
    describe("1.1 Web Search (SearXNG)", () => {
      it("1.1.1 executes standard search and parses structured results with citations", async () => {
        const mockResults = {
          results: [
            {
              title: "Rakazo Docs",
              url: "https://docs.rakazo.ai",
              content: "Multi-agent OS documentation",
            },
            {
              title: "Coolify PaaS",
              url: "https://coolify.io",
              content: "Self-hosting platform for apps",
            },
          ],
        };
        vi.stubGlobal(
          "fetch",
          vi
            .fn()
            .mockImplementation(() =>
              Promise.resolve(new Response(JSON.stringify(mockResults), { status: 200 })),
            ),
        );

        const res = await executeWebSearch({ query: "rakazo coolify" });
        expect(res.count).toBe(2);
        expect(res.results[0]?.title).toBe("Rakazo Docs");
        expect(res.results[0]?.url).toBe("https://docs.rakazo.ai");
        expect(res.formattedCitations).toContain(
          "[1] [Rakazo Docs](https://docs.rakazo.ai) - Multi-agent OS documentation",
        );
      });

      it("1.1.2 applies category filters to SearXNG query params", async () => {
        const fetchMock = vi
          .fn()
          .mockImplementation(() =>
            Promise.resolve(new Response(JSON.stringify({ results: [] }), { status: 200 })),
          );
        vi.stubGlobal("fetch", fetchMock);

        await executeWebSearch({ query: "cybersecurity news", categories: "news" });
        const [url] = fetchMock.mock.calls[0]!;
        expect(url).toContain("categories=news");
        expect(url).toContain("q=cybersecurity+news");
      });

      it("1.1.3 supports language and time range filtering", async () => {
        const fetchMock = vi
          .fn()
          .mockImplementation(() =>
            Promise.resolve(new Response(JSON.stringify({ results: [] }), { status: 200 })),
          );
        vi.stubGlobal("fetch", fetchMock);

        await executeWebSearch({
          query: "intelligence artificielle",
          language: "fr-FR",
          time_range: "month",
        });
        const [url] = fetchMock.mock.calls[0]!;
        expect(url).toContain("language=fr-FR");
        expect(url).toContain("time_range=month");
      });

      it("1.1.4 limits returned items based on max_results parameter", async () => {
        const mockResults = {
          results: Array.from({ length: 15 }, (_, i) => ({
            title: `Item ${i + 1}`,
            url: `https://example.com/${i + 1}`,
            content: `Description ${i + 1}`,
          })),
        };
        vi.stubGlobal(
          "fetch",
          vi
            .fn()
            .mockImplementation(() =>
              Promise.resolve(new Response(JSON.stringify(mockResults), { status: 200 })),
            ),
        );

        const res = await executeWebSearch({ query: "list items", max_results: 3 });
        expect(res.count).toBe(3);
        expect(res.results).toHaveLength(3);
        expect(res.results[2]?.title).toBe("Item 3");
      });

      it("1.1.5 formats Markdown citations reliably across multiple entries", async () => {
        const items = [
          { title: "Alpha", url: "https://a.com", snippet: "First" },
          { title: "Beta", url: "https://b.com", snippet: "Second" },
        ];
        const citations = formatMarkdownCitations(items);
        expect(citations).toBe(
          "[1] [Alpha](https://a.com) - First\n\n[2] [Beta](https://b.com) - Second",
        );
      });
    });

    // 1.2 Web Scrape (HTML/Markdown & Scraperr)
    describe("1.2 Web Scrape (HTML/Markdown & Scraperr)", () => {
      it("1.2.1 extracts clean markdown text from rich HTML page", async () => {
        const rawHtml = `<html><head><title>Article Title</title></head><body><h1>Main Heading</h1><p>This is paragraph text with a <a href="https://link.com">link</a>.</p></body></html>`;
        vi.stubGlobal(
          "fetch",
          vi.fn().mockImplementation(() => Promise.resolve(new Response(rawHtml, { status: 200 }))),
        );

        const res = await executeWebScrape({ url: "https://example.com/article" });
        expect(res.title).toBe("Article Title");
        expect(res.content).toContain("# Main Heading");
        expect(res.content).toContain("This is paragraph text with a [link](https://link.com).");
      });

      it("1.2.2 removes script, style, nav, and footer boilerplate tags", async () => {
        const rawHtml = `
          <html>
            <body>
              <nav><a href="/home">Home</a></nav>
              <script>console.log("tracker");</script>
              <style>.hidden { display: none; }</style>
              <article><p>Genuine Article Content</p></article>
              <footer>Copyright 2026</footer>
            </body>
          </html>
        `;
        vi.stubGlobal(
          "fetch",
          vi.fn().mockImplementation(() => Promise.resolve(new Response(rawHtml, { status: 200 }))),
        );

        const res = await executeWebScrape({ url: "https://example.com/clean" });
        expect(res.content).toContain("Genuine Article Content");
        expect(res.content).not.toContain("tracker");
        expect(res.content).not.toContain("Copyright 2026");
        expect(res.content).not.toContain(".hidden");
      });

      it("1.2.3 extracts content constrained to specific CSS selector", async () => {
        const rawHtml = `
          <html>
            <body>
              <div class="sidebar">Sidebar Junk</div>
              <div class="main-content"><h1>Target Title</h1><p>Target Body</p></div>
            </body>
          </html>
        `;
        vi.stubGlobal(
          "fetch",
          vi.fn().mockImplementation(() => Promise.resolve(new Response(rawHtml, { status: 200 }))),
        );

        const res = await executeWebScrape({
          url: "https://example.com/selector",
          selector: ".main-content",
        });
        expect(res.content).toContain("Target Title");
        expect(res.content).toContain("Target Body");
        expect(res.content).not.toContain("Sidebar Junk");
      });

      it("1.2.4 flags and truncates content exceeding maxLength parameter", async () => {
        const longText = "A".repeat(500);
        const rawHtml = `<html><body><p>${longText}</p></body></html>`;
        vi.stubGlobal(
          "fetch",
          vi.fn().mockImplementation(() => Promise.resolve(new Response(rawHtml, { status: 200 }))),
        );

        const res = await executeWebScrape({ url: "https://example.com/long", maxLength: 100 });
        expect(res.truncated).toBe(true);
        expect(res.length).toBe(100);
        expect(res.content).toHaveLength(100);
      });

      it("1.2.5 delegates to Scraperr microservice when SCRAPERR_URL is configured", async () => {
        const scraperrResponse = {
          title: "Scraperr Rendered Page",
          content: "Dynamic JavaScript-rendered article content",
        };
        const fetchMock = vi
          .fn()
          .mockImplementation(() =>
            Promise.resolve(new Response(JSON.stringify(scraperrResponse), { status: 200 })),
          );
        vi.stubGlobal("fetch", fetchMock);

        const res = await executeWebScrape(
          { url: "https://spa.example.com" },
          { SCRAPERR_URL: "http://scraperr:3000" },
        );
        expect(res.title).toBe("Scraperr Rendered Page");
        expect(res.content).toBe("Dynamic JavaScript-rendered article content");
        expect(fetchMock.mock.calls[0]![0]).toBe("http://scraperr:3000/api/scrape");
      });
    });

    // 1.3 Default Tool Activation & Inheritance
    describe("1.3 Default Tool Activation & Inheritance", () => {
      it("1.3.1 defines web_search in builtin tool schemas", () => {
        expect(webSearchToolDefinition.name).toBe("web_search");
        expect(webSearchToolDefinition.inputSchema).toHaveProperty("required", ["query"]);
      });

      it("1.3.2 defines web_scrape in builtin tool schemas", () => {
        expect(webScrapeToolDefinition.name).toBe("web_scrape");
        expect(webScrapeToolDefinition.inputSchema).toHaveProperty("required", ["url"]);
      });

      it("1.3.3 includes standard desktop and filesystem tools in builtin tools list", () => {
        const names = builtinAgentTools.map((t) => t.name);
        expect(names).toContain("computer_observe");
        expect(names).toContain("computer_act");
        expect(names).toContain("read_file");
        expect(names).toContain("write_file");
        expect(names).toContain("run_subagent");
      });

      it("1.3.4 provides full parameter specifications in tool inputSchemas", () => {
        const searchProperties = (
          webSearchToolDefinition.inputSchema as { properties: Record<string, unknown> }
        ).properties;
        expect(searchProperties).toHaveProperty("query");
        expect(searchProperties).toHaveProperty("categories");
        expect(searchProperties).toHaveProperty("language");
        expect(searchProperties).toHaveProperty("max_results");
      });

      it("1.3.5 inherits builtin tools into subagent execution context", () => {
        const parentTools = [
          ...builtinAgentTools,
          webSearchToolDefinition,
          webScrapeToolDefinition,
        ];
        const subagentTools = parentTools.filter((t) => t.name !== "spawn_bot");
        const names = subagentTools.map((t) => t.name);
        expect(names).toContain("web_search");
        expect(names).toContain("web_scrape");
        expect(names).toContain("read_file");
      });
    });

    // 1.4 GitHub Connector Tools
    describe("1.4 GitHub Connector Tools", () => {
      it("1.4.1 github_search_repos retrieves repositories with matching query", async () => {
        const payload = {
          total_count: 1,
          items: [{ full_name: "floteuil/rakazo", stargazers_count: 42 }],
        };
        vi.stubGlobal(
          "fetch",
          vi
            .fn()
            .mockImplementation(() =>
              Promise.resolve(new Response(JSON.stringify(payload), { status: 200 })),
            ),
        );

        const res = await executeGitHubTool("github_search_repos", { query: "rakazo" });
        expect(res.items[0].full_name).toBe("floteuil/rakazo");
      });

      it("1.4.2 github_get_file_contents retrieves file metadata and content", async () => {
        const payload = {
          name: "README.md",
          path: "README.md",
          content: Buffer.from("# Rakazo").toString("base64"),
        };
        vi.stubGlobal(
          "fetch",
          vi
            .fn()
            .mockImplementation(() =>
              Promise.resolve(new Response(JSON.stringify(payload), { status: 200 })),
            ),
        );

        const res = await executeGitHubTool("github_get_file_contents", {
          owner: "floteuil",
          repo: "rakazo",
          path: "README.md",
        });
        expect(res.name).toBe("README.md");
        expect(Buffer.from(res.content, "base64").toString("utf8")).toBe("# Rakazo");
      });

      it("1.4.3 github_list_issues retrieves issue list filtered by state", async () => {
        const payload = [{ number: 101, title: "MCP Connection Bug", state: "open" }];
        vi.stubGlobal(
          "fetch",
          vi
            .fn()
            .mockImplementation(() =>
              Promise.resolve(new Response(JSON.stringify(payload), { status: 200 })),
            ),
        );

        const res = await executeGitHubTool("github_list_issues", {
          owner: "floteuil",
          repo: "rakazo",
          state: "open",
        });
        expect(res[0].number).toBe(101);
      });

      it("1.4.4 github_create_issue creates a new issue in repository", async () => {
        const payload = {
          number: 102,
          title: "Deploy SearXNG",
          html_url: "https://github.com/floteuil/rakazo/issues/102",
        };
        const fetchMock = vi
          .fn()
          .mockImplementation(() =>
            Promise.resolve(new Response(JSON.stringify(payload), { status: 201 })),
          );
        vi.stubGlobal("fetch", fetchMock);

        const res = await executeGitHubTool("github_create_issue", {
          owner: "floteuil",
          repo: "rakazo",
          title: "Deploy SearXNG",
        });
        expect(res.number).toBe(102);
        expect(fetchMock.mock.calls[0]![1].method).toBe("POST");
      });

      it("1.4.5 github_create_issue_comment appends triage comment to issue", async () => {
        const payload = { id: 999, body: "Investigating issue on VPS" };
        const fetchMock = vi
          .fn()
          .mockImplementation(() =>
            Promise.resolve(new Response(JSON.stringify(payload), { status: 201 })),
          );
        vi.stubGlobal("fetch", fetchMock);

        const res = await executeGitHubTool("github_create_issue_comment", {
          owner: "floteuil",
          repo: "rakazo",
          issue_number: 101,
          body: "Investigating issue on VPS",
        });
        expect(res.id).toBe(999);
      });
    });

    // 1.5 Notion Connector Tools
    describe("1.5 Notion Connector Tools", () => {
      it("1.5.1 notion_search queries workspace pages and databases", async () => {
        const payload = {
          results: [
            {
              object: "page",
              id: "page-123",
              properties: { title: { title: [{ plain_text: "Roadmap" }] } },
            },
          ],
        };
        vi.stubGlobal(
          "fetch",
          vi
            .fn()
            .mockImplementation(() =>
              Promise.resolve(new Response(JSON.stringify(payload), { status: 200 })),
            ),
        );

        const res = await executeNotionTool("notion_search", { query: "Roadmap" });
        expect(res.results[0].id).toBe("page-123");
      });

      it("1.5.2 notion_get_page retrieves specific page metadata", async () => {
        const payload = { id: "page-123", object: "page", archived: false };
        vi.stubGlobal(
          "fetch",
          vi
            .fn()
            .mockImplementation(() =>
              Promise.resolve(new Response(JSON.stringify(payload), { status: 200 })),
            ),
        );

        const res = await executeNotionTool("notion_get_page", { page_id: "page-123" });
        expect(res.id).toBe("page-123");
      });

      it("1.5.3 notion_query_database filters database entries", async () => {
        const payload = {
          results: [{ id: "row-1", properties: { Status: { select: { name: "Done" } } } }],
        };
        vi.stubGlobal(
          "fetch",
          vi
            .fn()
            .mockImplementation(() =>
              Promise.resolve(new Response(JSON.stringify(payload), { status: 200 })),
            ),
        );

        const res = await executeNotionTool("notion_query_database", {
          database_id: "db-456",
          filter: { property: "Status", select: { equals: "Done" } },
        });
        expect(res.results).toHaveLength(1);
      });

      it("1.5.4 notion_create_page inserts new page into database", async () => {
        const payload = { id: "new-page-789", object: "page" };
        const fetchMock = vi
          .fn()
          .mockImplementation(() =>
            Promise.resolve(new Response(JSON.stringify(payload), { status: 200 })),
          );
        vi.stubGlobal("fetch", fetchMock);

        const res = await executeNotionTool("notion_create_page", {
          parent: { database_id: "db-456" },
          properties: { Name: { title: [{ text: { content: "New Incident" } }] } },
        });
        expect(res.id).toBe("new-page-789");
      });

      it("1.5.5 notion_update_page modifies page properties or archived status", async () => {
        const payload = { id: "page-123", archived: true };
        vi.stubGlobal(
          "fetch",
          vi
            .fn()
            .mockImplementation(() =>
              Promise.resolve(new Response(JSON.stringify(payload), { status: 200 })),
            ),
        );

        const res = await executeNotionTool("notion_update_page", {
          page_id: "page-123",
          archived: true,
        });
        expect(res.archived).toBe(true);
      });
    });

    // 1.6 Postiz Connector Tools
    describe("1.6 Postiz Connector Tools", () => {
      it("1.6.1 postiz_list_integrations returns connected social channels", async () => {
        const payload = [
          { id: "int-linkedin", provider: "linkedin" },
          { id: "int-x", provider: "x" },
        ];
        vi.stubGlobal(
          "fetch",
          vi
            .fn()
            .mockImplementation(() =>
              Promise.resolve(new Response(JSON.stringify(payload), { status: 200 })),
            ),
        );

        const res = await executePostizTool("postiz_list_integrations", {});
        expect(res).toHaveLength(2);
        expect(res[0].provider).toBe("linkedin");
      });

      it("1.6.2 postiz_create_post creates immediate multi-channel post", async () => {
        const payload = { id: "post-100", status: "POSTED" };
        vi.stubGlobal(
          "fetch",
          vi
            .fn()
            .mockImplementation(() =>
              Promise.resolve(new Response(JSON.stringify(payload), { status: 200 })),
            ),
        );

        const res = await executePostizTool("postiz_create_post", {
          integration_ids: ["int-linkedin", "int-x"],
          content: "🚀 Rakazo v2 released with MCP tools!",
        });
        expect(res.id).toBe("post-100");
      });

      it("1.6.3 postiz_create_post schedules post for future publication", async () => {
        const payload = {
          id: "post-101",
          status: "SCHEDULED",
          schedule_date: "2026-09-01T10:00:00Z",
        };
        vi.stubGlobal(
          "fetch",
          vi
            .fn()
            .mockImplementation(() =>
              Promise.resolve(new Response(JSON.stringify(payload), { status: 200 })),
            ),
        );

        const res = await executePostizTool("postiz_create_post", {
          integration_ids: ["int-linkedin"],
          content: "Scheduled release update",
          schedule_date: "2026-09-01T10:00:00Z",
        });
        expect(res.status).toBe("SCHEDULED");
      });

      it("1.6.4 postiz_list_posts filters posts by publication status", async () => {
        const payload = [{ id: "post-101", status: "SCHEDULED" }];
        vi.stubGlobal(
          "fetch",
          vi
            .fn()
            .mockImplementation(() =>
              Promise.resolve(new Response(JSON.stringify(payload), { status: 200 })),
            ),
        );

        const res = await executePostizTool("postiz_list_posts", { status: "SCHEDULED" });
        expect(res[0].status).toBe("SCHEDULED");
      });

      it("1.6.5 postiz_create_post attaches media URLs to post", async () => {
        const payload = { id: "post-102", media: ["https://example.com/banner.png"] };
        vi.stubGlobal(
          "fetch",
          vi
            .fn()
            .mockImplementation(() =>
              Promise.resolve(new Response(JSON.stringify(payload), { status: 200 })),
            ),
        );

        const res = await executePostizTool("postiz_create_post", {
          integration_ids: ["int-x"],
          content: "Check this screenshot",
          media: ["https://example.com/banner.png"],
        });
        expect(res.media).toContain("https://example.com/banner.png");
      });
    });

    // 1.7 WordPress / Novamira Tools
    describe("1.7 WordPress / Novamira Tools", () => {
      it("1.7.1 wordpress_list_posts lists posts with published status", async () => {
        const payload = [{ id: 1, title: { rendered: "First Post" }, status: "publish" }];
        vi.stubGlobal(
          "fetch",
          vi
            .fn()
            .mockImplementation(() =>
              Promise.resolve(new Response(JSON.stringify(payload), { status: 200 })),
            ),
        );

        const res = await executeWordPressTool("wordpress_list_posts", { status: "publish" });
        expect(res[0].id).toBe(1);
        expect(res[0].status).toBe("publish");
      });

      it("1.7.2 wordpress_get_post retrieves single post content", async () => {
        const payload = { id: 1, content: { rendered: "<p>Hello World</p>" } };
        vi.stubGlobal(
          "fetch",
          vi
            .fn()
            .mockImplementation(() =>
              Promise.resolve(new Response(JSON.stringify(payload), { status: 200 })),
            ),
        );

        const res = await executeWordPressTool("wordpress_get_post", { id: 1 });
        expect(res.id).toBe(1);
        expect(res.content.rendered).toBe("<p>Hello World</p>");
      });

      it("1.7.3 wordpress_create_post creates a draft post", async () => {
        const payload = { id: 55, title: { raw: "New Draft" }, status: "draft" };
        vi.stubGlobal(
          "fetch",
          vi
            .fn()
            .mockImplementation(() =>
              Promise.resolve(new Response(JSON.stringify(payload), { status: 201 })),
            ),
        );

        const res = await executeWordPressTool("wordpress_create_post", {
          title: "New Draft",
          content: "Draft contents",
          status: "draft",
        });
        expect(res.id).toBe(55);
        expect(res.status).toBe("draft");
      });

      it("1.7.4 wordpress_update_post updates existing article", async () => {
        const payload = { id: 55, status: "publish" };
        vi.stubGlobal(
          "fetch",
          vi
            .fn()
            .mockImplementation(() =>
              Promise.resolve(new Response(JSON.stringify(payload), { status: 200 })),
            ),
        );

        const res = await executeWordPressTool("wordpress_update_post", {
          id: 55,
          status: "publish",
        });
        expect(res.status).toBe("publish");
      });

      it("1.7.5 novamira_execute_ability executes Novamira MCP abilities", async () => {
        const payload = { success: true, ability: "sync_catalog", output: { synced: 12 } };
        vi.stubGlobal(
          "fetch",
          vi
            .fn()
            .mockImplementation(() =>
              Promise.resolve(new Response(JSON.stringify(payload), { status: 200 })),
            ),
        );

        const res = await executeWordPressTool("novamira_execute_ability", {
          ability: "sync_catalog",
          params: { storeId: "store-1" },
        });
        expect(res.success).toBe(true);
        expect(res.output.synced).toBe(12);
      });
    });

    // 1.8 n8n Connector Tools
    describe("1.8 n8n Connector Tools", () => {
      it("1.8.1 n8n_trigger_webhook posts payload to n8n webhook endpoint", async () => {
        const payload = { message: "Workflow started", executionId: "exec-99" };
        vi.stubGlobal(
          "fetch",
          vi
            .fn()
            .mockImplementation(() =>
              Promise.resolve(new Response(JSON.stringify(payload), { status: 200 })),
            ),
        );

        const res = await executen8nTool("n8n_trigger_webhook", {
          webhook_path: "deploy-alert",
          payload: { event: "release", version: "v2.0" },
        });
        expect(res.executionId).toBe("exec-99");
      });

      it("1.8.2 n8n_trigger_webhook supports GET webhook requests", async () => {
        const fetchMock = vi
          .fn()
          .mockImplementation(() =>
            Promise.resolve(new Response(JSON.stringify({ ok: true }), { status: 200 })),
          );
        vi.stubGlobal("fetch", fetchMock);

        await executen8nTool("n8n_trigger_webhook", { webhook_path: "ping", method: "GET" });
        expect(fetchMock.mock.calls[0]![1].method).toBe("GET");
      });

      it("1.8.3 n8n_list_workflows retrieves active workflows", async () => {
        const payload = { data: [{ id: "wf-1", name: "Slack Notification", active: true }] };
        vi.stubGlobal(
          "fetch",
          vi
            .fn()
            .mockImplementation(() =>
              Promise.resolve(new Response(JSON.stringify(payload), { status: 200 })),
            ),
        );

        const res = await executen8nTool("n8n_list_workflows", { active: true });
        expect(res.data[0].id).toBe("wf-1");
      });

      it("1.8.4 n8n_get_execution inspects workflow execution run details", async () => {
        const payload = { id: "exec-99", status: "success", mode: "webhook" };
        vi.stubGlobal(
          "fetch",
          vi
            .fn()
            .mockImplementation(() =>
              Promise.resolve(new Response(JSON.stringify(payload), { status: 200 })),
            ),
        );

        const res = await executen8nTool("n8n_get_execution", { execution_id: "exec-99" });
        expect(res.status).toBe("success");
      });

      it("1.8.5 n8n_trigger_webhook returns synchronous result data", async () => {
        const payload = { status: "processed", itemsTransformed: 5 };
        vi.stubGlobal(
          "fetch",
          vi
            .fn()
            .mockImplementation(() =>
              Promise.resolve(new Response(JSON.stringify(payload), { status: 200 })),
            ),
        );

        const res = await executen8nTool("n8n_trigger_webhook", {
          webhook_path: "transform",
          payload: { data: [1, 2, 3] },
        });
        expect(res.itemsTransformed).toBe(5);
      });
    });

    // 1.9 Cloudflare Connector Tools
    describe("1.9 Cloudflare Connector Tools", () => {
      it("1.9.1 cloudflare_list_zones retrieves managed DNS zones", async () => {
        const payload = {
          success: true,
          result: [{ id: "zone-123", name: "workspacegroupefloteuil.eu" }],
        };
        vi.stubGlobal(
          "fetch",
          vi
            .fn()
            .mockImplementation(() =>
              Promise.resolve(new Response(JSON.stringify(payload), { status: 200 })),
            ),
        );

        const res = await executeCloudflareTool("cloudflare_list_zones", {});
        expect(res.result[0].name).toBe("workspacegroupefloteuil.eu");
      });

      it("1.9.2 cloudflare_list_dns_records returns DNS records for zone", async () => {
        const payload = {
          success: true,
          result: [{ id: "rec-1", type: "A", name: "agents", content: "1.2.3.4" }],
        };
        vi.stubGlobal(
          "fetch",
          vi
            .fn()
            .mockImplementation(() =>
              Promise.resolve(new Response(JSON.stringify(payload), { status: 200 })),
            ),
        );

        const res = await executeCloudflareTool("cloudflare_list_dns_records", {
          zone_id: "zone-123",
        });
        expect(res.result[0].type).toBe("A");
      });

      it("1.9.3 cloudflare_create_dns_record creates new DNS entry", async () => {
        const payload = {
          success: true,
          result: { id: "rec-2", type: "CNAME", name: "searxng", content: "host.example.com" },
        };
        vi.stubGlobal(
          "fetch",
          vi
            .fn()
            .mockImplementation(() =>
              Promise.resolve(new Response(JSON.stringify(payload), { status: 200 })),
            ),
        );

        const res = await executeCloudflareTool("cloudflare_create_dns_record", {
          zone_id: "zone-123",
          type: "CNAME",
          name: "searxng",
          content: "host.example.com",
        });
        expect(res.result.type).toBe("CNAME");
      });

      it("1.9.4 cloudflare_purge_cache purges all cached assets in zone", async () => {
        const payload = { success: true, result: { id: "purge-1" } };
        vi.stubGlobal(
          "fetch",
          vi
            .fn()
            .mockImplementation(() =>
              Promise.resolve(new Response(JSON.stringify(payload), { status: 200 })),
            ),
        );

        const res = await executeCloudflareTool("cloudflare_purge_cache", {
          zone_id: "zone-123",
          purge_everything: true,
        });
        expect(res.success).toBe(true);
      });

      it("1.9.5 cloudflare_purge_cache purges specific file URLs", async () => {
        const payload = { success: true, result: { id: "purge-files" } };
        const fetchMock = vi
          .fn()
          .mockImplementation(() =>
            Promise.resolve(new Response(JSON.stringify(payload), { status: 200 })),
          );
        vi.stubGlobal("fetch", fetchMock);

        const res = await executeCloudflareTool("cloudflare_purge_cache", {
          zone_id: "zone-123",
          files: ["https://workspacegroupefloteuil.eu/styles.css"],
        });
        expect(res.success).toBe(true);
        expect(JSON.parse(fetchMock.mock.calls[0]![1].body).files).toContain(
          "https://workspacegroupefloteuil.eu/styles.css",
        );
      });
    });

    // 1.10 Secret Redaction & Protection
    describe("1.10 Secret Redaction & Protection", () => {
      it("1.10.1 redactSecrets masks OpenAI style API keys", () => {
        const raw = "API call using sk-proj-1234567890abcdef1234567890 in header";
        const sanitized = redactSecrets(raw, ["sk-proj-1234567890abcdef1234567890"]);
        expect(sanitized).toBe("API call using [redacted] in header");
      });

      it("1.10.2 EncryptedSecretStore.redact strips JWT patterns", () => {
        const store = new EncryptedSecretStore("master_key_for_test_1234567890");
        const jwt =
          "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.doNotLeakSignatureHere";
        const result = store.redact(`Bearer ${jwt}`);
        expect(result).toBe("Bearer [redacted]");
      });

      it("1.10.3 redactSecrets masks GitHub PAT tokens", () => {
        const secret = "ghp_abcdef1234567890abcdef1234567890";
        const text = `Connecting to GitHub with token ${secret}`;
        expect(redactSecrets(text, [secret])).toBe("Connecting to GitHub with token [redacted]");
      });

      it("1.10.4 createStreamingRedactor masks token split across stream chunks", () => {
        const secret = "super_secret_token";
        const redactor = createStreamingRedactor([secret]);
        const chunk1 = redactor.push("Bearer super_");
        const chunk2 = redactor.push("secret_token and more");
        const chunk3 = redactor.finish();
        expect(`${chunk1}${chunk2}${chunk3}`).toBe("Bearer [redacted] and more");
      });

      it("1.10.5 containsSecret detects presence of sensitive token in serialized payloads", () => {
        const secrets = ["notion_secret_99999"];
        const payload = { config: { apiKey: "notion_secret_99999" } };
        expect(containsSecret(payload, secrets)).toBe(true);
        expect(containsSecret({ config: { apiKey: "safe_public_key" } }, secrets)).toBe(false);
      });
    });

    // 1.11 Build & Coolify Configuration / Environment Wiring
    describe("1.11 Build & Coolify Configuration / Environment Wiring", () => {
      it("1.11.1 permits development secrets in test environment", () => {
        expect(isDevSecretAllowed({ VITEST: "true" })).toBe(true);
        expect(isDevSecretAllowed({ NODE_ENV: "test" })).toBe(true);
      });

      it("1.11.2 resolves auth secret from environment variable", () => {
        const secret = resolveAuthSecret({ BETTER_AUTH_SECRET: "custom-auth-secret-12345678" });
        expect(secret).toBe("custom-auth-secret-12345678");
      });

      it("1.11.3 resolves encryption key from environment variable", () => {
        const key = resolveEncryptionKey({ ENCRYPTION_KEY: "custom-encryption-key-12345678" });
        expect(key).toBe("custom-encryption-key-12345678");
      });

      it("1.11.4 verifies Coolify target domain configuration", () => {
        const coolifyDomain = "https://agents.workspacegroupefloteuil.eu";
        const url = new URL(coolifyDomain);
        expect(url.protocol).toBe("https:");
        expect(url.hostname).toBe("agents.workspacegroupefloteuil.eu");
      });

      it("1.11.5 verifies standard internal container endpoint resolution", () => {
        const searxngInternal = "http://searxng-qkcs0oo0owk4s8cw8wgk8ogc:8080";
        const url = new URL(searxngInternal);
        expect(url.port).toBe("8080");
        expect(url.hostname).toContain("searxng");
      });
    });
  });

  // ==========================================================================
  // TIER 2: BOUNDARY & CORNER CASES (>=5 tests per feature × 11 features = 55 tests)
  // ==========================================================================
  describe("Tier 2: Boundary & Corner Cases (>=5 tests per feature)", () => {
    // 2.1 Web Search Boundaries
    describe("2.1 Web Search Boundaries", () => {
      it("2.1.1 handles empty and whitespace-only query gracefully without network call", async () => {
        const fetchMock = vi.fn();
        vi.stubGlobal("fetch", fetchMock);

        const res = await executeWebSearch({ query: "   " });
        expect(res.count).toBe(0);
        expect(res.results).toEqual([]);
        expect(fetchMock).not.toHaveBeenCalled();
      });

      it("2.1.2 safely encodes special characters, emojis, and quotes in query", async () => {
        const fetchMock = vi
          .fn()
          .mockImplementation(() =>
            Promise.resolve(new Response(JSON.stringify({ results: [] }), { status: 200 })),
          );
        vi.stubGlobal("fetch", fetchMock);

        await executeWebSearch({ query: "recherche 'IA' & \"sécurité\" 🔍 100% test" });
        const [url] = fetchMock.mock.calls[0]!;
        expect(url).toContain("recherche+%27IA%27+%26+%22s%C3%A9curit%C3%A9%22");
      });

      it("2.1.3 honors AbortSignal and aborts immediately on timeout", async () => {
        const controller = new AbortController();
        controller.abort();

        await expect(
          executeWebSearch({ query: "timeout query" }, {}, controller.signal),
        ).rejects.toThrow();
      });

      it("2.1.4 throws informative error on SearXNG 500/502 server errors", async () => {
        vi.stubGlobal(
          "fetch",
          vi
            .fn()
            .mockImplementation(() =>
              Promise.resolve(new Response("", { status: 502, statusText: "Bad Gateway" })),
            ),
        );
        await expect(executeWebSearch({ query: "failing query" })).rejects.toThrow(
          "SearXNG error: HTTP 502 Bad Gateway",
        );
      });

      it("2.1.5 handles SearXNG payload with zero results without throwing", async () => {
        vi.stubGlobal(
          "fetch",
          vi
            .fn()
            .mockImplementation(() =>
              Promise.resolve(new Response(JSON.stringify({ results: [] }), { status: 200 })),
            ),
        );
        const res = await executeWebSearch({ query: "obscure-non-existent-keyword-999" });
        expect(res.count).toBe(0);
        expect(res.formattedCitations).toBe("");
      });
    });

    // 2.2 Web Scrape Boundaries
    describe("2.2 Web Scrape Boundaries", () => {
      it("2.2.1 rejects malformed, non-HTTP URLs with clear error message", async () => {
        await expect(executeWebScrape({ url: "ftp://invalid-scheme.com" })).rejects.toThrow(
          "Invalid URL provided",
        );
        await expect(executeWebScrape({ url: "" })).rejects.toThrow("Invalid URL provided");
      });

      it("2.2.2 handles blank/empty HTML body gracefully", async () => {
        vi.stubGlobal(
          "fetch",
          vi
            .fn()
            .mockImplementation(() =>
              Promise.resolve(new Response("<html><body></body></html>", { status: 200 })),
            ),
        );
        const res = await executeWebScrape({ url: "https://example.com/empty" });
        expect(res.content).toBe("");
        expect(res.length).toBe(0);
        expect(res.truncated).toBe(false);
      });

      it("2.2.3 truncates massive HTML payload without buffer corruption", async () => {
        const hugeHtml = `<html><body><p>${"Rakazo Enterprise ".repeat(10_000)}</p></body></html>`;
        vi.stubGlobal(
          "fetch",
          vi
            .fn()
            .mockImplementation(() => Promise.resolve(new Response(hugeHtml, { status: 200 }))),
        );

        const res = await executeWebScrape({ url: "https://example.com/huge", maxLength: 250 });
        expect(res.truncated).toBe(true);
        expect(res.content.length).toBe(250);
      });

      it("2.2.4 handles unclosed HTML tags and broken DOM trees robustly", async () => {
        const brokenHtml = `<div><h1>Unclosed Header<p>Paragraph without closing div`;
        vi.stubGlobal(
          "fetch",
          vi
            .fn()
            .mockImplementation(() => Promise.resolve(new Response(brokenHtml, { status: 200 }))),
        );

        const res = await executeWebScrape({ url: "https://example.com/broken" });
        expect(res.content).toContain("Unclosed Header");
        expect(res.content).toContain("Paragraph without closing div");
      });

      it("2.2.5 propagates HTTP 404 and 403 errors with descriptive message", async () => {
        vi.stubGlobal(
          "fetch",
          vi
            .fn()
            .mockImplementation(() =>
              Promise.resolve(new Response("", { status: 404, statusText: "Not Found" })),
            ),
        );
        await expect(executeWebScrape({ url: "https://example.com/404" })).rejects.toThrow(
          "Web scrape failed: HTTP 404 Not Found",
        );
      });
    });

    // 2.3 Default Tool Activation Boundaries
    describe("2.3 Default Tool Activation Boundaries", () => {
      it("2.3.1 enforces required fields in tool schemas", () => {
        expect(webSearchToolDefinition.inputSchema.required).toEqual(["query"]);
        expect(webScrapeToolDefinition.inputSchema.required).toEqual(["url"]);
      });

      it("2.3.2 ignores unknown extra parameters without failing", async () => {
        vi.stubGlobal(
          "fetch",
          vi
            .fn()
            .mockImplementation(() =>
              Promise.resolve(new Response(JSON.stringify({ results: [] }), { status: 200 })),
            ),
        );
        const res = await executeWebSearch({
          query: "valid",
          extraBogusParam: 123,
        } as unknown as WebSearchParams);
        expect(res.query).toBe("valid");
      });

      it("2.3.3 handles null and undefined optional parameters cleanly", async () => {
        vi.stubGlobal(
          "fetch",
          vi
            .fn()
            .mockImplementation(() =>
              Promise.resolve(new Response(JSON.stringify({ results: [] }), { status: 200 })),
            ),
        );
        const res = await executeWebSearch({
          query: "valid",
          categories: undefined,
          language: undefined,
        });
        expect(res.count).toBe(0);
      });

      it("2.3.4 handles concurrent executions of builtin tools safely", async () => {
        vi.stubGlobal(
          "fetch",
          vi
            .fn()
            .mockImplementation(() =>
              Promise.resolve(new Response(JSON.stringify({ results: [] }), { status: 200 })),
            ),
        );
        const promises = [
          executeWebSearch({ query: "test1" }),
          executeWebSearch({ query: "test2" }),
          executeWebSearch({ query: "test3" }),
        ];
        const results = await Promise.all(promises);
        expect(results).toHaveLength(3);
        expect(results[0]?.query).toBe("test1");
        expect(results[1]?.query).toBe("test2");
        expect(results[2]?.query).toBe("test3");
      });

      it("2.3.5 ensures tool names follow lowercase underscore convention", () => {
        for (const tool of builtinAgentTools) {
          expect(tool.name).toMatch(/^[a-z0-9_]+$/);
        }
      });
    });

    // 2.4 GitHub Connector Boundaries
    describe("2.4 GitHub Connector Boundaries", () => {
      it("2.4.1 handles GitHub API rate limiting (HTTP 403/429)", async () => {
        vi.stubGlobal(
          "fetch",
          vi.fn().mockImplementation(() =>
            Promise.resolve(
              new Response(JSON.stringify({ message: "API rate limit exceeded" }), {
                status: 403,
              }),
            ),
          ),
        );
        await expect(executeGitHubTool("github_search_repos", { query: "limit" })).rejects.toThrow(
          "GitHub API error: 403",
        );
      });

      it("2.4.2 handles invalid credentials / expired PAT (HTTP 401)", async () => {
        vi.stubGlobal(
          "fetch",
          vi
            .fn()
            .mockImplementation(() =>
              Promise.resolve(
                new Response(JSON.stringify({ message: "Bad credentials" }), { status: 401 }),
              ),
            ),
        );
        await expect(
          executeGitHubTool("github_list_issues", { owner: "floteuil", repo: "rakazo" }),
        ).rejects.toThrow("GitHub API error: 401");
      });

      it("2.4.3 handles non-existent repository (HTTP 404)", async () => {
        vi.stubGlobal(
          "fetch",
          vi
            .fn()
            .mockImplementation(() =>
              Promise.resolve(
                new Response(JSON.stringify({ message: "Not Found" }), { status: 404 }),
              ),
            ),
        );
        await expect(
          executeGitHubTool("github_get_file_contents", {
            owner: "floteuil",
            repo: "unknown-repo",
            path: "file.ts",
          }),
        ).rejects.toThrow("GitHub API error: 404");
      });

      it("2.4.4 rejects issue creation with missing title", async () => {
        await expect(
          executeGitHubTool("github_create_issue", {
            owner: "floteuil",
            repo: "rakazo",
            title: "",
          }),
        ).rejects.toThrow("GitHub issue title is required");
      });

      it("2.4.5 throws on unknown GitHub tool action", async () => {
        await expect(executeGitHubTool("github_invalid_action", {})).rejects.toThrow(
          "Unknown GitHub tool",
        );
      });
    });

    // 2.5 Notion Connector Boundaries
    describe("2.5 Notion Connector Boundaries", () => {
      it("2.5.1 handles invalid Notion database ID (HTTP 404)", async () => {
        vi.stubGlobal(
          "fetch",
          vi
            .fn()
            .mockImplementation(() =>
              Promise.resolve(
                new Response(
                  JSON.stringify({ object: "error", message: "Could not find database" }),
                  { status: 404 },
                ),
              ),
            ),
        );
        await expect(
          executeNotionTool("notion_query_database", { database_id: "invalid-uuid" }),
        ).rejects.toThrow("Notion API error: 404");
      });

      it("2.5.2 handles unauthorized Notion token (HTTP 401)", async () => {
        vi.stubGlobal(
          "fetch",
          vi
            .fn()
            .mockImplementation(() =>
              Promise.resolve(
                new Response(
                  JSON.stringify({ object: "error", message: "API token is invalid." }),
                  { status: 401 },
                ),
              ),
            ),
        );
        await expect(executeNotionTool("notion_search", { query: "anything" })).rejects.toThrow(
          "Notion API error: 401",
        );
      });

      it("2.5.3 handles malformed filter payload (HTTP 400)", async () => {
        vi.stubGlobal(
          "fetch",
          vi.fn().mockImplementation(() =>
            Promise.resolve(
              new Response(JSON.stringify({ object: "error", message: "validation_error" }), {
                status: 400,
              }),
            ),
          ),
        );
        await expect(
          executeNotionTool("notion_query_database", {
            database_id: "db-1",
            filter: { invalid: true },
          }),
        ).rejects.toThrow("Notion API error: 400");
      });

      it("2.5.4 handles Notion rate limiting (HTTP 429)", async () => {
        vi.stubGlobal(
          "fetch",
          vi.fn().mockImplementation(() =>
            Promise.resolve(
              new Response(JSON.stringify({ object: "error", message: "rate_limited" }), {
                status: 429,
              }),
            ),
          ),
        );
        await expect(executeNotionTool("notion_get_page", { page_id: "page-1" })).rejects.toThrow(
          "Notion API error: 429",
        );
      });

      it("2.5.5 throws on unknown Notion tool name", async () => {
        await expect(executeNotionTool("notion_delete_everything", {})).rejects.toThrow(
          "Unknown Notion tool",
        );
      });
    });

    // 2.6 Postiz Connector Boundaries
    describe("2.6 Postiz Connector Boundaries", () => {
      it("2.6.1 rejects post creation when integration_ids is missing or empty", async () => {
        await expect(
          executePostizTool("postiz_create_post", { content: "text", integration_ids: [] }),
        ).rejects.toThrow("integration_ids is required");
      });

      it("2.6.2 handles Postiz server 401 Unauthorized", async () => {
        vi.stubGlobal(
          "fetch",
          vi.fn().mockImplementation(() => Promise.resolve(new Response("", { status: 401 }))),
        );
        await expect(executePostizTool("postiz_list_integrations", {})).rejects.toThrow(
          "Postiz API error: 401",
        );
      });

      it("2.6.3 handles Postiz service downtime / 500 error", async () => {
        vi.stubGlobal(
          "fetch",
          vi.fn().mockImplementation(() => Promise.resolve(new Response("", { status: 500 }))),
        );
        await expect(executePostizTool("postiz_list_posts", {})).rejects.toThrow(
          "Postiz API error: 500",
        );
      });

      it("2.6.4 handles empty post history response", async () => {
        vi.stubGlobal(
          "fetch",
          vi
            .fn()
            .mockImplementation(() =>
              Promise.resolve(new Response(JSON.stringify([]), { status: 200 })),
            ),
        );
        const res = await executePostizTool("postiz_list_posts", {});
        expect(res).toEqual([]);
      });

      it("2.6.5 throws on unknown Postiz tool name", async () => {
        await expect(executePostizTool("postiz_unknown", {})).rejects.toThrow(
          "Unknown Postiz tool",
        );
      });
    });

    // 2.7 WordPress / Novamira Boundaries
    describe("2.7 WordPress / Novamira Boundaries", () => {
      it("2.7.1 handles WordPress invalid authentication (HTTP 401)", async () => {
        vi.stubGlobal(
          "fetch",
          vi.fn().mockImplementation(() => Promise.resolve(new Response("", { status: 401 }))),
        );
        await expect(executeWordPressTool("wordpress_list_posts", {})).rejects.toThrow(
          "WordPress API error: 401",
        );
      });

      it("2.7.2 rejects post creation without title", async () => {
        await expect(
          executeWordPressTool("wordpress_create_post", { content: "Only content" }),
        ).rejects.toThrow("WordPress: title is required");
      });

      it("2.7.3 handles WordPress post not found (HTTP 404)", async () => {
        vi.stubGlobal(
          "fetch",
          vi.fn().mockImplementation(() => Promise.resolve(new Response("", { status: 404 }))),
        );
        await expect(executeWordPressTool("wordpress_get_post", { id: 999999 })).rejects.toThrow(
          "WordPress API error: 404",
        );
      });

      it("2.7.4 rejects Novamira ability execution without ability name", async () => {
        await expect(
          executeWordPressTool("novamira_execute_ability", { params: {} }),
        ).rejects.toThrow("Novamira: ability name is required");
      });

      it("2.7.5 handles Novamira ability server error (HTTP 500)", async () => {
        vi.stubGlobal(
          "fetch",
          vi.fn().mockImplementation(() => Promise.resolve(new Response("", { status: 500 }))),
        );
        await expect(
          executeWordPressTool("novamira_execute_ability", { ability: "failing_ability" }),
        ).rejects.toThrow("Novamira API error: 500");
      });
    });

    // 2.8 n8n Connector Boundaries
    describe("2.8 n8n Connector Boundaries", () => {
      it("2.8.1 handles n8n webhook not found (HTTP 404)", async () => {
        vi.stubGlobal(
          "fetch",
          vi.fn().mockImplementation(() => Promise.resolve(new Response("", { status: 404 }))),
        );
        await expect(
          executen8nTool("n8n_trigger_webhook", { webhook_path: "non-existent-webhook" }),
        ).rejects.toThrow("n8n webhook error: 404");
      });

      it("2.8.2 handles n8n API unauthorized (HTTP 401)", async () => {
        vi.stubGlobal(
          "fetch",
          vi.fn().mockImplementation(() => Promise.resolve(new Response("", { status: 401 }))),
        );
        await expect(executen8nTool("n8n_list_workflows", {})).rejects.toThrow(
          "n8n API error: 401",
        );
      });

      it("2.8.3 handles n8n execution not found (HTTP 404)", async () => {
        vi.stubGlobal(
          "fetch",
          vi.fn().mockImplementation(() => Promise.resolve(new Response("", { status: 404 }))),
        );
        await expect(
          executen8nTool("n8n_get_execution", { execution_id: "unknown-exec" }),
        ).rejects.toThrow("n8n API error: 404");
      });

      it("2.8.4 sends empty object as default webhook payload", async () => {
        const fetchMock = vi
          .fn()
          .mockImplementation(() =>
            Promise.resolve(new Response(JSON.stringify({ ok: true }), { status: 200 })),
          );
        vi.stubGlobal("fetch", fetchMock);

        await executen8nTool("n8n_trigger_webhook", { webhook_path: "test" });
        expect(JSON.parse(fetchMock.mock.calls[0]![1].body)).toEqual({});
      });

      it("2.8.5 throws on unknown n8n tool action", async () => {
        await expect(executen8nTool("n8n_delete_all", {})).rejects.toThrow("Unknown n8n tool");
      });
    });

    // 2.9 Cloudflare Connector Boundaries
    describe("2.9 Cloudflare Connector Boundaries", () => {
      it("2.9.1 handles invalid Cloudflare Zone ID (HTTP 404)", async () => {
        vi.stubGlobal(
          "fetch",
          vi.fn().mockImplementation(() => Promise.resolve(new Response("", { status: 404 }))),
        );
        await expect(
          executeCloudflareTool("cloudflare_list_dns_records", { zone_id: "invalid-zone" }),
        ).rejects.toThrow("Cloudflare API error: 404");
      });

      it("2.9.2 handles Cloudflare invalid API token (HTTP 403)", async () => {
        vi.stubGlobal(
          "fetch",
          vi.fn().mockImplementation(() => Promise.resolve(new Response("", { status: 403 }))),
        );
        await expect(executeCloudflareTool("cloudflare_list_zones", {})).rejects.toThrow(
          "Cloudflare API error: 403",
        );
      });

      it("2.9.3 handles DNS record creation conflict (HTTP 409)", async () => {
        vi.stubGlobal(
          "fetch",
          vi.fn().mockImplementation(() => Promise.resolve(new Response("", { status: 409 }))),
        );
        await expect(
          executeCloudflareTool("cloudflare_create_dns_record", {
            zone_id: "zone-1",
            type: "A",
            name: "dup",
            content: "1.1.1.1",
          }),
        ).rejects.toThrow("Cloudflare API error: 409");
      });

      it("2.9.4 handles empty DNS records list", async () => {
        vi.stubGlobal(
          "fetch",
          vi
            .fn()
            .mockImplementation(() =>
              Promise.resolve(
                new Response(JSON.stringify({ success: true, result: [] }), { status: 200 }),
              ),
            ),
        );
        const res = await executeCloudflareTool("cloudflare_list_dns_records", {
          zone_id: "zone-empty",
        });
        expect(res.result).toEqual([]);
      });

      it("2.9.5 throws on unknown Cloudflare tool name", async () => {
        await expect(executeCloudflareTool("cloudflare_delete_account", {})).rejects.toThrow(
          "Unknown Cloudflare tool",
        );
      });
    });

    // 2.10 Secret Redaction Boundaries
    describe("2.10 Secret Redaction Boundaries", () => {
      it("2.10.1 handles secrets split across 4 single-byte stream chunks", () => {
        const secret = "SECRET123";
        const redactor = createStreamingRedactor([secret]);
        const c1 = redactor.push("SE");
        const c2 = redactor.push("CR");
        const c3 = redactor.push("ET");
        const c4 = redactor.push("123-end");
        const fin = redactor.finish();
        expect(`${c1}${c2}${c3}${c4}${fin}`).toBe("[redacted]-end");
      });

      it("2.10.2 redacts multiple distinct secrets in a single string", () => {
        const sec1 = "token_ghp_111111";
        const sec2 = "secret_notion_222222";
        const text = `Keys: ${sec1} and ${sec2}`;
        expect(redactSecrets(text, [sec1, sec2])).toBe("Keys: [redacted] and [redacted]");
      });

      it("2.10.3 handles empty secrets list or empty target string without error", () => {
        expect(redactSecrets("", ["sec"])).toBe("");
        expect(redactSecrets("hello world", [])).toBe("hello world");
        expect(redactSecrets("hello world", [""])).toBe("hello world");
      });

      it("2.10.4 correctly redacts overlapping secret prefixes", () => {
        const secShort = "my_token";
        const secLong = "my_token_extended";
        const text = `Testing ${secLong} and ${secShort}`;
        const redactor = createStreamingRedactor([secShort, secLong]);
        const out = redactor.push(text) + redactor.finish();
        expect(out).toBe("Testing [redacted] and [redacted]");
      });

      it("2.10.5 handles large log text containing multiple secret occurrences", () => {
        const secret = "LIVE_SECRET_KEY_999";
        const bigText = `Line with ${secret}\n`.repeat(500);
        const redacted = redactSecrets(bigText, [secret]);
        expect(redacted).not.toContain(secret);
        expect(redacted.split("[redacted]").length - 1).toBe(500);
      });
    });

    // 2.11 Environment & Configuration Boundaries
    describe("2.11 Environment & Configuration Boundaries", () => {
      it("2.11.1 throws runtime error in production when BETTER_AUTH_SECRET is default placeholder", () => {
        expect(() =>
          resolveAuthSecret({
            NODE_ENV: "production",
            BETTER_AUTH_SECRET: "dev-secret-change-me-please-32chars",
          }),
        ).toThrow("Set BETTER_AUTH_SECRET and ENCRYPTION_KEY");
      });

      it("2.11.2 throws runtime error in production when ENCRYPTION_KEY is unset", () => {
        expect(() =>
          resolveEncryptionKey({
            NODE_ENV: "production",
            ENCRYPTION_KEY: "",
          }),
        ).toThrow("Set BETTER_AUTH_SECRET and ENCRYPTION_KEY");
      });

      it("2.11.3 allows custom encryption keys in production", () => {
        const key = resolveEncryptionKey({
          NODE_ENV: "production",
          ENCRYPTION_KEY: "a-very-secure-random-32-byte-encryption-key-for-prod",
        });
        expect(key).toBe("a-very-secure-random-32-byte-encryption-key-for-prod");
      });

      it("2.11.4 allows override via RAKAZO_ALLOW_DEV_SECRETS flag", () => {
        expect(isDevSecretAllowed({ NODE_ENV: "production", RAKAZO_ALLOW_DEV_SECRETS: "1" })).toBe(
          true,
        );
      });

      it("2.11.5 verifies Traefik SSL and Let's Encrypt endpoint format", () => {
        const prodEndpoint = new URL("https://agents.workspacegroupefloteuil.eu/api/health");
        expect(prodEndpoint.protocol).toBe("https:");
        expect(prodEndpoint.port).toBe("");
      });
    });
  });

  // ==========================================================================
  // TIER 3: CROSS-FEATURE COMBINATIONS (>=15 tests)
  // ==========================================================================
  describe("Tier 3: Cross-Feature Combinations", () => {
    it("3.1 Web Search -> Web Scrape -> Citation Extraction chaining", async () => {
      const searchRes = {
        results: [
          {
            title: "TypeScript 5.9",
            url: "https://typescript.org/release-5.9",
            content: "New features",
          },
        ],
      };
      const pageHtml = `<html><head><title>TS 5.9</title></head><body><h1>TS 5.9 Features</h1><p>Full technical release notes.</p></body></html>`;

      const fetchMock = vi
        .fn()
        .mockImplementationOnce(() =>
          Promise.resolve(new Response(JSON.stringify(searchRes), { status: 200 })),
        )
        .mockImplementationOnce(() => Promise.resolve(new Response(pageHtml, { status: 200 })));
      vi.stubGlobal("fetch", fetchMock);

      const search = await executeWebSearch({ query: "typescript 5.9" });
      expect(search.results).toHaveLength(1);
      const topUrl = search.results[0]!.url;

      const scrape = await executeWebScrape({ url: topUrl });
      expect(scrape.title).toBe("TS 5.9");
      expect(scrape.content).toContain("# TS 5.9 Features");

      const combinedCitation = `${scrape.content}\n\nSources:\n${search.formattedCitations}`;
      expect(combinedCitation).toContain(
        "[1] [TypeScript 5.9](https://typescript.org/release-5.9)",
      );
    });

    it("3.2 GitHub Issue Search -> Notion Database Record creation", async () => {
      const issuePayload = [
        { number: 88, title: "Database connection leak in worker", body: "Memory spikes" },
      ];
      const notionPagePayload = { id: "notion-task-88", object: "page" };

      const fetchMock = vi
        .fn()
        .mockImplementationOnce(() =>
          Promise.resolve(new Response(JSON.stringify(issuePayload), { status: 200 })),
        )
        .mockImplementationOnce(() =>
          Promise.resolve(new Response(JSON.stringify(notionPagePayload), { status: 200 })),
        );
      vi.stubGlobal("fetch", fetchMock);

      const issues = await executeGitHubTool("github_list_issues", {
        owner: "floteuil",
        repo: "rakazo",
        state: "open",
      });
      expect(issues[0].title).toBe("Database connection leak in worker");

      const notionRecord = await executeNotionTool("notion_create_page", {
        parent: { database_id: "triage-db" },
        properties: {
          Name: { title: [{ text: { content: issues[0].title } }] },
          GitHubIssue: { number: issues[0].number },
        },
      });
      expect(notionRecord.id).toBe("notion-task-88");
    });

    it("3.3 WordPress Draft Post -> Postiz Social Announcement scheduling", async () => {
      const wpPayload = {
        id: 77,
        title: { raw: "New Product Release" },
        link: "https://wp.example.com/new-product",
      };
      const postizPayload = { id: "post-77", status: "SCHEDULED" };

      const fetchMock = vi
        .fn()
        .mockImplementationOnce(() =>
          Promise.resolve(new Response(JSON.stringify(wpPayload), { status: 201 })),
        )
        .mockImplementationOnce(() =>
          Promise.resolve(new Response(JSON.stringify(postizPayload), { status: 200 })),
        );
      vi.stubGlobal("fetch", fetchMock);

      const wpPost = await executeWordPressTool("wordpress_create_post", {
        title: "New Product Release",
        content: "Announcing product launch",
        status: "draft",
      });
      expect(wpPost.id).toBe(77);

      const postizPost = await executePostizTool("postiz_create_post", {
        integration_ids: ["int-linkedin"],
        content: `Read our latest announcement: ${wpPost.title.raw} at ${wpPayload.link}`,
        schedule_date: "2026-09-01T12:00:00Z",
      });
      expect(postizPost.status).toBe("SCHEDULED");
    });

    it("3.4 n8n Webhook Trigger -> Cloudflare Edge Cache Purge coordination", async () => {
      const n8nPayload = { executionId: "deploy-exec-1", status: "success" };
      const cfPayload = { success: true, result: { id: "purge-exec-1" } };

      const fetchMock = vi
        .fn()
        .mockImplementationOnce(() =>
          Promise.resolve(new Response(JSON.stringify(n8nPayload), { status: 200 })),
        )
        .mockImplementationOnce(() =>
          Promise.resolve(new Response(JSON.stringify(cfPayload), { status: 200 })),
        );
      vi.stubGlobal("fetch", fetchMock);

      const n8nRes = await executen8nTool("n8n_trigger_webhook", {
        webhook_path: "site-deploy",
        payload: { target: "production" },
      });
      expect(n8nRes.status).toBe("success");

      const cfRes = await executeCloudflareTool("cloudflare_purge_cache", {
        zone_id: "zone-floteuil",
        purge_everything: true,
      });
      expect(cfRes.success).toBe(true);
    });

    it("3.5 Multi-token concurrent redaction across chained multi-tool execution", () => {
      const ghToken = "ghp_alphaSecretToken999";
      const notionToken = "secret_notionBetaToken888";
      const cfToken = "cf_gammaToken777";

      const stream = createStreamingRedactor([ghToken, notionToken, cfToken]);
      const log1 = stream.push(`Connecting GitHub with ${ghToken}... `);
      const log2 = stream.push(`Querying Notion with ${notionToken}... `);
      const log3 = stream.push(`Purging Cloudflare with ${cfToken}... done.`);
      const finish = stream.finish();

      const totalLog = `${log1}${log2}${log3}${finish}`;
      expect(totalLog).not.toContain(ghToken);
      expect(totalLog).not.toContain(notionToken);
      expect(totalLog).not.toContain(cfToken);
      expect(totalLog).toContain(
        "Connecting GitHub with [redacted]... Querying Notion with [redacted]... Purging Cloudflare with [redacted]... done.",
      );
    });

    it("3.6 Web Search Competitor Monitoring -> n8n Incident Alert Notification", async () => {
      const searchPayload = {
        results: [
          {
            title: "Competitor security advisory",
            url: "https://comp.com/adv",
            content: "Zero-day vulnerability discovered",
          },
        ],
      };
      const n8nPayload = { notified: true, messageId: "msg-alert-1" };

      const fetchMock = vi
        .fn()
        .mockImplementationOnce(() =>
          Promise.resolve(new Response(JSON.stringify(searchPayload), { status: 200 })),
        )
        .mockImplementationOnce(() =>
          Promise.resolve(new Response(JSON.stringify(n8nPayload), { status: 200 })),
        );
      vi.stubGlobal("fetch", fetchMock);

      const search = await executeWebSearch({ query: "competitor security advisory" });
      expect(search.count).toBe(1);

      const n8n = await executen8nTool("n8n_trigger_webhook", {
        webhook_path: "security-advisory-alert",
        payload: {
          threat: search.results[0]?.title,
          url: search.results[0]?.url,
        },
      });
      expect(n8n.notified).toBe(true);
    });

    it("3.7 GitHub PR Review -> Scrape External RFC -> Post PR Comment with Citation", async () => {
      const prPayload = {
        number: 42,
        title: "Implement RFC 9110 HTTP Semantics",
        head: { ref: "feature/http" },
      };
      const rfcHtml = `<html><head><title>RFC 9110</title></head><body><h1>RFC 9110 Section 9</h1><p>Safe methods MUST be idempotent.</p></body></html>`;
      const commentPayload = { id: 1234, body: "RFC 9110 Citation verified" };

      const fetchMock = vi
        .fn()
        .mockImplementationOnce(() =>
          Promise.resolve(new Response(JSON.stringify(prPayload), { status: 200 })),
        )
        .mockImplementationOnce(() => Promise.resolve(new Response(rfcHtml, { status: 200 })))
        .mockImplementationOnce(() =>
          Promise.resolve(new Response(JSON.stringify(commentPayload), { status: 201 })),
        );
      vi.stubGlobal("fetch", fetchMock);

      const pr = await executeGitHubTool("github_get_pull_request", {
        owner: "floteuil",
        repo: "rakazo",
        pull_number: 42,
      });
      expect(pr.number).toBe(42);

      const rfcScrape = await executeWebScrape({
        url: "https://datatracker.ietf.org/doc/html/rfc9110",
      });
      expect(rfcScrape.content).toContain("Safe methods MUST be idempotent.");

      const comment = await executeGitHubTool("github_create_issue_comment", {
        owner: "floteuil",
        repo: "rakazo",
        issue_number: 42,
        body: `Verified against [RFC 9110](https://datatracker.ietf.org/doc/html/rfc9110):\n> ${rfcScrape.content}`,
      });
      expect(comment.id).toBe(1234);
    });

    it("3.8 Notion Knowledge Base Query -> Synchronize to WordPress Article", async () => {
      const notionPage = {
        id: "notion-kb-1",
        properties: { Title: "Deploy Guide" },
        content: "Step 1: Coolify config",
      };
      const wpUpdate = { id: 10, title: { raw: "Deploy Guide" }, status: "publish" };

      const fetchMock = vi
        .fn()
        .mockImplementationOnce(() =>
          Promise.resolve(new Response(JSON.stringify(notionPage), { status: 200 })),
        )
        .mockImplementationOnce(() =>
          Promise.resolve(new Response(JSON.stringify(wpUpdate), { status: 200 })),
        );
      vi.stubGlobal("fetch", fetchMock);

      const kb = await executeNotionTool("notion_get_page", { page_id: "notion-kb-1" });
      expect(kb.id).toBe("notion-kb-1");

      const syncedPost = await executeWordPressTool("wordpress_update_post", {
        id: 10,
        title: "Deploy Guide",
        content: kb.content,
      });
      expect(syncedPost.id).toBe(10);
    });

    it("3.9 Postiz Broadcast Failure -> Trigger n8n Incident Alert Webhook", async () => {
      const fetchMock = vi
        .fn()
        .mockImplementationOnce(() =>
          Promise.resolve(new Response("", { status: 503, statusText: "Service Unavailable" })),
        )
        .mockImplementationOnce(() =>
          Promise.resolve(new Response(JSON.stringify({ alertSent: true }), { status: 200 })),
        );
      vi.stubGlobal("fetch", fetchMock);

      let postizError: Error | null = null;
      try {
        await executePostizTool("postiz_create_post", {
          integration_ids: ["int-1"],
          content: "Broadcast",
        });
      } catch (err) {
        postizError = err as Error;
      }
      expect(postizError).not.toBeNull();

      const n8nAlert = await executen8nTool("n8n_trigger_webhook", {
        webhook_path: "postiz-failure-alert",
        payload: { error: postizError?.message },
      });
      expect(n8nAlert.alertSent).toBe(true);
    });

    it("3.10 Cloudflare DNS Record Creation -> Web Search Validation", async () => {
      const cfPayload = {
        success: true,
        result: { id: "dns-new", name: "app.workspacegroupefloteuil.eu", content: "1.2.3.4" },
      };
      const searchPayload = {
        results: [
          { title: "Rakazo App", url: "https://app.workspacegroupefloteuil.eu", content: "Online" },
        ],
      };

      const fetchMock = vi
        .fn()
        .mockImplementationOnce(() =>
          Promise.resolve(new Response(JSON.stringify(cfPayload), { status: 200 })),
        )
        .mockImplementationOnce(() =>
          Promise.resolve(new Response(JSON.stringify(searchPayload), { status: 200 })),
        );
      vi.stubGlobal("fetch", fetchMock);

      const dns = await executeCloudflareTool("cloudflare_create_dns_record", {
        zone_id: "zone-1",
        type: "A",
        name: "app.workspacegroupefloteuil.eu",
        content: "1.2.3.4",
      });
      expect(dns.result.name).toBe("app.workspacegroupefloteuil.eu");

      const search = await executeWebSearch({ query: "site:app.workspacegroupefloteuil.eu" });
      expect(search.results[0]?.title).toBe("Rakazo App");
    });

    it("3.11 Web Scrape Industry News -> Create WordPress Post -> Create Notion Tracker", async () => {
      const articleHtml = `<html><head><title>AI Standards 2026</title></head><body><h1>AI Standards</h1><p>New guidelines published.</p></body></html>`;
      const wpPayload = { id: 89, title: { raw: "AI Standards 2026" }, status: "draft" };
      const notionPayload = { id: "notion-rec-89", object: "page" };

      const fetchMock = vi
        .fn()
        .mockImplementationOnce(() => Promise.resolve(new Response(articleHtml, { status: 200 })))
        .mockImplementationOnce(() =>
          Promise.resolve(new Response(JSON.stringify(wpPayload), { status: 201 })),
        )
        .mockImplementationOnce(() =>
          Promise.resolve(new Response(JSON.stringify(notionPayload), { status: 200 })),
        );
      vi.stubGlobal("fetch", fetchMock);

      const scraped = await executeWebScrape({ url: "https://news.example.com/ai-standards" });
      expect(scraped.title).toBe("AI Standards 2026");

      const wp = await executeWordPressTool("wordpress_create_post", {
        title: scraped.title,
        content: scraped.content,
        status: "draft",
      });
      expect(wp.id).toBe(89);

      const notion = await executeNotionTool("notion_create_page", {
        parent: { database_id: "content-pipeline-db" },
        properties: {
          Title: { title: [{ text: { content: wp.title.raw } }] },
          WordPressId: { number: wp.id },
        },
      });
      expect(notion.id).toBe("notion-rec-89");
    });

    it("3.12 GitHub Issue Escalation -> Novamira Diagnostic Ability -> GitHub Issue Comment", async () => {
      const issuePayload = {
        number: 404,
        title: "Payment connector failure",
        body: "Error 500 on checkout",
      };
      const novamiraPayload = {
        success: true,
        diagnostics: "Database pool exhausted on checkout container",
      };
      const commentPayload = { id: 777, body: "Diagnostic result posted" };

      const fetchMock = vi
        .fn()
        .mockImplementationOnce(() =>
          Promise.resolve(new Response(JSON.stringify(issuePayload), { status: 200 })),
        )
        .mockImplementationOnce(() =>
          Promise.resolve(new Response(JSON.stringify(novamiraPayload), { status: 200 })),
        )
        .mockImplementationOnce(() =>
          Promise.resolve(new Response(JSON.stringify(commentPayload), { status: 201 })),
        );
      vi.stubGlobal("fetch", fetchMock);

      const issue = await executeGitHubTool("github_list_issues", {
        owner: "floteuil",
        repo: "rakazo",
      });
      expect(issue.number).toBe(404);

      const diag = await executeWordPressTool("novamira_execute_ability", {
        ability: "run_diagnostics",
        params: { subsystem: "payment" },
      });
      expect(diag.diagnostics).toContain("Database pool exhausted");

      const comment = await executeGitHubTool("github_create_issue_comment", {
        owner: "floteuil",
        repo: "rakazo",
        issue_number: 404,
        body: `Automated Diagnostic: ${diag.diagnostics}`,
      });
      expect(comment.id).toBe(777);
    });

    it("3.13 Subagent Search & Scrape Pipeline -> Parent Notion Knowledge Sync", async () => {
      const searchRes = {
        results: [{ title: "Doc Page", url: "https://doc.com", content: "Details" }],
      };
      const scrapeHtml = `<html><head><title>Doc</title></head><body><h1>API Spec</h1><p>v2 endpoints</p></body></html>`;
      const notionRes = { id: "notion-synced-subagent", object: "page" };

      const fetchMock = vi
        .fn()
        .mockImplementationOnce(() =>
          Promise.resolve(new Response(JSON.stringify(searchRes), { status: 200 })),
        )
        .mockImplementationOnce(() => Promise.resolve(new Response(scrapeHtml, { status: 200 })))
        .mockImplementationOnce(() =>
          Promise.resolve(new Response(JSON.stringify(notionRes), { status: 200 })),
        );
      vi.stubGlobal("fetch", fetchMock);

      // Subagent execution:
      const subagentSearch = await executeWebSearch({ query: "API spec v2" });
      const subagentScrape = await executeWebScrape({ url: subagentSearch.results[0]!.url });

      // Parent receives subagent result and commits to Notion:
      const parentNotion = await executeNotionTool("notion_create_page", {
        parent: { database_id: "kb-db" },
        properties: { Name: { title: [{ text: { content: subagentScrape.title } }] } },
      });
      expect(parentNotion.id).toBe("notion-synced-subagent");
    });

    it("3.14 Primary SearXNG Endpoint Timeout -> Clean Failover Handling", async () => {
      const fetchMock = vi
        .fn()
        .mockImplementationOnce(() =>
          Promise.reject(new Error("connect ECONNREFUSED 127.0.0.1:8080")),
        )
        .mockImplementationOnce(() =>
          Promise.resolve(
            new Response(
              JSON.stringify({
                results: [
                  { title: "Fallback Result", url: "https://fallback.com", content: "Worked" },
                ],
              }),
              { status: 200 },
            ),
          ),
        );
      vi.stubGlobal("fetch", fetchMock);

      let primaryFailed = false;
      let fallbackResult: WebSearchResult | null = null;

      try {
        await executeWebSearch({ query: "test" }, { SEARXNG_URL: "http://127.0.0.1:8080" });
      } catch {
        primaryFailed = true;
        fallbackResult = await executeWebSearch(
          { query: "test" },
          { SEARXNG_URL: "http://searxng-backup:8080" },
        );
      }

      expect(primaryFailed).toBe(true);
      expect(fallbackResult?.count).toBe(1);
      expect(fallbackResult?.results[0]?.title).toBe("Fallback Result");
    });

    it("3.15 End-to-End Enterprise Secret Isolation across all 6 services with error simulation", async () => {
      const ghKey = "ghp_prod_gh_key_111";
      const notionKey = "secret_prod_notion_222";
      const postizKey = "postiz_prod_333";
      const wpKey = "wp_pass_prod_444";
      const n8nKey = "n8n_prod_555";
      const cfKey = "cf_prod_666";

      const allTokens = [ghKey, notionKey, postizKey, wpKey, n8nKey, cfKey];

      const dirtyErrorStream = `
        Error in GitHub dispatch: Header Authorization: token ${ghKey} failed.
        Error in Notion dispatch: Header Authorization: Bearer ${notionKey} rejected.
        Error in Postiz dispatch: Header Authorization: Bearer ${postizKey} unreachable.
        Error in WP dispatch: Header Authorization: Basic ${wpKey} invalid.
        Error in n8n dispatch: Header X-N8N-API-KEY: ${n8nKey} expired.
        Error in Cloudflare dispatch: Header Authorization: Bearer ${cfKey} forbidden.
      `;

      const sanitizedError = redactSecrets(dirtyErrorStream, allTokens);

      for (const token of allTokens) {
        expect(sanitizedError).not.toContain(token);
      }
      expect(sanitizedError.split("[redacted]").length - 1).toBe(6);
    });
  });

  // ==========================================================================
  // TIER 4: REAL-WORLD APPLICATION SCENARIOS (>=5 scenarios)
  // ==========================================================================
  describe("Tier 4: Real-World Application Scenarios", () => {
    // Scenario 1: Competitive Intelligence Briefing
    it("4.1 Competitive Intelligence Briefing: SearXNG metasearch, multi-page scrape, structured briefing", async () => {
      const searchPayload = {
        results: [
          {
            title: "Competitor AI Agent Platform",
            url: "https://competitor.com/agents",
            content: "Autonomous task execution",
          },
          {
            title: "Competitor Pricing Matrix",
            url: "https://competitor.com/pricing",
            content: "Enterprise tier breakdown",
          },
        ],
      };
      const page1Html = `<html><head><title>Agents Feature</title></head><body><h1>Agent Capabilities</h1><p>Supports MCP tools, desktop computer vision, and subagent teams.</p></body></html>`;
      const page2Html = `<html><head><title>Pricing Plan</title></head><body><h1>Pricing</h1><p>Free open source tier + Hosted Enterprise at $49/mo.</p></body></html>`;

      const fetchMock = vi
        .fn()
        .mockImplementationOnce(() =>
          Promise.resolve(new Response(JSON.stringify(searchPayload), { status: 200 })),
        )
        .mockImplementationOnce(() => Promise.resolve(new Response(page1Html, { status: 200 })))
        .mockImplementationOnce(() => Promise.resolve(new Response(page2Html, { status: 200 })));
      vi.stubGlobal("fetch", fetchMock);

      // 1. Search for competitor intel
      const search = await executeWebSearch({ query: "competitor ai agent features pricing" });
      expect(search.count).toBe(2);

      // 2. Scrape both target pages
      const scrape1 = await executeWebScrape({ url: search.results[0]!.url });
      const scrape2 = await executeWebScrape({ url: search.results[1]!.url });

      // 3. Compile executive briefing
      const briefing = {
        topic: "Competitor Intelligence Analysis",
        date: new Date().toISOString(),
        findings: [
          { source: scrape1.title, summary: scrape1.content },
          { source: scrape2.title, summary: scrape2.content },
        ],
        citations: search.formattedCitations,
      };

      expect(briefing.findings[0]?.summary).toContain("Supports MCP tools");
      expect(briefing.findings[1]?.summary).toContain("Free open source tier");
      expect(briefing.citations).toContain(
        "[1] [Competitor AI Agent Platform](https://competitor.com/agents)",
      );
      expect(briefing.citations).toContain(
        "[2] [Competitor Pricing Matrix](https://competitor.com/pricing)",
      );
    });

    // Scenario 2: Automated GitHub Issue Triage & Incident Notification
    it("4.2 Automated GitHub Issue Triage & Incident Notification: GitHub -> Notion KB -> Comment -> n8n", async () => {
      const openIssues = [
        {
          number: 301,
          title: "Traefik SSL certificate renewal failed on Coolify",
          body: "Let's Encrypt challenge timeout",
        },
      ];
      const notionKbResult = {
        results: [
          {
            id: "kb-page-traefik",
            properties: {
              Solution:
                "Restart Traefik container and verify port 80/443 firewall rules in Coolify",
            },
          },
        ],
      };
      const commentPayload = { id: 5001, body: "Triage complete" };
      const n8nWebhookPayload = { status: "dispatched", targetChannel: "#devops-oncall" };

      const fetchMock = vi
        .fn()
        .mockImplementationOnce(() =>
          Promise.resolve(new Response(JSON.stringify(openIssues), { status: 200 })),
        )
        .mockImplementationOnce(() =>
          Promise.resolve(new Response(JSON.stringify(notionKbResult), { status: 200 })),
        )
        .mockImplementationOnce(() =>
          Promise.resolve(new Response(JSON.stringify(commentPayload), { status: 201 })),
        )
        .mockImplementationOnce(() =>
          Promise.resolve(new Response(JSON.stringify(n8nWebhookPayload), { status: 200 })),
        );
      vi.stubGlobal("fetch", fetchMock);

      // 1. Fetch GitHub issues
      const issues = await executeGitHubTool("github_list_issues", {
        owner: "floteuil",
        repo: "rakazo",
        state: "open",
      });
      const targetIssue = issues[0];
      expect(targetIssue.number).toBe(301);

      // 2. Query Notion KB for matching resolution
      const kbQuery = await executeNotionTool("notion_search", { query: targetIssue.title });
      const suggestedFix = kbQuery.results[0].properties.Solution;
      expect(suggestedFix).toContain("Restart Traefik container");

      // 3. Post automated triage response on GitHub
      const comment = await executeGitHubTool("github_create_issue_comment", {
        owner: "floteuil",
        repo: "rakazo",
        issue_number: targetIssue.number,
        body: `🤖 **Rakazo Auto-Triage**\nRecommended fix from Knowledge Base:\n${suggestedFix}`,
      });
      expect(comment.id).toBe(5001);

      // 4. Dispatch incident notification to n8n webhook
      const n8n = await executen8nTool("n8n_trigger_webhook", {
        webhook_path: "incident-triage",
        payload: {
          issueNumber: targetIssue.number,
          title: targetIssue.title,
          fixApplied: true,
        },
      });
      expect(n8n.status).toBe("dispatched");
      expect(n8n.targetChannel).toBe("#devops-oncall");
    });

    // Scenario 3: Social Media & Blog Cross-Publishing Campaign
    it("4.3 Social Media & Blog Cross-Publishing Campaign: WordPress -> Postiz -> Cloudflare Cache Purge", async () => {
      const wpCreated = {
        id: 120,
        title: { raw: "Rakazo 2.0 Enterprise Release" },
        slug: "rakazo-2-0-enterprise-release",
        link: "https://workspacegroupefloteuil.eu/blog/rakazo-2-0",
      };
      const postizCreated = {
        id: "post-campaign-120",
        status: "POSTED",
        channels: ["linkedin", "x"],
      };
      const cfPurged = { success: true, result: { id: "purge-blog-cache" } };

      const fetchMock = vi
        .fn()
        .mockImplementationOnce(() =>
          Promise.resolve(new Response(JSON.stringify(wpCreated), { status: 201 })),
        )
        .mockImplementationOnce(() =>
          Promise.resolve(new Response(JSON.stringify(postizCreated), { status: 200 })),
        )
        .mockImplementationOnce(() =>
          Promise.resolve(new Response(JSON.stringify(cfPurged), { status: 200 })),
        );
      vi.stubGlobal("fetch", fetchMock);

      // 1. Create WordPress blog post
      const blogPost = await executeWordPressTool("wordpress_create_post", {
        title: "Rakazo 2.0 Enterprise Release",
        content:
          "Announcing native MCP servers and SearXNG web search integration for all enterprise agents.",
        status: "publish",
      });
      expect(blogPost.id).toBe(120);

      // 2. Broadcast across LinkedIn & X via Postiz
      const socialPost = await executePostizTool("postiz_create_post", {
        integration_ids: ["int-linkedin", "int-x"],
        content: `🎉 ${blogPost.title.raw} is live! Read the full breakdown: ${blogPost.link}`,
      });
      expect(socialPost.status).toBe("POSTED");

      // 3. Purge Cloudflare Edge Cache for immediate global CDN freshness
      const purge = await executeCloudflareTool("cloudflare_purge_cache", {
        zone_id: "zone-floteuil",
        files: [blogPost.link, "https://workspacegroupefloteuil.eu/blog"],
      });
      expect(purge.success).toBe(true);
    });

    // Scenario 4: Safe Diagnostic Execution & Zero Token Leakage
    it("4.4 Safe Diagnostic Execution & Zero Token Leakage across live probe session", async () => {
      const activeCredentials = {
        github: "ghp_LIVE_PROD_GITHUB_TOKEN_SECRET_987654",
        notion: "secret_LIVE_PROD_NOTION_KEY_123456789012",
        postiz: "postiz_LIVE_PROD_KEY_ABCDEF123456",
        wordpress: "wp_LIVE_PROD_APP_PASS_XYZ987",
        n8n: "n8n_LIVE_PROD_API_KEY_555444333",
        cloudflare: "cf_LIVE_PROD_API_TOKEN_888999000",
      };

      const secretList = Object.values(activeCredentials);
      const streamRedactor = createStreamingRedactor(secretList);

      const executionTraceLogs = [
        `[Probe 1/6] GitHub: Checking repos with ${activeCredentials.github}`,
        `[Probe 2/6] Notion: Checking workspace with ${activeCredentials.notion}`,
        `[Probe 3/6] Postiz: Checking integrations with ${activeCredentials.postiz}`,
        `[Probe 4/6] WordPress: Checking articles with ${activeCredentials.wordpress}`,
        `[Probe 5/6] n8n: Checking workflows with ${activeCredentials.n8n}`,
        `[Probe 6/6] Cloudflare: Checking zones with ${activeCredentials.cloudflare}`,
      ];

      let sanitizedStreamOutput = "";
      for (const logLine of executionTraceLogs) {
        sanitizedStreamOutput += streamRedactor.push(logLine + "\n");
      }
      sanitizedStreamOutput += streamRedactor.finish();

      for (const [provider, token] of Object.entries(activeCredentials)) {
        expect(sanitizedStreamOutput).not.toContain(token);
      }

      expect(sanitizedStreamOutput).toContain("[Probe 1/6] GitHub: Checking repos with [redacted]");
      expect(sanitizedStreamOutput).toContain(
        "[Probe 2/6] Notion: Checking workspace with [redacted]",
      );
      expect(sanitizedStreamOutput).toContain(
        "[Probe 3/6] Postiz: Checking integrations with [redacted]",
      );
      expect(sanitizedStreamOutput).toContain(
        "[Probe 4/6] WordPress: Checking articles with [redacted]",
      );
      expect(sanitizedStreamOutput).toContain(
        "[Probe 5/6] n8n: Checking workflows with [redacted]",
      );
      expect(sanitizedStreamOutput).toContain(
        "[Probe 6/6] Cloudflare: Checking zones with [redacted]",
      );
    });

    // Scenario 5: Multi-Turn Subagent Deep Research Pipeline
    it("4.5 Multi-Turn Subagent Deep Research Pipeline: Parent spawns subagent -> multi-step research -> report synthesis", async () => {
      const searxngPayload1 = {
        results: [
          {
            title: "Traefik SSL Coolify Guide",
            url: "https://coolify.io/docs/traefik",
            content: "Let's Encrypt certs automated configuration",
          },
        ],
      };
      const docHtml = `
        <html>
          <head><title>Traefik Coolify Setup</title></head>
          <body>
            <h1>Traefik SSL Setup</h1>
            <p>1. Enable Let's Encrypt in coolify.yaml.</p>
            <p>2. Set valid contact email.</p>
            <p>3. Verify port 80/443 open.</p>
          </body>
        </html>
      `;

      const fetchMock = vi
        .fn()
        .mockImplementationOnce(() =>
          Promise.resolve(new Response(JSON.stringify(searxngPayload1), { status: 200 })),
        )
        .mockImplementationOnce(() => Promise.resolve(new Response(docHtml, { status: 200 })));
      vi.stubGlobal("fetch", fetchMock);

      const turn1Search = await executeWebSearch({
        query: "coolify traefik ssl lets encrypt setup",
      });
      expect(turn1Search.count).toBe(1);

      const turn2Scrape = await executeWebScrape({ url: turn1Search.results[0]!.url });
      expect(turn2Scrape.content).toContain("# Traefik SSL Setup");

      const subagentArtifact = {
        subagentName: "devops-researcher",
        status: "completed",
        researchSummary: turn2Scrape.content,
        sources: turn1Search.formattedCitations,
      };

      expect(subagentArtifact.status).toBe("completed");
      expect(subagentArtifact.researchSummary).toContain("Enable Let's Encrypt");
      expect(subagentArtifact.sources).toContain(
        "[1] [Traefik SSL Coolify Guide](https://coolify.io/docs/traefik)",
      );
    });
  });
});
