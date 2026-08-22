# E2E Test Infra: Rakazo Token Efficiency & AI Guardrails

## Test Philosophy
- Opaque-box, requirement-driven derived from `ORIGINAL_REQUEST.md`.
- Systematic 4-tier methodology:
  - Tier 1: Feature Coverage (≥5 tests per feature).
  - Tier 2: Boundary & Corner Cases (≥5 tests per feature).
  - Tier 3: Cross-Feature Combinations (pairwise interactions).
  - Tier 4: Real-World Application Workloads (end-to-end multi-step scenarios).
- Validation: Vitest (`pnpm test`) and TypeScript strict checking (`pnpm check`).

## Feature Inventory
| # | Feature | Source (Requirement) | Tier 1 | Tier 2 | Tier 3 |
|---|---------|---------------------|:------:|:------:|:------:|
| 1 | High Output Token Budget (≥ 8k/16k) | ORIGINAL_REQUEST §R1 | 5 | 5 | ✓ |
| 2 | System Prompt Tool Parsimony | ORIGINAL_REQUEST §R1 | 5 | 5 | ✓ |
| 3 | Tool Response Compacting & Synthesis | ORIGINAL_REQUEST §R1 | 5 | 5 | ✓ |
| 4 | Iteration Circuit Breaker (Max 25 steps) | ORIGINAL_REQUEST §R2 | 5 | 5 | ✓ |
| 5 | Redundant Tool Call Detection (3 calls) | ORIGINAL_REQUEST §R2 | 5 | 5 | ✓ |
| 6 | Subagent Depth Safeguard (Max depth 1) | ORIGINAL_REQUEST §R2 | 5 | 5 | ✓ |
| 7 | Secret & Token Sanitization | ORIGINAL_REQUEST §R4 | 5 | 5 | ✓ |
| 8 | Zero-Bloat Physical Storage Cleanup | ORIGINAL_REQUEST §R3 | 5 | 5 | ✓ |
| 9 | Database Cascades & Zero Orphans | ORIGINAL_REQUEST §R3 | 5 | 5 | ✓ |

## Test Architecture
- Test runner: Vitest 4.1.10 (`pnpm test`).
- Target test directory: `packages/adapters/src/__tests__/` & `tests/e2e/`.
- Test suites:
  - `tool-compacting.test.ts`: Semantic compression verification for file lists, shell logs, GitHub, Notion, and Cloudflare.
  - `loop-guards.test.ts`: Circuit breaker step limiting, redundant call interceptors, and error sanitization.
  - `storage-cleanup.test.ts`: Physical file deletion for team/dedicated bots on `/data`, revisions, desktop sandboxes.
  - `e2e-token-efficiency.test.ts`: End-to-end agent turn execution under heavy payloads.

## Real-World Application Scenarios (Tier 4)
| # | Scenario | Features Exercised | Complexity |
|---|----------|--------------------|------------|
| 1 | Full-File Multi-Module Code Refactoring | F1, F2, F3 | High |
| 2 | Oscillating Failing Command Execution | F4, F5, F7 | Medium |
| 3 | Heavy Directory & Multi-Service Exploration | F2, F3, F4 | High |
| 4 | Multi-Agent Parallel Task with Subagent | F1, F6, F7 | High |
| 5 | Bot Provisioning, Heavy Storage Creation & Full Deletion | F8, F9 | High |

## Coverage Thresholds
- Tier 1: ≥ 45 test cases
- Tier 2: ≥ 45 test cases
- Tier 3: Pairwise coverage across major feature pairs
- Tier 4: ≥ 5 realistic application scenarios
