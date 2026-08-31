# Project: RAKAZO OmniRoute Coherence, Observability & Production Excellence

## Architecture
Rakazo is an enterprise-grade AI agent platform organized as a Turborepo 2 + pnpm monorepo comprising 19 packages (11 shared packages, 6 applications, 2 infra/deploy modules).

The OmniRoute integration establishes a strict 3-tier architectural decoupling:
1. **Level 1 (Product / User Intent)**: Stable user configuration (`mode: "free"`, cognitive tags `coding`, `reasoning`, `fast`, `writing`, `analysis`) persisted in `@rakazo/db` (`bot.metadata.inference`).
2. **Level 2 (Logical Route Contract)**: Deterministic resolution via Cognitive Priority Matrix in `RakazoFreePolicyEngine` to canonical capability contracts (`combo/rakazo-coding`, `combo/rakazo-reasoning`, `combo/rakazo-fast`, `combo/rakazo-writing`, `combo/rakazo-analysis`).
3. **Level 3 (Real Execution Resolution)**: Dynamic per-turn execution resolution by the sovereign OmniRoute gateway (`omniroute-gateway:8080/v1`) to live healthy free models (`mistralai/codestral-latest`, `groq/llama-3.3-70b-versatile`, `qwen/qwen-2.5-coder-32b-instruct`).

```
[User / WebUI Settings]
       │ (Stable Intent: Mode=Free, Tag=Coding)
       ▼
[Cognitive Priority Matrix] ──► Logical Route Contract: combo/rakazo-coding
       │
       ▼
[OmniRoute Sovereign Gateway] ──► Dynamic Resolution: mistralai/codestral-latest
       │
       ├─► HTTP Response Headers (x-omniroute-provider, x-omniroute-model, x-omniroute-response-cost, etc.)
       │
       ▼
[CanonicalAgentRuntime / Executor]
       │
       ├─► Non-blocking SQL Telemetry (PromptExecutionLog: resolvedProvider, resolvedModel, cacheHitRatio)
       └─► Streaming Event Stream ──► WebUI MessageView (Turn Metadata Badge: "Modèle utilisé: Codestral · Mistral AI")
```

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | 3-Level Dynamic Decoupling | Complete separation between User Intent, Logical Combo Route, and Dynamic Resolution | M1 | ORIGINAL_REQUEST §R1 |
| 2 | Static Coupling Ban | Zero hardcoded model/provider enums in contracts/db; upstream OmniRoute updates require 0 code changes | M1 | ORIGINAL_REQUEST §R1 |
| 3 | OmniRoute Response Header Capture | Capture `x-omniroute-provider`, `x-omniroute-model`, `x-omniroute-latency-ms`, `x-omniroute-session-id`, `x-omniroute-version`, `x-omniroute-response-cost` | M1 | ORIGINAL_REQUEST §R2 |
| 4 | End-to-End Metadata Propagation | Propagate headers from Transport -> Runtime -> DB Telemetry -> UI streaming without overriding intent | M1 | ORIGINAL_REQUEST §R2 |
| 5 | Non-blocking SQL Telemetry | `PromptExecutionLog` model with non-blocking async persistence and bounded fields | M2 | ORIGINAL_REQUEST §R2 |
| 6 | 4-Block Token 0 Invariant Cache | Static guardrails (Bloc A) and sorted skills (Bloc B) at Token 0 (~1500-3500 tokens) | M2 | ORIGINAL_REQUEST §R4 |
| 7 | Provider-Independent Session Affinity | FNV-1a hash over `workspace:bot:thread` for `x-session-id` without provider pollution | M2 | ORIGINAL_REQUEST §R4 |
| 8 | Strict Cache Ratio Calculation | Mathematical formula `cachedTokens / promptTokens` bounded [0, 1] without double counting | M2 | ORIGINAL_REQUEST §R4 |
| 9 | Canonical Agentic Loop Guards | 25 max iterations, 3-repetition circuit breaker with key canonicalization | M3 | ORIGINAL_REQUEST §R5 |
| 10 | Semantic Tool Compaction | Intelligent trimming (`compactToolResult`) for shell, list_files, github, notion, cloudflare | M3 | ORIGINAL_REQUEST §R5 |
| 11 | Subagent Strict Confinement | Parent Free => Subagent Free, depth ceiling 1, 8192 token ceiling, delegation tool stripping | M3 | ORIGINAL_REQUEST §R5 |
| 12 | Double Zero-Cost Barrier | Pre-dispatch veto and post-response assertion of $0.00 cost with fail-closed immediate error | M3 | ORIGINAL_REQUEST §R5 |
| 13 | WebUI Bot Settings Decoupling | Display stable intent ("Gratuit via OmniRoute · Profil : Coding") without model promises | M4 | ORIGINAL_REQUEST §R3 |
| 14 | WebUI Chat Turn Execution Badge | Render per-turn real execution metadata ("Modèle utilisé : Codestral · Mistral AI") under assistant replies | M4 | ORIGINAL_REQUEST §R3 |
| 15 | Smooth Dynamic Failover UX | Dynamic failover updates per-turn metadata seamlessly without anxiety-inducing error alerts | M4 | ORIGINAL_REQUEST §R3 |
| 16 | Mobile & Desktop Responsive UX | 320px to 1440px+ responsive layouts with touch targets >= 44px and safe area insets | M4 | ORIGINAL_REQUEST §R3 |
| 17 | E2E Testing Track & Test Harness | Opaque-box test suite across Tiers 1-4 with >= 11*N test cases | M5 | ORIGINAL_REQUEST Acceptance Criteria |
| 18 | Triple Coherence Verification | Formal equation `OmniRoute Headers == PromptExecutionLog == WebUI Rendered Metadata` | M5 | ORIGINAL_REQUEST §R6 |
| 19 | Monorepo Zero-Error Typecheck & 100% Tests | `pnpm check` on 19 packages with 0 TS errors and 100% tests passing | M5 | ORIGINAL_REQUEST Acceptance Criteria |
| 20 | VPS Multi-App & Premium Route Sanctuary | Preserve 15 VPS apps and OpenRouter `gpt-oss-120b` route | M6 | ORIGINAL_REQUEST §R6 |
| 21 | Documentation Updates | Update `RAKAZO_MASTER_BLUEPRINT_CURRENT.md`, `AGENTS.md`, `docs/ENVIRONMENT_SETUP.md`, `docs/OMNIROUTE_DEPLOYMENT.md` | M6 | ORIGINAL_REQUEST §R6 |
| 22 | Master Passation Artifact | Authoritative handoff `RAKAZO_ARCHITECT_HANDOFF_OMNIROUTE_COHERENCE_AND_OBSERVABILITY.md` | M6 | ORIGINAL_REQUEST §R6 |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | Dynamic Decoupling & Header Propagation | Contracts, OmniRouteInferenceTransport, Cognitive Priority, Response Headers | none | DONE |
| M2 | Database Telemetry & 2-Tier Caching | `PromptExecutionLog`, non-blocking logging, 4-block cache, FNV-1a session key, strict cache ratio | M1 | DONE |
| M3 | MCP Agentic Loop & Subagent Confinement | `CanonicalAgentRuntime`, loop guards, semantic compaction, subagent confinement, zero-cost barrier | M1, M2 | DONE |
| M4 | WebUI UX Decoupling & Turn Observability | Bot Settings intent labels, MessageView per-turn execution metadata badge, failover handling | M1, M2, M3 | DONE |
| M5 | E2E Testing Track & Triple Coherence | Opaque-box E2E suite, Tiers 1-4, Triple Coherence certification, 0 TS errors across 19 pkgs | M1-M4 | DONE |
| M6 | Authority Documentation & Master Handoff | RAKAZO_ARCHITECT_HANDOFF_OMNIROUTE_COHERENCE_AND_OBSERVABILITY.md, Blueprint, VPS Sanctuary | M1-M5 | DONE |

