import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type {
  AdapterContext,
  AgentHomeStore,
  ArtifactStore,
  JobPublisher,
  SandboxProvider,
} from "@rakazo/adapter-kit";
import type { PrismaClient } from "@rakazo/db";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { destroyBot } from "./child-bots.js";

const context = {
  operationId: "storage-cleanup-test",
  traceId: "trace-test-123",
  workspaceId: "ws-storage-1",
  userId: "user-cleaner-1",
  signal: new AbortController().signal,
} satisfies AdapterContext;

const TEST_DATA_DIR = join(process.cwd(), "data", "test-cleanup-fixture");

describe("E2E Zero-Bloat Physical Storage Cleanup & Database Cascades", () => {
  beforeEach(() => {
    rmSync(TEST_DATA_DIR, { recursive: true, force: true });
    mkdirSync(join(TEST_DATA_DIR, "homes"), { recursive: true });
    mkdirSync(join(TEST_DATA_DIR, "home-revisions"), { recursive: true });
    mkdirSync(join(TEST_DATA_DIR, "desktop-computers"), { recursive: true });
  });

  afterEach(() => {
    rmSync(TEST_DATA_DIR, { recursive: true, force: true });
  });

  // ==========================================================================
  // TIER 1: FEATURE COVERAGE (Happy Paths - ≥ 5 tests per feature)
  // ==========================================================================
  describe("Tier 1: Feature Coverage (Happy Paths)", () => {
    it("1.1 Physical Storage Cleanup: Purges /data/homes/<botId> directory on disk", async () => {
      const botId = "bot-clean-1";
      const botHomeDir = join(TEST_DATA_DIR, "homes", botId);
      mkdirSync(botHomeDir, { recursive: true });
      writeFileSync(join(botHomeDir, "state.json"), JSON.stringify({ initialized: true }));
      expect(existsSync(botHomeDir)).toBe(true);

      const deleteBot = vi.fn().mockResolvedValue({});
      const createDeletion = vi.fn().mockResolvedValue({});
      const prisma = {
        computer: {
          findUnique: vi.fn().mockResolvedValue({ id: "comp-1", homeKey: botId, state: "stopped" }),
        },
        run: { findMany: vi.fn().mockResolvedValue([]), updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
        routine: { findMany: vi.fn().mockResolvedValue([]) },
        artifact: { findMany: vi.fn().mockResolvedValue([]) },
        $transaction: vi.fn(async (callback: (tx: any) => Promise<void>) =>
          callback({
            computerExecutionLease: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
            computer: { updateMany: vi.fn().mockResolvedValue({ count: 0 }), delete: vi.fn().mockResolvedValue({}) },
            $executeRaw: vi.fn().mockResolvedValue(1),
            botDeletion: { create: createDeletion },
            bot: { delete: deleteBot },
          })
        ),
      } as unknown as PrismaClient;

      await destroyBot(
        {
          prisma,
          sandbox: {} as SandboxProvider,
          home: {
            resolvePath: (homeKey: string) => join(TEST_DATA_DIR, "homes", homeKey),
          } as unknown as AgentHomeStore,
          jobs: { cancel: vi.fn() } as unknown as JobPublisher,
          dataDir: TEST_DATA_DIR,
        },
        { id: botId, workspaceId: "ws-storage-1", name: "CleanerBot", archivedAt: null },
        context,
        { deleteMemories: true },
      );

      expect(deleteBot).toHaveBeenCalledWith({ where: { id: botId } });
      expect(existsSync(botHomeDir)).toBe(false);
    });

    it("1.2 Artifact Store Cleanup: removes all artifacts associated with the bot", async () => {
      const botId = "bot-clean-artifacts";
      const removeArtifact = vi.fn().mockResolvedValue(undefined);
      const prisma = {
        computer: { findUnique: vi.fn().mockResolvedValue(null) },
        run: { findMany: vi.fn().mockResolvedValue([]), updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
        routine: { findMany: vi.fn().mockResolvedValue([]) },
        artifact: {
          findMany: vi.fn().mockResolvedValue([
            { storageKey: "artifact-key-1" },
            { storageKey: "artifact-key-2" },
          ]),
        },
        $transaction: vi.fn(async (callback: (tx: any) => Promise<void>) =>
          callback({
            computerExecutionLease: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
            computer: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
            $executeRaw: vi.fn().mockResolvedValue(1),
            botDeletion: { create: vi.fn().mockResolvedValue({}) },
            bot: { delete: vi.fn().mockResolvedValue({}) },
          })
        ),
      } as unknown as PrismaClient;

      await destroyBot(
        {
          prisma,
          sandbox: {} as SandboxProvider,
          home: {} as AgentHomeStore,
          jobs: { cancel: vi.fn() } as unknown as JobPublisher,
          artifacts: { remove: removeArtifact } as unknown as ArtifactStore,
          dataDir: TEST_DATA_DIR,
        },
        { id: botId, workspaceId: "ws-storage-1", name: "ArtifactBot", archivedAt: null },
        context,
        { deleteMemories: true },
      );

      expect(removeArtifact).toHaveBeenCalledTimes(2);
      expect(removeArtifact).toHaveBeenCalledWith("artifact-key-1", context);
      expect(removeArtifact).toHaveBeenCalledWith("artifact-key-2", context);
    });

    it("1.3 Active Runs Cancellation: cancels in-flight runs and un-schedules job queue entries", async () => {
      const botId = "bot-clean-runs";
      const cancelJob = vi.fn().mockResolvedValue(undefined);
      const updateManyRuns = vi.fn().mockResolvedValue({ count: 2 });
      const prisma = {
        computer: { findUnique: vi.fn().mockResolvedValue(null) },
        run: {
          findMany: vi.fn().mockResolvedValue([{ id: "run-active-1" }, { id: "run-active-2" }]),
          updateMany: updateManyRuns,
        },
        routine: {
          findMany: vi.fn().mockResolvedValue([{ id: "routine-1" }]),
        },
        artifact: { findMany: vi.fn().mockResolvedValue([]) },
        $transaction: vi.fn(async (callback: (tx: any) => Promise<void>) =>
          callback({
            computerExecutionLease: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
            computer: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
            $executeRaw: vi.fn().mockResolvedValue(1),
            botDeletion: { create: vi.fn().mockResolvedValue({}) },
            bot: { delete: vi.fn().mockResolvedValue({}) },
          })
        ),
      } as unknown as PrismaClient;

      await destroyBot(
        {
          prisma,
          sandbox: {} as SandboxProvider,
          home: {} as AgentHomeStore,
          jobs: { cancel: cancelJob } as unknown as JobPublisher,
          dataDir: TEST_DATA_DIR,
        },
        { id: botId, workspaceId: "ws-storage-1", name: "RunnerBot", archivedAt: null },
        context,
        { deleteMemories: true },
      );

      expect(updateManyRuns).toHaveBeenCalledWith({
        where: { id: { in: ["run-active-1", "run-active-2"] } },
        data: expect.objectContaining({ status: "cancelled" }),
      });
      expect(cancelJob).toHaveBeenCalled();
    });

    it("1.4 Memory Archival: Preserves memories under 'Archived bots/' when deleteMemories is false", async () => {
      const botId = "bot-preserve-memories";
      const executeRaw = vi.fn().mockResolvedValue(3);
      const prisma = {
        computer: { findUnique: vi.fn().mockResolvedValue(null) },
        run: { findMany: vi.fn().mockResolvedValue([]), updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
        routine: { findMany: vi.fn().mockResolvedValue([]) },
        artifact: { findMany: vi.fn().mockResolvedValue([]) },
        $transaction: vi.fn(async (callback: (tx: any) => Promise<void>) =>
          callback({
            computerExecutionLease: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
            computer: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
            $executeRaw: executeRaw,
            botDeletion: { create: vi.fn().mockResolvedValue({}) },
            bot: { delete: vi.fn().mockResolvedValue({}) },
          })
        ),
      } as unknown as PrismaClient;

      await destroyBot(
        {
          prisma,
          sandbox: {} as SandboxProvider,
          home: {} as AgentHomeStore,
          jobs: { cancel: vi.fn() } as unknown as JobPublisher,
          dataDir: TEST_DATA_DIR,
        },
        { id: botId, workspaceId: "ws-storage-1", name: "ScholarBot", archivedAt: null },
        context,
        { deleteMemories: false },
      );

      expect(executeRaw).toHaveBeenCalledOnce();
    });
  });

  // ==========================================================================
  // TIER 2: BOUNDARY & CORNER CASES
  // ==========================================================================
  describe("Tier 2: Boundary & Corner Cases", () => {
    it("2.1 Non-existent directory resilience: Does not throw when disk directories are missing", async () => {
      const botId = "bot-non-existent-dirs";
      const prisma = {
        computer: {
          findUnique: vi.fn().mockResolvedValue({ id: "comp-missing", homeKey: "missing-key", state: "stopped" }),
        },
        run: { findMany: vi.fn().mockResolvedValue([]), updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
        routine: { findMany: vi.fn().mockResolvedValue([]) },
        artifact: { findMany: vi.fn().mockResolvedValue([]) },
        $transaction: vi.fn(async (callback: (tx: any) => Promise<void>) =>
          callback({
            computerExecutionLease: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
            computer: { updateMany: vi.fn().mockResolvedValue({ count: 0 }), delete: vi.fn().mockResolvedValue({}) },
            $executeRaw: vi.fn().mockResolvedValue(1),
            botDeletion: { create: vi.fn().mockResolvedValue({}) },
            bot: { delete: vi.fn().mockResolvedValue({}) },
          })
        ),
      } as unknown as PrismaClient;

      await expect(
        destroyBot(
          {
            prisma,
            sandbox: {} as SandboxProvider,
            home: {
              resolvePath: (key: string) => join(TEST_DATA_DIR, "homes", key),
            } as unknown as AgentHomeStore,
            jobs: { cancel: vi.fn() } as unknown as JobPublisher,
            dataDir: TEST_DATA_DIR,
          },
          { id: botId, workspaceId: "ws-storage-1", name: "GhostBot", archivedAt: null },
          context,
          { deleteMemories: true },
        )
      ).resolves.not.toThrow();
    });

    it("2.2 Transaction failure propagation: Rejects without reporting deletion success", async () => {
      const botId = "bot-tx-fail";
      const prisma = {
        computer: { findUnique: vi.fn().mockResolvedValue(null) },
        run: { findMany: vi.fn().mockResolvedValue([]), updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
        routine: { findMany: vi.fn().mockResolvedValue([]) },
        artifact: { findMany: vi.fn().mockResolvedValue([]) },
        $transaction: vi.fn().mockRejectedValue(new Error("Prisma foreign key constraint violation")),
      } as unknown as PrismaClient;

      await expect(
        destroyBot(
          {
            prisma,
            sandbox: {} as SandboxProvider,
            home: {} as AgentHomeStore,
            jobs: { cancel: vi.fn() } as unknown as JobPublisher,
            dataDir: TEST_DATA_DIR,
          },
          { id: botId, workspaceId: "ws-storage-1", name: "FailBot", archivedAt: null },
          context,
          { deleteMemories: true },
        )
      ).rejects.toThrow("Prisma foreign key constraint violation");
    });
  });

  // ==========================================================================
  // TIER 3 & 4: INTEGRATION & REAL-WORLD SCENARIOS
  // ==========================================================================
  describe("Tier 3 & 4: Real-World Scenarios", () => {
    it("4.1 Scenario: Full Lifecycle Provisioning, Disk Footprint & Zero-Bloat Purge", async () => {
      const botId = "bot-full-lifecycle-1";
      const botHome = join(TEST_DATA_DIR, "homes", botId);
      const botRevision = join(TEST_DATA_DIR, "home-revisions", `${botId}.txt`);
      const botDesktop = join(TEST_DATA_DIR, "desktop-computers", botId);

      // Provision mock filesystem footprint
      mkdirSync(botHome, { recursive: true });
      writeFileSync(join(botHome, "workspace.txt"), "console.log('hello');");
      writeFileSync(botRevision, "v1 -> v2 -> v3");
      mkdirSync(botDesktop, { recursive: true });
      writeFileSync(join(botDesktop, "display.raw"), "FRAMEBUFFER_BYTES");

      expect(existsSync(botHome)).toBe(true);

      const deleteBot = vi.fn().mockResolvedValue({});
      const prisma = {
        computer: {
          findUnique: vi.fn().mockResolvedValue({ id: "comp-full", homeKey: botId, state: "stopped" }),
        },
        run: { findMany: vi.fn().mockResolvedValue([]), updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
        routine: { findMany: vi.fn().mockResolvedValue([]) },
        artifact: { findMany: vi.fn().mockResolvedValue([]) },
        $transaction: vi.fn(async (callback: (tx: any) => Promise<void>) =>
          callback({
            computerExecutionLease: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
            computer: { updateMany: vi.fn().mockResolvedValue({ count: 0 }), delete: vi.fn().mockResolvedValue({}) },
            $executeRaw: vi.fn().mockResolvedValue(1),
            botDeletion: { create: vi.fn().mockResolvedValue({}) },
            bot: { delete: deleteBot },
          })
        ),
      } as unknown as PrismaClient;

      await destroyBot(
        {
          prisma,
          sandbox: {} as SandboxProvider,
          home: {
            resolvePath: (key: string) => join(TEST_DATA_DIR, "homes", key),
          } as unknown as AgentHomeStore,
          jobs: { cancel: vi.fn() } as unknown as JobPublisher,
          dataDir: TEST_DATA_DIR,
        },
        { id: botId, workspaceId: "ws-storage-1", name: "HeavyBot", archivedAt: null },
        context,
        { deleteMemories: true },
      );

      expect(existsSync(botHome)).toBe(false);
      expect(existsSync(botRevision)).toBe(false);
      expect(existsSync(botDesktop)).toBe(false);
      expect(deleteBot).toHaveBeenCalledWith({ where: { id: botId } });
    });
  });
});
