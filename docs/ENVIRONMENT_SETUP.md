# Rakazo Developer & Environment Setup Guide

> **Authoritative Technical Runbook and Environment Configuration Reference**  
> **Repository**: `github.com/floteuil/rakazo`  
> **Applies to**: Local Development, CI/CD Pipelines, Self-Hosted Deployments, and Autonomous Agents  

---

## Table of Contents

1. [Prerequisites & System Requirements](#1-prerequisites--system-requirements)
2. [Quickstart Onboarding Runbook](#2-quickstart-onboarding-runbook)
3. [Comprehensive Environment Variables Taxonomy (52+ Variables)](#3-comprehensive-environment-variables-taxonomy)
   - [3.1 Core Server & General Configuration](#31-core-server--general-configuration)
   - [3.2 Database & Persistence (PostgreSQL)](#32-database--persistence-postgresql)
   - [3.3 Authentication & Cryptographic Keys](#33-authentication--cryptographic-keys)
   - [3.4 Observability, Telemetry & Tracing (PostHog & OpenTelemetry)](#34-observability-telemetry--tracing-posthog--opentelemetry)
   - [3.5 Sandboxes & Container Supervisor (Docker, Daytona, Box, E2B)](#35-sandboxes--container-supervisor-docker-daytona-box-e2b)
   - [3.6 AI Runtime, LLM Gateway & Composio (Pi Runtime & OpenRouter)](#36-ai-runtime-llm-gateway--composio-pi-runtime--openrouter)
   - [3.7 Memory & Semantic Vector Indexing (Supermemory)](#37-memory--semantic-vector-indexing-supermemory)
   - [3.8 Web Search & Web Scraping Services (SearXNG & Scraperr)](#38-web-search--web-scraping-services-searxng--scraperr)
   - [3.9 Enterprise Tool Connectors (GitHub, Notion, Postiz, WordPress, Novamira, n8n, Cloudflare)](#39-enterprise-tool-connectors)
   - [3.10 Notifications, Email & Web Push (SMTP & VAPID)](#310-notifications-email--web-push-smtp--vapid)
4. [Database & Persistence Workflows](#4-database--persistence-workflows)
5. [Development, Build & Verification Commands](#5-development-build--verification-commands)
6. [Troubleshooting & Common Failure Modes](#6-troubleshooting--common-failure-modes)

---

## 1. Prerequisites & System Requirements

Before running the Rakazo monorepo, ensure your local development machine or container environment meets the following specifications:

| Requirement | Minimum Supported Version | Recommended | Notes |
|---|---|---|---|
| **Node.js** | `>= 22.0.0` | `22.14.0 LTS` | Monorepo engines require Node 22+ for native fetch and AbortSignal support. |
| **pnpm** | `>= 9.15.0` | `9.15.0` | Core package manager specified in `packageManager` field. |
| **Docker & Docker Compose** | `>= 24.0` | Latest Docker Desktop / Engine | Required for local PostgreSQL, Sandbox Supervisor, and container sandboxes. |
| **PostgreSQL** | `16+` (via Docker or Native) | Docker image `postgres:16` | Required for relational persistence, JSONB queries, and Graphile worker queues. |
| **Operating System** | macOS (Apple Silicon / Intel), Linux (x86_64 / arm64), Windows WSL2 | macOS / Ubuntu 22.04 LTS | Cross-platform compatible across Web, Desktop (Electron), and Mobile (Expo). |

---

## 2. Quickstart Onboarding Runbook

Follow these sequential steps to initialize and run the full Rakazo development stack from a clean repository clone:

### Step 1: Install Dependencies
```bash
# Clone the repository
git clone https://github.com/floteuil/rakazo.git
cd rakazo

# Install all workspace dependencies via pnpm
pnpm install --frozen-lockfile
```

### Step 2: Initialize Environment File
```bash
# Copy example configuration template
cp .env.example .env

# Generate a secure 32+ character authentication secret and 64-char encryption key
# (For local development, default placeholders are accepted automatically)
```

### Step 3: Launch Backing Services (Docker Compose)
Rakazo includes a local Docker Compose setup launching PostgreSQL (port `5433` -> internal `5432`) and sandbox containers:
```bash
# Launch PostgreSQL and Sandbox containers in background
pnpm compose:up
# Or directly:
# docker compose --env-file .env -f infra/compose/docker-compose.yml up -d postgres
```

### Step 4: Generate Prisma Client & Run Migrations
```bash
# Generate TypeScript types from Prisma schema
pnpm db:generate

# Apply all database migrations to PostgreSQL
pnpm db:migrate
```

### Step 5: Start Development Servers
```bash
# Start API backend (port 3100), Worker, Web UI (port 5173), and Sandbox Supervisor (port 7091)
pnpm dev
```
Access the web user interface in your browser at `http://127.0.0.1:5173`.

### Step 6: Verify Monorepo Health
```bash
# Run strict type checking across all 19 packages (0 errors required)
pnpm check

# Execute full Vitest test suite (100% pass required)
pnpm test
```

---

## 3. Comprehensive Environment Variables Taxonomy

Rakazo centralizes configuration through environment variables. Below is the complete catalog of all 52+ variables structured by functional service category.

### 3.1 Core Server & General Configuration

These variables govern backend server binding, web routing origins, storage directories, logging levels, and registration policies.

| Variable Name | Type / Format | Default Value | Required? | Description & Context |
|---|---|---|---|---|
| `NODE_ENV` | `development` \| `production` \| `test` | `development` | Optional | Execution mode. Controls dev secret allowances, logging verbosity, and optimization flags. |
| `API_URL` | Valid HTTP/S URL | `http://127.0.0.1:3100` | Required | Public-facing base URL of the `@rakazo/api` backend server. |
| `WEB_ORIGIN` | Valid HTTP/S URL | `http://127.0.0.1:5173` | Required | Allowed frontend origin for CORS policies and OAuth redirects. |
| `DATA_DIR` | Absolute or relative path | `./data` | Optional | Base directory on the host filesystem used for storing bot home directories, revisions, and local artifacts. |
| `LOG_LEVEL` | `debug` \| `info` \| `warn` \| `error` | `info` | Optional | Logging level across all API routes, background workers, and adapters. |
| `GIT_SHA` | 40-char commit SHA / string | `""` | Optional | Deployed commit revision returned in the `GET /health` API endpoint. |
| `SIGNUPS_ENABLED` | `true` \| `false` (boolean string) | `true` | Optional | Toggles whether new users can register on the platform. |
| `SIGNUP_ALLOWLIST` | Comma-separated email patterns | `""` | Optional | When signups are restricted, specifies allowed email domains (e.g. `@example.com`) or specific emails. |

---

### 3.2 Database & Persistence (PostgreSQL)

| Variable Name | Type / Format | Default Value | Required? | Description & Context |
|---|---|---|---|---|
| `DATABASE_URL` | PostgreSQL Connection URI (`postgres://user:pass@host:port/dbname`) | `postgres://rakazo:rakazo@127.0.0.1:5433/rakazo` | **Required** | Primary PostgreSQL connection string used by `@rakazo/db` (Prisma ORM), migrations, and Graphile Worker. |

---

### 3.3 Authentication & Cryptographic Keys

These cryptographic secrets protect session tokens, cookie encryption, and encrypted credential storage at rest.

| Variable Name | Type / Format | Default Value | Required? | Description & Context |
|---|---|---|---|---|
| `BETTER_AUTH_SECRET` | String (≥ 32 characters) | `replace-with-32-plus-character-secret` | **Required in Prod** | Master secret key used by `@rakazo/auth` (BetterAuth) for signing JWT session tokens and cookies. In dev, falls back to placeholder. |
| `BETTER_AUTH_URL` | Valid HTTP/S URL | `http://127.0.0.1:5173` | **Required** | Base URL for auth callbacks, verification emails, and OAuth provider redirects. |
| `ENCRYPTION_KEY` | 64-character hex string or passphrase | `replace-with-64-char-hex-or-passphrase` | **Required in Prod** | Master key used by `@rakazo/core` to encrypt user credentials, third-party tokens, and model keys at rest in the database. |

---

### 3.4 Observability, Telemetry & Tracing (PostHog & OpenTelemetry)

| Variable Name | Type / Format | Default Value | Required? | Description & Context |
|---|---|---|---|---|
| `PUBLIC_POSTHOG_KEY` | PostHog Project API Key (`phc_*`) | `""` | Optional | PostHog public project key used for frontend analytics and feature flags. Exposed to browser. |
| `PUBLIC_POSTHOG_HOST` | Valid HTTP/S URL | `https://us.i.posthog.com` | Optional | PostHog analytics ingestion endpoint URL. |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | Valid HTTP/S endpoint (`http://host:4318`) | `""` | Optional | OpenTelemetry OTLP collector endpoint for exporting traces, spans, and platform metrics. |

---

### 3.5 Sandboxes & Container Supervisor (Docker, Daytona, Box, E2B)

These variables configure isolated execution environments where agent code, shell commands, and desktop sessions execute.

| Variable Name | Type / Format | Default Value | Required? | Description & Context |
|---|---|---|---|---|
| `SANDBOX_PROVIDER` | `docker` \| `daytona` \| `box` \| `e2b` \| `fake` | `docker` | Optional | Primary sandbox execution provider. Defaults to local Docker. |
| `SANDBOX_SUPERVISOR_URL` | Valid HTTP URL | `http://127.0.0.1:7091` | Optional | HTTP endpoint for the container supervisor service (`@rakazo/sandbox-supervisor`). |
| `SANDBOX_SUPERVISOR_TOKEN` | Secret String | `""` | Optional | Authentication bearer token for communicating with the sandbox supervisor. Defaults to `BETTER_AUTH_SECRET` if empty. |
| `SANDBOX_IDLE_MS` | Integer (milliseconds, ≥ 30000) | `600000` (10 min) | Optional | Duration of inactivity before an idle computer or sandbox container is paused/stopped. |
| `SANDBOX_COMMAND_TIMEOUT_MS` | Integer (milliseconds) | `300000` (5 min) | Optional | Maximum execution time allowed for a single shell command inside a sandbox. |
| `DAYTONA_API_KEY` | Daytona API Token | `""` | Optional | Authentication key for spawning cloud development sandboxes via Daytona. |
| `DAYTONA_API_URL` | Valid HTTP/S URL | `""` | Optional | Base URL for self-hosted or cloud Daytona management server. |
| `DAYTONA_TARGET` | Daytona Target Region/ID | `""` | Optional | Specific deployment target or cluster identifier for Daytona workspaces. |
| `BOX_API_KEY` | Box API Token | `""` | Optional | API token for ascii.dev Box isolated cloud execution environments. |
| `BOX_API_URL` | Valid HTTP/S URL | `https://ascii.dev/api/box/v1` | Optional | Base URL for the Box cloud execution API. |
| `E2B_API_KEY` | E2B API Key (`e2b_*`) | `""` | Optional | API key for E2B isolated cloud microVM sandboxes for code interpretation. |

---

### 3.6 AI Runtime, LLM Gateway & Composio (Pi Runtime & OpenRouter)

| Variable Name | Type / Format | Default Value | Required? | Description & Context |
|---|---|---|---|---|
| `AGENT_RUNTIME` | `pi` \| `fake` | `pi` | Optional | Agent execution engine. Defaults to the sovereign Pi autonomous runtime. |
| `WAKEUP_DRIVER` | `graphile` \| `memory` | `graphile` | Optional | Background job queue driver. `graphile` uses PostgreSQL jobs table; `memory` runs in-process. |
| `OPENROUTER_API_KEY` | OpenRouter API Key (`sk-or-v1-*`) | `""` | Recommended | API key for OpenRouter LLM gateway, powering subagent inference, chat, and Level 2 prompt compilation. |
| `OPENROUTER_BASE_URL` | Valid HTTP/S URL | `https://openrouter.ai/api/v1` | Optional | OpenRouter API endpoint. Can be redirected to an OpenAI-compatible proxy or LiteLLM gateway. |
| `PI_DEFAULT_PROVIDER` | Provider identifier | `openrouter` | Optional | Default model provider for bot execution (`openrouter`, `openai`, `anthropic`, `local`). |
| `PI_DEFAULT_MODEL` | Model identifier string | `openai/gpt-oss-120b` | Optional | Default foundation model ID assigned to newly created bots. |
| `PI_MODEL_API_KEY` | API Key string | `""` | Optional | Direct API key override for runtime execution when bypassing OpenRouter. |
| `COMPOSIO_API_KEY` | Composio API Key | `""` | Optional | API key for Composio enterprise tooling and external OAuth action triggers. |

---

### 3.7 Memory & Semantic Vector Indexing (Supermemory)

| Variable Name | Type / Format | Default Value | Required? | Description & Context |
|---|---|---|---|---|
| `SUPERMEMORY_API_KEY` | Supermemory API Key | `""` | Optional | API key for external Supermemory semantic memory and vector indexing service. |
| `SUPERMEMORY_API_URL` | Valid HTTP/S URL | `https://api.supermemory.ai` | Optional | Supermemory endpoint. For self-hosted deployments, set to `http://localhost:6767`. |

---

### 3.8 Web Search & Web Scraping Services (SearXNG & Scraperr)

These microservices provide sovereign in-cluster web search and article scraping without relying on third-party SaaS APIs.

| Variable Name | Type / Format | Default Value | Required? | Description & Context |
|---|---|---|---|---|
| `SEARXNG_URL` | Valid HTTP/S URL | `http://127.0.0.1:8080` | Optional | URL of the self-hosted SearXNG meta-search engine instance. Powers the `web_search` MCP tool. |
| `SCRAPERR_URL` | Valid HTTP/S URL | `""` | Optional | URL of the self-hosted Scraperr service for clean HTML-to-Markdown extraction. Powers `web_scrape`. |

---

### 3.9 Enterprise Tool Connectors

Enterprise connectors provide sovereign integrations to external developer and productivity platforms. All connectors follow least-privilege principles and are opt-in per bot.

#### GitHub Connector
| Variable Name | Type / Format | Default Value | Required? | Description & Context |
|---|---|---|---|---|
| `GITHUB_TOKEN` | GitHub PAT (`ghp_*` or `github_pat_*`) | `""` | Optional | Personal access token for interacting with GitHub repositories, issues, PRs, and code search. |
| `GITHUB_API_URL` | Valid HTTP/S URL | `https://api.github.com` | Optional | GitHub API base URL. Can point to GitHub Enterprise Server (`https://github.company.internal/api/v3`). |

#### Notion Connector
| Variable Name | Type / Format | Default Value | Required? | Description & Context |
|---|---|---|---|---|
| `NOTION_API_KEY` | Notion Integration Key (`secret_*` / `ntn_*`) | `""` | Optional | Internal integration token for searching, reading, and creating pages and databases in Notion workspaces. |
| `NOTION_API_URL` | Valid HTTP/S URL | `https://api.notion.com/v1` | Optional | Notion API endpoint base URL. |

#### Postiz Social Media Connector
| Variable Name | Type / Format | Default Value | Required? | Description & Context |
|---|---|---|---|---|
| `POSTIZ_API_KEY` | Postiz API Key (`pk_*`) | `""` | Optional | API authentication key for scheduling social media posts and querying connected platforms in Postiz. |
| `POSTIZ_API_URL` | Valid HTTP/S URL | `https://api.postiz.com` | Optional | Base URL for Postiz instance. In local Docker setups, typically `http://postiz:5000`. |

#### WordPress REST API Connector
| Variable Name | Type / Format | Default Value | Required? | Description & Context |
|---|---|---|---|---|
| `WORDPRESS_URL` | Valid HTTP/S URL | `""` | Optional | Base URL of target WordPress site (e.g. `https://myblog.example.com`). |
| `WORDPRESS_USERNAME` | String | `""` | Optional | WordPress user account with publishing privileges. |
| `WORDPRESS_APP_PASSWORD` | 24-char App Password | `""` | Optional | WordPress Application Password generated in user profile for secure REST API authentication. |

#### Novamira Multi-Domain DNS/Hosting Connector
| Variable Name | Type / Format | Default Value | Required? | Description & Context |
|---|---|---|---|---|
| `NOVAMIRA_API_KEY` | Novamira API Key (`nova_*`) | `""` | Optional | API token for managing multi-domain hosting, DNS zones, and DNS records on Novamira infrastructure. |

#### n8n Workflow Automation Connector
| Variable Name | Type / Format | Default Value | Required? | Description & Context |
|---|---|---|---|---|
| `N8N_API_KEY` | n8n API Key (`n8n_api_*`) | `""` | Optional | API key for triggering n8n workflows, querying executions, and managing webhook automations. |
| `N8N_API_URL` | Valid HTTP/S URL | `""` | Optional | Base URL of self-hosted or cloud n8n instance (e.g. `https://n8n.internal.company.com`). |

#### Cloudflare Infrastructure Connector
| Variable Name | Type / Format | Default Value | Required? | Description & Context |
|---|---|---|---|---|
| `CLOUDFLARE_API_TOKEN` | Cloudflare API Token (`cf_token_*` / `cfat_*`)| `""` | Optional | Scoped API token with permissions for DNS management, Workers, or Tunnel configuration. |
| `CLOUDFLARE_ACCOUNT_ID` | 32-char hex Account ID | `""` | Optional | Target Cloudflare Account ID for resource provisioning and Worker deployments. |

---

### 3.10 Notifications, Email & Web Push (SMTP & VAPID)

| Variable Name | Type / Format | Default Value | Required? | Description & Context |
|---|---|---|---|---|
| `SMTP_URL` | SMTP Connection URI (`smtp://user:pass@smtp.host:587`) | `""` | Optional | Outgoing SMTP mail server URI used for sending invitation links and transactional alerts. |
| `VAPID_PUBLIC_KEY` | Base64 URL-encoded VAPID Public Key | `""` | Optional | Application server public key used for Web Push notification subscription handshakes. |
| `VAPID_PRIVATE_KEY` | Base64 URL-encoded VAPID Private Key | `""` | Optional | Secret key used by backend workers to sign push notification payloads sent to browsers. |

---

## 4. Database & Persistence Workflows

Rakazo utilizes **Prisma 7 ORM** on top of PostgreSQL. All database models and migrations reside in `@rakazo/db`.

### 1. Launching PostgreSQL via Docker
If you do not have a native PostgreSQL 16 instance running, use the bundled Compose service:
```bash
# Start PostgreSQL on port 5433 (maps to 5432 in container)
docker compose --env-file .env -f infra/compose/docker-compose.yml up -d postgres

# Verify health status
docker compose --env-file .env -f infra/compose/docker-compose.yml ps
```

### 2. Generating the Prisma Client
Whenever `packages/db/prisma/schema.prisma` is modified, regenerate the client:
```bash
pnpm db:generate
# Or directly:
pnpm --filter @rakazo/db generate
```
This writes the compiled client artifacts to `packages/db/src/generated/prisma`.

### 3. Applying Database Migrations
To apply existing migration SQL files to your database:
```bash
pnpm db:migrate
# Or directly:
pnpm --filter @rakazo/db migrate
```

### 4. Creating a New Additive Migration
To create a new migration after editing `schema.prisma`:
```bash
pnpm --filter @rakazo/db exec prisma migrate dev --name <migration_name>
```
*Note: All migrations must be forward-compatible and additive to prevent breaking rolling deployments.*

---

## 5. Development, Build & Verification Commands

### Primary Monorepo Scripts

| Command | Purpose |
|---|---|
| `pnpm dev` | Starts API (`apps/api`), Web (`apps/web`), Worker (`apps/worker`), and Supervisor (`infra/sandboxes/supervisor`) concurrently via Turborepo. |
| `pnpm build` | Executes `turbo build` across all 19 workspace packages. |
| `pnpm check` | Runs TypeScript compiler across all packages (`turbo check`). |
| `pnpm test` | Runs the full Vitest unit, adversarial, and integration test suite. |
| `pnpm lint` | Validates code style and rules with Biome. |
| `pnpm format` | Formats all files in the monorepo with Biome writeback. |

### Specialized Test & Benchmark Suites

| Command | Harness & Target |
|---|---|
| `pnpm test:integration` | Runs Testcontainers PostgreSQL integration test suites against isolated test containers. |
| `pnpm test:e2e` | Runs Playwright browser E2E test suites against the Web UI. |
| `pnpm test:topology` | Verifies package boundary integrity and checks for circular dependencies. |
| `pnpm test:canary` | Runs smoke tests verifying critical runtime paths. |
| `pnpm test:computer` | Executes tests for computer sandboxes and supervisor screen leases. |
| `pnpm perf:desktop` | Benchmarks Electron and Web rendering performance. |
| `pnpm perf:compare` | Compares performance benchmarks across test runs. |

---

## 6. Troubleshooting & Common Failure Modes

### 1. Database Connection Refused (`ECONNREFUSED 127.0.0.1:5433`)
- **Symptom**: `PrismaClientInitializationError: Can't reach database server at 127.0.0.1:5433`.
- **Cause**: The PostgreSQL Docker container is not running or port 5433 is already occupied.
- **Remediation**:
  ```bash
  # Check if PostgreSQL container is running
  docker ps --filter "name=postgres"
  # Restart container via compose
  pnpm compose:up
  ```

### 2. Missing or Default Secrets in Production (`RUNTIME_SECRETS_ERROR`)
- **Symptom**: `Error: Set BETTER_AUTH_SECRET and ENCRYPTION_KEY to long random strings before starting Rakazo outside local development or tests.`
- **Cause**: In `production` mode (`NODE_ENV=production`), `@rakazo/core/secrets-guard.ts` blocks default placeholder secrets.
- **Remediation**: Provide high-entropy secrets in production environment:
  ```bash
  export BETTER_AUTH_SECRET=$(openssl rand -hex 32)
  export ENCRYPTION_KEY=$(openssl rand -hex 32)
  ```

### 3. Out of Sync `pnpm-lock.yaml`
- **Symptom**: `ERR_PNPM_LOCKFILE_OUT_OF_DATE: Cannot install with "frozen-lockfile"`.
- **Cause**: Dependencies in `package.json` were updated without updating the lockfile.
- **Remediation**: Run `pnpm install --no-frozen-lockfile` to regenerate `pnpm-lock.yaml`.

### 4. Sandbox Supervisor Docker Socket Permission Error
- **Symptom**: `permission denied while trying to connect to the Docker daemon socket at unix:///var/run/docker.sock`.
- **Cause**: Current user lacks read/write permissions to Docker socket on Linux host.
- **Remediation**: Add user to `docker` group (`sudo usermod -aG docker $USER`) or adjust permissions on `/var/run/docker.sock`.

### 5. Memory Limit Exceeded During Vitest Run
- **Symptom**: `FATAL ERROR: Ineffective mark-compacts near heap limit Allocation failed - JavaScript heap out of memory`.
- **Cause**: Running 140+ test files simultaneously without memory constraints.
- **Remediation**: Increase Node heap limit:
  ```bash
  export NODE_OPTIONS="--max-old-space-size=8192"
  pnpm test
  ```

---

## 7. Related Architecture & Governance Documents

- [`AGENTS.md`](../AGENTS.md): Authoritative autonomous operating guide & 6 core pillars.
- [`docs/computer-runtime.md`](computer-runtime.md): Architecture of computer sandboxes, supervisor protocols, and screen leases.
- [`docs/self-host.md`](self-host.md): Self-hosting guide for Coolify PaaS and multi-container Docker environments.
- [`docs/performance.md`](performance.md): Latency, prefix caching, and token optimization benchmarks.
