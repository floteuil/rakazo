# Project: Rakazo — Itération d'Excellence, Hardening, Performance, QA & Documentation

## Architecture
- **Monorepo Structure**: Turborepo 2 + pnpm workspaces (19 packages).
  - `apps/web`: React / Next.js / Vite Web Application.
  - `apps/api`: Fastify / Node.js Backend API.
  - `apps/worker`: Asynchronous background jobs worker.
  - `packages/pi-runtime`: LLM runtime integration, agent loop, subagent depth 1 guardrails.
  - `packages/adapters`: PromptCompilerService (deterministic/LLM), 4-block cache assembly, loop guards, enterprise tools & secret sanitizer.
  - `packages/contracts`: Shared TypeScript schemas (Zod), domain interfaces, MCP catalog & immutability invariants.
  - `packages/db`: Prisma ORM 7+, PostgreSQL schema, async non-blocking telemetry (`PromptExecutionLog`).
  - `packages/chat-ui`: Responsive React chat interface, composer (touch >= 44px, safe area insets), PromptCompilerModal.
  - `packages/testkit`: Test harnesses, mocks, integration helpers.

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | PromptCompilerService Robustness | Fast-path deterministic Level 1, LLM Level 2 with AbortController (15s timeout), deterministic fallbacks, secret-safe errors, Zod validation | M1 | R1 / Survey 1 |
| 2 | Subagent Anti-Loop & Depth Guards | `buildSubagentPrompt` deterministic 5 sections, `executeSubagent` depth 1 strict, delegation tool exclusion, 8192 token limit, 25 steps / 3 repetitive calls circuit breaker | M1 | R1 / Survey 1 |
| 3 | 4-Block Cache Byte Stability | `assemble4BlockCachePrompt` with invariant Blocs A+B (no dynamic timestamps, sorted skills), volatile Blocs C+D, session affinity key | M1 | R1 / Survey 1 |
| 4 | Upstream Sync Workflow Idempotence | `.github/workflows/sync-upstream.yml` with `pnpm install --frozen-lockfile`, secure branch merge, CI security gate, alert PR generation on conflict/failure | M2 | R2 / Survey 2 |
| 5 | SQL Telemetry Async & DB Resilience | `PromptExecutionLog` model, `recordPromptExecutionLogAsync` fire-and-forget, non-blocking sync void return, catch non-fatal errors | M3 | R3 / Survey 1 |
| 6 | Secret Sanitization Without False Positives | `sanitizeToolError` covering 12 token families (GitHub, Notion, Postiz, Novamira, n8n, Cloudflare, OpenRouter, Anthropic, OpenAI, PostgreSQL, Bearer/Basic) | M3 | R3 / Survey 1 |
| 7 | MCP Least Privilege & Immutability | 40 sovereign MCP tools immutable across prompt compilation, system directives, subagent execution | M3 | R3 / Survey 1 & 2 |
| 8 | Responsive WebUI Multi-Screen Ergonomics | 320px, 360px, 375px, 390px, 430px, 768px, 1024px, 1440px+ viewport compliance, touch targets >= 44px, `env(safe-area-inset-bottom)`, iOS 16px input zoom prevention | M4 | R4 / Survey 3 |
| 9 | PromptCompilerModal Comparative UX | Before/After split & tab view, diff comparison, mobile modal responsiveness, copy/apply actions | M4 | R4 / Survey 3 |
| 10 | Monorepo Zero TypeScript Error Gate | `pnpm exec turbo check --force` passing with 0 errors on all 19 packages | M5 | R5 / Survey 3 |
| 11 | Complete Test Suite Pass (>= 1709 tests) | `pnpm test` passing 100% of tests (>= 1709 tests, 0 failures, 0 fake greens) | M5 | R5 / Survey 3 |
| 12 | Master Authority Documentation | Deliver `RAKAZO_MASTER_BLUEPRINT_CURRENT.md`, `RAKAZO_ARCHITECT_HANDOFF_POST_EXCELLENCE_ITERATION.md`, and `ITERATION_EXCELLENCE_REPORT.md` | M5 | R5 / Survey 3 |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | AI Runtime, Prompt Compiler & Subagents Hardening | Features 1, 2, 3: `PromptCompilerService`, `buildSubagentPrompt`, `executeSubagent`, `assemble4BlockCachePrompt` | none | DONE |
| M2 | Upstream Sync Workflow Hardening | Feature 4: `.github/workflows/sync-upstream.yml`, frozen lockfile, CI gates, alert PR | none | DONE |
| M3 | SQL Telemetry & MCP Security Hardening | Features 5, 6, 7: `recordPromptExecutionLogAsync`, `sanitizeToolError`, MCP immutability | none | DONE |
| M4 | Responsive WebUI Ergonomics & Composer Hardening | Features 8, 9: `@rakazo/chat-ui`, composer touch targets, safe areas, PromptCompilerModal | none | DONE |
| M5 | Monorepo QA Gate (turbo check + >= 1709 tests) & Master Documentation | Features 10, 11, 12: `turbo check`, `pnpm test`, 3 Master Documentation artifacts | M1, M2, M3, M4 | DONE |

## Interface Contracts
### PromptCompilerService ↔ Chat UI / API
- `compile(input: PromptCompileInput): Promise<PromptCompileOutput>`
- `input`: `{ rawInstruction: string, botName?: string, botTitle?: string, level?: PromptCompilationLevel, existingMetadata?: Record<string, unknown> }`
- `output`: `{ compiledInstruction: string, levelUsed: PromptCompilationLevel, explanation?: string, telemetry?: PromptCacheTelemetry }`

### Pi Runtime ↔ Subagents
- `executeSubagent(host: AgentHost, executionId: string, args: SubagentArgs): Promise<string>`
- Constraints: `host.depth == 0`, `maxTokens <= 8192`, `tools excluding DELEGATION_TOOL_NAMES`, max 25 tool iterations / 3 consecutive redundant calls.

### Telemetry ↔ PostgreSQL DB
- `recordPromptExecutionLogAsync(prisma: PrismaClient, data: PromptExecutionLogInput): void`
- Constraints: synchronous `void` return, promise fire-and-forget, internal catch with non-fatal warning.

## Code Layout
- `packages/adapters/src/`:
  - `prompt-compiler.ts`: PromptCompilerService implementation
  - `pi-runtime.ts`: Pi runtime adapter, subagent execution
  - `prefix-caching.ts`: 4-block cache prompt assembly
  - `enterprise-tools.ts`: Tool execution & sanitizeToolError
  - `loop-guards.ts`: Anti-loop & circuit breakers
- `packages/contracts/src/`:
  - `prompt-compiler.ts`: Zod schemas & contract validation
  - `mcp-catalog.ts`: Sovereign MCP catalog & immutability verifier
- `packages/db/src/`:
  - `telemetry.ts`: Async SQL telemetry recording
- `packages/chat-ui/src/`:
  - `PromptCompilerModal.tsx`: Comparative modal
  - `Shell.tsx`: Responsive layout shell
  - `MessageList.tsx`, `Composer.tsx`: Chat components
- `.github/workflows/`:
  - `sync-upstream.yml`: Upstream sync workflow
- Root / Docs:
  - `RAKAZO_MASTER_BLUEPRINT_CURRENT.md`
  - `RAKAZO_ARCHITECT_HANDOFF_POST_EXCELLENCE_ITERATION.md`
  - `ITERATION_EXCELLENCE_REPORT.md`
