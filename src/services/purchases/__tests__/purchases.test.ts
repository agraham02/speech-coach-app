const mockSdk = {
  setLogLevel: jest.fn(),
  configure: jest.fn(),
  logIn: jest.fn(),
  logOut: jest.fn(),
  isAnonymous: jest.fn(),
  getOfferings: jest.fn(),
  purchasePackage: jest.fn(),
  restorePurchases: jest.fn(),
  checkTrialOrIntroductoryPriceEligibility: jest.fn(),
};
jest.mock("react-native-purchases", () => ({
  __esModule: true,
  default: mockSdk,
  LOG_LEVEL: { DEBUG: "DEBUG", WARN: "WARN" },
  INTRO_ELIGIBILITY_STATUS: { INTRO_ELIGIBILITY_STATUS_UNKNOWN: 0, INTRO_ELIGIBILITY_STATUS_INELIGIBLE: 1, INTRO_ELIGIBILITY_STATUS_ELIGIBLE: 2 },
}));
jest.mock("../../../config/backend", () => ({ REVENUECAT_IOS_KEY: "appl_test" }));
jest.mock("../../../utils/logger", () => ({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } }));

let mockAccount: { status: string; userId: string | null; allowance: { plan: string } | null; plusPurchasable?: boolean } = { status: "signedIn", userId: "user-1", allowance: { plan: "free" } };
let mockListener: (() => void) | null = null;
const mockRefresh = jest.fn();
const mockEnsure = jest.fn();
jest.mock("../../account/accountStore", () => ({
  getAccount: () => mockAccount,
  ensureAccount: () => mockEnsure(),
  refreshAccount: (...a: unknown[]) => mockRefresh(...a),
  subscribeAccount: (l: () => void) => {
    mockListener = l;
    return () => undefined;
  },
}));

import { buyPlus, initPurchases, loadPlusOffer, purchasesEnabled, restorePlus, type PlusOffer } from "../purchases";
import type { PlusPlan } from "../../../domain/plus";

const ANNUAL: PlusPlan = { id: "annual", packageId: "$rc_annual", title: "Yearly", price: "$49.99", period: "year", perMonth: "$4.17", savePercent: 17, productId: "com.ahmadgraham.tono.plus.annual", trialDays: 14 };

const offer = (): PlusOffer => ({ plans: [ANNUAL], packages: new Map([["$rc_annual", { identifier: "$rc_annual" } as never]]) });
const TRIAL = { price: 0, periodUnit: "WEEK", periodNumberOfUnits: 2, cycles: 1 };
const flush = () => new Promise((resolve) => setImmediate(resolve));

beforeEach(() => {
  Object.values(mockSdk).forEach((f) => f.mockReset());
  mockRefresh.mockReset();
  mockEnsure.mockReset();
  mockEnsure.mockResolvedValue(undefined);
  mockSdk.checkTrialOrIntroductoryPriceEligibility.mockResolvedValue({});
  mockAccount = { status: "signedIn", userId: "user-1", allowance: { plan: "free" } };
  mockSdk.logIn.mockResolvedValue({});
  mockSdk.isAnonymous.mockResolvedValue(false);
});

// Configuring happens once per app run, so it is done once for the file.
beforeAll(() => {
  initPurchases();
});

describe("starting up", () => {
  it("configures RevenueCat with the public key and logs in the signed-in person", async () => {
    // beforeAll ran before mockReset, so run the account follow again.
    mockAccount = { status: "signedIn", userId: "user-2", allowance: { plan: "free" } };
    mockListener?.();
    await flush();
    expect(mockSdk.logIn).toHaveBeenCalledWith("user-2");
  });

  it("logs out when the person signs out", async () => {
    mockAccount = { status: "signedOut", userId: null, allowance: null };
    mockListener?.();
    await flush();
    expect(mockSdk.logOut).toHaveBeenCalled();
  });
});

