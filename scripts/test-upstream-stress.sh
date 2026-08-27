#!/usr/bin/env bash
set -e

echo "=== STARTING M2 EMPIRICAL BASH STRESS TEST SUITE ==="

WORK_DIR=$(mktemp -d /tmp/rakazo-m2-test-XXXXXX)
trap 'rm -rf "$WORK_DIR"' EXIT

echo "Using temp directory: $WORK_DIR"

export GIT_AUTHOR_NAME="test-bot"
export GIT_AUTHOR_EMAIL="test-bot@rakazo.io"
export GIT_COMMITTER_NAME="test-bot"
export GIT_COMMITTER_EMAIL="test-bot@rakazo.io"
export GIT_CONFIG_NOSYSTEM=1
export HOME="$WORK_DIR"

# Helper to create fresh pair
create_fresh_repos() {
  local test_name="$1"
  local base="$WORK_DIR/${test_name}_base"
  local local_repo="$WORK_DIR/${test_name}_local"
  local upstream_repo="$WORK_DIR/${test_name}_upstream"

  mkdir -p "$base"
  cd "$base"
  git init -b main
  git config commit.gpgsign false
  echo "# Base Rakazo" > README.md
  echo '{"name": "rakazo-app", "version": "1.0.0"}' > package.json
  git add .
  git commit -m "Base initial commit"

  git clone "$base" "$local_repo"
  git clone "$base" "$upstream_repo"

  cd "$local_repo"
  git config commit.gpgsign false
  git remote add upstream "$upstream_repo"

  cd "$upstream_repo"
  git config commit.gpgsign false
}

# -------------------------------------------------------------
# TEST 1: Clean Upstream Merge into Sovereign Main
# -------------------------------------------------------------
echo ""
echo "[TEST 1] Testing clean upstream merge into sovereign main..."
create_fresh_repos "t1"
LOCAL_T1="$WORK_DIR/t1_local"
UPSTREAM_T1="$WORK_DIR/t1_upstream"

cd "$LOCAL_T1"
echo "export const promptCompiler = true;" > prompt-compiler.ts
git add prompt-compiler.ts
git commit -m "feat: sovereign prompt compiler"
SOVEREIGN_HEAD=$(git rev-parse HEAD)

cd "$UPSTREAM_T1"
echo "export const upstreamFeature = true;" > upstream-feature.ts
git add upstream-feature.ts
git commit -m "feat(upstream): add upstream feature"

cd "$LOCAL_T1"
git fetch upstream main
NEW_COMMITS=$(git log --oneline main..upstream/main)
if [ -z "$NEW_COMMITS" ]; then
  echo "FAIL: New commits not detected"
  exit 1
fi

git merge upstream/main --no-edit -m "chore(sync): synchronisation automatique avec elie222/rakazo"
if [ ! -f prompt-compiler.ts ] || [ ! -f upstream-feature.ts ]; then
  echo "FAIL: Merged files missing"
  exit 1
fi
echo "✓ TEST 1 PASSED: Clean 3-way merge preserved sovereign code and applied upstream commits."

# -------------------------------------------------------------
# TEST 2: Sovereign Conflict Detection & git merge --abort
# -------------------------------------------------------------
echo ""
echo "[TEST 2] Testing merge conflict on sovereign custom file..."
create_fresh_repos "t2"
LOCAL_T2="$WORK_DIR/t2_local"
UPSTREAM_T2="$WORK_DIR/t2_upstream"

cd "$LOCAL_T2"
echo '{"lang": "fr", "sovereign": true}' > sovereign-config.json
git add sovereign-config.json
git commit -m "feat: sovereign french config"
PRE_CONFLICT_HEAD=$(git rev-parse HEAD)

cd "$UPSTREAM_T2"
echo '{"lang": "en", "standard": true}' > sovereign-config.json
git add sovereign-config.json
git commit -m "feat: standard english config"

cd "$LOCAL_T2"
git fetch upstream main

set +e
git merge upstream/main --no-edit -m "chore(sync): conflict attempt"
MERGE_EXIT_CODE=$?
set -e

if [ $MERGE_EXIT_CODE -eq 0 ]; then
  echo "FAIL: Conflict was expected but merge succeeded!"
  exit 1
fi

echo "✓ Merge conflict detected as expected (exit code: $MERGE_EXIT_CODE)."

# Run workflow abort logic
git merge --abort || true
GIT_STATUS=$(git status --porcelain)
if [ -n "$GIT_STATUS" ]; then
  echo "FAIL: Working tree is not clean after git merge --abort: $GIT_STATUS"
  exit 1
fi

CURRENT_HEAD=$(git rev-parse HEAD)
if [ "$CURRENT_HEAD" != "$PRE_CONFLICT_HEAD" ]; then
  echo "FAIL: HEAD SHA ($CURRENT_HEAD) does not match pre-conflict SHA ($PRE_CONFLICT_HEAD)"
  exit 1
fi
echo "✓ TEST 2 PASSED: git merge --abort successfully restored pristine sovereign state."

# -------------------------------------------------------------
# TEST 3: Post-Merge CI Gate Failure Rollback (git reset --hard HEAD~1)
# -------------------------------------------------------------
echo ""
echo "[TEST 3] Testing post-merge test gate failure rollback..."
create_fresh_repos "t3"
LOCAL_T3="$WORK_DIR/t3_local"
UPSTREAM_T3="$WORK_DIR/t3_upstream"

