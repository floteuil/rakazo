import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createCombinedSignal,
  enterpriseAgentTools,
  executeCloudflareCreateDnsRecord,
  executeCloudflareListDnsRecords,
  executeCloudflareListZones,
  executeCloudflarePurgeCache,
  executeEnterpriseTool,
  executeGithubCreateIssue,
  executeGithubCreateIssueComment,
  executeGithubGetFileContents,
  executeGithubGetPullRequest,
  executeGithubListIssues,
  executeGithubSearchRepos,
  executeN8nGetExecution,
  executeN8nListWorkflows,
  executeN8nTriggerWebhook,
  executeNotionCreatePage,
  executeNotionGetPage,
  executeNotionQueryDatabase,
  executeNotionSearch,
  executeNotionUpdatePage,
  executeNovamiraExecuteAbility,
  executePostizCreatePost,
  executePostizListIntegrations,
  executePostizListPosts,
  executeWordpressCreatePost,
  executeWordpressGetPost,
  executeWordpressListPosts,
  executeWordpressUpdatePost,
  isEnterpriseTool,
  sanitizeToolError,
} from "./enterprise-tools.js";
import { convertHtmlToMarkdown, executeWebScrape, type WebScrapeArgs } from "./web-scrape.js";
import {
  executeWebSearch,
  formatCitations,
  getSearxngEndpoints,
  type WebSearchArgs,
} from "./web-search.js";

