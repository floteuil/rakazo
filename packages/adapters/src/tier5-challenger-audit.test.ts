import type { ConnectorTool } from "@rakazo/adapter-kit";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { builtinAgentTools, DELEGATION_TOOL_NAMES } from "./builtin-tools.js";
import {
  enterpriseAgentTools,
  executeCloudflareCreateDnsRecord,
  executeCloudflarePurgeCache,
  executeEnterpriseTool,
  executeGithubCreateIssue,
  executeGithubGetFileContents,
  executeGithubSearchRepos,
  executeN8nTriggerWebhook,
  executeNotionCreatePage,
  executeNotionSearch,
  executeNovamiraExecuteAbility,
  executePostizCreatePost,
  executeWordpressCreatePost,
  isEnterpriseTool,
  sanitizeToolError,
} from "./enterprise-tools.js";
import {
  normalizeAgentToolName,
  normalizeAgentToolNames,
  PiAgentRuntime,
  pruneComputerScreenshotContext,
} from "./pi-runtime.js";
import { convertHtmlToMarkdown, executeWebScrape } from "./web-scrape.js";
import { executeWebSearch, formatCitations, getSearxngEndpoints } from "./web-search.js";

describe("Tier 5 White-Box & Adversarial Hardening Audit", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.restoreAllMocks();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  /* ========================================================================= */
  /* 1. Web Search Hardening & Edge Cases                                      */
  /* ========================================================================= */
  describe("1. web-search.ts White-Box Coverage", () => {
    it("handles empty and whitespace-only queries cleanly", async () => {
      const empty1 = await executeWebSearch({ query: "" });
      expect(empty1.error).toMatch(/must not be empty/i);
      expect(empty1.results).toEqual([]);

      const empty2 = await executeWebSearch({ query: "   \n\t  " });
      expect(empty2.error).toMatch(/must not be empty/i);
      expect(empty2.results).toEqual([]);
    });

    it("verifies SearXNG endpoint fallback priority and deduplication", () => {
      process.env.SEARXNG_URL = "http://custom-searxng:8080/";
      const endpoints = getSearxngEndpoints();
      expect(endpoints[0]).toBe("http://custom-searxng:8080");
      expect(endpoints).toContain("http://searxng-qkcs0oo0owk4s8cw8wgk8ogc:8080");
      expect(endpoints).toContain("http://127.0.0.1:8080");
      const set = new Set(endpoints);
      expect(set.size).toBe(endpoints.length);
    });

    it("falls back to secondary endpoints when primary endpoint returns 500 error", async () => {
      const mockFetch = vi
        .fn()
        .mockResolvedValueOnce({
          ok: false,
          status: 502,
          statusText: "Bad Gateway",
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            query: "test query",
            results: [
              {
                title: "Fallback Result",
                url: "https://fallback.com",
                content: "Content from fallback",
              },
            ],
          }),
        });
      global.fetch = mockFetch;

      const result = await executeWebSearch({ query: "test query" });
      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(result.count).toBe(1);
      expect(result.results[0]?.title).toBe("Fallback Result");
      expect(result.results[0]?.url).toBe("https://fallback.com");
    });

    it("handles complete outage across all endpoints gracefully", async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error("Connection refused (ECONNREFUSED)"));

      const result = await executeWebSearch({ query: "agent architecture" });
      expect(result.count).toBe(0);
      expect(result.results).toEqual([]);
      expect(result.error).toMatch(/SearXNG search service unavailable/i);
      expect(result.error).toMatch(/ECONNREFUSED/i);
    });

    it("strips complex HTML and handles missing metadata in search snippets", () => {
      const rawCitations = formatCitations([
        {
          title: "<b>React</b> &amp; Next.js <i>Docs</i>",
          url: "https://nextjs.org",
          snippet: "Building &lt;fullstack&gt; applications &#39;quickly&#39;&nbsp;&quot;now&quot;",
          publishedDate: null,
        },
        {
          title: "",
          url: "https://example.com/untitled",
          snippet: "",
          publishedDate: "2026-08-20",
        },
      ]);

      expect(rawCitations).toContain(
        "[1] [<b>React</b> &amp; Next.js <i>Docs</i>](https://nextjs.org)",
      );
      expect(rawCitations).toContain(
        "[2] [https://example.com/untitled](https://example.com/untitled) (2026-08-20)",
      );
    });

    it("bounds max_results properly against negative numbers and excessive sizes", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          results: Array.from({ length: 60 }, (_, i) => ({
            title: `Item ${i}`,
            url: `https://item${i}.com`,
            content: `Snippet ${i}`,
          })),
        }),
      });

      const boundedMax = await executeWebSearch({ query: "test", max_results: 100 });
      expect(boundedMax.results.length).toBe(50);

      const boundedMin = await executeWebSearch({ query: "test", max_results: -5 });
      expect(boundedMin.results.length).toBe(10);
    });
  });

  /* ========================================================================= */
  /* 2. Web Scrape Hardening & SSRF/Protocol Defense                            */
  /* ========================================================================= */
  describe("2. web-scrape.ts White-Box Coverage", () => {
    it("blocks unsupported and dangerous protocols (file, ftp, javascript, data)", async () => {
      const fileRes = await executeWebScrape({ url: "file:///etc/passwd" });
      expect(fileRes.error).toMatch(/Unsupported protocol file:/i);
      expect(fileRes.content).toBe("");

      const ftpRes = await executeWebScrape({ url: "ftp://ftp.example.com/data" });
      expect(ftpRes.error).toMatch(/Unsupported protocol ftp:/i);

      const jsRes = await executeWebScrape({ url: "javascript:alert(1)" });
      expect(jsRes.error).toMatch(/Unsupported protocol javascript:/i);

      const dataRes = await executeWebScrape({ url: "data:text/html,<h1>hi</h1>" });
      expect(dataRes.error).toMatch(/Unsupported protocol data:/i);
    });

    it("validates malformed URLs and empty inputs", async () => {
      const emptyRes = await executeWebScrape({ url: "" });
      expect(emptyRes.error).toMatch(/must not be empty/i);

      const malformedRes = await executeWebScrape({ url: "not-a-valid-url-format" });
      expect(malformedRes.error).toMatch(/Invalid URL format/i);
    });

    it("converts complex HTML structures into clean Markdown", () => {
      const html = `
        <!DOCTYPE html>
        <html>
        <head><title>Test Page</title><script>var x = 1;</script><style>body { color: red; }</style></head>
        <body>
          <!-- Sensitive comment -->
          <nav><a href="/home">Home</a></nav>
          <header><h1>Header Title</h1></header>
          <main id="main-content">
            <h1>Main Heading</h1>
            <p>This is a paragraph with <strong>bold</strong>, <em>italic</em>, and <a href="https://example.com">a valid link</a>, plus <a href="javascript:void(0)">a script link</a>.</p>
            <pre><code>function hello() { return "world"; }</code></pre>
            <table>
              <tr><th>Col 1</th><th>Col 2</th></tr>
              <tr><td>Val 1</td><td>Val 2 &amp; extra</td></tr>
            </table>
            <blockquote>Quote with multiple lines</blockquote>
            <ul>
              <li>Item 1</li>
              <li>Item 2</li>
            </ul>
          </main>
          <footer><p>Copyright 2026</p></footer>
          <form><input type="password" value="secret"/></form>
        </body>
        </html>
      `;

      const md = convertHtmlToMarkdown(html);
      // Boilerplate stripped
      expect(md).not.toContain("var x = 1");
      expect(md).not.toContain("body { color: red; }");
      expect(md).not.toContain("Sensitive comment");
      expect(md).not.toContain("Header Title");
      expect(md).not.toContain("Copyright 2026");
      expect(md).not.toContain("secret");

      // Content preserved
      expect(md).toContain("# Main Heading");
      expect(md).toContain("**bold**");
      expect(md).toContain("*italic*");
      expect(md).toContain("[a valid link](https://example.com)");
      expect(md).not.toContain("javascript:void(0)");
      expect(md).toContain('```\nfunction hello() { return "world"; }\n```');
      expect(md).toContain("| Col 1 | Col 2 |");
      expect(md).toContain("> Quote with multiple lines");
      expect(md).toContain("* Item 1");
      expect(md).toContain("* Item 2");
    });

    it("honors maxLength truncation and sets truncated flag", async () => {
      const longHtml = `<html><body><article>${"A".repeat(500)}</article></body></html>`;
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        text: async () => longHtml,
      });

      const res = await executeWebScrape({ url: "https://example.com/long", maxLength: 100 });
      expect(res.truncated).toBe(true);
      expect(res.content).toContain("... [Content truncated at 100 characters]");
      expect(res.length).toBeGreaterThan(100);
    });

    it("falls back to direct fetch when SCRAPERR_URL fails", async () => {
      process.env.SCRAPERR_URL = "http://scraperr:8080";
      const mockFetch = vi
        .fn()
        // Scraperr fails
        .mockRejectedValueOnce(new Error("Scraperr timeout"))
        // Direct fetch succeeds
        .mockResolvedValueOnce({
          ok: true,
          text: async () =>
            "<html><head><title>Direct Fetch</title></head><body><h1>Direct Scraped Content</h1></body></html>",
        });
      global.fetch = mockFetch;

      const res = await executeWebScrape({ url: "https://example.com/fallback-test" });
      expect(res.title).toBe("Direct Fetch");
      expect(res.content).toContain("# Direct Scraped Content");
    });
  });

  /* ========================================================================= */
  /* 3. Enterprise Tools Token Sanitization & Dispatch                         */
  /* ========================================================================= */
  describe("3. enterprise-tools.ts Hardening & Token Leak Protection", () => {
    it("thoroughly sanitizes all enterprise tokens from error messages", () => {
      const allTokens = [
        "ghp_1234567890abcdefghijklmnopqrstuvwxyz",
        "github_pat_11AABCDEF0123456789_abcdefghijklmnopqrstuvwxyz",
        "secret_9876543210abcdef",
        "ntn_112233445566778899aabbccddeeff",
        "pk_live_0123456789abcdef",
        "nova_sec_999988887777",
        "n8n_api_key_test_12345",
        "cf_token_abcdef123456_xyz-99",
        "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.token",
        "Basic dXNlcm5hbWU6cGFzc3dvcmQ=",
      ];

      for (const token of allTokens) {
        const errorMsg = `API Request failed with token: ${token} at endpoint`;
        const sanitized = sanitizeToolError(errorMsg);
        expect(sanitized).not.toContain(token);
        expect(sanitized).toContain("[redacted]");
      }
    });

    it("normalizes parameter names in executeEnterpriseTool dispatcher", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        text: async () => JSON.stringify({ total_count: 0, items: [] }),
      });
      process.env.GITHUB_TOKEN = "ghp_mock_token";

      // Test camelCase vs snake_case normalization
      const res = await executeEnterpriseTool("github_search_repos", {
        query: "rakazo",
        perPage: 25,
        sort: "stars",
      });

      expect(res).toHaveProperty("total_count", 0);
    });

    it("returns explicit error for unknown enterprise tool", async () => {
      const res = await executeEnterpriseTool("non_existent_enterprise_tool", {});
      expect(res).toEqual({
        error: "Enterprise tool non_existent_enterprise_tool not recognized.",
      });
    });

    it("validates missing configurations gracefully across enterprise connectors", async () => {
      delete process.env.GITHUB_TOKEN;
      delete process.env.NOTION_API_KEY;
      delete process.env.POSTIZ_API_KEY;
      delete process.env.WORDPRESS_USERNAME;
      delete process.env.WORDPRESS_APP_PASSWORD;
      delete process.env.N8N_API_KEY;
      delete process.env.CLOUDFLARE_API_TOKEN;

      const ghRes = await executeGithubCreateIssue({ owner: "o", repo: "r", title: "t" });
      expect(ghRes.error).toMatch(/GITHUB_TOKEN/i);

      const ntnRes = await executeNotionSearch({ query: "q" });
      expect(ntnRes.error).toMatch(/NOTION_API_KEY/i);

      const postizRes = await executePostizCreatePost({ content: "c" });
      expect(postizRes.error).toMatch(/POSTIZ_API_KEY/i);

      const wpRes = await executeWordpressCreatePost({ title: "t", content: "c" });
      expect(wpRes.error).toMatch(/WORDPRESS_USERNAME/i);

      const n8nRes = await executeN8nTriggerWebhook({ webhookPath: "hook" });
      expect(n8nRes).toBeDefined();

      const cfRes = await executeCloudflareCreateDnsRecord({
        zone_id: "z",
        type: "A",
        name: "test",
        content: "1.2.3.4",
      });
      expect(cfRes.error).toMatch(/CLOUDFLARE_API_TOKEN/i);
    });
  });

  /* ========================================================================= */
  /* 4. Pi Runtime: Tool Normalization & Subagent Isolation                    */
  /* ========================================================================= */
  describe("4. pi-runtime.ts Subagent Inheritance & Name Normalization", () => {
    it("handles complex, unicode, and malformed tool names", () => {
      expect(normalizeAgentToolName("")).toBe("connector_tool");
      expect(normalizeAgentToolName("mcp:execute/site-ability.v1")).toBe(
        "mcp_execute_site-ability_v1",
      );
      expect(normalizeAgentToolName("Données & Métriques @ 2026")).toBe("Donnees_Metriques_2026");
      expect(normalizeAgentToolName("!@#$%^&*()")).toBe("connector_tool");
    });

    it("resolves multiple collisions with distinct stable suffixes without exceeding 64 chars", () => {
      const tools: ConnectorTool[] = [
        { name: "sync-tool", description: "Tool 1", inputSchema: { type: "object" } },
        { name: "sync tool", description: "Tool 2", inputSchema: { type: "object" } },
        { name: "sync_tool", description: "Tool 3", inputSchema: { type: "object" } },
        { name: "sync/tool", description: "Tool 4", inputSchema: { type: "object" } },
      ];

      const names = normalizeAgentToolNames(tools);
      expect(new Set(names).size).toBe(4);
      for (const name of names) {
        expect(name.length).toBeLessThanOrEqual(64);
        expect(name).toMatch(/^[a-zA-Z0-9_-]+$/);
      }
    });

    it("verifies delegation tools are excluded from subagent tool definitions", () => {
      const allBuiltins = builtinAgentTools;
      const subagentTools = allBuiltins.filter((t) => !DELEGATION_TOOL_NAMES.has(t.name));
      const subagentToolNames = new Set(subagentTools.map((t) => t.name));

      expect(subagentToolNames.has("run_subagent")).toBe(false);
      expect(subagentToolNames.has("spawn_bot")).toBe(false);
      expect(subagentToolNames.has("archive_bot")).toBe(false);
      expect(subagentToolNames.has("delete_bot")).toBe(false);

      // Verify enterprise tools and search/scrape are accessible to subagents
      expect(subagentToolNames.has("web_search")).toBe(true);
      expect(subagentToolNames.has("web_scrape")).toBe(true);
      expect(subagentToolNames.has("github_search_repos")).toBe(true);
      expect(subagentToolNames.has("notion_search")).toBe(true);
    });

    it("prunes older screenshots to conserve token context window", () => {
      const messages: any[] = [
        {
          role: "toolResult",
          details: { frameId: "frame-1" },
          content: [
            { type: "image", data: "b64-1" },
            { type: "text", text: "Screenshot 1" },
          ],
        },
        {
          role: "toolResult",
          details: { frameId: "frame-2" },
          content: [
            { type: "image", data: "b64-2" },
            { type: "text", text: "Screenshot 2" },
          ],
        },
        {
          role: "toolResult",
          details: { frameId: "frame-3" },
          content: [
            { type: "image", data: "b64-3" },
            { type: "text", text: "Screenshot 3" },
          ],
        },
      ];

      // Keep 2 screenshots
      const pruned = pruneComputerScreenshotContext(messages, 2);
      expect((pruned[0] as any).content.some((c: any) => c.type === "image")).toBe(false);
      expect((pruned[0] as any).content.some((c: any) => c.type === "text")).toBe(true);
      expect((pruned[1] as any).content.some((c: any) => c.type === "image")).toBe(true);
      expect((pruned[2] as any).content.some((c: any) => c.type === "image")).toBe(true);
    });
  });
});