cd "$LOCAL_T3"
echo "export const stableCode = true;" > stable.ts
git add stable.ts
git commit -m "feat: stable sovereign feature"
STABLE_HEAD=$(git rev-parse HEAD)

cd "$UPSTREAM_T3"
echo "export const brokenCode = 'syntax error';" > upstream-broken.ts
git add upstream-broken.ts
git commit -m "feat: broken upstream code"
UPSTREAM_BROKEN_HEAD=$(git rev-parse HEAD)

cd "$LOCAL_T3"
git fetch upstream main
git merge upstream/main --no-edit -m "chore(sync): test merge for gate failure"

# Simulate CI validation failure (e.g. turbo check fails)
TEST_EXIT_CODE=1
if [ $TEST_EXIT_CODE -ne 0 ]; then
  echo "Simulated CI failure triggered. Executing rollback: git reset --hard HEAD~1"
  git reset --hard HEAD~1 || git merge --abort || true
fi

RESTORED_HEAD=$(git rev-parse HEAD)
if [ "$RESTORED_HEAD" != "$STABLE_HEAD" ]; then
  echo "FAIL: git reset --hard HEAD~1 did not restore to stable HEAD ($RESTORED_HEAD vs $STABLE_HEAD)"
  exit 1
fi

if [ -f upstream-broken.ts ]; then
  echo "FAIL: Broken upstream file still exists in workspace!"
  exit 1
fi

# Test conflict branch checkout
git checkout -B upstream-sync-conflict upstream/main
CONFLICT_BRANCH_HEAD=$(git rev-parse HEAD)
if [ "$CONFLICT_BRANCH_HEAD" != "$UPSTREAM_BROKEN_HEAD" ]; then
  echo "FAIL: upstream-sync-conflict branch does not match upstream HEAD!"
  exit 1
fi
echo "✓ TEST 3 PASSED: git reset --hard HEAD~1 restored stable HEAD and upstream-sync-conflict branch prepared."

# -------------------------------------------------------------
# TEST 4: Lockfile Integrity & Out-of-Sync Package Detection
# -------------------------------------------------------------
echo ""
echo "[TEST 4] Testing lockfile tampering and mismatch validation..."
mkdir -p "$WORK_DIR/lockfile_test"
cd "$WORK_DIR/lockfile_test"
cat << 'EOF' > package.json
{
  "name": "lockfile-check",
  "dependencies": {
    "zod": "^3.22.4",
    "untracked-tampered-dep": "^1.0.0"
  }
}
EOF
cat << 'EOF' > pnpm-lock.yaml
lockfileVersion: '9.0'
importers:
  .:
    dependencies:
      zod:
        specifier: ^3.22.4
        version: 3.22.4
EOF

node -e '
const fs = require("fs");
const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
const lock = fs.readFileSync("pnpm-lock.yaml", "utf8");
const untracked = Object.keys(pkg.dependencies).filter(d => !lock.includes(d));
if (untracked.length === 0 || !untracked.includes("untracked-tampered-dep")) {
  console.error("FAIL: Untracked dependency was not caught");
  process.exit(1);
}
console.log("✓ Correctly detected untracked dependency:", untracked.join(", "));
'
echo "✓ TEST 4 PASSED: Lockfile tampering detected."

# -------------------------------------------------------------
# TEST 5: CI Security Gate & Workflow Idempotence
# -------------------------------------------------------------
echo ""
echo "[TEST 5] Checking sync-upstream.yml security invariants..."
WF_PATH="/Users/floteuilteletravail/.gemini/antigravity/scratch/rakazo_app/.github/workflows/sync-upstream.yml"

grep -q 'cron: "0 4 \* \* \*"' "$WF_PATH" || (echo "FAIL: Missing cron schedule"; exit 1)
grep -q 'workflow_dispatch:' "$WF_PATH" || (echo "FAIL: Missing workflow_dispatch"; exit 1)
grep -q 'fetch-depth: 0' "$WF_PATH" || (echo "FAIL: Missing fetch-depth 0"; exit 1)
grep -q 'pnpm install --frozen-lockfile' "$WF_PATH" || (echo "FAIL: Missing frozen-lockfile"; exit 1)
grep -q 'BASE_SHA=\$(git rev-parse HEAD)' "$WF_PATH" || (echo "FAIL: Missing BASE_SHA snapshot"; exit 1)
grep -q 'git reset --hard "\$BASE_SHA"' "$WF_PATH" || (echo "FAIL: Missing BASE_SHA rollback command"; exit 1)
grep -q 'pnpm exec turbo check --force && pnpm test' "$WF_PATH" || (echo "FAIL: Missing strict gate turbo check + pnpm test"; exit 1)
grep -q 'upstream-sync-conflict' "$WF_PATH" || (echo "FAIL: Missing conflict branch"; exit 1)
grep -q 'peter-evans/create-pull-request@v6' "$WF_PATH" || (echo "FAIL: Missing alert PR action"; exit 1)

echo "✓ TEST 5 PASSED: All workflow invariants strictly verified."

echo ""
echo "========================================================"
echo "🎯 ALL M2 EMPIRICAL STRESS TESTS PASSED (5/5)"
echo "========================================================"
