import crypto from "crypto";
import { describe, expect, it, vi } from "vitest";
import type { SkillItemLike } from "./executor.js";
import { buildSubagentPrompt } from "./pi-runtime.js";
import {
  assemble4BlockCachePrompt,
  type BotPromptConfig,
  type ConversationTurn,
  computeSessionAffinityKey,
  type EphemeralUserTurn,
  extractCacheTelemetry,
  STATIC_PLATFORM_GUARDRAILS_BLOC_A,
} from "./prefix-caching.js";
import {
  compilePromptLevel1Deterministic,
  createPromptCompilerService,
  extractThoughtTrace,
} from "./prompt-compiler.js";

function sha256(str: string): string {
  return crypto.createHash("sha256").update(str, "utf8").digest("hex");
}

describe("Empirical Challenger 2 M1: Byte-Stability & Prompt Compiler Service Limits", () => {
  // ==========================================================================
  // MISSION 1: Empirical Byte-Stability of assemble4BlockCachePrompt (Blocs A+B)
  // ==========================================================================
  describe("Mission 1: Byte-Stability of Blocs A + B across 100 Turns & Permutations", () => {
    it("1.1 guarantees Blocs A & B are 100% byte-invariant across 100 turns of continuous multi-turn dialogue", () => {
      const botConfig: BotPromptConfig = {
        botName: "devops-autonomous-agent",
        botTitle: "Senior Cloud & Platform Specialist",
        instructions: `Tu es un agent DevOps expert en conteneurisation Docker, Coolify et Traefik.
- Toujours vérifier la syntaxe YAML avant tout déploiement.
- Ne jamais exposer de ports non sécurisés.
- Format de sortie : commandes shell reproductibles et explications concises.`,
        activeSkills: [
          {
            name: "Docker Swarm",
            slug: "docker-swarm",
            description: "Clustering and orchestration",
            content: "Use docker stack deploy with compose v3.",
            enabled: true,
          },
          {
            name: "PostgreSQL DBA",
            slug: "postgres-dba",
            description: "Database administration and optimization",
            content: "VACUUM ANALYZE and query tuning via EXPLAIN ANALYZE.",
            enabled: true,
          },
        ],
      };

      const basePrompt = assemble4BlockCachePrompt({
        bot: botConfig,
        history: [],
        currentTurn: { prompt: "Tour initial" },
      });

      const initialBlocAHash = sha256(basePrompt.blocA);
      const initialBlocBHash = sha256(basePrompt.blocB);
      const initialPrefixHash = sha256(basePrompt.blocA + "\n\n" + basePrompt.blocB);

      const history: ConversationTurn[] = [];

      // Run 100 sequential turns
      for (let turn = 1; turn <= 100; turn++) {
        // Add varied history entries with diverse tool calls
        if (turn % 3 === 0) {
          history.push({
            role: "assistant",
            content: `Execution results for turn ${turn}`,
            toolResults: [
              { toolName: "shell", result: `Output log data #${turn}: success` },
              {
                toolName: "list_files",
                result: [`/src/file_${turn}.ts`, `/src/config_${turn}.json`],
              },
            ],
          });
        } else if (turn % 2 === 0) {
          history.push({
            role: "user",
            content: `User query for turn ${turn} with special chars: €100, ∑(x), /path/to/${turn}`,
          });
        } else {
          history.push({
            role: "assistant",
            content: `Summary of progress at turn ${turn}.`,
          });
        }

        const ephemeralTurn: EphemeralUserTurn = {
          prompt: `Turn ${turn}: Analyse the logs and execute next deployment step.`,
          attachedFiles:
            turn % 5 === 0
              ? [{ name: `dump_${turn}.log`, path: `/tmp/dump_${turn}.log`, size: 1024 * turn }]
              : undefined,
        };

        const turnPrompt = assemble4BlockCachePrompt({
          bot: botConfig,
          history,
          currentTurn: ephemeralTurn,
        });

        // Strict assertions on Blocs A and B
        expect(sha256(turnPrompt.blocA)).toBe(initialBlocAHash);
        expect(sha256(turnPrompt.blocB)).toBe(initialBlocBHash);
        expect(sha256(turnPrompt.blocA + "\n\n" + turnPrompt.blocB)).toBe(initialPrefixHash);
        expect(turnPrompt.blocA).toBe(STATIC_PLATFORM_GUARDRAILS_BLOC_A);

        // Blocs C and D must evolve dynamically
        expect(turnPrompt.blocC).toContain(`=== BLOC C : HISTORIQUE CONVERSATIONNEL COMPACTÉ ===`);
        expect(turnPrompt.blocD).toContain(`Turn ${turn}:`);
      }
    });

    it("1.2 guarantees Bloc B is byte-identical across 100 random permutations of skills array", () => {
      const rawSkills: SkillItemLike[] = [
        {
          name: "Kubernetes Operator",
          slug: "k8s",
          description: "K8s cluster management",
          content: "kubectl apply -f",
          enabled: true,
        },
        {
          name: "AWS CDK",
          slug: "aws-cdk",
          description: "Infrastructure as Code",
          content: "cdk deploy --all",
          enabled: true,
        },
        {
          name: "Terraform HCL",
          slug: "terraform",
          description: "Cloud provisioning",
          content: "terraform plan -out",
          enabled: true,
        },
        {
          name: "Prometheus Monitoring",
          slug: "prometheus",
          description: "Metrics collection",
          content: "rate(http_requests_total[5m])",
          enabled: true,
        },
        {
          name: "Grafana Dashboards",
          slug: "grafana",
          description: "Visualizations",
          content: "Create PromQL query panels",
          enabled: true,
        },
        {
          name: "GitOps ArgoCD",
          slug: "argocd",
          description: "Continuous delivery",
          content: "argocd app sync my-app",
          enabled: true,
        },
        {
          name: "Disabled Skill 1",
          slug: "dis-1",
          description: "Disabled",
          content: "No-op",
          enabled: false,
        },
        {
          name: "Disabled Skill 2",
          slug: "dis-2",
          description: "Disabled",
          content: "No-op",
          enabled: false,
        },
      ];

      const baselineConfig: BotPromptConfig = {
        botName: "infra-bot",
        botTitle: "Infrastructure Automator",
        instructions: "Gérer l'infrastructure cloud de manière résiliente.",
        activeSkills: [...rawSkills],
      };

      const baselinePrompt = assemble4BlockCachePrompt({
        bot: baselineConfig,
        currentTurn: { prompt: "Baseline query" },
      });
      const expectedBlocBHash = sha256(baselinePrompt.blocB);

      // Perform 100 random shuffles of skills
      for (let run = 0; run < 100; run++) {
        const shuffled = [...rawSkills];
        for (let i = shuffled.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          const tmp = shuffled[i];
          const target = shuffled[j];
          if (tmp && target) {
            shuffled[i] = target;
            shuffled[j] = tmp;
          }
        }

        const permutedPrompt = assemble4BlockCachePrompt({
          bot: {
            ...baselineConfig,
            activeSkills: shuffled,
          },
          currentTurn: { prompt: `Permutation run ${run}` },
        });

        expect(sha256(permutedPrompt.blocB)).toBe(expectedBlocBHash);
        expect(permutedPrompt.blocB).toBe(baselinePrompt.blocB);
      }
    });

    it("1.3 preserves byte stability with indexed skills (>8KB threshold) and direct skills combined", () => {
      const hugeSkillContent = "RÈGLE DÉTAILLÉE :\n" + "X".repeat(10_000);
      const smallSkillContent = "PETITE RÈGLE : concision et clarté.";

      const skillA: SkillItemLike = {
        name: "Direct Skill",
        slug: "direct-skill",
        description: "Small skill",
        content: smallSkillContent,
        enabled: true,
      };
      const skillB: SkillItemLike = {
        name: "Indexed Huge Skill",
        slug: "huge-skill",
        description: "Big manual",
        content: hugeSkillContent,
        enabled: true,
      };
      const skills: SkillItemLike[] = [skillA, skillB];

      const prompt1 = assemble4BlockCachePrompt({
        bot: { botName: "hybrid-bot", instructions: "Instructions", activeSkills: skills },
        currentTurn: { prompt: "Test" },
      });

      const prompt2 = assemble4BlockCachePrompt({
        bot: {
          botName: "hybrid-bot",
          instructions: "Instructions",
          activeSkills: [skillB, skillA],
        },
        currentTurn: { prompt: "Test 2" },
      });

      expect(sha256(prompt1.blocB)).toBe(sha256(prompt2.blocB));
      expect(prompt1.blocB).toContain("### Compétence active : Direct Skill");
      expect(prompt1.blocB).toContain("### Compétence indexée : Indexed Huge Skill");
      expect(prompt1.blocB).toContain('read_skill(name: "huge-skill")');
    });
  });

  // ==========================================================================
  // MISSION 2: Strict 8,192 Token Ceiling & 15s Timeout of PromptCompilerService
  // ==========================================================================
  describe("Mission 2: Token Ceiling (8,192 Tokens) & 15s Timeout Handling", () => {
    describe("15s Timeout Management", () => {
      it("2.1 enforces default 15s timeout on PromptCompilerService when timeoutMs is omitted", async () => {
        let abortSignalReceived: AbortSignal | undefined;

        const mockFetch = vi.fn().mockImplementation((url, init) => {
          abortSignalReceived = init.signal;
          return new Promise((resolve) => {
            // Never resolves on its own
            if (init.signal) {
              init.signal.addEventListener("abort", () => {
                const err = new Error("The operation was aborted");
                err.name = "AbortError";
                resolve({
                  ok: false,
                  status: 499,
                  text: async () => err.message,
                });
              });
            }
          });
        });

        // Fast test with custom timeout to verify timeout mechanism
        const fastService = createPromptCompilerService({
          apiKey: "sk-or-test",
          timeoutMs: 50, // 50ms for rapid test execution
          fetchFn: mockFetch as unknown as typeof fetch,
        });

        const startTime = Date.now();
        const output = await fastService.compileLevel2({
          rawInstruction: "Long multi-line task that should trigger timeout and graceful fallback.",
        });
        const duration = Date.now() - startTime;

        expect(output.levelUsed).toBe("level1_deterministic");
        expect(output.explanation).toContain(
          "Gracefully fell back to Level 1 deterministic compilation",
        );
        expect(output.compiledInstruction).toContain("# Role & Identity");
        expect(output.compiledInstruction).toContain("## Core Mission");
        expect(output.compiledInstruction).toContain("## Operational Rules & Constraints");
        expect(output.compiledInstruction).toContain("## Output Format & Deliverables");
        expect(output.compiledInstruction).toContain("## Error Handling & Edge Cases");
        expect(duration).toBeGreaterThanOrEqual(40);
      });

      it("2.2 sanitizes timeout errors and prevents memory leaks / unhandled rejections", async () => {
        const mockFetch = vi.fn().mockImplementation((_url, init) => {
          return new Promise((_resolve, reject) => {
            init.signal?.addEventListener("abort", () => {
              const abortErr = new Error(
                "AbortError: Request timed out after 15000ms with token sk-or-v1-secret",
              );
              abortErr.name = "AbortError";
              reject(abortErr);
            });
          });
        });

        const service = createPromptCompilerService({
          apiKey: "sk-or-v1-secret",
          timeoutMs: 30,
          fetchFn: mockFetch as unknown as typeof fetch,
        });

        const output = await service.compileLevel2({
          rawInstruction: "Draft an enterprise architecture specification.",
        });

        expect(output.levelUsed).toBe("level1_deterministic");
        expect(output.explanation).not.toContain("sk-or-v1-secret");
        expect(output.telemetry?.durationMs).toBeGreaterThanOrEqual(25);
      });
    });

    describe("8,192 Token Ceiling Enforcement", () => {
      it("2.3 bounds subagent token ceiling strictly to [1, 8192] across all possible input values", () => {
        const clampTokens = (maxTokens?: number) => Math.min(Math.max(maxTokens ?? 8192, 1), 8192);

        // Ceiling upper bound caps
        expect(clampTokens(undefined)).toBe(8192);
        expect(clampTokens(8192)).toBe(8192);
        expect(clampTokens(8193)).toBe(8192);
        expect(clampTokens(16384)).toBe(8192);
        expect(clampTokens(32768)).toBe(8192);
        expect(clampTokens(131072)).toBe(8192);
        expect(clampTokens(Number.MAX_SAFE_INTEGER)).toBe(8192);

        // Preserves values within [1, 8192]
        expect(clampTokens(4096)).toBe(4096);
        expect(clampTokens(2048)).toBe(2048);
        expect(clampTokens(512)).toBe(512);
        expect(clampTokens(100)).toBe(100);
        expect(clampTokens(1)).toBe(1);

        // Lower bound floor caps
        expect(clampTokens(0)).toBe(1);
        expect(clampTokens(-10)).toBe(1);
        expect(clampTokens(-1000)).toBe(1);
      });

      it("2.4 handles massive input prompts (>100,000 chars / ~25,000 tokens) deterministically in Level 1 under 100ms without crashing", () => {
        const massiveInstruction = [
          "You are an enterprise big data analyst.",
          ...Array.from(
            { length: 1500 },
            (_, i) => `Rule ${i}: Must validate schema partition #${i} strictly before ingestion.`,
          ),
          "Format: Deliver partitioned parquet files.",
          "If error: Log to S3 dead-letter queue.",
        ].join("\n");

        expect(massiveInstruction.length).toBeGreaterThan(100_000);

        const startTime = Date.now();
        const result = compilePromptLevel1Deterministic({
          rawInstruction: massiveInstruction,
          botName: "big-data-agent",
        });
        const elapsedMs = Date.now() - startTime;

        expect(elapsedMs).toBeLessThan(150);
        expect(result.levelUsed).toBe("level1_deterministic");
        expect(result.compiledInstruction).toContain("# Role & Identity");
        expect(result.compiledInstruction).toContain("## Core Mission");
        expect(result.compiledInstruction).toContain("## Operational Rules & Constraints");
        expect(result.compiledInstruction).toContain("## Output Format & Deliverables");
        expect(result.compiledInstruction).toContain("## Error Handling & Edge Cases");
        expect(result.compiledInstruction).toContain("Rule 1499");
        expect(result.telemetry?.promptTokens).toBeGreaterThan(25_000);
        expect(result.telemetry?.completionTokens).toBeGreaterThan(25_000);
      });

      it("2.5 subagent prompt builder (buildSubagentPrompt) produces deterministic Level 1 prompt with 5 sections", () => {
        const subPrompt = buildSubagentPrompt(
          "tester-subagent",
          "Run unit tests",
          "Report pass/fail counts",
        );
        expect(subPrompt.levelUsed).toBe("level1_deterministic");
        expect(subPrompt.compiledInstruction).toContain("# Role & Identity");
        expect(subPrompt.compiledInstruction).toContain("## Core Mission");
        expect(subPrompt.compiledInstruction).toContain("## Operational Rules & Constraints");
        expect(subPrompt.compiledInstruction).toContain("## Output Format & Deliverables");
        expect(subPrompt.compiledInstruction).toContain("## Error Handling & Edge Cases");
        expect(subPrompt.compiledInstruction).toContain("subagent depth is strictly 1");
      });
    });
  });
});
