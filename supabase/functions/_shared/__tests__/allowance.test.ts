import { decideAllowance, type UsageSnapshot } from "../allowance";
import { DEFAULT_CONFIG, type ServerConfig } from "../config";
import type { AiKind } from "../types";

const empty: UsageSnapshot = {
  plan: "free",
  starterReviewsUsed: 0,
  starterTextUsed: 0,
  monthReviews: 0,
  monthInsights: 0,
  monthText: 0,
  monthCostUsd: 0,
  dayReviews: 0,
  freeSpendMonthUsd: 0,
};

const launch: ServerConfig = { ...DEFAULT_CONFIG, mode: "launch" };
const beta: ServerConfig = { ...DEFAULT_CONFIG, mode: "beta" };

function decide(config: ServerConfig, kind: AiKind, snapshot: Partial<UsageSnapshot>, estCostUsd = 0.02) {
  return decideAllowance({ config, kind, snapshot: { ...empty, ...snapshot }, estCostUsd });
}

describe("kill switch", () => {
  it("refuses everything, for everyone", () => {
    const off = { ...launch, killSwitch: true };
    expect(decide(off, "review", {})).toEqual({ ok: false, reason: "disabled" });
    expect(decide(off, "text", { plan: "plus" })).toEqual({ ok: false, reason: "disabled" });
  });
});

describe("launch mode, free account (starter pack)", () => {
  it("allows the first review and counts down", () => {
    expect(decide(launch, "review", {})).toEqual({ ok: true, tier: "starter", reviewsLeft: 4 });
    expect(decide(launch, "review", { starterReviewsUsed: 4 })).toEqual({ ok: true, tier: "starter", reviewsLeft: 0 });
  });

  it("refuses once the 5 reviews are used", () => {
    expect(decide(launch, "review", { starterReviewsUsed: 5 })).toEqual({ ok: false, reason: "quota_exhausted" });
  });

  it("gives 15 text calls, then stops", () => {
    expect(decide(launch, "text", { starterTextUsed: 14 }).ok).toBe(true);
    expect(decide(launch, "text", { starterTextUsed: 15 })).toEqual({ ok: false, reason: "quota_exhausted" });
  });

  it("keeps insights for Plus", () => {
    expect(decide(launch, "insight", {})).toEqual({ ok: false, reason: "plus_required" });
  });

  it("pauses when the free budget would be passed", () => {
    expect(decide(launch, "review", { freeSpendMonthUsd: 49.99 }, 0.05)).toEqual({ ok: false, reason: "budget_paused" });
    expect(decide(launch, "review", { freeSpendMonthUsd: 49.9 }, 0.05).ok).toBe(true);
  });
});

describe("beta mode, signed-in account", () => {
  it("gives 15 reviews a month", () => {
    expect(decide(beta, "review", { monthReviews: 14 })).toEqual({ ok: true, tier: "beta", reviewsLeft: 0 });
    expect(decide(beta, "review", { monthReviews: 15 })).toEqual({ ok: false, reason: "quota_exhausted" });
  });

  it("lets testers try insights, inside their own small allowance", () => {
    expect(decide(beta, "insight", { monthInsights: 3 }).ok).toBe(true);
    expect(decide(beta, "insight", { monthInsights: 4 })).toEqual({ ok: false, reason: "quota_exhausted" });
  });

  it("obeys the $50 spend ceiling", () => {
    expect(decide(beta, "review", { freeSpendMonthUsd: 50 }, 0.01)).toEqual({ ok: false, reason: "budget_paused" });
  });
});

describe("Plus", () => {
  const plus = { plan: "plus" as const };

  it("gets 60 reviews a month and sees how many are left", () => {
    expect(decide(launch, "review", { ...plus, monthReviews: 10 })).toEqual({ ok: true, tier: "plus", reviewsLeft: 49 });
    expect(decide(launch, "review", { ...plus, monthReviews: 60 })).toEqual({ ok: false, reason: "quota_exhausted" });
  });

  it("is not held back by the free-user budget", () => {
    expect(decide(launch, "review", { ...plus, freeSpendMonthUsd: 999 }).ok).toBe(true);
  });

  it("is stopped by the dollar cap whatever the model", () => {
    expect(decide(launch, "review", { ...plus, monthCostUsd: 2.49 }, 0.02)).toEqual({ ok: false, reason: "plus_cost_cap" });
    expect(decide(launch, "review", { ...plus, monthCostUsd: 2.0 }, 0.02).ok).toBe(true);
  });

  it("has its own insight and text counts", () => {
    expect(decide(launch, "insight", { ...plus, monthInsights: 11 }).ok).toBe(true);
    expect(decide(launch, "insight", { ...plus, monthInsights: 12 })).toEqual({ ok: false, reason: "quota_exhausted" });
    expect(decide(launch, "text", { ...plus, monthText: 100 })).toEqual({ ok: false, reason: "quota_exhausted" });
  });
});

describe("daily ceiling", () => {
  it("applies to reviews on every plan, and only reviews", () => {
    expect(decide(launch, "review", { dayReviews: 6 })).toEqual({ ok: false, reason: "rate_limited" });
    expect(decide(launch, "review", { plan: "plus", dayReviews: 6 })).toEqual({ ok: false, reason: "rate_limited" });
    expect(decide(launch, "text", { dayReviews: 6 }).ok).toBe(true);
  });
});
