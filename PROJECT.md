# Project: Rakazo Enterprise MCP & Web Tools Integration

## Architecture
Rakazo is a full-stack multi-agent platform orchestrated via Turborepo (`pnpm@9.15.0`) and TypeScript NodeNext.
- **Runtime Execution**: `packages/adapters/src/executor.ts` dynamically resolves tools per turn from `builtinAgentTools` (`packages/adapters/src/builtin-tools.ts`) and discovered connectors (`deps.connector.discoverTools`), passing them to `PiAgentRuntime` (`packages/adapters/src/pi-runtime.ts`).
- **Web Intelligence**:
  - `web_search`: Connected to internal SearXNG metasearch instance (`http://searxng-qkcs0oo0owk4s8cw8wgk8ogc:8080` or `SEARXNG_URL`), formatting structured JSON results with Markdown citations for LLM grounding.
  - `web_scrape`: Resilient HTML extractor with boilerplate/script removal, clean Markdown conversion, safe size bounds, and optional Scraperr delegation (`SCRAPERR_URL`).
- **Enterprise MCP Connectors**: Native first-class tool suite in `packages/adapters/src/enterprise-tools.ts` covering:
  - **GitHub** (`github_search_repos`, `github_get_file_contents`, `github_list_issues`, `github_create_issue`, `github_get_pull_request`, `github_create_issue_comment`)
  - **Notion** (`notion_search`, `notion_get_page`, `notion_query_database`, `notion_create_page`, `notion_update_page`)
  - **Postiz** (`postiz_list_integrations`, `postiz_create_post`, `postiz_list_posts`)
  - **WordPress / Novamira** (`wordpress_list_posts`, `wordpress_get_post`, `wordpress_create_post`, `wordpress_update_post`, `novamira_execute_ability`)
  - **n8n** (`n8n_trigger_webhook`, `n8n_list_workflows`, `n8n_get_execution`)
  - **Cloudflare** (`cloudflare_list_zones`, `cloudflare_list_dns_records`, `cloudflare_create_dns_record`, `cloudflare_purge_cache`)
