import { allowanceLine, denialMessage, isActionNeeded, nextSteps, usesOneLine, type TonoAllowance } from "../aiAllowance";

const starter = (left: number): TonoAllowance => ({ plan: "free", tier: "starter", reviewsLeft: left, reviewsTotal: 5, resetsAt: null });
const monthly = (left: number, tier: "beta" | "plus" = "plus"): TonoAllowance => ({
  plan: tier === "plus" ? "plus" : "free",
  tier,
  reviewsLeft: left,
  reviewsTotal: 60,
  resetsAt: "2026-12-01T00:00:00.000Z",
});

describe("allowanceLine", () => {
  it("counts down the starter pack", () => {
    expect(allowanceLine(starter(3))).toBe("3 of 5 free AI reviews left");
    expect(allowanceLine(starter(1))).toBe("1 of 5 free AI review left");
    expect(allowanceLine(starter(0))).toBe("No free AI reviews left");
  });

  it("speaks of the month for beta and Plus", () => {
    expect(allowanceLine(monthly(42))).toBe("42 AI reviews left this month");
    expect(allowanceLine(monthly(1, "beta"))).toBe("1 AI review left this month");
    expect(allowanceLine(monthly(0))).toBe("No AI reviews left this month");
  });
});

describe("usesOneLine", () => {
  it("says what a review will cost", () => {
    expect(usesOneLine(starter(4))).toBe("Uses 1 of your 4 free reviews");
    expect(usesOneLine(monthly(1))).toBe("Uses 1 of your 1 review this month");
    expect(usesOneLine(starter(0))).toBe("");
  });
});

describe("denialMessage", () => {
  it("is plain and never blames the user", () => {
    expect(denialMessage("quota_exhausted", starter(0))).toBe("You have used your free AI reviews.");
    expect(denialMessage("quota_exhausted", monthly(0))).toBe("You have used this month's AI reviews.");
    expect(denialMessage("quota_exhausted", null)).toBe("You have used this month's AI reviews.");
    for (const r of ["plus_required", "plus_cost_cap", "budget_paused", "rate_limited", "disabled"] as const) {
      expect(denialMessage(r, null).length).toBeGreaterThan(10);
    }
  });
});

describe("nextSteps", () => {
  it("offers Plus to a free user who ran out, then the own key and the phone", () => {
    expect(nextSteps("quota_exhausted", "free")).toEqual(["get_plus", "own_key", "on_device"]);
  });

  it("does not offer Plus to someone who already has it", () => {
    expect(nextSteps("quota_exhausted", "plus")).toEqual(["own_key", "on_device"]);
    expect(nextSteps("plus_cost_cap", "plus")).toEqual(["own_key", "on_device"]);
  });

  it("offers Plus when free reviews are paused, since Plus is not paused", () => {
    expect(nextSteps("budget_paused", "free")[0]).toBe("get_plus");
  });

  it("just says wait for the daily limit", () => {
    expect(nextSteps("rate_limited", "free")).toEqual(["wait"]);
  });
});

describe("isActionNeeded", () => {
  it("is false only for the kill switch, which clears by itself", () => {
    expect(isActionNeeded("disabled")).toBe(false);
    expect(isActionNeeded("quota_exhausted")).toBe(true);
  });
});
