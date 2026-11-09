import { describe, expect, it } from "vitest";
import {
  SOVEREIGN_MEMORY_PROFILES,
  analyzeSentinelTelemetry,
  buildMemoryArchiveEntry,
  enforceMemoryBudget,
  findDuplicateActiveRun,
  isSameRequest,
  normalizeErrorSignature,
  normalizeErrorTitle,
  normalizeRequestWords,
  resolveMemoryBudget,
} from "./index.js";

describe("OpenMausBot Reverse-Engineered Innovations Test Suite", () => {
  describe("1. Same-Request Deduplication (Token Saver)", () => {
    it("1.1 normalizes case, accents, punctuation, and extra whitespace", () => {
      const rawA = "Analyser les 5-6 mots-clés SEO prioritaires pour le domaine floteuil.fr !";
      const rawB = "analyser les 5 6 mots clés seo prioritaires pour le domaine floteuil fr ?";
      expect(normalizeRequestWords(rawA)).toBe(normalizeRequestWords(rawB));
    });

    it("1.2 refuses deduplication for short queries (< 40 chars)", () => {
      expect(isSameRequest("merci beaucoup !", "merci beaucoup !")).toBe(false);
      expect(isSameRequest("continue l'analyse", "continue l'analyse")).toBe(false);
    });

    it("1.3 approves deduplication for identical long requests (>= 40 chars)", () => {
      const q1 = "Rédige une stratégie complète de netlinking et de mots-clés pour le site.";
      const q2 = "rédige une stratégie complète de netlinking et de mots clés pour le site";
      expect(isSameRequest(q1, q2)).toBe(true);
    });

    it("1.4 distinguishes different requests even if only 1 word differs", () => {
      const q1 = "Rédige une stratégie complète de netlinking pour le site principal";
      const q2 = "Rédige une stratégie complète de netlinking pour le site secondaire";
      expect(isSameRequest(q1, q2)).toBe(false);
    });

    it("1.5 findDuplicateActiveRun detects queued or running duplicate runs", () => {
      const runs = [
        {
          id: "run-1",
          status: "running",
          prompt: "Rédige une stratégie complète de netlinking et de mots-clés pour le site.",
        },
        {
          id: "run-2",
          status: "completed",
          prompt: "Autre tâche terminée sans rapport avec la requête.",
        },
      ];

      const match = findDuplicateActiveRun(
        runs,
        "rédige une stratégie complète de netlinking et de mots clés pour le site !",
      );
      expect(match).not.toBeNull();
      expect(match?.id).toBe("run-1");

      const noMatch = findDuplicateActiveRun(runs, "Une toute autre requête qui n'a rien à voir.");
      expect(noMatch).toBeNull();
    });
  });

  describe("2. Dynamic Memory Budget & LRU Archiving", () => {
    it("2.1 resolves dynamic budget based on model name", () => {
      expect(resolveMemoryBudget("google/gemini-3.1-pro").id).toBe("gemini-3.1");
      expect(resolveMemoryBudget("gemini-1.5-flash").id).toBe("gemini-1.5");
      expect(resolveMemoryBudget("openai/gpt-oss-120b").id).toBe("gpt-oss-120b");
      expect(resolveMemoryBudget("mistralai/mistral-large").id).toBe("mistral");
      expect(resolveMemoryBudget("custom-unknown-model").id).toBe("default");
    });

    it("2.2 enforces strict line and byte caps for Gemini 3.1 (250 lines / 32 KB)", () => {
      const lines = Array.from({ length: 300 }, (_, i) => `Ligne mémoire persistante n°${i}`);
      const content = lines.join("\n");

      const result = enforceMemoryBudget(content, "gemini-3.1");
      expect(result.stats.lineCount).toBe(250);
      expect(result.evictedLines).toHaveLength(50);
      expect(result.stats.isTruncated).toBe(true);
      expect(result.stats.status).toBe("red");
    });

    it("2.3 enforces tighter limits for Mistral AI (150 lines / 16 KB)", () => {
      const lines = Array.from({ length: 180 }, (_, i) => `Ligne pour modèle Mistral n°${i}`);
      const content = lines.join("\n");

      const result = enforceMemoryBudget(content, "mistral");
      expect(result.stats.lineCount).toBe(150);
      expect(result.evictedLines).toHaveLength(30);
      expect(result.stats.modelProfile.maxLines).toBe(150);
      expect(result.stats.status).toBe("red");
    });

    it("2.4 formats LRU archive entry cleanly with timestamp", () => {
      const evicted = ["Ancien fait 1", "Ancien fait 2"];
      const archiveText = buildMemoryArchiveEntry(evicted, new Date("2026-11-09T12:00:00.000Z"));
      expect(archiveText).toContain("### · Archivé le 2026-11-09");
      expect(archiveText).toContain("Ancien fait 1");
      expect(archiveText).toContain("Ancien fait 2");
    });
  });

  describe("3. Sentinel Zero-LLM Health Scanner", () => {
    it("3.1 normalizes error signatures by replacing UUIDs, paths, and IPs", () => {
      const err1 =
        "Failed to connect to /var/run/mcp/12345678-1234-1234-1234-123456789abc.sock at 192.168.1.10";
      const err2 =
        "Failed to connect to /tmp/mcp/abcdefab-cdef-cdef-cdef-abcdefabcdef.sock at 10.0.0.5";
      const sig1 = normalizeErrorSignature("searxng_scraperr_search", err1);
      const sig2 = normalizeErrorSignature("searxng_scraperr_search", err2);
      expect(sig1).toBe(sig2);
    });

    it("3.2 normalizes error title within 140 characters", () => {
      const longError = "Erreur fatale: " + "/usr/local/bin/somedir/tool ".repeat(20);
      const title = normalizeErrorTitle(longError);
      expect(title.length).toBeLessThanOrEqual(140);
      expect(title).toContain("<chemin>");
    });

    it("3.3 analyzes telemetry with zero LLM cost and computes connector health", () => {
      const logs = [
        { toolName: "postiz_create_post", ok: true, latencyMs: 250 },
        { toolName: "postiz_list_posts", ok: true, latencyMs: 120 },
        {
          toolName: "searxng_scraperr_search",
          ok: false,
          error: "Connection timeout after 5000ms",
        },
        {
          toolName: "searxng_scraperr_search",
          ok: false,
          error: "Connection timeout after 5000ms",
        },
        { toolName: "twenty_create_person", ok: true, latencyMs: 90 },
      ];

      const report = analyzeSentinelTelemetry(logs);
      expect(report.zeroLlmCost).toBe(true);
      expect(report.totalScanned).toBe(5);
      expect(report.totalFailures).toBe(2);
      expect(report.issues.length).toBeGreaterThan(0);
      expect(report.issues[0]?.kind).toBe("timeout");
      expect(report.issues[0]?.count).toBe(2);
      expect(report.connectorHealth.searxng_scraperr?.failedCalls).toBe(2);
      expect(report.connectorHealth.postiz?.failedCalls).toBe(0);
    });
  });
});
