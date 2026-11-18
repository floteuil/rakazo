import { describe, expect, it } from "vitest";
import {
  repairToolCallName,
  repairToolCallArguments,
  isTruncatedToolArguments,
  rebalanceJsonClosers,
  partitionMixedBatch,
  closeInterruptedToolSequence,
  levenshteinDistance,
  similarityScore,
} from "./tool-repair.js";
import {
  ConsecutiveDenialCircuitBreaker,
  CONSECUTIVE_DENIAL_THRESHOLD,
} from "./denial-breaker.js";
import { asymmetricCompactHistory } from "./memory-asymmetry.js";
import type { SanitizableMessage } from "./history-sanitize.js";

describe("Hermes Innovations 1: Tool-Calling Tolerance & Auto-Repair", () => {
  const registeredTools = [
    "read_file",
    "write_file",
    "execute_command",
    "todo",
    "notion_create_page",
    "github_create_issue",
    "search_files",
  ];

  describe("repairToolCallName", () => {
    it("preserves already valid tool names without repair flag", () => {
      const res = repairToolCallName("read_file", registeredTools);
      expect(res.repaired).toBe(false);
      expect(res.name).toBe("read_file");
    });

    it("strips XML attributes leaking into tool names (e.g. VolcEngine / open-weights issue)", () => {
      const res = repairToolCallName('read_file" parameter="path"', registeredTools);
      expect(res.repaired).toBe(true);
      expect(res.name).toBe("read_file");
    });

    it("strips wrapping XML tags like <write_file>", () => {
      const res = repairToolCallName("<write_file>", registeredTools);
      expect(res.repaired).toBe(true);
      expect(res.name).toBe("write_file");
    });

    it("normalizes spaces and hyphens into snake_case", () => {
      const res1 = repairToolCallName("read file", registeredTools);
      expect(res1.repaired).toBe(true);
      expect(res1.name).toBe("read_file");

      const res2 = repairToolCallName("write-file", registeredTools);
      expect(res2.repaired).toBe(true);
      expect(res2.name).toBe("write_file");
    });

    it("converts camelCase to snake_case (e.g. executeCommand -> execute_command)", () => {
      const res = repairToolCallName("executeCommand", registeredTools);
      expect(res.repaired).toBe(true);
      expect(res.name).toBe("execute_command");
    });

    it("strips redundant _tool, -tool or Tool suffixes up to twice (e.g. TodoTool_tool -> todo)", () => {
      const res1 = repairToolCallName("todo_tool", registeredTools);
      expect(res1.repaired).toBe(true);
      expect(res1.name).toBe("todo");

      const res2 = repairToolCallName("TodoTool_tool", registeredTools);
      expect(res2.repaired).toBe(true);
      expect(res2.name).toBe("todo");
    });

    it("resolves close typographical errors via Levenshtein fuzzy matching (cutoff 0.70)", () => {
      // "readfile" vs "read_file" -> similarity > 0.8
      const res1 = repairToolCallName("readfile", registeredTools);
      expect(res1.repaired).toBe(true);
      expect(res1.name).toBe("read_file");

      // "searche_files" -> "search_files"
      const res2 = repairToolCallName("searche_files", registeredTools);
      expect(res2.repaired).toBe(true);
      expect(res2.name).toBe("search_files");
    });

    it("leaves unknown tools unmodified when below fuzzy similarity threshold", () => {
      const res = repairToolCallName("completely_alien_function", registeredTools);
      expect(res.repaired).toBe(false);
      expect(res.name).toBe("completely_alien_function");
    });
  });

  describe("rebalanceJsonClosers", () => {
    it("returns balanced json unchanged", () => {
      const balanced = '{"command": "pnpm test", "flags": ["-v"]}';
      expect(rebalanceJsonClosers(balanced)).toBe(balanced);
    });

    it("closes unclosed braces and brackets in correct reverse stack order", () => {
      const unclosed = '{"command": "echo hello", "tags": ["a", "b"';
      const rebalanced = rebalanceJsonClosers(unclosed);
      expect(rebalanced).toBe('{"command": "echo hello", "tags": ["a", "b"]}');
      expect(() => JSON.parse(rebalanced!)).not.toThrow();
    });

    it("respects brackets inside string values and does not confuse them with syntax", () => {
      const insideString = '{"code": "function() { return [1, 2]; }"';
      const rebalanced = rebalanceJsonClosers(insideString);
      expect(rebalanced).toBe('{"code": "function() { return [1, 2]; }"}');
      expect(() => JSON.parse(rebalanced!)).not.toThrow();
    });
  });

  describe("repairToolCallArguments", () => {
    it("handles empty or 'None' inputs by returning '{}'", () => {
      expect(repairToolCallArguments("").arguments).toBe("{}");
      expect(repairToolCallArguments("None").arguments).toBe("{}");
      expect(repairToolCallArguments("null").arguments).toBe("{}");
    });

    it("repairs trailing commas in objects and arrays", () => {
      const malformed = '{"file": "main.ts", "dryRun": true, }';
      const res = repairToolCallArguments(malformed);
      expect(res.repaired).toBe(true);
      expect(res.parsed).toEqual({ file: "main.ts", dryRun: true });
    });

    it("repairs Python booleans and None syntax", () => {
      const pythonSyntax = '{"enabled": True, "archived": False, "meta": None}';
      const res = repairToolCallArguments(pythonSyntax);
      expect(res.repaired).toBe(true);
      expect(res.parsed).toEqual({ enabled: true, archived: false, meta: null });
    });

    it("repairs cut-off arguments by rebalancing brackets", () => {
      const truncated = '{"query": "SELECT * FROM users", "limit": 10';
      const res = repairToolCallArguments(truncated);
      expect(res.repaired).toBe(true);
      expect(res.parsed).toEqual({ query: "SELECT * FROM users", limit: 10 });
    });
  });

  describe("isTruncatedToolArguments", () => {
    it("detects unclosed objects that look truncated mid-stream", () => {
      const truncated = '{"command": "rm -rf /tmp/test_dir_path';
      expect(isTruncatedToolArguments(truncated)).toBe(true);
    });

    it("does not flag fully closed arguments", () => {
      const ok = '{"command": "rm -rf /tmp/test_dir_path"}';
      expect(isTruncatedToolArguments(ok)).toBe(false);
    });
  });

  describe("partitionMixedBatch", () => {
    it("partitions mixed batches so valid tools run and invalid tools are isolated", () => {
      const batch = [
        { id: "call_1", name: "read_file", arguments: '{"path": "a.txt"}' },
        { id: "call_2", name: "unknown_hallucinated_tool", arguments: "{}" },
        { id: "call_3", name: "write-file", arguments: '{"path": "b.txt"}' }, // will be repaired to write_file
      ];

      const partitioned = partitionMixedBatch(batch, registeredTools);
      expect(partitioned.isMixed).toBe(true);
      expect(partitioned.validCalls.length).toBe(2);
      expect(partitioned.validCalls[0]!.name).toBe("read_file");
      expect(partitioned.validCalls[1]!.name).toBe("write_file"); // repaired!
      expect(partitioned.invalidCalls.length).toBe(1);
      expect(partitioned.invalidCalls[0]!.call.id).toBe("call_2");
    });
  });

  describe("closeInterruptedToolSequence", () => {
    it("appends a synthetic assistant message if the transcript ends on a tool role", () => {
      const messages: SanitizableMessage[] = [
        { role: "user", content: "Run the tests" },
        { role: "assistant", content: null, tool_calls: [{ id: "c1", type: "function", function: { name: "execute_command", arguments: "{}" } }] },
        { role: "tool", tool_call_id: "c1", content: "Tests passed" },
      ];

      const res = closeInterruptedToolSequence(messages);
      expect(res.closed).toBe(true);
      expect(res.messages.length).toBe(4);
      expect(res.messages[3]!.role).toBe("assistant");
    });

    it("does nothing if the transcript already ends on assistant or user", () => {
      const messages: SanitizableMessage[] = [
        { role: "user", content: "Hello" },
        { role: "assistant", content: "Hi there" },
      ];
      const res = closeInterruptedToolSequence(messages);
      expect(res.closed).toBe(false);
      expect(res.messages.length).toBe(2);
    });
  });
});

