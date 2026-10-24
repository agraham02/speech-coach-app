import { routeAnalysis, SUPPORTED, tonoInputFor, whatCanShow } from "../analysis/routing";
import { producerName, provenanceLabel, rulesProvenance } from "../analysis/provenance";
import type { AnalysisContext } from "../analysis/types";

const ctx = (patch: Partial<AnalysisContext> = {}): AnalysisContext => ({
  wantsTono: true,
  tono: { signedIn: true, consent: true, allowed: { review: true, text: true, insight: true }, killSwitch: false },
  ownKey: null,
  takeOptIn: true,
  judgeInput: "text",
  hasVideo: true,
  hasTranscript: true,
  flags: {},
  ...patch,
});
const tono = (patch: Partial<AnalysisContext["tono"]>) => ({ ...ctx().tono, ...patch });

describe("routeAnalysis", () => {
  it("sends a take review to Tono AI, from the transcript and measurements by default", () => {
    expect(routeAnalysis("take_review", ctx())).toEqual({ producers: ["tono_ai"], blocked: null, tonoInput: "text" });
  });

  it("sends the video when that's the setting, or when there's no transcript", () => {
    expect(routeAnalysis("take_review", ctx({ judgeInput: "video" })).tonoInput).toBe("video");
    expect(tonoInputFor(ctx({ hasTranscript: false }))).toBe("video");
    expect(routeAnalysis("take_review", ctx({ hasTranscript: false, hasVideo: false }))).toMatchObject({ producers: [], blocked: "no_input" });
  });

  it("counts a text review against the text allowance and a video one against reviews", () => {
    expect(routeAnalysis("take_review", ctx({ tono: tono({ allowed: { review: false, text: true, insight: true } }) })).producers).toEqual(["tono_ai"]);
    expect(routeAnalysis("take_review", ctx({ judgeInput: "video", tono: tono({ allowed: { review: false, text: true, insight: true } }) }))).toMatchObject({ producers: [], blocked: "quota" });
  });

  it("respects the per-take switch", () => {
    expect(routeAnalysis("take_review", ctx({ takeOptIn: false }))).toEqual({ producers: [], blocked: "opted_out" });
    // Marking a script falls back to the rules, which never send anything.
    expect(routeAnalysis("mark_up", ctx({ takeOptIn: false }))).toEqual({ producers: ["rules"], blocked: "opted_out" });
  });

  it("says why Tono AI was left out", () => {
    expect(routeAnalysis("take_review", ctx({ tono: tono({ signedIn: false }) })).blocked).toBe("signed_out");
    expect(routeAnalysis("take_review", ctx({ tono: tono({ consent: false }) })).blocked).toBe("no_consent");
    expect(routeAnalysis("take_review", ctx({ tono: tono({ killSwitch: true }) })).blocked).toBe("kill_switch");
  });

  it("puts an own key after Tono AI, and only where it can work", () => {
    expect(routeAnalysis("summary_notes", ctx({ ownKey: "openai" })).producers).toEqual(["tono_ai", "own_key"]);
    // The exercise judges are Tono AI only.
    for (const kind of ["rewind_notes", "word_chain", "bridge_chain"] as const) {
      expect(routeAnalysis(kind, ctx({ ownKey: "openai" })).producers).toEqual(["tono_ai"]);
      expect(routeAnalysis(kind, ctx({ wantsTono: false, ownKey: "openai" }))).toMatchObject({ producers: [], blocked: "unsupported" });
      expect(whatCanShow(kind, ctx({ tono: tono({ signedIn: false }) }))).toBe("locked");
    }
    expect(routeAnalysis("take_review", ctx({ tono: tono({ signedIn: false }), ownKey: "gemini", hasVideo: false })).producers).toEqual([]);
    expect(routeAnalysis("take_review", ctx({ tono: tono({ signedIn: false }), ownKey: "openai" })).producers).toEqual(["own_key"]);
    expect(routeAnalysis("mark_up", ctx({ wantsTono: false, ownKey: "openai" })).producers).toEqual(["rules"]);
  });

  it("always coaches with the rules: a judged coach card comes with the take review", () => {
    expect(routeAnalysis("coaching", ctx({ takeOptIn: false, tono: tono({ signedIn: false }) }))).toEqual({ producers: ["rules"], blocked: null });
  });

  it("honours a forced producer only for kinds it supports", () => {
    expect(routeAnalysis("mark_up", ctx({ flags: { forceProducer: "rules" } })).producers).toEqual(["rules"]);
    expect(routeAnalysis("take_review", ctx({ flags: { forceProducer: "rules" } }))).toEqual({ producers: [], blocked: "unsupported" });
  });

  it("never routes a kind to a producer that can't make it", () => {
    for (const kind of Object.keys(SUPPORTED) as (keyof typeof SUPPORTED)[]) {
      for (const p of routeAnalysis(kind, ctx({ ownKey: "gemini" })).producers) expect(SUPPORTED[kind]).toContain(p);
    }
  });
});

describe("whatCanShow", () => {
  it("is judged when an AI will judge, locked when an account or Plus would, facts otherwise", () => {
    expect(whatCanShow("take_review", ctx())).toBe("judged");
    expect(whatCanShow("take_review", ctx({ tono: tono({ signedIn: false }) }))).toBe("locked");
    expect(whatCanShow("take_review", ctx({ tono: tono({ allowed: { review: true, text: false, insight: true } }) }))).toBe("locked");
    expect(whatCanShow("take_review", ctx({ takeOptIn: false }))).toBe("facts");
    expect(whatCanShow("coaching", ctx())).toBe("judged");
  });
});

describe("provenance labels", () => {
  it("label honestly from who made a result and from what", () => {
    expect(provenanceLabel(rulesProvenance())).toBe("From measurements made on this phone.");
    expect(provenanceLabel({ producer: "tono_ai", provider: "Tono AI", model: "gemini-3.5-flash-lite", promptVersion: "p", judged: true, input: "text", at: "" })).toBe(
      "Judged by Tono AI (gemini-3.5-flash-lite) from your words and your phone's measurements.",
    );
    expect(provenanceLabel({ producer: "tono_ai", provider: "Tono AI", promptVersion: "p", judged: true, input: "video", at: "" })).toMatch(/after watching your take/);
    expect(provenanceLabel({ producer: "own_key", provider: "OpenAI", promptVersion: "p", judged: true, input: "text", at: "" })).toMatch(/^Written by OpenAI with your own key/);
    expect(producerName(null)).toBe("This phone");
  });
});
