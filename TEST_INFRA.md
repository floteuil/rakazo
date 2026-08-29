# E2E Test Infra: Free Intelligence Gateway (OmniRoute) for Rakazo

## Test Philosophy
- Opaque-box, requirement-driven testing. Derived strictly from `ORIGINAL_REQUEST.md`.
- Zero-cost verification: Hard assertion that free requests never leak into paid OpenRouter endpoints.
- Fail-closed verification: Assert that upstream errors, rate limits, or non-zero pricing reject with `"Capacité gratuite temporairement indisponible"`.
- Multi-tier progressive testability: Unit -> Adapter -> Subagents -> UI Ergonomics -> Adversarial Chaos.

## Feature Inventory & Test Mapping
| # | Feature | Requirement | Tier 1 (Unit) | Tier 2 (Boundary) | Tier 3 (Cross) | Tier 4 (E2E Scenarios) | Tier 5 (Adversarial) |
|---|---------|-------------|:-------------:|:-----------------:|:--------------:|:----------------------:|:--------------------:|
| 1 | BotInferenceConfig Zod Schema | R1 | 5 | 5 | ✓ | ✓ | ✓ |
| 2 | PromptExecutionLog Telemetry | R1 | 5 | 5 | ✓ | ✓ | ✓ |
| 3 | FreeOmniRouteAdapter Core & SSE | R2 | 5 | 5 | ✓ | ✓ | ✓ |
| 4 | Rakazo Free Policy Engine & Cost Assertion | R2 | 5 | 5 | ✓ | ✓ | ✓ |
| 5 | Fail-Closed Policy Barrier | R2 | 5 | 5 | ✓ | ✓ | ✓ |
| 6 | Subagent Inference Mode & Limit Inheritance | R3 | 5 | 5 | ✓ | ✓ | ✓ |
| 7 | 4-Block Cache Prompt Preservation | R3 | 5 | 5 | ✓ | ✓ | ✓ |
| 8 | WebUI Intelligence & Tags Selector | R4 | 5 | 5 | ✓ | ✓ | ✓ |
| 9 | Mobile Touch & Multi-Screen Breakpoints | R4 | 5 | 5 | ✓ | ✓ | ✓ |
| 10| Containerized Spec & Network Isolation | R5 | 5 | 5 | ✓ | ✓ | ✓ |

## Test Architecture
- **Runner**: Vitest (`pnpm vitest run test/e2e/omniroute-*.test.ts`)
- **Type Checker**: Turbo (`pnpm exec turbo check --force`)
- **Mock Gateway**: Local HTTP server simulating OmniRoute OpenAI-compatible endpoints with SSE chunks, tool calling, latency injection, and pricing simulator.
- **Directory Layout**:
  - `packages/contracts/src/domain.test.ts` (Contracts tests)
  - `packages/db/src/telemetry.test.ts` (Telemetry tests)
  - `packages/adapters/src/omniroute-adapter.test.ts` (Adapter unit & SSE tests)
  - `packages/adapters/src/free-policy-engine.test.ts` (Policy engine tests)
  - `packages/adapters/src/subagent-inheritance.test.ts` (Subagent inheritance tests)
  - `apps/web/src/pages/e2e-omniroute-ui.test.tsx` (UI multi-screen & token ergonomics)
  - `test/e2e/omniroute-adversarial.test.ts` (Tier 5 adversarial & leakage tests)

## Coverage Thresholds
- **Tier 1 (Feature Coverage)**: >= 50 test cases (>= 5 per feature across 10 features).
- **Tier 2 (Boundary & Corner)**: >= 50 test cases (empty tags, >3 tags rejection, 0 token payload, 30s timeout, provider 429/500, non-zero pricing).
- **Tier 3 (Cross-Feature Combinations)**: >= 15 test cases (Free Bot + Subagent + 4-block cache + Telemetry).
- **Tier 4 (Real-World Application Scenarios)**: >= 8 application scenarios (Coding bot, Analysis bot, Writing bot, Multi-step subagent search).
- **Tier 5 (Adversarial Hardening)**: >= 10 adversarial tests (cost injection attacks, token spoofing, network partition, paid fallback attempt veto).
- **Total Tests Target**: Monorepo baseline >= 1,764 passing tests + >= 130 new tests.