describe("Hermes Innovations 2: Consecutive-Denial Circuit Breaker", () => {
  it("tracks refusals and trips exactly at the 3rd consecutive refusal", () => {
    const breaker = new ConsecutiveDenialCircuitBreaker(3);
    const session = "session_123";

    const v1 = breaker.recordDenial(session, "Commande sudo non autorisée");
    expect(v1.count).toBe(1);
    expect(v1.tripped).toBe(false);
    expect(v1.allowExecution).toBe(true);

    const v2 = breaker.recordDenial(session, "Accès interdit à /etc");
    expect(v2.count).toBe(2);
    expect(v2.tripped).toBe(false);
    expect(v2.allowExecution).toBe(true);

    const v3 = breaker.recordDenial(session, "Action dangereuse réitérée");
    expect(v3.count).toBe(3);
    expect(v3.tripped).toBe(true);
    expect(v3.allowExecution).toBe(false);
    expect(v3.addendum).toContain("Coupe-circuit de sécurité activé");
    expect(breaker.isTripped(session)).toBe(true);
  });

  it("resets refusal count upon approval", () => {
    const breaker = new ConsecutiveDenialCircuitBreaker(3);
    const session = "session_456";

    breaker.recordDenial(session);
    breaker.recordDenial(session);
    expect(breaker.getStatus(session).count).toBe(2);

    breaker.recordApproval(session);
    expect(breaker.getStatus(session).count).toBe(0);
    expect(breaker.isTripped(session)).toBe(false);
  });
});

