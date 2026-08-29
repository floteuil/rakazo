import {
  FREE_INFERENCE_UNAVAILABLE_MESSAGE,
  type InferenceUsageTag,
} from "@rakazo/contracts";

export { FREE_INFERENCE_UNAVAILABLE_MESSAGE };

export const APPROVED_FREE_PROVIDERS = [
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

const VALID_TAGS = new Set<InferenceUsageTag>([
  "coding",
  "writing",
  "reasoning",
  "fast",
  "analysis",
]);

export class RakazoFreePolicyEngine {
  private approvedProviders = new Set<string>(APPROVED_FREE_PROVIDERS);
  private avoidedProviders = new Set<string>(AVOIDED_PROVIDERS);

  private tagToModelMap: Record<InferenceUsageTag, { provider: string; model: string }> = {
    coding: {
      provider: "qwen",
      model: "qwen/qwen-2.5-coder-32b-instruct:free",
    },
    reasoning: {
      provider: "deepseek",
      model: "deepseek/deepseek-r1:free",
    },
    writing: {
      provider: "mistralai",
      model: "mistralai/mistral-small-24b-instruct:free",
    },
    fast: {
      provider: "meta-llama",
      model: "meta-llama/llama-3.2-3b-instruct:free",
    },
    analysis: {
      provider: "qwen",
      model: "qwen/qwen-2.5-72b-instruct:free",
    },
  };

  private defaultRoute: { provider: string; model: string } = {
    provider: "meta-llama",
    model: "meta-llama/llama-3.3-70b-instruct:free",
  };

  /**
   * Resolves the free model route for the given usage tags.
   * Priority is given to the first valid tag. If no tags are provided,
   * the default general route is returned.
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

    const primaryTag = tags[0]!;
    const target = this.tagToModelMap[primaryTag];

    if (!target) {
      throw new Error(FREE_INFERENCE_UNAVAILABLE_MESSAGE);
    }

    this.assertZeroCostAndAllowed(target.provider, 0.0);

    return {
      provider: target.provider,
      model: target.model,
      isFree: true,
      costPerToken: 0.0,
      category: primaryTag,
    };
  }

  /**
   * Asserts that the provider is on the approved allowlist, not avoided,
   * and that the cost is strictly $0.0000000.
   */
  public assertZeroCostAndAllowed(provider: string, cost: number): void {
    if (typeof cost !== "number" || Number.isNaN(cost) || cost !== 0.0 || cost > 0.00000001 || cost < 0) {
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
   * Validates post-inference reported cost to enforce the zero-cost guarantee.
   */
  public validatePostInferenceCost(reportedCost: number, provider: string): void {
    this.assertZeroCostAndAllowed(provider, reportedCost);
  }

  /**
   * Vetoes any attempt to fallback to a paid or non-free model.
   */
  public vetoPaidFallback(intendedModel: string): void {
    if (typeof intendedModel !== "string") {
      throw new Error(FREE_INFERENCE_UNAVAILABLE_MESSAGE);
    }

    if (!intendedModel.includes(":free") && !intendedModel.includes("free")) {
      throw new Error(FREE_INFERENCE_UNAVAILABLE_MESSAGE);
    }

    const lower = intendedModel.toLowerCase();
    if (
      lower.includes("gpt-oss-120b") && !lower.includes(":free") ||
      lower.includes("gpt-4") ||
      lower.includes("claude-3") ||
      lower.includes("sonnet") ||
      lower.includes("opus")
    ) {
      throw new Error(FREE_INFERENCE_UNAVAILABLE_MESSAGE);
    }
  }
}

export const FreePolicyEngine = RakazoFreePolicyEngine;
