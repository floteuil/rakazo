# Project: RAKAZO — Itération d'Excellence Production

## Architecture
RAKAZO is an enterprise AI agent platform organized as a Turborepo 2 + pnpm monorepo containing 19 packages across `apps/`, `packages/`, `infra/`, and `deploy/`.
The core architecture enforces strict 3-tier dynamic decoupling for OmniRoute Free routing, complete isolation and sanctuarization of the historic OpenRouter Premium path (`openai/gpt-oss-120b`), sovereign MCP tool execution with loop guards and semantic token compaction, strict sub-agent confinement, non-blocking PostgreSQL SQL telemetry, seamless WebUI intent vs resolved model presentation, and multi-tenant VPS isolation.

```
                  ┌─────────────────────────────────────────────────────────┐
                  │                 WebUI / Desktop / Mobile                │
                  │   Stable Intention (Settings) vs Resolved Model (Chat)  │
                  └───────────────────────────┬─────────────────────────────┘
                                              │ oRPC / HTTP
                                              ▼
                  ┌─────────────────────────────────────────────────────────┐
                  │                   @rakazo/api (Hono)                    │
                  │         Bot Config: mode ("premium" | "free"), tags     │
                  └───────────────────────────┬─────────────────────────────┘
                                              │
                                              ▼
                  ┌─────────────────────────────────────────────────────────┐
                  │              @rakazo/adapters / Pi Runtime              │
                  │         CanonicalAgentRuntime & InferenceTransport      │
                  ├─────────────────────────────┬───────────────────────────┤
                  │                             │                           │
                  │ [mode: "premium"]           │ [mode: "free"]            │
                  ▼                             ▼                           ▼
    ┌───────────────────────────┐ ┌───────────────────────────┐ ┌──────────────────────┐
    │  PiAiInferenceTransport   │ │OmniRouteInferenceTransport│ │ Sovereign MCP Engine │
    │     (OpenRouter SDK)      │ │   (combo/rakazo-* route)  │ │  (8 Connectors /     │
    │ openai/gpt-oss-120b direct│ │ Upstream Dynamic Model Res│ │   40 Tools, Guards)  │
    └───────────────────────────┘ └─────────────┬─────────────┘ └──────────────────────┘
                                                │
                                                ▼
                               ┌──────────────────────────────────┐
                               │ PromptExecutionLog (PostgreSQL)  │
                               │ Non-blocking SQL Telemetry       │
                               │ resolvedProvider, resolvedModel, │
                               │ cacheHitRatio, zero-cost checks  │
                               └──────────────────────────────────┘
```

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| F1 | Forensic Baseline Audit & Codebase Reconciliation | Empirical verification of 0 TS errors (19 packages), 2,768+ tests passing, clean working tree | M1 | ORIGINAL_REQUEST §R1 |
| F2 | Generic Typed InferenceTransport | Abstract interface decoupling SSE HTTP transport from core runtime | M2 | ORIGINAL_REQUEST §R2 |
| F3 | 3-Level Dynamic Decoupling | Product Intention <-> Canonical Route (`combo/rakazo-*`) <-> Turn Dynamic Resolution | M2 | ORIGINAL_REQUEST §R2 |
| F4 | Zero Static Tables/Enums | 100% free model replacement in OmniRoute with 0 commits/migrations in Rakazo | M2 | ORIGINAL_REQUEST §R2 |
| F5 | Response Header Propagation | `x-omniroute-*` headers mapped into `InferenceTransportChunk` | M3 | ORIGINAL_REQUEST §R3 |
| F6 | Non-blocking SQL Telemetry | `recordPromptExecutionLogAsync` logging `resolvedProvider`, `resolvedModel`, `isFree` | M3 | ORIGINAL_REQUEST §R3 |
| F7 | Strict Cache Hit Ratio & FNV-1a Affinity | `cachedTokens / (cachedTokens + promptTokens)` clamped [0, 1] and `sess_<hex>` affinity | M3 | ORIGINAL_REQUEST §R3 |
| F8 | OpenRouter Premium Sanctuarization | `PiAiInferenceTransport` (`openai/gpt-oss-120b`) with zero OmniRoute dependencies | M4 | ORIGINAL_REQUEST §R4 |
| F9 | Sovereign MCP Tool Loop | 8 connectors, 40 tools, `isToolPermitted`, `compactToolResult`, 25-turn breaker, 3x loop guard | M4 | ORIGINAL_REQUEST §R4 |
| F10 | Free Sub-Agent Strict Confinement | 8,192 token ceiling, depth $\le 1$, delegation tools stripped, escalation veto | M4 | ORIGINAL_REQUEST §R4 |
| F11 | WebUI Intent vs Turn Resolution | Bot settings show stable intent, transcript displays dynamic resolved model per turn | M5 | ORIGINAL_REQUEST §R5 |
| F12 | Security, Secrets & Zero-Cost Fail-Closed | GitLeaks clean (0 secrets), error sanitization, immediate fail-closed on non-zero cost | M5 | ORIGINAL_REQUEST §R5 |
| F13 | VPS Coolify Non-Interference | Resource limits (<1.2 GB), Traefik routing, zero port collisions for 15 VPS apps | M5 | ORIGINAL_REQUEST §R5 |
| F14 | Master Documentation & Triple Coherence | Verification of Header == DB == UI and authoring `RAKAZO_ARCHITECT_HANDOFF_OMNIROUTE_RUNTIME_TRUTH_FINAL.md` | M6 | ORIGINAL_REQUEST §R6 |
| F15 | Dual-Track Comprehensive E2E Testing | Multi-tier test suite (Tiers 1-4 + Tier 5 adversarial stress testing) | E2E | ORIGINAL_REQUEST §R1-R6 |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | Forensic Baseline Audit & Reconciliation | Empirical audit of 19 packages, TS compilation, test execution | none | DONE |
| M2 | Pluggable Inference Contract & Dynamic Decoupling | `InferenceTransport`, 3-level decoupling, zero static models | M1 | DONE |
| M3 | Header Propagation, SQL Telemetry & Strict Cache Formula | Telemetry flow, `PromptExecutionLog`, FNV-1a affinity, cache formula | M2 | DONE |
| M4 | OpenRouter Premium Sanctuarization, Sovereign MCP & Confinement | `PiAiInferenceTransport`, MCP loop guards, compacting, subagent budget | M1 | DONE |
| M5 | WebUI Coherence, Security & VPS Non-Interference | Shell.tsx intent vs model, sanitization, zero-cost fail-closed, Docker/Traefik | M3, M4 | DONE |
| M6 | Documentation of Authority & Final Master Handoff | Triple Coherence, `RAKAZO_ARCHITECT_HANDOFF_OMNIROUTE_RUNTIME_TRUTH_FINAL.md` | M5 | DONE |
| E2E | Dual-Track E2E Test Suite & Adversarial Hardening | Requirement-driven Tiers 1-4 tests + Tier 5 adversarial test suite | M1-M5 | DONE |

