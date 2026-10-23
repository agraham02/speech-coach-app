// Shared by every Tono edge function. Pure TypeScript with no Deno or Node
// APIs, so jest can test it and the functions can import it.

export type AiKind = "review" | "text" | "insight";
export type ModelRole = "review_video" | "text" | "insight";
export type Plan = "free" | "plus";
export type Mode = "beta" | "launch";

// Why a call was refused. The app maps each to plain words.
export type DenyReason =
  | "quota_exhausted" // out of the starter pack, beta allowance or Plus count for this kind
  | "plus_required" // a Plus-only feature on a free account
  | "plus_cost_cap" // a Plus subscriber used this month's AI allowance
  | "budget_paused" // the monthly spend for non-paying users is used up
  | "rate_limited" // too many reviews today
  | "disabled"; // the kill switch is on

export function roleForKind(kind: AiKind): ModelRole {
  return kind === "review" ? "review_video" : kind;
}
