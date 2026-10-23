import type { Tier, UsageSnapshot } from "./allowance.ts";
import type { ServerConfig } from "./config.ts";
import { utcNextMonthStart } from "./time.ts";
import type { DenyReason, Plan } from "./types.ts";

// What the phone is told about a person's allowance. The shape matches
// TonoAllowance in the app (src/domain/aiAllowance.ts).
export interface AllowanceView {
  plan: Plan;
  tier: Tier;
  reviewsLeft: number;
  reviewsTotal: number;
  // When a monthly allowance refills (ISO). Null for the one-off starter pack.
  resetsAt: string | null;
}

export function tierFor(config: ServerConfig, plan: Plan): Tier {
  if (plan === "plus") return "plus";
  return config.mode === "beta" ? "beta" : "starter";
}

export function describeAllowance(config: ServerConfig, snapshot: UsageSnapshot, now: Date): AllowanceView {
  const tier = tierFor(config, snapshot.plan);
  const l = config.limits;
  if (tier === "starter") {
    return {
      plan: snapshot.plan,
      tier,
      reviewsTotal: l.starterReviews,
      reviewsLeft: Math.max(0, l.starterReviews - snapshot.starterReviewsUsed),
      resetsAt: null,
    };
  }
  const total = tier === "plus" ? l.plusMonthlyReviews : l.betaMonthlyReviews;
  return {
    plan: snapshot.plan,
    tier,
    reviewsTotal: total,
    reviewsLeft: Math.max(0, total - snapshot.monthReviews),
    resetsAt: utcNextMonthStart(now).toISOString(),
  };
}

// HTTP status for each refusal. Out-of-allowance is 402 so the app can tell it
// apart from a real failure and offer the next step instead of a retry.
export function statusForDeny(reason: DenyReason | "in_flight" | "already_done"): number {
  switch (reason) {
    case "quota_exhausted":
    case "plus_required":
    case "plus_cost_cap":
      return 402;
    case "rate_limited":
      return 429;
    case "in_flight":
    case "already_done":
      return 409;
    case "budget_paused":
    case "disabled":
      return 503;
  }
}
