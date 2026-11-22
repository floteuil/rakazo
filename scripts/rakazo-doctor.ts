/**
 * Rakazo Standalone Forensic Doctor CLI (`pnpm doctor` / `pnpm doctor --json`).
 *
 * Designed for 1-command autonomous root-cause diagnosis by Antigravity or lightweight AI models:
 * executes all 10 live subsystem probes (PostgreSQL, Worker Runs, OmniRoute $0, 3,538-Skill Shards,
 * Windmill AutoLite RGPD, Windmill Proxy RGPD, MCP Guard, V8 Heap/Event-Loop, /data, Client Crashes)
 * and prints a 100% secret-redacted AI Forensic Markdown dossier.
 */
import { createDb } from "../packages/db/src/index.ts";
import { runDeepSelfDiagnostics } from "../packages/adapters/src/flight-recorder.ts";

async function main() {
  const jsonMode = process.argv.includes("--json");
  const offlineMode = process.argv.includes("--offline");

  let created: ReturnType<typeof createDb> | null = null;
  try {
    if (process.env.DATABASE_URL) {
      created = createDb(process.env.DATABASE_URL);
    }
    const report = await runDeepSelfDiagnostics({
      prisma: created?.prisma,
      dataDir: process.env.DATA_DIR || "/data",
      gitSha: process.env.GIT_SHA,
      skipExternalNetworkProbes: offlineMode,
    });

    if (jsonMode) {
      process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    } else {
      process.stdout.write(`${report.aiForensicMarkdownFr}\n`);
    }

    process.exitCode = report.overallStatus === "critical" ? 2 : 0;
  } finally {
    if (created) {
      await created.prisma.$disconnect().catch(() => undefined);
      await created.pool?.end().catch(() => undefined);
    }
  }
}

void main();
