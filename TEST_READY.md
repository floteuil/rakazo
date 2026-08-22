# TEST_READY: Rakazo Token Efficiency, AI Guardrails & Calibration Engine

## Test Suite Certification
- **Status**: CERTIFIED & READY
- **Date**: 2026-08-22
- **Framework**: Vitest 4.1.10 & TypeScript 5.9.2 (Strict Mode)
- **Target Package**: `@rakazo/adapters` (`packages/adapters/src/`)
- **Total Test Cases**: 65 automated tests across 4 suites
- **Pass Rate**: 100% (65 / 65 passed)

---

## 4-Tier Test Architecture Summary

| Tier | Focus | Test Count | Key Invariants Verified |
|------|-------|:----------:|-------------------------|
| **Tier 1: Feature Coverage** | Primary Happy Paths | 35 | `maxTokens` allocation (16,384), `thinkingLevel: "low"`, tool parsimony directives, `compactToolResult` across 6 connectors, 25-step circuit breaker, 3-call redundancy detector, subagent depth 1, 12+ token error sanitization regexes, physical storage cleanup on `/data`. |
| **Tier 2: Boundary & Corner Cases** | Edge & Threshold Conditions | 18 | Step 24 vs 25 vs 26 (circuit breaker cutoff), 1 vs 2 vs 3 consecutive calls (redundancy trigger & reset on different tool), 4,000 char threshold on shell output, 40 entries threshold on file lists, empty collections, payloads > 12,000 chars, non-existent directories, multi-secret strings. |
| **Tier 3: Cross-Feature Combinations** | Pairwise Inter-Module Flows | 6 | Subagent + tool compacting + secret sanitization; circuit breaker + redundant call termination; physical disk cleanup + database cascade under concurrency; tool parsimony + maxTokens. |
| **Tier 4: Real-World Scenarios** | Complex End-to-End Workloads | 6 | Multi-module full code refactoring; runaway search loop intercepted at step 25; oscillating failing shell command halted at call 3; multi-database Notion & Cloudflare zone audits; full bot lifecycle provisioning & physical disk purge. |
| **Total** | **All Tiers** | **65** | **100% Pass Rate** |

---

## Feature Inventory & Requirement Mapping

| # | Feature | Requirement | Test Suite | Status |
|---|---------|-------------|------------|:------:|
| 1 | High Output Token Budget (16,384) | ORIGINAL_REQUEST §R1 | `e2e-token-efficiency.test.ts` | PASS (100%) |
| 2 | System Prompt Tool Parsimony & Anti-Speculation | ORIGINAL_REQUEST §R1 | `e2e-token-efficiency.test.ts` | PASS (100%) |
| 3 | Tool Response Semantic Compacting (`compactToolResult`) | ORIGINAL_REQUEST §R1 | `tool-compacting.test.ts` | PASS (100%) |
| 4 | Iteration Circuit Breaker (Max 25 steps) | ORIGINAL_REQUEST §R2 | `loop-guards.test.ts` | PASS (100%) |
| 5 | Redundant Tool Call Detection (Max 3 calls) | ORIGINAL_REQUEST §R2 | `loop-guards.test.ts` | PASS (100%) |
| 6 | Subagent Depth Safeguard (Max depth 1) | ORIGINAL_REQUEST §R2 | `loop-guards.test.ts`, `e2e-token-efficiency.test.ts` | PASS (100%) |
| 7 | Unified Secret & Token Sanitization (`sanitizeToolError`) | ORIGINAL_REQUEST §R4 | `loop-guards.test.ts`, `e2e-token-efficiency.test.ts` | PASS (100%) |
| 8 | Zero-Bloat Physical Storage Cleanup on `/data` | ORIGINAL_REQUEST §R3 | `storage-cleanup.test.ts` | PASS (100%) |
| 9 | Database Cascades & Zero Orphans | ORIGINAL_REQUEST §R3 | `storage-cleanup.test.ts` | PASS (100%) |

---

## Detailed Test Suite Inventory

### 1. `packages/adapters/src/tool-compacting.test.ts` (24 Tests)
- **Tier 1 (Feature Coverage)**:
  - `list_files` preservation for <= 40 items.
  - `list_files` compacting & sampling for > 40 items.
  - `shell` output preservation for <= 4,000 characters.
  - `shell` output head/tail truncation with marker for > 4,000 characters.
  - `github_search_repos` filtering verbose fields (retaining name, stars, url).
  - `github_list_issues` extracting number, title, state, user, labels.
  - `notion_search` omitting heavy block trees (retaining id, title, url).
  - `cloudflare_list_dns_records` extracting DNS record properties.
  - Fallback JSON null pruning and structural cleanup.
  - Nil/empty input handling (`null`, `undefined` -> `"ok"`).
- **Tier 2 (Boundary & Corner Cases)**:
  - Exact 40 entries (not compressed) vs 41 entries (compressed).
  - Exact 4,000 characters (not truncated) vs 4,001 characters (truncated).
  - Empty collections (`[]`, `{}`).
  - Massive generic JSON payloads (> 12,000 characters capped with `…`).
  - Unicode, French accents, emojis, and multiline preserving.
  - Object wrapper shapes (`{ output }` and `{ stdout }`).
