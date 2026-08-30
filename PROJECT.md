# Project: RAKAZO — Final OmniRoute Integration & Excellence Iteration

## Architecture
Rakazo operates as a high-reliability, multi-package TypeScript monorepo (`@rakazo/contracts`, `@rakazo/adapters`, `@rakazo/runtime`, `@rakazo/db`, `@rakazo/chat-ui`, `apps/web`, `apps/api`) deploying a unified agentic execution architecture with dual-path inference transports:
- **Pluggable Inference Transport Layer (`InferenceTransport`)**: Decouples the raw model streaming transport from the canonical agentic loop.
  - **Premium Track (`PiAiInferenceTransport`)**: Routes direct to OpenRouter (`openai/gpt-oss-120b`) via `@earendil-works/pi-ai` with full tool calling capabilities.
  - **Free Track (`OmniRouteInferenceTransport`)**: Routes to sovereign OmniRoute gateway (`OMNIROUTE_BASE_URL`, `OMNIROUTE_API_KEY`) targeting live high-availability combos (`combo/rakazo-*`) with FNV-1a session affinity (`x-session-id`) and strict zero-cost enforcement.
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
| 1 | Pluggable InferenceTransport Interface | Define and implement `InferenceTransport` isolating transport from canonical tool loop | M1 | R1 | VERIFIED |
| 2 | Unified Canonical MCP Tool Loop | Unify MCP tool calling loop for Free & Premium with 25-step circuit breaker & 3-call redundancy detector | M1 | R1 | VERIFIED |
| 3 | Semantic Tool Compaction & AbortSignal | Compact tool results (`compactToolResult`) and propagate cancellation across transports | M1 | R1 | VERIFIED |
| 4 | OmniRoute Live Combos Integration | Map 5 intent profiles to live `combo/rakazo-*` combos in `RakazoFreePolicyEngine` | M1 | R2 | VERIFIED |
| 5 | Deterministic Cognitive Priority Routing | Multi-tag resolution via cognitive hierarchy (`reasoning` 100 > `coding` 80 > `analysis` 60 > `writing` 40 > `fast` 20) | M1 | R2 | VERIFIED |
| 6 | Free Policy Engine Veto & Provider Updates | Allow `combo/rakazo-*` and provider `omniroute` while strictly vetoing paid models | M1 | R2 | VERIFIED |
| 7 | Strict Subagent Free Mode Inheritance | Subagents of Free parents unconditionally inherit Free mode with zero escalation | M2 | R3 | VERIFIED |
| 8 | Subagent Resource & Concurrency Confinement | Enforce 8,192 token ceiling, max depth 1, and strip all delegation tools | M2 | R3 | VERIFIED |
| 9 | 4-Block KV Prefix Caching Assembly | Retain Block A (invariants), Block B (persona/skills), Block C (history), Block D (turn) | M2 | R4 | VERIFIED |
| 10 | FNV-1a Session Affinity Header Injection | Inject `x-session-id: sess_<hex>` into OmniRoute HTTP requests for sticky GPU caching | M2 | R4 | VERIFIED |
| 11 | Double Fail-Closed Zero-Cost Barrier | Pre-dispatch and post-response validation aborting with $0.00 and clear error string | M3 | R5 | VERIFIED |
| 12 | SQL Telemetry & PromptExecutionLog | Fire-and-forget logging of `inferenceMode`, `requestedCategory`, `resolvedProvider`, `resolvedModel`, `isFree`, `tokens`, `cachedTokens`, `duration` | M3 | R5 | VERIFIED |
| 13 | Secrets Hygiene & Token Redaction | Strict regex masking of API keys and PATs with 0 plaintext secrets in code or docs | M3 | R5 | VERIFIED |
| 14 | Multi-Screen UI & Touch Ergonomics | 320px–1440px+ responsiveness, 44px touch targets, safe-area insets, iOS zoom prevention | M3 | R6 | VERIFIED |
| 15 | VPS Non-Interference & Master Documentation | Zero interference with VPS containers, master handoff `RAKAZO_ARCHITECT_HANDOFF_OMNIROUTE_FINAL_INTEGRATION.md` & blueprints | M3 | R6 | VERIFIED |
| 16 | Comprehensive E2E Testing Suite | Tier 1 to Tier 5 tests validating 100% of features, edge cases, and adversarial challenges | M4 / E2E Track | R1–R6 | VERIFIED (TEST_READY.md) |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| E2E | E2E Testing Track | Requirement-driven opaque-box test suite (Tiers 1-5, 193 tests) & `TEST_READY.md` | Survey | DONE |
| M1 | Unified Agentic Runtime & Deterministic Routing (R1 & R2) | `InferenceTransport`, canonical MCP tool loop, live `combo/rakazo-*`, cognitive priority matrix | Survey | DONE |
| M2 | Strict Subagent Free Confinement & 4-Block KV Caching (R3 & R4) | Subagent mode inheritance, 8192 token limit, depth 1, delegation stripping, FNV-1a `x-session-id` | M1 | DONE |
| M3 | Double Zero-Cost Gate, Telemetry & UI/Docs Master (R5 & R6) | Pre/post zero-cost check, `PromptExecutionLog`, secret masking, responsive UI, master docs | M2 | DONE |
| M4 | Final Milestone: 100% E2E Pass & Adversarial Hardening (Tier 5) | Pass 100% E2E tests across monorepo, adversarial coverage hardening, clean forensic audit | M1, M2, M3, E2E | DONE |

