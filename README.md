# Rakazo

[![GitHub stars](https://img.shields.io/github/stars/elie222/rakazo?labelColor=black&style=for-the-badge&color=2563EB)](https://github.com/elie222/rakazo/stargazers)
[![Discord](https://img.shields.io/badge/Discord-Join%20the%20community-5865F2?labelColor=black&style=for-the-badge&logo=discord&logoColor=white)](https://discord.gg/RWwKa2Sn7h)

![Rakazo — AI teammates you actually own](./docs/readme-hero.png)

Rakazo is an open-source platform for running persistent AI teammates. It is available on the web,
as an Electron desktop app, and through an Expo mobile app. Bring your own model and computer
provider, or run the complete stack locally.

Rakazo is in beta. Learn more at [rakazo.com](https://rakazo.com).

## Features

- **Dual-Track Inference Gateway**:
  - **Premium Track**: `gpt-oss-120b` via OpenRouter with 4-block KV prefix caching optimization.
  - **Free Track (OmniRoute Gateway)**: Strict-free inference with dynamic model selection by usage tags (`coding`, `writing`, `reasoning`, `fast`, `analysis`), fail-closed safety, and zero-cost guarantee.
- **Prompt Compiler (« Rendre professionnelles »)**: Two-level prompt optimization (deterministic Level 1 + LLM Level 2) with instant rollback and strict MCP immutability.
- **Persistent Sovereign Bots**: Bots with their own conversations, memory, routines, and history.
- **Sovereign In-Cluster MCP Adapters**: First-party isolated connectors for GitHub, Notion, WordPress, Postiz, Novamira, SearXNG, and Cloudflare.
- **Bounded Autonomous Subagents**: Isolated execution with Level 1 compilation, depth = 1 strict ceiling, 8,192 token budgets, and anti-loop circuit breakers.
- **Voice Mode**: Speak replies, dictate, and call a bot (ElevenLabs, OpenAI, Cartesia).
- **Shared Team Computers & Private Sandboxes**: Browser, terminal, file, and desktop access (Docker, E2B, Daytona).
- **Full-Stack Multi-Device WebUI**: Responsive mobile-first design (320px to 1440px+), safe area support, and touch-first interactions.

## Demo

https://github.com/user-attachments/assets/dccdeddb-2134-4a56-8eed-b2e591736b1c

## Stack

- TypeScript
- React 19, Vite, and Tailwind CSS
- Electron and Expo
- Hono and oRPC
- PostgreSQL and Prisma
- Better Auth
- Graphile Worker
- Pi
- Docker, E2B, and Daytona
- Composio

## Quick start

You need Node.js 22+, pnpm 9, and Docker Desktop.

```bash
git clone https://github.com/elie222/rakazo.git
cd rakazo
cp .env.example .env
```

Set `BETTER_AUTH_SECRET` and `ENCRYPTION_KEY` in `.env` to independent, long random values. You can
also set `OPENROUTER_API_KEY`, or connect a supported model provider during onboarding.

```bash
docker compose --env-file .env -f infra/compose/docker-compose.yml up postgres -d
pnpm install
pnpm db:generate
pnpm db:migrate
pnpm sandbox:build
pnpm dev
```

Open [http://127.0.0.1:5173](http://127.0.0.1:5173), create an account, connect a model, and create
your first bot.

For an agent-assisted installation, use [SETUP_PROMPT.md](./SETUP_PROMPT.md). For deployment,
provider selection, backups, and upgrades, see the [self-hosting guide](./docs/self-host.md).

## Desktop and mobile

The Electron and Expo apps are clients of the same Rakazo API used by the web app.

With the development stack running, launch Electron with:

```bash
pnpm --filter @rakazo/desktop dev
```

Mobile build and release instructions live in [docs/mobile-release.md](./docs/mobile-release.md).

## Development

Rakazo is a TypeScript monorepo built with React, Electron, Expo, Hono, Postgres, Prisma, Graphile
Worker, and Pi.

```text
apps/       web, api, worker, desktop, mobile, and public website
packages/   domain, contracts, persistence, adapters, UI, and test tooling
infra/      local services and computer images
docs/       architecture, operations, and release guides
```

Common checks:

```bash
pnpm lint
pnpm check
pnpm test
pnpm test:integration
pnpm test:e2e
```

See [CONTRIBUTING.md](./CONTRIBUTING.md) for the development workflow and test matrix.

## Documentation

```bash
pnpm test              # unit, property, and in-process contract tests
pnpm test:integration  # Postgres journeys, Graphile jobs, LISTEN/NOTIFY
pnpm test:e2e          # Playwright against the emulated stack
pnpm test:e2e -- --sandbox=e2b # the same deterministic suite against real E2B
pnpm test:e2e -- --sandbox=daytona # the same suite against real Daytona
pnpm test:e2e -- --sandbox=box # the same suite against real Box
pnpm test:topology     # local Docker + Graphile worker recovery (needs Docker)
pnpm test:canary       # live OpenRouter / E2B / Box canaries
# explicit real vision-model + real E2B desktop acceptance test:
COMPUTER_E2E_MODEL=<vision-capable-openrouter-model-id> pnpm test:computer
```

- [Architecture Master Blueprint](./RAKAZO_MASTER_BLUEPRINT_CURRENT.md)
- [Architect Handoff Guide — Free Intelligence Gateway](./RAKAZO_ARCHITECT_HANDOFF_FREE_INTELLIGENCE_GATEWAY.md)
- [Autonomous Agent Operating Constitution (AGENTS.md)](./AGENTS.md)
- [Environment Setup & Variables Taxonomy (52+ Variables)](./docs/ENVIRONMENT_SETUP.md)
- [Upstream Compatibility & Customization Map](./UPSTREAM%20COMPATIBILITY%20%26%20CUSTOMIZATION%20MAP.md)
- [Self-hosting Guide](./docs/self-host.md)
- [Computer Runtime and Isolation](./docs/computer-runtime.md)
- [Mobile Releases](./docs/mobile-release.md)
- [Performance Testing](./docs/performance.md)

## Contributing

The Playwright workflow can also be started manually with **Sandbox provider** set to `e2b`, `daytona`, or `box`.
Those options require `E2B_API_KEY`, `DAYTONA_API_KEY`, or `BOX_API_KEY`, keep the deterministic scripted agent runtime, and destroy
the provider machines after the run. The default and all automatic runs remain on `fake`.
Contributions are welcome. Please read [CONTRIBUTING.md](./CONTRIBUTING.md) before opening a pull
request. For security vulnerabilities, follow [SECURITY.md](./SECURITY.md) instead of filing a public
issue.

Rakazo is licensed under the [Apache License 2.0](./LICENSE).

Questions and ideas are welcome in the [Rakazo Discord community](https://discord.gg/RWwKa2Sn7h).
