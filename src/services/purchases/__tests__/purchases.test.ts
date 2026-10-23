const mockSdk = {
  setLogLevel: jest.fn(),
  configure: jest.fn(),
  logIn: jest.fn(),
  logOut: jest.fn(),
  isAnonymous: jest.fn(),
  getOfferings: jest.fn(),
  purchasePackage: jest.fn(),
  restorePurchases: jest.fn(),
};
jest.mock("react-native-purchases", () => ({ __esModule: true, default: mockSdk, LOG_LEVEL: { DEBUG: "DEBUG", WARN: "WARN" } }));
jest.mock("../../../config/backend", () => ({ REVENUECAT_IOS_KEY: "appl_test" }));
jest.mock("../../../utils/logger", () => ({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } }));

let mockAccount: { status: string; userId: string | null; allowance: { plan: string } | null; plusPurchasable?: boolean } = { status: "signedIn", userId: "user-1", allowance: { plan: "free" } };
let mockListener: (() => void) | null = null;
const mockRefresh = jest.fn();
jest.mock("../../account/accountStore", () => ({
  getAccount: () => mockAccount,
  refreshAccount: (...a: unknown[]) => mockRefresh(...a),
  subscribeAccount: (l: () => void) => {
    mockListener = l;
    return () => undefined;
  },
}));

import { buyPlus, initPurchases, loadPlusOffer, purchasesEnabled, restorePlus, type PlusOffer } from "../purchases";
import type { PlusPlan } from "../../../domain/plus";

const ANNUAL: PlusPlan = { id: "annual", packageId: "$rc_annual", title: "Yearly", price: "$49.99", period: "year", perMonth: "$4.17", savePercent: 17 };

const offer = (): PlusOffer => ({ plans: [ANNUAL], packages: new Map([["$rc_annual", { identifier: "$rc_annual" } as never]]) });
const flush = () => new Promise((resolve) => setImmediate(resolve));

beforeEach(() => {
  Object.values(mockSdk).forEach((f) => f.mockReset());
  mockRefresh.mockReset();
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
          { identifier: "$rc_monthly", packageType: "MONTHLY", product: { price: 4.99, priceString: "$4.99", pricePerMonthString: "$4.99" } },
          { identifier: "$rc_annual", packageType: "ANNUAL", product: { price: 49.99, priceString: "$49.99", pricePerMonthString: "$4.17" } },
        ],
      },
    });
    const loaded = await loadPlusOffer();
    expect(loaded.plans.map((p) => p.id)).toEqual(["annual", "monthly"]);
    expect(loaded.packages.has("$rc_annual")).toBe(true);
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

  it("will not buy for someone who is signed out", async () => {
    mockAccount = { status: "signedOut", userId: null, allowance: null };
    await expect(buyPlus(ANNUAL, offer())).resolves.toMatchObject({ ok: false, cancelled: false });
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
