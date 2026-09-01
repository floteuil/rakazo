# E2E Test Infra: RAKAZO — Itération d'Excellence Production

## Test Philosophy
- Opaque-box, requirement-driven empirical validation.
- Methodology: Category-Partition + Boundary Value Analysis + Pairwise Combinatorial + Real-World Workload + White-box Adversarial Coverage Hardening.

## Feature Inventory & Test Coverage
| # | Feature | Source | Tier 1 (Feature) | Tier 2 (Boundary) | Tier 3 (Pairwise) | Tier 4 (Real-World) | Tier 5 (Adversarial) |
|---|---------|--------|:----------------:|:-----------------:|:-----------------:|:-------------------:|:--------------------:|
| F1 | Forensic Baseline Audit | ORIGINAL_REQUEST §R1 | 5 | 5 | ✓ | ✓ | ✓ |
| F2 | InferenceTransport Decoupling | ORIGINAL_REQUEST §R2 | 5 | 5 | ✓ | ✓ | ✓ |
| F3 | 3-Level Dynamic Decoupling | ORIGINAL_REQUEST §R2 | 5 | 5 | ✓ | ✓ | ✓ |
| F4 | Zero Static Models/Enums | ORIGINAL_REQUEST §R2 | 5 | 5 | ✓ | ✓ | ✓ |
| F5 | Response Header Propagation | ORIGINAL_REQUEST §R3 | 5 | 5 | ✓ | ✓ | ✓ |
| F6 | Non-blocking SQL Telemetry | ORIGINAL_REQUEST §R3 | 5 | 5 | ✓ | ✓ | ✓ |
| F7 | Strict Cache Hit Ratio & FNV-1a | ORIGINAL_REQUEST §R3 | 5 | 5 | ✓ | ✓ | ✓ |
| F8 | OpenRouter Premium Sanctuarization | ORIGINAL_REQUEST §R4 | 5 | 5 | ✓ | ✓ | ✓ |
| F9 | Sovereign MCP Tool Loop | ORIGINAL_REQUEST §R4 | 5 | 5 | ✓ | ✓ | ✓ |
| F10 | Free Sub-Agent Strict Confinement | ORIGINAL_REQUEST §R4 | 5 | 5 | ✓ | ✓ | ✓ |
| F11 | WebUI Intent vs Turn Resolution | ORIGINAL_REQUEST §R5 | 5 | 5 | ✓ | ✓ | ✓ |
| F12 | Security & Zero-Cost Fail-Closed | ORIGINAL_REQUEST §R5 | 5 | 5 | ✓ | ✓ | ✓ |
| F13 | VPS Coolify Non-Interference | ORIGINAL_REQUEST §R5 | 5 | 5 | ✓ | ✓ | ✓ |
| F14 | Master Documentation & Passation | ORIGINAL_REQUEST §R6 | 5 | 5 | ✓ | ✓ | ✓ |

## Test Architecture
- Test Runner: `vitest` v4.1.10 (`vitest.config.ts`)
- Execution command: `pnpm test` (full monorepo) or `npx vitest run packages/testkit/src/tests/*.test.ts`
- Test Suites Layout (`packages/testkit/src/tests/`):
  1. `tier1-features-r1-r6.e2e.test.ts`: Tier 1 Feature Coverage (>=5 tests per feature)
  2. `tier2-boundary-r1-r6.e2e.test.ts`: Tier 2 Boundary & Corner Cases
  3. `tier3-pairwise-r1-r6.e2e.test.ts`: Tier 3 Cross-Feature Pairwise Combinations
  4. `tier4-real-world-scenarios.e2e.test.ts`: Tier 4 Real-World Application Workloads
  5. `tier5-adversarial-stress.e2e.test.ts`: Tier 5 Adversarial Stress & Chaos Testing
  6. `r1-subagent-compilation.e2e.test.ts`: Sub-Agent Confinement & Compilation Suite
  7. `challenger-2-empirical-adversarial.test.ts`: Empirical Adversarial Oracle Verification
