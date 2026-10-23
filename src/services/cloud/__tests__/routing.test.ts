import { ALL_ALLOWED, SIGNED_OUT, type AccountSnapshot } from "../../../domain/account";

let mockPrefs = { provider: "tono", cloudReviewOn: true, consent: ["tono"] as string[] };
let mockAccount: AccountSnapshot = SIGNED_OUT;
let mockKeys: Record<string, string | null> = {};

jest.mock("../../prefs/prefsStore", () => ({
  getCloudProvider: () => mockPrefs.provider,
  getCloudReviewDefault: () => mockPrefs.cloudReviewOn,
  getCloudConsent: () => mockPrefs.consent,
  getCloudModel: () => null,
  getShareProfileWithReviews: () => false,
}));
jest.mock("../../secrets/secretsStore", () => ({ getProviderKey: async (id: string) => mockKeys[id] ?? null }));
jest.mock("../../account/accountStore", () => ({ getAccount: () => mockAccount }));

import { providerFor, whyNoDeepReview } from "../routing";

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
  mockPrefs = { provider: "tono", cloudReviewOn: true, consent: ["tono"] };
  mockAccount = signedIn();
  mockKeys = {};
});

const review = { hasVideo: true, cloudReviewOn: true };

describe("providerFor video_review", () => {
  it("uses Tono AI through the server when signed in, allowed and consented", async () => {
    expect(await providerFor("video_review", review)).toMatchObject({ transport: "hosted", provider: { id: "tono" } });
  });

  it("falls back to an own key when signed out", async () => {
    mockAccount = SIGNED_OUT;
    mockKeys = { gemini: "AIzaKey" };
    mockPrefs.consent = ["tono", "gemini"];
    expect(await providerFor("video_review", review)).toMatchObject({ transport: "direct", provider: { id: "gemini" } });
  });

  it("falls back to an own key when out of reviews", async () => {
    mockAccount = signedIn({ allowed: { review: false, text: true, insight: true } });
    mockKeys = { gemini: "AIzaKey" };
    mockPrefs.consent = ["tono", "gemini"];
    expect(await providerFor("video_review", review)).toMatchObject({ transport: "direct", provider: { id: "gemini" } });
  });

  it("is nothing when out of reviews with no key", async () => {
    mockAccount = signedIn({ allowed: { review: false, text: true, insight: true } });
    expect(await providerFor("video_review", review)).toBeNull();
  });

  it("needs the person's consent for each provider", async () => {
    mockPrefs.consent = [];
    expect(await providerFor("video_review", review)).toBeNull();
    mockKeys = { gemini: "AIzaKey" };
    expect(await providerFor("video_review", review)).toBeNull();
  });

  it("keeps someone who chose their own provider on it, even when signed in to Tono", async () => {
    mockPrefs = { provider: "openai", cloudReviewOn: true, consent: ["tono", "openai"] };
    mockKeys = { openai: "sk-key", gemini: "AIzaKey" };
    expect(await providerFor("video_review", review)).toMatchObject({ transport: "direct", provider: { id: "openai" } });
  });

  it("does not reach for a different own-key provider than the one chosen", async () => {
    mockPrefs = { provider: "openai", cloudReviewOn: true, consent: ["gemini"] };
    mockKeys = { gemini: "AIzaKey" };
    expect(await providerFor("video_review", review)).toBeNull();
  });

  it("cannot review a deleted video with Tono AI", async () => {
    expect(await providerFor("video_review", { hasVideo: false, cloudReviewOn: true })).toBeNull();
  });
});

describe("providerFor text features", () => {
  it("follows the Review every take switch", async () => {
    mockPrefs.cloudReviewOn = false;
    expect(await providerFor("summary_notes", { hasVideo: false })).toBeNull();
    mockPrefs.cloudReviewOn = true;
    expect(await providerFor("summary_notes", { hasVideo: false })).toMatchObject({ transport: "hosted" });
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
    mockPrefs = { provider: "anthropic", cloudReviewOn: true, consent: ["anthropic"] };
    expect(await whyNoDeepReview()).toMatch(/Add a Anthropic Claude key|Anthropic Claude key/);
    mockPrefs.consent = [];
    expect(await whyNoDeepReview()).toMatch(/haven't been allowed/);
  });
});
