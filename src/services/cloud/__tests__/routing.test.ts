import { ALL_ALLOWED, SIGNED_OUT, type AccountSnapshot } from "../../../domain/account";
import { routeAnalysis } from "../../../domain/analysis/routing";
import type { AnalysisKind } from "../../../domain/analysis/types";

let mockPrefs = { provider: "tono", cloudReviewOn: true, consent: ["tono"] as string[], judgeInput: "text", rewindConsent: [] as string[] };
let mockAccount: AccountSnapshot = SIGNED_OUT;
let mockKeys: Record<string, string | null> = {};
const mockRefresh = jest.fn(async () => undefined);

jest.mock("../../prefs/prefsStore", () => ({
  getCloudProvider: () => mockPrefs.provider,
  getCloudReviewDefault: () => mockPrefs.cloudReviewOn,
  getCloudConsent: () => mockPrefs.consent,
  getCloudModel: () => null,
  getShareProfileWithReviews: () => false,
  getJudgeInput: () => mockPrefs.judgeInput,
  getRewindCloudConsent: () => mockPrefs.rewindConsent,
}));
jest.mock("../../secrets/secretsStore", () => ({ getProviderKey: async (id: string) => mockKeys[id] ?? null }));
jest.mock("../../account/accountStore", () => ({ getAccount: () => mockAccount, refreshAccount: () => mockRefresh() }));

import { analysisContext, whyNoDeepReview, type ContextArgs } from "../routing";

const signedIn = (patch: Partial<AccountSnapshot> = {}): AccountSnapshot => ({
  status: "signedIn",
  userId: "u1",
  provider: "apple",
  email: null,
  allowance: { plan: "free", tier: "starter", reviewsLeft: 3, reviewsTotal: 5, resetsAt: null },
  allowed: ALL_ALLOWED,
  mode: "launch",
  killSwitch: false,
  plusPurchasable: false,
  ...patch,
});

beforeEach(() => {
  mockPrefs = { provider: "tono", cloudReviewOn: true, consent: ["tono"], judgeInput: "text", rewindConsent: [] };
  mockAccount = signedIn();
  mockKeys = {};
  mockRefresh.mockClear();
});

const take: ContextArgs = { hasVideo: true, hasTranscript: true, takeOptIn: true };
const route = async (kind: AnalysisKind, args: ContextArgs = take) => routeAnalysis(kind, await analysisContext({ ...args, kind }));

describe("the take review route, from the live facts", () => {
  it("goes to Tono AI from the transcript and measurements by default", async () => {
    expect(await route("take_review")).toMatchObject({ producers: ["tono_ai"], tonoInput: "text" });
  });

  it("sends the video when that's the setting, or when there's no transcript", async () => {
    mockPrefs.judgeInput = "video";
    expect((await route("take_review")).tonoInput).toBe("video");
    mockPrefs.judgeInput = "text";
    expect((await route("take_review", { ...take, hasTranscript: false })).tonoInput).toBe("video");
  });

  it("falls back to an own key when signed out", async () => {
    mockAccount = SIGNED_OUT;
    mockKeys = { gemini: "AIzaKey" };
    mockPrefs.consent = ["tono", "gemini"];
    const ctx = await analysisContext(take);
    expect(ctx.ownKey).toBe("gemini");
    expect(routeAnalysis("take_review", ctx).producers).toEqual(["own_key"]);
  });

  it("falls back to an own key when out of Tono AI calls, and says why when there's none", async () => {
    mockAccount = signedIn({ allowed: { review: true, text: false, insight: true } });
    expect(await route("take_review")).toMatchObject({ producers: [], blocked: "quota" });
    mockKeys = { openai: "sk-key" };
    mockPrefs.consent = ["tono", "openai"];
    expect((await route("take_review")).producers).toEqual(["own_key"]);
  });

  it("asks the server once when the cached allowance says no", async () => {
    mockAccount = signedIn({ allowed: { review: false, text: true, insight: true } });
    await analysisContext({ ...take, refresh: true });
    expect(mockRefresh).toHaveBeenCalledTimes(1);
  });

  it("needs the person's consent for each provider", async () => {
    mockPrefs.consent = [];
    expect(await route("take_review")).toMatchObject({ producers: [], blocked: "no_consent" });
    mockKeys = { gemini: "AIzaKey" };
    expect((await route("take_review")).producers).toEqual([]);
  });

  it("keeps someone who chose their own provider on it, even when signed in to Tono", async () => {
    mockPrefs = { ...mockPrefs, provider: "openai", consent: ["tono", "openai"] };
    mockKeys = { openai: "sk-key", gemini: "AIzaKey" };
    const ctx = await analysisContext(take);
    expect(ctx.wantsTono).toBe(false);
    expect(ctx.ownKey).toBe("openai");
    expect(routeAnalysis("take_review", ctx).producers).toEqual(["own_key"]);
  });

  it("does not reach for a different own-key provider than the one chosen", async () => {
    mockPrefs = { ...mockPrefs, provider: "openai", consent: ["gemini"] };
    mockKeys = { gemini: "AIzaKey" };
    expect((await route("take_review")).producers).toEqual([]);
  });

  it("follows the per-take switch, defaulting to Review every take", async () => {
    mockPrefs.cloudReviewOn = false;
    expect(await route("summary_notes", { hasVideo: false, hasTranscript: true })).toMatchObject({ producers: [], blocked: "opted_out" });
    mockPrefs.cloudReviewOn = true;
    expect((await route("summary_notes", { hasVideo: false, hasTranscript: true })).producers).toEqual(["tono_ai"]);
  });

  it("lets a Rewind's own consent stand for an own key", async () => {
    mockPrefs = { ...mockPrefs, provider: "anthropic", consent: [], rewindConsent: ["anthropic"] };
    mockKeys = { anthropic: "sk-ant-key" };
    expect((await route("rewind_notes", { hasVideo: false, hasTranscript: true, takeOptIn: true })).producers).toEqual(["own_key"]);
    expect((await route("take_review")).producers).toEqual([]);
  });
});

describe("whyNoDeepReview", () => {
  it("says to sign in when signed out", async () => {
    mockAccount = SIGNED_OUT;
    expect(await whyNoDeepReview()).toMatch(/Sign in to use Tono AI/);
  });

  it("says Tono AI has not been allowed yet", async () => {
    mockPrefs.consent = [];
    expect(await whyNoDeepReview()).toMatch(/haven't been allowed/);
  });

  it("says the free reviews are used and points at an own key", async () => {
    mockAccount = signedIn({ allowed: { review: false, text: true, insight: true } });
    expect(await whyNoDeepReview()).toMatch(/used your free AI reviews[\s\S]*own key/);
  });

  it("talks about the provider's key for someone using their own", async () => {
    mockPrefs = { ...mockPrefs, provider: "anthropic", consent: ["anthropic"] };
    expect(await whyNoDeepReview()).toMatch(/Anthropic Claude key/);
    mockPrefs.consent = [];
    expect(await whyNoDeepReview()).toMatch(/haven't been allowed/);
  });
});