## Interface Contracts
### Contracts ↔ Adapters ↔ Transport
- `BotInferenceConfig`: `{ mode: "premium" | "free", tags: ("coding" | "writing" | "reasoning" | "fast" | "analysis")[] }`
- `RakazoFreePolicyEngine.resolveInferenceModel(config)` -> `combo/rakazo-<tag>`
- `OmniRouteInferenceTransport` captures headers:
  - `x-omniroute-provider`: string
  - `x-omniroute-model`: string
  - `x-omniroute-latency-ms`: string (parsed to number)
  - `x-omniroute-session-id`: string
  - `x-omniroute-version`: string
  - `x-omniroute-response-cost` (fallback `x-omniroute-cost`): string (verified == "0" or "0.000000")

### Runtime ↔ Database Telemetry
- `recordPromptExecutionLogAsync(prisma, { botId, executionId, provider, model, levelUsed, promptTokens, completionTokens, cachedTokens, cacheHitRatio, durationMs, costEstimatedUsd, inferenceMode, requestedCategory, resolvedProvider, resolvedModel, isFree })`: non-blocking `void`.

### Runtime ↔ WebUI
- Stream usage & metadata events: `{ type: "usage", inputTokens, outputTokens, cachedTokens, cacheHitRatio, provider, model, resolvedProvider, resolvedModel, latencyMs, isFree }`.
- WebUI displays:
  - Settings: `Gratuit via OmniRoute · Profil : [Tag]`
  - Message Details: `Modèle utilisé : [ResolvedModel] · [ResolvedProvider]`

## Code Layout
- `packages/contracts/src/domain.ts`: Inference domain types & schemas.
- `packages/adapters/src/free-policy-engine.ts`: Cognitive Priority Matrix & zero-cost policy.
- `packages/adapters/src/omniroute-transport.ts`: OmniRoute transport & header capture.
- `packages/adapters/src/prefix-caching.ts`: 4-Block layout & FNV-1a session affinity.
- `packages/adapters/src/loop-guards.ts`: Circuit breakers & iteration guards.
- `packages/adapters/src/tool-compacting.ts`: Multi-tool semantic compaction.
- `packages/adapters/src/subagent-inheritance.ts`: Sub-agent isolation & confinement.
- `packages/adapters/src/pi-runtime.ts`: CanonicalAgentRuntime execution loop.
- `packages/adapters/src/executor.ts`: End-to-end execution pipeline & telemetry dispatch.
- `packages/db/prisma/schema.prisma`: PromptExecutionLog model definition.
- `packages/db/src/telemetry.ts`: Non-blocking telemetry persistence functions.
- `apps/web/src/pages/Shell.tsx`: WebUI Shell, Bot Settings & MessageView rendering.
- `apps/web/src/pages/ModelSettingsOverlay.tsx`: Bot Settings overlay & model cards.
- `docs/OMNIROUTE_DEPLOYMENT.md`: OmniRoute VPS deployment and multi-app topology.
- `docs/ENVIRONMENT_SETUP.md`: Environment setup and configuration guide.
- `RAKAZO_MASTER_BLUEPRINT_CURRENT.md`: Master architectural blueprint.
- `AGENTS.md`: Agent runtime standards and operational rules.
- `RAKAZO_ARCHITECT_HANDOFF_OMNIROUTE_COHERENCE_AND_OBSERVABILITY.md`: Master passation artifact.
