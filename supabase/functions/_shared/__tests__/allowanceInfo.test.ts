import type { UsageSnapshot } from "../allowance.ts";
import { describeAllowance, statusForDeny, tierFor } from "../allowanceInfo.ts";
import { DEFAULT_CONFIG, type ServerConfig } from "../config.ts";

const snapshot: UsageSnapshot = {
  plan: "free",
  takes: 4,
  text: 0,
  insights: 0,
  costUsd: 0,
  dayTakes: 0,
  freeSpendMonthUsd: 0,
  conversationSeconds: 0,
};

const beta: ServerConfig = { ...DEFAULT_CONFIG, mode: "beta" };
const launch: ServerConfig = { ...DEFAULT_CONFIG, mode: "launch" };
const NOW = new Date(Date.UTC(2026, 11, 20, 12, 0, 0));

describe("tierFor", () => {
  it("is the paid plan when there is one, then depends on the mode", () => {
    expect(tierFor(beta, "plus")).toBe("plus");
    expect(tierFor(launch, "trial")).toBe("trial");
    expect(tierFor(beta, "free")).toBe("beta");
    expect(tierFor(launch, "free")).toBe("free");
  });
});

describe("describeAllowance", () => {
  it("shows a free account its monthly taste, refilling on the 1st", () => {
    expect(describeAllowance(launch, { ...snapshot, takes: 0 }, NOW)).toEqual({
      plan: "free",
      tier: "free",
      takesTotal: 1,
      takesLeft: 1,
      conversationMinutesTotal: 0,
      conversationMinutesLeft: 0,
      resetsAt: "2027-01-01T00:00:00.000Z",
      trialEndsAt: null,
    });
  });

  it("never goes below zero", () => {
    expect(describeAllowance(launch, { ...snapshot, takes: 9 }, NOW).takesLeft).toBe(0);
  });

  it("uses the month for beta and Plus", () => {
    expect(describeAllowance(beta, snapshot, NOW)).toMatchObject({ tier: "beta", takesTotal: 15, takesLeft: 11, resetsAt: "2027-01-01T00:00:00.000Z" });
    expect(describeAllowance(launch, { ...snapshot, plan: "plus", takes: 60 }, NOW)).toMatchObject({ tier: "plus", takesTotal: 60, takesLeft: 0 });
  });

  it("says when a trial ends, and that is when its counts end too", () => {
    const ends = new Date("2026-12-28T09:00:00Z");
    expect(describeAllowance(launch, { ...snapshot, plan: "trial", takes: 5 }, NOW, ends)).toEqual({
      plan: "trial",
      tier: "trial",
      takesTotal: 20,
      takesLeft: 15,
      conversationMinutesTotal: 30,
      conversationMinutesLeft: 30,
      resetsAt: "2026-12-28T09:00:00.000Z",
      trialEndsAt: "2026-12-28T09:00:00.000Z",
    });
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

describe("conversation minutes", () => {
  it("are whole minutes, rounded down while left", () => {
    const view = describeAllowance(launch, { ...snapshot, plan: "plus", conversationSeconds: 61 }, NOW);
    expect(view.conversationMinutesTotal).toBe(120);
    expect(view.conversationMinutesLeft).toBe(118);
  });

  it("never go below zero", () => {
    expect(describeAllowance(launch, { ...snapshot, plan: "trial", conversationSeconds: 99_999 }, NOW).conversationMinutesLeft).toBe(0);
  });
});