describe("Hermes Innovations 3: Asymmetric Human-Preservation Memory Compaction", () => {
  it("strictly preserves 100% of user messages while compacting middle tool results", () => {
    const messages: SanitizableMessage[] = [
      { role: "system", content: "System prompt" },
      { role: "user", content: "CONSIGNE CRITIQUE : Ne jamais modifier index.html !" },
      { role: "assistant", content: "Entendu, j'inspecte le repo." },
      { role: "tool", tool_call_id: "c1", content: "X".repeat(2000) }, // very large tool output in middle
      { role: "user", content: "Deuxième consigne : Utiliser Bun exclusivement." },
      { role: "assistant", content: "Parfait, je lance Bun." },
      { role: "tool", tool_call_id: "c2", content: "Y".repeat(1500) },
      { role: "user", content: "Troisième consigne : Ajouter les tests unitaires." },
      { role: "assistant", content: "J'exécute le testeur." },
      { role: "tool", tool_call_id: "c3", content: "Tests OK" },
    ];

    // Force compaction by setting maxMessages = 5, protectTailCount = 2
    const res = asymmetricCompactHistory(messages, {
      maxMessages: 5,
      protectTailCount: 2,
      maxArchivedToolChars: 100,
    });

    expect(res.isCompacted).toBe(true);
    expect(res.preservedUserCount).toBe(3);

    // Verify all 3 user messages are present verbatim!
    const users = res.compactedMessages.filter((m) => m.role === "user");
    expect(users.length).toBe(3);
    expect(users[0]!.content).toBe("CONSIGNE CRITIQUE : Ne jamais modifier index.html !");
    expect(users[1]!.content).toBe("Deuxième consigne : Utiliser Bun exclusivement.");
    expect(users[2]!.content).toBe("Troisième consigne : Ajouter les tests unitaires.");

    // Verify the middle tool outputs were compacted
    const compactedTool = res.compactedMessages.find(
      (m) => m.role === "tool" && m.tool_call_id === "c1",
    );
    expect(compactedTool).toBeDefined();
    expect(compactedTool!.content).toContain("Résultat d'outil antérieur compacté");
    expect((compactedTool!.content as string).length).toBeLessThan(300);
  });
});
