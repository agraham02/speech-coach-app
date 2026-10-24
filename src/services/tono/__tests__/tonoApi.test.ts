import type { TonoAllowance } from "../../../domain/aiAllowance";

const mockGetSession = jest.fn();
const mockRefreshSession = jest.fn();
jest.mock("../../account/supabaseClient", () => ({ getSupabase: () => ({ auth: { getSession: mockGetSession, refreshSession: mockRefreshSession } }) }));

const mockFetch = jest.fn();
jest.mock("../../../utils/fetchWithTimeout", () => ({ fetchWithTimeout: (...args: unknown[]) => mockFetch(...args) }));

import { isDenyCode, onAllowance, tonoGenerate, tonoMe, TonoApiError } from "../tonoApi";

const allowance: TonoAllowance = { plan: "free", tier: "free", takesLeft: 1, takesTotal: 1, resetsAt: "2026-12-01T00:00:00.000Z", trialEndsAt: null };

function reply(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, text: async () => JSON.stringify(body) };
}

const REQUEST = { task: "mark_up" as const, schemaVersion: 1, inputs: { text: "hi" }, idempotencyKey: "key-12345678" };

beforeEach(() => {
  jest.resetAllMocks();
  mockGetSession.mockResolvedValue({ data: { session: { access_token: "tok-1" } } });
  mockRefreshSession.mockResolvedValue({});
  onAllowance(null);
});

describe("tonoApi", () => {
  it("sends the token and returns the body", async () => {
    mockFetch.mockResolvedValue(reply(200, { mode: "beta" }));
    await expect(tonoMe()).resolves.toEqual({ mode: "beta" });
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toMatch(/\/functions\/v1\/me$/);
    expect(init.headers.authorization).toBe("Bearer tok-1");
  });

  it("passes every returned allowance to the listener", async () => {
    const seen: TonoAllowance[] = [];
    onAllowance((a) => seen.push(a));
    mockFetch.mockResolvedValue(reply(200, { output: {}, model: "m", usedFallback: false, promptVersion: "p", schemaVersion: 1, usage: null, allowance }));
    await tonoGenerate(REQUEST);
    expect(seen).toEqual([allowance]);
  });

  it("raises a typed error with the allowance on a refusal", async () => {
    const seen: TonoAllowance[] = [];
    onAllowance((a) => seen.push(a));
    mockFetch.mockResolvedValue(reply(402, { error: { code: "quota_exhausted", message: "no", allowance } }));
    const error = await tonoGenerate(REQUEST).catch((e) => e);
    expect(error).toBeInstanceOf(TonoApiError);
    expect(error).toMatchObject({ status: 402, code: "quota_exhausted", allowance });
    expect(seen).toEqual([allowance]);
  });

  it("is signed out without a session, and never calls the server", async () => {
    mockGetSession.mockResolvedValue({ data: { session: null } });
    await expect(tonoMe()).rejects.toMatchObject({ status: 401, code: "signed_out" });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("refreshes once on a 401, then succeeds", async () => {
    mockFetch.mockResolvedValueOnce(reply(401, { error: { code: "signed_out" } })).mockResolvedValueOnce(reply(200, { ok: true }));
    await expect(tonoMe()).resolves.toEqual({ ok: true });
    expect(mockRefreshSession).toHaveBeenCalledTimes(1);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("gives up after one refresh", async () => {
    mockFetch.mockResolvedValue(reply(401, { error: { code: "signed_out" } }));
    await expect(tonoMe()).rejects.toMatchObject({ code: "signed_out" });
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("copes with a body that is not JSON", async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 502, text: async () => "<html>bad gateway</html>" });
    await expect(tonoMe()).rejects.toMatchObject({ status: 502, code: "http_502" });
  });
});

describe("isDenyCode", () => {
  it("knows the refusals that need the person to act", () => {
    expect(isDenyCode("quota_exhausted")).toBe(true);
    expect(isDenyCode("plus_cost_cap")).toBe(true);
    expect(isDenyCode("upstream_failed")).toBe(false);
  });
});
