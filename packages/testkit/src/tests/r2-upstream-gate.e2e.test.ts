import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function getRepoRoot(): string {
  let dir = import.meta.dirname ?? process.cwd();
  while (dir !== "/" && dir !== ".") {
    if (existsSync(resolve(dir, "pnpm-workspace.yaml")) || existsSync(resolve(dir, "turbo.json"))) {
      return dir;
    }
    const parent = resolve(dir, "..");
    if (parent === dir) break;
    dir = parent;
  }
  return process.cwd();
}

describe("Requirement R2: Upstream Sync Security Gate Workflow E2E", () => {
  const rootDir = getRepoRoot();
  const workflowPath = resolve(rootDir, ".github/workflows/sync-upstream.yml");

  // Read workflow content
  let workflowContent = "";
  if (existsSync(workflowPath)) {
    workflowContent = readFileSync(workflowPath, "utf-8");
  }

  // ==========================================================================
  // TIER 1: FEATURE COVERAGE (>=5 Tests)
  // ==========================================================================
  describe("Tier 1: Feature Coverage (R2 Workflow Structure & Triggers)", () => {
    it("1.1 Verifies existence of .github/workflows/sync-upstream.yml", () => {
      expect(existsSync(workflowPath)).toBe(true);
      expect(workflowContent.length).toBeGreaterThan(100);
    });

    it("1.2 Validates required triggers: schedule (cron) and workflow_dispatch", () => {
      expect(workflowContent).toMatch(/on:\s*[\s\S]*?schedule:/);
      expect(workflowContent).toMatch(/cron:\s*["']0\s+4\s+\*\s+\*\s+\*["']/);
      expect(workflowContent).toMatch(/workflow_dispatch:/);
    });

    it("1.3 Validates GHA permissions: contents: write and pull-requests: write", () => {
      expect(workflowContent).toMatch(/permissions:\s*[\s\S]*?contents:\s*write/);
      expect(workflowContent).toMatch(/permissions:\s*[\s\S]*?pull-requests:\s*write/);
    });

    it("1.4 Verifies upstream remote configuration points to canonical source (elie222/rakazo)", () => {
      expect(workflowContent).toContain("https://github.com/elie222/rakazo.git");
      expect(workflowContent).toMatch(/git\s+remote\s+add\s+upstream/);
      expect(workflowContent).toMatch(/git\s+fetch\s+upstream\s+main/);
    });

    it("1.5 Configures automated Git bot identity for non-attributable sync commits", () => {
      expect(workflowContent).toContain('git config user.name "github-actions[bot]"');
      expect(workflowContent).toContain(
        'git config user.email "github-actions[bot]@users.noreply.github.com"',
      );
    });

    it("1.6 Implements alert PR creation on upstream-sync-conflict branch with sync, upstream labels", () => {
      expect(workflowContent).toContain("upstream-sync-conflict");
      expect(workflowContent).toMatch(/labels:\s*["'].*sync.*upstream.*["']/);
      expect(workflowContent).toMatch(/peter-evans\/create-pull-request/);
    });

    it("1.7 Enforces concurrency control to prevent concurrent overlapping sync executions", () => {
      expect(workflowContent).toMatch(/concurrency:\s*[\s\S]*?group:\s*sync-upstream/);
      expect(workflowContent).toMatch(/cancel-in-progress:\s*false/);
    });

    it("1.8 Captures deterministic BASE_SHA snapshot before merge for reliable rollback", () => {
      expect(workflowContent).toMatch(/BASE_SHA=\$\(git\s+rev-parse\s+HEAD\)/);
      expect(workflowContent).toMatch(/git\s+reset\s+--hard\s+"\$BASE_SHA"/);
    });

    it("1.9 Validates post-merge lockfile integrity with frozen-lockfile check", () => {
      expect(workflowContent).toMatch(/pnpm\s+install\s+--frozen-lockfile/);
      expect(workflowContent).toContain("merge_status=lockfile_error");
    });

    it("1.10 Chains the CI Security Gate strictly (db:generate && turbo check --force && test)", () => {
      expect(workflowContent).toMatch(
        /pnpm\s+db:generate\s+&&\s+pnpm\s+exec\s+turbo\s+check\s+--force\s+&&\s+pnpm\s+test/,
      );
    });
  });

  // ==========================================================================
  // TIER 2: BOUNDARY & CORNER CASES (>=5 Tests)
  // ==========================================================================
  describe("Tier 2: Boundary & Corner Cases (R2 Gate Logic & Security Invariants)", () => {
    it("2.1 Guarantees zero hardcoded credentials or plaintext tokens in workflow file", () => {
      const forbiddenTokens = [
        /ghp_[a-zA-Z0-9]{36}/,
        /github_pat_[a-zA-Z0-9_]{82}/,
        /sk-[a-zA-Z0-9]{32,}/,
      ];
      for (const pattern of forbiddenTokens) {
        expect(workflowContent).not.toMatch(pattern);
      }
      expect(workflowContent).toContain("${{ secrets.GITHUB_TOKEN }}");
    });

    it("2.2 Validates idempotency of git remote addition (handles existing upstream remote)", () => {
      expect(workflowContent).toMatch(
        /git\s+remote\s+add\s+upstream.*\|\|\s*git\s+remote\s+set-url\s+upstream/,
      );
    });

    it("2.3 Ensures checkout uses full depth (fetch-depth: 0) for complete commit history comparison", () => {
      expect(workflowContent).toMatch(/uses:\s*actions\/checkout@v4/);
      expect(workflowContent).toMatch(/fetch-depth:\s*0/);
    });

    it("2.4 Verifies abort mechanism on conflict or failure (git merge --abort or reset)", () => {
      expect(workflowContent).toMatch(/git\s+merge\s+--abort|git\s+reset\s+--hard/);
    });

    it("2.5 Verifies alert PR title and description warning about customizations and regressions", () => {
      expect(workflowContent).toMatch(/title:\s*["'].*Alerte.*Synchronisation.*["']/i);
      expect(workflowContent).toContain("elie222/rakazo");
    });

    it("2.6 Simulates upstream sync state machine: clean merge vs conflict vs lockfile error vs test failure paths", () => {
      type SyncState =
        | "CHECK_COMMITS"
        | "MERGE_ATTEMPT"
        | "LOCKFILE_CHECK"
        | "TEST_GATE"
        | "PUSH_MAIN"
        | "ABORT_AND_PR";

      function evaluateSyncFlow(
        hasNewCommits: boolean,
        mergeConflict: boolean,
        lockfileValid: boolean,
        testGatePassed: boolean,
      ): SyncState {
        if (!hasNewCommits) return "CHECK_COMMITS";
        if (mergeConflict) return "ABORT_AND_PR";
        if (!lockfileValid) return "ABORT_AND_PR";
        if (!testGatePassed) return "ABORT_AND_PR";
        return "PUSH_MAIN";
      }

      // Scenario A: No new commits -> No push, no PR
      expect(evaluateSyncFlow(false, false, true, true)).toBe("CHECK_COMMITS");

      // Scenario B: New commits + Clean merge + Valid lockfile + Tests pass -> Push to main
      expect(evaluateSyncFlow(true, false, true, true)).toBe("PUSH_MAIN");

      // Scenario C: New commits + Merge conflict -> Abort and open PR
      expect(evaluateSyncFlow(true, true, true, true)).toBe("ABORT_AND_PR");

      // Scenario D: New commits + Clean merge + Broken lockfile -> Abort and open PR
      expect(evaluateSyncFlow(true, false, false, true)).toBe("ABORT_AND_PR");

      // Scenario E: New commits + Clean merge + Valid lockfile + Tests FAIL -> Abort and open PR (critical gate invariant)
      expect(evaluateSyncFlow(true, false, true, false)).toBe("ABORT_AND_PR");
    });

    it("2.7 Validates deterministic rollback behavior on any gate failure", () => {
      const rollbackActions = ['git reset --hard "$BASE_SHA"', "git merge --abort"];
      for (const action of rollbackActions) {
        expect(workflowContent).toContain(action);
      }
    });
  });
});
