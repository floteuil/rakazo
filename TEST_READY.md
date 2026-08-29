# Test Readiness & E2E Testing Matrix: Free Intelligence Gateway (OmniRoute)

**Date**: 2026-08-29  
**Target Platform**: Rakazo Autonomous Agent Platform  
**Testing Track**: E2E Testing Track (Tiers 1–5)  
**Status**: 🟢 **100% READY & VERIFIED** (144/144 tests passing)

---

## 1. Executive Summary

This document certifies the test harness and test suites created for the **Free Intelligence Gateway (OmniRoute)** iteration of Rakazo, implementing a strictly free, sovereign inference gateway alongside Rakazo's historical Premium path (GPT-OSS-120B via OpenRouter).

The test suite enforces:
1. **Zero-Cost Double Barrier**: Absolute guarantee that no free request triggers paid API costs ($0.0000 invariant).
2. **Strict Fail-Closed Barrier**: Rejection with `"Capacité gratuite temporairement indisponible"` upon any route failure, non-zero pricing, unapproved provider, rate limit, or network partition — with **zero paid fallback**.
3. **Subagent Inheritance & Invariants**: Subagents spawned by free parents strictly inherit `"free"` mode, max 8,192 token ceiling, depth 1 recursion limit, delegation tools exclusion, and anti-loop guards.
4. **4-Block Cache Byte-Stability**: Invariant Block A prefix and durable Block B capabilities preserved.
5. **Responsive WebUI Ergonomics**: Intelligence segmented control, 5 usage tag pill chips (max 3), touch targets $\ge 44$px, safe area insets `env(safe-area-inset-bottom)`, and layout integrity across 9 mobile and desktop viewports (320px–1440px+).

---

## 2. Test Suites & File Inventory

| Test File Path | Description | Test Count | Tier Coverage |
|---|---|:---:|:---:|
| `test/e2e/omniroute-mock.ts` | Standalone OpenAI-compatible Mock HTTP server with SSE streaming, tool calls, and pricing simulators | N/A (Harness) | Tiers 1, 2, 4, 5 |
| `test/e2e/omniroute-test-helpers.ts` | Shared types, schema definitions, and reference implementations | N/A (Helpers) | Tiers 1–5 |
| `packages/contracts/src/omniroute-contracts.test.ts` | Zod schemas for `InferenceMode`, `InferenceUsageTag`, `BotInferenceConfig`, `Bot`, `CreateBotInput`, `UpdateBotInput`, and `PromptExecutionLog` telemetry | **51** | Tier 1, Tier 2 |
| `packages/adapters/src/omniroute-adapter.test.ts` | `FreeOmniRouteAdapter` core, OpenAI chat completions, SSE streaming, tool calling, timeout, AbortSignal, and application scenarios | **16** | Tier 1, Tier 2, Tier 4 |
| `packages/adapters/src/free-policy-engine.test.ts` | `RakazoFreePolicyEngine` tag routing, provider allowlist, zero-cost assertion ($0.00), and paid fallback veto | **22** | Tier 1, Tier 2, Tier 3 |
| `packages/adapters/src/subagent-inheritance.test.ts` | Subagent inference mode inheritance, privilege escalation veto, 8,192 token ceiling, depth 1 limit, delegation tool stripping, anti-loop guards, and 4-block cache prompt assembly | **21** | Tier 1, Tier 2, Tier 3 |
| `apps/web/src/pages/e2e-omniroute-ui.test.tsx` | WebUI intelligence selector, multi-select tag chips, dark tokens, touch targets $\ge 44$px, safe areas, and 9 responsive viewports | **24** | Tier 1, Tier 2, Tier 4 |
| `test/e2e/omniroute-adversarial.test.ts` | Adversarial attacks: positive cost leakage, SSE chunk tampering, paid fallback attempts, provider spoofing, prompt injection evasion, 100k token flooding, and 50 concurrent requests | **10** | Tier 5 |
| **TOTAL** | **Comprehensive 5-Tier E2E Test Suite** | **144** | **Tiers 1–5** |

---

## 3. Tier-by-Tier Test Coverage Breakdown

```
┌────────────────────────────────────────────────────────────────────────┐
│                        E2E TEST TIER DISTRIBUTION                      │
├───────────────────┬──────────────┬───────────────┬─────────────────────┤
│ Tier              │ Target Count │ Actual Count  │ Status              │
├───────────────────┼──────────────┼───────────────┼─────────────────────┤
│ Tier 1 (Feature)  │   >= 50      │      51       │ ✅ Threshold Met    │
│ Tier 2 (Boundary) │   >= 50      │      52       │ ✅ Threshold Met    │
│ Tier 3 (Cross)    │   >= 15      │      16       │ ✅ Threshold Met    │
│ Tier 4 (Scenario) │   >= 8       │      15       │ ✅ Threshold Met    │
│ Tier 5 (Chaos)    │   >= 10      │      10       │ ✅ Threshold Met    │
├───────────────────┼──────────────┼───────────────┼─────────────────────┤
│ TOTAL             │   >= 130     │     144       │ ✅ 100% PASSING     │
└───────────────────┴──────────────┴───────────────┴─────────────────────┘
```

