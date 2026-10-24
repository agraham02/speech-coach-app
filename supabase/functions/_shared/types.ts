// Shared by every Tono edge function. Pure TypeScript with no Deno or Node
// APIs, so jest can test it and the functions can import it.

// What a call counts against. A judged take is one "take" whatever the judge
// was sent (the words and measurements, or the video too): one take, one
// count. Exercise notes and mark-ups are "text" calls, pooled behind fair use.
export type CountKind = "take" | "text" | "insight";

// Which model runs it. A take judged from its words uses the text model; the
// video setting uses the video model. The count stays "take" either way.
export type ModelRole = "review_video" | "text" | "insight";

// What the person has: nothing bought, the 14-day free trial (an App Store
// introductory offer on either plan), or Tono Plus.
export type Plan = "free" | "trial" | "plus";

// Which allowance a call was counted against. "beta" is everyone not paying
// while the server is in beta mode (TestFlight testers).
export type Tier = "free" | "beta" | "trial" | "plus";

export type Mode = "beta" | "launch";

// Why a call was refused. The app maps each to plain words.
export type DenyReason =
  | "quota_exhausted" // this month's (or this trial's) count for the kind is used
  | "plus_required" // a Plus-only feature for someone without Plus or a trial
  | "plus_cost_cap" // a subscriber reached this period's AI cost cap
  | "budget_paused" // the monthly spend for non-paying users is used up
  | "rate_limited" // too many judged takes today
  | "disabled"; // the kill switch is on

export function isPaid(plan: Plan): boolean {
  return plan === "trial" || plan === "plus";
}
