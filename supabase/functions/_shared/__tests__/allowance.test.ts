import { decideAllowance, limitsFor, tierFor, type UsageSnapshot } from "../allowance";
import { DEFAULT_CONFIG, type ServerConfig } from "../config";
import type { CountKind } from "../types";

const empty: UsageSnapshot = {
  plan: "free",
  takes: 0,
  text: 0,
  insights: 0,
  costUsd: 0,
  dayTakes: 0,
  freeSpendMonthUsd: 0,
};

const launch: ServerConfig = { ...DEFAULT_CONFIG, mode: "launch" };
const beta: ServerConfig = { ...DEFAULT_CONFIG, mode: "beta" };

function decide(config: ServerConfig, kind: CountKind, snapshot: Partial<UsageSnapshot>, estCostUsd = 0.02) {
  return decideAllowance({ config, kind, snapshot: { ...empty, ...snapshot }, estCostUsd });
}

describe("kill switch", () => {
  it("refuses everything, for everyone", () => {
    const off = { ...launch, killSwitch: true };
    expect(decide(off, "take", {})).toEqual({ ok: false, reason: "disabled" });
    expect(decide(off, "text", { plan: "plus" })).toEqual({ ok: false, reason: "disabled" });
    expect(decide(off, "take", { plan: "trial" })).toEqual({ ok: false, reason: "disabled" });
  });
});

describe("tiers", () => {
  it("follows the plan, and the mode for free accounts", () => {
    expect(tierFor(launch, "free")).toBe("free");
    expect(tierFor(beta, "free")).toBe("beta");
    expect(tierFor(beta, "trial")).toBe("trial");
    expect(tierFor(launch, "plus")).toBe("plus");
  });

  it("gives free accounts judged takes only", () => {
    expect(limitsFor(launch.limits, "free")).toEqual({ take: 1, text: 0, insight: 0 });
  });
});

describe("launch mode, free account: one judged take a month", () => {
  it("allows the monthly taste and says none are left after it", () => {
    expect(decide(launch, "take", {})).toEqual({ ok: true, tier: "free", takesLeft: 0 });
  });

  it("refuses a second judged take in the same month", () => {
    expect(decide(launch, "take", { takes: 1 })).toEqual({ ok: false, reason: "quota_exhausted" });
  });

  it("follows the server setting, so the count changes without an app update", () => {
    const three = { ...launch, limits: { ...launch.limits, freeMonthlyJudgedTakes: 3 } };
    expect(decide(three, "take", { takes: 2 })).toEqual({ ok: true, tier: "free", takesLeft: 0 });
    const none = { ...launch, limits: { ...launch.limits, freeMonthlyJudgedTakes: 0 } };
    expect(decide(none, "take", {})).toEqual({ ok: false, reason: "plus_required" });
  });

  it("keeps exercise notes, mark-ups and insights for Plus", () => {
    expect(decide(launch, "text", {})).toEqual({ ok: false, reason: "plus_required" });
    expect(decide(launch, "insight", {})).toEqual({ ok: false, reason: "plus_required" });
  });

  it("pauses when the shared free budget would be passed", () => {
    expect(decide(launch, "take", { freeSpendMonthUsd: 49.99 }, 0.05)).toEqual({ ok: false, reason: "budget_paused" });
    expect(decide(launch, "take", { freeSpendMonthUsd: 49.9 }, 0.05).ok).toBe(true);
  });
});

describe("beta mode, not paying", () => {
  it("gives 15 judged takes a month", () => {
    expect(decide(beta, "take", { takes: 14 })).toEqual({ ok: true, tier: "beta", takesLeft: 0 });
    expect(decide(beta, "take", { takes: 15 })).toEqual({ ok: false, reason: "quota_exhausted" });
  });

  it("lets testers try exercise notes and insights, inside their own allowance", () => {
    expect(decide(beta, "text", { text: 99 }).ok).toBe(true);
    expect(decide(beta, "text", { text: 100 })).toEqual({ ok: false, reason: "quota_exhausted" });
    expect(decide(beta, "insight", { insights: 4 })).toEqual({ ok: false, reason: "quota_exhausted" });
  });

  it("obeys the $50 spend ceiling", () => {
    expect(decide(beta, "take", { freeSpendMonthUsd: 50 }, 0.01)).toEqual({ ok: false, reason: "budget_paused" });
  });
});

