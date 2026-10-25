import type { AccountSnapshot } from "../account";
import { ALL_ALLOWED } from "../account";
import type { AllowanceTier, TonoAllowance } from "../aiAllowance";
import { plansFromPackages, type OfferedPackage, type PlusPlan } from "../plus";

// A pretend Tono account for the Dev tab (Dev, App tools, Mock account): the
// snapshot the app's routing, gating and screens read, built from a few
// choices instead of from the server. Pure. The service that holds the choice
// and the switch that puts it in front of the app are in
// services/dev/mockAccount.ts.

export type MockTier = AllowanceTier;
// Who the pretend person is: nobody signed in, the behind-the-scenes
// anonymous account, or an account linked to Google.
export type MockSignIn = "none" | "anonymous" | "google";
export type MockOffer = "trial" | "no_trial" | "failed";

export interface MockAccountConfig {
  tier: MockTier;
  signIn: MockSignIn;
  // Judged takes left, out of the tier's total.
  takesLeft: number;
  // Live conversation minutes left, out of the tier's total.
  conversationMinutesLeft: number;
  // Exercise notes (Rewind, Say it short, marks) and insights: does the server say yes?
  textAllowed: boolean;
  insightAllowed: boolean;
  plusPurchasable: boolean;
  minorsMayUseAi: boolean;
  killSwitch: boolean;
  mode: "beta" | "launch";
  // Every call to Tono's server fails as if the phone were offline.
  serverUnreachable: boolean;
  // Show Tono Plus as if this phone could buy it (Android cannot; the real
  // purchase code is not run), so the paywall and the "See Tono Plus" buttons
  // can be looked at.
  showPlusOffers: boolean;
  // What the paywall's prices say when it is shown this way.
  offer: MockOffer;
}

export const TIER_TOTALS: Record<MockTier, { takes: number; conversationMinutes: number }> = {
  free: { takes: 1, conversationMinutes: 0 },
  beta: { takes: 15, conversationMinutes: 30 },
  trial: { takes: 20, conversationMinutes: 30 },
  plus: { takes: 60, conversationMinutes: 120 },
};

export const TIER_LABELS: Record<MockTier, string> = { free: "Free", beta: "Beta tester", trial: "Free trial", plus: "Tono Plus" };

// The counts a fresh choice of tier starts with: everything left.
export function configForTier(tier: MockTier, patch: Partial<MockAccountConfig> = {}): MockAccountConfig {
  const totals = TIER_TOTALS[tier];
  return {
    tier,
    signIn: tier === "free" ? "none" : "anonymous",
    takesLeft: totals.takes,
    conversationMinutesLeft: totals.conversationMinutes,
    textAllowed: tier !== "free",
    insightAllowed: tier !== "free",
    plusPurchasable: true,
    minorsMayUseAi: false,
    killSwitch: false,
    mode: tier === "beta" ? "beta" : "launch",
    serverUnreachable: false,
    showPlusOffers: false,
    offer: "trial",
    ...patch,
  };
}

export const DEFAULT_MOCK_CONFIG: MockAccountConfig = configForTier("free");

// The first of next month (UTC), when the counts refill, as the server reports it.
export function nextResetIso(now = new Date()): string {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)).toISOString();
}

export function mockAllowance(config: MockAccountConfig, now = new Date()): TonoAllowance {
  const totals = TIER_TOTALS[config.tier];
  const trialEnd = new Date(now.getTime() + 9 * 86_400_000).toISOString();
  return {
    plan: config.tier === "plus" ? "plus" : config.tier === "trial" ? "trial" : "free",
    tier: config.tier,
    takesLeft: Math.max(0, Math.min(totals.takes, Math.round(config.takesLeft))),
    takesTotal: totals.takes,
    conversationMinutesLeft: Math.max(0, Math.min(totals.conversationMinutes, Math.round(config.conversationMinutesLeft))),
    conversationMinutesTotal: totals.conversationMinutes,
    resetsAt: config.tier === "trial" ? trialEnd : nextResetIso(now),
    trialEndsAt: config.tier === "trial" ? trialEnd : null,
  };
}

