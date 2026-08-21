# E2E Test Infra: Rakazo Enterprise MCP & Web Tools

## Test Philosophy
- Opaque-box, requirement-driven testing. Derived directly from `ORIGINAL_REQUEST.md`.
- Methodology: Category-Partition + Boundary Value Analysis + Pairwise Combinatorial + Real-World Application Scenarios.

## Feature Inventory
| # | Feature | Source (requirement) | Tier 1 | Tier 2 | Tier 3 |
|---|---------|---------------------|:------:|:------:|:------:|
| 1 | Web Search (SearXNG) | ORIGINAL_REQUEST §R1 | 5 | 5 | ✓ |
| 2 | Web Scrape (Clean HTML/Markdown) | ORIGINAL_REQUEST §R1 | 5 | 5 | ✓ |
| 3 | Default Tool Activation & Inheritance | ORIGINAL_REQUEST §R1 | 5 | 5 | ✓ |
| 4 | GitHub Connector Tools | ORIGINAL_REQUEST §R2 | 5 | 5 | ✓ |
| 5 | Notion Connector Tools | ORIGINAL_REQUEST §R2 | 5 | 5 | ✓ |
| 6 | Postiz Connector Tools | ORIGINAL_REQUEST §R2 | 5 | 5 | ✓ |
| 7 | WordPress / Novamira Tools | ORIGINAL_REQUEST §R2 | 5 | 5 | ✓ |
| 8 | n8n Connector Tools | ORIGINAL_REQUEST §R2 | 5 | 5 | ✓ |
| 9 | Cloudflare Connector Tools | ORIGINAL_REQUEST §R2 | 5 | 5 | ✓ |
| 10| Secret Redaction & Protection | ORIGINAL_REQUEST §R2 | 5 | 5 | ✓ |
| 11| Build & Coolify Configuration | ORIGINAL_REQUEST §R3 | 5 | 5 | ✓ |

## Test Architecture
- Test runner: Vitest (`pnpm test` / `pnpm vitest run packages/adapters/src/e2e-enterprise-suite.test.ts`)
- Pass/fail semantics: Exit code 0, all assertions pass.
- Test suites:
  - `packages/adapters/src/web-search.test.ts`
  - `packages/adapters/src/web-scrape.test.ts`
  - `packages/adapters/src/enterprise-tools.test.ts`
  - `packages/adapters/src/e2e-enterprise-suite.test.ts` (Full Tiers 1-4 Suite)

## Real-World Application Scenarios (Tier 4)
| # | Scenario | Features Exercised | Complexity |
|---|----------|--------------------|------------|
| 1 | Competitive Intelligence Briefing | Search web via SearXNG, scrape competitor article, summarize with citations | High |
| 2 | Automated GitHub Issue Triage & Notification | Fetch repo issues, search Notion for knowledge base match, trigger n8n webhook | High |
| 3 | Social Media & Blog Cross-Publishing | Draft WordPress article, schedule Postiz announcement, purge Cloudflare cache | High |
| 4 | Safe Diagnostic Execution & Token Sanitization | Invoke all enterprise tools with dummy/real credentials, verify zero secret leakage in output or logs | High |
| 5 | Multi-Turn Subagent Research Pipeline | Spawn subagent inheriting search & scrape tools, perform recursive deep dive, compile findings | High |

## Coverage Thresholds
- Tier 1: ≥55 test cases (5 per feature × 11 features)
- Tier 2: ≥55 test cases (5 per feature × 11 features)
- Tier 3: ≥15 cross-feature interaction test cases
- Tier 4: ≥5 realistic end-to-end workload scenarios
- Total: ≥130 test cases
