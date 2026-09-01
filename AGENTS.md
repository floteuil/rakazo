# Autonomous Operating & Architectural Constitution for Rakazo Agents

> **Authoritative Specification & Operating Guide for Human Contributors and Autonomous AI Agents**  
> **Repository**: `github.com/floteuil/rakazo` (branch `main`)  
> **Monorepo Engine**: Turborepo 2 + pnpm 9 workspaces (19 packages)  
> **Runtime**: Canonical Agentic Runtime (`CanonicalAgentRuntime`) + Pluggable Inference Transports (`InferenceTransport`) + Node.js 22 LTS  
> **Certification**: OmniRoute Coherence & Observability Production Certified (2,714 tests 100% passing, 0 TypeScript errors)

---

## 1. Repository Identity & Security Mandate

Rakazo is a public, open-source sovereign autonomous AI agent platform. All contributors and autonomous agents operating in this repository must adhere to the **Zero-Secret Guarantee**:

1. **Public Repository Assumption**: Every commit, branch, pull request, diff, and issue is considered public. Never commit real credentials, production connection strings, API tokens, customer identifiers, or private keys.
2. **Deterministic Placeholders**: Always use designated development placeholders (e.g., `dev-secret-change-me-please-32chars`, `sk-or-v1-mock-key`, `sk-omniroute-local-key`) in tests and documentation.
3. **Pre-Commit Verification**: Always inspect `git status` and staged diffs before committing. Never force-add files ignored by `.gitignore` (such as `.env`, `data/`, `*.local`, `dist/`).
4. **Immediate Alert Protocol**: If sensitive production data is accidentally committed or encountered, halt operations immediately and alert the repository maintainer.

---

## 2. The 6 Core Architectural Pillars

```
┌───────────────────────────────────────────────────────────────────────────────────┐
│                           THE 6 CORE RAKAZO PILLARS                               │
├───────────────────────────────┬───────────────────────────────────────────────────┤
│ 1. 3-Tier Decoupling &        │ Separation of Intent vs Logical Route vs Live     │
│    Additive Evolution         │ Resolution; monorepo integrity; zero regressions. │
├───────────────────────────────┼───────────────────────────────────────────────────┤
│ 2. Canonical MCP Runtime &    │ Shared turn loop, pluggable transports, least     │
│    Zero-Cost Double Barrier   │ privilege, double zero-cost barrier ($0.00).      │
├───────────────────────────────┼───────────────────────────────────────────────────┤
│ 3. Strict Zero-Secret Masking │ Centralized regex redaction, sanitizeToolError,   │
│    & Sanitization             │ runtime secret guards, dev vs prod separation.    │
├───────────────────────────────┼───────────────────────────────────────────────────┤
│ 4. 19-Package Monorepo        │ Strict package boundaries, workspace:* protocol,  │
│    Topology Map               │ unidirectional layering, zero circular imports.   │
├───────────────────────────────┼───────────────────────────────────────────────────┤
│ 5. Bot Deletion Cascade       │ Atomic database cascade (Prisma onDelete: Cascade)│
│    Invariants                 │ + physical disk & sandbox container teardown.     │
├───────────────────────────────┼───────────────────────────────────────────────────┤
│ 6. Verification & Triple      │ 0 TS errors (pnpm check), 100% tests (pnpm test), │
│    Coherence Observability    │ Headers == SQL Telemetry == WebUI Metadata.       │
└───────────────────────────────┴───────────────────────────────────────────────────┘
```

---

### Pillar 1: 3-Tier Decoupling & Additive Non-Breaking Evolution

To guarantee infinite forward compatibility with upstream open-source releases and dynamic sovereign AI gateways:

- **3-Tier Decoupled Architecture**:
  1. **Level 1 (User / Product Intent)**: Stable user configuration (`mode: "free"`, cognitive tags `coding`, `reasoning`, `fast`, `writing`, `analysis`) persisted in PostgreSQL `bot.metadata.inference`.
  2. **Level 2 (Logical Route Contract)**: Canonical route string (`combo/rakazo-coding`, etc.) computed via Cognitive Priority Matrix in `RakazoFreePolicyEngine`.
  3. **Level 3 (Real Execution Resolution)**: Live provider (`mistral`, `groq`, `qwen`, `deepseek`) and model resolved dynamically per turn by OmniRoute.