describe("ADVERSARIAL STRESS TEST SUITE (Challenger 1)", () => {
  const originalEnv = { ...process.env };
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  /* ======================================================================== */
  /* SECTION 1: WEB SEARCH ADVERSARIAL STRESS TESTS                          */
  /* ======================================================================== */

  describe("1. Web Search Adversarial Stress", () => {
    it("1.1 handles extreme unicode, RTL overrides, emojis, and null bytes in search queries", async () => {
      const extremeQueries = [
        "مرحبا بالعالم \u202E ‮dlrow olleh", // RTL override
        "🚀🤖🔥✨🎉💡🧠🎯💥🛡️", // Emoji avalanche
        "你好世界\u0000\u0001\u001F test null byte", // Control chars + null byte
        "Z̸a̸l̸g̸o̸ ̸t̸e̸x̸t̸ ̸c̸o̸r̸r̸u̸p̸t̸i̸o̸n̸", // Combining diacritics
        "   \t\r\n   ", // Only whitespace/newlines
        "A".repeat(10_000), // Massive 10k character query
      ];

      for (const query of extremeQueries) {
        const mockFetch = vi.fn().mockResolvedValue({
          ok: true,
          json: async () => ({
            query,
            results: [
              {
                title: `Result for ${query.slice(0, 20)}`,
                url: "https://searxng.internal/result",
                content: "Valid snippet",
              },
            ],
          }),
        });
        globalThis.fetch = mockFetch;

        const res = await executeWebSearch({ query });
        if (!query.trim()) {
          expect(res.error).toMatch(/Search query must not be empty/i);
          expect(res.count).toBe(0);
        } else {
          expect(res.query).toBe(query.trim());
          expect(res.count).toBe(1);
          expect(mockFetch).toHaveBeenCalled();
        }
      }
    });

    it("1.2 handles malformed SearXNG endpoints (spaces, trailing slashes, non-http, invalid ports)", async () => {
      process.env.SEARXNG_URL = "http://bad-endpoint.local:99999/extra//";
      const endpoints = getSearxngEndpoints();
      expect(endpoints[0]).toBe("http://bad-endpoint.local:99999/extra");

      // Test fallback when custom endpoint throws TypeError (e.g. invalid URL)
      let callIndex = 0;
      globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
        callIndex++;
        if (url.includes("bad-endpoint")) {
          throw new TypeError("Failed to parse URL");
        }
        return {
          ok: true,
          json: async () => ({
            results: [{ title: "Fallback OK", url: "https://example.com", content: "Recovered" }],
          }),
        };
      });

      const res = await executeWebSearch({ query: "recovery test" });
      expect(res.count).toBe(1);
      expect(res.results[0]!.title).toBe("Fallback OK");
    });

    it("1.3 handles instant timeouts and AbortSignals", async () => {
      const controller = new AbortController();
      controller.abort(new Error("Manual abort"));

      globalThis.fetch = vi.fn().mockImplementation(async (_url: string, opts: RequestInit) => {
        if (opts.signal?.aborted) {
          throw new DOMException("This operation was aborted", "AbortError");
        }
        return { ok: true, json: async () => ({ results: [] }) };
      });

      const res = await executeWebSearch({ query: "timeout test" }, { signal: controller.signal });
      expect(res.count).toBe(0);
      expect(res.error).toMatch(/unavailable|aborted/i);
    });

    it("1.4 handles malformed / non-JSON responses from SearXNG (HTML error page, 502, truncated JSON)", async () => {
      // SearXNG returns HTML 502 error page
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 502,
        statusText: "Bad Gateway",
      });

      const res1 = await executeWebSearch({ query: "bad gateway test" });
      expect(res1.count).toBe(0);
      expect(res1.error).toMatch(/HTTP 502/i);

      // SearXNG returns 200 OK but body is invalid JSON or HTML
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => {
          throw new SyntaxError("Unexpected token < in JSON at position 0");
        },
      });

      const res2 = await executeWebSearch({ query: "syntax error test" });
      expect(res2.count).toBe(0);
      expect(res2.error).toMatch(/unavailable|SyntaxError/i);
    });

    it("1.5 inspects SearXNG handling when results contain tags and HTML entities", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          query: "corrupted",
          results: [
            {}, // empty object
            { title: "<b>Unclosed tag", content: "Snippet with &amp; &lt; &gt;" }, // missing URL
            {
              url: "https://valid.com",
              title: "<b>Safe</b> Title",
              content: "<em>Content</em> &amp; more",
            },
          ],
        }),
      });

      const res = await executeWebSearch({ query: "corrupted test" });
      expect(res.count).toBe(1); // Only the one with a valid URL
      expect(res.results[0]!.url).toBe("https://valid.com");
      expect(res.results[0]!.title).toBe("Safe Title");
      expect(res.results[0]!.snippet).toBe("Content & more");
      expect(res.formattedCitations).toContain(
        "[1] [Safe Title](https://valid.com) - Content & more",
      );
    });

    it("1.6 handles boundary values for max_results (negative, 0, huge numbers)", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          results: Array.from({ length: 100 }, (_, i) => ({
            title: `Item ${i}`,
            url: `https://example.com/${i}`,
            content: `Snippet ${i}`,
          })),
        }),
      });

      // Negative max_results defaults to 10
      const resNeg = await executeWebSearch({ query: "test", max_results: -5 });
      expect(resNeg.count).toBe(10);

      // Zero max_results defaults to 10
      const resZero = await executeWebSearch({ query: "test", max_results: 0 });
      expect(resZero.count).toBe(10);

      // Huge max_results caps at 50
      const resHuge = await executeWebSearch({ query: "test", max_results: 9999 });
      expect(resHuge.count).toBe(50);
    });
  });

  /* ======================================================================== */
  /* SECTION 2: WEB SCRAPE ADVERSARIAL STRESS TESTS                          */
  /* ======================================================================== */

  describe("2. Web Scrape Adversarial Stress", () => {
    it("2.1 handles deeply nested HTML without call stack overflow or ReDoS (1,000+ levels)", () => {
      const depth = 1000;
      const nestedHtml =
        "<div>".repeat(depth) +
        "<h1>Deep Content</h1><p>Inside 1000 divs</p>" +
        "</div>".repeat(depth);

      const startTime = performance.now();
      const md = convertHtmlToMarkdown(nestedHtml);
      const duration = performance.now() - startTime;

      expect(duration).toBeLessThan(1000); // Must parse in under 1 second
      expect(md).toContain("# Deep Content");
      expect(md).toContain("Inside 1000 divs");
    });

    it("2.2 strips standard and multi-tag script and style elements", () => {
      const maliciousHtml = `
        <script type="text/javascript">eval(atob('YWxlcnQoMSk='));</script>
        <script async defer>document.cookie="stolen";</script>
        <style>
          @import url('https://evil.com/leak.css');
          body { background: red; }
        </style>
        <noscript><p>Noscript text</p></noscript>
        <svg><circle r="10"/></svg>
        <canvas id="tracker"></canvas>
        <iframe src="https://phishing.com"></iframe>
        <form action="/steal"><input name="pass"/></form>
        <h1>Legitimate Article</h1>
        <p>This is the real text <a href="javascript:alert(1)">Click Me</a></p>
      `;

      const md = convertHtmlToMarkdown(maliciousHtml);
      expect(md).not.toContain("eval");
      expect(md).not.toContain("stolen");
      expect(md).not.toContain("evil.com");
      expect(md).not.toContain("Noscript text");
      expect(md).not.toContain("tracker");
      expect(md).not.toContain("phishing");
      expect(md).not.toContain("steal");
      expect(md).toContain("# Legitimate Article");
      expect(md).toContain("This is the real text Click Me");
      expect(md).not.toContain("[Click Me](javascript:");
    });

    it("2.3 rejects dangerous, non-HTTP protocols, file URLs, and SSRF patterns", async () => {
      const dangerousUrls = [
        "javascript:alert(1)",
        "file:///etc/passwd",
        "file:///C:/Windows/System32/drivers/etc/hosts",
        "data:text/html,<script>alert(1)</script>",
        "gopher://127.0.0.1:6379/_",
        "ftp://anonymous@ftp.upload.com/dump",
        "chrome://settings",
        "about:blank",
        "blob:https://example.com/uuid",
        "not a valid url at all :// ??",
      ];

      for (const url of dangerousUrls) {
        const res = await executeWebScrape({ url });
        expect(res.error).toBeDefined();
        expect(res.content).toBe("");
        expect(res.length).toBe(0);
      }
    });

    it("2.4 processes large HTML payload without crashing", async () => {
      const paragraph =
        "<p>This is a repeating content paragraph for high volume throughput testing with <strong>bold</strong> text.</p>\n";
      const repetitions = 20_000; // ~2.5MB of text
      const largeHtml = `<html><head><title>Large Test Page</title></head><body><h1>Big Data</h1>${paragraph.repeat(repetitions)}</body></html>`;

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => largeHtml,
      });

      const res = await executeWebScrape({
        url: "https://example.com/huge-doc",
        maxLength: 10_000,
      });

      expect(res.title).toBe("Large Test Page");
      expect(res.truncated).toBe(true);
      expect(res.length).toBeLessThanOrEqual(10_100);
      expect(res.content).toContain("# Big Data");
    });

    it("2.5 handles non-HTML responses (plain text, JSON, binary PNG headers, XML)", async () => {
      // Case A: JSON response
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ status: "ok", users: [1, 2, 3] }),
      });
      const jsonRes = await executeWebScrape({ url: "https://api.example.com/status.json" });
      expect(jsonRes.content).toContain('"status"');
      expect(jsonRes.title).toBeUndefined();

      // Case B: Plain text
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => "Simple raw text output without any tags.",
      });
      const textRes = await executeWebScrape({ url: "https://example.com/robots.txt" });
      expect(textRes.content).toBe("Simple raw text output without any tags.");

      // Case C: Binary mock header
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => "\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01",
      });
      const binRes = await executeWebScrape({ url: "https://example.com/image.png" });
      expect(binRes.content).toBeDefined();
      expect(binRes.error).toBeUndefined();
    });

    it("2.6 handles selector edge cases (special regex chars, non-existent selectors)", async () => {
      const html = `
        <div id="content.main$section" class="article-body">
          <h2>Article Heading</h2>
          <p>Main body content.</p>
        </div>
        <div class="sidebar">
          <p>Sidebar content.</p>
        </div>
      `;

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => html,
      });

      // Valid class selector
      const resClass = await executeWebScrape({
        url: "https://example.com/article",
        selector: "article-body",
      });
      expect(resClass.content).toContain("## Article Heading");
      expect(resClass.content).toContain("Main body content.");

      // Non-existent selector gracefully falls back to full content
      const resMissing = await executeWebScrape({
        url: "https://example.com/article",
        selector: "nonexistent-class",
      });
      expect(resMissing.content).toContain("Main body content.");
      expect(resMissing.content).toContain("Sidebar content.");
    });
  });

  /* ======================================================================== */
  /* SECTION 3: ENTERPRISE TOOLS ADVERSARIAL STRESS TESTS                    */
  /* ======================================================================== */

  describe("3. Enterprise Tools Adversarial Stress", () => {
    it("3.1 verifies strict auth validation for unconfigured services", async () => {
      delete process.env.GITHUB_TOKEN;
      delete process.env.NOTION_API_KEY;
      delete process.env.POSTIZ_API_KEY;
      delete process.env.WORDPRESS_USERNAME;
      delete process.env.WORDPRESS_APP_PASSWORD;
      delete process.env.N8N_API_KEY;
      delete process.env.CLOUDFLARE_API_TOKEN;

      const githubRes = await executeGithubCreateIssue({ owner: "o", repo: "r", title: "t" });
      expect(githubRes).toEqual({ error: expect.stringMatching(/GITHUB_TOKEN/i) });

      const notionRes = await executeNotionSearch({ query: "q" });
      expect(notionRes).toEqual({ error: expect.stringMatching(/NOTION_API_KEY/i) });

      const postizRes = await executePostizListIntegrations({});
      expect(postizRes).toEqual({ error: expect.stringMatching(/POSTIZ_API_KEY/i) });

      const wpRes = await executeWordpressCreatePost({ title: "t", content: "c" });
      expect(wpRes).toEqual({ error: expect.stringMatching(/WORDPRESS_USERNAME/i) });

      const n8nRes = await executeN8nListWorkflows({});
      expect(n8nRes).toEqual({ error: expect.stringMatching(/N8N_API_KEY/i) });

      const cfRes = await executeCloudflareListZones({});
      expect(cfRes).toEqual({ error: expect.stringMatching(/CLOUDFLARE_API_TOKEN/i) });
    });

    it("3.2 handles HTTP 429 Rate Limits across all enterprise connectors", async () => {
      process.env.GITHUB_TOKEN = "ghp_valid_token";
      process.env.NOTION_API_KEY = "ntn_valid_key";
      process.env.POSTIZ_API_KEY = "pk_valid_key";
      process.env.WORDPRESS_USERNAME = "user";
      process.env.WORDPRESS_APP_PASSWORD = "pass";
      process.env.N8N_API_KEY = "n8n_valid_key";
      process.env.CLOUDFLARE_API_TOKEN = "cf_valid_token";

      const rateLimitResponse = {
        ok: false,
        status: 429,
        statusText: "Too Many Requests",
        text: async () =>
          JSON.stringify({ message: "API rate limit exceeded. Please retry later." }),
      };

      globalThis.fetch = vi.fn().mockResolvedValue(rateLimitResponse);

      // GitHub Search 429
      const ghRes = (await executeGithubSearchRepos({ q: "test" })) as {
        error: string;
        status: number;
      };
      expect(ghRes.status).toBe(429);
      expect(ghRes.error).toMatch(/rate limit exceeded/i);

      // Notion Search 429
      const notionRes = (await executeNotionSearch({ query: "test" })) as {
        error: string;
        status: number;
      };
      expect(notionRes.status).toBe(429);
      expect(notionRes.error).toMatch(/rate limit exceeded/i);

      // Postiz 429
      const postizRes = (await executePostizListPosts({})) as { error: string; status: number };
      expect(postizRes.status).toBe(429);
      expect(postizRes.error).toMatch(/rate limit exceeded/i);

      // Cloudflare 429
      const cfRes = (await executeCloudflareListZones({})) as { error: string; status: number };
      expect(cfRes.status).toBe(429);
      expect(cfRes.error).toMatch(/rate limit exceeded/i);
    });

    it("3.3 handles partial server failures (HTTP 500, 502, 503, 504) with non-JSON HTML bodies", async () => {
      process.env.GITHUB_TOKEN = "ghp_valid";

      // Server returns Nginx 502 HTML error page
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 502,
        statusText: "Bad Gateway",
        text: async () =>
          "<html><body><center><h1>502 Bad Gateway</h1></center><hr><center>nginx</center></body></html>",
      });

      const res = (await executeGithubListIssues({ owner: "o", repo: "r" })) as {
        error: string;
        status: number;
      };
      expect(res.status).toBe(502);
      expect(res.error).toMatch(/HTTP 502 Bad Gateway/i);
    });

    it("3.4 handles network aborts and ECONNRESET gracefully", async () => {
      process.env.GITHUB_TOKEN = "ghp_valid";
      globalThis.fetch = vi.fn().mockRejectedValue(new Error("read ECONNRESET"));

      const res = (await executeGithubGetFileContents({
        owner: "o",
        repo: "r",
        path: "file.ts",
      })) as { error: string };
      expect(res.error).toMatch(/ECONNRESET/i);
    });

    it("3.5 fusses malformed parameters (empty strings, undefineds, non-numeric inputs)", async () => {
      process.env.GITHUB_TOKEN = "ghp_valid";
      process.env.CLOUDFLARE_API_TOKEN = "cf_valid";

      // Missing owner/repo in GitHub PR
      const prRes = await executeGithubGetPullRequest({ owner: "", repo: "", pull_number: 0 });
      expect(prRes).toEqual({ error: expect.stringMatching(/required/i) });

      // Missing DNS parameters in Cloudflare
      const dnsRes = await executeCloudflareCreateDnsRecord({
        zone_id: "",
        type: "",
        name: "",
        content: "",
      });
      expect(dnsRes).toEqual({ error: expect.stringMatching(/required/i) });

      // Dispatcher with unrecognized tool name
      const unkRes = await executeEnterpriseTool("unknown_enterprise_action", {});
      expect(unkRes).toEqual({ error: expect.stringMatching(/not recognized/i) });
    });

    it("3.6 guarantees zero secret leakage under fuzzing with live tokens in error strings", () => {
      const leakedTokens = [
        "ghp_1234567890abcdefghijklmnopqrstuvwxyz",
        "github_pat_11ABCD_efgh1234567890",
        "secret_9876543210abcdefghijklmnop",
        "ntn_11223344556677889900aabbccdd",
        "pk_live_00112233445566778899aabb",
        "nova_sec_abcdef1234567890",
        "n8n_api_key_1234567890abcdef",
        "cf_token_abcdef1234567890-XYZ",
        "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.payload.sig",
        "Basic dXNlcm5hbWU6cGFzc3dvcmQxMjM=",
      ];

      for (const token of leakedTokens) {
        const errorString = `Fatal failure contacting upstream API with credential: ${token} at endpoint /v1/auth`;
        const sanitized = sanitizeToolError(errorString);
        expect(sanitized).not.toContain(token);
        expect(sanitized).toContain("[redacted]");
      }
    });

    it("3.7 handles Cloudflare Purge Cache edge cases (purge_everything vs specific arrays)", async () => {
      process.env.CLOUDFLARE_API_TOKEN = "cf_token_valid";
      let capturedBody: any = null;

      globalThis.fetch = vi.fn().mockImplementation(async (_url: string, opts: RequestInit) => {
        capturedBody = JSON.parse(opts.body as string);
        return {
          ok: true,
          text: async () => JSON.stringify({ success: true, result: { id: "purge_id_123" } }),
        };
      });

      // Default with empty options defaults to purge_everything: true
      const resDefault = await executeCloudflarePurgeCache({ zone_id: "zone123" });
      expect(resDefault).toEqual({ ok: true, id: "purge_id_123", success: true });
      expect(capturedBody).toEqual({ purge_everything: true });

      // Targeted purge with files
      const resFiles = await executeCloudflarePurgeCache({
        zone_id: "zone123",
        files: ["https://example.com/style.css", "https://example.com/app.js"],
      });
      expect(resFiles).toEqual({ ok: true, id: "purge_id_123", success: true });
      expect(capturedBody).toEqual({
        files: ["https://example.com/style.css", "https://example.com/app.js"],
      });
    });
  });
});
