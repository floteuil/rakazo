# E2E Test Infra: Rakazo Major Iteration

## Test Philosophy
- **Opaque-box & Requirement-driven**: All test scenarios are derived directly from `ORIGINAL_REQUEST.md` and user-facing requirements, independent of internal module implementation details.
- **Methodology**: Category-Partition + Boundary Value Analysis (BVA) + Pairwise Combinatorial Testing + Real-World Workload Scenarios.
- **Dual Track Coordination**: E2E tests provide an independent validation harness that every implementation milestone must satisfy.

---

## Feature Inventory
| # | Feature | Source (Requirement) | Tier 1 (Coverage ≥5) | Tier 2 (Boundary ≥5) | Tier 3 (Pairwise) |
|---|---------|----------------------|:--------------------:|:--------------------:|:-----------------:|
| 1 | Prompt Compiler Schemas & Contracts | ORIGINAL_REQUEST §R1 | 5 | 5 | ✓ |
| 2 | PromptCompilerService (L1 & L2) | ORIGINAL_REQUEST §R1 | 5 | 5 | ✓ |
| 3 | MCP Immutability Invariant | ORIGINAL_REQUEST §R1 | 5 | 5 | ✓ |
| 4 | 4-Block Prefix Caching System Prompt | ORIGINAL_REQUEST §R2 | 5 | 5 | ✓ |
| 5 | Token & Cache Telemetry Extraction | ORIGINAL_REQUEST §R2 | 5 | 5 | ✓ |
| 6 | Loop Guards & Tool Compacting | ORIGINAL_REQUEST §R2 | 5 | 5 | ✓ |
| 7 | WebUI "Rendre professionnelles" & Modal | ORIGINAL_REQUEST §R3 | 5 | 5 | ✓ |
| 8 | Multi-Device Responsive Ergonomics | ORIGINAL_REQUEST §R3 | 5 | 5 | ✓ |
| 9 | Additive Upstream Isolation & Map | ORIGINAL_REQUEST §R4 | 5 | 5 | ✓ |
| 10 | Security, Zero-Secret & 0 TS Errors | ORIGINAL_REQUEST §R5 | 5 | 5 | ✓ |

---

## Test Architecture
- **Test Runner**: Vitest (`packages/testkit` + package-level vitest configurations).
- **Execution Commands**:
  * Root Full Monorepo: `pnpm test`
  * Typecheck: `pnpm check`
  * E2E Integration Suites: `pnpm --filter @rakazo/contracts test`, `pnpm --filter @rakazo/adapters test`, `pnpm --filter @rakazo/web test`
- **Pass/Fail Semantics**: All tests must complete with exit code 0. Zero failing tests, zero skipped essential tests.

---

## Real-World Application Scenarios (Tier 4)
| # | Scenario | Features Exercised | Complexity |
|---|----------|--------------------|------------|
| 1 | Messy Voice Dictation to Professional Sales Agent | F1, F2, F3, F7, F8 | High |
| 2 | High-Turn Coding Assistant with Massive Tool Calls & Prefix Cache Hits | F4, F5, F6, F10 | High |
| 3 | Mobile Onboarding & Bot Creation on Touch Device (<768px) with Keyboard | F3, F7, F8, F10 | Medium |
| 4 | Temporary Sub-agent Dispatch with Level 1 Deterministic Fast-Path Compilation | F1, F2, F6, F10 | Medium |
| 5 | Upstream Sync Simulation & Zero-Collision Additive Verification | F9, F10 | High |

---

## Coverage Thresholds
- **Tier 1 (Feature Coverage)**: ≥ 5 test cases per feature (5 × 10 = 50 test cases minimum)
- **Tier 2 (Boundary & Corner)**: ≥ 5 test cases per feature (5 × 10 = 50 test cases minimum)
- **Tier 3 (Cross-Feature Combinations)**: ≥ 10 pairwise test cases covering major cross-module interactions
- **Tier 4 (Real-World Application Scenarios)**: ≥ 5 realistic end-to-end user workflows
- **Total Minimum Target**: ≥ 115 test cases across the comprehensive E2E suite