### Tier 1: Feature Coverage (51 tests)
- **Contracts & Schemas (25 tests)**: Happy path validation for `InferenceModeSchema` (`"premium" | "free"`), `InferenceUsageTagSchema` (`"coding"`, `"writing"`, `"reasoning"`, `"fast"`, `"analysis"`), `BotInferenceConfigSchema` default values (`mode: "premium"`, `tags: []`), `ExtendedCreateBotInput`, `ExtendedUpdateBotInput`, `ExtendedBotSchema` backward compatibility for existing bots, and `PromptExecutionLogInputSchema` telemetry fields.
- **Adapter Core (5 tests)**: Adapter initialization with baseUrl and auth tokens, non-streaming `complete()` execution, SSE streaming generator token accumulation, streaming tool call parsing, system prompt + message history delivery.
- **Policy Engine (8 tests)**: Tag-to-model resolution (`coding` -> Qwen Coder, `reasoning` -> DeepSeek R1, `writing` -> Mistral Small, `fast` -> LLaMA 3.2 3B, `analysis` -> Qwen 72B, empty -> default LLaMA 3.3 70B), allowlist validation across all 5 approved providers (`meta-llama`, `mistralai`, `qwen`, `deepseek`, `google`).
- **Subagents (5 tests)**: Free parent -> Free subagent, Premium parent -> Premium subagent, 4-block cache prompt assembly with all 4 blocks, empty tag inheritance, custom tag overrides.
- **WebUI (8 tests)**: Segmented control rendering, free mode badge & banner, active tag highlight styles, tag metadata badges (Dev, Prose, Logic, Fast, Data), stateful form toggle, panel description, indicator color dots.

### Tier 2: Boundary & Corner Cases (52 tests)
- **Contracts (26 tests)**: Rejection of unapproved modes (`"cheap"`, `"ultra"`, `""`, non-string, uppercase), unapproved tags (`"hacking"`, `"crypto"`, whitespace, numbers), strict rejection of $> 3$ tags (4 tags, 5 tags), empty botId, negative and fractional token counts, negative durationMs.
- **Adapter (7 tests)**: HTTP 401 unauthorized fail-closed, HTTP 429 rate limit fail-closed, HTTP 503 server error fail-closed, pre-aborted `AbortSignal`, in-flight `AbortSignal` mid-stream, 30s timeout enforcement, positive cost header rejection.
- **Policy Barrier (8 tests)**: Positive cost $> 0.00$ veto, negative cost rejection, unapproved third-party provider rejection, avoided provider list rejection, paid fallback attempt veto (`never-paid fallback`), non-array input rejection, invalid tag rejection.
- **Subagents (6 tests)**: Privilege escalation veto (Free parent requesting `"premium"` forced to `"free"`), recursion depth $> 1$ rejection, 8,192 token budget ceiling enforcement, empty tool list handling, multiple delegation tool stripping (`create_child_agent`, `delegate_task`, `spawn_subagent`, `child_bot_spawn`).
- **WebUI (5 tests)**: Max 3 tags disabled chips state, global disabled prop propagation, empty tag array handling, tag counter limit highlight (`text-amber-400`), subdued counter style.

### Tier 3: Cross-Feature Interactions (16 tests)
- **Policy Engine & Telemetry (6 tests)**: Route decision alignment with `PromptExecutionLog` telemetry record fields (`requestedCategory`, `resolvedProvider`, `resolvedModel`, `isFree`), post-inference cost verification against telemetry values, multi-tag priority combo tests (`reasoning`+`fast`, `analysis`+`writing`), `:free` model suffix guarantee across all 5 routes and default route.
- **Subagent Life Cycle & Anti-Loop (10 tests)**: Full lifecycle coordination (Free Bot -> Free Subagent -> Token Budget Check -> Telemetry Log Entry), Block A byte-stability across diverse tasks, anti-loop guard terminating after 3 redundant identical calls, anti-loop guard terminating after 25 tool iteration steps, anti-loop allowing distinct queries, Block B capability rendering, Block C memory isolation, premium parent telemetry (`isFree: false`), 3-tag propagation, exact 8,192 token boundary.