- **Security & Secret Redaction**: Secrets passed via Coolify Docker environment variables, encrypted at rest (`EncryptedSecretStore`), registered in `runSecrets`, and sanitized in real-time by `createStreamingRedactor`, `redactSecrets`, and `sanitizeError`.
- **Infrastructure & Deployment**: Multi-service `docker-compose.yaml` deployed on Coolify PaaS (`https://agents.workspacegroupefloteuil.eu`) with Traefik SSL (Let's Encrypt), HSTS, gzip, rate limiting, and network isolation preserving other VPS applications (SearXNG, Scraperr, Traefik, Postiz, Odoo, n8n).

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | `web_search` Engine & Citations | SearXNG connector formatting queries, categories, language, structured results, and Markdown citations | M1 | ORIGINAL_REQUEST §R1 |
| 2 | `web_scrape` Resilient Extractor | Safe HTML/Markdown scraper with boilerplate stripping, size bounds, and Scraperr delegation | M1 | ORIGINAL_REQUEST §R1 |
| 3 | Default Tool Activation | Expose `web_search` and `web_scrape` in `builtinAgentTools` for 100% of agents & subagents automatically | M1 | ORIGINAL_REQUEST §R1 |
| 4 | GitHub Connector Tools | Search repos, read files, list/create issues, get PRs, add issue comments | M2 | ORIGINAL_REQUEST §R2 |
| 5 | Notion Connector Tools | Search workspace, get page, query databases, create/update pages | M2 | ORIGINAL_REQUEST §R2 |
| 6 | Postiz Connector Tools | List social channels, schedule/create posts, list posts | M2 | ORIGINAL_REQUEST §R2 |
| 7 | WordPress / Novamira Tools | Manage articles/posts, categories, and execute Novamira MCP abilities | M2 | ORIGINAL_REQUEST §R2 |
| 8 | n8n Connector Tools | Trigger webhooks, list workflows, inspect executions | M2 | ORIGINAL_REQUEST §R2 |
| 9 | Cloudflare Connector Tools | List zones, DNS records, create DNS records, purge cache | M2 | ORIGINAL_REQUEST §R2 |
| 10 | Real-Time Secret Redaction | Automatically register & mask all enterprise API tokens in memory and event streams | M2 | ORIGINAL_REQUEST §R2 |
| 11 | Environment & Coolify Config | Expose environment variables in `docker-compose.yaml`, `apps/api/src/env.ts`, `apps/worker/src/index.ts` | M3 | ORIGINAL_REQUEST §R2, §R3 |
| 12 | TypeScript Type Safety & Lint | Fix `ModelSettingsOverlay.tsx` TS enum error (`selected?.auth === "both"`) and Biome formatting | M3 | Survey Explorer 3 |
| 13 | Comprehensive E2E Test Suite | 4-tier opaque-box test suite for search, scraping, MCP tools, and runtime stability | M4 (E2E Track) | ORIGINAL_REQUEST §Acceptance Criteria |
| 14 | Adversarial Hardening (Tier 5) | White-box stress testing, edge cases, error injection, token leak fuzzing | M4 | Project Pattern Phase 2 |
| 15 | Git Versioning & Deployment | Commit to `floteuil/rakazo` `main` branch, build verification (`pnpm build`), and Coolify validation | M5 | ORIGINAL_REQUEST §R3 |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| E2E | E2E Testing Suite Track | Design test infra (`TEST_INFRA.md`) and implement Tiers 1-4 tests (`TEST_READY.md`) | none | IN_PROGRESS |
| M1 | Web Search & Web Scrape Tools | `web-search.ts`, `web-scrape.ts`, `builtin-tools.ts`, `pi-runtime.ts`, `executor.ts` | none | PLANNED |
| M2 | Enterprise MCP Connectors | `enterprise-tools.ts`, `builtin-tools.ts`, `pi-runtime.ts`, `executor.ts`, unit tests | M1 | PLANNED |
| M3 | Environment & Config Wiring | `apps/api/src/env.ts`, `apps/worker/src/index.ts`, `docker-compose.yaml`, TS fix, Biome | M2 | PLANNED |
| M4 | Final E2E Pass & Hardening | Phase 1 (100% pass Tiers 1-4) + Phase 2 (Adversarial Tier 5 coverage hardening) | E2E, M3 | PLANNED |
| M5 | Build, Git Versioning & Deploy | `pnpm build`, Git commit/push on `main` branch of `floteuil/rakazo`, Coolify deployment check | M4 | PLANNED |

## Interface Contracts
### `web_search` Tool Interface
- **Input**: `{ query: string, categories?: string, language?: string, time_range?: string, max_results?: number }`
- **Output**: `{ query: string, count: number, results: Array<{ title: string, url: string, snippet: string, engine?: string, publishedDate?: string | null }>, formattedCitations: string }`

### `web_scrape` Tool Interface
- **Input**: `{ url: string, selector?: string, maxLength?: number }`
- **Output**: `{ url: string, title?: string, content: string, length: number, truncated: boolean }`

### Enterprise Tools Interface
- Function signatures export typed async handlers in `packages/adapters/src/enterprise-tools.ts` taking standard arguments and returning JSON-serializable payloads or `{ error: string }`.

## Code Layout
- `packages/adapters/src/builtin-tools.ts`: Tool definitions exported in `builtinAgentTools`.
- `packages/adapters/src/web-search.ts`: SearXNG search execution and formatting.
- `packages/adapters/src/web-scrape.ts`: Resilient HTML and Markdown content scraper.
- `packages/adapters/src/enterprise-tools.ts`: GitHub, Notion, Postiz, WordPress/Novamira, n8n, Cloudflare handlers.
- `packages/adapters/src/executor.ts`: Runtime execution, secret redaction, and `applyTool` dispatch.
- `packages/adapters/src/pi-runtime.ts`: TypeBox schema conversion and argument sanitization.
- `packages/adapters/src/*.test.ts`: Vitest unit and integration test suites.
- `apps/api/src/env.ts` & `apps/worker/src/index.ts`: Runtime environment variable wiring.
- `docker-compose.yaml`: Coolify container definitions and environment variable mappings.
