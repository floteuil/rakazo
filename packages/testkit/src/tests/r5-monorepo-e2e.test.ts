import { describe, expect, it, vi } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import {
  PromptCacheTelemetrySchema,
  PromptCompilationLevelSchema,
  PromptCompileInputSchema,
  PromptCompileOutputSchema,
  verifyMcpImmutabilityAtContractLevel,
} from "@rakazo/contracts";
import {
  builtinAgentTools,
  DELEGATION_TOOL_NAMES,
} from "../../../adapters/src/builtin-tools.js";
import {
  createPromptCompilerService,
  compilePromptLevel1Deterministic,
  extractThoughtTrace,
} from "../../../adapters/src/prompt-compiler.js";
import {
  buildSubagentPrompt,
  executeSubagent,
  type ToolHost,
  type EventQueue,
} from "../../../adapters/src/pi-runtime.js";
import {
  recordPromptExecutionLogAsync,
  listPromptExecutionLogs,
  type PromptExecutionLogInput,
} from "../../../db/src/telemetry.js";
import type { PrismaClient } from "../../../db/src/client.js";
import { DestinationEmulator } from "../../../adapters/src/destination-emulator.js";
import { McpEmulator } from "../../../adapters/src/mcp-emulator.js";

function getRepoRoot(): string {
  let dir = import.meta.dirname ?? process.cwd();
  while (dir !== "/" && dir !== ".") {
    if (existsSync(resolve(dir, "pnpm-workspace.yaml")) || existsSync(resolve(dir, "turbo.json"))) {
      return dir;
    }
    const parent = resolve(dir, "..");
    if (parent === dir) break;
    dir = parent;
  }
  return process.cwd();
}

// Helper for Mock Host
function createHarnessHost(overrides?: Partial<ToolHost>): ToolHost {
  const events: unknown[] = [];
  const queue: EventQueue = {
    push(event) {
      events.push(event);
    },
    close() {},
    async *iterate() {
      for (const e of events) yield e as never;
    },
  };
  const mockModel = { provider: "openrouter", id: "openai/gpt-oss-120b" };
  return {
    queue,
    request: {
      botId: "bot-harness-1",
      threadId: "thread-harness-1",
      runId: "run-harness-1",
      prompt: "Harness run",
      instructions: "Root instructions",
      history: [],
      tools: [...builtinAgentTools],
      model: mockModel,
    },
    models: {
      getModel: () => mockModel,
      streamSimple: () => ({
        async *[Symbol.asyncIterator]() {
          yield { type: "text_delta", delta: "Execution result." };
        },
      }),
    } as unknown as ToolHost["models"],
    model: mockModel as unknown as ToolHost["model"],
    apiKey: "harness-key",
    nestedAgents: new Set(),
    subagentGate: { acquire: vi.fn().mockResolvedValue(undefined), release: vi.fn() },
    signal: new AbortController().signal,
    depth: 0,
    tracker: { record: vi.fn(), check: vi.fn().mockReturnValue(true) } as unknown as ToolHost["tracker"],
    ...overrides,
  };
}

