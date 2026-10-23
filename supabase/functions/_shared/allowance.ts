import type { ServerConfig } from "./config.ts";
import type { AiKind, DenyReason, Plan } from "./types.ts";

// Whether one more AI call is allowed. Pure: the edge function reads the
// snapshot and writes the reservation inside ONE database transaction that
// holds a lock on the account, so two calls at once cannot both take the last
// review.

export interface UsageSnapshot {
  plan: Plan;
  // Lifetime, for the starter pack (launch mode). Refunded calls do not count.
  starterReviewsUsed: number;
  starterTextUsed: number;
  // This UTC month / day, refunded calls excluded.
  monthReviews: number;
  monthInsights: number;
  monthText: number;
  monthCostUsd: number;
  dayReviews: number;
  // All non-Plus spend this UTC month, across every account.
  freeSpendMonthUsd: number;
}

export type Tier = "starter" | "beta" | "plus";

export type Decision = { ok: true; tier: Tier; reviewsLeft: number } | { ok: false; reason: DenyReason };

const deny = (reason: DenyReason): Decision => ({ ok: false, reason });

export function decideAllowance(args: {
  config: ServerConfig;
  kind: AiKind;
  snapshot: UsageSnapshot;
  // Worst-case cost of this call (pricing.estimateCostUsd).
  estCostUsd: number;
}): Decision {
  const { config, kind, snapshot: s, estCostUsd } = args;
  const l = config.limits;

  if (config.killSwitch) return deny("disabled");

  // Only reviews have a daily ceiling, which stops a stuck retry loop.
  if (kind === "review" && s.dayReviews >= l.dailyReviews) return deny("rate_limited");

  const thisReview = kind === "review" ? 1 : 0;

  if (s.plan === "plus") {
    const used = kind === "review" ? s.monthReviews : kind === "insight" ? s.monthInsights : s.monthText;
    const limit = kind === "review" ? l.plusMonthlyReviews : kind === "insight" ? l.plusMonthlyInsights : l.plusMonthlyTextCalls;
    if (used >= limit) return deny("quota_exhausted");
    if (s.monthCostUsd + estCostUsd > l.plusMonthlyCostCapUsd) return deny("plus_cost_cap");
    return { ok: true, tier: "plus", reviewsLeft: Math.max(0, l.plusMonthlyReviews - s.monthReviews - thisReview) };
  }

  // Not on Plus.
  if (kind === "insight" && config.mode === "launch") return deny("plus_required");

  let tier: Tier;
  let reviewsLeft: number;
  if (config.mode === "beta") {
    tier = "beta";
    const used = kind === "review" ? s.monthReviews : kind === "insight" ? s.monthInsights : s.monthText;
    const limit = kind === "review" ? l.betaMonthlyReviews : kind === "insight" ? l.betaMonthlyInsights : l.betaMonthlyTextCalls;
    if (used >= limit) return deny("quota_exhausted");
    reviewsLeft = Math.max(0, l.betaMonthlyReviews - s.monthReviews - thisReview);
  } else {
    tier = "starter";
    if (kind === "review" && s.starterReviewsUsed >= l.starterReviews) return deny("quota_exhausted");
    if (kind === "text" && s.starterTextUsed >= l.starterTextCalls) return deny("quota_exhausted");
    reviewsLeft = Math.max(0, l.starterReviews - s.starterReviewsUsed - thisReview);
  }

  if (s.freeSpendMonthUsd + estCostUsd > config.freeBudgetUsd) return deny("budget_paused");
  return { ok: true, tier, reviewsLeft };
}