- **Zero Static Coupling Guarantee**: Rakazo contains no enum of upstream free models. Adding, replacing, or removing models in OmniRoute requires **zero code changes in Rakazo**, **zero database migrations**, and **zero service redeployments**.
- **Upstream Baseline Preservation**: Upstream files are treated as upstream baseline. All customizations reside in dedicated additive modules (`packages/adapters/src/`, `packages/contracts/src/`, `packages/db/src/repos.ts`, `apps/web/src/pages/`).
- **Dual-Path Inference Compatibility**:
  - `BotInferenceConfig.mode` defaults to `"premium"`. Existing bots continue executing on `openai/gpt-oss-120b` via OpenRouter with zero configuration migration required.
  - Adding `"free"` mode routes requests through `OmniRouteInferenceTransport` using open-weights live combos (`combo/rakazo-*`).

---

### Pillar 2: Canonical MCP Runtime & Zero-Cost Double Barrier

Rakazo provides a unified, sovereign Model Context Protocol (MCP) agentic execution runtime and a **strictly free inference gateway** with absolute zero-cost enforcement:

1. **Pluggable Inference Transport Layer (`InferenceTransport`)**:
   - `OmniRouteInferenceTransport`: Routes to sovereign OmniRoute gateway targeting high-availability combos (`combo/rakazo-*`).
   - `PiAiInferenceTransport`: Routes to OpenRouter (`openai/gpt-oss-120b`).
2. **Canonical Turn Loop (`CanonicalAgentRuntime`)**:
   - Both Free and Premium tracks execute the exact same canonical agentic loop.
   - **MCP Tool Calling**: Full tool call parsing, permission checks, execution, and model feedback loops.
   - **Semantic Result Compaction (`compactToolResult`)**: Shrinks heavy tool returns (shell outputs, file trees, GitHub diffs, Notion JSON) before adding them to conversational memory.
   - **Anti-Loop Circuit Breakers**:
     - `MAX_TOOL_ITERATIONS_PER_TURN = 25`: Terminates runaway turns after 25 tool execution steps.
     - Redundancy Detector (`evaluateToolCallGuard`): Blocks identical repeated calls with the same arguments (maximum 3 repetitions allowed).
   - **Session Affinity**: Deterministic 32-bit FNV-1a hash key `computeSessionAffinityKey` injected as `x-session-id` header to maximize KV cache hit rates on Blocks A+B.
3. **Double Barrier Zero-Cost Architecture ($0.0000)**:
   - **Barrier 1 (Local Policy Engine - `RakazoFreePolicyEngine`)**: Pre-dispatch check enforcing approved provider allowlist (`omniroute`, `combo`, `meta-llama`, `mistralai`, `qwen`, `deepseek`, `google`), model format, and price verification ($0.000000). Commercial or positive-cost routes are rejected immediately.
   - **Barrier 2 (Transport Response Verification - `OmniRouteInferenceTransport`)**: Real-time inspection of HTTP response headers (`x-omniroute-response-cost`, `x-omniroute-cost`) and streaming chunks. If cost > $0.00 is detected, the stream is aborted immediately.
4. **Strict Fail-Closed (Never-Paid Fallback)**:
   - If free capacity is exhausted, rate-limited, or unavailable, execution terminates with the sanitized message `"Capacité gratuite temporairement indisponible"`.
   - Free bots **NEVER** fall back to paid OpenRouter or commercial routes under any circumstances.
5. **Subagent Confinement & Inference Mode Inheritance**:
   - Subagents inherit the parent bot's inference mode (`parent === "free"` → `subagent === "free"`). Privilege escalation attempts to `"premium"` are vetoed.
   - Subagent nesting is strictly capped at **Depth 1** (`SUBAGENT_MAX_DEPTH = 1`). Subagents cannot spawn further subagents.
   - Delegation tools (`run_subagent`, `spawn_subagent`, `delegate_task`, `spawn_bot`, `archive_bot`, `delete_bot`) are stripped from child tool catalogs.
   - Subagent prompt tokens are capped at **8,192 tokens** (`SUBAGENT_TOKEN_BUDGET_CEILING = 8192`).
6. **Prompt Compilation MCP Immutability Invariant**:
   - Prompt compilers (`compilePromptLevel1Deterministic` and Level 2 OpenRouter) are formatters and optimizers. They are strictly prohibited from mutating, adding, or removing MCP tool configurations.

---

### Pillar 3: Strict Zero-Secret Masking & Sanitization

To protect users against accidental token leaks in logs, telemetry, or user interfaces, all tool errors and outgoing outputs pass through a centralized redaction layer:

