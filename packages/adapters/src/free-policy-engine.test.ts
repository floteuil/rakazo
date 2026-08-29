import { describe, expect, it } from "vitest";
import {
  APPROVED_FREE_PROVIDERS,
  AVOIDED_PROVIDERS,
  RakazoFreePolicyEngine,
} from "./free-policy-engine.js";

async function getPolicyEngine() {
  return new RakazoFreePolicyEngine();
}

describe("RakazoFreePolicyEngine & Zero-Cost Barrier Test Suite (Tiers 1, 2, 3)", () => {
  // ============================================================================
  // TIER 1: FEATURE COVERAGE (Tag Routing, Zero-Cost Verification, Allowlist)
  // ============================================================================
  describe("Tier 1 - Route Resolution & Model Mapping", () => {
    it("resolves default route when no tags are provided", async () => {
      const engine = await getPolicyEngine();
      const route = engine.resolveRoute([]);

      expect(route.isFree).toBe(true);
      expect(route.costPerToken).toBe(0.0);
      expect(route.provider).toBe("meta-llama");
      expect(route.model).toContain("llama-3.3-70b");
      expect(route.category).toBe("general");
    });

    it("resolves 'coding' tag to approved coder model", async () => {
      const engine = await getPolicyEngine();
      const route = engine.resolveRoute(["coding"]);

      expect(route.isFree).toBe(true);
      expect(route.costPerToken).toBe(0.0);
      expect(route.category).toBe("coding");
      expect(route.provider).toBe("qwen");
      expect(route.model).toContain("coder");
    });

    it("resolves 'reasoning' tag to DeepSeek R1 model", async () => {
      const engine = await getPolicyEngine();
      const route = engine.resolveRoute(["reasoning"]);

      expect(route.isFree).toBe(true);
      expect(route.category).toBe("reasoning");
      expect(route.provider).toBe("deepseek");
      expect(route.model).toContain("r1");
    });

    it("resolves 'writing' tag to Mistral Small model", async () => {
      const engine = await getPolicyEngine();
      const route = engine.resolveRoute(["writing"]);

      expect(route.isFree).toBe(true);
      expect(route.category).toBe("writing");
      expect(route.provider).toBe("mistralai");
      expect(route.model).toContain("mistral-small");
    });

    it("resolves 'fast' tag to lightweight LLaMA model", async () => {
      const engine = await getPolicyEngine();
      const route = engine.resolveRoute(["fast"]);

      expect(route.isFree).toBe(true);
      expect(route.category).toBe("fast");
      expect(route.provider).toBe("meta-llama");
      expect(route.model).toContain("llama-3.2-3b");
    });

    it("resolves 'analysis' tag to heavy Qwen model", async () => {
      const engine = await getPolicyEngine();
      const route = engine.resolveRoute(["analysis"]);

      expect(route.isFree).toBe(true);
      expect(route.category).toBe("analysis");
      expect(route.provider).toBe("qwen");
      expect(route.model).toContain("72b");
    });

    it("resolves primary tag when multiple tags are passed", async () => {
      const engine = await getPolicyEngine();
      const route = engine.resolveRoute(["coding", "fast"]);

      expect(route.category).toBe("coding");
      expect(route.model).toContain("coder");
    });

    it("validates that all approved providers pass assertZeroCostAndAllowed", async () => {
      const engine = await getPolicyEngine();
      for (const provider of APPROVED_FREE_PROVIDERS) {
        expect(() => engine.assertZeroCostAndAllowed(provider, 0.0)).not.toThrow();
      }
    });
  });

  // ============================================================================
  // TIER 2: BOUNDARY & CORNER CASES (Cost Leakage, Vetoes, Fail-Closed)
  // ============================================================================
  describe("Tier 2 - Boundary Checks & Zero-Cost Security Barrier", () => {
    it("strictly rejects positive cost > 0.00 with fail-closed error", async () => {
      const engine = await getPolicyEngine();

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
      expect(() => engine.assertZeroCostAndAllowed("meta-llama", -0.01)).toThrow(
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
    });

    it("allows free models through fallback veto check", async () => {
      const engine = await getPolicyEngine();
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
      expect(telemetryRecord.resolvedProvider).toBe("qwen");
      expect(telemetryRecord.resolvedModel).toContain("coder");
    });

    it("post-inference cost verification validates reported telemetry cost", async () => {
      const engine = await getPolicyEngine();
      expect(() => engine.validatePostInferenceCost(0.0, "deepseek")).not.toThrow();
      expect(() => engine.validatePostInferenceCost(0.005, "deepseek")).toThrow(
        "Capacité gratuite temporairement indisponible",
      );
    });

    it("evaluates route decision for multi-tag reasoning+fast combo with zero-cost guarantee", async () => {
      const engine = await getPolicyEngine();
      const route = engine.resolveRoute(["reasoning", "fast"]);

      expect(route.category).toBe("reasoning");
      expect(route.provider).toBe("deepseek");
      expect(route.model).toBe("deepseek/deepseek-r1:free");
      expect(route.isFree).toBe(true);
      expect(route.costPerToken).toBe(0.0);
    });

    it("evaluates route decision for analysis+writing combo with zero-cost guarantee", async () => {
      const engine = await getPolicyEngine();
      const route = engine.resolveRoute(["analysis", "writing"]);

      expect(route.category).toBe("analysis");
      expect(route.provider).toBe("qwen");
      expect(route.model).toBe("qwen/qwen-2.5-72b-instruct:free");
      expect(route.isFree).toBe(true);
      expect(route.costPerToken).toBe(0.0);
    });

    it("ensures all 5 tag route targets have models ending with :free suffix for fail-safe parsing", async () => {
      const engine = await getPolicyEngine();
      const tags = ["coding", "writing", "reasoning", "fast", "analysis"] as const;

      for (const tag of tags) {
        const route = engine.resolveRoute([tag]);
        expect(route.model.endsWith(":free")).toBe(true);
        expect(() => engine.vetoPaidFallback(route.model)).not.toThrow();
      }
    });

    it("ensures default general route has model ending with :free suffix", async () => {
      const engine = await getPolicyEngine();
      const defaultRoute = engine.resolveRoute([]);
      expect(defaultRoute.model.endsWith(":free")).toBe(true);
      expect(defaultRoute.category).toBe("general");
    });
  });
});
