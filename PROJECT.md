# Project: RAKAZO — Finalisation Professionnelle de l'Intégration OmniRoute

## Architecture
Rakazo operates as a high-reliability, multi-package TypeScript monorepo (`@rakazo/contracts`, `@rakazo/adapters`, `@rakazo/runtime`, `@rakazo/db`, `@rakazo/chat-ui`, `apps/web`, `apps/api`, `apps/worker`) deploying a unified agentic execution architecture with dual-path inference transports:
- **Pluggable Inference Transport Layer (`InferenceTransport`)**: Decouples the raw model streaming transport from the canonical agentic loop.
  - **Premium Track (`PiAiInferenceTransport`)**: Routes direct to OpenRouter (`openai/gpt-oss-120b`) via `@earendil-works/pi-ai` with full tool calling capabilities.
  - **Free Track (`OmniRouteInferenceTransport`)**: Routes to sovereign OmniRoute gateway (`OMNIROUTE_BASE_URL`, `OMNIROUTE_API_KEY`) targeting live high-availability combos (`combo/rakazo-*`) with FNV-1a session affinity (`x-session-id`) and strict zero-cost enforcement.
- **Full-Chain Free Mode Persistence**:
  - WebUI (`apps/web`) -> Contracts (`@rakazo/contracts`) -> oRPC API (`apps/api`) -> Prisma Repositories (`@rakazo/db`) -> Restitution UI -> Runtime Executor (`@rakazo/adapters`).
  - Strict preservation of `inference: { mode, tags }` across bot creation, editing, reloading, duplication, and subagent spawning.
  - Legacy bots without explicit inference configuration cleanly default to Premium (`gpt-oss-120b`).
- **Canonical Agentic Turn Loop**: Both Free and Premium paths execute the exact same unified agentic loop:
  - Full MCP tool calling and execution with feedback loops to the model.
  - Strict loop guards: `MAX_TOOL_ITERATIONS_PER_TURN = 25` and max 3 redundant consecutive tool calls.
  - Semantic result compaction (`compactToolResult`) for shell outputs, file trees, GitHub, Notion, Cloudflare, and JSON payloads.
  - Triple-tier `AbortSignal` cancellation propagation.
- **Strict Subagent Confinement & Zero-Cost Inheritance**:
  - Subagents spawned by a Free parent unconditionally inherit `inferenceMode: "free"` with zero privilege escalation.
  - Hard limit of 8,192 tokens for subagent context/generation.
  - Recursion depth strictly capped at 1 (`SUBAGENT_MAX_DEPTH = 1`).
  - Delegation tools (`run_subagent`, `spawn_subagent`, `delegate_task`, `spawn_bot`, `archive_bot`, `delete_bot`) stripped from child catalogs.
- **Deterministic Cognitive Priority Routing**:
  - 5 intent profiles mapped to live combos: `coding` -> `combo/rakazo-coding`, `reasoning` -> `combo/rakazo-reasoning`, `fast` -> `combo/rakazo-fast`, `writing` -> `combo/rakazo-writing`, `analysis` -> `combo/rakazo-analysis`.
  - Multi-tag resolution resolved via deterministic priority matrix: `reasoning` (100) > `coding` (80) > `analysis` (60) > `writing` (40) > `fast` (20) without combinatorial explosion.
- **4-Block KV Prefix Caching Synergy & Session Affinity**:
  - Prompt assembled into 4 deterministic blocks: Block A (invariants at Token 0), Block B (persona & sorted skills), Block C (compacted history), Block D (ephemeral query).
  - 32-bit FNV-1a hash key `computeSessionAffinityKey` injected as `x-session-id` into OmniRoute requests for sticky GPU cache hits (>80%).
- **Double Fail-Closed Zero-Cost Barrier & SQL Telemetry**:
  - Pre-dispatch gate (`RakazoFreePolicyEngine.vetoPaidFallback`, `assertZeroCostAndAllowed`) and post-response gate (`x-omniroute-cost: 0.00`, approved provider validation) abort immediately with `"Capacité gratuite temporairement indisponible"` if cost > 0 or unapproved route attempted.
  - Non-blocking SQL telemetry via `PromptExecutionLog` in `@rakazo/db`.
  - Secrets hygiene: automated regex redaction of API keys and tokens.
