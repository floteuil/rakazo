# Project: OmniRoute Coolify Deployment & Rakazo Secure Integration

## Architecture
OmniRoute is deployed as an isolated, containerized sovereign AI proxy on Coolify PaaS (Ubuntu 22.04 LTS VPS, Traefik v3.6 reverse proxy with Let's Encrypt TLS).
Rakazo operates as a multi-package TypeScript monorepo (`@rakazo/adapters`, `@rakazo/runtime`, `@rakazo/contracts`, `apps/web`, `apps/api`) with a strict dual-path inference engine:
- **Historical Premium Path**: Direct OpenRouter (`openai/gpt-oss-120b`) execution via `PiAgentRuntime`, totally isolated from OmniRoute.
- **Free Tier Path**: Routes via `FreeOmniRouteAdapter` to `OMNIROUTE_BASE_URL` (`https://omniroute.workspacegroupefloteuil.eu/v1`) with `OMNIROUTE_API_KEY`.
- **Zero-Provider Invariant**: OmniRoute is deployed in initial unconfigured state (`PENDING PROVIDER CREDENTIALS`). Free requests trigger a clean fail-closed error (*« Capacité gratuite temporairement indisponible »*) with strictly $0.0000 cost.
- **Storage & Security**: OmniRoute data persisted in `/app/data` (`storage.sqlite`, `server.env`), local encryption enabled via `STORAGE_ENCRYPTION_KEY`, headless admin protected by `INITIAL_PASSWORD`.

## Feature Inventory
| # | Feature | Description | Milestone | Source | Status |
|---|---------|-------------|-----------|--------|--------|
| 1 | VPS & Coolify Infrastructure Audit | Non-intrusive resource & application audit, verify zero-interference with existing containers | M1 | Survey / R1 | VERIFIED |
| 2 | OmniRoute Fork & Spec Pinning | Pin `floteuil/OmniRoute` commit `38e2616464fac4681c1f7a4e05dc9974e99e1dde` (`release/v3.8.51`) | M1 | Survey / R1 | VERIFIED |
| 3 | OmniRoute Containerized Deployment | Deploy Coolify app `qmusbfbjcz0ohip348rv8fgc` on port 20128, mount `/app/data`, domain `omniroute.workspacegroupefloteuil.eu` | M2 | Survey / R2 | VERIFIED |
| 4 | Storage Encryption & Admin Protection | Configure `STORAGE_ENCRYPTION_KEY`, `JWT_SECRET`, and `INITIAL_PASSWORD` for secure Dashboard access | M2 | Survey / R2 | VERIFIED |
| 5 | Dedicated Endpoint Key Provisioning | Provision dedicated Rakazo bearer API key on OmniRoute without exposing OpenRouter keys | M3 | Survey / R3 | VERIFIED |
| 6 | Rakazo Environment Configuration | Configure `OMNIROUTE_BASE_URL` and `OMNIROUTE_API_KEY` in Rakazo Coolify stack | M3 | Survey / R3 | VERIFIED |
| 7 | Zero-Provider Invariant & Fail-Closed | Ensure zero providers configured, verify clear error string "Capacité gratuite temporairement indisponible" on Free tier | M4 | Survey / R3/R4 | VERIFIED |
| 8 | Premium Path Non-Regression | Verify historical `gpt-oss-120b` via OpenRouter functions with zero regression and zero OmniRoute dependency | M4 | Survey / R4 | VERIFIED |
| 9 | Persistence & Restart Resiliency | Verify SQLite database and API keys survive container restarts on `/app/data` volume | M4 | Survey / R4 | VERIFIED |
| 10 | Passive VPS Health Verification | Confirm 100% tenant isolation and health of all co-located VPS services | M5 | Survey / R5 | VERIFIED |
| 11 | Master Documentation Updates | Update architectural blueprints, runbooks, and handoffs without committing any secrets | M5 | Survey / R5 | VERIFIED |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | VPS / Coolify Audit & Repo Spec | Non-intrusive audit of VPS resources, Traefik, Coolify App 21, commit pinning | none | DONE |
| M2 | OmniRoute Deployment & Security | Deploy Coolify app 21 with persistent volume `/app/data`, port 20128, HTTPS, strong auth | M1 | DONE |
| M3 | Endpoint Security & Rakazo Connection | Provision endpoint API key, set `OMNIROUTE_BASE_URL` and `OMNIROUTE_API_KEY` on Rakazo | M2 | DONE |
| M4 | Validation, Non-Regression & Resilience | Verify Free fail-closed, Premium non-regression, and data persistence after restart | M3 | DONE |
| M5 | Passive Integrity & Documentation | Verify passive VPS health and update repository documentation (without secrets) | M4 | DONE |

## Interface Contracts
### OmniRoute ↔ Traefik / Web
- Host: `omniroute.workspacegroupefloteuil.eu`
- TLS: Automated Let's Encrypt HTTP-01 via Traefik v3.6
- Target Port: `20128` (`http://localhost:20128` or internal container network)
- Dashboard: Protected by bcrypt `INITIAL_PASSWORD` session auth

### Rakazo ↔ OmniRoute (`/v1`)
- Base URL: `https://omniroute.workspacegroupefloteuil.eu/v1`
- Auth Header: `Authorization: Bearer <OMNIROUTE_API_KEY>`
- Endpoints:
  - `POST /v1/chat/completions` (OpenAI format)
  - `GET /v1/models`
- Error Contract:
  - When zero providers active: HTTP 401 / error response
  - Client transformation: Throws `Capacité gratuite temporairement indisponible`, aborts run with `failed` outcome, 0 cost.

## Code Layout
- Local Monorepo Root: `/Users/floteuilteletravail/.gemini/antigravity/scratch/rakazo_app`
  - `packages/adapters/src/omniroute-adapter.ts` (OmniRoute client & Free adapter)
  - `packages/adapters/src/free-policy-engine.ts` (Model resolution policy)
  - `packages/adapters/src/executor.ts` (Dual-path executor)
  - `packages/contracts/src/domain.ts` (Constants & error strings)
  - `docs/OMNIROUTE_DEPLOYMENT.md` (New deployment runbook)
  - `RAKAZO_ARCHITECT_HANDOFF_OMNIROUTE_COOLIFY_DEPLOYMENT.md` (Deployment handoff artifact)
  - `RAKAZO_MASTER_BLUEPRINT_CURRENT.md` (Architecture blueprint)
  - `AGENTS.md` (Agents guide)
  - `docs/ENVIRONMENT_SETUP.md` (Environment setup)
