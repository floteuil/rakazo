import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@rakazo/db";
import { createRunExecutor } from "./executor.js";
import { FakeSandboxProvider } from "./fake-sandbox.js";

// Helper to create a fully wired Executor test harness
function createExecutorTestHarness(initialSkills: Array<{
  id: string;
  workspaceId: string;
  name: string;
  slug: string;
  description: string | null;
  content: string;
  tags: unknown;
  metadata?: Record<string, unknown>;
}> = []) {
  const skillsStore = [...initialSkills];

  // In-memory Prisma mock for testing executor
  const mockPrisma = {
    run: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => ({
        id: where.id,
        botId: "bot-1",
        threadId: "thread-1",
        taskId: "task-1",
        userId: "user-1",
        workspaceId: where.id.includes("tenant-b") ? "ws-tenant-b" : "ws-tenant-a",
        status: "queued",
        trigger: "manual",
        leaseFence: 0,
      })),
      findUniqueOrThrow: vi.fn(async ({ where }: { where: { id: string } }) => ({
        id: where.id,
        botId: "bot-1",
        threadId: "thread-1",
        taskId: "task-1",
        userId: "user-1",
        workspaceId: where.id.includes("tenant-b") ? "ws-tenant-b" : "ws-tenant-a",
        status: "leased",
        startedAt: new Date(),
      })),
      updateMany: vi.fn(async () => ({ count: 1 })),
    },
    bot: {
      findUnique: vi.fn(async () => ({
        id: "bot-1",
        computerId: "comp-1",
        computerSwitching: false,
      })),
      findUniqueOrThrow: vi.fn(async () => ({
        id: "bot-1",
        name: "TestBot",
        title: "Test Bot",
        description: "Bot for testing",
        instructions: "Follow instructions",
        workspaceId: "ws-tenant-a",
        computerId: "comp-1",
        computerSwitching: false,
        computer: {
          id: "comp-1",
          homeKey: "home-1",
          scope: "dedicated",
          state: "running",
          providerRef: "fake-home-1",
          kind: "fake",
        },
      })),
    },
    computer: {
      findUniqueOrThrow: vi.fn(async () => ({
        id: "comp-1",
        homeKey: "home-1",
        scope: "dedicated",
        state: "running",
        providerRef: "fake-home-1",
        kind: "fake",
        controlLeaseId: null,
      })),
      findUnique: vi.fn(async () => ({
        id: "comp-1",
        homeKey: "home-1",
        scope: "dedicated",
        state: "running",
        providerRef: "fake-home-1",
        kind: "fake",
        controlLeaseId: null,
      })),
      updateMany: vi.fn(async () => ({ count: 1 })),
    },
    userModelCredential: {
      findFirst: vi.fn(async () => null),
    },
    thread: {
      findUniqueOrThrow: vi.fn(async () => ({
        id: "thread-1",
        historyCompactedUpToSeq: null,
      })),
    },
    task: {
      findUniqueOrThrow: vi.fn(async () => ({
        id: "task-1",
        prompt: "Perform skill evaluation",
      })),
    },
    message: {
      findMany: vi.fn(async () => []),
    },
    connection: {
      findMany: vi.fn(async () => []),
    },
    attempt: {
      create: vi.fn(async () => ({ id: "attempt-1" })),
      update: vi.fn(async () => ({ id: "attempt-1" })),
      updateMany: vi.fn(async () => ({ count: 1 })),
      findUnique: vi.fn(async () => ({ id: "attempt-1" })),
    },
    deploymentSettings: {
      findUnique: vi.fn(async () => null),
    },
    taughtSkill: {
      findMany: vi.fn(async () => []),
    },
    botSkill: {
      findMany: vi.fn(async () => []),
    },
    skill: {
      findFirst: vi.fn(async ({ where }: {
        where: {
          workspaceId: string;
          OR: Array<{ slug?: string; name?: { equals: string; mode?: string }; id?: string }>;
        };
      }) => {
        return skillsStore.find((skill) => {
          if (skill.workspaceId !== where.workspaceId) return false;
          return where.OR.some((clause) => {
            if (clause.slug !== undefined && skill.slug.toLowerCase() === clause.slug.toLowerCase()) {
              return true;
            }
            if (clause.name?.equals !== undefined) {
              if (clause.name.mode === "insensitive") {
                return skill.name.toLowerCase() === clause.name.equals.toLowerCase();
              }
              return skill.name === clause.name.equals;
            }
            if (clause.id !== undefined && skill.id === clause.id) {
              return true;
            }
            return false;
          });
        }) ?? null;
      }),
    },
    $transaction: vi.fn(async (cb: (tx: unknown) => unknown) => cb(mockPrisma)),
  } as unknown as PrismaClient;

  let capturedApplyTool: ((name: string, args: Record<string, unknown>, executionId: string) => Promise<unknown>) | null = null;

  const mockRuntime = {
    describe: () => ({ capabilities: { scripted: false } }),
    run: async function* (options: {
      executeTool?: (name: string, args: Record<string, unknown>, executionId: string) => Promise<unknown>;
    }) {
      if (options.executeTool) {
        capturedApplyTool = options.executeTool;
      }
      yield { type: "text", text: "Ready" };
    },
  };

  const mockSandbox = new FakeSandboxProvider();

  const mockEvents = {
    append: vi.fn(async () => undefined),
    pauseRunForInput: vi.fn(async () => true),
    finalizeRun: vi.fn(async () => true),
  };

  const mockMemory = {
    commit: vi.fn(async () => undefined),
    read: vi.fn(async () => ({ documents: [] })),
    recall: vi.fn(async () => []),
  };

  const mockJobs = {
    enqueue: vi.fn(async () => undefined),
  };

  const executor = createRunExecutor({
    prisma: mockPrisma,
    events: mockEvents as any,
    runtime: mockRuntime as any,
    sandbox: mockSandbox as any,
    memory: mockMemory as any,
    home: {
      resolve: () => "/tmp/agent-home",
      record: vi.fn(async () => undefined),
      store: vi.fn(async () => undefined),
      revise: vi.fn(async () => "rev-1"),
    } as any,
    secrets: [],
    jobs: mockJobs as any,
  });

  return {
    executor,
    mockPrisma,
    skillsStore,
    async getApplyTool(runId = "run-tenant-a-1") {
      const spy = vi.spyOn(console, "error");
      try {
        await executor.continueRun(runId, "worker-1");
      } catch (err: any) {
        const errors = spy.mock.calls.map((c) => c.join(" ")).join("\n");
        throw new Error(`getApplyTool failed during continueRun: ${err?.message}\nCaptured console.errors:\n${errors}`);
      }
      if (!capturedApplyTool) {
        throw new Error("Failed to capture applyTool from executor run");
      }
      return capturedApplyTool;
    },
  };
}