1. **Centralized Sanitization Pipeline (`sanitizeToolError`)**:
   All error messages, tool outputs, and LLM payloads are processed with automated regex sanitization in `packages/adapters/src/enterprise-tools.ts`:
   - GitHub Personal Access Tokens: `ghp_[a-zA-Z0-9_]+` → `ghp_[redacted]`, `github_pat_[a-zA-Z0-9_]+` → `github_pat_[redacted]`.
   - Notion API Keys: `secret_[a-zA-Z0-9_]+` → `secret_[redacted]`, `ntn_[a-zA-Z0-9_]+` → `ntn_[redacted]`.
   - Postiz API Keys: `pk_[a-zA-Z0-9_]+` → `pk_[redacted]`.
   - Novamira API Keys: `nova_[a-zA-Z0-9_]+` → `nova_[redacted]`.
   - n8n API Keys: `n8n_api_[a-zA-Z0-9_]+` → `n8n_api_[redacted]`.
   - Cloudflare Tokens: `cf_token_[a-zA-Z0-9_-]+` → `cf_token_[redacted]`, `cfat_[a-zA-Z0-9_-]+` → `cfat_[redacted]`.
   - OpenRouter / Anthropic / OpenAI Keys: `sk-or-*`, `sk-ant-*`, `sk-*` → `sk-[redacted]`.
   - OmniRoute Gateway Keys: `sk-omniroute-*` → `sk-[redacted]`.
   - Database Connection Strings: `postgres(ql)?://user:password@host` → `postgres://user:[redacted]@host`.
   - Authorization Headers: `Bearer [token]`, `Basic [token]` → `Bearer [redacted]`, `Basic [redacted]`.
2. **Runtime Secrets Guard (`@rakazo/core/secrets-guard.ts`)**:
   - `isDevSecretAllowed()` permits fallback placeholders during `development` and `test` environments.
   - In `production`, any occurrence of default placeholders (`dev-secret-change-me-please-32chars`) immediately throws a fast-fail startup exception.

---

### Pillar 4: 19-Package Monorepo Topology Map

The Rakazo repository is structured into 19 discrete packages orchestrated by **Turborepo 2** and **pnpm workspaces**:

```
                                ┌───────────────────────────┐
                                │       rakazo (root)       │
                                └─────────────┬─────────────┘
                                               │
               ┌───────────────────────────────┴──────────────────────────────┐
               │                                                              │
      ┌────────▼────────┐                                            ┌────────▼────────┐
      │  APPLICATIONS   │                                            │ SHARED PACKAGES │
      ├─────────────────┤                                            ├─────────────────┤
      │ apps/api        │ (Fastify/Hono Backend REST & RPC)          │ @rakazo/adapter-kit
      │ apps/desktop    │ (Electron Desktop App)                     │ @rakazo/adapters│
      │ apps/mobile     │ (React Native / Expo Mobile App)           │ @rakazo/auth    │
      │ apps/web        │ (React 18 + Tailwind v4 Web App)           │ @rakazo/chat-ui │
      │ apps/worker     │ (BullMQ Background Worker & Scheduler)     │ @rakazo/contracts
      │ apps/www        │ (Astro Marketing & Docs Portal)            │ @rakazo/core    │
      └─────────────────┘                                            │ @rakazo/db      │
               │                                                     │ @rakazo/memory  │
               │                   ┌───────────────────────────┐     │ @rakazo/testkit │
               └──────────────────►│       INFRASTRUCTURE      │◄────│ @rakazo/ui-tokens
                                   ├───────────────────────────┤     │ @rakazo/ui-web  │
                                   │ infra/sandboxes/supervisor│     └─────────────────┘
                                   └───────────────────────────┘
```

#### Monorepo Directory & Role Registry

