import type {
  ComputerStatus,
  ProductEvent,
  ThreadMessage,
  ThreadSnapshot,
} from "@rakazo/contracts";
import { describe, expect, it } from "vitest";
import {
  isThreadSnapshotEvent,
  mergeThreadSnapshot,
  prependThreadMessagePage,
  reduceThreadSnapshot,
} from "../lib/thread-events.js";

function makeComputer(overrides: Partial<ComputerStatus> = {}): ComputerStatus {
  return {
    botId: "bot-test",
    mode: "team",
    kind: "fake",
    state: "booting",
    controlHolder: "none",
    controlBotId: null,
    screenAvailable: false,
    screenWidth: 1280,
    screenHeight: 800,
    homeRevision: null,
    busyBotName: null,
    ...overrides,
  };
}

function makeSnapshot(overrides: Partial<ThreadSnapshot> = {}): ThreadSnapshot {
  return {
    botId: "bot-test",
    threadId: "thread-test",
    cursor: 10,
    messages: [],
    olderCursor: null,
    run: null,
    computer: makeComputer(),
    ...overrides,
  };
}

function makeMessage(
  id: string,
  text: string,
  role: ThreadMessage["role"] = "bot",
  seq = 1,
): ThreadMessage {
  return {
    id,
    threadId: "thread-test",
    seq,
    role,
    blocks: [{ kind: "text", text }],
    createdAt: "2026-09-02T12:00:00.000Z",
  };
}

function makeEvent(type: ProductEvent["type"], seq: number, overrides: Partial<ProductEvent> = {}): ProductEvent {
  return {
    id: `event-${seq}`,
    workspaceId: "ws-1",
    threadId: "thread-test",
    botId: "bot-test",
    seq,
    type,
    createdAt: "2026-09-02T12:00:01.000Z",
    payload: {},
    ...overrides,
  };
}

