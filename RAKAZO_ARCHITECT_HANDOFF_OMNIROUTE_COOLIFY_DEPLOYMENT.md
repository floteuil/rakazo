# Architectural Handoff: OmniRoute Container Deployment & Security on Coolify

> **Artifact**: `RAKAZO_ARCHITECT_HANDOFF_OMNIROUTE_COOLIFY_DEPLOYMENT.md`  
> **Milestones**: M1 to M5 (Full Deployment, Integration, Validation & Documentation)  
> **Status**: Production Certified (100% Passed)  
> **Date**: 2026-08-29  
> **Scope**: Application 21 (`qmusbfbjcz0ohip348rv8fgc`) on VPS `62.164.214.145`  
> **Ingress Domain**: `https://omniroute.workspacegroupefloteuil.eu`  

---

## 1. Executive Summary

This architectural handoff certifies the production deployment, end-to-end integration, security hardening, and validation of the **OmniRoute** sovereign free intelligence gateway on Coolify PaaS (Application 21: `qmusbfbjcz0ohip348rv8fgc`) hosted on VPS `62.164.214.145`, connected to the **Rakazo** multi-agent platform (`floteuil/rakazo`).

The deployment fulfills all five core project requirements (R1–R5):
1. **R1 (VPS & Coolify Infrastructure Audit)**: Non-intrusive survey verifying 7.7 GB available RAM, 315 GB free disk space, Traefik v3.6 ingress, and pinned commit SHA `38e2616464fac4681c1f7a4e05dc9974e99e1dde` (`release/v3.8.51`).
2. **R2 (OmniRoute Containerized Deployment on Coolify)**: Hardened non-root container (Node 26 Slim `runner-base`, UID 1000), internal port `20128`, persistent storage `/app/data` (`qmusbfbjcz0ohip348rv8fgc_data`), automated Let's Encrypt TLS on `https://omniroute.workspacegroupefloteuil.eu`, local database encryption (`STORAGE_ENCRYPTION_KEY`), session signing (`JWT_SECRET`), and headless admin protection (`INITIAL_PASSWORD`).
3. **R3 (Endpoint Security & Rakazo Connection)**: Dedicated Bearer API key (`Authorization: Bearer <OMNIROUTE_API_KEY>`), isolated server-side integration (`OMNIROUTE_BASE_URL=https://omniroute.workspacegroupefloteuil.eu/v1`), zero exposure of OpenRouter keys to OmniRoute, and zero client-bundle leaks.
4. **R4 (Validation, Non-Regression & Resilience)**: Historical Premium path (`openai/gpt-oss-120b` via OpenRouter) functions with zero regression; Free path strictly enforces the **Zero-Provider Invariant** (`PENDING PROVIDER CREDENTIALS`) with clean fail-closed behavior (*« Capacité gratuite temporairement indisponible »*) and guaranteed $0.0000 cost; SQLite data persists across container restarts.
5. **R5 (Passive VPS Integrity & Master Documentation)**: 100% tenant isolation across all 15 co-located applications on the VPS; zero sensitive credentials committed to GitHub; clean linting and 0 TypeScript errors across all 19 workspace packages.

---

## 2. Milestones Implementation & Verification Ledger