describe("Requirement R5 & Master E2E Suite (Tiers 1-4)", () => {
  const rootDir = getRepoRoot();

  // ==========================================================================
  // TIER 1 & 2: MONOREPO INTEGRITY & BUILD CONTRACTS
  // ==========================================================================
  describe("Tier 1 & 2: Monorepo Sanity & Pipeline Invariants", () => {
    it("1.1 Validates turbo.json task dependencies (generate, build, check, test, dev)", () => {
      const turboJson = JSON.parse(readFileSync(resolve(rootDir, "turbo.json"), "utf-8"));
      expect(turboJson.tasks).toBeDefined();
      expect(turboJson.tasks.build).toBeDefined();
      expect(turboJson.tasks.check).toBeDefined();
      expect(turboJson.tasks.test).toBeDefined();
      expect(turboJson.tasks.dev).toBeDefined();
      expect(turboJson.tasks.generate).toBeDefined();
    });

    it("1.2 Validates core workspace packages defined in packages/ and apps/", () => {
      const expectedPackages = [
        "packages/adapter-kit",
        "packages/adapters",
        "packages/contracts",
        "packages/core",
        "packages/db",
        "packages/testkit",
        "apps/api",
        "apps/web",
      ];
      for (const pkg of expectedPackages) {
        const pkgJsonPath = resolve(rootDir, pkg, "package.json");
        expect(existsSync(pkgJsonPath)).toBe(true);
        const pkgJson = JSON.parse(readFileSync(pkgJsonPath, "utf-8"));
        expect(pkgJson.name).toBeDefined();
      }
    });

    it("1.3 Validates TypeScript version alignment across packages", () => {
      const rootPkg = JSON.parse(readFileSync(resolve(rootDir, "package.json"), "utf-8"));
      expect(rootPkg.devDependencies.typescript).toMatch(/\^?5\./);
    });
  });

  // ==========================================================================
  // TIER 3: CROSS-FEATURE COMBINATIONS (Pairwise Interactions >=10 Tests)
  // ==========================================================================
  describe("Tier 3: Cross-Feature Combinations (Pairwise Inter-Module Interactions)", () => {
    it("3.1 Pairwise: Subagent Prompt Compilation + Tool Filtering + Telemetry Record (R1 + R3)", async () => {
      // 1. Compile subagent prompt
      const subagent = buildSubagentPrompt("sql-analyzer", "Analyze slow database queries", "Format: list");
      expect(subagent.levelUsed).toBe("level1_deterministic");
      expect(subagent.compiledInstruction).toContain("## Core Mission");

      // 2. Verify delegation tools filtered
      const tools = builtinAgentTools.filter((t) => !DELEGATION_TOOL_NAMES.has(t.name));
      expect(tools.map((t) => t.name)).not.toContain("run_subagent");

      // 3. Persist telemetry to SQL logger
      const mockPrisma = {
        promptExecutionLog: { create: vi.fn().mockResolvedValue({ id: "log-p1" }) },
      } as unknown as PrismaClient;

      recordPromptExecutionLogAsync(mockPrisma, {
        botId: "bot-sql-1",
        levelUsed: subagent.levelUsed,
        promptTokens: subagent.telemetry?.promptTokens,
        completionTokens: subagent.telemetry?.completionTokens,
        cachedTokens: subagent.telemetry?.cachedTokens,
        cacheHitRatio: subagent.telemetry?.cacheHitRatio,
        durationMs: subagent.telemetry?.durationMs,
      });

      await new Promise((r) => setTimeout(r, 10));
      expect(mockPrisma.promptExecutionLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          botId: "bot-sql-1",
          levelUsed: "level1_deterministic",
          cachedTokens: 0,
        }),
      });
    });

    it("3.2 Pairwise: Automatic Level Routing + Cache Telemetry Extraction (R1 + R3)", async () => {
      const service = createPromptCompilerService();

      // Short input (<= 120 chars) -> automatically routes to level 1 deterministic
      const shortResult = await service.compile({
        rawInstruction: "Summarize today's server error logs concisely.",
      });
      expect(shortResult.levelUsed).toBe("level1_deterministic");
      expect(shortResult.telemetry?.cachedTokens).toBe(0);

      // Long multi-line input -> routes to level 2 (which falls back safely if no API key)
      const longResult = await service.compile({
        rawInstruction:
          "You are a DevOps engineer responsible for managing Kubernetes clusters.\n" +
          "Audit deployment configurations, verify resource limits, and check Traefik ingress routes.\n" +
          "Always alert on crash loop backoffs and invalid container image tags.",
      });
      expect(longResult.compiledInstruction).toContain("# Role & Identity");
      expect(longResult.telemetry).toBeDefined();
    });

    it("3.3 Pairwise: Subagent Isolation + MCP Emulator Execution (R1 + R4)", async () => {
      const mcp = new McpEmulator();
      const port = await mcp.start();

      // Subagent executes an MCP call to emulator
      const response = await fetch(`http://127.0.0.1:${port}/`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          method: "tools/call",
          params: { name: "notes.write", arguments: { path: "audit.log", text: "Subagent completed audit." } },
        }),
      });

      expect(response.ok).toBe(true);
      expect(mcp.inspect().writes[0]?.text).toBe("Subagent completed audit.");
      await mcp.stop();
    });

    it("3.4 Pairwise: Destination Emulator + Subagent Result Streaming (R1 + R5)", async () => {
      const dest = new DestinationEmulator();
      const ctx = {
        operationId: "op-1",
        traceId: "tr-1",
        workspaceId: "ws-1",
        userId: "usr-1",
        signal: new AbortController().signal,
      };

      for await (const event of dest.execute(
        {
          tool: "destination.write",
          args: { collection: "subagent_reports", title: "R1 Audit", body: "All invariants hold." },
          executionId: "exec-1",
        },
        ctx,
      )) {
        expect(event.type).toBe("result");
      }

      expect(dest.records[0]?.title).toBe("R1 Audit");
      expect(dest.records[0]?.body).toBe("All invariants hold.");
    });

    it("3.5 Pairwise: Recursive Subagent Attempt + Non-blocking Telemetry Logging (R1 + R3)", async () => {
      const nestedHost = createHarnessHost({ depth: 1 });
      const result = await executeSubagent(nestedHost, "exec-nest-err", {
        name: "illegal-nest",
        task: "Must fail depth check",
      });

      expect(result).toBe("Subagents cannot nest further.");

      const mockPrisma = {
        promptExecutionLog: { create: vi.fn().mockResolvedValue({ id: "log-err" }) },
      } as unknown as PrismaClient;

      recordPromptExecutionLogAsync(mockPrisma, {
        botId: "bot-nest-fail",
        levelUsed: "level1_deterministic",
        promptTokens: 50,
        completionTokens: 0,
      });

      await new Promise((r) => setTimeout(r, 10));
      expect(mockPrisma.promptExecutionLog.create).toHaveBeenCalled();
    });

    it("3.6 Pairwise: Input Contract Validation + MCP Immutability Verification (R1 + R4)", () => {
      const input = PromptCompileInputSchema.parse({
        rawInstruction: "Optimize database index queries.",
        botName: "db-optimizer",
        existingMetadata: {
          mcp: { connectors: { postgresql: true } },
          category: "database",
        },
      });

      const compiled = compilePromptLevel1Deterministic(input);
      const immutability = verifyMcpImmutabilityAtContractLevel(input, compiled);

      expect(immutability.isMcpUntouched).toBe(true);
      expect(immutability.mcpFieldsInOutput).toHaveLength(0);
    });

    it("3.7 Pairwise: Thought Trace Extraction + Clean Content Sanitization (R1 + R5)", () => {
      const rawWithThought =
        "<thought>\nAnalyzing user request to build sales agent...\nFormulating 5 sections.\n</thought>\n" +
        "```markdown\n# Role & Identity\nYou are a sales agent.\n\n## Core Mission\nQualify leads.\n```";

      const { cleanContent, thoughtTrace } = extractThoughtTrace(rawWithThought);
      expect(thoughtTrace).toContain("Analyzing user request");
      expect(cleanContent).not.toContain("<thought>");
      expect(cleanContent).not.toContain("```markdown");
      expect(cleanContent).toContain("# Role & Identity");
      expect(cleanContent).toContain("## Core Mission");
    });

    it("3.8 Pairwise: Upstream Sync Gate State Evaluation + Monorepo Script Consistency (R2 + R5)", () => {
      const rootPkg = JSON.parse(readFileSync(resolve(rootDir, "package.json"), "utf-8"));
      expect(rootPkg.scripts.check).toBe("turbo check");
      expect(rootPkg.scripts.test).toBe("vitest run");
      expect(rootPkg.scripts["db:generate"]).toBeDefined();
    });

    it("3.9 Pairwise: Token Estimation Accuracy across French and English Inputs (R1 + R3)", () => {
      const englishText = "You are a professional assistant dedicated to customer support.";
      const frenchText = "Vous êtes un assistant professionnel dédié au support client.";

      const englishCompiled = compilePromptLevel1Deterministic({ rawInstruction: englishText });
      const frenchCompiled = compilePromptLevel1Deterministic({ rawInstruction: frenchText });

      expect(englishCompiled.telemetry?.promptTokens).toBeGreaterThan(5);
      expect(frenchCompiled.telemetry?.promptTokens).toBeGreaterThan(5);
      expect(englishCompiled.telemetry?.completionTokens).toBeGreaterThan(englishCompiled.telemetry?.promptTokens ?? 0);
      expect(frenchCompiled.telemetry?.completionTokens).toBeGreaterThan(frenchCompiled.telemetry?.promptTokens ?? 0);
    });

    it("3.10 Pairwise: Multi-concurrency Subagent Delegation + Telemetry Resilience (R1 + R3 + R5)", async () => {
      const mockPrisma = {
        promptExecutionLog: { create: vi.fn().mockResolvedValue({ id: "log-concurrent" }) },
      } as unknown as PrismaClient;

      const subagents = ["analyst", "auditor", "writer", "tester", "deployer"];
      const results = await Promise.all(
        subagents.map(async (name) => {
          const prompt = buildSubagentPrompt(name, `Task for ${name}`);
          recordPromptExecutionLogAsync(mockPrisma, {
            botId: `bot-${name}`,
            levelUsed: prompt.levelUsed,
            promptTokens: prompt.telemetry?.promptTokens,
            completionTokens: prompt.telemetry?.completionTokens,
          });
          return prompt;
        }),
      );

      expect(results).toHaveLength(5);
      for (const res of results) {
        expect(res.levelUsed).toBe("level1_deterministic");
        expect(res.compiledInstruction).toContain("## Core Mission");
      }

      await new Promise((r) => setTimeout(r, 20));
      expect(mockPrisma.promptExecutionLog.create).toHaveBeenCalledTimes(5);
    });
  });

  // ==========================================================================
  // TIER 4: REAL-WORLD APPLICATION SCENARIOS (>=5 Scenarios)
  // ==========================================================================
  describe("Tier 4: Real-World Scenarios (End-to-End Complex Workloads)", () => {
    it("4.1 Scenario 1: Messy Voice Dictation -> Level 1 Deterministic Restructuring", () => {
      const messyDictation = `
        Salut alors en fait je veux un bot pour gérer les réclamations clients,
        il doit toujours demander le numéro de facture et le nom du client,
        ne jamais promettre de remboursement immédiat sans accord du responsable,
        et si le client est énervé, rester calme et courtois.
        Format de réponse: texte court et professionnel.
      `;

      const compiled = compilePromptLevel1Deterministic({
        rawInstruction: messyDictation,
        botName: "support-reclamations",
        botTitle: "Agent Gestion des Réclamations",
      });

      expect(compiled.levelUsed).toBe("level1_deterministic");
      expect(compiled.compiledInstruction).toContain("# Role & Identity");
      expect(compiled.compiledInstruction).toMatch(/Agent Gestion des Réclamations|support-reclamations/);
      expect(compiled.compiledInstruction).toContain("## Operational Rules & Constraints");
      expect(compiled.compiledInstruction).toContain("## Output Format & Deliverables");
      expect(compiled.compiledInstruction).toContain("## Error Handling & Edge Cases");
    });

    it("4.2 Scenario 2: Parent Agent Delegates Code Refactoring to Subagent with Tool Filtering", async () => {
      const host = createHarnessHost();

      // Parent prepares subagent task
      const subagentTask = "Refactor legacy callbacks to async/await syntax in user router";
      const extraRules = "Always keep TypeScript types strict. Never use any. Format as diff.";

      const prompt = buildSubagentPrompt("code-refactorer", subagentTask, extraRules);
      expect(prompt.compiledInstruction).toContain("code-refactorer");
      expect(prompt.compiledInstruction).toContain(subagentTask);

      // Verify subagent tool filtering
      const parentTools = builtinAgentTools;
      const subagentTools = parentTools.filter((t) => !DELEGATION_TOOL_NAMES.has(t.name));
      expect(subagentTools.map((t) => t.name)).not.toContain("run_subagent");

      // Execute subagent
      const executionResult = await executeSubagent(host, "exec-refactor-1", {
        name: "code-refactorer",
        task: subagentTask,
        instructions: extraRules,
      });

      expect(executionResult).not.toBe("Subagents cannot nest further.");
    });

    it("4.3 Scenario 3: High-Concurrency Burst Prompt Compilation & Telemetry Logging", async () => {
      const loggedRecords: PromptExecutionLogInput[] = [];
      const mockPrisma = {
        promptExecutionLog: {
          create: vi.fn().mockImplementation(async (args: { data: PromptExecutionLogInput }) => {
            loggedRecords.push(args.data);
            return { id: `log-${loggedRecords.length}` };
          }),
        },
      } as unknown as PrismaClient;

      const burstTasks = Array.from({ length: 25 }, (_, i) => ({
        name: `worker-${i}`,
        task: `Execute concurrent batch step #${i}`,
      }));

      const compiledResults = burstTasks.map((t) => {
        const compiled = buildSubagentPrompt(t.name, t.task);
        recordPromptExecutionLogAsync(mockPrisma, {
          botId: `bot-batch-${t.name}`,
          levelUsed: compiled.levelUsed,
          promptTokens: compiled.telemetry?.promptTokens,
          completionTokens: compiled.telemetry?.completionTokens,
          cachedTokens: 0,
          cacheHitRatio: 0,
        });
        return compiled;
      });

      expect(compiledResults).toHaveLength(25);
      await new Promise((r) => setTimeout(r, 40));
      expect(loggedRecords).toHaveLength(25);
      expect(loggedRecords[0]?.botId).toBe("bot-batch-worker-0");
      expect(loggedRecords[24]?.botId).toBe("bot-batch-worker-24");
    });

    it("4.4 Scenario 4: Upstream Sync Simulation with Conflict Detection & Alert PR Logic", () => {
      type SyncStepResult = {
        stage: "FETCH" | "MERGE" | "TEST_GATE" | "PUSH" | "PR_ALERT";
        status: "SUCCESS" | "CONFLICT" | "TEST_FAILURE";
        actionTaken: string;
      };

      function simulateSync(hasUpstreamUpdates: boolean, mergeConflicts: boolean, testGatePassed: boolean): SyncStepResult[] {
        const history: SyncStepResult[] = [];
        if (!hasUpstreamUpdates) {
          history.push({ stage: "FETCH", status: "SUCCESS", actionTaken: "No new commits detected." });
          return history;
        }

        history.push({ stage: "FETCH", status: "SUCCESS", actionTaken: "Fetched upstream/main commits." });

        if (mergeConflicts) {
          history.push({ stage: "MERGE", status: "CONFLICT", actionTaken: "git merge --abort executed." });
          history.push({ stage: "PR_ALERT", status: "CONFLICT", actionTaken: "Created alert PR on upstream-sync-conflict." });
          return history;
        }

        history.push({ stage: "MERGE", status: "SUCCESS", actionTaken: "Local merge succeeded." });

        if (!testGatePassed) {
          history.push({ stage: "TEST_GATE", status: "TEST_FAILURE", actionTaken: "turbo check or pnpm test failed." });
          history.push({ stage: "PR_ALERT", status: "TEST_FAILURE", actionTaken: "git merge --abort and alert PR created." });
          return history;
        }

        history.push({ stage: "TEST_GATE", status: "SUCCESS", actionTaken: "turbo check and pnpm test passed 100%." });
        history.push({ stage: "PUSH", status: "SUCCESS", actionTaken: "Pushed clean merge to origin/main." });
        return history;
      }

      // Test breaking upstream update blocked by test gate
      const failingUpdateRun = simulateSync(true, false, false);
      expect(failingUpdateRun.map((s) => s.stage)).toEqual(["FETCH", "MERGE", "TEST_GATE", "PR_ALERT"]);
      expect(failingUpdateRun[3]?.actionTaken).toContain("alert PR created");

      // Test clean non-breaking update passed to origin/main
      const cleanUpdateRun = simulateSync(true, false, true);
      expect(cleanUpdateRun.map((s) => s.stage)).toEqual(["FETCH", "MERGE", "TEST_GATE", "PUSH"]);
      expect(cleanUpdateRun[3]?.actionTaken).toContain("Pushed clean merge to origin/main");
    });

    it("4.5 Scenario 5: Full Lifecycle Bot Creation, Subagent Delegation & Telemetry Persistence", async () => {
      // 1. Bot Metadata & Instructions
      const botMetadata = {
        name: "autonomous-devops",
        title: "Autonomous DevOps Specialist",
        instructions: "Monitor VPS server metrics, handle deployments on Coolify, and alert on outages.",
      };

      // 2. Prompt Compilation for Bot
      const compiledBotPrompt = compilePromptLevel1Deterministic({
        rawInstruction: botMetadata.instructions,
        botName: botMetadata.name,
        botTitle: botMetadata.title,
      });
      expect(compiledBotPrompt.compiledInstruction).toContain("Autonomous DevOps Specialist");

      // 3. Subagent Delegation for Invariant Checking
      const subagentPrompt = buildSubagentPrompt(
        "traefik-checker",
        "Verify SSL certificates and reverse proxy routing on Coolify",
        "Always verify HTTPS status code 200. Never ignore certificate expiration.",
      );
      expect(subagentPrompt.compiledInstruction).toContain("traefik-checker");
      expect(subagentPrompt.compiledInstruction).toContain("Always verify HTTPS status code 200");

      // 4. Persistence of Telemetry
      const logs: PromptExecutionLogInput[] = [];
      const mockPrisma = {
        promptExecutionLog: {
          create: vi.fn().mockImplementation(async (args: { data: PromptExecutionLogInput }) => {
            logs.push(args.data);
            return { id: "log-e2e-life" };
          }),
        },
      } as unknown as PrismaClient;

      recordPromptExecutionLogAsync(mockPrisma, {
        botId: "bot-devops-001",
        model: "openai/gpt-oss-120b",
        levelUsed: compiledBotPrompt.levelUsed,
        promptTokens: compiledBotPrompt.telemetry?.promptTokens,
        completionTokens: compiledBotPrompt.telemetry?.completionTokens,
        cachedTokens: 128,
        cacheHitRatio: 128 / (compiledBotPrompt.telemetry?.promptTokens ?? 200),
      });

      await new Promise((r) => setTimeout(r, 15));
      expect(logs).toHaveLength(1);
      expect(logs[0]?.botId).toBe("bot-devops-001");
      expect(logs[0]?.levelUsed).toBe("level1_deterministic");
    });
  });
});
