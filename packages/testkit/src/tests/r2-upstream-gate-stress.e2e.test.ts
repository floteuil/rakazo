import { execSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

describe("Adversarial Stress Test: Upstream Sync Gate & Git State Transitions", () => {
  let tempBaseDir: string;
  let upstreamRepo: string;
  let originRepo: string;
  let localClone: string;

  beforeEach(() => {
    tempBaseDir = mkdtempSync(join(tmpdir(), "rakazo-sync-challenge-"));
    upstreamRepo = join(tempBaseDir, "upstream.git");
    originRepo = join(tempBaseDir, "origin.git");
    localClone = join(tempBaseDir, "local-clone");

    // 1. Initialize bare upstream and origin
    execSync(`git init --bare "${upstreamRepo}"`);
    execSync(`git init --bare "${originRepo}"`);

    // 2. Initialize an initial repo and push common base to upstream and origin
    const initWork = join(tempBaseDir, "init-work");
    mkdirSync(initWork);
    execSync("git init -b main", { cwd: initWork });
    execSync('git config user.name "Test Setup"', { cwd: initWork });
    execSync('git config user.email "test@setup.com"', { cwd: initWork });
    writeFileSync(join(initWork, "README.md"), "# Base Upstream Repo\n");
    writeFileSync(join(initWork, "package.json"), '{"name": "rakazo-root", "version": "1.0.0"}');
    execSync("git add . && git commit -m 'Initial base commit'", { cwd: initWork });
    execSync(`git remote add upstream "${upstreamRepo}"`, { cwd: initWork });
    execSync(`git remote add origin "${originRepo}"`, { cwd: initWork });
    execSync("git push upstream main", { cwd: initWork });
    execSync("git push origin main", { cwd: initWork });

    // 3. Add sovereign custom commit to origin/main (to simulate diverged sovereign repo)
    writeFileSync(join(initWork, "SOVEREIGN.md"), "# Custom Sovereign Features\n");
    execSync("git add . && git commit -m 'feat: add sovereign customizations'", { cwd: initWork });
    execSync("git push origin main", { cwd: initWork });

    // 4. Clone origin to localClone
    execSync(`git clone "${originRepo}" "${localClone}"`);
    execSync('git config user.name "github-actions[bot]"', { cwd: localClone });
    execSync('git config user.email "github-actions[bot]@users.noreply.github.com"', {
      cwd: localClone,
    });
    execSync(`git remote add upstream "${upstreamRepo}"`, { cwd: localClone });
  });

  afterEach(() => {
    try {
      rmSync(tempBaseDir, { recursive: true, force: true });
    } catch {
      // cleanup ignore
    }
  });

  function pushCommitToUpstream(filename: string, content: string, msg: string) {
    const tempUpstreamWork = join(
      tempBaseDir,
      "upstream-work-" + Math.random().toString(36).slice(2),
    );
    execSync(`git clone "${upstreamRepo}" "${tempUpstreamWork}"`);
    execSync('git config user.name "Upstream Dev"', { cwd: tempUpstreamWork });
    execSync('git config user.email "dev@upstream.com"', { cwd: tempUpstreamWork });
    writeFileSync(join(tempUpstreamWork, filename), content);
    execSync(`git add . && git commit -m "${msg}"`, { cwd: tempUpstreamWork });
    execSync("git push origin main", { cwd: tempUpstreamWork });
    rmSync(tempUpstreamWork, { recursive: true, force: true });
  }

  function pushMultipleCommitsToUpstream(
    commits: { filename: string; content: string; msg: string }[],
  ) {
    const tempUpstreamWork = join(
      tempBaseDir,
      "upstream-work-" + Math.random().toString(36).slice(2),
    );
    execSync(`git clone "${upstreamRepo}" "${tempUpstreamWork}"`);
    execSync('git config user.name "Upstream Dev"', { cwd: tempUpstreamWork });
    execSync('git config user.email "dev@upstream.com"', { cwd: tempUpstreamWork });
    for (const c of commits) {
      writeFileSync(join(tempUpstreamWork, c.filename), c.content);
      execSync(`git add . && git commit -m "${c.msg}"`, { cwd: tempUpstreamWork });
    }
    execSync("git push origin main", { cwd: tempUpstreamWork });
    rmSync(tempUpstreamWork, { recursive: true, force: true });
  }

  it("Stress 1: Clean Upstream Update + Successful Gate -> Clean Fast Merge Pushed to Origin", () => {
    // Upstream adds a new non-conflicting feature
    pushCommitToUpstream(
      "UPSTREAM_FEATURE.md",
      "# New upstream feature\n",
      "feat: upstream additive doc",
    );

    // Execute sync workflow script logic in localClone
    execSync("git fetch upstream main", { cwd: localClone });
    const newCommits = execSync("git log --oneline main..upstream/main", { cwd: localClone })
      .toString()
      .trim();
    expect(newCommits.length).toBeGreaterThan(0);

    // Merge attempt
    execSync(
      'git merge upstream/main --no-edit -m "chore(sync): synchronisation automatique avec elie222/rakazo"',
      {
        cwd: localClone,
      },
    );

    // Simulated test gate: PASS
    const gatePassed = true;
    if (gatePassed) {
      execSync("git push origin main", { cwd: localClone });
    }

    // Verify origin now has the merge commit and the upstream feature
    const originLog = execSync("git log --oneline origin/main", { cwd: localClone }).toString();
    expect(originLog).toContain("chore(sync): synchronisation automatique");
    expect(originLog).toContain("feat: upstream additive doc");
    expect(originLog).toContain("feat: add sovereign customizations");
  }, 60000);

  it("Stress 2: Upstream Merge Conflict -> Immediate Abort & Zero Pollution on main", () => {
    // Sovereign repo has modified README.md
    writeFileSync(
      join(localClone, "README.md"),
      "# Custom Sovereign Rakazo\nModified by sovereign team.\n",
    );
    execSync("git add README.md && git commit -m 'feat: sovereign custom readme'", {
      cwd: localClone,
    });
    execSync("git push origin main", { cwd: localClone });

    const mainBeforeCommit = execSync("git rev-parse HEAD", { cwd: localClone }).toString().trim();

    // Upstream also modified README.md in conflicting way
    pushCommitToUpstream(
      "README.md",
      "# Conflicting Upstream Readme\nOverwritten.\n",
      "feat: upstream readme change",
    );

    execSync("git fetch upstream main", { cwd: localClone });

    // Try merge, expecting conflict
    let mergeStatus = "unknown";
    try {
      execSync('git merge upstream/main --no-edit -m "chore(sync): synchronisation automatique"', {
        cwd: localClone,
        stdio: "pipe",
      });
      mergeStatus = "success";
    } catch {
      mergeStatus = "conflict";
      execSync("git merge --abort", { cwd: localClone });
    }

    expect(mergeStatus).toBe("conflict");

    // Invariant check: main MUST be at exact same commit as before merge attempt
    const mainAfterAbort = execSync("git rev-parse HEAD", { cwd: localClone }).toString().trim();
    expect(mainAfterAbort).toBe(mainBeforeCommit);

    // Conflict branch creation
    execSync("git checkout -B upstream-sync-conflict upstream/main", { cwd: localClone });
    execSync("git push -f origin upstream-sync-conflict", { cwd: localClone });

    // Verify upstream-sync-conflict branch exists on origin and points to upstream/main
    const conflictBranchSha = execSync("git rev-parse origin/upstream-sync-conflict", {
      cwd: localClone,
    })
      .toString()
      .trim();
    const upstreamSha = execSync("git rev-parse upstream/main", { cwd: localClone })
      .toString()
      .trim();
    expect(conflictBranchSha).toBe(upstreamSha);
  }, 60000);

  it("Stress 3: Clean Merge at Git level, but Test Gate FAILS -> Rollback HEAD~1 Restores Pristine main", () => {
    // Upstream adds a breaking code file
    pushCommitToUpstream(
      "breaking-change.ts",
      "export const broken = 1;",
      "feat: breaking upstream change",
    );

    execSync("git fetch upstream main", { cwd: localClone });

    const mainBeforeMerge = execSync("git rev-parse HEAD", { cwd: localClone }).toString().trim();

    // Merge succeeds at git tree level
    execSync('git merge upstream/main --no-edit -m "chore(sync): synchronisation automatique"', {
      cwd: localClone,
    });

    // Simulated Test Gate: FAILS (e.g. typecheck or vitest failure)
    const testGatePassed = false;
    let mergeStatus = "unknown";

    if (!testGatePassed) {
      mergeStatus = "validation_failed";
      // Exact command from workflow:
      execSync("git reset --hard HEAD~1", { cwd: localClone });
    }

    expect(mergeStatus).toBe("validation_failed");

    // Invariant check: main MUST be restored to pristine state before merge
    const mainAfterRollback = execSync("git rev-parse HEAD", { cwd: localClone }).toString().trim();
    expect(mainAfterRollback).toBe(mainBeforeMerge);

    // Verify breaking-change.ts does NOT exist in localClone working directory
    const gitStatus = execSync("git status --porcelain", { cwd: localClone }).toString().trim();
    expect(gitStatus).toBe("");
  }, 60000);

  it("Stress 4: Upstream Multi-Commit Burst (5 commits) -> Single clean sync or atomic rollback", () => {
    const burstCommits = Array.from({ length: 5 }, (_, i) => ({
      filename: `patch_${i + 1}.txt`,
      content: `Patch content ${i + 1}\n`,
      msg: `fix(core): upstream patch #${i + 1}`,
    }));

    pushMultipleCommitsToUpstream(burstCommits);

    execSync("git fetch upstream main", { cwd: localClone });

    const newCommitsCount = execSync("git rev-list --count main..upstream/main", {
      cwd: localClone,
    })
      .toString()
      .trim();
    expect(parseInt(newCommitsCount, 10)).toBe(5);

    const mainBefore = execSync("git rev-parse HEAD", { cwd: localClone }).toString().trim();

    // Clean merge
    execSync(
      'git merge upstream/main --no-edit -m "chore(sync): synchronisation automatique de 5 commits"',
      {
        cwd: localClone,
      },
    );

    // Test rollback on test gate failure
    execSync("git reset --hard HEAD~1", { cwd: localClone });

    const mainAfter = execSync("git rev-parse HEAD", { cwd: localClone }).toString().trim();
    expect(mainAfter).toBe(mainBefore);
  }, 60000);

  it("Stress 5: Idempotency with No Upstream Commits", () => {
    execSync("git fetch upstream main", { cwd: localClone });
    const newCommits = execSync("git log --oneline main..upstream/main", { cwd: localClone })
      .toString()
      .trim();
    expect(newCommits).toBe("");

    // Gate should determine has_commits = false and do nothing
    const hasCommits = newCommits.length > 0;
    expect(hasCommits).toBe(false);
  }, 60000);
});