## Interface Contracts
### `InferenceTransport` ↔ Canonical Agentic Loop
- Interface: `packages/adapters/src/inference-transport.ts`
- Implementations: `OmniRouteInferenceTransport`, `PiAiInferenceTransport`
- Bounded turn loop: `CanonicalAgentRuntime` (`MAX_TOOL_ITERATIONS_PER_TURN = 25`, max 3 redundant calls, `compactToolResult`, `executeSubagent`, `AbortSignal`).

### OmniRoute Live Combo Resolution
- `resolveRoute(tags: InferenceUsageTag[])`:
  - `reasoning` (100) -> `combo/rakazo-reasoning` (provider: `omniroute`)
  - `coding` (80) -> `combo/rakazo-coding` (provider: `omniroute`)
  - `analysis` (60) -> `combo/rakazo-analysis` (provider: `omniroute`)
  - `writing` (40) -> `combo/rakazo-writing` (provider: `omniroute`)
  - `fast` (20) -> `combo/rakazo-fast` (provider: `omniroute`)
  - Default -> `combo/rakazo-fast` (provider: `omniroute`)

### Fail-Closed Error Contract
- When zero providers active, cost > 0, unapproved provider, or network timeout:
  - Returns `FREE_INFERENCE_UNAVAILABLE_MESSAGE` (*"Capacité gratuite temporairement indisponible"*).
  - Billed cost recorded: exactly `$0.000000`.

## Code Layout
- Local Monorepo Root: `/Users/floteuilteletravail/.gemini/antigravity/scratch/rakazo_app`
  - `packages/contracts/src/domain.ts` (Schemas, domain types, error codes)
  - `packages/contracts/src/events.ts` (Streaming event types)
  - `packages/adapters/src/inference-transport.ts` (Pluggable transport interfaces)
  - `packages/adapters/src/omniroute-transport.ts` (OmniRoute inference transport)
  - `packages/adapters/src/pi-ai-transport.ts` (OpenRouter / Pi AI inference transport)
  - `packages/adapters/src/pi-runtime.ts` (Canonical agentic runtime & MCP loop)
  - `packages/adapters/src/free-policy-engine.ts` (Cognitive priority routing & zero-cost policy)
  - `packages/adapters/src/subagent-inheritance.ts` (Subagent mode inheritance & resource limits)
  - `packages/adapters/src/prefix-caching.ts` (4-block prompt assembler & FNV-1a session affinity)
  - `packages/adapters/src/tool-compacting.ts` (Semantic tool result compaction)
  - `packages/adapters/src/loop-guards.ts` (Anti-loop circuit breaker & redundancy detector)
  - `packages/adapters/src/executor.ts` (Unified execution dispatcher)
  - `packages/db/prisma/schema.prisma` (PostgreSQL / SQLite schema with `PromptExecutionLog`)
  - `packages/db/src/telemetry.ts` (Non-blocking SQL telemetry recording)
  - `apps/web/src/pages/Shell.tsx` (Responsive UI & IntelligenceSelector)
  - `docs/OMNIROUTE_DEPLOYMENT.md` (OmniRoute deployment runbook)
  - `docs/ENVIRONMENT_SETUP.md` (Environment setup)
  - `AGENTS.md` (Agent architecture reference)
  - `RAKAZO_MASTER_BLUEPRINT_CURRENT.md` (Master blueprint)
  - `RAKAZO_ARCHITECT_HANDOFF_OMNIROUTE_FINAL_INTEGRATION.md` (Master integration handoff)