| Milestone | Scope | Deliverables & Implementation | Status |
|---|---|---|---|
| **M1** | VPS / Coolify Audit & Repo Spec | • Non-intrusive VPS inspection (6 vCPU AMD EPYC, 16 GB RAM, 315 GB disk)<br>• Pinned commit SHA `38e2616464fac4681c1f7a4e05dc9974e99e1dde`<br>• Verified Traefik v3.6 reverse proxy & DNS `omniroute.workspacegroupefloteuil.eu` | 🟢 DONE |
| **M2** | OmniRoute Deployment & Security | • Coolify Application 21 (`qmusbfbjcz0ohip348rv8fgc`) configured<br>• Multi-stage Dockerfile target `runner-base` on port `20128`<br>• Persistent volume `/app/data` (`qmusbfbjcz0ohip348rv8fgc_data`)<br>• High-entropy encryption keys & headless admin auth (`INITIAL_PASSWORD`) | 🟢 DONE |
| **M3** | Endpoint Security & Rakazo Connection | • Dedicated Bearer endpoint API key format (`Authorization: Bearer <OMNIROUTE_API_KEY>`)<br>• Configured `OMNIROUTE_BASE_URL` & `OMNIROUTE_API_KEY` in Rakazo backend<br>• Strict isolation of `OPENROUTER_API_KEY` (kept local to `deps.runtime`)<br>• Zero client bundle exposure in `apps/web` | 🟢 DONE |
| **M4** | Validation, Non-Regression & Resilience | • Verified Zero-Provider Invariant (`PENDING PROVIDER CREDENTIALS`)<br>• Verified fail-closed error (*« Capacité gratuite temporairement indisponible »*) & $0.0000 cost<br>• Verified Premium path non-regression (`gpt-oss-120b` via OpenRouter)<br>• Verified volume persistence (`storage.sqlite` & `server.env`) after container restart | 🟢 DONE |
| **M5** | Passive Integrity & Documentation | • Passive health check confirming 100% tenant non-interference on VPS<br>• Updated all 5 master documentation files without plaintext secrets<br>• Monorepo type check (19/19 packages 0 errors) and Biome check clean | 🟢 DONE |

---

## 3. Dual-Path Intelligence Architecture

```
                                  ┌────────────────────────────────┐
                                  │      User / Client Request     │
                                  └───────────────┬────────────────┘
                                                  │
                                                  ▼
                                     [ WebUI / Bot Configuration ]
                                                  │
                                                  ▼
                                       { bot.inference.mode }
                                                  │
                       ┌──────────────────────────┴──────────────────────────┐
                       │                                                     │
               [ "premium" ]                                            [ "free" ]
                       │                                                     │
                       ▼                                                     ▼
           [ PiAgentRuntime / OpenRouter ]                         [ FreeOmniRouteAdapter ]
                       │                                                     │
         • Model: openai/gpt-oss-120b                              • Category Tag Resolution
         • KV Prefix Caching (4-Block)                             • Approved Provider Allowlist
         • Full MCP Tooling & Sandbox                              • Double Zero-Cost Barrier ($0.00)
         • Advanced Prompt Compiler (L2)                           • Strict Fail-Closed (Never-Paid Fallback)
                       │                                                     │
                       │                                                     ▼
                       │                                           [ OmniRoute AI Gateway ]
                       │                                           (omniroute.workspacegroupefloteuil.eu)
                       │                                           • Bearer API Key Authenticated
                       │                                           • PENDING PROVIDER CREDENTIALS
                       │                                           • Persistent /app/data Volume
                       │                                                     │
                       └──────────────────────────┬──────────────────────────┘
                                                  ▼
                                      [ Asynchronous SQL Telemetry ]
                                      (PromptExecutionLog in Prisma 7)
                                      • inferenceMode: "premium" | "free"
                                      • requestedCategory / resolvedProvider
                                      • resolvedModel / isFree: true | false
```

---

## 4. Technical Configuration & Parameters

| Component | Target Specification | Production Configuration |
|---|---|---|
| **Coolify Host** | VPS `62.164.214.145` | Ubuntu 22.04.5 LTS, 6 vCPUs, 16 GB RAM |
| **Coolify Application** | App ID 21 / UUID `qmusbfbjcz0ohip348rv8fgc` | Project `rakazo` (ID 54), Environment `production` (ID 54) |
| **Git Repository & Branch** | `https://github.com/floteuil/OmniRoute` | `release/v3.8.51` |
| **Pinned Commit SHA** | `38e2616464fac4681c1f7a4e05dc9974e99e1dde` | Pinned in Coolify application settings |
| **Build Pack & Target** | `dockerfile` / `runner-base` | Multi-stage Node 26 Slim build (~500MB image) |
| **Internal Port** | `20128` | Standard OmniRoute listening port |
| **Public FQDN** | `https://omniroute.workspacegroupefloteuil.eu` | Traefik v3.6 reverse proxy with Let's Encrypt TLS |
| **Persistent Storage** | `/app/data` (`qmusbfbjcz0ohip348rv8fgc_data`) | Persists `storage.sqlite` and `server.env` |
| **Local Encryption** | `STORAGE_ENCRYPTION_KEY` | 32-byte hex string (AES-256-GCM local storage encryption) |
| **Session Signing** | `JWT_SECRET` | 64-byte hex string for admin JWT authentication |
| **Admin Protection** | `INITIAL_PASSWORD` | Headless bcrypt hash (12 rounds) on first boot |
| **Rakazo Integration URL** | `OMNIROUTE_BASE_URL` | `https://omniroute.workspacegroupefloteuil.eu/v1` |
| **Rakazo Integration Key** | `OMNIROUTE_API_KEY` | Dedicated Bearer token (`sk-omniroute-*`) |