describe("Adversarial Challenge: read_skill Tool Execution in applyTool (executor.ts)", () => {
  const seedSkills = [
    {
      id: "sk-dock-100",
      workspaceId: "ws-tenant-a",
      name: "Docker Container Hardening",
      slug: "docker-container-hardening",
      description: "Docker security rules",
      content: "# Docker Security\nRun as non-root user.\nDrop all capabilities.",
      tags: ["docker", "security", "devops"],
    },
    {
      id: "sk-hds-200",
      workspaceId: "ws-tenant-a",
      name: "Sécurité Santé & HDS 2026",
      slug: "securite-sante-hds-2026",
      description: "Chiffrement AES-256 et conformité HDS",
      content: "# Norme HDS France\nChiffrement de bout en bout.",
      tags: "securite, hds, sante",
    },
    {
      id: "sk-tenant-b-999",
      workspaceId: "ws-tenant-b",
      name: "Confidential Finance Formulas",
      slug: "confidential-finance-formulas",
      description: "Proprietary trading algorithms",
      content: "# Secret Formulas\nALPHA_BETA_SECRET = 42",
      tags: ["finance", "secret"],
    },
  ];

  // --------------------------------------------------------------------------
  // 1. NON-EXISTENT SKILL LOOKUP & ERROR CASES
  // --------------------------------------------------------------------------
  describe("1. Non-existent Skill & Invalid Parameters", () => {
    it("returns clean structured error when skill name does not exist without throwing", async () => {
      const { getApplyTool } = createExecutorTestHarness(seedSkills);
      const applyTool = await getApplyTool("run-tenant-a-1");

      const result = (await applyTool(
        "read_skill",
        { name: "non-existent-skill-slug" },
        "exec-1",
      )) as { error?: string };

      expect(result).toBeDefined();
      expect(result.error).toBe("Skill 'non-existent-skill-slug' not found in workspace.");
    });

    it("returns clean structured error on empty name parameter", async () => {
      const { getApplyTool } = createExecutorTestHarness(seedSkills);
      const applyTool = await getApplyTool("run-tenant-a-1");

      const res1 = (await applyTool("read_skill", { name: "" }, "exec-2")) as { error?: string };
      expect(res1.error).toBe("Paramètre 'name' manquant pour read_skill.");

      const res2 = (await applyTool("read_skill", { name: "   " }, "exec-3")) as { error?: string };
      expect(res2.error).toBe("Paramètre 'name' manquant pour read_skill.");

      const res3 = (await applyTool("read_skill", {}, "exec-4")) as { error?: string };
      expect(res3.error).toBe("Paramètre 'name' manquant pour read_skill.");
    });

    it("handles alternative parameter aliases 'skill' and 'target'", async () => {
      const { getApplyTool } = createExecutorTestHarness(seedSkills);
      const applyTool = await getApplyTool("run-tenant-a-1");

      const resSkill = (await applyTool(
        "read_skill",
        { skill: "docker-container-hardening" },
        "exec-5",
      )) as { name?: string; content?: string };
      expect(resSkill.name).toBe("Docker Container Hardening");

      const resTarget = (await applyTool(
        "read_skill",
        { target: "docker-container-hardening" },
        "exec-6",
      )) as { name?: string; content?: string };
      expect(resTarget.name).toBe("Docker Container Hardening");
    });

    it("handles prisma.skill model being undefined gracefully", async () => {
      const harness = createExecutorTestHarness(seedSkills);
      (harness.mockPrisma as any).skill = undefined;
      const applyTool = await harness.getApplyTool("run-tenant-a-1");

      const res = (await applyTool(
        "read_skill",
        { name: "docker-container-hardening" },
        "exec-7",
      )) as { error?: string };
      expect(res.error).toBe("Skill 'docker-container-hardening' not found in workspace.");
    });
  });

  // --------------------------------------------------------------------------
  // 2. CROSS-TENANT / CROSS-WORKSPACE ISOLATION VIOLATIONS
  // --------------------------------------------------------------------------
  describe("2. Cross-Tenant / Cross-Workspace Scoping", () => {
    it("strictly forbids accessing a skill belonging to Workspace B from Workspace A by slug", async () => {
      const { getApplyTool } = createExecutorTestHarness(seedSkills);
      const applyToolA = await getApplyTool("run-tenant-a-1");

      const attempt = (await applyToolA(
        "read_skill",
        { name: "confidential-finance-formulas" },
        "exec-8",
      )) as { error?: string; content?: string };

      expect(attempt.error).toBe("Skill 'confidential-finance-formulas' not found in workspace.");
      expect(attempt.content).toBeUndefined();
    });

    it("strictly forbids accessing a skill belonging to Workspace B from Workspace A by exact ID", async () => {
      const { getApplyTool } = createExecutorTestHarness(seedSkills);
      const applyToolA = await getApplyTool("run-tenant-a-1");

      const attempt = (await applyToolA(
        "read_skill",
        { name: "sk-tenant-b-999" },
        "exec-9",
      )) as { error?: string; content?: string };

      expect(attempt.error).toBe("Skill 'sk-tenant-b-999' not found in workspace.");
      expect(attempt.content).toBeUndefined();
    });

    it("allows Workspace B run to access its own skill", async () => {
      const { getApplyTool } = createExecutorTestHarness(seedSkills);
      const applyToolB = await getApplyTool("run-tenant-b-1");

      const result = (await applyToolB(
        "read_skill",
        { name: "confidential-finance-formulas" },
        "exec-10",
      )) as { name?: string; content?: string };

      expect(result.name).toBe("Confidential Finance Formulas");
      expect(result.content).toContain("ALPHA_BETA_SECRET = 42");
    });
  });

  // --------------------------------------------------------------------------
  // 3. SLUG, NAME, CASE-INSENSITIVITY, ACCENTS & SPECIAL CHARS
  // --------------------------------------------------------------------------
  describe("3. Lookup Resilience (Case, Accents, Whitespace, Injections)", () => {
    it("matches skill by exact lowercase slug", async () => {
      const { getApplyTool } = createExecutorTestHarness(seedSkills);
      const applyTool = await getApplyTool("run-tenant-a-1");

      const res = (await applyTool(
        "read_skill",
        { name: "docker-container-hardening" },
        "exec-11",
      )) as { name?: string; slug?: string };

      expect(res.name).toBe("Docker Container Hardening");
      expect(res.slug).toBe("docker-container-hardening");
    });

    it("matches skill by uppercase and mixed-case slug", async () => {
      const { getApplyTool } = createExecutorTestHarness(seedSkills);
      const applyTool = await getApplyTool("run-tenant-a-1");

      const res1 = (await applyTool(
        "read_skill",
        { name: "DOCKER-CONTAINER-HARDENING" },
        "exec-12",
      )) as { name?: string };
      expect(res1.name).toBe("Docker Container Hardening");

      const res2 = (await applyTool(
        "read_skill",
        { name: "Docker-Container-Hardening" },
        "exec-13",
      )) as { name?: string };
      expect(res2.name).toBe("Docker Container Hardening");
    });

    it("matches skill by case-insensitive name", async () => {
      const { getApplyTool } = createExecutorTestHarness(seedSkills);
      const applyTool = await getApplyTool("run-tenant-a-1");

      const res = (await applyTool(
        "read_skill",
        { name: "docker container hardening" },
        "exec-14",
      )) as { name?: string };
      expect(res.name).toBe("Docker Container Hardening");
    });

    it("matches skill by exact ID", async () => {
      const { getApplyTool } = createExecutorTestHarness(seedSkills);
      const applyTool = await getApplyTool("run-tenant-a-1");

      const res = (await applyTool(
        "read_skill",
        { name: "sk-dock-100" },
        "exec-15",
      )) as { name?: string; slug?: string };
      expect(res.name).toBe("Docker Container Hardening");
      expect(res.slug).toBe("docker-container-hardening");
    });

    it("trims leading and trailing whitespace from lookup target", async () => {
      const { getApplyTool } = createExecutorTestHarness(seedSkills);
      const applyTool = await getApplyTool("run-tenant-a-1");

      const res = (await applyTool(
        "read_skill",
        { name: "   docker-container-hardening \n\t" },
        "exec-16",
      )) as { name?: string };
      expect(res.name).toBe("Docker Container Hardening");
    });

    it("handles accented characters in name and slug correctly", async () => {
      const { getApplyTool } = createExecutorTestHarness(seedSkills);
      const applyTool = await getApplyTool("run-tenant-a-1");

      // Search by slug with accents
      const res1 = (await applyTool(
        "read_skill",
        { name: "securite-sante-hds-2026" },
        "exec-17",
      )) as { name?: string; content?: string };
      expect(res1.name).toBe("Sécurité Santé & HDS 2026");
      expect(res1.content).toContain("Norme HDS France");

      // Search by name with accents
      const res2 = (await applyTool(
        "read_skill",
        { name: "sécurité santé & hds 2026" },
        "exec-18",
      )) as { name?: string };
      expect(res2.name).toBe("Sécurité Santé & HDS 2026");
    });

    it("handles adversarial injection strings cleanly without crash", async () => {
      const { getApplyTool } = createExecutorTestHarness(seedSkills);
      const applyTool = await getApplyTool("run-tenant-a-1");

      const adversarialInputs = [
        "' OR '1'='1",
        "'; DROP TABLE skills; --",
        "../../../../etc/passwd",
        "<script>alert('xss')</script>",
        "${process.env.SECRET}",
        "__proto__",
        "constructor",
        "\x00nullbyte",
        "🦄 ✨ 💻",
        "a".repeat(5000),
      ];

      for (let i = 0; i < adversarialInputs.length; i++) {
        const input = adversarialInputs[i]!;
        const res = (await applyTool(
          "read_skill",
          { name: input },
          `exec-adv-${i}`,
        )) as { error?: string };

        expect(res).toBeDefined();
        expect(res.error).toBe(`Skill '${input.trim()}' not found in workspace.`);
      }
    });

    it("properly formats string and array tags in output", async () => {
      const { getApplyTool } = createExecutorTestHarness(seedSkills);
      const applyTool = await getApplyTool("run-tenant-a-1");

      // Array tags
      const resArray = (await applyTool(
        "read_skill",
        { name: "sk-dock-100" },
        "exec-19",
      )) as { tags?: string[] };
      expect(resArray.tags).toEqual(["docker", "security", "devops"]);

      // String tags
      const resString = (await applyTool(
        "read_skill",
        { name: "sk-hds-200" },
        "exec-20",
      )) as { tags?: string[] };
      expect(resString.tags).toEqual(["securite, hds, sante"]);
    });
  });

  // --------------------------------------------------------------------------
  // 4. CONCURRENT INVOCATIONS OF READ_SKILL
  // --------------------------------------------------------------------------
  describe("4. Concurrent Invocations Stress Testing", () => {
    it("handles 50 parallel invocations of read_skill within a single run", async () => {
      const { getApplyTool } = createExecutorTestHarness(seedSkills);
      const applyTool = await getApplyTool("run-tenant-a-1");

      const promises = Array.from({ length: 50 }, (_, i) => {
        const isDocker = i % 2 === 0;
        const target = isDocker ? "docker-container-hardening" : "securite-sante-hds-2026";
        return applyTool("read_skill", { name: target }, `concurrent-exec-${i}`);
      });

      const results = await Promise.all(promises);
      expect(results).toHaveLength(50);

      for (let i = 0; i < 50; i++) {
        const isDocker = i % 2 === 0;
        const res = results[i] as { name?: string; error?: string };
        expect(res.error).toBeUndefined();
        if (isDocker) {
          expect(res.name).toBe("Docker Container Hardening");
        } else {
          expect(res.name).toBe("Sécurité Santé & HDS 2026");
        }
      }
    });

    it("handles concurrent cross-tenant calls without cross-talk or state pollution", async () => {
      const { getApplyTool } = createExecutorTestHarness(seedSkills);

      const [applyToolA, applyToolB] = await Promise.all([
        getApplyTool("run-tenant-a-1"),
        getApplyTool("run-tenant-b-1"),
      ]);

      const callsA = Array.from({ length: 20 }, (_, i) =>
        applyToolA("read_skill", { name: "docker-container-hardening" }, `exec-a-${i}`),
      );
      const crossAttacksA = Array.from({ length: 20 }, (_, i) =>
        applyToolA("read_skill", { name: "confidential-finance-formulas" }, `exec-attack-${i}`),
      );
      const callsB = Array.from({ length: 20 }, (_, i) =>
        applyToolB("read_skill", { name: "confidential-finance-formulas" }, `exec-b-${i}`),
      );

      const [resultsA, resultsAttackA, resultsB] = await Promise.all([
        Promise.all(callsA),
        Promise.all(crossAttacksA),
        Promise.all(callsB),
      ]);

      // Workspace A legit calls succeed
      for (const res of resultsA) {
        expect((res as any).name).toBe("Docker Container Hardening");
      }

      // Workspace A unauthorized cross-tenant calls fail cleanly
      for (const res of resultsAttackA) {
        expect((res as any).error).toBe("Skill 'confidential-finance-formulas' not found in workspace.");
      }

      // Workspace B legit calls succeed
      for (const res of resultsB) {
        expect((res as any).name).toBe("Confidential Finance Formulas");
      }
    });
  });
});
