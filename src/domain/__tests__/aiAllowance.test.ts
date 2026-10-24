import { allowanceLine, dayLabel, denialMessage, isActionNeeded, isPaidPlan, nextSteps, usedUpLine, usesOneLine, type TonoAllowance } from "../aiAllowance";

const NEXT_MONTH = "2026-12-01T00:00:00.000Z";

const free = (left: number, total = 1): TonoAllowance => ({ plan: "free", tier: "free", takesLeft: left, takesTotal: total, resetsAt: NEXT_MONTH, trialEndsAt: null });
const trial = (left: number): TonoAllowance => ({ plan: "trial", tier: "trial", takesLeft: left, takesTotal: 20, resetsAt: "2026-11-20T09:00:00.000Z", trialEndsAt: "2026-11-20T09:00:00.000Z" });
const monthly = (left: number, tier: "beta" | "plus" = "plus"): TonoAllowance => ({
  plan: tier === "plus" ? "plus" : "free",
  tier,
  takesLeft: left,
  takesTotal: tier === "plus" ? 60 : 15,
  resetsAt: NEXT_MONTH,
  trialEndsAt: null,
});

describe("dayLabel", () => {
  it("reads the UTC day, so the 1st never shows as the 30th", () => {
    expect(dayLabel(NEXT_MONTH)).toBe("1 December");
    expect(dayLabel("not a date")).toBe("");
  });
});

describe("allowanceLine", () => {
  it("tells a free user about the monthly free judged take", () => {
    expect(allowanceLine(free(1))).toBe("Your free judged take this month is ready");
    expect(allowanceLine(free(0))).toBe("Free judged take used · the next one comes on 1 December");
    expect(allowanceLine(free(2, 3))).toBe("2 of 3 free judged takes left this month");
    expect(allowanceLine(free(0, 0))).toBe("Judged takes are part of Tono Plus");
  });

  it("counts the trial and says when it ends", () => {
    expect(allowanceLine(trial(15))).toBe("15 of 20 judged takes left in your trial · free until 20 November");
  });

  it("speaks of the month for beta and Plus", () => {
    expect(allowanceLine(monthly(42))).toBe("42 of 60 judged takes left this month");
    expect(allowanceLine(monthly(1, "beta"))).toBe("1 of 15 judged takes left this month");
    expect(allowanceLine(monthly(0))).toBe("No judged takes left this month · more on 1 December");
  });
});

describe("usesOneLine: what judging this one take costs", () => {
  it("is exactly one take, whatever is sent", () => {
    expect(usesOneLine(free(1))).toBe("Uses your free judged take for this month.");
    expect(usesOneLine(trial(15))).toBe("Counts as 1 of the 15 judged takes left in your trial.");
    expect(usesOneLine(monthly(1))).toBe("Counts as 1 of the 1 judged take left this month.");
    expect(usesOneLine(free(0))).toBe("");
  });
});

describe("usedUpLine", () => {
  it("says when the free take comes back, and that the phone still works", () => {
    expect(usedUpLine(free(0))).toContain("The next one comes on 1 December");
    expect(usedUpLine(free(0))).toContain("measurements and tips are here as always");
    expect(usedUpLine(monthly(0))).toContain("More come on 1 December");
  });
});

describe("denialMessage", () => {
  it("is plain and never blames the user", () => {
    expect(denialMessage("quota_exhausted", free(0))).toBe("You've used this month's free judged take.");
    expect(denialMessage("quota_exhausted", trial(0))).toBe("You've used the judged takes in your trial.");
    expect(denialMessage("quota_exhausted", monthly(0))).toBe("You've used this month's judged takes.");
    expect(denialMessage("plus_cost_cap", monthly(3))).toContain("1 December");
    for (const r of ["plus_required", "plus_cost_cap", "budget_paused", "rate_limited", "disabled"] as const) {
      expect(denialMessage(r, null).length).toBeGreaterThan(10);
    }
  });
});

describe("nextSteps", () => {
  it("offers the trial to a free user who can still have it, else Plus", () => {
    expect(nextSteps("quota_exhausted", "free", true)).toEqual(["start_trial"]);
    expect(nextSteps("quota_exhausted", "free", false)).toEqual(["get_plus"]);
    expect(nextSteps("plus_required", "free", true)).toEqual(["start_trial"]);
  });

  it("never offers own keys, and offers nothing to buy to a subscriber", () => {
    expect(nextSteps("quota_exhausted", "plus", true)).toEqual([]);
    expect(nextSteps("quota_exhausted", "trial", true)).toEqual([]);
    expect(nextSteps("plus_cost_cap", "plus", false)).toEqual(["wait"]);
  });

  it("just says wait for the daily limit and the kill switch", () => {
    expect(nextSteps("rate_limited", "free", true)).toEqual(["wait"]);
    expect(nextSteps("disabled", "free", true)).toEqual(["wait"]);
  });
});

describe("isPaidPlan and isActionNeeded", () => {
  it("counts the trial as paid", () => {
    expect(isPaidPlan(trial(1))).toBe(true);
    expect(isPaidPlan(monthly(1))).toBe(true);
    expect(isPaidPlan(free(1))).toBe(false);
    expect(isPaidPlan(null)).toBe(false);
  });

  it("is false only for the kill switch, which clears by itself", () => {
    expect(isActionNeeded("disabled")).toBe(false);
    expect(isActionNeeded("quota_exhausted")).toBe(true);
  });
});
