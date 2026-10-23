import type { UsageSnapshot } from "../allowance.ts";
import { describeAllowance, statusForDeny, tierFor } from "../allowanceInfo.ts";
import { DEFAULT_CONFIG, type ServerConfig } from "../config.ts";

const snapshot: UsageSnapshot = {
  plan: "free",
  starterReviewsUsed: 2,
  starterTextUsed: 0,
  monthReviews: 4,
  monthInsights: 0,
  monthText: 0,
  monthCostUsd: 0,
  dayReviews: 0,
  freeSpendMonthUsd: 0,
};

const beta: ServerConfig = { ...DEFAULT_CONFIG, mode: "beta" };
const launch: ServerConfig = { ...DEFAULT_CONFIG, mode: "launch" };
const NOW = new Date(Date.UTC(2026, 11, 20, 12, 0, 0));

describe("tierFor", () => {
  it("is plus for Plus, then depends on the mode", () => {
    expect(tierFor(beta, "plus")).toBe("plus");
    expect(tierFor(beta, "free")).toBe("beta");
    expect(tierFor(launch, "free")).toBe("starter");
  });
});

describe("describeAllowance", () => {
  it("counts the starter pack down and never refills it", () => {
    expect(describeAllowance(launch, snapshot, NOW)).toEqual({
      plan: "free",
      tier: "starter",
      reviewsTotal: 5,
      reviewsLeft: 3,
      resetsAt: null,
    });
  });

  it("never goes below zero", () => {
    expect(describeAllowance(launch, { ...snapshot, starterReviewsUsed: 9 }, NOW).reviewsLeft).toBe(0);
  });

  it("uses the month for beta and Plus, and says when it refills", () => {
    expect(describeAllowance(beta, snapshot, NOW)).toEqual({
      plan: "free",
      tier: "beta",
      reviewsTotal: 15,
      reviewsLeft: 11,
      resetsAt: "2027-01-01T00:00:00.000Z",
    });
    const plus = describeAllowance(launch, { ...snapshot, plan: "plus", monthReviews: 60 }, NOW);
    expect(plus).toMatchObject({ tier: "plus", reviewsTotal: 60, reviewsLeft: 0 });
  });
});

describe("statusForDeny", () => {
  it("separates out-of-allowance from real failures", () => {
    expect(statusForDeny("quota_exhausted")).toBe(402);
    expect(statusForDeny("plus_required")).toBe(402);
    expect(statusForDeny("plus_cost_cap")).toBe(402);
    expect(statusForDeny("rate_limited")).toBe(429);
    expect(statusForDeny("in_flight")).toBe(409);
    expect(statusForDeny("budget_paused")).toBe(503);
    expect(statusForDeny("disabled")).toBe(503);
  });
});
