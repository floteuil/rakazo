# E2E Test Infra: Rakazo Excellence Iteration

## Test Philosophy
- Requirement-driven, opaque-box and contract-driven testing.
- Comprehensive verification across 5 Tiers:
  - Tier 1: Feature Coverage (PromptCompilerService, Subagents, 4-Block Cache, Telemetry, MCP, Responsive WebUI, Upstream Sync).
  - Tier 2: Boundary & Corner Cases (Timeout limits, token budget limits, depth nesting rejection, empty/max string lengths, malformed responses).
  - Tier 3: Cross-Feature Combinations (PromptCompiler + Subagents + Telemetry, MCP immutability during compilation, Error sanitization across WebUI & API).
  - Tier 4: Real-World Scenarios (Full bot creation journey with prompt compilation, execution with telemetry, mobile viewport interaction, upstream sync simulation).
  - Tier 5: Adversarial Coverage Hardening (Prompt injection attempts, secret exfiltration attacks, loop guard stress tests).

## Feature Inventory & Test Mapping
| # | Feature | Requirement | Tier 1 | Tier 2 | Tier 3 | Tier 4 | Tier 5 |
|---|---------|-------------|:------:|:------:|:------:|:------:|:------:|
| 1 | PromptCompilerService Robustness | R1 | ✓ | ✓ | ✓ | ✓ | ✓ |
| 2 | Subagent Anti-Loop & Depth 1 Guards | R1 | ✓ | ✓ | ✓ | ✓ | ✓ |
| 3 | 4-Block Cache Byte Stability | R1 | ✓ | ✓ | ✓ | ✓ | ✓ |
| 4 | Upstream Sync Workflow Idempotence | R2 | ✓ | ✓ | ✓ | ✓ | ✓ |
| 5 | SQL Telemetry Async & DB Resilience | R3 | ✓ | ✓ | ✓ | ✓ | ✓ |
| 6 | Secret Sanitization Without False Positives | R3 | ✓ | ✓ | ✓ | ✓ | ✓ |
| 7 | MCP Least Privilege & Immutability | R3 | ✓ | ✓ | ✓ | ✓ | ✓ |
| 8 | Responsive WebUI Ergonomics (320px..1440px+) | R4 | ✓ | ✓ | ✓ | ✓ | ✓ |
| 9 | PromptCompilerModal Comparative UX | R4 | ✓ | ✓ | ✓ | ✓ | ✓ |
| 10 | Monorepo TypeScript Zero Error Gate | R5 | ✓ | ✓ | ✓ | ✓ | ✓ |
| 11 | Complete Monorepo Test Pass (>= 1709 tests) | R5 | ✓ | ✓ | ✓ | ✓ | ✓ |
| 12 | Master Authority Documentation Deliverables | R5 | ✓ | ✓ | ✓ | ✓ | ✓ |

## Test Runners & Commands
- Monorepo Type Check: `pnpm exec turbo check --force` (19 packages)
- Monorepo Test Suite: `pnpm test` (1,709 tests)
- Specific Test Suites:
  - `pnpm exec vitest run packages/adapters/src/prompt-compiler.test.ts`
  - `pnpm exec vitest run packages/adapters/src/prompt-compiler.challenger.test.ts`
  - `pnpm exec vitest run packages/adapters/src/__tests__/subagent-prompt-compilation.test.ts`
  - `pnpm exec vitest run packages/adapters/src/prefix-caching.e2e.test.ts`
  - `pnpm exec vitest run packages/db/src/telemetry.test.ts`
  - `pnpm exec vitest run packages/testkit/src/tests/r1-subagent-compilation.e2e.test.ts`
  - `pnpm exec vitest run packages/testkit/src/tests/r3-sql-telemetry.e2e.test.ts`
  - `pnpm exec vitest run packages/adapters/src/security-mcp-adversarial.test.ts`
  - `pnpm exec vitest run packages/adapters/src/loop-guards.test.ts`
  - `pnpm exec vitest run packages/chat-ui/src/__tests__/responsive-composer.test.tsx`
