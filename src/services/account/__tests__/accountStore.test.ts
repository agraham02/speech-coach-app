import type { TonoAllowance } from "../../../domain/aiAllowance";

// A fresh copy of the module (and its fakes) for each test: the store keeps its
// state at module level.
const allowance = (left: number): TonoAllowance => ({ plan: "free", tier: "free", takesLeft: left, takesTotal: 5, resetsAt: "2026-12-01T00:00:00.000Z", trialEndsAt: null });

interface Fakes {
  authCallback: ((event: string, session: unknown) => void) | null;
  session: unknown;
  signOut: jest.Mock;
  me: jest.Mock;
  cache: string | null;
  signInAnonymously: jest.Mock;
  appConfig: jest.Mock;
  allowanceListener: ((a: TonoAllowance) => void) | null;
}

function load(initial: Partial<Fakes> = {}) {
  const fakes: Fakes = {
    authCallback: null,
    session: null,
    signOut: jest.fn(async () => ({ error: null })),
    me: jest.fn(),
    cache: null,
    signInAnonymously: jest.fn(),
    appConfig: jest.fn().mockRejectedValue(new Error("offline")),
    allowanceListener: null,
    ...initial,
  };
  jest.resetModules();
  jest.doMock("react-native", () => ({ AppState: { addEventListener: jest.fn() } }));
  jest.doMock("../supabaseClient", () => ({
    getSupabase: () => ({
      auth: {
        onAuthStateChange: (cb: Fakes["authCallback"]) => {
          fakes.authCallback = cb;
          return { data: { subscription: { unsubscribe: jest.fn() } } };
        },
        getSession: async () => ({ data: { session: fakes.session } }),
        signOut: (...a: unknown[]) => fakes.signOut(...a),
        signInAnonymously: (...a: unknown[]) => fakes.signInAnonymously(...a),
      },
    }),
  }));
  jest.doMock("../../tono/tonoApi", () => {
    const { TonoApiError } = jest.requireActual("../../tono/tonoError");
    return {
      TonoApiError,
      tonoMe: (...a: unknown[]) => fakes.me(...a),
      tonoAppConfig: (...a: unknown[]) => fakes.appConfig(...a),
      onAllowance: (l: Fakes["allowanceListener"]) => {
        fakes.allowanceListener = l;
      },
    };
  });
  jest.doMock("../../prefs/prefsStore", () => ({
    getAccountCacheRaw: () => fakes.cache,
    setAccountCacheRaw: (raw: string | null) => {
      fakes.cache = raw;
    },
  }));
  jest.doMock("../../../utils/logger", () => ({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } }));
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const store = require("../accountStore") as typeof import("../accountStore");
  return { store, fakes };
}

const user = { id: "u1", email: "me@example.com", app_metadata: { provider: "apple" }, identities: [] };
const meReply = { allowance: allowance(4), mode: "launch", allowed: { take: true, text: true, insight: false }, killSwitch: false, plusPurchasable: true, minorsMayUseAi: false };

