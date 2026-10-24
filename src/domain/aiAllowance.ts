// What the person is told about their Tono AI allowance, in plain words, and
// what they are offered when a call is refused. Pure.
//
// The rules live on the server (supabase/functions/_shared/allowance.ts):
// - free: one judged take a month (a server setting), nothing else judged;
// - trial: the 14-day free trial, with its own counts over the trial;
// - plus: 60 judged takes a month;
// - beta: what TestFlight testers get without paying.
// A judged take is one count whatever the judge was sent: one take, one count.

export type AllowancePlan = "free" | "trial" | "plus";
export type AllowanceTier = "free" | "beta" | "trial" | "plus";

// The server reports this from `me` and with every successful call.
export interface TonoAllowance {
  plan: AllowancePlan;
  tier: AllowanceTier;
  takesLeft: number;
  takesTotal: number;
  // When the counts refill (ISO): the 1st of next month (UTC), or a trial's end.
  resetsAt: string;
  // The trial's end, for "free until 6 November". Null outside a trial.
  trialEndsAt: string | null;
}

export type DenyReason = "quota_exhausted" | "plus_required" | "plus_cost_cap" | "budget_paused" | "rate_limited" | "disabled";

// What can be done next. Shown in this order.
export type NextStep = "start_trial" | "get_plus" | "wait";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

// "1 November". UTC, because the counts refill at midnight UTC on the 1st.
export function dayLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

function plural(n: number, one: string, many: string): string {
  return n === 1 ? one : many;
}

export function isPaidPlan(a: TonoAllowance | null | undefined): boolean {
  return a?.plan === "trial" || a?.plan === "plus";
}

// The line under the Tono AI row in Settings and on the account card.
export function allowanceLine(a: TonoAllowance): string {
  const left = a.takesLeft;
  switch (a.tier) {
    case "free":
      if (a.takesTotal <= 0) return "Judged takes are part of Tono Plus";
      if (left <= 0) return `Free judged take used · the next one comes on ${dayLabel(a.resetsAt)}`;
      return a.takesTotal === 1 ? "Your free judged take this month is ready" : `${left} of ${a.takesTotal} free judged takes left this month`;
    case "trial": {
      const until = a.trialEndsAt ? ` · free until ${dayLabel(a.trialEndsAt)}` : "";
      return `${left} of ${a.takesTotal} judged ${plural(a.takesTotal, "take", "takes")} left in your trial${until}`;
    }
    case "beta":
    case "plus":
      if (left <= 0) return `No judged takes left this month · more on ${dayLabel(a.resetsAt)}`;
      return `${left} of ${a.takesTotal} judged ${plural(a.takesTotal, "take", "takes")} left this month`;
  }
}

// The save screen, under "Have Tono AI judge this take". Empty when nothing
// is left (the switch is off then, and usedUpLine says why).
export function usesOneLine(a: TonoAllowance): string {
  if (a.takesLeft <= 0) return "";
  switch (a.tier) {
    case "free":
      return a.takesTotal === 1 ? "Uses your free judged take for this month." : `Uses 1 of your ${a.takesLeft} free judged takes this month.`;
    case "trial":
      return `Counts as 1 of the ${a.takesLeft} judged ${plural(a.takesLeft, "take", "takes")} left in your trial.`;
    case "beta":
    case "plus":
      return `Counts as 1 of the ${a.takesLeft} judged ${plural(a.takesLeft, "take", "takes")} left this month.`;
  }
}

// When the free judged take (or a month's count) is used: what happened and
// when it comes back. Never a dead end: the measured layer is still there.
export function usedUpLine(a: TonoAllowance): string {
  if (a.tier === "free") {
    return a.takesTotal > 0
      ? `You've used this month's free judged take. The next one comes on ${dayLabel(a.resetsAt)}. Your phone's measurements and tips are here as always.`
      : "Judged takes are part of Tono Plus. Your phone's measurements and tips are here as always.";
  }
  if (a.tier === "trial") return "You've used the judged takes in your trial. Your phone's measurements and tips are here as always.";
  return `You've used this month's judged takes. More come on ${dayLabel(a.resetsAt)}. Your phone's measurements and tips are here as always.`;
}

export function denialMessage(reason: DenyReason, a: TonoAllowance | null): string {
  switch (reason) {
    case "quota_exhausted":
      if (a?.tier === "free") return "You've used this month's free judged take.";
      if (a?.tier === "trial") return "You've used the judged takes in your trial.";
      return "You've used this month's judged takes.";
    case "plus_required":
      return "This is part of Tono Plus.";
    case "plus_cost_cap":
      return `You've reached this month's Tono AI limit. It refills on ${a ? dayLabel(a.resetsAt) : "the 1st"}.`;
    case "budget_paused":
      return "Free Tono AI is paused for now. It's back on the 1st.";
    case "rate_limited":
      return "That's a lot of judged takes for one day. Try again tomorrow.";
    case "disabled":
      return "Tono AI is switched off for a moment. Try again soon.";
  }
}

// What to offer after a refusal. Someone without Plus can start the trial
// (when the App Store says they still can) or buy Plus; a subscriber can only
// wait for the refill.
export function nextSteps(reason: DenyReason, plan: AllowancePlan, trialAvailable: boolean): NextStep[] {
  const upgrade: NextStep[] = plan === "free" ? [trialAvailable ? "start_trial" : "get_plus"] : [];
  switch (reason) {
    case "quota_exhausted":
    case "plus_required":
    case "budget_paused":
      return upgrade;
    case "plus_cost_cap":
    case "rate_limited":
    case "disabled":
      return ["wait"];
  }
}

// A refused call needs the person to act, so it is not retried by itself.
export function isActionNeeded(reason: DenyReason): boolean {
  return reason !== "disabled";
}
