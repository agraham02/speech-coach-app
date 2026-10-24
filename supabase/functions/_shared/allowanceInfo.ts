import { limitsFor, tierFor, type UsageSnapshot } from "./allowance.ts";
import type { ServerConfig } from "./config.ts";
import { utcNextMonthStart } from "./time.ts";
import type { DenyReason, Plan, Tier } from "./types.ts";

export { tierFor } from "./allowance.ts";

// What the phone is told about a person's allowance. The shape matches
// TonoAllowance in the app (src/domain/aiAllowance.ts).
export interface AllowanceView {
  plan: Plan;
  tier: Tier;
  // Judged takes: one take, one count, whatever the judge was sent.
  takesLeft: number;
  takesTotal: number;
  // When the counts refill (ISO): the 1st of next month (UTC). For a trial,
  // when it ends (it turns into Plus then, unless cancelled).
  resetsAt: string;
  // The trial's end, for "Free until 14 November". Null outside a trial.
  trialEndsAt: string | null;
}

export function describeAllowance(
  config: ServerConfig,
  snapshot: UsageSnapshot,
  now: Date,
  trialEndsAt: Date | null = null,
): AllowanceView {
  const tier = tierFor(config, snapshot.plan);
  const total = limitsFor(config.limits, tier).take;
  const trialEnd = tier === "trial" && trialEndsAt ? trialEndsAt.toISOString() : null;
  return {
    plan: snapshot.plan,
    tier,
    takesTotal: total,
    takesLeft: Math.max(0, total - snapshot.takes),
    resetsAt: trialEnd ?? utcNextMonthStart(now).toISOString(),
    trialEndsAt: trialEnd,
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
