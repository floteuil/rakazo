# E2E Test Infra: RAKAZO OmniRoute Final Integration

## Test Philosophy
- Requirement-driven, opaque-box testing derived directly from `ORIGINAL_REQUEST.md`.
- No reliance on internal implementation shortcuts; tests execute the software end-to-end via public APIs, adapters, and domain interfaces.
- Methodology: Category-Partition + Boundary Value Analysis (BVA) + Pairwise Combinatorial Testing + Real-World Workloads + Adversarial Stress Testing.

## Feature Inventory & Test Coverage Mapping
| # | Feature | Requirement | Tier 1 (Feature) | Tier 2 (Boundary) | Tier 3 (Pairwise) | Tier 4 (Real-World) |
|---|---------|-------------|:----------------:|:-----------------:|:-----------------:|:-------------------:|
| 1 | Pluggable InferenceTransport Interface | R1 | 5 | 5 | ✓ | ✓ |
| 2 | Canonical MCP Tool Loop | R1 | 5 | 5 | ✓ | ✓ |
| 3 | Semantic Tool Compaction & AbortSignal | R1 | 5 | 5 | ✓ | ✓ |
| 4 | OmniRoute Live Combos | R2 | 5 | 5 | ✓ | ✓ |
| 5 | Deterministic Cognitive Priority Routing | R2 | 5 | 5 | ✓ | ✓ |
| 6 | Free Policy Engine Veto & Provider Rules | R2 | 5 | 5 | ✓ | ✓ |
| 7 | Strict Subagent Free Mode Inheritance | R3 | 5 | 5 | ✓ | ✓ |
| 8 | Subagent Resource & Concurrency Confinement | R3 | 5 | 5 | ✓ | ✓ |
| 9 | 4-Block KV Prefix Caching Assembly | R4 | 5 | 5 | ✓ | ✓ |
| 10 | FNV-1a Session Affinity Header Injection | R4 | 5 | 5 | ✓ | ✓ |
| 11 | Double Fail-Closed Zero-Cost Barrier | R5 | 5 | 5 | ✓ | ✓ |
| 12 | SQL Telemetry & PromptExecutionLog | R5 | 5 | 5 | ✓ | ✓ |
| 13 | Secrets Hygiene & Token Redaction | R5 | 5 | 5 | ✓ | ✓ |
| 14 | Multi-Screen UI & Touch Ergonomics | R6 | 5 | 5 | ✓ | ✓ |
| 15 | VPS Non-Interference & Master Documentation | R6 | 5 | 5 | ✓ | ✓ |

## Test Architecture
- Test Framework: Vitest + TypeScript
- Test Runners:
  - Unit/Integration: `pnpm test`
  - E2E Testkit: `pnpm --filter @rakazo/testkit test`
  - Web UI E2E: `pnpm --filter @rakazo/web test`
  - Monorepo Typecheck: `pnpm check`
- Pass/Fail Semantics: 0 TypeScript errors, 100% test assertions pass, exit code 0.

## Real-World Application Scenarios (Tier 4)
| # | Scenario | Features Exercised | Complexity |
|---|----------|--------------------|------------|
| 1 | Free Multi-Step Coding Agent with MCP Tools | F1, F2, F3, F4, F5, F10, F11, F12 | High |
| 2 | Free Subagent Task Delegation & Confinement | F2, F3, F7, F8, F11, F12 | High |
| 3 | Multi-Tag Collision & Deterministic Routing Resolution | F4, F5, F6, F9, F10, F12 | Medium |
| 4 | Rapid Multi-Turn KV Prefix Cache Session | F9, F10, F12, F14 | Medium |
| 5 | Commercial Fallback Attempt with Fail-Closed Block | F6, F11, F12, F13 | High |
| 6 | Premium Bot Non-Regression (Direct OpenRouter) | F1, F2, F3, F11, F12 | High |

## Coverage Thresholds
- Tier 1: ≥ 5 per feature (≥ 75 test cases)
- Tier 2: ≥ 5 per feature (≥ 75 test cases)
- Tier 3: Pairwise coverage across major feature combinations (≥ 15 test cases)
- Tier 4: Realistic end-to-end workload scenarios (≥ 8 test cases)
- Tier 5: White-box adversarial edge cases & concurrency stress testing (≥ 10 test cases)
- **Total Target**: ≥ 183 comprehensive test cases across all tiers.