describe("loadPlusOffer", () => {
  it("turns the current offering into plans", async () => {
    mockSdk.getOfferings.mockResolvedValue({
      current: {
        availablePackages: [
          { identifier: "$rc_monthly", packageType: "MONTHLY", product: { identifier: "m", price: 4.99, priceString: "$4.99", pricePerMonthString: "$4.99", introPrice: TRIAL } },
          { identifier: "$rc_annual", packageType: "ANNUAL", product: { identifier: "a", price: 49.99, priceString: "$49.99", pricePerMonthString: "$4.17", introPrice: TRIAL } },
        ],
      },
    });
    mockSdk.checkTrialOrIntroductoryPriceEligibility.mockResolvedValue({ m: { status: 2 }, a: { status: 1 } });
    const loaded = await loadPlusOffer();
    expect(loaded.plans.map((p) => p.id)).toEqual(["annual", "monthly"]);
    expect(loaded.packages.has("$rc_annual")).toBe(true);
    // The App Store says this Apple ID had the yearly trial already.
    expect(loaded.plans.map((p) => p.trialDays)).toEqual([null, 14]);
  });

  it("promises no trial when eligibility can't be checked", async () => {
    mockSdk.getOfferings.mockResolvedValue({
      current: { availablePackages: [{ identifier: "$rc_annual", packageType: "ANNUAL", product: { identifier: "a", price: 49.99, priceString: "$49.99", pricePerMonthString: "$4.17", introPrice: TRIAL } }] },
    });
    mockSdk.checkTrialOrIntroductoryPriceEligibility.mockRejectedValue(new Error("no"));
    expect((await loadPlusOffer()).plans[0].trialDays).toBeNull();
  });

  it("returns no plans when there is no current offering", async () => {
    mockSdk.getOfferings.mockResolvedValue({ current: null });
    expect((await loadPlusOffer()).plans).toEqual([]);
  });
});

describe("buyPlus", () => {
  it("buys, then asks the server to re-check, and reports Plus once it shows", async () => {
    mockSdk.purchasePackage.mockResolvedValue({});
    mockRefresh.mockImplementation(async () => {
      mockAccount = { ...mockAccount, allowance: { plan: "plus" } };
    });
    await expect(buyPlus(ANNUAL, offer())).resolves.toEqual({ ok: true, plus: true });
    expect(mockSdk.purchasePackage).toHaveBeenCalledWith({ identifier: "$rc_annual" });
    expect(mockRefresh).toHaveBeenCalledWith({ syncPurchases: true });
  });

  it("keeps asking a few times while the server catches up, then says it is pending", async () => {
    jest.useFakeTimers();
    mockSdk.purchasePackage.mockResolvedValue({});
    const result = buyPlus(ANNUAL, offer());
    await jest.runAllTimersAsync();
    await expect(result).resolves.toEqual({ ok: true, plus: false });
    expect(mockRefresh).toHaveBeenCalledTimes(4);
    jest.useRealTimers();
  });

  it("is quiet when the person cancels", async () => {
    mockSdk.purchasePackage.mockRejectedValue({ userCancelled: true });
    await expect(buyPlus(ANNUAL, offer())).resolves.toEqual({ ok: false, cancelled: true });
    expect(mockRefresh).not.toHaveBeenCalled();
  });

  it("explains a store failure", async () => {
    mockSdk.purchasePackage.mockRejectedValue({ code: "10" });
    await expect(buyPlus(ANNUAL, offer())).resolves.toMatchObject({ ok: false, cancelled: false, message: expect.stringMatching(/connection/) });
  });

  it("needs no sign-in: it makes the account behind the scenes first", async () => {
    mockSdk.purchasePackage.mockResolvedValue({});
    mockRefresh.mockImplementation(async () => {
      mockAccount = { ...mockAccount, allowance: { plan: "trial" } };
    });
    await expect(buyPlus(ANNUAL, offer())).resolves.toEqual({ ok: true, plus: true });
    expect(mockEnsure).toHaveBeenCalled();
  });

  it("says so plainly when the account can't be made (offline)", async () => {
    mockEnsure.mockRejectedValue(new Error("offline"));
    await expect(buyPlus(ANNUAL, offer())).resolves.toMatchObject({ ok: false, cancelled: false, message: expect.stringMatching(/connection/) });
    expect(mockSdk.purchasePackage).not.toHaveBeenCalled();
  });
});

describe("restorePlus", () => {
  it("restores, re-checks with the server, and reports whether Plus is back", async () => {
    mockSdk.restorePurchases.mockResolvedValue({});
    mockRefresh.mockImplementation(async () => {
      mockAccount = { ...mockAccount, allowance: { plan: "plus" } };
    });
    await expect(restorePlus()).resolves.toEqual({ ok: true, plus: true });
    expect(mockRefresh).toHaveBeenCalledWith({ syncPurchases: true });
  });

  it("says there was nothing to restore", async () => {
    mockSdk.restorePurchases.mockResolvedValue({});
    await expect(restorePlus()).resolves.toEqual({ ok: true, plus: false });
  });
});

describe("the launch switch", () => {
  it("stays hidden until the server puts Plus on sale", () => {
    mockAccount = { status: "signedIn", userId: "user-1", allowance: { plan: "free" }, plusPurchasable: false };
    expect(purchasesEnabled()).toBe(false);
    mockAccount = { ...mockAccount, plusPurchasable: true };
    expect(purchasesEnabled()).toBe(true);
  });

  it("keeps Manage and Restore for someone who already has Plus", () => {
    mockAccount = { status: "signedIn", userId: "user-1", allowance: { plan: "plus" }, plusPurchasable: false };
    expect(purchasesEnabled()).toBe(true);
  });
});
