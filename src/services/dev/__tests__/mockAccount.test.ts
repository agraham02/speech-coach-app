import type { TonoAllowance } from "../../../domain/aiAllowance";

// The mock account and the dev switches, loaded fresh each time so module
// state (and the SHOW_DEV_TOOLS gate) can be set per test. Nothing here
// touches a network: the fakes below record every call that would have.

const allowance = (left: number): TonoAllowance => ({ plan: "free", tier: "free", takesLeft: left, takesTotal: 5, resetsAt: "2026-12-01T00:00:00.000Z", trialEndsAt: null });

interface Fakes {
  stored: Record<string, unknown>;
  me: jest.Mock;
  appConfig: jest.Mock;
  signInAnonymously: jest.Mock;
  getSession: jest.Mock;
  fetch: jest.Mock;
}

function load({ dev = true, stored = {} }: { dev?: boolean; stored?: Record<string, unknown> } = {}) {
  const fakes: Fakes = {
    stored: { ...stored },
    me: jest.fn().mockResolvedValue({ allowance: allowance(4), mode: "launch", allowed: { take: true, text: true, insight: true }, killSwitch: false, plusPurchasable: true, minorsMayUseAi: false }),
    appConfig: jest.fn().mockResolvedValue({ mode: "launch", killSwitch: false, plusPurchasable: true, minorsMayUseAi: false, freeMonthlyJudgedTakes: 1 }),
    signInAnonymously: jest.fn().mockResolvedValue({ data: { session: null }, error: { message: "no" } }),
    getSession: jest.fn().mockResolvedValue({ data: { session: null } }),
    fetch: jest.fn(),
  };
  jest.resetModules();
  jest.doMock("react-native", () => ({ AppState: { addEventListener: jest.fn() }, Platform: { OS: "android" } }));
  jest.doMock("../../../config/devTools", () => ({ SHOW_DEV_TOOLS: dev }));
  jest.doMock("../devHelperStore", () => ({
    getHelperJson: (key: string, fallback: unknown) => (dev && key in fakes.stored ? fakes.stored[key] : fallback),
    setHelperJson: (key: string, value: unknown) => {
      if (value === null || value === undefined) delete fakes.stored[key];
      else fakes.stored[key] = JSON.parse(JSON.stringify(value));
    },
  }));
  jest.doMock("../../account/supabaseClient", () => ({
    getSupabase: () => ({
      auth: {
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe: jest.fn() } } }),
        getSession: (...a: unknown[]) => fakes.getSession(...a),
        signInAnonymously: (...a: unknown[]) => fakes.signInAnonymously(...a),
        refreshSession: jest.fn(),
        signOut: jest.fn(async () => ({ error: null })),
      },
    }),
  }));
  jest.doMock("../../../utils/fetchWithTimeout", () => ({
    TimeoutError: class extends Error {},
    fetchWithTimeout: (...a: unknown[]) => fakes.fetch(...a),
  }));
  jest.doMock("../../prefs/prefsStore", () => ({ getAccountCacheRaw: () => null, setAccountCacheRaw: () => undefined }));
  jest.doMock("../../../utils/logger", () => ({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } }));
  /* eslint-disable @typescript-eslint/no-require-imports */
  const mock = require("../mockAccount") as typeof import("../mockAccount");
  const config = require("../../../domain/dev/mockAccount") as typeof import("../../../domain/dev/mockAccount");
  const accountStore = require("../../account/accountStore") as typeof import("../../account/accountStore");
  const tonoApi = require("../../tono/tonoApi") as typeof import("../../tono/tonoApi");
  const skip = require("../skipModel") as typeof import("../skipModel");
  /* eslint-enable @typescript-eslint/no-require-imports */
  return { fakes, mock, config, accountStore, tonoApi, skip };
}