| # | Package Name | Workspace Path | Role & Responsibilities |
|---|--------------|----------------|--------------------------|
| 1 | `rakazo` | Root (`/`) | Root workspace orchestration, `turbo.json`, `pnpm-workspace.yaml`, Biome config. |
| 2 | `@rakazo/api` | `apps/api` | Fastify & Hono HTTP backend, oRPC endpoints, bot lifecycle, auth routes, SSE message streaming. |
| 3 | `@rakazo/desktop` | `apps/desktop` | Electron desktop wrapper hosting the web UI with native window controls. |
| 4 | `@rakazo/mobile` | `apps/mobile` | React Native & Expo cross-platform iOS/Android mobile client. |
| 5 | `@rakazo/web` | `apps/web` | Primary React 18 Web UI, chat threads, intelligence selectors, tag chips, responsive drawer, turn execution badges. |
| 6 | `@rakazo/worker` | `apps/worker` | Background task worker, Graphile / BullMQ job runner, routine scheduler, secret masking. |
| 7 | `@rakazo/www` | `apps/www` | Astro-powered public landing page, technical documentation, and release notes. |
| 8 | `@rakazo/adapter-kit` | `packages/adapter-kit` | Abstract interfaces for agent adapters, sandbox providers, and storage stores. |
| 9 | `@rakazo/adapters` | `packages/adapters` | `CanonicalAgentRuntime`, `OmniRouteInferenceTransport`, `PiAiInferenceTransport`, `RakazoFreePolicyEngine`, prompt compilers, loop guards, sovereign MCP connectors. |
| 10 | `@rakazo/auth` | `packages/auth` | BetterAuth authentication integration, session tokens, user verification. |
| 11 | `@rakazo/chat-ui` | `packages/chat-ui` | Markdown renderers, streaming message blocks, agent status badges, copy tools. |
| 12 | `@rakazo/contracts` | `packages/contracts` | Canonical Zod schemas (`InferenceModeSchema`, `BotInferenceConfigSchema`), TypeScript types, RPC interfaces, MCP tool catalogs. |
| 13 | `@rakazo/core` | `packages/core` | Domain business logic, secrets guards, cron parsers, audio/speech processing. |
| 14 | `@rakazo/db` | `packages/db` | Prisma 7 ORM client, Repositories (`repos.ts`), migrations (`0015_free_intelligence_gateway`), SQL telemetry (`PromptExecutionLog`). |
| 15 | `@rakazo/memory` | `packages/memory` | Supermemory client, vector indexing, working memory retrieval, and document store. |
| 16 | `@rakazo/testkit` | `packages/testkit` | E2E test harness, Testcontainers PostgreSQL, Playwright helpers, mock factories. |
| 17 | `@rakazo/ui-tokens` | `packages/ui-tokens` | Design tokens, color palettes, spacing primitives, CSS variable bindings. |
| 18 | `@rakazo/ui-web` | `packages/ui-web` | Headless & styled Web UI components (Radix primitives, modals, dropdowns, inputs). |
| 19 | `@rakazo/sandbox-supervisor` | `infra/sandboxes/supervisor` | Docker container manager, desktop screen lease allocator, execution sandbox runner. |

---

### Pillar 5: Bot Deletion Cascade Invariants

When a bot is archived or deleted (implemented in `destroyBot` / `child-bots.ts`), the platform enforces a strict **Two-Phase Complete Lifecycle Termination**:

1. **Phase 1: Atomic Database Cascade**:
   - Utilizing PostgreSQL relational integrity and Prisma `onDelete: Cascade` constraints in `schema.prisma`:
     - All related `threads`, `messages`, `events`, `tasks`, `runs`, `attempts`, and `external_effects` are deleted automatically.
     - Scheduled `routines`, `taught_skills`, `bot_skills`, `agent_homes`, `browser_profiles`, `artifacts`, and `computer_execution_leases` are purged.
     - Telemetry records (`PromptExecutionLog`) are disassociated via `onDelete: SetNull` to preserve analytics.
     - An immutable audit row is recorded in `bot_deletions`.
2. **Phase 2: Physical Storage & Sandbox Container Teardown**:
   - Active sandbox container runs are halted immediately (`deps.jobs.cancel(runJobKey(run.id))`).
   - The dedicated container is destroyed via `deps.sandbox.destroy(...)`.
   - Shared screen leases are released (`releaseTeamComputerScreen`).
   - Filesystem directories on disk are recursively purged (`/data/homes/<botId>`, `/data/desktop-computers/<botId>`, artifacts).

---

### Pillar 6: Verification, Triple Coherence & Quality Gates

Quality is enforced through automated static analysis, type checking, test execution, and CI/CD gating:

#### 1. Triple Coherence Formal Invariant
$$\mathbf{OmniRoute\ Response\ Headers} \equiv \mathbf{PromptExecutionLog\ (SQL)} \equiv \mathbf{WebUI\ Rendered\ Metadata}$$

#### 2. Canonical Verification Commands

