import type { TonoAllowance } from "../../../domain/aiAllowance";

// A fresh copy of the module (and its fakes) for each test: the store keeps its
// state at module level.
const allowance = (left: number): TonoAllowance => ({ plan: "free", tier: "starter", reviewsLeft: left, reviewsTotal: 5, resetsAt: null });

interface Fakes {
  authCallback: ((event: string, session: unknown) => void) | null;
  session: unknown;
  signOut: jest.Mock;
  me: jest.Mock;
  cache: string | null;
  chosenProvider: string | null;
  setProvider: jest.Mock;
  keys: Record<string, string | null>;
  allowanceListener: ((a: TonoAllowance) => void) | null;
}

function load(initial: Partial<Fakes> = {}) {
  const fakes: Fakes = {
    authCallback: null,
    session: null,
    signOut: jest.fn(async () => ({ error: null })),
    me: jest.fn(),
    cache: null,
    chosenProvider: "tono",
    setProvider: jest.fn(),
    keys: {},
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
      },
    }),
  }));
  jest.doMock("../../tono/tonoApi", () => {
    const { TonoApiError } = jest.requireActual("../../tono/tonoError");
    return {
      TonoApiError,
      tonoMe: (...a: unknown[]) => fakes.me(...a),
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
    hasChosenCloudProvider: () => fakes.chosenProvider !== null,
    setCloudProvider: (id: string) => fakes.setProvider(id),
  }));
  jest.doMock("../../secrets/secretsStore", () => ({ getProviderKey: async (id: string) => fakes.keys[id] ?? null }));
  jest.doMock("../../cloud/providers", () => ({ PROVIDER_ORDER: ["gemini", "openai", "anthropic", "openrouter"] }));
  jest.doMock("../../../utils/logger", () => ({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } }));
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const store = require("../accountStore") as typeof import("../accountStore");
  return { store, fakes };
}

const user = { id: "u1", email: "me@example.com", app_metadata: { provider: "apple" }, identities: [] };
const meReply = { allowance: allowance(4), mode: "launch", allowed: { review: true, text: true, insight: false }, killSwitch: false };

describe("accountStore", () => {
  it("is signed out at launch when there is no session", async () => {
    const { store } = load();
    expect(store.getAccount().status).toBe("unknown");
    await store.initAccount();
    expect(store.getAccount().status).toBe("signedOut");
  });

  it("knows a cached sign-in straight away and then asks the server", async () => {
    const cached = JSON.stringify({ status: "signedIn", userId: "u1", provider: "apple", email: "me@example.com", allowance: allowance(2), allowed: { review: true, text: true, insight: true }, mode: "launch", killSwitch: false });
    const { store, fakes } = load({ cache: cached, session: { user }, me: jest.fn().mockResolvedValue(meReply) });
    expect(store.getAccount()).toMatchObject({ status: "signedIn", allowance: { reviewsLeft: 2 } });
    await store.initAccount();
    await store.refreshAccount();
    expect(fakes.me).toHaveBeenCalled();
    expect(store.getAccount()).toMatchObject({ allowance: { reviewsLeft: 4 }, mode: "launch", allowed: { insight: false } });
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
    expect(store.getAccount().allowance?.reviewsLeft).toBe(1);
    fakes.authCallback!("SIGNED_IN", { user: { ...user, id: "u2", app_metadata: { provider: "google" } } });
    expect(store.getAccount()).toMatchObject({ userId: "u2", provider: "google", allowance: null });
  });

  it("stops allowing reviews when the allowance reaches zero", async () => {
    const { store, fakes } = load();
    await store.initAccount();
    fakes.authCallback!("SIGNED_IN", { user });
    fakes.allowanceListener!(allowance(0));
    expect(store.getAccount().allowed.review).toBe(false);
    fakes.allowanceListener!(allowance(3));
    expect(store.getAccount().allowed.review).toBe(true);
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

  it("moves a phone that already had a key onto it, once", async () => {
    const { store, fakes } = load({ chosenProvider: null, keys: { openai: "sk-test" } });
    await store.initAccount();
    expect(fakes.setProvider).toHaveBeenCalledWith("openai");
  });

  it("leaves a phone that chose already alone", async () => {
    const { store, fakes } = load({ chosenProvider: "tono", keys: { gemini: "AIza" } });
    await store.initAccount();
    expect(fakes.setProvider).not.toHaveBeenCalled();
  });
});