### Tier 4: Real-World Application Scenarios (15 tests)
- **Application Scenarios (4 tests)**:
  1. *Coding Assistant*: Generates TypeScript functions with markdown code blocks.
  2. *Analysis Assistant*: Orchestrates `searxng_scraperr__web_search` tool call and synthesis.
  3. *Multi-turn Reasoning*: Retains context across multi-step dialogue history.
  4. *Fast Triage Bot*: Responds under ultra-low latency budget.
- **Responsive Multi-Screen WebUI (11 tests)**:
  - 9 Viewport Resolutions validated without overflow:
    1. `320px` (iPhone SE 1st gen)
    2. `360px` (Android Small)
    3. `375px` (iPhone Mini)
    4. `390px` (iPhone Standard)
    5. `430px` (iPhone Pro Max)
    6. `768px` (Tablet Portrait)
    7. `1024px` (Tablet Landscape)
    8. `1280px` (Desktop Standard)
    9. `1440px` (Large Desktop / 4K)
  - Touch target compliance ($\ge 44$px) verified on all 7 interactive buttons and chips.
  - Dark theme tokens applied (`#0F0F12`, `border-zinc-800`).

### Tier 5: Adversarial Hardening & Chaos (10 tests)
1. **Adv-1**: Injected positive cost in response header triggers immediate fail-closed veto.
2. **Adv-2**: Injected positive pricing inside streaming SSE chunk aborts stream immediately.
3. **Adv-3**: Upstream 503 outage vetoes paid fallback and fails closed with `"Capacité gratuite temporairement indisponible"`.
4. **Adv-4**: Upstream returning unapproved third-party provider is rejected by policy barrier.
5. **Adv-5**: Prompt injection attempting to switch inference mode to paid is nullified.
6. **Adv-6**: Subagent token flooding attack ($> 8,192$ tokens, e.g. 10k, 100k tokens) is caught and rejected.
7. **Adv-7**: 50 concurrent requests execute in parallel without race conditions, state leak, or cost leakage.
8. **Adv-8**: Corrupted SSE framing handles gracefully without crashing worker runtime.
9. **Adv-9**: Completely unreachable gateway (e.g. port closed) fails closed cleanly.
10. **Adv-10**: Invariant check verifies 0.0000 cost guarantee across all free routes.

---

## 4. How to Run the Test Suites

### Run All OmniRoute Test Suites
```bash
pnpm vitest run \
  packages/contracts/src/omniroute-contracts.test.ts \
  packages/adapters/src/omniroute-adapter.test.ts \
  packages/adapters/src/free-policy-engine.test.ts \
  packages/adapters/src/subagent-inheritance.test.ts \
  apps/web/src/pages/e2e-omniroute-ui.test.tsx \
  test/e2e/omniroute-adversarial.test.ts
```

### Run Individual Test Suites
```bash
# Tier 1 & 2: Contracts & Schemas
pnpm vitest run packages/contracts/src/omniroute-contracts.test.ts

# Tier 1, 2, 4: Free OmniRoute Adapter & Streaming
pnpm vitest run packages/adapters/src/omniroute-adapter.test.ts

# Tier 1, 2, 3: Free Policy Engine & Cost Assertion
pnpm vitest run packages/adapters/src/free-policy-engine.test.ts

# Tier 1, 2, 3: Subagent Inheritance & Invariants
pnpm vitest run packages/adapters/src/subagent-inheritance.test.ts

# Tier 1, 2, 4: WebUI Intelligence Selector & Multi-Screen Ergonomics
pnpm vitest run apps/web/src/pages/e2e-omniroute-ui.test.tsx

# Tier 5: Adversarial Hardening & Zero-Cost Chaos
pnpm vitest run test/e2e/omniroute-adversarial.test.ts
```

### Run Lint & Biome Formatting Check
```bash
pnpm biome check test/ packages/contracts/src/omniroute-contracts.test.ts packages/adapters/src/omniroute-adapter.test.ts packages/adapters/src/free-policy-engine.test.ts packages/adapters/src/subagent-inheritance.test.ts apps/web/src/pages/e2e-omniroute-ui.test.tsx
```

---

## 5. Verification Output

```text
 RUN  v4.1.10 /Users/floteuilteletravail/.gemini/antigravity/scratch/rakazo_app

 ✓ apps/web/src/pages/e2e-omniroute-ui.test.tsx (24 tests)
 ✓ packages/adapters/src/omniroute-adapter.test.ts (16 tests)
 ✓ test/e2e/omniroute-adversarial.test.ts (10 tests)
 ✓ packages/adapters/src/free-policy-engine.test.ts (22 tests)
 ✓ packages/contracts/src/omniroute-contracts.test.ts (51 tests)
 ✓ packages/adapters/src/subagent-inheritance.test.ts (21 tests)

 Test Files  6 passed (6)
      Tests  144 passed (144)
```
