import { ageGated, routeAnalysis, SUPPORTED, tonoInputFor, whatCanShow } from "../analysis/routing";
import { producerName, provenanceLabel, rulesProvenance } from "../analysis/provenance";
import type { AnalysisContext, AnalysisKind } from "../analysis/types";

const ctx = (patch: Partial<AnalysisContext> = {}): AnalysisContext => ({
  tier: "plus",
  tono: { consent: true, allowed: { take: true, text: true, insight: true }, killSwitch: false },
  isAdult: true,
  minorsMayUseAi: false,
  takeOptIn: true,
  judgeInput: "text",
  hasVideo: true,
  hasTranscript: true,
  flags: {},
  ...patch,
});
const tono = (patch: Partial<AnalysisContext["tono"]>) => ({ ...ctx().tono, ...patch });
const EXERCISES: AnalysisKind[] = ["rewind_notes", "word_chain", "bridge_chain", "summary_notes"];

describe("routeAnalysis", () => {
  it("sends a take review to Tono AI, from the transcript and measurements by default", () => {
    expect(routeAnalysis("take_review", ctx())).toEqual({ producers: ["tono_ai"], blocked: null, tonoInput: "text" });
  });

  it("sends the video when that's the setting, or when there's no transcript", () => {
    expect(routeAnalysis("take_review", ctx({ judgeInput: "video" })).tonoInput).toBe("video");
    expect(tonoInputFor(ctx({ hasTranscript: false }))).toBe("video");
    expect(routeAnalysis("take_review", ctx({ hasTranscript: false, hasVideo: false }))).toMatchObject({ producers: [], blocked: "no_input" });
  });

  it("counts a judged take as one take, whatever is sent", () => {
    const noTakes = tono({ allowed: { take: false, text: true, insight: true } });
    expect(routeAnalysis("take_review", ctx({ tono: noTakes }))).toMatchObject({ producers: [], blocked: "quota" });
    expect(routeAnalysis("take_review", ctx({ judgeInput: "video", tono: noTakes }))).toMatchObject({ producers: [], blocked: "quota" });
    // Exercise notes don't spend judged takes.
    expect(routeAnalysis("rewind_notes", ctx({ tono: noTakes })).producers).toEqual(["tono_ai"]);
    expect(routeAnalysis("take_review", ctx({ tono: tono({ allowed: { take: true, text: false, insight: true } }) })).producers).toEqual(["tono_ai"]);
  });

  it("respects the per-take switch", () => {
    expect(routeAnalysis("take_review", ctx({ takeOptIn: false }))).toEqual({ producers: [], blocked: "opted_out" });
    // Marking a script falls back to the rules, which never send anything.
    expect(routeAnalysis("mark_up", ctx({ takeOptIn: false }))).toEqual({ producers: ["rules"], blocked: "opted_out" });
  });

  it("says why Tono AI was left out", () => {
    expect(routeAnalysis("take_review", ctx({ tono: tono({ consent: false }) })).blocked).toBe("no_consent");
    expect(routeAnalysis("take_review", ctx({ tono: tono({ killSwitch: true }) })).blocked).toBe("kill_switch");
  });

  it("is Tono AI only: there is no own key any more", () => {
    for (const kind of Object.keys(SUPPORTED) as AnalysisKind[]) {
      expect(SUPPORTED[kind]).not.toContain("own_key");
    }
  });

  it("always coaches with the rules: a judged coach card comes with the take review", () => {
    expect(routeAnalysis("coaching", ctx({ takeOptIn: false, tier: "free" }))).toEqual({ producers: ["rules"], blocked: null });
  });

  it("honours a forced producer only for kinds it supports", () => {
    expect(routeAnalysis("mark_up", ctx({ flags: { forceProducer: "rules" } })).producers).toEqual(["rules"]);
    expect(routeAnalysis("take_review", ctx({ flags: { forceProducer: "rules" } }))).toEqual({ producers: [], blocked: "unsupported" });
  });

  it("never routes a kind to a producer that can't make it", () => {
    for (const kind of Object.keys(SUPPORTED) as AnalysisKind[]) {
      for (const p of routeAnalysis(kind, ctx()).producers) expect(SUPPORTED[kind]).toContain(p);
    }
  });
});

describe("the tiers", () => {
  it("lets a free user have their monthly judged take", () => {
    expect(routeAnalysis("take_review", ctx({ tier: "free" })).producers).toEqual(["tono_ai"]);
  });

  it("keeps exercise judging and mark-ups for Plus, the trial and testers", () => {
    for (const kind of [...EXERCISES, "mark_up"] as AnalysisKind[]) {
      expect(routeAnalysis(kind, ctx({ tier: "free" })).blocked).toBe("not_entitled");
      for (const tier of ["trial", "plus", "beta"] as const) expect(routeAnalysis(kind, ctx({ tier })).producers[0]).toBe("tono_ai");
    }
    // Mark it up still works for free users: the rules mark the text.
    expect(routeAnalysis("mark_up", ctx({ tier: "free" })).producers).toEqual(["rules"]);
  });
});

describe("the age answer", () => {
  it("keeps Tono AI off for under-18s while the server's policy says so", () => {
    expect(ageGated({ isAdult: false, minorsMayUseAi: false })).toBe(true);
    expect(routeAnalysis("take_review", ctx({ isAdult: false })).blocked).toBe("age_gate");
    expect(routeAnalysis("mark_up", ctx({ isAdult: false })).producers).toEqual(["rules"]);
  });

  it("follows the server when it allows minors, and never blocks on an unanswered question", () => {
    expect(routeAnalysis("take_review", ctx({ isAdult: false, minorsMayUseAi: true })).producers).toEqual(["tono_ai"]);
    expect(routeAnalysis("take_review", ctx({ isAdult: null })).producers).toEqual(["tono_ai"]);
  });
});

describe("whatCanShow", () => {
  it("is judged when Tono AI will judge, locked when Plus or the trial would, facts otherwise", () => {
    expect(whatCanShow("take_review", ctx())).toBe("judged");
    expect(whatCanShow("coaching", ctx())).toBe("judged");
    // A free user who used the month's free judged take.
    expect(whatCanShow("take_review", ctx({ tier: "free", tono: tono({ allowed: { take: false, text: false, insight: false } }) }))).toBe("locked");
    for (const kind of EXERCISES) expect(whatCanShow(kind, ctx({ tier: "free" }))).toBe("locked");
    // A choice, a subscriber who used their count, or an under-18: nothing to sell.
    expect(whatCanShow("take_review", ctx({ takeOptIn: false }))).toBe("facts");
    expect(whatCanShow("take_review", ctx({ tier: "plus", tono: tono({ allowed: { take: false, text: true, insight: true } }) }))).toBe("facts");
    expect(whatCanShow("rewind_notes", ctx({ tier: "free", isAdult: false }))).toBe("facts");
  });
});

describe("provenance labels", () => {
  it("label honestly from who made a result and from what", () => {
    expect(provenanceLabel(rulesProvenance())).toBe("From measurements made on this phone.");
    expect(provenanceLabel({ producer: "tono_ai", provider: "Tono AI", model: "gemini-3.5-flash-lite", promptVersion: "p", judged: true, input: "text", at: "" })).toBe(
      "Judged by Tono AI (gemini-3.5-flash-lite) from your words and your phone's measurements.",
    );
    expect(provenanceLabel({ producer: "tono_ai", provider: "Tono AI", promptVersion: "p", judged: true, input: "video", at: "" })).toMatch(/after watching your take/);
    expect(producerName(null)).toBe("This phone");
  });
});
