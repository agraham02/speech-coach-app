import { ALL_ALLOWED, SIGNED_OUT, type AccountSnapshot } from "../../../domain/account";
import type { TonoAllowance } from "../../../domain/aiAllowance";
import { routeAnalysis } from "../../../domain/analysis/routing";
import type { AnalysisKind } from "../../../domain/analysis/types";
import type { AgeRange } from "../../../domain/profile";

let mockPrefs = { cloudReviewOn: true, consent: true, judgeInput: "text", ageRange: undefined as AgeRange | undefined };
let mockAccount: AccountSnapshot = SIGNED_OUT;
const mockRefresh = jest.fn(async () => undefined);

jest.mock("../../prefs/prefsStore", () => ({
  getCloudReviewDefault: () => mockPrefs.cloudReviewOn,
  hasTonoConsent: () => mockPrefs.consent,
  getJudgeInput: () => mockPrefs.judgeInput,
  getUserProfile: () => ({ contexts: [], obstacles: [], startedAt: "2026-10-01", ageRange: mockPrefs.ageRange }),
}));
jest.mock("../../account/accountStore", () => ({ getAccount: () => mockAccount, refreshAccount: () => mockRefresh() }));

import { analysisContext, tonoAgeGated, whyNotJudged, type ContextArgs } from "../routing";

const freeTake: TonoAllowance = { plan: "free", tier: "free", takesLeft: 1, takesTotal: 1, resetsAt: "2026-12-01T00:00:00.000Z", trialEndsAt: null };

const account = (patch: Partial<AccountSnapshot> = {}): AccountSnapshot => ({
  status: "signedIn",
  userId: "u1",
  anonymous: true,
  provider: null,
  email: null,
  allowance: freeTake,
  allowed: ALL_ALLOWED,
  mode: "launch",
  killSwitch: false,
  plusPurchasable: false,
  minorsMayUseAi: false,
  ...patch,
});

beforeEach(() => {
  mockPrefs = { cloudReviewOn: true, consent: true, judgeInput: "text", ageRange: "25_34" };
  mockAccount = account();
  mockRefresh.mockClear();
});

const take: ContextArgs = { hasVideo: true, hasTranscript: true, takeOptIn: true };
const route = async (kind: AnalysisKind, args: ContextArgs = take) => routeAnalysis(kind, await analysisContext({ ...args, kind }));

describe("the route, from the live facts", () => {
  it("judges a free user's monthly take with Tono AI, from the words by default", async () => {
    expect(await route("take_review")).toMatchObject({ producers: ["tono_ai"], tonoInput: "text" });
  });

  it("works before any account exists: one is made when the call is made", async () => {
    mockAccount = SIGNED_OUT;
    const ctx = await analysisContext(take);
    expect(ctx.tier).toBe("free");
    expect(routeAnalysis("take_review", ctx).producers).toEqual(["tono_ai"]);
  });

  it("sends the video when that's the setting, or when there's no transcript", async () => {
    mockPrefs.judgeInput = "video";
    expect((await route("take_review")).tonoInput).toBe("video");
    mockPrefs.judgeInput = "text";
    expect((await route("take_review", { ...take, hasTranscript: false })).tonoInput).toBe("video");
  });

  it("stops at the used-up free take, and asks the server once in case a month began", async () => {
    mockAccount = account({ allowed: { take: false, text: false, insight: false } });
    expect(await route("take_review")).toMatchObject({ producers: [], blocked: "quota" });
    await analysisContext({ ...take, refresh: true });
    expect(mockRefresh).toHaveBeenCalledTimes(1);
  });

  it("keeps the exercise judges for Plus and the trial", async () => {
    for (const kind of ["rewind_notes", "word_chain", "bridge_chain", "summary_notes"] as const) {
      expect((await route(kind)).blocked).toBe("not_entitled");
    }
    mockAccount = account({ allowance: { ...freeTake, plan: "trial", tier: "trial", takesTotal: 20, takesLeft: 20 } });
    expect((await route("word_chain")).producers).toEqual(["tono_ai"]);
  });

  it("needs the one consent", async () => {
    mockPrefs.consent = false;
    expect(await route("take_review")).toMatchObject({ producers: [], blocked: "no_consent" });
  });

  it("follows the per-take switch, defaulting to judging every take", async () => {
    mockPrefs.cloudReviewOn = false;
    expect(await route("take_review", { hasVideo: false, hasTranscript: true })).toMatchObject({ producers: [], blocked: "opted_out" });
  });
});

describe("the age answer", () => {
  it("keeps Tono AI off for under-18s by the server's policy", async () => {
    for (const ageRange of ["under_13", "13_17"] as const) {
      mockPrefs.ageRange = ageRange;
      expect((await route("take_review")).blocked).toBe("age_gate");
      expect(tonoAgeGated()).toBe(true);
    }
  });

  it("lets the server open it to minors, and never blocks an unanswered question", async () => {
    mockPrefs.ageRange = "13_17";
    mockAccount = account({ minorsMayUseAi: true });
    expect((await route("take_review")).producers).toEqual(["tono_ai"]);
    mockAccount = account();
    for (const ageRange of [undefined, "unsaid"] as const) {
      mockPrefs.ageRange = ageRange;
      expect((await route("take_review")).producers).toEqual(["tono_ai"]);
    }
  });
});

describe("whyNotJudged", () => {
  it("explains each reason plainly, and never mentions a key or a sign-in", () => {
    expect(whyNotJudged("no_consent")).toMatch(/hasn't been allowed/);
    expect(whyNotJudged("age_gate")).toMatch(/18 and over/);
    mockAccount = account({ allowance: { ...freeTake, takesLeft: 0 } });
    expect(whyNotJudged("quota")).toMatch(/next one comes on 1 December/);
    for (const reason of ["no_consent", "quota", "offline", "signed_out", "kill_switch"] as const) {
      expect(whyNotJudged(reason)).not.toMatch(/own key|API key|sign in/i);
    }
  });
});
