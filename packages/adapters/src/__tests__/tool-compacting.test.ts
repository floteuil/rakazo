import { describe, expect, it } from "vitest";
import {
  cleanJsonPayload,
  compactToolResult,
  MAX_FILE_ENTRIES_BEFORE_COMPACT,
  MAX_FILE_SAMPLE_ENTRIES,
  MAX_GENERIC_RESULT_CHARS,
  MAX_SHELL_OUTPUT_CHARS,
  safelyTruncateJson,
} from "../tool-compacting.js";

describe("Tool Response Semantic Compacting Suite", () => {
  // ==========================================================================
  // 1. list_files Compacting
  // ==========================================================================
  describe("1. list_files Compacting", () => {
    it("preserves full list when <= 40 items", () => {
      const files = Array.from({ length: 40 }, (_, i) => `src/file_${i}.ts`);
      const output = compactToolResult("list_files", files);
      expect(output).not.toContain("more files");
      expect(output).toContain("src/file_0.ts");
      expect(output).toContain("src/file_39.ts");
      const parsed = JSON.parse(output);
      expect(parsed).toHaveLength(40);
    });

    it("returns '[]' for empty list", () => {
      expect(compactToolResult("list_files", [])).toBe("[]");
    });

    it("summarizes and samples when count > 40 items", () => {
      const files = Array.from({ length: 100 }, (_, i) =>
        i < 50 ? `packages/adapters/src/file_${i}.ts` : `apps/web/src/comp_${i}.tsx`,
      );
      const output = compactToolResult("list_files", files);

      // Verify directory structure breakdown
      expect(output).toContain("Found 100 files across directories");
      expect(output).toContain("packages/");
      expect(output).toContain("apps/");

      // Verify top 30 files sample
      expect(output).toContain(`showing first ${MAX_FILE_SAMPLE_ENTRIES}`);
      expect(output).toContain("packages/adapters/src/file_0.ts");
      expect(output).toContain("packages/adapters/src/file_29.ts");
      expect(output).not.toContain("packages/adapters/src/file_31.ts");

      // Verify summary line ... (+X more files)
      expect(output).toContain("... (+70 more files)");
    });

    it("handles object formats with entries or files property", () => {
      const payload = {
        path: "/workspace",
        entries: Array.from({ length: 50 }, (_, i) => ({ path: `src/item_${i}.ts`, type: "file" })),
      };
      const output = compactToolResult("list_files", payload);
      expect(output).toContain("Found 50 files");
      expect(output).toContain("src/item_0.ts");
      expect(output).toContain("... (+20 more files)");
    });

    it("handles EXACTLY 40 entries boundary (no compacting) and 41 entries boundary (triggers compacting)", () => {
      const exactly40 = Array.from({ length: 40 }, (_, i) => `file_${i}.ts`);
      const output40 = compactToolResult("list_files", exactly40);
      expect(output40).not.toContain("more files");
      expect(JSON.parse(output40)).toHaveLength(40);

      const exactly41 = Array.from({ length: 41 }, (_, i) => `file_${i}.ts`);
      const output41 = compactToolResult("list_files", exactly41);
      expect(output41).toContain("Found 41 files");
      expect(output41).toContain("... (+11 more files)");
    });
  });

  // ==========================================================================
  // 2. shell Output Compacting
  // ==========================================================================
  describe("2. shell Output Compacting", () => {
    it("returns output as-is when <= 4,000 characters", () => {
      const shortLog = "Compilation passed in 320ms. 0 errors, 0 warnings.";
      const output = compactToolResult("shell", shortLog);
      expect(output).toBe(shortLog);
    });

    it("returns EXACTLY 4,000 characters without truncation", () => {
      const exact4000 = "x".repeat(4000);
      const output = compactToolResult("shell", exact4000);
      expect(output.length).toBe(4000);
      expect(output).not.toContain("truncated");
    });

    it("truncates when > 4,000 characters retaining 2,000 chars head and 2,000 chars tail with marker", () => {
      const head = "START_BUILD_PIPELINE\n" + "H".repeat(1970) + "\nHEAD_END\n";
      const middle = "NOISY_COMPILER_WARNING_".repeat(600);
      const tail = "\nTAIL_START\n" + "T".repeat(1970) + "\nEND_BUILD_PIPELINE";
      const rawLog = head + middle + tail;

      expect(rawLog.length).toBeGreaterThan(15000);
      const output = compactToolResult("shell", rawLog);

      // Verify head and tail preservation
      expect(output).toContain("START_BUILD_PIPELINE");
      expect(output).toContain("END_BUILD_PIPELINE");

      // Verify marker format
      const omitted = rawLog.length - 4000;
      expect(output).toContain(`[... ${omitted} characters truncated ...]`);
      expect(output.length).toBe(4000 + `\n[... ${omitted} characters truncated ...]\n`.length);
    });

    it("extracts stdout and stderr from structured shell objects", () => {
      const shellResult = {
        stdout: "Build succeeded.",
        stderr: "warning: deprecated dependency",
        exitCode: 0,
      };
      const output = compactToolResult("shell", shellResult);
      expect(output).toBe("Build succeeded.\nwarning: deprecated dependency");
    });

    it("handles shell objects with output field", () => {
      const shellResult = { output: "Command completed successfully." };
      expect(compactToolResult("shell", shellResult)).toBe("Command completed successfully.");
    });
  });

  // ==========================================================================
  // 3. github_search_repos Compacting
  // ==========================================================================
  describe("3. github_search_repos Compacting", () => {
    it("compacts repo objects to { total_count, items: repo.map(r => `${r.full_name} (${r.stars}⭐, ${r.language}) - ${r.description}`) }", () => {
      const rawRepos = {
        total_count: 24,
        items: [
          {
            id: 101,
            node_id: "MDkx==",
            name: "rakazo-agent",
            full_name: "rakazo/rakazo-agent",
            stargazers_count: 350,
            language: "TypeScript",
            description: "Enterprise autonomous agent orchestration runtime",
            forks_count: 45,
            open_issues_count: 2,
            html_url: "https://github.com/rakazo/rakazo-agent",
          },
          {
            id: 102,
            name: "rakazo-ui",
            full_name: "rakazo/rakazo-ui",
            stars: 120,
            language: "React",
            description: "Modern desktop & web dashboard for agents",
          },
        ],
      };

      const output = compactToolResult("github_search_repos", rawRepos);
      const parsed = JSON.parse(output);

      expect(parsed.total_count).toBe(24);
      expect(parsed.items).toHaveLength(2);
      expect(parsed.items[0]).toBe(
        "rakazo/rakazo-agent (350⭐, TypeScript) - Enterprise autonomous agent orchestration runtime",
      );
      expect(parsed.items[1]).toBe(
        "rakazo/rakazo-ui (120⭐, React) - Modern desktop & web dashboard for agents",
      );
    });

    it("handles array inputs directly for github_search_repos", () => {
      const reposArray = [
        {
          full_name: "facebook/react",
          stars: 220000,
          language: "JavaScript",
          description: "A declarative, efficient UI library",
        },
      ];
      const output = compactToolResult("github_search_repos", reposArray);
      const parsed = JSON.parse(output);
      expect(parsed.total_count).toBe(1);
      expect(parsed.items[0]).toBe(
        "facebook/react (220000⭐, JavaScript) - A declarative, efficient UI library",
      );
    });

    it("returns '[]' for empty array search result", () => {
      expect(compactToolResult("github_search_repos", [])).toBe("[]");
    });
  });

  // ==========================================================================
  // 4. github_list_issues Compacting
  // ==========================================================================
  describe("4. github_list_issues Compacting", () => {
    it("compacts issues to list of #number [state] title (@author)", () => {
      const issues = [
        {
          number: 142,
          state: "open",
          title: "Fix circuit breaker state synchronization",
          author: "octocat",
          body: "Full verbose description with stack traces...",
          labels: ["bug", "critical"],
        },
        {
          number: 143,
          state: "closed",
          title: "Add support for Cloudflare DNS token rotation",
          user: { login: "alice" },
        },
      ];

      const output = compactToolResult("github_list_issues", issues);
      const parsed = JSON.parse(output);

      expect(parsed).toEqual([
        "#142 [open] Fix circuit breaker state synchronization (@octocat)",
        "#143 [closed] Add support for Cloudflare DNS token rotation (@alice)",
      ]);
    });

    it("handles object wrapped issues payload", () => {
      const payload = {
        issues: [
          {
            number: 1,
            state: "open",
            title: "Initial release",
            author: "admin",
          },
        ],
      };
      const output = compactToolResult("github_list_issues", payload);
      const parsed = JSON.parse(output);
      expect(parsed).toEqual(["#1 [open] Initial release (@admin)"]);
    });

    it("returns '[]' for empty issues array", () => {
      expect(compactToolResult("github_list_issues", [])).toBe("[]");
    });
  });

  // ==========================================================================
  // 5. notion_search & notion_query_database Compacting
  // ==========================================================================
  describe("5. notion_search & notion_query_database Compacting", () => {
    it("notion_search: strips nested block trees and extracts clean page summaries", () => {
      const rawSearch = {
        results: [
          {
            id: "page-001",
            object: "page",
            url: "https://notion.so/rakazo/Arch-Decision-Record",
            last_edited_time: "2026-08-22T10:00:00.000Z",
            properties: {
              Name: {
                id: "title",
                type: "title",
                title: [{ plain_text: "Architecture Decision Record" }],
              },
              ExtraNestedMetadata: { id: "foo", formula: { type: "string", string: "redundant" } },
            },
            archived: false,
          },
        ],
      };

      const output = compactToolResult("notion_search", rawSearch);
      const parsed = JSON.parse(output);

      expect(parsed).toHaveLength(1);
      expect(parsed[0]).toEqual({
        id: "page-001",
        object: "page",
        title: "Architecture Decision Record",
        url: "https://notion.so/rakazo/Arch-Decision-Record",
        last_edited_time: "2026-08-22T10:00:00.000Z",
      });
      expect(parsed[0]).not.toHaveProperty("ExtraNestedMetadata");
    });

    it("notion_query_database: flattens property trees into clean key-values", () => {
      const rawDbQuery = {
        results: [
          {
            id: "row-101",
            object: "page",
            url: "https://notion.so/rakazo/row-101",
            properties: {
              Task: { type: "title", title: [{ plain_text: "Refactor pi-runtime" }] },
              Status: { type: "select", select: { name: "In Progress", color: "yellow" } },
              Priority: { type: "number", number: 1 },
              Tags: {
                type: "multi_select",
                multi_select: [{ name: "backend" }, { name: "runtime" }],
              },
              Done: { type: "checkbox", checkbox: false },
              DueDate: { type: "date", date: { start: "2026-08-30" } },
            },
          },
        ],
      };

      const output = compactToolResult("notion_query_database", rawDbQuery);
      const parsed = JSON.parse(output);

      expect(parsed[0].id).toBe("row-101");
      expect(parsed[0].title).toBe("Refactor pi-runtime");
      expect(parsed[0].properties).toEqual({
        Task: "Refactor pi-runtime",
        Status: "In Progress",
        Priority: 1,
        Tags: ["backend", "runtime"],
        Done: false,
        DueDate: "2026-08-30",
      });
    });
  });

  // ==========================================================================
  // 6. cloudflare_list_dns_records Compacting
  // ==========================================================================
  describe("6. cloudflare_list_dns_records Compacting", () => {
    it("formats DNS records as a clean tabular array [type, name, content, proxied]", () => {
      const rawDns = {
        records: [
          {
            id: "rec_1",
            zone_id: "zone_abc",
            name: "rakazo.io",
            type: "A",
            content: "192.0.2.1",
            proxied: true,
            ttl: 1,
            meta: { auto_added: false },
          },
          {
            id: "rec_2",
            name: "api.rakazo.io",
            type: "CNAME",
            content: "rakazo-backend.fly.dev",
            proxied: false,
            ttl: 300,
          },
        ],
      };

      const output = compactToolResult("cloudflare_list_dns_records", rawDns);
      const parsed = JSON.parse(output);

      expect(parsed).toEqual([
        ["A", "rakazo.io", "192.0.2.1", true],
        ["CNAME", "api.rakazo.io", "rakazo-backend.fly.dev", false],
      ]);
    });

    it("handles direct array of DNS records", () => {
      const records = [
        {
          type: "TXT",
          name: "rakazo.io",
          content: "v=spf1 include:_spf.google.com ~all",
          proxied: false,
        },
      ];
      const output = compactToolResult("cloudflare_list_dns_records", records);
      const parsed = JSON.parse(output);
      expect(parsed).toEqual([["TXT", "rakazo.io", "v=spf1 include:_spf.google.com ~all", false]]);
    });

    it("returns '[]' for empty DNS records", () => {
      expect(compactToolResult("cloudflare_list_dns_records", [])).toBe("[]");
    });
  });

  // ==========================================================================
  // 7. General JSON Fallback & Pruning
  // ==========================================================================
  describe("7. General JSON Fallback & Pruning", () => {
    it("returns 'ok' for null and undefined inputs", () => {
      expect(compactToolResult("custom_tool", null)).toBe("ok");
      expect(compactToolResult("custom_tool", undefined)).toBe("ok");
    });

    it("recursively strips nulls, undefined, and empty objects", () => {
      const messyData = {
        id: 1,
        emptyField: null,
        missing: undefined,
        emptyObj: {},
        nested: {
          valid: true,
          deepNull: null,
          deepEmpty: {},
        },
        items: [1, null, 2, undefined, 3],
      };

      const cleaned = cleanJsonPayload(messyData);
      expect(cleaned).toEqual({
        id: 1,
        nested: { valid: true },
        items: [1, 2, 3],
      });
    });

    it("safely truncates massive payloads under 12,000 characters without crashing", () => {
      const hugeData = {
        status: "success",
        largeArray: Array.from({ length: 500 }, (_, i) => ({
          index: i,
          title: `Item number ${i} with long verbose descriptive text payload to inflate byte size`,
        })),
      };

      const output = compactToolResult("unknown_service_tool", hugeData);
      expect(output.length).toBeLessThanOrEqual(MAX_GENERIC_RESULT_CHARS);
      // Valid JSON or clean ellipsis
      expect(output.length).toBeLessThanOrEqual(12000);
    });

    it("preserves empty objects {} and arrays [] if root", () => {
      expect(compactToolResult("generic_tool", {})).toBe("{}");
      expect(compactToolResult("generic_tool", [])).toBe("[]");
    });

    it("safely formats primitive values (numbers, booleans, strings)", () => {
      expect(compactToolResult("generic_tool", "plain text response")).toBe("plain text response");
      expect(compactToolResult("generic_tool", 12345)).toBe("12345");
      expect(compactToolResult("generic_tool", true)).toBe("true");
    });
  });
});
