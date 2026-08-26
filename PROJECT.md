# Project: Rakazo Major Iteration (R1 - R5)

## Architecture
Rakazo is a high-performance sovereign AI agent platform structured as a Turborepo + pnpm monorepo consisting of 19 packages:
- **Core Applications** (`apps/`): `api` (Fastify / tRPC / REST router), `desktop` (Tauri desktop client), `mobile` (React Native / Expo), `web` (Next.js 15 App Router chat & bot UI), `worker` (Background job runner), `www` (Marketing & documentation).
- **Core Packages** (`packages/`):
  - `contracts`: Shared Zod schemas, types, prompt compilation schemas, API contracts.
  - `adapters`: Pi Runtime, OpenRouter / LiteLLM integrations, prompt compilation service, sandbox executors, tool runners.
  - `adapter-kit`: Base MCP adapter interfaces and sandbox protocols.
  - `db`: Prisma ORM schema, migrations, PostgreSQL client, telemetry logging models.
  - `auth`: Authentication and session management.
  - `chat-ui`: Reusable chat components and message stream renderers.
  - `core`: Agent execution graphs, message orchestration, state machines.
  - `memory`: Working memory, embeddings, vector indexing.
  - `testkit`: E2E test harness, Testcontainers, Playwright helpers, mock factories.
  - `ui-tokens`: Tailwind theme design tokens.
  - `ui-web`: Shared web design system components.
- **Infrastructure Sandboxes** (`infra/`): `infra/sandboxes/supervisor`.

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| F1 | Subagent L1 Prompt Compilation | Integrate deterministic L1 prompt compilation (`compilePromptLevel1Deterministic`) in `executeSubagent` (`packages/adapters/src/pi-runtime.ts`), enforcing depth max 1, `DELEGATION_TOOL_NAMES` prohibition, and 8,192 token ceiling. | M1 | User Request R1 |
| F2 | Upstream Sync Security Gate | Replace `.github/workflows/sync-upstream.yml` with workflow that installs dependencies, executes `pnpm exec turbo check --force && pnpm test` after merge, aborts merge on failure, and creates alert PR on `upstream-sync-conflict`. | M2 | User Request R2 |
| F3 | SQL Telemetry & Prefix Caching | Add `PromptExecutionLog` model to `packages/db/prisma/schema.prisma` with indexes and relations; add migration `0014_prompt_execution_logs`; implement and export non-blocking async logger `recordPromptExecutionLogAsync` and integrate across router and runtime. | M3 | User Request R3 |
| F4 | Documentation Standardization | Rewrite `AGENTS.md` (6 core pillars, 19-package map, MCP invariants, bot deletion cascade, verification) and create comprehensive `docs/ENVIRONMENT_SETUP.md` (all 43+ env vars categorized). | M4 | User Request R4 |
| F5 | E2E Opaque-Box Test Suite (Tiers 1-4) | Comprehensive E2E test suite covering feature coverage (T1), boundary & corner cases (T2), pairwise cross-feature combinations (T3), and real-world application scenarios (T4). | Track E2E | User Request R5 & Test Infra |
| F6 | Master Blueprint & Tier 5 Adversarial Hardening | Pass 100% E2E tests, execute Tier 5 adversarial stress testing, update `RAKAZO_MASTER_BLUEPRINT_CURRENT.md` to v2.3.0-enterprise with zero regressions. | M5 | User Request R5 |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| E2E | E2E Testing Suite Track | Design and implement 4-Tier test suite (T1-T4) covering R1-R5, publish TEST_READY.md | none | IN_PROGRESS |
| M1 | Subagent L1 Compilation & Runtime | `packages/adapters/src/pi-runtime.ts` + prompt compilation tests | none | PLANNED |
| M2 | Upstream Sync Security Gate | `.github/workflows/sync-upstream.yml` | none | PLANNED |
| M3 | SQL Telemetry & Prefix Caching | `packages/db/prisma/schema.prisma` + migration `0014` + `recordPromptExecutionLogAsync` + wiring | none | PLANNED |
| M4 | Standardization & Handover Docs | `AGENTS.md` + `docs/ENVIRONMENT_SETUP.md` | none | PLANNED |
| M5 | Final E2E Pass & Blueprint Update | 100% test pass on T1-T4 + Tier 5 Adversarial Hardening + `RAKAZO_MASTER_BLUEPRINT_CURRENT.md` | E2E, M1, M2, M3, M4 | PLANNED |

