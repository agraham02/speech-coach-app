import { coachingSource, routeFor, type RouteState, type TonoAvailability } from "../aiRouting";

const ready: RouteState = {
  cloudReviewOn: true,
  hasVideo: true,
  tono: { signedIn: true, consent: true, allowed: { review: true, text: true, insight: true } },
  ownKeyProvider: null,
};

type Patch = Partial<Omit<RouteState, "tono">> & { tono?: Partial<TonoAvailability> };

const s = (patch: Patch): RouteState => ({
  ...ready,
  ...patch,
  tono: { ...ready.tono, ...patch.tono },
});

describe("video_review", () => {
  it("uses Tono AI when signed in, allowed and consented", () => {
    expect(routeFor("video_review", ready)).toBe("tono");
  });

  it("needs sign-in, consent, the switch and allowance left", () => {
    expect(routeFor("video_review", s({ tono: { signedIn: false } }))).toBe("none");
    expect(routeFor("video_review", s({ tono: { consent: false } }))).toBe("none");
    expect(routeFor("video_review", s({ cloudReviewOn: false }))).toBe("none");
    expect(routeFor("video_review", s({ tono: { allowed: { review: false, text: true, insight: true } } }))).toBe("none");
  });

  it("falls through to the user's own key", () => {
    expect(routeFor("video_review", s({ tono: { allowed: { review: false, text: true, insight: true } }, ownKeyProvider: "gemini" }))).toBe("own_key");
    expect(routeFor("video_review", s({ tono: { signedIn: false }, ownKeyProvider: "openai" }))).toBe("own_key");
  });

  it("sends nothing when the review switch is off, even with a key", () => {
    expect(routeFor("video_review", s({ cloudReviewOn: false, ownKeyProvider: "gemini" }))).toBe("none");
  });

  it("cannot review a deleted video through Tono AI or Gemini, but a text provider can", () => {
    expect(routeFor("video_review", s({ hasVideo: false }))).toBe("none");
    expect(routeFor("video_review", s({ hasVideo: false, ownKeyProvider: "gemini" }))).toBe("none");
    expect(routeFor("video_review", s({ hasVideo: false, ownKeyProvider: "anthropic" }))).toBe("own_key");
  });
});

describe("coaching", () => {
  it("comes from the Tono review when one runs, with no extra call", () => {
    expect(routeFor("coaching", ready)).toBe("tono");
    expect(coachingSource(ready)).toBe("from_review");
  });

  it("is one text call when there is no video to review", () => {
    const noVideo = s({ hasVideo: false });
    expect(routeFor("coaching", noVideo)).toBe("tono");
    expect(coachingSource(noVideo)).toBe("text_call");
  });

  it("stays on the phone when Tono AI is unavailable", () => {
    for (const state of [s({ tono: { signedIn: false } }), s({ cloudReviewOn: false }), s({ tono: { allowed: { review: false, text: false, insight: false } } })]) {
      expect(routeFor("coaching", state)).toBe("on_device");
      expect(coachingSource(state)).toBe("on_device");
    }
  });

  it("an own-key review does not change where coaching comes from", () => {
    const own = s({ tono: { signedIn: false }, ownKeyProvider: "gemini" });
    expect(routeFor("coaching", own)).toBe("on_device");
  });

  it("uses a text call when only the review allowance is gone", () => {
    const noReviews = s({ tono: { allowed: { review: false, text: true, insight: true } } });
    expect(coachingSource(noReviews)).toBe("text_call");
  });
});

describe("text features", () => {
  it("prefer Tono AI, then the own key, then the phone", () => {
    expect(routeFor("summary_notes", ready)).toBe("tono");
    expect(routeFor("rewind_notes", s({ tono: { signedIn: false }, ownKeyProvider: "openai" }))).toBe("own_key");
    expect(routeFor("summary_notes", s({ tono: { signedIn: false } }))).toBe("on_device");
  });

  it("mark_up never goes to an own-key provider", () => {
    expect(routeFor("mark_up", ready)).toBe("tono");
    expect(routeFor("mark_up", s({ tono: { signedIn: false }, ownKeyProvider: "gemini" }))).toBe("on_device");
  });

  it("send nothing when the switch is off", () => {
    expect(routeFor("summary_notes", s({ cloudReviewOn: false, ownKeyProvider: "openai" }))).toBe("on_device");
  });
});

describe("insight", () => {
  it("is Tono AI or nothing", () => {
    expect(routeFor("insight", ready)).toBe("tono");
    expect(routeFor("insight", s({ tono: { allowed: { review: true, text: true, insight: false } } }))).toBe("none");
    expect(routeFor("insight", s({ ownKeyProvider: "gemini", tono: { signedIn: false } }))).toBe("none");
  });
});
