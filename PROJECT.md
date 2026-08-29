# Project: Free Intelligence Gateway (OmniRoute) for Rakazo

## Architecture
Rakazo integrates a strictly free, sovereign inference gateway based on OmniRoute alongside its historical Premium inference path (GPT-OSS-120B via OpenRouter).
- **Core Pattern**: Additive, isolated, and reversible integration.
- **Zero-Cost Double Barrier**: Fail-closed policy engine and adapter level barrier ensuring no free request ever triggers a paid fallback.
- **Data Flow**:
  - Web UI (`apps/web` CreateBotForm & BotSettings) -> RPC `threads.send` -> API (`apps/api`) -> Worker (`apps/worker`) -> Executor (`@rakazo/adapters`) -> `FreeOmniRouteAdapter` / `PiAgentRuntime` -> Telemetry (`@rakazo/db`).
- **Runtime Invariants**:
  - 4-Block Cache: Block A (invariant system prompt), Block B (durable tools & bot instructions), Block C (compacted context), Block D (current turn).
  - Subagents: Max depth 1, 8,192 token ceiling, inherited inference mode, delegation tools excluded, anti-loop guard (< 3 repeated calls, <= 25 steps).

## Code Layout
- `packages/contracts/src/domain.ts`: `InferenceModeSchema`, `InferenceUsageTagSchema`, `BotInferenceConfigSchema`, updated `BotSchema`, `CreateBotInput`, `UpdateBotInput`.
- `packages/db/prisma/schema.prisma` & `packages/db/src/telemetry.ts`: `PromptExecutionLog` model extension & non-blocking logging.
- `packages/db/prisma/migrations/0015_free_intelligence_gateway/migration.sql`: Database schema migration.
- `packages/adapters/src/omniroute-adapter.ts`: `FreeOmniRouteAdapter` implementation.
- `packages/adapters/src/free-policy-engine.ts`: `RakazoFreePolicyEngine` routing and 0.00$ cost assertion.
- `packages/adapters/src/executor.ts` & `packages/adapters/src/pi-runtime.ts`: Adapter selection, subagent inheritance, 4-block cache preservation.
- `apps/web/src/pages/Shell.tsx`: WebUI `CreateBotForm` and `BotSettings` controls.
- `infra/compose/docker-compose.yml` & `infra/compose/docker-compose.prod.yml`: OmniRoute container spec.
- `test/e2e/omniroute-*.test.ts`: E2E test suites (Tiers 1-5).
- Master Documentation: `RAKAZO_MASTER_BLUEPRINT_CURRENT.md`, `RAKAZO_ARCHITECT_HANDOFF_FREE_INTELLIGENCE_GATEWAY.md`, `docs/ENVIRONMENT_SETUP.md`, `AGENTS.md`.

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | BotInferenceConfig Zod Schema | `inferenceMode` ("premium" \| "free", default "premium") and `usageTags` ("coding" \| "writing" \| "reasoning" \| "fast" \| "analysis", max 3) | M1 | Survey R1 |
| 2 | Bot Contract Extensions | Additive extension of `BotSchema`, `CreateBotInput`, `UpdateBotInput` in `@rakazo/contracts` | M1 | Survey R1 |
| 3 | Telemetry Schema Extension | Add `inferenceMode`, `requestedCategory`, `resolvedProvider`, `resolvedModel`, `isFree` to `PromptExecutionLog` model in `@rakazo/db` | M1 | Survey R1 |
| 4 | Migration 0015 | Additive Prisma migration `0015_free_intelligence_gateway` | M1 | Survey R1 |
| 5 | Non-blocking Telemetry Ingestion | Update `recordPromptExecutionLogAsync` in `@rakazo/db` for new telemetry columns | M1 | Survey R1 |
| 6 | FreeOmniRouteAdapter Core | OpenAI-compatible HTTP client, SSE streaming parser, tool calling support, 30s timeout, AbortSignal propagation | M2 | Survey R2 |
| 7 | Rakazo Free Policy Engine | Category tag matching, approved free provider allowlist, strict 0.00$ cost verification | M2 | Survey R2 |
| 8 | Fail-Closed Policy Barrier | Immediate rejection with "Capacité gratuite temporairement indisponible" on cost/provider failure; zero paid fallback | M2 | Survey R2 |
| 9 | Executor Adapter Selection | Dynamically select `FreeOmniRouteAdapter` vs `PiAgentRuntime` based on bot `inferenceMode` | M3 | Survey R3 |
| 10 | Premium Path Sanctuarization | 100% preservation of historical GPT-OSS-120B via OpenRouter path | M3 | Survey R3 |
| 11 | Subagent Inference Mode Inheritance | Subagent inherits parent bot `inferenceMode` ("free" -> "free", "premium" -> "premium") | M3 | Survey R3 |
| 12 | Subagent Guardrails Preservation | 8,192 max tokens, depth 1 limit, delegation tools filtered, loop guards | M3 | Survey R3 |
| 13 | 4-Block Cache Preservation | Byte-stable prompt assembly across Block A, Block B, Block C, Block D | M3 | Survey R3 |
| 14 | WebUI Intelligence Selector | Segmented control (Premium / Free) in `CreateBotForm` and `BotSettings` | M4 | Survey R4 |
| 15 | WebUI Usage Tags Selector | Multi-select pill chips (max 3) with active visual feedback in dark theme | M4 | Survey R4 |
| 16 | Multi-Screen & Touch Ergonomics | Touch targets >= 44px, safe area insets `env(safe-area-inset-bottom)`, responsive 320px-1440px+ across 9 resolutions | M4 | Survey R4 |
| 17 | Containerized OmniRoute Spec | Docker service on private network (`app`, `data`), non-root `10001:10001`, `no-new-privileges`, `cap_drop: [ALL]` | M5 | Survey R5 |
| 18 | Traefik & Secret Isolation | No public Traefik exposure, zero Docker socket mount, isolated `OMNIROUTE_API_KEY` | M5 | Survey R5 |
| 19 | VPS Coolify Non-Interference | Invariant guarantee of zero impact or volume pollution to other Coolify services | M5 | Survey R5 |
| 20 | E2E Test Suite (Tiers 1-4) | Comprehensive test matrix: schemas, policy engine, adapters, subagents, UI | Test Track | Survey R6 |
| 21 | Adversarial Coverage Suite (Tier 5) | Zero-cost leakage tests, rate limit chaos, fail-closed assertions, provider spoofing rejection | Test Track | Survey R6 |
| 22 | QA Baseline & 0 TS Errors | 0 TypeScript errors across 19 packages (`turbo check --force`), >= 1,764 passing tests | M6 | Survey R6 |
| 23 | Master Closure Documentation | `RAKAZO_MASTER_BLUEPRINT_CURRENT.md`, `RAKAZO_ARCHITECT_HANDOFF_FREE_INTELLIGENCE_GATEWAY.md`, `docs/ENVIRONMENT_SETUP.md`, `AGENTS.md` | M6 | Survey R6 |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| E2E | E2E Testing Track | Complete 5-tier test suites & harness | None | DONE |
| M1 | Contracts & Database Telemetry | `@rakazo/contracts` & `@rakazo/db` schema, Zod & migration 0015 | None | DONE |
| M2 | FreeOmniRouteAdapter & Policy Engine | `@rakazo/adapters` adapter & zero-cost policy barrier | M1 | DONE |
| M3 | Runtime Invariants & Subagent Inheritance | `@rakazo/adapters`, executor, subagents, 4-block cache | M1, M2 | DONE |
| M4 | Responsive WebUI Ergonomics | `apps/web` Shell.tsx forms, dark tokens, touch targets | M1 | DONE |
| M5 | Containerized Deployment & Security | `infra/compose`, Docker, Coolify & Traefik specs | None | DONE |
| M6 | Final Verification & Master Docs | 100% E2E tests, QA baseline, Turbo check, closure docs | M1-M5, E2E | DONE |



## Interface Contracts
### @rakazo/contracts ↔ @rakazo/adapters & apps/web
- `BotInferenceConfig`: `{ mode: "premium" | "free", tags: ("coding" | "writing" | "reasoning" | "fast" | "analysis")[] }`
- `InferenceMode`: `"premium" | "free"`
- `InferenceUsageTag`: `"coding" | "writing" | "reasoning" | "fast" | "analysis"`
- `PromptExecutionLogInput`: `{ runId, workerId, model, promptTokens, completionTokens, totalTokens, durationMs, inferenceMode?, requestedCategory?, resolvedProvider?, resolvedModel?, isFree? }`

### @rakazo/adapters ↔ OmniRoute Gateway
- HTTP endpoint: `POST ${OMNIROUTE_BASE_URL}/chat/completions` (OpenAI format, headers `Authorization: Bearer ${OMNIROUTE_API_KEY}`).
- Timeout: 30,000ms with AbortController.
- Fail-closed error on non-200 / positive cost / unknown provider: `"Capacité gratuite temporairement indisponible"`.
