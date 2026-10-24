import type { Limits, ServerConfig } from "./config.ts";
import type { CountKind, DenyReason, Plan, Tier } from "./types.ts";

// Whether one more AI call is allowed. Pure: the edge function reads the
// snapshot and writes the reservation inside ONE database transaction that
// holds a lock on the account, so two calls at once cannot both take the last
// judged take.
//
// The tiers (docs/decisions/tiers-and-trial.md):
// - free: the measured layer only, plus `freeMonthlyJudgedTakes` judged takes
//   a month (the free taste). Exercise notes, mark-ups and insights are Plus.
// - beta (server mode "beta"): what a TestFlight tester gets without paying.
// - trial: Plus with the trial's own, smaller counts, over the 14 days.
// - plus: the monthly counts.
// Trial and Plus also stop at the cost cap, from real spend, so a model
// change can never make a subscriber cost more than they pay. Free and beta
// share one monthly spend ceiling across everyone (freeBudgetUsd).

export interface UsageSnapshot {
  plan: Plan;
  // Counts over the current window: the trial so far for a trial, else this
  // UTC month. Refunded calls excluded; in-flight ones count.
  takes: number;
  text: number;
  insights: number;
  costUsd: number;
  // Judged takes this UTC day.
  dayTakes: number;
  // All non-paying spend this UTC month, across every account.
  freeSpendMonthUsd: number;
}

export type Decision = { ok: true; tier: Tier; takesLeft: number } | { ok: false; reason: DenyReason };

const deny = (reason: DenyReason): Decision => ({ ok: false, reason });

export function tierFor(config: ServerConfig, plan: Plan): Tier {
  if (plan !== "free") return plan;
  return config.mode === "beta" ? "beta" : "free";
}

// The counts each tier gets. A zero means the tier doesn't get that kind.
export function limitsFor(l: Limits, tier: Tier): Record<CountKind, number> {
  switch (tier) {
    case "plus":
      return { take: l.plusMonthlyJudgedTakes, text: l.plusMonthlyTextCalls, insight: l.plusMonthlyInsights };
    case "trial":
      return { take: l.trialJudgedTakes, text: l.trialTextCalls, insight: l.trialInsights };
    case "beta":
      return { take: l.betaMonthlyJudgedTakes, text: l.betaMonthlyTextCalls, insight: l.betaMonthlyInsights };
    case "free":
      return { take: l.freeMonthlyJudgedTakes, text: 0, insight: 0 };
  }
}

function used(s: UsageSnapshot, kind: CountKind): number {
  return kind === "take" ? s.takes : kind === "text" ? s.text : s.insights;
}

export function decideAllowance(args: {
  config: ServerConfig;
  kind: CountKind;
  snapshot: UsageSnapshot;
  // Worst-case cost of this call (pricing.estimateCostUsd).
  estCostUsd: number;
}): Decision {
  const { config, kind, snapshot: s, estCostUsd } = args;
  const l = config.limits;

  if (config.killSwitch) return deny("disabled");

  // Only judged takes have a daily ceiling, which stops a stuck retry loop.
  if (kind === "take" && s.dayTakes >= l.dailyJudgedTakes) return deny("rate_limited");

  const tier = tierFor(config, s.plan);
  const limit = limitsFor(l, tier)[kind];
  // Something this tier never gets is a Plus feature, not a used-up count.
  if (limit <= 0) return deny("plus_required");
  if (used(s, kind) >= limit) return deny("quota_exhausted");

  if (tier === "plus" || tier === "trial") {
    if (s.costUsd + estCostUsd > l.paidCostCapUsd) return deny("plus_cost_cap");
  } else if (s.freeSpendMonthUsd + estCostUsd > config.freeBudgetUsd) {
    return deny("budget_paused");
  }

  const takesLimit = limitsFor(l, tier).take;
  return { ok: true, tier, takesLeft: Math.max(0, takesLimit - s.takes - (kind === "take" ? 1 : 0)) };
}