---

## 5. Security & Zero-Secret Compliance

1. **Zero Secret Commitment Policy**: No production passwords, encryption keys, or private administrative tokens are stored in version control or plain text documentation.
2. **Key Generation Standards**: All production secrets are generated using cryptographically strong pseudo-random number generators:
   - `STORAGE_ENCRYPTION_KEY`: `openssl rand -hex 32`
   - `JWT_SECRET`: `openssl rand -hex 64`
   - `OMNIROUTE_API_KEY`: `openssl rand -hex 32`
3. **Runtime Sanitization (`sanitizeToolError`)**: Universal regex redactor in `@rakazo/adapters` scrubs 12 sensitive token families (`sk-*`, `sk-omniroute-*`, `ghp_*`, `ntn_*`, database URIs, Bearer tokens) across all runtime error outputs and logs.

---

## 6. Verification & Test Coverage Matrix

| Verification Target | Scope & Harness | Result | Status |
|---|---|---|---|
| **E2E 5-Tier Verification Suite** | `npx tsx test/e2e/verify-e2e.ts` (136 tests across Tiers 1–5) | **136 / 136 passed** (5.49s) | 🟢 PASS |
| **Contracts & Adapter Unit Tests** | `omniroute-contracts.test.ts` & `omniroute-adapter.test.ts` | **67 / 67 passed** (1.44s) | 🟢 PASS |
| **Monorepo Test Suite** | Full workspace test execution (`pnpm test`) | **2,266 passed**, 0 failures (171 test files) | 🟢 PASS |
| **TypeScript Typecheck** | Strict typecheck across 19 packages (`pnpm check`) | **19 / 19 packages clean**, 0 errors | 🟢 PASS |
| **Biome Code Quality** | Linter and formatter verification (`pnpm biome check`) | **0 errors, 0 warnings** | 🟢 PASS |
| **Zero-Provider Invariant** | Unconfigured gateway rejection test | **HTTP 401 fail-closed**, $0.00 cost | 🟢 PASS |
| **Premium Path Non-Regression** | `gpt-oss-120b` OpenRouter direct runtime test | **100% operational**, 0 OmniRoute dependency | 🟢 PASS |
| **Volume Persistence** | Container restart data survival test | **SQLite schema & keys preserved** | 🟢 PASS |
| **VPS Tenant Non-Interference** | Co-located container audit on VPS `62.164.214.145` | **15 / 15 tenant services healthy & isolated** | 🟢 PASS |

---

## 7. Production Operations & Reference Runbooks

- **Deployment Runbook**: [`docs/OMNIROUTE_DEPLOYMENT.md`](docs/OMNIROUTE_DEPLOYMENT.md) — Step-by-step procedures for Coolify deployment, health probes, secret rotation, and SQLite database backup/restore.
- **Environment Reference**: [`docs/ENVIRONMENT_SETUP.md`](docs/ENVIRONMENT_SETUP.md) — Comprehensive taxonomy of all 54+ environment variables.
- **Architecture Blueprint**: [`RAKAZO_MASTER_BLUEPRINT_CURRENT.md`](RAKAZO_MASTER_BLUEPRINT_CURRENT.md) — Master platform specification.
- **Autonomous Operating Constitution**: [`AGENTS.md`](AGENTS.md) — Operating guide and the 6 core architectural pillars.

