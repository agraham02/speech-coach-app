import type { TonoAllowance } from "../aiAllowance";
import {
  ALL_ALLOWED,
  parseAccountCache,
  providerFromAuth,
  serializeAccountCache,
  signedInLabel,
  SIGNED_OUT,
  tonoAvailability,
  withAllowance,
  type AccountSnapshot,
} from "../account";

const allowance: TonoAllowance = { plan: "free", tier: "starter", reviewsLeft: 3, reviewsTotal: 5, resetsAt: null };
const signedIn: AccountSnapshot = {
  status: "signedIn",
  userId: "u1",
  provider: "apple",
  email: "me@example.com",
  allowance,
  allowed: ALL_ALLOWED,
  mode: "launch",
  killSwitch: false,
  plusPurchasable: true,
};

describe("account cache", () => {
  it("round trips a signed-in account", () => {
    expect(parseAccountCache(serializeAccountCache(signedIn))).toEqual(signedIn);
  });

  it("keeps nothing for a signed-out account", () => {
    expect(serializeAccountCache(SIGNED_OUT)).toBeNull();
  });

  it("drops anything that is not a signed-in account", () => {
    expect(parseAccountCache(null)).toBeNull();
    expect(parseAccountCache("not json")).toBeNull();
    expect(parseAccountCache(JSON.stringify({ status: "signedOut" }))).toBeNull();
    expect(parseAccountCache(JSON.stringify({ status: "signedIn" }))).toBeNull();
  });

  it("repairs odd fields instead of trusting them", () => {
    const parsed = parseAccountCache(JSON.stringify({ status: "signedIn", userId: "u", provider: "facebook", allowance: { reviewsLeft: "many" }, allowed: { review: false } }));
    expect(parsed).toMatchObject({ provider: null, allowance: null, allowed: { review: false, text: true, insight: true } });
  });
});

describe("providerFromAuth", () => {
  it("only knows the two sign-in methods", () => {
    expect(providerFromAuth("apple")).toBe("apple");
    expect(providerFromAuth("google")).toBe("google");
    expect(providerFromAuth("email")).toBeNull();
    expect(providerFromAuth(undefined)).toBeNull();
  });
});

describe("tonoAvailability", () => {
  it("reflects sign-in, consent and the server's flags", () => {
    expect(tonoAvailability(signedIn, true)).toEqual({ signedIn: true, consent: true, allowed: ALL_ALLOWED });
    expect(tonoAvailability(SIGNED_OUT, true).signedIn).toBe(false);
  });

  it("turns everything off when the kill switch is on", () => {
    expect(tonoAvailability({ ...signedIn, killSwitch: true }, true).allowed).toEqual({ review: false, text: false, insight: false });
  });
});

describe("withAllowance", () => {
  it("stops reviews at zero and keeps the other kinds as they were", () => {
    const out = withAllowance(signedIn, { ...allowance, reviewsLeft: 0 });
    expect(out.allowed).toEqual({ review: false, text: true, insight: true });
    expect(withAllowance(out, { ...allowance, reviewsLeft: 2 }).allowed.review).toBe(true);
  });
});

describe("signedInLabel", () => {
  it("shows a real email, and hides Apple's relay address", () => {
    expect(signedInLabel(signedIn)).toBe("me@example.com");
    expect(signedInLabel({ ...signedIn, email: "abc123@privaterelay.appleid.com" })).toBe("Signed in with Apple");
    expect(signedInLabel({ ...signedIn, email: null, provider: "google" })).toBe("Signed in with Google");
    expect(signedInLabel({ ...signedIn, email: null, provider: null })).toBe("Signed in");
  });
});