describe("the 14-day trial", () => {
  const trial = { plan: "trial" as const };

  it("has its own counts over the trial", () => {
    expect(decide(launch, "take", { ...trial, takes: 19 })).toEqual({ ok: true, tier: "trial", takesLeft: 0 });
    expect(decide(launch, "take", { ...trial, takes: 20 })).toEqual({ ok: false, reason: "quota_exhausted" });
    expect(decide(launch, "text", { ...trial, text: 60 })).toEqual({ ok: false, reason: "quota_exhausted" });
    expect(decide(launch, "insight", { ...trial }).ok).toBe(true);
  });

  it("is a trial in beta mode too, not a tester allowance", () => {
    expect(decide(beta, "take", { ...trial, takes: 16 })).toMatchObject({ ok: true, tier: "trial" });
  });

  it("stops at the same cost cap as Plus", () => {
    expect(decide(launch, "take", { ...trial, costUsd: 2.49 }, 0.02)).toEqual({ ok: false, reason: "plus_cost_cap" });
  });

  it("is not held back by the free budget", () => {
    expect(decide(launch, "take", { ...trial, freeSpendMonthUsd: 999 }).ok).toBe(true);
  });
});

describe("Plus", () => {
  const plus = { plan: "plus" as const };

  it("gets 60 judged takes a month and sees how many are left", () => {
    expect(decide(launch, "take", { ...plus, takes: 10 })).toEqual({ ok: true, tier: "plus", takesLeft: 49 });
    expect(decide(launch, "take", { ...plus, takes: 60 })).toEqual({ ok: false, reason: "quota_exhausted" });
  });

  it("does not spend a judged take on an exercise note", () => {
    expect(decide(launch, "text", { ...plus, takes: 10 })).toEqual({ ok: true, tier: "plus", takesLeft: 50 });
  });

  it("is not held back by the free-user budget", () => {
    expect(decide(launch, "take", { ...plus, freeSpendMonthUsd: 999 }).ok).toBe(true);
  });

  it("is stopped by the cost cap whatever the model", () => {
    expect(decide(launch, "take", { ...plus, costUsd: 2.49 }, 0.02)).toEqual({ ok: false, reason: "plus_cost_cap" });
    expect(decide(launch, "take", { ...plus, costUsd: 2.0 }, 0.02).ok).toBe(true);
  });

  it("has its own insight and text counts", () => {
    expect(decide(launch, "insight", { ...plus, insights: 11 }).ok).toBe(true);
    expect(decide(launch, "insight", { ...plus, insights: 12 })).toEqual({ ok: false, reason: "quota_exhausted" });
    expect(decide(launch, "text", { ...plus, text: 300 })).toEqual({ ok: false, reason: "quota_exhausted" });
  });
});

describe("daily ceiling", () => {
  it("applies to judged takes on every plan, and only to them", () => {
    expect(decide(launch, "take", { dayTakes: 6 })).toEqual({ ok: false, reason: "rate_limited" });
    expect(decide(launch, "take", { plan: "plus", dayTakes: 6 })).toEqual({ ok: false, reason: "rate_limited" });
    expect(decide(launch, "text", { plan: "plus", dayTakes: 6 }).ok).toBe(true);
  });
});

describe("the cost cap and the text-call cost", () => {
  // A month that uses every count at the expected prices: 60 judged takes
  // from their words (about 0.6 cents each) and 300 exercise calls (about 0.35
  // cents) still stays under the cap, so the counts, not the cap, are what
  // people meet. Judged takes have their own count, so drills never use them up.
  it("leaves room for the full Plus counts at expected cost", () => {
    const heavy = 60 * 0.006 + 300 * 0.0035;
    expect(heavy).toBeLessThan(DEFAULT_CONFIG.limits.paidCostCapUsd);
  });
});