## Interface Contracts

### 1. `executeSubagent` & `compilePromptLevel1Deterministic` (`@rakazo/adapters`)
- Input: `args.name`, `args.task`, `args.instructions` (extra).
- Processing:
  - Compose `rawInstruction`: subagent base role/identity + rules + `task` + `extra`.
  - Invoke `compilePromptLevel1Deterministic({ rawInstruction, model: host.model, executionLevel: "level_1_deterministic" })`.
  - System prompt assigned to `compiledPrompt.compiledInstruction` (5 Markdown sections: `# Role & Identity`, `## Core Mission`, `## Operational Rules & Constraints`, `## Output Format & Deliverables`, `## Error Handling & Edge Cases`).
- Invariants:
  - `host.depth > 0` returns `"Subagents cannot nest further."`.
  - Tools filtered via `!DELEGATION_TOOL_NAMES.has(tool.name)`.
  - `maxTokens` bounded to max 8,192 (`Math.min(Math.max(options?.maxTokens ?? 8192, 1), 8192)`).

### 2. Upstream Sync Security Gate (`.github/workflows/sync-upstream.yml`)
- Trigger: `schedule` (cron) and `workflow_dispatch`.
- Steps:
  1. Checkout repository with full fetch depth.
  2. Setup Node.js 22 & pnpm 9.
  3. Install dependencies (`pnpm install --frozen-lockfile`).
  4. Attempt `git merge upstream/main`.
  5. If merge succeeds: run `pnpm db:generate && pnpm exec turbo check --force && pnpm test`.
  6. If test gate passes: `git push origin main`.
  7. If test gate fails or merge conflicts: `git merge --abort` or `git reset --hard HEAD~1`, checkout `upstream-sync-conflict`, and create alert PR with logs.

### 3. `PromptExecutionLog` & `recordPromptExecutionLogAsync` (`@rakazo/db`)
- Prisma Model `PromptExecutionLog`:
  ```prisma
  model PromptExecutionLog {
    id              String    @id @default(cuid())
    botId           String?
    executionId     String?
    provider        String
    model           String
    levelUsed       String    // "level_1_deterministic" | "level_2_openrouter"
    promptTokens    Int       @default(0)
    completionTokens Int      @default(0)
    cachedTokens    Int       @default(0)
    cacheHitRatio   Float     @default(0.0)
    durationMs      Int       @default(0)
    costEstimatedUsd Float    @default(0.0)
    createdAt       DateTime  @default(now())

    bot             Bot?      @relation(fields: [botId], references: [id], onDelete: SetNull)

    @@index([botId])
    @@index([createdAt])
    @@index([model])
    @@map("prompt_execution_logs")
  }
  ```
- Async Non-blocking Helper:
  ```typescript
  export function recordPromptExecutionLogAsync(
    prisma: PrismaClient,
    data: PromptExecutionLogInput
  ): void {
    void prisma.promptExecutionLog.create({ data }).catch((err) => {
      // Non-blocking logger: logs warning, never throws to caller
    });
  }
  ```

## Code Layout
- `packages/adapters/src/pi-runtime.ts` — Subagent execution & deterministic L1 compile integration.
- `packages/adapters/src/prompt-compiler.ts` — Deterministic L1 prompt compilation logic.
- `packages/adapters/src/__tests__/subagent-prompt-compilation.test.ts` — Subagent prompt compilation unit tests.
- `.github/workflows/sync-upstream.yml` — Upstream synchronization workflow with CI test gate.
- `packages/db/prisma/schema.prisma` — Database schema with `PromptExecutionLog`.
- `packages/db/prisma/migrations/0014_prompt_execution_logs/migration.sql` — Additive migration.
- `packages/db/src/telemetry.ts` — Non-blocking async telemetry persistence.
- `AGENTS.md` — Autonomous agent operating manual and 6 architectural pillars.
- `docs/ENVIRONMENT_SETUP.md` — 43+ environment variables documentation and setup guide.
- `RAKAZO_MASTER_BLUEPRINT_CURRENT.md` — Master platform architecture blueprint v2.3.0-enterprise.