// What the app would hold for this account, shaped like the real one
// (services/account/accountStore.ts builds the same from `me` and app-config).
export function mockSnapshot(config: MockAccountConfig, now = new Date()): AccountSnapshot {
  const signedIn = config.signIn !== "none";
  const allowance = signedIn ? mockAllowance(config, now) : null;
  return {
    status: signedIn ? "signedIn" : "signedOut",
    userId: signedIn ? "dev-mock-user" : null,
    anonymous: config.signIn === "anonymous",
    provider: config.signIn === "google" ? "google" : null,
    email: config.signIn === "google" ? "dev.mock@example.com" : null,
    allowance,
    allowed: allowance
      ? { take: allowance.takesLeft > 0, text: config.textAllowed, insight: config.insightAllowed, conversation: (allowance.conversationMinutesLeft ?? 0) > 0 }
      : ALL_ALLOWED,
    mode: config.mode,
    killSwitch: config.killSwitch,
    plusPurchasable: config.plusPurchasable,
    minorsMayUseAi: config.minorsMayUseAi,
  };
}

// One line for the banner and the row.
export function describeMock(config: MockAccountConfig): string {
  const parts = [TIER_LABELS[config.tier]];
  if (config.signIn === "none") parts.push("no account");
  const a = mockAllowance(config);
  if (config.signIn !== "none") parts.push(`${a.takesLeft}/${a.takesTotal} judged`);
  if (a.conversationMinutesTotal) parts.push(`${a.conversationMinutesLeft}/${a.conversationMinutesTotal} min`);
  if (config.killSwitch) parts.push("kill switch");
  if (config.serverUnreachable) parts.push("server unreachable");
  if (config.minorsMayUseAi) parts.push("minors may use AI");
  if (config.showPlusOffers) parts.push("Plus for sale");
  return parts.join(" · ");
}

// Reads whatever was stored, ignoring anything odd.
export function parseMockConfig(raw: unknown): MockAccountConfig | null {
  if (!raw || typeof raw !== "object") return null;
  const v = raw as Partial<MockAccountConfig>;
  if (!v.tier || !(v.tier in TIER_TOTALS)) return null;
  const base = configForTier(v.tier);
  const bool = (x: unknown, fallback: boolean) => (typeof x === "boolean" ? x : fallback);
  const num = (x: unknown, fallback: number) => (typeof x === "number" && Number.isFinite(x) ? x : fallback);
  return {
    tier: v.tier,
    signIn: v.signIn === "none" || v.signIn === "anonymous" || v.signIn === "google" ? v.signIn : base.signIn,
    takesLeft: num(v.takesLeft, base.takesLeft),
    conversationMinutesLeft: num(v.conversationMinutesLeft, base.conversationMinutesLeft),
    textAllowed: bool(v.textAllowed, base.textAllowed),
    insightAllowed: bool(v.insightAllowed, base.insightAllowed),
    plusPurchasable: bool(v.plusPurchasable, base.plusPurchasable),
    minorsMayUseAi: bool(v.minorsMayUseAi, base.minorsMayUseAi),
    killSwitch: bool(v.killSwitch, base.killSwitch),
    mode: v.mode === "beta" || v.mode === "launch" ? v.mode : base.mode,
    serverUnreachable: bool(v.serverUnreachable, false),
    showPlusOffers: bool(v.showPlusOffers, false),
    offer: v.offer === "no_trial" || v.offer === "failed" ? v.offer : "trial",
  };
}

// --- The paywall's prices, when Plus is shown on a phone that cannot sell it ---

// Packages shaped like RevenueCat's (domain/plus.ts reads only these fields),
// run through the real plansFromPackages. "trial": both plans offer 14 days
// free; "no_trial": the Apple ID has used its trial; "failed": the prices
// could not be loaded (null).
export function mockPackages(offer: MockOffer): OfferedPackage[] | null {
  if (offer === "failed") return null;
  const intro = { price: 0, periodUnit: "DAY", periodNumberOfUnits: 14, cycles: 1 };
  return [
    { identifier: "$rc_annual", packageType: "ANNUAL", product: { identifier: "dev.tono.plus.annual", price: 49.99, priceString: "$49.99", pricePerMonthString: "$4.17", introPrice: intro } },
    { identifier: "$rc_monthly", packageType: "MONTHLY", product: { identifier: "dev.tono.plus.monthly", price: 4.99, priceString: "$4.99", pricePerMonthString: null, introPrice: intro } },
  ];
}

export function mockPlans(offer: MockOffer): PlusPlan[] | null {
  const packages = mockPackages(offer);
  if (!packages) return null;
  const eligible = offer === "trial" ? new Set(packages.map((p) => p.product.identifier)) : new Set<string>();
  return plansFromPackages(packages, eligible);
}
