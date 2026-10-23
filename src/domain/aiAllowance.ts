// What the user is told about their Tono AI allowance, in plain words, and
// what they are offered when a call is refused. Pure.

export type AllowanceTier = "starter" | "beta" | "plus";

// The server reports this from `me` and with every successful call.
export interface TonoAllowance {
  plan: "free" | "plus";
  tier: AllowanceTier;
  reviewsLeft: number;
  reviewsTotal: number;
  // When a monthly allowance refills (ISO). Null for the one-off starter pack.
  resetsAt: string | null;
}

export type DenyReason =
  | "quota_exhausted"
  | "plus_required"
  | "plus_cost_cap"
  | "budget_paused"
  | "rate_limited"
  | "disabled";

// What can be done next. The sheet shows these, in this order.
export type NextStep = "get_plus" | "own_key" | "on_device" | "wait";

function plural(n: number, one: string, many: string): string {
  return n === 1 ? one : many;
}

// The line shown under a review button and in Settings.
export function allowanceLine(a: TonoAllowance): string {
  const left = a.reviewsLeft;
  if (a.tier === "starter") {
    if (left <= 0) return "No free AI reviews left";
    return `${left} of ${a.reviewsTotal} free AI ${plural(left, "review", "reviews")} left`;
  }
  if (left <= 0) return "No AI reviews left this month";
  return `${left} AI ${plural(left, "review", "reviews")} left this month`;
}

// A short note for the save screen when this review will use one.
export function usesOneLine(a: TonoAllowance): string {
  if (a.reviewsLeft <= 0) return "";
  return a.tier === "starter"
    ? `Uses 1 of your ${a.reviewsLeft} free ${plural(a.reviewsLeft, "review", "reviews")}`
    : `Uses 1 of your ${a.reviewsLeft} ${plural(a.reviewsLeft, "review", "reviews")} this month`;
}

export function denialMessage(reason: DenyReason, a: TonoAllowance | null): string {
  switch (reason) {
    case "quota_exhausted":
      return a?.tier === "starter" ? "You have used your free AI reviews." : "You have used this month's AI reviews.";
    case "plus_required":
      return "This is part of Tono Plus.";
    case "plus_cost_cap":
      return "You have used this month's AI allowance. It refills on the 1st.";
    case "budget_paused":
      return "Free AI reviews are paused for now. They are back on the 1st.";
    case "rate_limited":
      return "That is a lot of reviews for one day. Try again tomorrow.";
    case "disabled":
      return "AI reviews are switched off for a moment. Try again soon.";
  }
}

// What to offer. Free users can buy Plus; Plus users cannot buy more, so they
// are pointed at their own key or the phone.
export function nextSteps(reason: DenyReason, plan: "free" | "plus"): NextStep[] {
  const upgrade: NextStep[] = plan === "free" ? ["get_plus"] : [];
  switch (reason) {
    case "quota_exhausted":
    case "budget_paused":
      return [...upgrade, "own_key", "on_device"];
    case "plus_required":
      return ["get_plus", "on_device"];
    case "plus_cost_cap":
      return ["own_key", "on_device"];
    case "rate_limited":
      return ["wait"];
    case "disabled":
      return ["own_key", "on_device"];
  }
}

// A refused call needs the user to act, so it is not retried by itself.
export function isActionNeeded(reason: DenyReason): boolean {
  return reason !== "disabled";
}