- **Cross-Device UI & VPS Isolation**:
  - Mobile, tablet, and desktop responsiveness (320px to 1440px+), 44px touch targets, safe-area bottom padding, iOS 16px input zoom prevention.
  - Isolated Coolify PaaS container on port 20128 with zero interference on VPS co-located services.

## Feature Inventory
| # | Feature | Description | Milestone | Source | Status |
|---|---------|-------------|-----------|--------|--------|
| 1 | Full-Chain Free Mode Persistence & Mapping | Persist `inference: { mode, tags }` in `packages/db/src/repos.ts` (`mapBot`, `createBot`, `updateBot`) & `router.ts` (`bots.duplicate`) | M1 | R1 | VERIFIED |
| 2 | Legacy Default & Subagent Bot Inheritance | Legacy bots default to Premium; child bots spawned by Free parents inherit Free mode | M1 | R1 | VERIFIED |
| 3 | Secure Coolify Connection & Env Config | Declare `OMNIROUTE_BASE_URL` & `OMNIROUTE_API_KEY` in `docker-compose.yaml`, `apps/api/src/env.ts` | M2 | R2 | VERIFIED |
| 4 | Secret Masking & Hygiene Compliance | Mask `OMNIROUTE_API_KEY` in `apps/worker/src/index.ts`; verify zero plaintext secrets in repo/docs | M2 | R2 | VERIFIED |
| 5 | OmniRoute Live Combos Integration | Map 5 intent profiles to live `combo/rakazo-*` combos in `RakazoFreePolicyEngine` | M3 | R3 | VERIFIED |
| 6 | Deterministic Cognitive Priority Routing | Multi-tag resolution via cognitive hierarchy (`reasoning` 100 > `coding` 80 > `analysis` 60 > `writing` 40 > `fast` 20) | M3 | R3 | VERIFIED |
| 7 | Unified Canonical MCP Tool Loop | Full MCP tool calling loop with 25-step circuit breaker, 3-call redundancy detector & `compactToolResult` | M3 | R4 | VERIFIED |
| 8 | Strict Subagent Free Mode Inheritance & Limits | Enforce Free inheritance, 8,192 token ceiling, depth 1, and strip delegation tools | M3 | R5 | VERIFIED |
| 9 | Double Fail-Closed Zero-Cost Barrier | Pre-dispatch and post-response validation aborting with $0.00 and fail-closed error string | M3 | R5 | VERIFIED |
| 10 | 4-Block KV Prefix Caching & FNV-1a Session Affinity | Assemble 4 prompt blocks and inject `x-session-id: sess_<hex>` header | M3 | R6 | VERIFIED |
| 11 | SQL Telemetry & PromptExecutionLog Ingestion | Ingest `x-omniroute-*` response headers into `PromptExecutionLog` in `@rakazo/db` | M3 | R6 | VERIFIED |
| 12 | Comprehensive E2E Testing Suite & Stress Hardening | Tiers 1-5 tests validating 100% features, edge cases, and adversarial challenges | M3 | R1-R6 | VERIFIED |
| 13 | VPS Non-Interference & Master Production Certification | Compile `RAKAZO_ARCHITECT_HANDOFF_OMNIROUTE_PRODUCTION_CERTIFICATION.md`, update blueprints & docs | M4 | R7 | VERIFIED |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | Free Mode Persistence Integrity & Full-Chain Verification (R1) | Fix `packages/db/src/repos.ts`, `apps/api/src/router.ts`, unit & persistence tests | Survey | DONE |
| M2 | Secure Coolify Connection & Credential Hygiene (R2) | `docker-compose.yaml`, `apps/api/src/env.ts`, `apps/worker/src/index.ts`, secret audit | M1 | DONE |
| M3 | E2E Regression Pass & Adversarial Hardening (R3-R6, Tiers 1-5) | Full E2E test execution, adversarial stress verification, zero-cost gate audit | M2 | DONE |
| M4 | Master Certification, Blueprints & VPS Final Handoff (R7) | Master certification artifact, updated blueprints/docs, clean forensic audit | M3 | DONE |

## Master Certification Artifact
- `/Users/floteuilteletravail/.gemini/antigravity/scratch/rakazo_app/RAKAZO_ARCHITECT_HANDOFF_OMNIROUTE_PRODUCTION_CERTIFICATION.md`