| Action | Command | Gate Requirement |
|---|---|---|
| **Type Check All Packages** | `pnpm check`<br>`pnpm exec turbo check --force` | **0 errors, 0 warnings** across all 19 packages. |
| **Run All Test Suites** | `pnpm test`<br>`vitest run` | **100% test pass rate** (currently **2,714 tests passing**, 0 failures across 190 test files). |
| **Triple Coherence E2E** | `pnpm vitest run apps/web/src/pages/e2e-omniroute-triple-coherence.test.tsx` | **100% pass rate (15/15 tests)** across all 5 profiles and dynamic failover. |
| **OmniRoute 5-Tier E2E Suite** | `pnpm vitest run packages/testkit/src/tests/tier1-features-r1-r6.e2e.test.ts packages/testkit/src/tests/tier2-boundary-r1-r6.e2e.test.ts packages/testkit/src/tests/tier3-pairwise-r1-r6.e2e.test.ts packages/testkit/src/tests/tier4-real-world-scenarios.e2e.test.ts packages/testkit/src/tests/tier5-adversarial-stress.e2e.test.ts` | **100% pass rate (193/193 tests across Tiers 1–5)**. |
| **Persistence & Repositories** | `pnpm vitest run packages/db/src/repos.test.ts packages/db/src/challenger-m1-persistence-empirical.test.ts apps/api/src/router-bots-inference.test.ts` | **100% pass rate**. |
| **Contracts & Policy Unit Tests** | `pnpm vitest run packages/contracts/src/omniroute-contracts.test.ts packages/adapters/src/omniroute-adapter.test.ts packages/adapters/src/free-policy-engine.test.ts packages/adapters/src/subagent-inheritance.test.ts` | **100% pass rate**. |
| **Prisma Client Generation** | `pnpm db:generate` | Prisma client generated in `packages/db/src/generated/prisma`. |
| **Database Migrations** | `pnpm db:migrate` | Migrations applied cleanly to target PostgreSQL database. |
| **Linting & Code Style** | `pnpm lint` | Biome static analysis with 0 errors. |
| **Automated Formatting** | `pnpm format` | Biome code formatting writeback. |

#### 3. CI/CD Upstream Sync Gate (`.github/workflows/sync-upstream.yml`)
- Scheduled cron and dispatch workflow fetches upstream updates from `elie222/rakazo`.
- Mandatory test step: `pnpm exec turbo check --force && pnpm test`.
- **Zero-Regression Gate**: If TypeScript compilation or any Vitest suite fails after merge, the merge is **immediately aborted** (`git merge --abort`), and an alert Pull Request is automatically generated. No broken code is ever pushed to `origin main`.

---

## 3. Reference Documentation & Guides

For deeper implementation details, consult the canonical documentation in the root and `docs/`:
- [`RAKAZO_ARCHITECT_HANDOFF_OMNIROUTE_PRODUCTION_EXCELLENCE_FINAL.md`](RAKAZO_ARCHITECT_HANDOFF_OMNIROUTE_PRODUCTION_EXCELLENCE_FINAL.md): Authoritative Master Passation & Production Excellence Certification Artifact.
- [`RAKAZO_ARCHITECT_HANDOFF_OMNIROUTE_COHERENCE_AND_OBSERVABILITY.md`](RAKAZO_ARCHITECT_HANDOFF_OMNIROUTE_COHERENCE_AND_OBSERVABILITY.md): Baseline architectural passation & certification artifact.
- [`RAKAZO_MASTER_BLUEPRINT_CURRENT.md`](RAKAZO_MASTER_BLUEPRINT_CURRENT.md): Master architectural specification & platform blueprint.
- [`docs/OMNIROUTE_DEPLOYMENT.md`](docs/OMNIROUTE_DEPLOYMENT.md): Authoritative production runbook for OmniRoute on Coolify PaaS (App 21).
- [`docs/ENVIRONMENT_SETUP.md`](docs/ENVIRONMENT_SETUP.md): Comprehensive environment variable taxonomy and onboarding guide.
- [`TEST_INFRA.md`](TEST_INFRA.md): 4-Tier test infrastructure & methodology.
- [`TEST_READY.md`](TEST_READY.md): Master test certification report.
- [`docs/computer-runtime.md`](docs/computer-runtime.md): Architecture of computer sandboxes, supervisor protocols, and screen leases.
- [`docs/self-host.md`](docs/self-host.md): Guide for production self-hosting with Docker Compose and Coolify PaaS.
- [`docs/performance.md`](docs/performance.md): Latency, prefix caching, and token optimization benchmarks.
