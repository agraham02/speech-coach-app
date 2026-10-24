import type { TonoAllowance } from "./aiAllowance";

// What the app knows about the person's Tono account, kept as one plain object
// so screens can subscribe to it and the pipeline can read it without awaiting
// anything. Pure: services/account/accountStore.ts owns the storage.
//
// Nobody has to sign in. The free path needs no account at all. The first
// time Tono AI or a purchase needs one, the app makes an anonymous account
// behind the scenes (Supabase anonymous sign-in, linked to RevenueCat), so a
// trial or a purchase never asks anyone to register. Signing in with Apple or
// Google is optional and links that same account, so Plus can follow the
// person to another phone.

export type AccountProvider = "apple" | "google";
// "signedIn" means there is a session, anonymous or linked.
export type AccountStatus = "unknown" | "signedOut" | "signedIn";

// Which kinds of call the server would accept right now (from its `me`).
export interface AccountAllowed {
  take: boolean;
  text: boolean;
  insight: boolean;
}

export interface AccountSnapshot {
  // "unknown" only until the stored session has been read at launch.
  status: AccountStatus;
  userId: string | null;
  // True for the behind-the-scenes account nobody signed in to.
  anonymous: boolean;
  // The sign-in linked to it, when there is one.
  provider: AccountProvider | null;
  email: string | null;
  allowance: TonoAllowance | null;
  allowed: AccountAllowed;
  mode: "beta" | "launch" | null;
  killSwitch: boolean;
  // Whether the server has Tono Plus on sale (its launch switch).
  plusPurchasable: boolean;
  // Whether someone who said they are under 18 may use Tono AI (server policy).
  minorsMayUseAi: boolean;
}

// Until the server says otherwise a call is assumed possible, so a stale or
// missing answer never blocks someone who has takes left.
export const ALL_ALLOWED: AccountAllowed = { take: true, text: true, insight: true };

export const SIGNED_OUT: AccountSnapshot = {
  status: "signedOut",
  userId: null,
  anonymous: false,
  provider: null,
  email: null,
  allowance: null,
  allowed: ALL_ALLOWED,
  mode: null,
  killSwitch: false,
  plusPurchasable: false,
  minorsMayUseAi: false,
};

export const UNKNOWN_ACCOUNT: AccountSnapshot = { ...SIGNED_OUT, status: "unknown" };

export function providerFromAuth(raw: string | null | undefined): AccountProvider | null {
  return raw === "apple" || raw === "google" ? raw : null;
}

const PLANS = ["free", "trial", "plus"];
const TIERS = ["free", "beta", "trial", "plus"];

function isAllowance(v: unknown): v is TonoAllowance {
  const a = v as TonoAllowance | null;
  return (
    !!a &&
    PLANS.includes(a.plan) &&
    TIERS.includes(a.tier) &&
    typeof a.takesLeft === "number" &&
    typeof a.takesTotal === "number" &&
    typeof a.resetsAt === "string" &&
    (a.trialEndsAt === null || typeof a.trialEndsAt === "string")
  );
}

// The copy kept between launches. Anything odd is dropped rather than trusted:
// the server is asked again as soon as there is a connection.
export function parseAccountCache(raw: string | null | undefined): AccountSnapshot | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Partial<AccountSnapshot>;
    if (v.status !== "signedIn" || typeof v.userId !== "string") return null;
    const allowed = v.allowed as Partial<AccountAllowed> | undefined;
    return {
      status: "signedIn",
      userId: v.userId,
      anonymous: v.anonymous === true,
      provider: providerFromAuth(v.provider),
      email: typeof v.email === "string" ? v.email : null,
      allowance: isAllowance(v.allowance) ? v.allowance : null,
      allowed: {
        take: allowed?.take !== false,
        text: allowed?.text !== false,
        insight: allowed?.insight !== false,
      },
      mode: v.mode === "beta" || v.mode === "launch" ? v.mode : null,
      killSwitch: v.killSwitch === true,
      plusPurchasable: v.plusPurchasable === true,
      minorsMayUseAi: v.minorsMayUseAi === true,
    };
  } catch {
    return null;
  }
}

// Only an account is worth keeping; a signed-out copy is just absent.
export function serializeAccountCache(a: AccountSnapshot): string | null {
  return a.status === "signedIn" ? JSON.stringify(a) : null;
}

// A new allowance arrived (with a response or from `me`): the flags follow it.
// Judged takes are the metered kind; text and insights keep the server's word.
export function withAllowance(a: AccountSnapshot, allowance: TonoAllowance): AccountSnapshot {
  return { ...a, allowance, allowed: { ...a.allowed, take: allowance.takesLeft > 0 } };
}

// A short line for Settings: who this is, or that nothing is linked.
export function signedInLabel(a: AccountSnapshot): string {
  if (a.status !== "signedIn" || a.anonymous) return "Not signed in";
  const via = a.provider === "apple" ? "Apple" : a.provider === "google" ? "Google" : null;
  if (a.email && !/privaterelay\.appleid\.com$/i.test(a.email)) return a.email;
  return via ? `Signed in with ${via}` : "Signed in";
}

// Signed in with Apple or Google (not just the anonymous account).
export function isLinked(a: AccountSnapshot): boolean {
  return a.status === "signedIn" && !a.anonymous;
}
