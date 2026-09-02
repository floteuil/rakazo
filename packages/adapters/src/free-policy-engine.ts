import { FREE_INFERENCE_UNAVAILABLE_MESSAGE, type InferenceUsageTag } from "@rakazo/contracts";

export { FREE_INFERENCE_UNAVAILABLE_MESSAGE };

export const APPROVED_FREE_PROVIDERS = [
  "omniroute",
  "combo",
  "meta-llama",
  "mistralai",
  "qwen",
  "deepseek",
  "google",
] as const;

export type ApprovedFreeProvider = (typeof APPROVED_FREE_PROVIDERS)[number];

export const AVOIDED_PROVIDERS = [
  "unapproved_commercial_proxy",
  "unknown_vendor",
  "tos_violating_mirror",
] as const;

export type AvoidedProvider = (typeof AVOIDED_PROVIDERS)[number];

export interface FreeRouteDecision {
  provider: string;
  model: string;
  isFree: true;
  costPerToken: number;
  category: InferenceUsageTag | "general";
}

export const VALID_TAGS = new Set<InferenceUsageTag>([
  "coding",
  "writing",
  "reasoning",
  "fast",
  "analysis",
]);

export const TAG_PRIORITY_WEIGHTS: Record<InferenceUsageTag, number> = {
  reasoning: 100,
  coding: 80,
  analysis: 60,
  writing: 40,
  fast: 20,
};

/**
 * Resolves the deterministic primary tag from an array of usage tags
 * according to the Cognitive Priority Matrix:
 * reasoning (100) > coding (80) > analysis (60) > writing (40) > fast (20).
 */
export function resolveDeterministicTag(
  tags: InferenceUsageTag[] = [],
): InferenceUsageTag | "general" {
  if (!Array.isArray(tags) || tags.length === 0) return "general";
  const valid = tags.filter((t) => VALID_TAGS.has(t));
  if (valid.length === 0) return "general";

  const sorted = [...valid].sort((a, b) => {
    const weightA = TAG_PRIORITY_WEIGHTS[a] ?? 0;
    const weightB = TAG_PRIORITY_WEIGHTS[b] ?? 0;
    return weightB - weightA;
  });

  return sorted[0]!;
}

export class RakazoFreePolicyEngine {
  private approvedProviders = new Set<string>(APPROVED_FREE_PROVIDERS);
  private avoidedProviders = new Set<string>(AVOIDED_PROVIDERS);

  private tagToModelMap: Record<InferenceUsageTag, { provider: string; model: string }> = {
    coding: {
      provider: "omniroute",
      model: "combo/rakazo-coding",
    },
    reasoning: {
      provider: "omniroute",
      model: "combo/rakazo-reasoning",
    },
    writing: {
      provider: "omniroute",
      model: "combo/rakazo-writing",
    },
    fast: {
      provider: "omniroute",
      model: "combo/rakazo-fast",
    },
    analysis: {
      provider: "omniroute",
      model: "combo/rakazo-analysis",
    },
  };

  private defaultRoute: { provider: string; model: string } = {
    provider: "omniroute",
    model: "combo/rakazo-fast",
  };

  /**
   * Resolves the free model route for the given usage tags.
   * Priority is resolved deterministically via the Cognitive Priority Matrix:
   * reasoning (100) > coding (80) > analysis (60) > writing (40) > fast (20).
   * If no tags are provided, the default general route is returned.
   *
   * Rejects invalid inputs or unapproved tags fail-closed.
   */
  public resolveRoute(tags: InferenceUsageTag[] = []): FreeRouteDecision {
    if (!Array.isArray(tags)) {
      throw new Error(FREE_INFERENCE_UNAVAILABLE_MESSAGE);
    }

    for (const tag of tags) {
      if (!VALID_TAGS.has(tag)) {
        throw new Error(FREE_INFERENCE_UNAVAILABLE_MESSAGE);
      }
    }

    if (tags.length === 0) {
      this.assertZeroCostAndAllowed(this.defaultRoute.provider, 0.0);
      return {
        provider: this.defaultRoute.provider,
        model: this.defaultRoute.model,
        isFree: true,
        costPerToken: 0.0,
        category: "general",
      };
    }

    const resolvedTag = resolveDeterministicTag(tags);
    if (resolvedTag === "general") {
      this.assertZeroCostAndAllowed(this.defaultRoute.provider, 0.0);
      return {
        provider: this.defaultRoute.provider,
        model: this.defaultRoute.model,
        isFree: true,
        costPerToken: 0.0,
        category: "general",
      };
    }

    const target = this.tagToModelMap[resolvedTag];
    if (!target) {
      throw new Error(FREE_INFERENCE_UNAVAILABLE_MESSAGE);
    }

    this.assertZeroCostAndAllowed(target.provider, 0.0);

    return {
      provider: target.provider,
      model: target.model,
      isFree: true,
      costPerToken: 0.0,
      category: resolvedTag,
    };
  }

  /**
   * Validates provider and cost for OmniRoute responses.
   * Accepts all dynamic providers managed internally by OmniRoute while blocking avoided providers.
   */
  public assertZeroCostAndAllowed(provider: string, cost?: number): void {
    if (typeof provider !== "string" || provider.trim().length === 0) {
      throw new Error(FREE_INFERENCE_UNAVAILABLE_MESSAGE);
    }
    if (cost !== undefined && (typeof cost !== "number" || Number.isNaN(cost) || cost !== 0.0 || cost > 0 || cost < 0)) {
      throw new Error(FREE_INFERENCE_UNAVAILABLE_MESSAGE);
    }
    if (this.avoidedProviders.has(provider)) {
      throw new Error(FREE_INFERENCE_UNAVAILABLE_MESSAGE);
    }
    if (!this.approvedProviders.has(provider)) {
      throw new Error(FREE_INFERENCE_UNAVAILABLE_MESSAGE);
    }
  }

  /**
   * Validates post-inference reported cost to enforce the policy.
   */
  public validatePostInferenceCost(reportedCost: number, provider: string): void {
    this.assertZeroCostAndAllowed(provider, reportedCost);
  }

  /**
   * Validates that the intended model is a valid route or model name.
   */
  public vetoPaidFallback(intendedModel: string): void {
    if (typeof intendedModel !== "string" || intendedModel.trim().length === 0) {
      throw new Error(FREE_INFERENCE_UNAVAILABLE_MESSAGE);
    }

    const lower = intendedModel.toLowerCase();
    if (
      (lower.includes("gpt-oss-120b") && !lower.includes(":free")) ||
      lower.includes("gpt-4") ||
      lower.includes("claude-3") ||
      lower.includes("sonnet") ||
      lower.includes("opus")
    ) {
      throw new Error(FREE_INFERENCE_UNAVAILABLE_MESSAGE);
    }

    const isCombo = lower.startsWith("combo/") || lower.startsWith("combo-") || lower === "combo";
    const isFreeExplicit = lower.includes(":free") || lower.includes("free") || lower.includes("rakazo");

    if (!isCombo && !isFreeExplicit) {
      throw new Error(FREE_INFERENCE_UNAVAILABLE_MESSAGE);
    }
  }
}

export const FreePolicyEngine = RakazoFreePolicyEngine;
