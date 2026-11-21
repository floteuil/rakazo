import { describe, expect, it } from "vitest";
import {
  createStreamingRedactor,
  progressMessageId,
  progressMessageText,
  projectMessages,
  redactSecrets,
} from "./events.js";

describe("SSE UTF-16 Surrogate Pair Sanitization & Streaming Redactor (Feature 2)", () => {
  describe("Tier 1: Feature Coverage (≥5 Tests)", () => {
    it("1.1 streams clean ASCII text chunks without alteration", () => {
      const redactor = createStreamingRedactor(["super-secret-key"]);
      const chunks = ["The ", "quick ", "brown ", "fox ", "jumps."];
      const output = chunks.map((c) => redactor.push(c)).join("") + redactor.finish();
      expect(output).toBe("The quick brown fox jumps.");
    });

    it("1.2 preserves complete multi-byte emojis (🚀, 🤖, 🎉) across stream chunks", () => {
      const redactor = createStreamingRedactor(["secret-token"]);
      const chunks = ["Agent initialized 🤖 ", "Launching rocket 🚀 ", "Success 🎉!"];
      const output = chunks.map((c) => redactor.push(c)).join("") + redactor.finish();
      expect(output).toBe("Agent initialized 🤖 Launching rocket 🚀 Success 🎉!");
    });

    it("1.3 redacts sensitive tokens immediately when fully received in single chunk", () => {
      const redactor = createStreamingRedactor(["sk-antigravity-998877"]);
      const output =
        redactor.push("Authorization: Bearer sk-antigravity-998877 header") + redactor.finish();
      expect(output).toBe("Authorization: Bearer [redacted] header");
      expect(output).not.toContain("sk-antigravity-998877");
    });

    it("1.4 redacts secret token split across two consecutive stream chunks", () => {
      const redactor = createStreamingRedactor(["sk-live-abcdef123456"]);
      const chunk1 = redactor.push("Bearer sk-live-abc");
      const chunk2 = redactor.push("def123456 in header");
      const final = redactor.finish();
      const full = [chunk1, chunk2, final].join("");

      expect(full).toBe("Bearer [redacted] in header");
      expect(full).not.toContain("sk-live-abcdef123456");
    });

    it("1.5 redacts multiple secrets of varying lengths according to specificity order", () => {
      const redactor = createStreamingRedactor([
        "SECRET_KEY",
        "SECRET_KEY_EXTENDED_LONG_VERSION",
        "SHORT_ID",
      ]);
      const output =
        redactor.push("Using SECRET_KEY_EXTENDED_LONG_VERSION and SECRET_KEY with SHORT_ID") +
        redactor.finish();
      expect(output).toBe("Using [redacted] and [redacted] with [redacted]");
    });
  });

  describe("Tier 2: Boundary & Corner Cases (≥5 Tests)", () => {
    it("2.1 handles split UTF-16 surrogate pairs without string corruption", () => {
      // 🚀 is represented as high surrogate \uD83D and low surrogate \uDE80
      const highSurrogate = "\uD83D";
      const lowSurrogate = "\uDE80";
      const rocket = highSurrogate + lowSurrogate;

      const redactor = createStreamingRedactor(["secret-token-xyz"]);
      const part1 = redactor.push(`Launching ${highSurrogate}`);
      const part2 = redactor.push(`${lowSurrogate} into orbit!`);
      const final = redactor.finish();
      const result = [part1, part2, final].join("");

      expect(result).toBe("Launching 🚀 into orbit!");
      expect(result).toContain(rocket);
    });

    it("2.2 handles ZWJ (Zero-Width Joiner) family emoji sequence split across chunks", () => {
      // 👨‍👩‍👧‍👦 is composed of 4 emojis connected by ZWJ (\u200D)
      const family = "👨‍👩‍👧‍👦";
      const redactor = createStreamingRedactor(["my-key"]);
      const chunks = ["Family: ", "👨", "\u200D", "👩", "\u200D", "👧", "\u200D", "👦", " together"];
      const result = chunks.map((c) => redactor.push(c)).join("") + redactor.finish();

      expect(result).toBe(`Family: ${family} together`);
    });

    it("2.3 redacts secret token immediately adjacent to multi-byte emoji", () => {
      const redactor = createStreamingRedactor(["SECRET_123"]);
      const output =
        redactor.push("Prefix 🚀SECRET_123🤖 Suffix") + redactor.finish();
      expect(output).toBe("Prefix 🚀[redacted]🤖 Suffix");
    });

    it("2.4 handles empty string chunks and trailing partial secrets on finish", () => {
      const redactor = createStreamingRedactor(["LONG_SECRET_IDENTIFIER_ABC"]);
      const part1 = redactor.push("");
      const part2 = redactor.push("LONG_SECRET_IDEN"); // Partial match at end of stream
      const part3 = redactor.finish(); // Not a full secret, flush buffer cleanly
      const result = [part1, part2, part3].join("");

      expect(result).toBe("LONG_SECRET_IDEN");
    });

    it("2.5 handles large payload (>32KB) with multiple embedded secrets and emojis", () => {
      const secret = "SECRET_TOKEN_EMBEDDED_999";
      const redactor = createStreamingRedactor([secret]);
      const largeSegment = "🤖🚀 Testing long chunk buffer. ".repeat(1000);
      const payload = `${largeSegment}${secret} - end of test.`;

      const output = redactor.push(payload) + redactor.finish();
      expect(output).not.toContain(secret);
      expect(output).toContain("[redacted]");
      expect(output).toContain("🤖🚀");
    });
  });

  describe("Tier 3: Stream Delta Projection & History Reduction", () => {
    it("3.1 accumulates progress deltas with UTF-16 characters and secret masking", () => {
      const secrets = ["SECRET_TOKEN_42"];
      const redactor = createStreamingRedactor(secrets);

      const rawDeltas = [
        "Thinking: ",
        "Analyzing data 📊... ",
        "Key is SEC",
        "RET_TOKEN_42! ",
        "Done ✨.",
      ];

      const redactedDeltas = rawDeltas.map((d) => redactor.push(d));
      const finalFlushed = redactor.finish();
      const allDeltas = [...redactedDeltas, finalFlushed].filter(Boolean);

      let accumulated = "";
      for (const delta of allDeltas) {
        accumulated = progressMessageText({ delta }, accumulated);
      }

      expect(accumulated).toBe("Thinking: Analyzing data 📊... Key is [redacted]! Done ✨.");
      expect(accumulated).not.toContain("SECRET_TOKEN_42");
    });

    it("3.2 projects streaming progress events through projectMessages with durable transition", () => {
      const events = [
        {
          id: "ev-1",
          threadId: "th-1",
          seq: 1,
          type: "thread.message.created",
          payload: { messageId: "msg-user", role: "user", blocks: [{ kind: "text", text: "Run report" }] },
          createdAt: "2026-09-02T12:00:00.000Z",
        },
        {
          id: "ev-2",
          threadId: "th-1",
          seq: 2,
          type: "thread.progress",
          runId: "run-1",
          payload: { delta: "Processing 🚀", streaming: true },
          createdAt: "2026-09-02T12:00:01.000Z",
        },
        {
          id: "ev-3",
          threadId: "th-1",
          seq: 3,
          type: "thread.progress",
          runId: "run-1",
          payload: { delta: " Completed! 🎉", streaming: true },
          createdAt: "2026-09-02T12:00:02.000Z",
        },
      ];

      const messages = projectMessages(events);
      expect(messages).toHaveLength(2);
      expect(messages[0]!.role).toBe("user");
      expect(messages[1]!.blocks[0]).toEqual({
        kind: "progress",
        text: "Processing 🚀 Completed! 🎉",
      });

      // Now durable completion message arrives
      const completedEvents = [
        ...events,
        {
          id: "ev-4",
          threadId: "th-1",
          seq: 4,
          type: "thread.message.created",
          runId: "run-1",
          payload: {
            messageId: "msg-bot",
            role: "bot",
            blocks: [{ kind: "text", text: "Processing 🚀 Completed! 🎉" }],
          },
          createdAt: "2026-09-02T12:00:03.000Z",
        },
      ];

      const durableMessages = projectMessages(completedEvents);
      expect(durableMessages).toHaveLength(2);
      expect(durableMessages[1]!.id).toBe("msg-bot");
      expect(durableMessages[1]!.blocks[0]).toEqual({
        kind: "text",
        text: "Processing 🚀 Completed! 🎉",
      });
    });
  });

  describe("Tier 4: Real-World Multilingual and Code Block Streaming", () => {
    it("4.1 streams mixed French text, markdown fences, emojis, and secret credentials", () => {
      const secrets = ["sk-prod-994411"];
      const redactor = createStreamingRedactor(secrets);

      const streamParts = [
        "### Rapport d'Exécution\n\n",
        "L'agent autonome a été déclenché avec succès 🚀.\n",
        "```json\n",
        '{\n  "status": "ok",\n  "clef": "',
        "sk-prod-",
        '994411"\n}',
        "\n```\n",
        "Opération terminée avec 100% de fiabilité ✨.",
      ];

      const result = streamParts.map((p) => redactor.push(p)).join("") + redactor.finish();

      expect(result).toContain("### Rapport d'Exécution");
      expect(result).toContain("succès 🚀");
      expect(result).toContain('"clef": "[redacted]"');
      expect(result).not.toContain("sk-prod-994411");
      expect(result).toContain("100% de fiabilité ✨");
    });
  });
});