describe("Resolved Run Error Banner Cleanup & Thread Snapshot Invariants (Feature 3)", () => {
  describe("Tier 1: Feature Coverage (≥5 Tests)", () => {
    it("1.1 clears streaming progress tokens when run completes cleanly", () => {
      const initial = makeSnapshot({
        cursor: 5,
        messages: [
          makeMessage("msg-1", "Hello user", "bot", 1),
          {
            id: "progress:run-1",
            threadId: "thread-test",
            seq: 2,
            role: "bot",
            blocks: [{ kind: "progress", text: "Generating response..." }],
            createdAt: "2026-09-02T12:00:01.000Z",
          },
        ],
      });

      // When durable final message arrives, progress message is replaced
      const next = reduceThreadSnapshot(
        initial,
        makeEvent("thread.message.created", 6, {
          runId: "run-1",
          payload: {
            messageId: "msg-2",
            role: "bot",
            blocks: [{ kind: "text", text: "Final generated response." }],
          },
        }),
      );

      expect(next?.messages).toHaveLength(2);
      expect(next?.messages.find((m) => m.id.startsWith("progress:"))).toBeUndefined();
      expect(next?.messages[1]?.id).toBe("msg-2");
    });

    it("1.2 resets thread snapshot and run state on thread.cleared event", () => {
      const initial = makeSnapshot({
        cursor: 20,
        messages: [makeMessage("msg-1", "First"), makeMessage("msg-2", "Second")],
        run: {
          id: "run-err",
          botId: "bot-test",
          threadId: "thread-test",
          taskId: "task-err",
          status: "failed",
          trigger: "user",
          modelProvider: null,
          modelId: null,
          error: "Transient network timeout",
          startedAt: "2026-09-02T12:00:00.000Z",
          completedAt: "2026-09-02T12:00:02.000Z",
        },
      });

      const next = reduceThreadSnapshot(initial, makeEvent("thread.cleared", 25));

      expect(next).toBeDefined();
      expect(next?.cursor).toBe(25);
      expect(next?.messages).toHaveLength(0);
      expect(next?.run).toBeNull();
      expect(next?.olderCursor).toBeNull();
    });

    it("1.3 merges refreshed snapshot on page reload without duplicating or resurrecting old progress tokens", () => {
      const previous = makeSnapshot({
        cursor: 10,
        messages: [
          makeMessage("msg-1", "First message", "user", 1),
          makeMessage("msg-2", "Second message", "bot", 2),
          {
            id: "progress:run-old",
            threadId: "thread-test",
            seq: 3,
            role: "bot",
            blocks: [{ kind: "progress", text: "Stale progress token" }],
            createdAt: "2026-09-02T12:00:01.000Z",
          },
        ],
      });

      const recentFromServer = makeSnapshot({
        cursor: 15,
        messages: [
          makeMessage("msg-2", "Second message", "bot", 2),
          makeMessage("msg-3", "Third message", "bot", 4),
        ],
        olderCursor: 1,
      });

      const merged = mergeThreadSnapshot(previous, recentFromServer, true);

      expect(merged.messages.map((m) => m.id)).toEqual(["msg-1", "msg-2", "msg-3"]);
      expect(merged.messages.some((m) => m.id.startsWith("progress:"))).toBe(false);
    });

    it("1.4 handles waiting_input run state transition", () => {
      const initial = makeSnapshot({
        run: {
          id: "run-interactive",
          botId: "bot-test",
          threadId: "thread-test",
          taskId: "task-1",
          status: "running",
          trigger: "user",
          modelProvider: null,
          modelId: null,
          error: null,
          startedAt: null,
          completedAt: null,
        },
      });

      const next = reduceThreadSnapshot(
        initial,
        makeEvent("run.waiting_input", 12, { runId: "run-interactive" }),
      );

      expect(next?.run?.status).toBe("waiting_input");
      expect(next?.cursor).toBe(12);
    });

    it("1.5 accurately filters thread snapshot events and terminal run events vs non-thread events", () => {
      expect(isThreadSnapshotEvent(makeEvent("thread.cleared", 1))).toBe(true);
      expect(isThreadSnapshotEvent(makeEvent("thread.progress", 2))).toBe(true);
      expect(isThreadSnapshotEvent(makeEvent("thread.message.created", 3))).toBe(true);
      expect(isThreadSnapshotEvent(makeEvent("thread.subagent", 4))).toBe(true);
      expect(isThreadSnapshotEvent(makeEvent("run.waiting_input", 5))).toBe(true);

      // Terminal run events are now processed as snapshot reduction events
      expect(isThreadSnapshotEvent(makeEvent("run.completed", 6))).toBe(true);
      expect(isThreadSnapshotEvent(makeEvent("run.failed", 7))).toBe(true);
      expect(isThreadSnapshotEvent(makeEvent("run.cancelled", 8))).toBe(true);
      expect(isThreadSnapshotEvent(makeEvent("computer.status" as any, 9))).toBe(false);
    });
  });

  describe("Tier 2: Boundary & Corner Cases (≥5 Tests)", () => {
    it("2.1 handles prepend pagination with zero overlapping messages", () => {
      const initial = makeSnapshot({
        messages: [makeMessage("msg-10", "Message 10", "bot", 10)],
        olderCursor: 10,
      });

      const olderPage = {
        threadId: "thread-test",
        messages: [makeMessage("msg-1", "Message 1", "user", 1), makeMessage("msg-2", "Message 2", "bot", 2)],
        olderCursor: null,
      };

      const prepended = prependThreadMessagePage(initial, olderPage);
      expect(prepended?.messages.map((m) => m.id)).toEqual(["msg-1", "msg-2", "msg-10"]);
      expect(prepended?.olderCursor).toBeNull();
    });

    it("2.2 deduplicates overlapping messages when prepending historical page", () => {
      const initial = makeSnapshot({
        messages: [
          makeMessage("msg-2", "Message 2", "bot", 2),
          makeMessage("msg-3", "Message 3", "user", 3),
        ],
        olderCursor: 2,
      });

      const olderPage = {
        threadId: "thread-test",
        messages: [
          makeMessage("msg-1", "Message 1", "user", 1),
          makeMessage("msg-2", "Message 2", "bot", 2), // Overlap
        ],
        olderCursor: null,
      };

      const prepended = prependThreadMessagePage(initial, olderPage);
      expect(prepended?.messages.map((m) => m.id)).toEqual(["msg-1", "msg-2", "msg-3"]);
    });

    it("2.3 returns original snapshot when reducing event on null snapshot", () => {
      const result = reduceThreadSnapshot(null, makeEvent("thread.progress", 1));
      expect(result).toBeNull();
    });

    it("2.4 handles consecutive progress deltas without growing message list count", () => {
      let state = makeSnapshot();
      for (let i = 0; i < 20; i++) {
        state = reduceThreadSnapshot(
          state,
          makeEvent("thread.progress", i + 1, {
            runId: "run-stream",
            payload: { delta: ` chunk ${i}` },
          }),
        )!;
      }

      expect(state.messages).toHaveLength(1);
      expect(state.messages[0]!.id).toBe("progress:run-stream");
      expect(state.messages[0]!.blocks[0]).toMatchObject({
        kind: "progress",
      });
    });

    it("2.5 preserves inference metadata (resolvedModel, resolvedProvider, isFree) in progress messages", () => {
      const initial = makeSnapshot();
      const next = reduceThreadSnapshot(
        initial,
        makeEvent("thread.progress", 1, {
          runId: "run-meta",
          payload: {
            delta: "Computing...",
            resolvedModel: "codestral-latest",
            resolvedProvider: "mistral",
            isFree: true,
          },
        }),
      );

      const progressMsg = next?.messages[0] as any;
      expect(progressMsg).toBeDefined();
      expect(progressMsg.resolvedModel).toBe("codestral-latest");
      expect(progressMsg.resolvedProvider).toBe("mistral");
      expect(progressMsg.isFree).toBe(true);
    });
  });

  describe("Tier 3 & Tier 4: Error Recovery & Retry Lifecycle Workflow", () => {
    it("3.1 recovers cleanly when a failed run is followed by a new successful user prompt", () => {
      // 1. Start with a failed run snapshot
      const failedState: ThreadSnapshot = makeSnapshot({
        cursor: 10,
        messages: [
          makeMessage("msg-user-1", "Calculate stats", "user", 1),
        ],
        run: {
          id: "run-failed-1",
          botId: "bot-test",
          threadId: "thread-test",
          taskId: "task-1",
          status: "failed",
          trigger: "user",
          modelProvider: "mistral",
          modelId: "codestral-latest",
          error: "Upstream rate limit reached",
          startedAt: "2026-09-02T12:00:00.000Z",
          completedAt: "2026-09-02T12:00:02.000Z",
        },
      });

      // 2. User retries prompt
      const retryUserMsg = reduceThreadSnapshot(
        failedState,
        makeEvent("thread.message.created", 11, {
          payload: {
            messageId: "msg-user-2",
            role: "user",
            blocks: [{ kind: "text", text: "Retry: calculate stats" }],
          },
        }),
      );

      // 3. New run streams progress
      const streamState = reduceThreadSnapshot(
        retryUserMsg,
        makeEvent("thread.progress", 12, {
          runId: "run-retry-2",
          payload: { delta: "Recalculating with fallback provider... " },
        }),
      );

      // 4. Successful completion arrives
      const completedState = reduceThreadSnapshot(
        streamState,
        makeEvent("thread.message.created", 13, {
          runId: "run-retry-2",
          payload: {
            messageId: "msg-bot-2",
            role: "bot",
            blocks: [{ kind: "text", text: "Stats calculated successfully: 42.0" }],
          },
        }),
      );

      expect(completedState?.messages).toHaveLength(3);
      expect(completedState?.messages.map((m) => m.id)).toEqual([
        "msg-user-1",
        "msg-user-2",
        "msg-bot-2",
      ]);
      expect(completedState?.messages.some((m) => m.id.startsWith("progress:"))).toBe(false);
    });
  });
});
