import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { builtinAgentTools } from "./builtin-tools.js";
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

describe("Enterprise MCP Connectors", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.restoreAllMocks();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe("Metadata and Registration", () => {
    it("exports all 26 enterprise connector tools", () => {
      expect(enterpriseAgentTools.length).toBeGreaterThanOrEqual(25);
      const toolNames = enterpriseAgentTools.map((t) => t.name);

      // GitHub
      expect(toolNames).toContain("github_search_repos");
      expect(toolNames).toContain("github_get_file_contents");
      expect(toolNames).toContain("github_list_issues");
      expect(toolNames).toContain("github_create_issue");
      expect(toolNames).toContain("github_get_pull_request");
      expect(toolNames).toContain("github_create_issue_comment");

      // Notion
      expect(toolNames).toContain("notion_search");
      expect(toolNames).toContain("notion_get_page");
      expect(toolNames).toContain("notion_query_database");
      expect(toolNames).toContain("notion_create_page");
      expect(toolNames).toContain("notion_update_page");

      // Postiz
      expect(toolNames).toContain("postiz_list_integrations");
      expect(toolNames).toContain("postiz_create_post");
      expect(toolNames).toContain("postiz_list_posts");

      // WordPress / Novamira
      expect(toolNames).toContain("wordpress_list_posts");
      expect(toolNames).toContain("wordpress_get_post");
      expect(toolNames).toContain("wordpress_create_post");
      expect(toolNames).toContain("wordpress_update_post");
      expect(toolNames).toContain("novamira_execute_ability");

      // n8n
      expect(toolNames).toContain("n8n_trigger_webhook");
      expect(toolNames).toContain("n8n_list_workflows");
      expect(toolNames).toContain("n8n_get_execution");

      // Cloudflare
      expect(toolNames).toContain("cloudflare_list_zones");
      expect(toolNames).toContain("cloudflare_list_dns_records");
      expect(toolNames).toContain("cloudflare_create_dns_record");
      expect(toolNames).toContain("cloudflare_purge_cache");
    });

    it("registers all enterprise tools in builtinAgentTools by default", () => {
      const builtinNames = builtinAgentTools.map((t) => t.name);
      for (const tool of enterpriseAgentTools) {
        expect(builtinNames).toContain(tool.name);
      }
    });

    it("correctly checks isEnterpriseTool", () => {
      expect(isEnterpriseTool("github_search_repos")).toBe(true);
      expect(isEnterpriseTool("notion_search")).toBe(true);
      expect(isEnterpriseTool("postiz_create_post")).toBe(true);
      expect(isEnterpriseTool("wordpress_list_posts")).toBe(true);
      expect(isEnterpriseTool("novamira_execute_ability")).toBe(true);
      expect(isEnterpriseTool("n8n_trigger_webhook")).toBe(true);
      expect(isEnterpriseTool("cloudflare_list_zones")).toBe(true);
      expect(isEnterpriseTool("unknown_tool_xyz")).toBe(false);
      expect(isEnterpriseTool("shell")).toBe(false);
    });

    it("every tool has a non-empty name, description, and valid schema", () => {
      for (const tool of enterpriseAgentTools) {
        expect(tool.name.length).toBeGreaterThan(0);
        expect(tool.description.length).toBeGreaterThan(10);
        expect(tool.inputSchema.type).toBe("object");
        expect(tool.inputSchema.properties).toBeDefined();
      }
    });
  });

  describe("Resilience and Sanitization Helpers", () => {
    it("sanitizes various API token formats from error strings", () => {
      const dirty =
        "Error with ghp_1234567890abcdef and github_pat_12345_67890, secret_99999, ntn_abcdef123, pk_live_987, nova_sec123, n8n_api_key123, cf_token_abc-123, Bearer my-secret-token, Basic dXNlcjpwYXNz";
      const cleaned = sanitizeToolError(dirty);
      expect(cleaned).not.toContain("ghp_1234567890abcdef");
      expect(cleaned).not.toContain("github_pat_12345_67890");
      expect(cleaned).not.toContain("secret_99999");
      expect(cleaned).not.toContain("ntn_abcdef123");
      expect(cleaned).not.toContain("pk_live_987");
      expect(cleaned).not.toContain("nova_sec123");
      expect(cleaned).not.toContain("n8n_api_key123");
      expect(cleaned).not.toContain("cf_token_abc-123");
      expect(cleaned).not.toContain("my-secret-token");
      expect(cleaned).toContain("[redacted]");
    });

    it("scrubs each token prefix individually with underscores, hyphens, and mixed casing", () => {
      // GitHub
      expect(sanitizeToolError("Token: ghp_abc123_DEF456")).toBe("Token: ghp_[redacted]");
      expect(sanitizeToolError("Token: github_pat_11AB22CD33_445566")).toBe(
        "Token: github_pat_[redacted]",
      );

      // Notion
      expect(sanitizeToolError("Key: secret_notion_key_abc123")).toBe("Key: secret_[redacted]");
      expect(sanitizeToolError("Key: ntn_v2_key_xyz_789")).toBe("Key: ntn_[redacted]");

      // Postiz
      expect(sanitizeToolError("API: pk_live_postiz_token_999")).toBe("API: pk_[redacted]");

      // Novamira
      expect(sanitizeToolError("Auth: nova_secure_ability_token_42")).toBe("Auth: nova_[redacted]");

      // n8n
      expect(sanitizeToolError("Header: n8n_api_key_production_001")).toBe(
        "Header: n8n_api_[redacted]",
      );

      // Cloudflare
      expect(sanitizeToolError("CF: cf_token_abc-123_XYZ-789")).toBe("CF: cf_token_[redacted]");

      // Bearer & Basic auth headers (case-insensitive)
      expect(sanitizeToolError("Authorization: Bearer secret-oauth-token-value")).toBe(
        "Authorization: Bearer [redacted]",
      );
      expect(sanitizeToolError("authorization: bearer secret-oauth-token-value")).toBe(
        "authorization: Bearer [redacted]",
      );
      expect(sanitizeToolError("Authorization: Basic dXNlcjpwYXNzd29yZA==")).toBe(
        "Authorization: Basic [redacted]",
      );
      expect(sanitizeToolError("authorization: basic dXNlcjpwYXNzd29yZA==")).toBe(
        "authorization: Basic [redacted]",
      );
    });

    it("handles multiline error stacks and JSON strings containing tokens without leakage", () => {
      const errorJson = JSON.stringify({
        status: 401,
        message: "Unauthorized request with token ghp_secret123 in header Bearer tok_456",
        details: {
          notion: "ntn_live_key_999",
          postiz: "pk_test_888",
          n8n: "n8n_api_key_777",
          cf: "cf_token_custom-dns-key",
        },
      });

      const sanitized = sanitizeToolError(errorJson);
      expect(sanitized).not.toContain("ghp_secret123");
      expect(sanitized).not.toContain("tok_456");
      expect(sanitized).not.toContain("ntn_live_key_999");
      expect(sanitized).not.toContain("pk_test_888");
      expect(sanitized).not.toContain("n8n_api_key_777");
      expect(sanitized).not.toContain("cf_token_custom-dns-key");
      expect(sanitized).toContain("ghp_[redacted]");
      expect(sanitized).toContain("ntn_[redacted]");
      expect(sanitized).toContain("pk_[redacted]");
      expect(sanitized).toContain("n8n_api_[redacted]");
      expect(sanitized).toContain("cf_token_[redacted]");
    });

    it("creates combined AbortSignal with timeout", () => {
      const signal1 = createCombinedSignal(5000);
      expect(signal1).toBeInstanceOf(AbortSignal);

      const controller = new AbortController();
      const signal2 = createCombinedSignal(5000, controller.signal);
      expect(signal2).toBeInstanceOf(AbortSignal);
    });
  });

  describe("1. GitHub Integration", () => {
    beforeEach(() => {
      process.env.GITHUB_TOKEN = "ghp_mock_token_123456";
    });

    it("validates empty query in github_search_repos", async () => {
      const res = await executeGithubSearchRepos({ q: "" });
      expect(res).toEqual({ error: "GitHub search query 'q' must not be empty." });
    });

    it("executes github_search_repos successfully", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        text: async () =>
          JSON.stringify({
            total_count: 1,
            items: [
              {
                id: 101,
                name: "rakazo",
                full_name: "rakazo/rakazo",
                description: "Multi-agent platform",
                html_url: "https://github.com/rakazo/rakazo",
                stargazers_count: 42,
                language: "TypeScript",
                forks_count: 5,
                updated_at: "2026-08-21T00:00:00Z",
              },
            ],
          }),
      });
      global.fetch = mockFetch;

      const res = await executeGithubSearchRepos({ q: "rakazo", sort: "stars", per_page: 10 });
      expect(mockFetch).toHaveBeenCalled();
      const firstCall = mockFetch.mock.calls[0]!;
      const calledUrl = String(firstCall[0]);
      expect(calledUrl).toContain("q=rakazo");
      expect(calledUrl).toContain("sort=stars");
      expect(calledUrl).toContain("per_page=10");

      const headers = (firstCall[1] as RequestInit).headers as Record<string, string>;
      expect(headers.Authorization).toBe("Bearer ghp_mock_token_123456");

      expect(res).toEqual({
        total_count: 1,
        items: [
          {
            name: "rakazo",
            full_name: "rakazo/rakazo",
            description: "Multi-agent platform",
            html_url: "https://github.com/rakazo/rakazo",
            stars: 42,
            language: "TypeScript",
            forks: 5,
            updated_at: "2026-08-21T00:00:00Z",
          },
        ],
      });
    });

    it("executes github_get_file_contents and decodes base64", async () => {
      const fileContent = "export const version = '1.0.0';";
      const b64 = Buffer.from(fileContent).toString("base64");
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        text: async () =>
          JSON.stringify({
            name: "version.ts",
            path: "src/version.ts",
            sha: "abc123sha",
            size: 31,
            type: "file",
            content: b64,
            encoding: "base64",
            html_url: "https://github.com/org/repo/blob/main/src/version.ts",
            download_url: "https://raw.githubusercontent.com/org/repo/main/src/version.ts",
          }),
      });

      const res = await executeGithubGetFileContents({
        owner: "org",
        repo: "repo",
        path: "src/version.ts",
        ref: "main",
      });

      expect(res).toEqual({
        name: "version.ts",
        path: "src/version.ts",
        sha: "abc123sha",
        size: 31,
        type: "file",
        content: fileContent,
        html_url: "https://github.com/org/repo/blob/main/src/version.ts",
        download_url: "https://raw.githubusercontent.com/org/repo/main/src/version.ts",
      });
    });

    it("validates missing params in github_get_file_contents", async () => {
      const res = await executeGithubGetFileContents({ owner: "", repo: "repo", path: "" });
      expect(res).toEqual({
        error: "Missing required parameters: 'owner', 'repo', and 'path' are required.",
      });
    });

    it("executes github_list_issues", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        text: async () =>
          JSON.stringify([
            {
              id: 1,
              number: 42,
              title: "Bug in runtime",
              state: "open",
              user: { login: "octocat" },
              html_url: "https://github.com/org/repo/issues/42",
              comments: 3,
              labels: [{ name: "bug" }],
              created_at: "2026-08-20T10:00:00Z",
              body: "Here is the bug details",
            },
          ]),
      });

      const res = await executeGithubListIssues({ owner: "org", repo: "repo", state: "open" });
      expect(res).toHaveProperty("issues");
      const issues = (res as { issues: Array<{ number: number; title: string }> }).issues;
      expect(issues.length).toBe(1);
      expect(issues[0]!.number).toBe(42);
      expect(issues[0]!.title).toBe("Bug in runtime");
    });

    it("executes github_create_issue", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        text: async () =>
          JSON.stringify({
            id: 200,
            number: 43,
            title: "New Feature",
            state: "open",
            html_url: "https://github.com/org/repo/issues/43",
            created_at: "2026-08-21T12:00:00Z",
          }),
      });

      const res = await executeGithubCreateIssue({
        owner: "org",
        repo: "repo",
        title: "New Feature",
        body: "Please implement this",
        labels: ["enhancement"],
      });

      expect(res).toEqual({
        ok: true,
        id: 200,
        number: 43,
        title: "New Feature",
        state: "open",
        html_url: "https://github.com/org/repo/issues/43",
        created_at: "2026-08-21T12:00:00Z",
      });
    });

    it("returns configuration error when GITHUB_TOKEN is unset for create issue", async () => {
      delete process.env.GITHUB_TOKEN;
      const res = await executeGithubCreateIssue({ owner: "org", repo: "repo", title: "New" });
      expect(res).toEqual({
        error: "GitHub integration is not configured. Please set GITHUB_TOKEN.",
      });
    });

    it("executes github_get_pull_request", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        text: async () =>
          JSON.stringify({
            number: 10,
            title: "Add MCP Tools",
            state: "open",
            user: { login: "developer" },
            html_url: "https://github.com/org/repo/pull/10",
            created_at: "2026-08-21T11:00:00Z",
            body: "Adds enterprise tools",
            merged: false,
            mergeable: true,
            additions: 120,
            deletions: 10,
            changed_files: 3,
            head: { ref: "feature/tools", sha: "head123" },
            base: { ref: "main", sha: "base123" },
          }),
      });

      const res = await executeGithubGetPullRequest({
        owner: "org",
        repo: "repo",
        pull_number: 10,
      });
      expect(res).toHaveProperty("number", 10);
      expect(res).toHaveProperty("head_branch", "feature/tools");
      expect(res).toHaveProperty("additions", 120);
    });

    it("executes github_create_issue_comment", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        text: async () =>
          JSON.stringify({
            id: 999,
            html_url: "https://github.com/org/repo/issues/42#issuecomment-999",
            created_at: "2026-08-21T13:00:00Z",
            user: { login: "agent" },
            body: "Fixed in PR #10",
          }),
      });

      const res = await executeGithubCreateIssueComment({
        owner: "org",
        repo: "repo",
        issue_number: 42,
        body: "Fixed in PR #10",
      });

      expect(res).toEqual({
        ok: true,
        id: 999,
        html_url: "https://github.com/org/repo/issues/42#issuecomment-999",
        created_at: "2026-08-21T13:00:00Z",
        author: "agent",
        body: "Fixed in PR #10",
      });
    });
  });

  describe("2. Notion Integration", () => {
    beforeEach(() => {
      process.env.NOTION_API_KEY = "ntn_mock_secret_key";
    });

    it("fails with unconfigured message when NOTION_API_KEY is missing", async () => {
      delete process.env.NOTION_API_KEY;
      const res = await executeNotionSearch({ query: "tasks" });
      expect(res).toEqual({
        error: "Notion integration is not configured. Please set NOTION_API_KEY.",
      });
    });

    it("executes notion_search", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        text: async () =>
          JSON.stringify({
            results: [
              {
                id: "page-123",
                object: "page",
                url: "https://notion.so/page-123",
                last_edited_time: "2026-08-21T09:00:00Z",
                properties: { title: { id: "title" } },
              },
            ],
            has_more: false,
            next_cursor: null,
          }),
      });

      const res = await executeNotionSearch({ query: "Project Roadmap" });
      expect(res).toEqual({
        results: [
          {
            id: "page-123",
            object: "page",
            url: "https://notion.so/page-123",
            last_edited_time: "2026-08-21T09:00:00Z",
            properties: { title: { id: "title" } },
          },
        ],
        has_more: false,
        next_cursor: null,
      });
    });

    it("executes notion_get_page with blocks", async () => {
      global.fetch = vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          text: async () =>
            JSON.stringify({
              id: "page-123",
              object: "page",
              url: "https://notion.so/page-123",
              created_time: "2026-08-01T00:00:00Z",
              last_edited_time: "2026-08-21T00:00:00Z",
              archived: false,
              properties: { Title: {} },
              parent: { type: "workspace" },
            }),
        })
        .mockResolvedValueOnce({
          ok: true,
          text: async () =>
            JSON.stringify({
              results: [{ id: "block-1", type: "paragraph", paragraph: { rich_text: [] } }],
            }),
        });

      const res = await executeNotionGetPage({ page_id: "page-123" });
      expect(res).toHaveProperty("id", "page-123");
      expect(res).toHaveProperty("blocks");
      expect((res as { blocks: unknown[] }).blocks.length).toBe(1);
    });

    it("executes notion_query_database", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        text: async () =>
          JSON.stringify({
            results: [
              {
                id: "row-1",
                object: "page",
                url: "https://notion.so/row-1",
                properties: { Status: { select: { name: "Done" } } },
                created_time: "2026-08-20T00:00:00Z",
                last_edited_time: "2026-08-21T00:00:00Z",
              },
            ],
            has_more: false,
            next_cursor: null,
          }),
      });

      const res = await executeNotionQueryDatabase({ database_id: "db-123" });
      expect(res).toHaveProperty("results");
      expect((res as { results: unknown[] }).results.length).toBe(1);
    });

    it("executes notion_create_page", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        text: async () =>
          JSON.stringify({
            id: "page-new-123",
            url: "https://notion.so/page-new-123",
            created_time: "2026-08-21T12:00:00Z",
            properties: { Name: { title: [{ text: { content: "New Document" } }] } },
          }),
      });

      const res = await executeNotionCreatePage({
        parent: { database_id: "db-123" },
        properties: { Name: { title: [{ text: { content: "New Document" } }] } },
      });

      expect(res).toEqual({
        ok: true,
        id: "page-new-123",
        url: "https://notion.so/page-new-123",
        created_time: "2026-08-21T12:00:00Z",
        properties: { Name: { title: [{ text: { content: "New Document" } }] } },
      });
    });

    it("executes notion_update_page", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        text: async () =>
          JSON.stringify({
            id: "page-123",
            url: "https://notion.so/page-123",
            last_edited_time: "2026-08-21T14:00:00Z",
            archived: false,
            properties: {},
          }),
      });

      const res = await executeNotionUpdatePage({
        page_id: "page-123",
        properties: { Status: { select: { name: "Archived" } } },
      });

      expect(res).toEqual({
        ok: true,
        id: "page-123",
        url: "https://notion.so/page-123",
        last_edited_time: "2026-08-21T14:00:00Z",
        archived: false,
      });
    });
  });

  describe("3. Postiz Integration", () => {
    beforeEach(() => {
      process.env.POSTIZ_API_KEY = "pk_live_mock_key";
    });

    it("executes postiz_list_integrations", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        text: async () =>
          JSON.stringify([
            {
              id: "int-linkedin-1",
              name: "LinkedIn Company Page",
              identifier: "rakazo-org",
              type: "linkedin",
              status: "connected",
            },
          ]),
      });

      const res = await executePostizListIntegrations({});
      expect(res).toEqual({
        integrations: [
          {
            id: "int-linkedin-1",
            name: "LinkedIn Company Page",
            identifier: "rakazo-org",
            provider: "linkedin",
            status: "connected",
          },
        ],
      });
    });

    it("executes postiz_create_post", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        text: async () =>
          JSON.stringify({
            id: "post-101",
            content: "Excited to launch Rakazo 2.0!",
            status: "scheduled",
            scheduledAt: "2026-08-22T10:00:00Z",
          }),
      });

      const res = await executePostizCreatePost({
        content: "Excited to launch Rakazo 2.0!",
        integrationIds: ["int-linkedin-1"],
        scheduledAt: "2026-08-22T10:00:00Z",
      });

      expect(res).toEqual({
        ok: true,
        id: "post-101",
        content: "Excited to launch Rakazo 2.0!",
        status: "scheduled",
        scheduledAt: "2026-08-22T10:00:00Z",
      });
    });

    it("executes postiz_list_posts", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        text: async () =>
          JSON.stringify({
            posts: [
              {
                id: "post-101",
                content: "Hello Social Media",
                status: "published",
              },
            ],
            total: 1,
          }),
      });

      const res = await executePostizListPosts({ status: "published" });
      expect(res).toEqual({
        posts: [
          {
            id: "post-101",
            content: "Hello Social Media",
            status: "published",
          },
        ],
        total: 1,
      });
    });
  });

  describe("4. WordPress & Novamira Integration", () => {
    beforeEach(() => {
      process.env.WORDPRESS_URL = "https://novamira.com";
      process.env.WORDPRESS_USERNAME = "admin";
      process.env.WORDPRESS_APP_PASSWORD = "mock pass word 1234";
      process.env.NOVAMIRA_API_KEY = "nova_key_test";
    });

    it("executes wordpress_list_posts", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        text: async () =>
          JSON.stringify([
            {
              id: 1,
              date: "2026-08-20T10:00:00",
              status: "publish",
              slug: "welcome-post",
              link: "https://novamira.com/welcome-post",
              title: { rendered: "Welcome to Novamira" },
              excerpt: { rendered: "<p>This is a welcome post.</p>" },
              categories: [2],
              tags: [5],
            },
          ]),
      });

      const res = await executeWordpressListPosts({ status: "publish" });
      expect(res).toEqual({
        posts: [
          {
            id: 1,
            date: "2026-08-20T10:00:00",
            status: "publish",
            slug: "welcome-post",
            link: "https://novamira.com/welcome-post",
            title: "Welcome to Novamira",
            excerpt: "This is a welcome post.",
            categories: [2],
            tags: [5],
          },
        ],
      });
    });

    it("executes wordpress_get_post", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        text: async () =>
          JSON.stringify({
            id: 1,
            date: "2026-08-20T10:00:00",
            modified: "2026-08-21T09:00:00",
            slug: "welcome-post",
            status: "publish",
            link: "https://novamira.com/welcome-post",
            title: { rendered: "Welcome to Novamira" },
            content: { rendered: "<p>Full content of the post.</p>" },
            excerpt: { rendered: "<p>Summary</p>" },
            author: 1,
            categories: [2],
            tags: [5],
          }),
      });

      const res = await executeWordpressGetPost({ id: 1 });
      expect(res).toHaveProperty("title", "Welcome to Novamira");
      expect(res).toHaveProperty("content", "<p>Full content of the post.</p>");
    });

    it("executes wordpress_create_post", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        text: async () =>
          JSON.stringify({
            id: 50,
            date: "2026-08-21T15:00:00",
            status: "draft",
            link: "https://novamira.com/?p=50",
            slug: "agent-architecture",
            title: { rendered: "Agent Architecture" },
          }),
      });

      const res = await executeWordpressCreatePost({
        title: "Agent Architecture",
        content: "<p>Architecture details</p>",
        status: "draft",
      });

      expect(res).toEqual({
        ok: true,
        id: 50,
        title: "Agent Architecture",
        status: "draft",
        link: "https://novamira.com/?p=50",
        date: "2026-08-21T15:00:00",
      });
    });

    it("executes wordpress_update_post", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        text: async () =>
          JSON.stringify({
            id: 50,
            modified: "2026-08-21T15:30:00",
            status: "publish",
            link: "https://novamira.com/agent-architecture",
            title: { rendered: "Agent Architecture (Published)" },
          }),
      });

      const res = await executeWordpressUpdatePost({
        id: 50,
        title: "Agent Architecture (Published)",
        status: "publish",
      });

      expect(res).toEqual({
        ok: true,
        id: 50,
        title: "Agent Architecture (Published)",
        status: "publish",
        link: "https://novamira.com/agent-architecture",
        modified: "2026-08-21T15:30:00",
      });
    });

    it("executes novamira_execute_ability", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        text: async () =>
          JSON.stringify({
            success: true,
            result: { generated: true, url: "https://novamira.com/report" },
          }),
      });

      const res = await executeNovamiraExecuteAbility({
        site: "novamira.com",
        ability: "generate_seo_report",
        params: { depth: 3 },
      });

      expect(res).toEqual({
        success: true,
        result: { generated: true, url: "https://novamira.com/report" },
      });
    });
  });

  describe("5. n8n Integration", () => {
    beforeEach(() => {
      process.env.N8N_API_KEY = "n8n_api_mock_secret";
      process.env.N8N_API_URL = "http://n8n:5678";
    });

    it("executes n8n_trigger_webhook", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        text: async () =>
          JSON.stringify({ message: "Workflow was started", executionId: "exec-99" }),
      });

      const res = await executeN8nTriggerWebhook({
        webhookPath: "lead-intake",
        data: { name: "Client Lead", email: "client@example.com" },
      });

      expect(res).toEqual({
        ok: true,
        result: { message: "Workflow was started", executionId: "exec-99" },
      });
    });

    it("executes n8n_list_workflows", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        text: async () =>
          JSON.stringify({
            data: [
              {
                id: "wf-1",
                name: "Sync Lead to CRM",
                active: true,
                createdAt: "2026-08-01T00:00:00Z",
                updatedAt: "2026-08-20T00:00:00Z",
                tags: [{ id: "t1", name: "CRM" }],
              },
            ],
          }),
      });

      const res = await executeN8nListWorkflows({ active: true });
      expect(res).toEqual({
        workflows: [
          {
            id: "wf-1",
            name: "Sync Lead to CRM",
            active: true,
            createdAt: "2026-08-01T00:00:00Z",
            updatedAt: "2026-08-20T00:00:00Z",
            tags: ["CRM"],
          },
        ],
      });
    });

    it("executes n8n_get_execution", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        text: async () =>
          JSON.stringify({
            id: "exec-99",
            finished: true,
            mode: "webhook",
            status: "success",
            startedAt: "2026-08-21T10:00:00Z",
            stoppedAt: "2026-08-21T10:00:02Z",
            workflowId: "wf-1",
            data: { resultData: {} },
          }),
      });

      const res = await executeN8nGetExecution({ executionId: "exec-99", includeData: true });
      expect(res).toEqual({
        id: "exec-99",
        finished: true,
        status: "success",
        mode: "webhook",
        startedAt: "2026-08-21T10:00:00Z",
        stoppedAt: "2026-08-21T10:00:02Z",
        workflowId: "wf-1",
        resultSummary: "data included",
      });
    });
  });

  describe("6. Cloudflare Integration", () => {
    beforeEach(() => {
      process.env.CLOUDFLARE_API_TOKEN = "cf_token_mock_123456";
    });

    it("executes cloudflare_list_zones", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        text: async () =>
          JSON.stringify({
            success: true,
            result: [
              {
                id: "zone-123",
                name: "workspacegroupefloteuil.eu",
                status: "active",
                paused: false,
                type: "full",
                name_servers: ["ns1.cloudflare.com", "ns2.cloudflare.com"],
              },
            ],
            result_info: { total_count: 1, page: 1, per_page: 50 },
          }),
      });

      const res = await executeCloudflareListZones({ name: "workspacegroupefloteuil.eu" });
      expect(res).toEqual({
        zones: [
          {
            id: "zone-123",
            name: "workspacegroupefloteuil.eu",
            status: "active",
            paused: false,
            name_servers: ["ns1.cloudflare.com", "ns2.cloudflare.com"],
          },
        ],
        total: 1,
      });
    });

    it("executes cloudflare_list_dns_records", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        text: async () =>
          JSON.stringify({
            success: true,
            result: [
              {
                id: "rec-1",
                zone_id: "zone-123",
                name: "api.workspacegroupefloteuil.eu",
                type: "A",
                content: "192.0.2.1",
                proxiable: true,
                proxied: true,
                ttl: 1,
                created_on: "2026-08-01T00:00:00Z",
                modified_on: "2026-08-20T00:00:00Z",
              },
            ],
          }),
      });

      const res = await executeCloudflareListDnsRecords({ zone_id: "zone-123", type: "A" });
      expect(res).toEqual({
        records: [
          {
            id: "rec-1",
            name: "api.workspacegroupefloteuil.eu",
            type: "A",
            content: "192.0.2.1",
            proxied: true,
            ttl: 1,
            modified_on: "2026-08-20T00:00:00Z",
          },
        ],
      });
    });

    it("executes cloudflare_create_dns_record", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        text: async () =>
          JSON.stringify({
            success: true,
            result: {
              id: "rec-new-1",
              name: "sub.workspacegroupefloteuil.eu",
              type: "CNAME",
              content: "target.coolify.internal",
              proxied: true,
              ttl: 1,
            },
          }),
      });

      const res = await executeCloudflareCreateDnsRecord({
        zone_id: "zone-123",
        type: "CNAME",
        name: "sub",
        content: "target.coolify.internal",
        proxied: true,
      });

      expect(res).toEqual({
        ok: true,
        id: "rec-new-1",
        name: "sub.workspacegroupefloteuil.eu",
        type: "CNAME",
        content: "target.coolify.internal",
        proxied: true,
        ttl: 1,
      });
    });

    it("executes cloudflare_purge_cache", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        text: async () =>
          JSON.stringify({
            success: true,
            result: { id: "purge-job-1" },
          }),
      });

      const res = await executeCloudflarePurgeCache({
        zone_id: "zone-123",
        purge_everything: true,
      });

      expect(res).toEqual({
        ok: true,
        id: "purge-job-1",
        success: true,
      });
    });
  });

  describe("Central executeEnterpriseTool Dispatcher", () => {
    it("dispatches GitHub tools with camelCase / snake_case arguments", async () => {
      process.env.GITHUB_TOKEN = "ghp_mock";
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        text: async () => JSON.stringify({ total_count: 0, items: [] }),
      });

      const res = await executeEnterpriseTool("github_search_repos", {
        query: "vitest",
        perPage: 5,
      });
      expect(res).toEqual({ total_count: 0, items: [] });
    });

    it("returns error for unrecognized enterprise tool name", async () => {
      const res = await executeEnterpriseTool("unknown_enterprise_tool", {});
      expect(res).toEqual({ error: "Enterprise tool unknown_enterprise_tool not recognized." });
    });
  });
});
