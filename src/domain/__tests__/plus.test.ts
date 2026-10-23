import { DEFAULT_CONFIG } from "../../../supabase/functions/_shared/config";
import { PLUS_ENTITLEMENT_ID as SERVER_ENTITLEMENT_ID } from "../../../supabase/functions/_shared/entitlement";
import { planDetail, planPriceLine, plansFromPackages, PLUS_ENTITLEMENT_ID, PLUS_MONTHLY_REVIEWS, purchaseFailure, renewalNotice, type OfferedPackage } from "../plus";

const pkg = (identifier: string, packageType: string, price: number, priceString: string, pricePerMonthString: string | null = null): OfferedPackage => ({
  identifier,
  packageType,
  product: { price, priceString, pricePerMonthString },
});

const MONTHLY = pkg("$rc_monthly", "MONTHLY", 4.99, "$4.99", "$4.99");
const ANNUAL = pkg("$rc_annual", "ANNUAL", 49.99, "$49.99", "$4.17");

describe("the app and the server agree about Plus", () => {
  it("shows the number of reviews the server grants", () => {
    expect(PLUS_MONTHLY_REVIEWS).toBe(DEFAULT_CONFIG.limits.plusMonthlyReviews);
  });

  it("uses the same RevenueCat entitlement id", () => {
    expect(PLUS_ENTITLEMENT_ID).toBe(SERVER_ENTITLEMENT_ID);
  });
});

describe("plansFromPackages", () => {
  it("puts the yearly plan first and works out the saving", () => {
    const plans = plansFromPackages([MONTHLY, ANNUAL]);
    expect(plans.map((p) => p.id)).toEqual(["annual", "monthly"]);
    expect(plans[0]).toMatchObject({ packageId: "$rc_annual", price: "$49.99", period: "year", perMonth: "$4.17", savePercent: 17 });
    expect(plans[1]).toMatchObject({ packageId: "$rc_monthly", price: "$4.99", period: "month", savePercent: null });
  });

  it("copes with one plan being missing", () => {
    expect(plansFromPackages([MONTHLY]).map((p) => p.id)).toEqual(["monthly"]);
    const [annualOnly] = plansFromPackages([ANNUAL]);
    expect(annualOnly).toMatchObject({ id: "annual", savePercent: null });
  });

  it("does not claim a saving when the yearly plan costs more", () => {
    const [annual] = plansFromPackages([MONTHLY, pkg("$rc_annual", "ANNUAL", 70, "$70.00")]);
    expect(annual.savePercent).toBeNull();
  });

  it("ignores plans Tono doesn't sell", () => {
    expect(plansFromPackages([pkg("$rc_weekly", "WEEKLY", 1.99, "$1.99"), pkg("$rc_lifetime", "LIFETIME", 99, "$99.00")])).toEqual([]);
    expect(plansFromPackages([])).toEqual([]);
  });
});

describe("the words by the buy button", () => {
  const [annual, monthly] = plansFromPackages([MONTHLY, ANNUAL]);

  it("prices each plan", () => {
    expect(planPriceLine(annual)).toBe("$49.99 / year");
    expect(planPriceLine(monthly)).toBe("$4.99 / month");
    expect(planDetail(annual)).toBe("$4.17 a month · save 17%");
    expect(planDetail(monthly)).toBe("Cancel any time");
  });

  it("states what App Review needs next to a subscription button", () => {
    const text = renewalNotice(annual);
    expect(text).toContain("$49.99 per year");
    expect(text).toMatch(/Apple ID/);
    expect(text).toMatch(/renews automatically/);
    expect(text).toMatch(/at least 24 hours before the period ends/);
    expect(text).toMatch(/Subscriptions/);
    expect(renewalNotice(monthly)).toContain("$4.99 per month");
  });
});

describe("purchaseFailure", () => {
  it("is quiet when the person backs out", () => {
    expect(purchaseFailure({ userCancelled: true })).toEqual({ kind: "cancelled" });
    expect(purchaseFailure({ code: "1" })).toEqual({ kind: "cancelled" });
  });

  it("explains the failures a person can act on", () => {
    expect(purchaseFailure({ code: "10" })).toMatchObject({ kind: "failed", message: expect.stringMatching(/connection/) });
    expect(purchaseFailure({ code: "3" })).toMatchObject({ message: expect.stringMatching(/turned off/) });
    expect(purchaseFailure({ code: "6" })).toMatchObject({ message: expect.stringMatching(/Restore/) });
    expect(purchaseFailure({ code: "7" })).toMatchObject({ message: expect.stringMatching(/another Tono account/) });
    expect(purchaseFailure({ code: "20" })).toMatchObject({ message: expect.stringMatching(/waiting for approval/) });
  });

  it("tells the person they weren't charged when it is unknown", () => {
    for (const e of [{ code: "0" }, {}, null, undefined, new Error("boom")]) {
      expect(purchaseFailure(e)).toMatchObject({ kind: "failed", message: expect.stringMatching(/haven't been charged/) });
    }
  });
});