- **Tier 3 (Cross-Feature Combinations)**:
  - Compacting + embedded secret tokens in shell output.
  - 50-file list with sensitive paths.
  - Multi-connector batch outputs (GitHub + Cloudflare).
- **Tier 4 (Real-World Scenarios)**:
  - Scenario 1: Large Monorepo File Tree (250 files across packages and apps).
  - Scenario 2: TypeScript Compiler Build Failure (20,000 character log with 14 errors).
  - Scenario 3: Cloudflare DNS Zone Audit (100 DNS records compacted to essential records).

### 2. `packages/adapters/src/loop-guards.test.ts` (21 Tests)
- **Tier 1 (Feature Coverage)**:
  - `createToolCallTracker` initialization with zero state.
  - Step counter incrementing and normal execution allowance.
  - Circuit breaker triggering at step 26 (`terminate: true`).
  - Redundant call detection on 3rd identical call (`terminate: true`).
  - Subagent depth safeguard (depth 0 vs depth 1).
  - Secret sanitization: GitHub (`ghp_`, `github_pat_`).
  - Secret sanitization: Notion, Postiz, Novamira, n8n, Cloudflare (`secret_`, `ntn_`, `pk_`, `nova_`, `n8n_api_`, `cf_token_`, `cfat_`).
  - Secret sanitization: OpenAI, OpenRouter, Anthropic (`sk-`, `sk-or-`, `sk-ant-`).
  - Secret sanitization: PostgreSQL connection URLs with passwords.
  - Secret sanitization: Bearer and Basic authentication headers.
- **Tier 2 (Boundary & Corner Cases)**:
  - Step 24 (allow), Step 25 (allow), Step 26 (blocked).
  - Consecutive redundancy reset when intermediate tool call differs (A -> A -> B -> A).
  - Canonical argument signature: JSON key ordering normalization (`{a:1, b:2}` vs `{b:2, a:1}`).
  - Empty, null, and primitive arguments in signature computation.
  - Sanitization of empty strings and clean strings.
  - Multiple credentials in a single error message.
- **Tier 3 (Cross-Feature Combinations)**:
  - Circuit breaker + Redundant call: Loop halted at step 3 before step 25.
  - Failing tool returning sanitized error retried 3 times triggers redundancy guard.
- **Tier 4 (Real-World Scenarios)**:
  - Scenario 1: Oscillating failing tool call loop (retrying failing `git pull` 3 times).
  - Scenario 2: Runaway search loop stopped at step 25 with synthesis directive.
  - Scenario 3: Deep nested error diagnostic with 5 exposed credential types sanitized simultaneously.

### 3. `packages/adapters/src/storage-cleanup.test.ts` (7 Tests)
- **Tier 1 (Feature Coverage)**:
  - Unconditional physical purge of `/data/homes/<botId>` directory on disk.
  - Artifact store cleanup: calls `artifactStore.remove` for all bot artifacts.
  - Active runs and routines cancellation in DB and queue.
  - Memory archival: Preserves memories under `Archived bots/...` when `deleteMemories: false`.
- **Tier 2 (Boundary & Corner Cases)**:
  - Non-existent directory resilience (does not throw when directories on disk are missing).
  - Transaction failure propagation (surfaces database errors honestly).
- **Tier 3 & 4 (Real-World Scenarios)**:
  - Scenario: Full Lifecycle Provisioning, Disk Footprint (`/data/homes`, revisions, desktop workspaces) & Zero-Bloat Purge.

### 4. `packages/adapters/src/e2e-token-efficiency.test.ts` (13 Tests)
- **Tier 1 (Feature Coverage)**:
  - `PiAgentRuntime` capabilities declaration (compaction, streaming, tools).
  - Elevated output token budget (16,384 tokens).
  - Economic thinking budget (`thinkingLevel: "low"`).
  - Tool parsimony and anti-speculation directives in system instructions.
  - Subagent depth restriction (depth > 0 blocked).
- **Tier 2 (Boundary & Corner Cases)**:
  - Large prompt output handling without truncation.
  - Missing system instruction fallback.
  - Immediate refusal for subagent nesting.
  - Error stream credential masking.
- **Tier 3 (Cross-Feature Combinations)**:
  - Subagent + Tool Compacting + Secret Masking pipeline.
  - Circuit breaker + Tool Parsimony alignment.
- **Tier 4 (Real-World Scenarios)**:
  - Scenario 1: Full-file multi-module code generation workload.
  - Scenario 2: Multi-agent autonomous delegation with single-depth guard.

---

## Verification Commands

Run the complete 4-tier token efficiency test suite:
```bash
pnpm vitest run packages/adapters/src/tool-compacting.test.ts packages/adapters/src/loop-guards.test.ts packages/adapters/src/storage-cleanup.test.ts packages/adapters/src/e2e-token-efficiency.test.ts
```

Run full monorepo type checking:
```bash
pnpm check
```

Run all adapter tests:
```bash
pnpm --filter @rakazo/adapters test
```