## Interface Contracts
### `InferenceTransport` ↔ `CanonicalAgentRuntime`
- File: `packages/adapters/src/inference-transport.ts`
- Method: `streamInference(request: InferenceTransportRequest): AsyncIterable<InferenceTransportChunk>`
- Yields:
  - `text?: string`
  - `resolvedProvider?: string`
  - `resolvedModel?: string`
  - `responseCostUsd?: number`
  - `upstreamLatencyMs?: number`
  - `cachedTokens?: number`, `promptTokens?: number`, `completionTokens?: number`

### `executor.ts` ↔ `PromptExecutionLog` (DB)
- File: `packages/db/src/telemetry.ts`
- Method: `recordPromptExecutionLogAsync(prisma, input: PromptExecutionLogInput): void`
- Fields: `botId`, `inferenceMode`, `requestedCategory`, `resolvedProvider`, `resolvedModel`, `isFree`, `cacheHitRatio`, `costEstimatedUsd`, `durationMs`

### `Shell.tsx` ↔ `TurnExecutionMetadata` (WebUI)
- File: `apps/web/src/pages/Shell.tsx`
- Extractor: `extractTurnExecutionMetadata(message): { resolvedModel?, resolvedProvider?, isFree? }`
- Presentation: Badge renders `Modèle utilisé : ${resolvedModel} · ${resolvedProvider}` without modifying bot configuration.

## Code Layout
- `apps/api`: Backend API & oRPC routes (`port 3100`)
- `apps/web`: Frontend React WebUI (`port 5173` preview, Vite production build)
- `apps/worker`: Background task worker
- `apps/www`: Astro documentation & marketing site
- `apps/desktop`: Electron wrapper
- `apps/mobile`: Expo / React Native mobile app
- `packages/contracts`: Zod schemas, oRPC contracts, MCP catalog (`mcp-catalog.ts`)
- `packages/adapters`: `InferenceTransport`, `OmniRouteInferenceTransport`, `PiAiInferenceTransport`, `CanonicalAgentRuntime`, `RakazoFreePolicyEngine`, `loop-guards.ts`, `tool-compacting.ts`, `subagent-inheritance.ts`, `executor.ts`
- `packages/db`: Prisma schema, migrations, `telemetry.ts`
- `packages/chat-ui`: UI message rendering, Markdown sanitization
- `packages/testkit`: Multi-tier E2E and adversarial test suites
- `deploy/omniroute`: OmniRoute gateway standalone proxy
- `docker-compose.yaml`: Coolify multi-container production configuration
