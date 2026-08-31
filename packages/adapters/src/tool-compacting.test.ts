import { describe, expect, it } from "vitest";
import { compactToolResult } from "./tool-compacting.js";

describe("E2E Token Efficiency Suite: Tool Response Semantic Compacting", () => {
  // ==========================================================================
  // TIER 1: FEATURE COVERAGE (Happy Paths - ≥ 5 tests per feature)
  // ==========================================================================
  describe("Tier 1: Feature Coverage (Happy Paths)", () => {
    it("1.1 list_files compacting: preserves list when <= 40 items", () => {
      const files = Array.from({ length: 15 }, (_, i) => `src/file_${i}.ts`);
      const output = compactToolResult("list_files", files);
      expect(output).toContain("src/file_0.ts");
      expect(output).toContain("src/file_14.ts");
    });

    it("1.2 list_files compacting: summarizes and samples when > 40 items", () => {
      const files = Array.from({ length: 60 }, (_, i) => `src/module_${i}.ts`);
      const output = compactToolResult("list_files", files);
      expect(output).toContain("60 files");
      expect(output).toContain("src/module_0.ts");
      expect(output).toContain("more files");
    });

    it("1.3 shell output compacting: returns text as-is when <= 4000 characters", () => {
      const shortLog = "Compilation completed successfully.\nGenerated 12 assets in 450ms.";
      const output = compactToolResult("shell", shortLog);
      expect(output).toBe(shortLog);
    });

    it("1.4 shell output compacting: compresses output > 4000 chars with head/tail marker", () => {
      const headText = "HEADER_START: Initiating full monorepo build for 19 packages\n";
      const middleText = "BUILD_LOG_STEP_".repeat(500); // large payload > 7500 chars
      const tailText = "\nFOOTER_END: Build failed with 2 errors in packages/adapters";
      const fullLog = headText + middleText + tailText;

      const output = compactToolResult("shell", fullLog);
      expect(output.length).toBeLessThan(fullLog.length);
      expect(output).toContain("HEADER_START");
      expect(output).toContain("FOOTER_END");
      expect(output).toContain("characters truncated");
    });

    it("1.5 github_search_repos compacting: retains core fields (name, desc, stars, url) filtering verbose metadata", () => {
      const verboseRepos = [
        {
          id: 12345,
          node_id: "MDEwOlJlcG9zaXRvcnkxMjM0NQ==",
          name: "rakazo-core",
          full_name: "rakazo/rakazo-core",
          private: false,
          owner: {
            login: "rakazo",
            id: 1,
            avatar_url: "https://example.com/avatar.png",
            site_admin: false,
          },
          html_url: "https://github.com/rakazo/rakazo-core",
          description: "Autonomous multi-agent runtime for enterprise operations",
          fork: false,
          url: "https://api.github.com/repos/rakazo/rakazo-core",
          stargazers_count: 1420,
          watchers_count: 1420,
          language: "TypeScript",
          forks_count: 85,
          open_issues_count: 3,
          license: { key: "apache-2.0", name: "Apache License 2.0" },
        },
      ];
      const output = compactToolResult("github_search_repos", verboseRepos);
      const parsed = JSON.parse(output);
      expect(parsed.total_count).toBe(1);
      expect(parsed.items[0]).toContain("rakazo/rakazo-core");
      expect(parsed.items[0]).toContain("1420⭐");
      expect(parsed.items[0]).toContain("TypeScript");
    });

    it("1.6 github_list_issues compacting: extracts issue metadata (number, title, state, user)", () => {
      const issues = [
        {
          id: 999,
          number: 42,
          title: "Fix circuit breaker reset on user turn",
          state: "open",
          user: { login: "alice" },
          labels: [{ name: "bug" }, { name: "guardrails" }],
          comments: 4,
          body: "Full verbose issue body with 10 paragraphs of logs...",
        },
      ];
      const output = compactToolResult("github_list_issues", issues);
      const parsed = JSON.parse(output);
      expect(parsed[0]).toContain("#42");
      expect(parsed[0]).toContain("[open]");
      expect(parsed[0]).toContain("Fix circuit breaker reset on user turn");
      expect(parsed[0]).toContain("@alice");
    });

    it("1.7 notion_search compacting: filters deep block hierarchy retaining title and url", () => {
      const notionResults = [
        {
          object: "page",
          id: "page-abc-123",
          url: "https://notion.so/workspace/page-abc-123",
          title: "Architecture Decisions Record",
          properties: {
            Name: {
              id: "title",
              type: "title",
              title: [{ plain_text: "Architecture Decisions Record" }],
            },
          },
        },
      ];
      const output = compactToolResult("notion_search", notionResults);
      const parsed = JSON.parse(output);
      expect(parsed[0].id).toBe("page-abc-123");
      expect(parsed[0].title).toBe("Architecture Decisions Record");
      expect(parsed[0].url).toBe("https://notion.so/workspace/page-abc-123");
    });

    it("1.8 cloudflare_list_dns_records compacting: extracts record type, name, content and ttl", () => {
      const dnsRecords = [
        {
          id: "rec_123",
          zone_id: "zone_abc",
          zone_name: "rakazo.io",
          name: "api.rakazo.io",
          type: "A",
          content: "192.0.2.1",
          proxiable: true,
          proxied: true,
          ttl: 1,
          locked: false,
          meta: { auto_added: false, managed_by_apps: false },
          created_on: "2026-01-01T00:00:00.000Z",
          modified_on: "2026-08-01T00:00:00.000Z",
        },
      ];
      const output = compactToolResult("cloudflare_list_dns_records", dnsRecords);
      const parsed = JSON.parse(output);
      expect(parsed[0]).toEqual(["A", "api.rakazo.io", "192.0.2.1", true]);
    });

    it("1.9 fallback JSON compacting: removes nulls and cleans up generic responses", () => {
      const genericPayload = {
        status: "success",
        data: {
          id: 101,
          emptyField: null,
          details: { valid: true, optionalNote: null },
        },
      };
      const output = compactToolResult("custom_tool", genericPayload);
      const parsed = JSON.parse(output);
      expect(parsed.status).toBe("success");
      expect(parsed.data.id).toBe(101);
      expect(parsed.data.emptyField).toBeUndefined();
      expect(parsed.data.details.valid).toBe(true);
    });

    it("1.10 fallback nil/empty handling: returns 'ok' for null or undefined outputs", () => {
      expect(compactToolResult("any_tool", null)).toBe("ok");
      expect(compactToolResult("any_tool", undefined)).toBe("ok");
    });
  });

  // ==========================================================================
  // TIER 2: BOUNDARY & CORNER CASES (≥ 5 tests per feature)
  // ==========================================================================
  describe("Tier 2: Boundary & Corner Cases", () => {
    it("2.1 list_files boundary: EXACTLY 40 entries is NOT compressed", () => {
      const files = Array.from({ length: 40 }, (_, i) => `file_${i}.ts`);
      const output = compactToolResult("list_files", files);
      expect(output).not.toContain("more files");
      expect(output).toContain("file_39.ts");
    });

    it("2.2 list_files boundary: EXACTLY 41 entries triggers compression", () => {
      const files = Array.from({ length: 41 }, (_, i) => `file_${i}.ts`);
      const output = compactToolResult("list_files", files);
      expect(output).toContain("41 files");
      expect(output).toContain("more files");
    });

    it("2.3 shell output boundary: EXACTLY 4000 characters is NOT truncated", () => {
      const exact4000 = "x".repeat(4000);
      const output = compactToolResult("shell", exact4000);
      expect(output.length).toBe(4000);
      expect(output).not.toContain("truncated");
    });

    it("2.4 shell output boundary: EXACTLY 4001 characters triggers truncation marker", () => {
      const exact4001 = "x".repeat(4001);
      const output = compactToolResult("shell", exact4001);
      expect(output).toContain("characters truncated");
      expect(output).toContain("1 characters truncated");
    });

    it("2.5 Empty collections: empty array [] and empty object {} return clean representation", () => {
      expect(compactToolResult("list_files", [])).toBe("[]");
      expect(compactToolResult("github_search_repos", [])).toBe("[]");
      expect(compactToolResult("generic_tool", {})).toBe("{}");
    });

    it("2.6 Massive payload boundary: non-specialized payloads > 12000 chars are safely capped", () => {
      const hugeObject = { data: "A".repeat(15000) };
      const output = compactToolResult("unknown_mcp_tool", hugeObject);
      expect(output.length).toBeLessThanOrEqual(12000);
      expect(output).toContain("truncated");
    });

    it("2.7 Special characters & Unicode: preserves emojis, French accents, newlines, tabs", () => {
      const specialText =
        "Résultat d'analyse : Échec à l'étape 3 🚀\n\tDétail: Spécification validée à 100%.";
      const output = compactToolResult("shell", specialText);
      expect(output).toBe(specialText);
    });

    it("2.8 Object wrapper formats: handles { output: string } and { stdout: string } for shell tool", () => {
      const wrappedStdout = { stdout: "hello world from stdout", exitCode: 0 };
      expect(compactToolResult("shell", wrappedStdout)).toBe("hello world from stdout");
    });
  });

  // ==========================================================================
  // TIER 3: CROSS-FEATURE COMBINATIONS
  // ==========================================================================
  describe("Tier 3: Cross-Feature Combinations", () => {
    it("3.1 Compacting + Secret Tokens: shell compression preserves surrounding context while truncating middle", () => {
      const head = "Connecting to upstream with ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ123456\n";
      const hugeMiddle = "DATA_CHUNK_".repeat(600);
      const tail =
        "\nDatabase connection failed for postgres://admin:secretPass@localhost:5432/rakazo";
      const raw = head + hugeMiddle + tail;

      const output = compactToolResult("shell", raw);
      expect(output).toContain("ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ123456");
      expect(output).toContain("postgres://admin:secretPass@localhost:5432/rakazo");
      expect(output).toContain("truncated");
    });

    it("3.2 File list compacting + Special paths: 50 nested paths with sensitive filenames", () => {
      const files = Array.from({ length: 50 }, (_, i) =>
        i === 0
          ? "secrets/.env.production"
          : i === 49
            ? "infra/certs/tls.key"
            : `src/lib/helper_${i}.ts`,
      );
      const output = compactToolResult("list_files", files);
      expect(output).toContain("50 files");
      expect(output).toContain("secrets/.env.production");
      expect(output).toContain("more files");
    });

    it("3.3 Multi-connector batch outputs: compacts heterogeneous results deterministically", () => {
      const ghOutput = compactToolResult("github_search_repos", [
        { full_name: "rakazo/web", stargazers_count: 10 },
      ]);
      const dnsOutput = compactToolResult("cloudflare_list_dns_records", [
        { name: "rakazo.io", type: "A", content: "1.1.1.1", proxied: true },
      ]);

      expect(JSON.parse(ghOutput).items[0]).toContain("rakazo/web");
      expect(JSON.parse(dnsOutput)[0]).toEqual(["A", "rakazo.io", "1.1.1.1", true]);
    });
  });

  // ==========================================================================
  // TIER 4: REAL-WORLD APPLICATION SCENARIOS
  // ==========================================================================
  describe("Tier 4: Real-World Application Workloads", () => {
    it("4.1 Scenario 1: Large Monorepo File Tree (250 files across packages and apps)", () => {
      const monorepoFiles = [
        ...Array.from({ length: 50 }, (_, i) => `packages/adapters/src/adapter_${i}.ts`),
        ...Array.from({ length: 50 }, (_, i) => `packages/contracts/src/contract_${i}.ts`),
        ...Array.from({ length: 50 }, (_, i) => `packages/db/prisma/schema_${i}.prisma`),
        ...Array.from({ length: 50 }, (_, i) => `apps/web/src/pages/page_${i}.tsx`),
        ...Array.from({ length: 50 }, (_, i) => `infra/sandboxes/docker_${i}.dockerfile`),
      ];

      const output = compactToolResult("list_files", monorepoFiles);
      expect(output).toContain("Found 250 files across directories");
      expect(output).toContain("packages/adapters/src/adapter_0.ts");
      expect(output).toContain("more files");
    });

    it("4.2 Scenario 2: TypeScript Compiler Build Failure (20,000 character compiler log)", () => {
      const startLog =
        "turbo run build --filter=@rakazo/adapters\n[tsc] packages/adapters/src/pi-runtime.ts(45,7): error TS2322: Type 'number' is not assignable to type 'string'.\n";
      const noisyMiddle = "Info: Processing module declaration ".repeat(500);
      const endLog =
        "\n[tsc] Found 14 errors in 4 files.\n[turbo] ERROR: command finished with error: exit status 1";
      const fullCompilerOutput = startLog + noisyMiddle + endLog;

      const output = compactToolResult("shell", fullCompilerOutput);
      expect(output).toContain("turbo run build --filter=@rakazo/adapters");
      expect(output).toContain("error TS2322");
      expect(output).toContain("Found 14 errors in 4 files");
      expect(output).toContain("truncated");
      expect(output.length).toBeLessThan(6000);
    });

    it("4.3 Scenario 3: Cloudflare DNS Zone Audit (100 DNS records compacted to essential records)", () => {
      const zoneRecords = Array.from({ length: 100 }, (_, i) => ({
        id: `rec_${i}`,
        type: i % 2 === 0 ? "A" : "CNAME",
        name: `subdomain-${i}.rakazo.io`,
        content: i % 2 === 0 ? `198.51.100.${i}` : "origin.rakazo.io",
        ttl: 300,
        proxied: true,
        zone_id: "zone_xyz",
        meta: { verbose_json_tree: { nested: true } },
      }));

      const output = compactToolResult("cloudflare_list_dns_records", zoneRecords);
      const parsed = JSON.parse(output);
      expect(parsed).toHaveLength(50); // Capped at MAX_CLOUDFLARE_RECORDS = 50
      expect(parsed[0]).toEqual(["A", "subdomain-0.rakazo.io", "198.51.100.0", true]);
    });
  });
});
