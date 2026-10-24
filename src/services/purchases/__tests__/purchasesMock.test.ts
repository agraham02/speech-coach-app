// With the Dev mock account set to show Tono Plus, a phone that cannot sell it
// (here: Android, no RevenueCat key) shows the paywall states from made-up
// prices, and no purchase code runs. Without it, nothing changes.

let mockShows = false;
let mockOffer: "trial" | "no_trial" | "failed" = "trial";
let mockAccount: { status: string; plusPurchasable: boolean; allowance: { plan: string } | null } = { status: "signedOut", plusPurchasable: true, allowance: null };

jest.mock("react-native-purchases", () => {
  throw new Error("The purchase SDK must not be loaded on the mock path.");
});
jest.mock("../../../config/backend", () => ({ REVENUECAT_IOS_KEY: "" }));
jest.mock("../../../utils/logger", () => ({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } }));
jest.mock("../../account/accountStore", () => ({
  getAccount: () => mockAccount,
  ensureAccount: jest.fn(),
  refreshAccount: jest.fn(),
  subscribeAccount: () => () => undefined,
}));
jest.mock("../../dev/mockAccount", () => ({
  mockShowsPlusOffers: () => mockShows,
  mockAccountConfig: () => (mockShows ? { offer: mockOffer } : null),
}));

import { Platform } from "react-native";
import { buyPlus, loadPlusOffer, purchasesEnabled, restorePlus } from "../purchases";
import { buyLabel } from "../../../domain/plus";

beforeAll(() => {
  // The phone is an Android phone for this file.
  Platform.OS = "android";
});

beforeEach(() => {
  mockShows = false;
  mockOffer = "trial";
  mockAccount = { status: "signedOut", plusPurchasable: true, allowance: null };
});

describe("Tono Plus on a phone that cannot sell it", () => {
  it("is not for sale on Android, as before", () => {
    expect(purchasesEnabled()).toBe(false);
  });

  it("is shown as for sale while the mock asks for it, following the server's launch switch", () => {
    mockShows = true;
    expect(purchasesEnabled()).toBe(true);
    mockAccount = { ...mockAccount, plusPurchasable: false };
    expect(purchasesEnabled()).toBe(false);
    mockAccount = { status: "signedIn", plusPurchasable: false, allowance: { plan: "trial" } };
    expect(purchasesEnabled()).toBe(true);
  });

  it("loads made-up prices through the real plan builder", async () => {
    mockShows = true;
    const offer = await loadPlusOffer();
    expect(offer.plans.map((p) => p.id)).toEqual(["annual", "monthly"]);
    expect(buyLabel(offer.plans[0])).toBe("Start 14-day free trial");
    mockOffer = "no_trial";
    expect(buyLabel((await loadPlusOffer()).plans[0])).toBe("Subscribe for $49.99 / year");
  });

  it("fails to load the prices when asked to", async () => {
    mockShows = true;
    mockOffer = "failed";
    await expect(loadPlusOffer()).rejects.toThrow(/fail to load/);
  });

  it("makes no purchase and no restore", async () => {
    mockShows = true;
    const offer = await loadPlusOffer();
    expect(await buyPlus(offer.plans[0], offer)).toMatchObject({ ok: false, cancelled: false });
    expect(await restorePlus()).toMatchObject({ ok: false, cancelled: false });
  });

  it("without the mock, loading prices is still refused on a phone that cannot sell", async () => {
    await expect(loadPlusOffer()).rejects.toThrow("Purchases aren't available.");
  });
});