describe("the mock account", () => {
  it("replaces the account the app reads, and puts the real one back when cleared", () => {
    const { mock, config, accountStore } = load();
    expect(accountStore.getAccount().status).toBe("unknown");
    mock.setMockAccount(config.configForTier("plus", { takesLeft: 7 }));
    expect(accountStore.getAccount()).toMatchObject({ status: "signedIn", allowance: { plan: "plus", takesLeft: 7 } });
    // The same object until the choice changes (React compares by identity).
    expect(accountStore.getAccount()).toBe(accountStore.getAccount());
    mock.setMockAccount(null);
    expect(accountStore.getAccount().status).toBe("unknown");
  });

  it("tells subscribers when the choice changes", () => {
    const { mock, config, accountStore } = load();
    const seen: string[] = [];
    const stop = accountStore.subscribeAccount(() => seen.push(accountStore.getAccount().allowance?.tier ?? "none"));
    mock.setMockAccount(config.configForTier("trial"));
    mock.setMockAccount(config.configForTier("beta"));
    mock.setMockAccount(null);
    stop();
    mock.setMockAccount(config.configForTier("plus"));
    expect(seen).toEqual(["trial", "beta", "none"]);
  });

  it("is kept on the phone and read back at the next launch", () => {
    const first = load();
    first.mock.setMockAccount(first.config.configForTier("trial", { takesLeft: 2, killSwitch: true }));
    const second = load({ stored: first.fakes.stored });
    expect(second.accountStore.getAccount()).toMatchObject({ allowance: { plan: "trial", takesLeft: 2 }, killSwitch: true });
  });

  it("asks Tono's server for nothing while it is on", async () => {
    const { fakes, mock, config, accountStore, tonoApi } = load();
    mock.setMockAccount(config.configForTier("plus"));
    await accountStore.initAccount();
    await accountStore.refreshAccount();
    await accountStore.refreshAccount({ syncPurchases: true });
    await accountStore.refreshPublicConfig();
    await accountStore.ensureAccount();
    await expect(tonoApi.tonoMe()).rejects.toMatchObject({ code: "dev_mock" });
    await expect(tonoApi.tonoAppConfig()).rejects.toMatchObject({ code: "dev_mock" });
    await expect(tonoApi.tonoGenerate({ task: "mark_up", schemaVersion: 1, inputs: {}, idempotencyKey: "key-12345678" })).rejects.toMatchObject({ code: "dev_mock" });
    await expect(tonoApi.tonoDeleteAccount()).rejects.toMatchObject({ code: "dev_mock" });
    expect(fakes.me).not.toHaveBeenCalled();
    expect(fakes.appConfig).not.toHaveBeenCalled();
    expect(fakes.signInAnonymously).not.toHaveBeenCalled();
    expect(fakes.getSession).not.toHaveBeenCalled();
    expect(fakes.fetch).not.toHaveBeenCalled();
  });

  it("fails like a dead connection when the server is unreachable", async () => {
    const { mock, config, accountStore, tonoApi } = load();
    mock.setMockAccount(config.configForTier("plus", { serverUnreachable: true }));
    await expect(accountStore.ensureAccount()).rejects.toBeInstanceOf(TypeError);
    await expect(tonoApi.tonoMe()).rejects.toBeInstanceOf(TypeError);
  });

  it("starts the real account up when the mock is cleared", async () => {
    const { fakes, mock, config, accountStore } = load();
    mock.setMockAccount(config.configForTier("plus"));
    await accountStore.initAccount();
    expect(fakes.getSession).not.toHaveBeenCalled();
    mock.setMockAccount(null);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(fakes.getSession).toHaveBeenCalled();
    expect(fakes.fetch.mock.calls.some((c) => String(c[0]).endsWith("/app-config"))).toBe(true);
  });

  it("shows Plus as for sale only while asked to", () => {
    const { mock, config } = load();
    expect(mock.mockShowsPlusOffers()).toBe(false);
    mock.setMockAccount(config.configForTier("free", { showPlusOffers: true }));
    expect(mock.mockShowsPlusOffers()).toBe(true);
    mock.setMockAccount(null);
    expect(mock.mockShowsPlusOffers()).toBe(false);
  });
});

describe("the skip-model switch", () => {
  it("is off until switched on, and tells listeners", () => {
    const { skip } = load();
    const seen: boolean[] = [];
    skip.subscribeSkipModel(() => seen.push(skip.skipModelDownloadActive()));
    expect(skip.skipModelDownloadActive()).toBe(false);
    skip.setSkipModelDownload(true);
    skip.setSkipModelDownload(false);
    expect(seen).toEqual([true, false]);
  });
});

// A production build has SHOW_DEV_TOOLS false. Whatever is stored, the helpers
// are inert: no mock account, no skipped download, no refusals.
describe("in a production build", () => {
  const stored = { mockAccount: { tier: "plus" }, skipModelDownload: true };

  it("ignores a stored mock account and never refuses a call", async () => {
    const { mock, config, accountStore } = load({ dev: false, stored });
    expect(mock.mockAccountSnapshot()).toBeNull();
    expect(mock.mockAccountActive()).toBe(false);
    mock.setMockAccount(config.configForTier("plus"));
    expect(mock.mockAccountActive()).toBe(false);
    expect(() => mock.refuseTonoCallWhenMocked("me")).not.toThrow();
    expect(accountStore.getAccount().status).toBe("unknown");
  });

  it("still asks the server, as before", async () => {
    const { fakes, accountStore, tonoApi } = load({ dev: false, stored });
    fakes.getSession.mockResolvedValue({ data: { session: null } });
    await accountStore.initAccount();
    expect(fakes.getSession).toHaveBeenCalled();
    expect(fakes.fetch.mock.calls.some((c) => String(c[0]).endsWith("/app-config"))).toBe(true);
    await expect(tonoApi.tonoMe()).rejects.toMatchObject({ code: "signed_out" });
  });

  it("does not skip the model download", () => {
    const { skip } = load({ dev: false, stored });
    expect(skip.skipModelDownloadActive()).toBe(false);
    skip.setSkipModelDownload(true);
    expect(skip.skipModelDownloadActive()).toBe(false);
  });

  it("does not show Plus", () => {
    const { mock } = load({ dev: false, stored: { mockAccount: { tier: "plus", showPlusOffers: true } } });
    expect(mock.mockShowsPlusOffers()).toBe(false);
  });
});
