import { describe, expect, it } from "vitest";
import {
  APPROVED_FREE_PROVIDERS,
  AVOIDED_PROVIDERS,
  RakazoFreePolicyEngine,
  resolveDeterministicTag,
  TAG_PRIORITY_WEIGHTS,
  VALID_TAGS,
} from "./free-policy-engine.js";
import { type InferenceUsageTag, FREE_INFERENCE_UNAVAILABLE_MESSAGE } from "@rakazo/contracts";

/**
 * Helper to generate all k-permutations of an array
 */
function getPermutations<T>(elements: T[], k: number): T[][] {
  if (k === 0) return [[]];
  if (elements.length === 0) return [];
  const results: T[][] = [];
  for (let i = 0; i < elements.length; i++) {
    const current = elements[i]!;
    const remaining = elements.slice(0, i).concat(elements.slice(i + 1));
    const subPerms = getPermutations(remaining, k - 1);
    for (const sub of subPerms) {
      results.push([current, ...sub]);
    }
  }
  return results;
}

describe("Empirical Challenger: RakazoFreePolicyEngine Rigorous Stress Suite", () => {
  const engine = new RakazoFreePolicyEngine();
  const allTags: InferenceUsageTag[] = ["reasoning", "coding", "analysis", "writing", "fast"];

  // ============================================================================
  // SECTION 1: EXHAUSTIVE COMBINATORIAL TAG PERMUTATION TESTS (1, 2, 3, 4, 5 Tags)
  // ============================================================================
  describe("1. Deterministic Cognitive Priority Matrix — Exhaustive Permutations", () => {
    it("strictly respects weight hierarchy: reasoning (100) > coding (80) > analysis (60) > writing (40) > fast (20)", () => {
      expect(TAG_PRIORITY_WEIGHTS.reasoning).toBe(100);
      expect(TAG_PRIORITY_WEIGHTS.coding).toBe(80);
      expect(TAG_PRIORITY_WEIGHTS.analysis).toBe(60);
      expect(TAG_PRIORITY_WEIGHTS.writing).toBe(40);
      expect(TAG_PRIORITY_WEIGHTS.fast).toBe(20);
    });

    it("evaluates all 1-tag subsets (5 permutations)", () => {
      for (const tag of allTags) {
        const resolved = resolveDeterministicTag([tag]);
        expect(resolved).toBe(tag);

        const route = engine.resolveRoute([tag]);
        expect(route.category).toBe(tag);
        expect(route.model).toBe(`combo/rakazo-${tag}`);
        expect(route.provider).toBe("omniroute");
        expect(route.isFree).toBe(true);
        expect(route.costPerToken).toBe(0.0);
      }
    });

    it("evaluates all 2-tag subsets and their permutations (20 permutations)", () => {
      const perms2 = getPermutations(allTags, 2);
      expect(perms2.length).toBe(20);

      for (const perm of perms2) {
        const expectedTag = perm.reduce((best, cur) =>
          TAG_PRIORITY_WEIGHTS[cur] > TAG_PRIORITY_WEIGHTS[best] ? cur : best
        );

        const resolved = resolveDeterministicTag(perm);
        expect(resolved).toBe(expectedTag);

        const route = engine.resolveRoute(perm);
        expect(route.category).toBe(expectedTag);
        expect(route.model).toBe(`combo/rakazo-${expectedTag}`);
        expect(route.isFree).toBe(true);
        expect(route.costPerToken).toBe(0.0);
      }
    });

    it("verifies specifically that ['fast', 'coding'] and ['coding', 'fast'] yield identical combo/rakazo-coding", () => {
      const route1 = engine.resolveRoute(["fast", "coding"]);
      const route2 = engine.resolveRoute(["coding", "fast"]);

      expect(route1.category).toBe("coding");
      expect(route1.model).toBe("combo/rakazo-coding");

      expect(route2.category).toBe("coding");
      expect(route2.model).toBe("combo/rakazo-coding");

      expect(route1).toEqual(route2);
    });

    it("evaluates all 3-tag subsets and their permutations (60 permutations)", () => {
      const perms3 = getPermutations(allTags, 3);
      expect(perms3.length).toBe(60);

      for (const perm of perms3) {
        const expectedTag = perm.reduce((best, cur) =>
          TAG_PRIORITY_WEIGHTS[cur] > TAG_PRIORITY_WEIGHTS[best] ? cur : best
        );

        const resolved = resolveDeterministicTag(perm);
        expect(resolved).toBe(expectedTag);

        const route = engine.resolveRoute(perm);
        expect(route.category).toBe(expectedTag);
        expect(route.model).toBe(`combo/rakazo-${expectedTag}`);
      }
    });

    it("evaluates all 4-tag and 5-tag permutations (240 permutations)", () => {
      const perms4 = getPermutations(allTags, 4);
      const perms5 = getPermutations(allTags, 5);
      const allHighPerms = [...perms4, ...perms5];
      expect(allHighPerms.length).toBe(240);

      for (const perm of allHighPerms) {
        const expectedTag = perm.reduce((best, cur) =>
          TAG_PRIORITY_WEIGHTS[cur] > TAG_PRIORITY_WEIGHTS[best] ? cur : best
        );

        const resolved = resolveDeterministicTag(perm);
        expect(resolved).toBe(expectedTag);

        const route = engine.resolveRoute(perm);
        expect(route.category).toBe(expectedTag);
        expect(route.model).toBe(`combo/rakazo-${expectedTag}`);
      }
    });

    it("handles repeated duplicate tags deterministically without corruption", () => {
      expect(engine.resolveRoute(["fast", "fast"]).category).toBe("fast");
      expect(engine.resolveRoute(["fast", "coding", "fast", "coding"]).category).toBe("coding");
      expect(engine.resolveRoute(["writing", "reasoning", "writing", "analysis"]).category).toBe("reasoning");
      expect(engine.resolveRoute(["analysis", "analysis", "analysis"]).category).toBe("analysis");
    });

    it("resolves default route to combo/rakazo-fast when tag array is empty or undefined", () => {
      const routeEmpty = engine.resolveRoute([]);
      expect(routeEmpty.category).toBe("general");
      expect(routeEmpty.model).toBe("combo/rakazo-fast");
      expect(routeEmpty.provider).toBe("omniroute");
      expect(routeEmpty.isFree).toBe(true);
      expect(routeEmpty.costPerToken).toBe(0.0);

      const routeUndefined = engine.resolveRoute();
      expect(routeUndefined).toEqual(routeEmpty);
    });
  });

  // ============================================================================
  // SECTION 2: ADVERSARIAL VETO PAID FALLBACK & TROJAN SPARK INJECTIONS
  // ============================================================================
  describe("2. vetoPaidFallback — Security Boundary & Paid Model Blocking", () => {
    const commercialPaidModels = [
      // OpenRouter gpt-oss-120b
      "gpt-oss-120b",
      "gpt-oss-120b-instruct",
      "openrouter/gpt-oss-120b",
      "openai/gpt-oss-120b",
      // OpenAI GPT-4 family
      "gpt-4",
      "gpt-4o",
      "gpt-4o-mini",
      "gpt-4-turbo",
      "gpt-4-32k",
      "gpt-4-1106-preview",
      "openai/gpt-4o",
      "openai/gpt-4o-mini",
      // Anthropic Claude-3 / Sonnet / Opus family
      "claude-3",
      "claude-3-opus",
      "claude-3-sonnet",
      "claude-3-haiku",
      "claude-3-5-sonnet",
      "claude-3-5-sonnet-20241022",
      "claude-3.5-sonnet",
      "claude-3.7-sonnet",
      "anthropic/claude-3-opus",
      "anthropic/claude-3.5-sonnet",
      "anthropic/claude-3.7-sonnet",
      "sonnet-3.5",
      "sonnet",
      "opus-3",
      "opus",
      // Paid OSS models without :free tag
      "meta-llama/llama-3.3-70b-instruct",
      "meta-llama/llama-3.1-405b-instruct",
      "mistralai/mistral-large-2407",
      "qwen/qwen-2.5-72b-instruct",
      "cohere/command-r-plus",
      "google/gemini-pro",
      "google/gemini-1.5-pro",
    ];

    it.each(commercialPaidModels)(
      "strictly blocks paid model '%s'",
      (paidModel) => {
        expect(() => engine.vetoPaidFallback(paidModel)).toThrow(
          FREE_INFERENCE_UNAVAILABLE_MESSAGE
        );
      }
    );

    it("strictly blocks case variations of paid models (e.g. GPT-4, Claude-3-Sonnet, GPT-OSS-120b)", () => {
      const caseVariants = [
        "GPT-4",
        "GPT-4O",
        "Claude-3-Sonnet",
        "ANTHROPIC/CLAUDE-3.5-SONNET",
        "GPT-OSS-120B",
        "OpenRouter/Gpt-Oss-120b",
        "SONNET",
        "OPUS",
      ];
      for (const variant of caseVariants) {
        expect(() => engine.vetoPaidFallback(variant)).toThrow(
          FREE_INFERENCE_UNAVAILABLE_MESSAGE
        );
      }
    });

    it("strictly blocks trojan / disguise attempts where paid model is prefixed with 'combo/'", () => {
      const trojanModels = [
        "combo/gpt-4",
        "combo/gpt-4o",
        "combo/gpt-oss-120b",
        "combo/claude-3",
        "combo/claude-3.5-sonnet",
        "combo/sonnet",
        "combo/opus",
      ];
      for (const trojan of trojanModels) {
        expect(() => engine.vetoPaidFallback(trojan)).toThrow(
          FREE_INFERENCE_UNAVAILABLE_MESSAGE
        );
      }
    });

    it("strictly blocks empty, whitespace-only, and non-string inputs", () => {
      expect(() => engine.vetoPaidFallback("")).toThrow(FREE_INFERENCE_UNAVAILABLE_MESSAGE);
      expect(() => engine.vetoPaidFallback("   ")).toThrow(FREE_INFERENCE_UNAVAILABLE_MESSAGE);
      expect(() => engine.vetoPaidFallback(null as any)).toThrow(FREE_INFERENCE_UNAVAILABLE_MESSAGE);
      expect(() => engine.vetoPaidFallback(undefined as any)).toThrow(FREE_INFERENCE_UNAVAILABLE_MESSAGE);
      expect(() => engine.vetoPaidFallback(123 as any)).toThrow(FREE_INFERENCE_UNAVAILABLE_MESSAGE);
    });

    it("allows valid combo mappings and free models", () => {
      const allowedModels = [
        "combo/rakazo-coding",
        "combo/rakazo-reasoning",
        "combo/rakazo-fast",
        "combo/rakazo-writing",
        "combo/rakazo-analysis",
        "combo/rakazo-router",
        "combo-fast",
        "combo",
        "meta-llama/llama-3.3-70b-instruct:free",
        "deepseek/deepseek-r1:free",
        "google/gemini-2.0-flash-exp:free",
        "qwen/qwen-2.5-coder-32b-instruct:free",
        "mistralai/mistral-7b-instruct:free",
      ];

      for (const model of allowedModels) {
        expect(() => engine.vetoPaidFallback(model)).not.toThrow();
      }
    });
  });

  // ============================================================================
  // SECTION 3: ZERO-COST AND ALLOWLIST BOUNDARY CHECKING
  // ============================================================================
  describe("3. assertZeroCostAndAllowed — Mathematical & Provider Allowlist Bounds", () => {
    it("allows cost 0.0, -0, and 0 for approved providers", () => {
      for (const provider of APPROVED_FREE_PROVIDERS) {
        expect(() => engine.assertZeroCostAndAllowed(provider, 0.0)).not.toThrow();
        expect(() => engine.assertZeroCostAndAllowed(provider, -0)).not.toThrow();
        expect(() => engine.assertZeroCostAndAllowed(provider, 0)).not.toThrow();
      }
    });

    it("strictly blocks micro-costs, epsilon, and fractional costs > 0", () => {
      const leakCosts = [
        0.00000001,
        0.0000001,
        0.00001,
        0.001,
        1.0,
        1e-10,
        1e-15,
        Number.EPSILON,
        Number.MIN_VALUE,
      ];

      for (const cost of leakCosts) {
        expect(() => engine.assertZeroCostAndAllowed("omniroute", cost)).toThrow(
          FREE_INFERENCE_UNAVAILABLE_MESSAGE
        );
      }
    });

    it("strictly blocks negative costs and non-finite numbers", () => {
      const invalidCosts = [-0.00001, -1.0, -100, NaN, Infinity, -Infinity];

      for (const cost of invalidCosts) {
        expect(() => engine.assertZeroCostAndAllowed("omniroute", cost)).toThrow(
          FREE_INFERENCE_UNAVAILABLE_MESSAGE
        );
      }
    });

    it("strictly blocks avoided providers regardless of zero cost", () => {
      for (const avoided of AVOIDED_PROVIDERS) {
        expect(() => engine.assertZeroCostAndAllowed(avoided, 0.0)).toThrow(
          FREE_INFERENCE_UNAVAILABLE_MESSAGE
        );
      }
    });

    it("strictly blocks unapproved third-party providers", () => {
      const unapproved = ["openai", "anthropic", "cohere", "groq", "together", "novamira"];
      for (const provider of unapproved) {
        expect(() => engine.assertZeroCostAndAllowed(provider, 0.0)).toThrow(
          FREE_INFERENCE_UNAVAILABLE_MESSAGE
        );
      }
    });
  });

  // ============================================================================
  // SECTION 4: INPUT SANITIZATION & FAIL-CLOSED INTEGRITY
  // ============================================================================
  describe("4. Fail-Closed Input Sanitization", () => {
    it("rejects invalid tags that are not in VALID_TAGS", () => {
      const invalidTagSets = [
        ["invalid" as any],
        ["coding", "unknown" as any],
        ["admin" as any],
        ["sql_injection" as any],
      ];

      for (const tags of invalidTagSets) {
        expect(() => engine.resolveRoute(tags)).toThrow(FREE_INFERENCE_UNAVAILABLE_MESSAGE);
      }
    });

    it("rejects non-array parameters to resolveRoute (null, string, number, object)", () => {
      const nonArrays = ["coding" as any, 123 as any, {} as any, null as any];

      for (const input of nonArrays) {
        expect(() => engine.resolveRoute(input)).toThrow(FREE_INFERENCE_UNAVAILABLE_MESSAGE);
      }
    });
  });
});
