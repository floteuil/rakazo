import { describe, expect, it } from "vitest";
import {
  APPROVED_FREE_PROVIDERS,
  AVOIDED_PROVIDERS,
  RakazoFreePolicyEngine,
  resolveDeterministicTag,
  TAG_PRIORITY_WEIGHTS,
} from "./free-policy-engine.js";

async function getPolicyEngine() {
  return new RakazoFreePolicyEngine();
}

describe("RakazoFreePolicyEngine & Zero-Cost Barrier Test Suite (Tiers 1, 2, 3)", () => {
  // ============================================================================
  // TIER 1: FEATURE COVERAGE (Tag Routing, Zero-Cost Verification, Allowlist)
  // ============================================================================
  describe("Tier 1 - Route Resolution & Model Mapping (Live Combos)", () => {
    it("resolves default route when no tags are provided to live combo", async () => {
      const engine = await getPolicyEngine();
      const route = engine.resolveRoute([]);

      expect(route.isFree).toBe(true);
      expect(route.costPerToken).toBe(0.0);
      expect(route.provider).toBe("omniroute");
      expect(route.model).toBe("combo/rakazo-fast");
      expect(route.category).toBe("general");
    });

    it("resolves 'coding' tag to live coding combo", async () => {
      const engine = await getPolicyEngine();
      const route = engine.resolveRoute(["coding"]);

      expect(route.isFree).toBe(true);
      expect(route.costPerToken).toBe(0.0);
      expect(route.category).toBe("coding");
      expect(route.provider).toBe("omniroute");
      expect(route.model).toBe("combo/rakazo-coding");
    });

    it("resolves 'reasoning' tag to live reasoning combo", async () => {
      const engine = await getPolicyEngine();
      const route = engine.resolveRoute(["reasoning"]);

      expect(route.isFree).toBe(true);
      expect(route.category).toBe("reasoning");
      expect(route.provider).toBe("omniroute");
      expect(route.model).toBe("combo/rakazo-reasoning");
    });

    it("resolves 'writing' tag to live writing combo", async () => {
      const engine = await getPolicyEngine();
      const route = engine.resolveRoute(["writing"]);

      expect(route.isFree).toBe(true);
      expect(route.category).toBe("writing");
      expect(route.provider).toBe("omniroute");
      expect(route.model).toBe("combo/rakazo-writing");
    });

    it("resolves 'fast' tag to live fast combo", async () => {
      const engine = await getPolicyEngine();
      const route = engine.resolveRoute(["fast"]);

      expect(route.isFree).toBe(true);
      expect(route.category).toBe("fast");
      expect(route.provider).toBe("omniroute");
      expect(route.model).toBe("combo/rakazo-fast");
    });

    it("resolves 'analysis' tag to live analysis combo", async () => {
      const engine = await getPolicyEngine();
      const route = engine.resolveRoute(["analysis"]);

      expect(route.isFree).toBe(true);
      expect(route.category).toBe("analysis");
      expect(route.provider).toBe("omniroute");
      expect(route.model).toBe("combo/rakazo-analysis");
    });

    it("resolves deterministic priority when multiple tags are passed regardless of order", async () => {
      const engine = await getPolicyEngine();

      // coding (80) > fast (20)
      const route1 = engine.resolveRoute(["coding", "fast"]);
      expect(route1.category).toBe("coding");
      expect(route1.model).toBe("combo/rakazo-coding");

      const route2 = engine.resolveRoute(["fast", "coding"]);
      expect(route2.category).toBe("coding");
      expect(route2.model).toBe("combo/rakazo-coding");

      // reasoning (100) > all
      const route3 = engine.resolveRoute(["fast", "writing", "reasoning"]);
      expect(route3.category).toBe("reasoning");
      expect(route3.model).toBe("combo/rakazo-reasoning");
    });

    it("validates that all approved providers pass assertZeroCostAndAllowed", async () => {
      const engine = await getPolicyEngine();
      for (const provider of APPROVED_FREE_PROVIDERS) {
        expect(() => engine.assertZeroCostAndAllowed(provider, 0.0)).not.toThrow();
      }
    });

    it("verifies Cognitive Priority Matrix weights ordering", () => {
      expect(TAG_PRIORITY_WEIGHTS.reasoning).toBeGreaterThan(TAG_PRIORITY_WEIGHTS.coding);
      expect(TAG_PRIORITY_WEIGHTS.coding).toBeGreaterThan(TAG_PRIORITY_WEIGHTS.analysis);
      expect(TAG_PRIORITY_WEIGHTS.analysis).toBeGreaterThan(TAG_PRIORITY_WEIGHTS.writing);
      expect(TAG_PRIORITY_WEIGHTS.writing).toBeGreaterThan(TAG_PRIORITY_WEIGHTS.fast);
    });

    it("resolveDeterministicTag handles empty and multi-tag inputs properly", () => {
      expect(resolveDeterministicTag([])).toBe("general");
      expect(resolveDeterministicTag(["fast"])).toBe("fast");
      expect(resolveDeterministicTag(["fast", "coding"])).toBe("coding");
      expect(resolveDeterministicTag(["analysis", "reasoning", "writing"])).toBe("reasoning");
    });
  });

  // ============================================================================
  // TIER 2: BOUNDARY & CORNER CASES (Cost Leakage, Vetoes, Fail-Closed)
  // ============================================================================
  describe("Tier 2 - Boundary Checks & Zero-Cost Security Barrier", () => {
    it("strictly rejects positive cost > 0.00 with fail-closed error", async () => {
      const engine = await getPolicyEngine();

      expect(() => engine.assertZeroCostAndAllowed("omniroute", 0.0001)).toThrow(
        "Capacité gratuite temporairement indisponible",
      );
      expect(() => engine.assertZeroCostAndAllowed("combo", 0.000001)).toThrow(
        "Capacité gratuite temporairement indisponible",
      );
      expect(() => engine.assertZeroCostAndAllowed("meta-llama", 0.0001)).toThrow(
        "Capacité gratuite temporairement indisponible",
      );
      expect(() => engine.assertZeroCostAndAllowed("deepseek", 0.000001)).toThrow(
        "Capacité gratuite temporairement indisponible",
      );
      expect(() => engine.assertZeroCostAndAllowed("qwen", 1.5)).toThrow(
        "Capacité gratuite temporairement indisponible",
      );
    });

    it("strictly rejects negative cost values", async () => {
      const engine = await getPolicyEngine();
      expect(() => engine.assertZeroCostAndAllowed("omniroute", -0.01)).toThrow(
        "Capacité gratuite temporairement indisponible",
      );
    });

    it("strictly rejects unapproved third-party providers", async () => {
      const engine = await getPolicyEngine();
      expect(() => engine.assertZeroCostAndAllowed("openai", 0.0)).toThrow(
        "Capacité gratuite temporairement indisponible",
      );
      expect(() => engine.assertZeroCostAndAllowed("anthropic", 0.0)).toThrow(
        "Capacité gratuite temporairement indisponible",
      );
      expect(() => engine.assertZeroCostAndAllowed("cohere", 0.0)).toThrow(
        "Capacité gratuite temporairement indisponible",
      );
    });

    it("strictly rejects providers in the avoided list", async () => {
      const engine = await getPolicyEngine();
      for (const avoided of AVOIDED_PROVIDERS) {
        expect(() => engine.assertZeroCostAndAllowed(avoided, 0.0)).toThrow(
          "Capacité gratuite temporairement indisponible",
        );
      }
    });

    it("vetoes any attempt to fallback to paid OpenRouter models", async () => {
      const engine = await getPolicyEngine();

      expect(() => engine.vetoPaidFallback("gpt-oss-120b")).toThrow(
        "Capacité gratuite temporairement indisponible",
      );
      expect(() => engine.vetoPaidFallback("openai/gpt-4o")).toThrow(
        "Capacité gratuite temporairement indisponible",
      );
      expect(() => engine.vetoPaidFallback("anthropic/claude-3.5-sonnet")).toThrow(
        "Capacité gratuite temporairement indisponible",
      );
      expect(() => engine.vetoPaidFallback("meta-llama/llama-3.3-70b-instruct")).toThrow(
        "Capacité gratuite temporairement indisponible",
      );
    });

    it("allows live combos and free models through fallback veto check", async () => {
      const engine = await getPolicyEngine();
      expect(() => engine.vetoPaidFallback("combo/rakazo-coding")).not.toThrow();
      expect(() => engine.vetoPaidFallback("combo/rakazo-reasoning")).not.toThrow();
      expect(() => engine.vetoPaidFallback("combo/rakazo-fast")).not.toThrow();
      expect(() => engine.vetoPaidFallback("combo/rakazo-writing")).not.toThrow();
      expect(() => engine.vetoPaidFallback("combo/rakazo-analysis")).not.toThrow();
      expect(() => engine.vetoPaidFallback("meta-llama/llama-3.3-70b-instruct:free")).not.toThrow();
      expect(() => engine.vetoPaidFallback("qwen/qwen-2.5-coder-32b-instruct:free")).not.toThrow();
    });

    it("rejects invalid input type to resolveRoute", async () => {
      const engine = await getPolicyEngine();
      expect(() => engine.resolveRoute("coding" as any)).toThrow(
        "Capacité gratuite temporairement indisponible",
      );
      expect(() => engine.resolveRoute(null as any)).toThrow(
        "Capacité gratuite temporairement indisponible",
      );
    });

    it("rejects unapproved usage tags with fail-closed error", async () => {
      const engine = await getPolicyEngine();
      expect(() => engine.resolveRoute(["unsupported_tag" as any])).toThrow(
        "Capacité gratuite temporairement indisponible",
      );
    });
  });

  // ============================================================================
  // TIER 3: CROSS-FEATURE INTERACTIONS (Telemetry & Subagent Alignment)
  // ============================================================================
  describe("Tier 3 - Cross-Feature Interactions & Telemetry Formats", () => {
    it("decision output aligns directly with PromptExecutionLog telemetry fields", async () => {
      const engine = await getPolicyEngine();
      const route = engine.resolveRoute(["coding"]);

      const telemetryRecord = {
        inferenceMode: "free",
        requestedCategory: route.category,
        resolvedProvider: route.provider,
        resolvedModel: route.model,
        isFree: route.isFree,
      };

      expect(telemetryRecord.inferenceMode).toBe("free");
      expect(telemetryRecord.isFree).toBe(true);
      expect(telemetryRecord.requestedCategory).toBe("coding");
      expect(telemetryRecord.resolvedProvider).toBe("omniroute");
      expect(telemetryRecord.resolvedModel).toBe("combo/rakazo-coding");
    });

    it("post-inference cost verification validates reported telemetry cost", async () => {
      const engine = await getPolicyEngine();
      expect(() => engine.validatePostInferenceCost(0.0, "omniroute")).not.toThrow();
      expect(() => engine.validatePostInferenceCost(0.005, "omniroute")).toThrow(
        "Capacité gratuite temporairement indisponible",
      );
    });

    it("evaluates route decision for multi-tag reasoning+fast combo with zero-cost guarantee", async () => {
      const engine = await getPolicyEngine();
      const route = engine.resolveRoute(["reasoning", "fast"]);

      expect(route.category).toBe("reasoning");
      expect(route.provider).toBe("omniroute");
      expect(route.model).toBe("combo/rakazo-reasoning");
      expect(route.isFree).toBe(true);
      expect(route.costPerToken).toBe(0.0);
    });

    it("evaluates route decision for analysis+writing combo with zero-cost guarantee", async () => {
      const engine = await getPolicyEngine();
      const route = engine.resolveRoute(["analysis", "writing"]);

      expect(route.category).toBe("analysis");
      expect(route.provider).toBe("omniroute");
      expect(route.model).toBe("combo/rakazo-analysis");
      expect(route.isFree).toBe(true);
      expect(route.costPerToken).toBe(0.0);
    });

    it("ensures all 5 tag route targets have approved combo models", async () => {
      const engine = await getPolicyEngine();
      const tags = ["coding", "writing", "reasoning", "fast", "analysis"] as const;

      for (const tag of tags) {
        const route = engine.resolveRoute([tag]);
        expect(route.model.startsWith("combo/rakazo-")).toBe(true);
        expect(() => engine.vetoPaidFallback(route.model)).not.toThrow();
      }
    });

    it("ensures default general route has model combo/rakazo-fast", async () => {
      const engine = await getPolicyEngine();
      const defaultRoute = engine.resolveRoute([]);
      expect(defaultRoute.model).toBe("combo/rakazo-fast");
      expect(defaultRoute.category).toBe("general");
    });
  });
});
