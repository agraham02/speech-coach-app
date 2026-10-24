import type { TonoAllowance } from "../aiAllowance";
import {
  ALL_ALLOWED,
  isLinked,
  parseAccountCache,
  providerFromAuth,
  serializeAccountCache,
  signedInLabel,
  SIGNED_OUT,
  withAllowance,
  type AccountSnapshot,
} from "../account";

const allowance: TonoAllowance = { plan: "free", tier: "free", takesLeft: 1, takesTotal: 1, resetsAt: "2026-12-01T00:00:00.000Z", trialEndsAt: null };
const signedIn: AccountSnapshot = {
  status: "signedIn",
  userId: "u1",
  anonymous: false,
  provider: "apple",
  email: "me@example.com",
  allowance,
  allowed: ALL_ALLOWED,
  mode: "launch",
  killSwitch: false,
  plusPurchasable: true,
  minorsMayUseAi: false,
};
const anonymous: AccountSnapshot = { ...signedIn, anonymous: true, provider: null, email: null };

describe("account cache", () => {
  it("round trips a signed-in account, and the anonymous one", () => {
    expect(parseAccountCache(serializeAccountCache(signedIn))).toEqual(signedIn);
    expect(parseAccountCache(serializeAccountCache(anonymous))).toEqual(anonymous);
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
    const parsed = parseAccountCache(JSON.stringify({ status: "signedIn", userId: "u", provider: "facebook", allowance: { takesLeft: "many" }, allowed: { take: false } }));
    expect(parsed).toMatchObject({ provider: null, allowance: null, allowed: { take: false, text: true, insight: true }, anonymous: false, minorsMayUseAi: false });
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

describe("withAllowance", () => {
  it("stops judged takes at zero and keeps the other kinds as they were", () => {
    const out = withAllowance(signedIn, { ...allowance, takesLeft: 0 });
    expect(out.allowed).toEqual({ take: false, text: true, insight: true, conversation: true });
    expect(withAllowance(out, { ...allowance, takesLeft: 2 }).allowed.take).toBe(true);
  });
});

describe("signedInLabel", () => {
  it("shows a real email, and hides Apple's relay address", () => {
    expect(signedInLabel(signedIn)).toBe("me@example.com");
    expect(signedInLabel({ ...signedIn, email: "abc123@privaterelay.appleid.com" })).toBe("Signed in with Apple");
    expect(signedInLabel({ ...signedIn, email: null, provider: "google" })).toBe("Signed in with Google");
    expect(signedInLabel({ ...signedIn, email: null, provider: null })).toBe("Signed in");
  });

  it("says nothing is linked for the behind-the-scenes account", () => {
    expect(signedInLabel(anonymous)).toBe("Not signed in");
    expect(signedInLabel(SIGNED_OUT)).toBe("Not signed in");
    expect(isLinked(anonymous)).toBe(false);
    expect(isLinked(signedIn)).toBe(true);
  });
});
