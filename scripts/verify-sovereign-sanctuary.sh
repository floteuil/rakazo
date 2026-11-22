#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

echo "================================================================================"
echo "🛡️  RAKAZO SOVEREIGN SANCTUARY & ANTI-RUNAWAY MASTER VERIFICATION SUITE"
echo "================================================================================"

echo ""
echo "1️⃣  [1/6] TypeScript Static Typecheck across all 19 Workspace Packages..."
pnpm turbo check

echo ""
echo "2️⃣  [2/6] Master Sanctuary, Anti-Runaway (7 Layers) & v0.8.0+ Certification..."
pnpm --filter @rakazo/adapters exec vitest run --root ../.. \
  packages/adapters/src/master-sanctuary-and-anti-runaway.test.ts \
  packages/adapters/src/loop-guards.test.ts \
  packages/adapters/src/prefix-caching.e2e.test.ts \
  packages/adapters/src/free-policy-engine.test.ts \
  packages/adapters/src/omniroute-transport.test.ts \
  packages/adapters/src/prompt-compiler.test.ts \
  packages/adapters/src/enterprise-tools.test.ts \
  packages/adapters/src/pi-models.test.ts

echo ""
echo "3️⃣  [3/6] Contracts & Core Domain Verification (Skills, Stuck-Work, Attachments)..."
pnpm --filter @rakazo/contracts test
pnpm --filter @rakazo/core test

echo ""
echo "4️⃣  [4/6] Chat-UI & Mermaid Strict SVG Diagram Verification..."
pnpm --filter @rakazo/chat-ui test

echo ""
echo "5️⃣  [5/6] Web UI Suite (18 MCPs / 87 Tools Invariant, OmniRoute UI, Prompt Compiler, Markdown)..."
pnpm --filter @rakazo/web test

echo ""
echo "6️⃣  [6/6] API & Full Adapters Regression Suite..."
pnpm --filter @rakazo/api test

echo ""
echo "================================================================================"
echo "✅ ALL SOVEREIGN SANCTUARY, ANTI-RUNAWAY & v0.8.0+ CHECKS PASSED WITH 0 ERRORS!"
echo "================================================================================"