describe("accountStore", () => {
  it("is signed out at launch when there is no session", async () => {
    const { store } = load();
    expect(store.getAccount().status).toBe("unknown");
    await store.initAccount();
    expect(store.getAccount().status).toBe("signedOut");
  });

  it("knows a cached sign-in straight away and then asks the server", async () => {
    const cached = JSON.stringify({ status: "signedIn", userId: "u1", provider: "apple", email: "me@example.com", allowance: allowance(2), allowed: { take: true, text: true, insight: true }, mode: "launch", killSwitch: false });
    const { store, fakes } = load({ cache: cached, session: { user }, me: jest.fn().mockResolvedValue(meReply) });
    expect(store.getAccount()).toMatchObject({ status: "signedIn", allowance: { takesLeft: 2 } });
    await store.initAccount();
    await store.refreshAccount();
    expect(fakes.me).toHaveBeenCalled();
    expect(store.getAccount()).toMatchObject({ allowance: { takesLeft: 4 }, mode: "launch", allowed: { insight: false }, plusPurchasable: true });
  });

  it("signs in on the auth event, saves the cache, and signs out again", async () => {
    const { store, fakes } = load({ me: jest.fn().mockResolvedValue(meReply) });
    await store.initAccount();
    fakes.authCallback!("SIGNED_IN", { user });
    expect(store.getAccount()).toMatchObject({ status: "signedIn", userId: "u1", provider: "apple", email: "me@example.com" });
    expect(fakes.cache).toContain('"userId":"u1"');
    fakes.authCallback!("SIGNED_OUT", null);
    expect(store.getAccount().status).toBe("signedOut");
    expect(fakes.cache).toBeNull();
  });

  it("starts clean when a different person signs in", async () => {
    const { store, fakes } = load({ me: jest.fn().mockResolvedValue(meReply) });
    await store.initAccount();
    fakes.authCallback!("SIGNED_IN", { user });
    fakes.allowanceListener!(allowance(1));
    expect(store.getAccount().allowance?.takesLeft).toBe(1);
    fakes.authCallback!("SIGNED_IN", { user: { ...user, id: "u2", app_metadata: { provider: "google" } } });
    expect(store.getAccount()).toMatchObject({ userId: "u2", provider: "google", allowance: null });
  });

  it("stops allowing judged takes when the allowance reaches zero", async () => {
    const { store, fakes } = load();
    await store.initAccount();
    fakes.authCallback!("SIGNED_IN", { user });
    fakes.allowanceListener!(allowance(0));
    expect(store.getAccount().allowed.take).toBe(false);
    fakes.allowanceListener!(allowance(3));
    expect(store.getAccount().allowed.take).toBe(true);
  });

  it("ignores an allowance that arrives while signed out", async () => {
    const { store, fakes } = load();
    await store.initAccount();
    fakes.allowanceListener!(allowance(1));
    expect(store.getAccount().allowance).toBeNull();
  });

  it("signs out locally when the server rejects the session", async () => {
    const { store, fakes } = load({ session: { user } });
    // The error class must come from the same module copy the store uses.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { TonoApiError } = require("../../tono/tonoApi") as typeof import("../../tono/tonoApi");
    fakes.me.mockRejectedValue(new TonoApiError(401, "signed_out"));
    await store.initAccount();
    await store.refreshAccount();
    expect(fakes.signOut).toHaveBeenCalledWith({ scope: "local" });
  });

  it("keeps the cached answer when the network is down", async () => {
    const { store } = load({ session: { user }, me: jest.fn().mockRejectedValue(new Error("offline")) });
    await store.initAccount();
    await store.refreshAccount();
    expect(store.getAccount().status).toBe("signedIn");
  });

  it("marks the behind-the-scenes account as anonymous, with no sign-in shown", async () => {
    const { store, fakes } = load({ me: jest.fn().mockResolvedValue(meReply) });
    await store.initAccount();
    fakes.authCallback!("SIGNED_IN", { user: { id: "anon", is_anonymous: true, email: null, app_metadata: { provider: "anonymous" }, identities: [] } });
    expect(store.getAccount()).toMatchObject({ status: "signedIn", anonymous: true, provider: null, email: null });
  });

  it("makes an anonymous account only when one is needed, and only once", async () => {
    const anon = { user: { id: "anon", is_anonymous: true, identities: [] } };
    const { store, fakes } = load({ me: jest.fn().mockResolvedValue(meReply), signInAnonymously: jest.fn().mockResolvedValue({ data: { session: anon }, error: null }) });
    await store.initAccount();
    expect(fakes.signInAnonymously).not.toHaveBeenCalled();
    await Promise.all([store.ensureAccount(), store.ensureAccount()]);
    expect(fakes.signInAnonymously).toHaveBeenCalledTimes(1);
    expect(store.getAccount()).toMatchObject({ status: "signedIn", userId: "anon", anonymous: true, allowance: { takesLeft: 4 } });
    await store.ensureAccount();
    expect(fakes.signInAnonymously).toHaveBeenCalledTimes(1);
  });

  it("knows whether Plus is on sale without any account", async () => {
    const { store, fakes } = load({ appConfig: jest.fn().mockResolvedValue({ mode: "launch", killSwitch: false, plusPurchasable: true, minorsMayUseAi: false, freeMonthlyJudgedTakes: 1 }) });
    await store.initAccount();
    await store.refreshPublicConfig();
    expect(fakes.appConfig).toHaveBeenCalled();
    expect(store.getAccount()).toMatchObject({ status: "signedOut", plusPurchasable: true, mode: "launch" });
    expect(fakes.cache).toBeNull();
  });

  it("fails loudly when the account can't be made (offline), so the caller can say so", async () => {
    const { store } = load({ signInAnonymously: jest.fn().mockResolvedValue({ data: { session: null }, error: { message: "network" } }) });
    await store.initAccount();
    await expect(store.ensureAccount()).rejects.toThrow("network");
    expect(store.getAccount().status).toBe("signedOut");
  });
});
