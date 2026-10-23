import type { TonoAllowance } from "./aiAllowance";
import type { TonoAvailability } from "./aiRouting";

// What the app knows about the signed-in person, kept as one plain object so
// screens can subscribe to it and the pipeline can read it without awaiting
// anything. Pure: services/account/accountStore.ts owns the storage.

export type AccountProvider = "apple" | "google";
export type AccountStatus = "unknown" | "signedOut" | "signedIn";

// Which kinds of call the server would accept right now (from its `me`).
export interface AccountAllowed {
  review: boolean;
  text: boolean;
  insight: boolean;
}

export interface AccountSnapshot {
  // "unknown" only until the stored session has been read at launch.
  status: AccountStatus;
  userId: string | null;
  provider: AccountProvider | null;
  email: string | null;
  allowance: TonoAllowance | null;
  allowed: AccountAllowed;
  mode: "beta" | "launch" | null;
  killSwitch: boolean;
  // Whether the server has Tono Plus on sale (its launch switch). Off during
  // the beta: the purchase code is in the app but nothing offers it.
  plusPurchasable: boolean;
}

// Until the server says otherwise a call is assumed possible, so a stale or
// missing answer never blocks someone who has reviews left.
export const ALL_ALLOWED: AccountAllowed = { review: true, text: true, insight: true };

export const SIGNED_OUT: AccountSnapshot = {
  status: "signedOut",
  userId: null,
  provider: null,
  email: null,
  allowance: null,
  allowed: ALL_ALLOWED,
  mode: null,
  killSwitch: false,
  plusPurchasable: false,
};

export const UNKNOWN_ACCOUNT: AccountSnapshot = { ...SIGNED_OUT, status: "unknown" };

export function providerFromAuth(raw: string | null | undefined): AccountProvider | null {
  return raw === "apple" || raw === "google" ? raw : null;
}

function isAllowance(v: unknown): v is TonoAllowance {
  const a = v as TonoAllowance | null;
  return (
    !!a &&
    (a.plan === "free" || a.plan === "plus") &&
    (a.tier === "starter" || a.tier === "beta" || a.tier === "plus") &&
    typeof a.reviewsLeft === "number" &&
    typeof a.reviewsTotal === "number" &&
    (a.resetsAt === null || typeof a.resetsAt === "string")
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
      provider: providerFromAuth(v.provider),
      email: typeof v.email === "string" ? v.email : null,
      allowance: isAllowance(v.allowance) ? v.allowance : null,
      allowed: {
        review: allowed?.review !== false,
        text: allowed?.text !== false,
        insight: allowed?.insight !== false,
      },
      mode: v.mode === "beta" || v.mode === "launch" ? v.mode : null,
      killSwitch: v.killSwitch === true,
      plusPurchasable: v.plusPurchasable === true,
    };
  } catch {
    return null;
  }
}

// Only a signed-in account is worth keeping; a signed-out copy is just absent.
export function serializeAccountCache(a: AccountSnapshot): string | null {
  return a.status === "signedIn" ? JSON.stringify(a) : null;
}

export function tonoAvailability(a: AccountSnapshot, consent: boolean): TonoAvailability {
  return {
    signedIn: a.status === "signedIn",
    consent,
    allowed: a.killSwitch ? { review: false, text: false, insight: false } : a.allowed,
  };
}

// A new allowance arrived (with a response or from `me`): the flags follow it.
// Reviews are the metered kind; text and insights keep the server's word.
export function withAllowance(a: AccountSnapshot, allowance: TonoAllowance): AccountSnapshot {
  return { ...a, allowance, allowed: { ...a.allowed, review: allowance.reviewsLeft > 0 } };
}

// A short "Signed in with Apple" style line for Settings.
export function signedInLabel(a: AccountSnapshot): string {
  const via = a.provider === "apple" ? "Apple" : a.provider === "google" ? "Google" : null;
  if (a.email && !/privaterelay\.appleid\.com$/i.test(a.email)) return a.email;
  return via ? `Signed in with ${via}` : "Signed in";
}
