import { DEFAULT_CONFIG } from "../../../supabase/functions/_shared/config";
import { QUESTIONS } from "../../content/onboarding";
import { allowanceLine, conversationMinutesLine, usedUpLine, usesOneLine } from "../aiAllowance";
import { acceptJudgedReview } from "../analysis/judgedReview";
import { DEMO_CHAINS, DEMO_REWINDS, DEMO_TAKES, PASSAGES, buildWords, demoSessionId, isDemoId, recordedAtFor, synthFace, synthFeatures, verbatimOf, withFillers, rawReview } from "../dev/demoTakes";
import { TIER_TOTALS, configForTier, describeMock, mockPlans, mockSnapshot, parseMockConfig } from "../dev/mockAccount";
import { AGE_CHOICES, standardProfile } from "../dev/statePresets";
import { checkRewindReview } from "../rewind/reviewPrompt";
import { defaultsFromProfile, isAdultFromAge } from "../profile";
import { pausesFromFeatures } from "../dsp/pauses";
import { loudnessStatsOf, pitchStatsOf } from "../signals/audioSummary";
import { buyLabel, trialLine } from "../plus";
import { computePresenceMetrics } from "../presenceMetrics";
import { cleanTranscript } from "../cleanTranscript";
import { computeFillerStats } from "../transcriptAnnotations";

// The builders behind the Dev tab's test helpers: demo takes, the mock account
// and state presets. They are pure, so the checks are quick; the pieces that
// write to SQLite are in services/dev/__tests__/seedDemo.test.ts.

describe("demo take words and audio", () => {
  const spec = DEMO_TAKES.find((t) => t.key === "lively")!;

  it("gives words with increasing times, ending inside the take", () => {
    const { words, durationMs, sentenceEnds } = buildWords(spec.speech, spec.seed);
    expect(words.length).toBeGreaterThan(80);
    expect(sentenceEnds).toHaveLength(spec.speech.sentences.length);
    for (let i = 1; i < words.length; i++) {
      expect(words[i].startMs).toBeGreaterThanOrEqual(words[i - 1].endMs);
      expect(words[i].endMs).toBeGreaterThan(words[i].startMs);
    }
    expect(words[words.length - 1].endMs).toBeLessThan(durationMs);
  });

  it("is deterministic", () => {
    expect(buildWords(spec.speech, spec.seed)).toEqual(buildWords(spec.speech, spec.seed));
    expect(withFillers(PASSAGES.bread, 0.5, 2)).toEqual(withFillers(PASSAGES.bread, 0.5, 2));
  });

  it("makes frames the real summarizers read like a speaking voice", () => {
    const { words, durationMs } = buildWords(spec.speech, spec.seed);
    const f = synthFeatures(words, durationMs, spec.voice, spec.seed);
    expect(f.f0Hz.length).toBe(Math.floor(durationMs / 10));
    const pitch = pitchStatsOf(f)!;
    expect(pitch.voicedSeconds).toBeGreaterThan(20);
    expect(pitch.medianHz!).toBeGreaterThan(110);
    expect(pitch.medianHz!).toBeLessThan(150);
    expect(loudnessStatsOf(f)!.snrDb).toBeGreaterThan(12);
    const pauses = pausesFromFeatures(f, words);
    expect(pauses.pauses.length).toBeGreaterThanOrEqual(5);
    expect(pauses.boundaryPauseRate).toBeGreaterThan(0.8);
  });

  it("makes a flat voice flat and a silent one silent", () => {
    const flat = DEMO_TAKES.find((t) => t.key === "flat")!;
    const quiet = DEMO_TAKES.find((t) => t.key === "silent")!;
    const w1 = buildWords(flat.speech, flat.seed);
    expect(pitchStatsOf(synthFeatures(w1.words, w1.durationMs, flat.voice, flat.seed))!.rangeSemitones!).toBeLessThan(2);
    const w2 = buildWords(quiet.speech, quiet.seed);
    const silent = synthFeatures(w2.words, w2.durationMs, quiet.voice, quiet.seed);
    expect(pitchStatsOf(silent)).toBeNull();
    expect(loudnessStatsOf(silent)).toBeNull();
  });

  it("counts the fillers it writes", () => {
    const spec2 = DEMO_TAKES.find((t) => t.key === "fillers")!;
    const { words, durationMs } = buildWords(spec2.speech, spec2.seed);
    const stats = computeFillerStats(verbatimOf(words), durationMs / 1000);
    expect(stats.hesitation.count).toBeGreaterThanOrEqual(8);
    expect(stats.contextual.count).toBeGreaterThanOrEqual(2);
    expect(cleanTranscript(verbatimOf(words)).length).toBeLessThan(verbatimOf(words).length);
  });

  it("makes a face track the real presence metrics read, lively against still", () => {
    const lively = computePresenceMetrics(synthFace(40_000, { onLens: 0.8, lively: true }, 1))!;
    const still = computePresenceMetrics(synthFace(40_000, { onLens: 0.35, lively: false }, 1))!;
    expect(lively.eyeContactPercent).toBeGreaterThan(still.eyeContactPercent + 25);
    expect(lively.expressiveness).toBeGreaterThan(still.expressiveness + 15);
    expect(lively.detectionRateHz).toBeGreaterThan(12);
  });
});

describe("demo set", () => {
  it("covers the cases the test plan needs", () => {
    const keys = DEMO_TAKES.map((t) => t.key);
    expect(keys).toEqual(expect.arrayContaining(["free-measured", "judged", "flat", "lively", "fillers", "very-short", "silent"]));
    expect(DEMO_TAKES.filter((t) => t.judged).length).toBeGreaterThanOrEqual(2);
    expect(DEMO_TAKES.some((t) => t.sessionType === "concise")).toBe(true);
    // Six days in a row ending today, and months back.
    const days = new Set(DEMO_TAKES.map((t) => t.daysAgo));
    for (let d = 0; d <= 5; d++) expect(days.has(d)).toBe(true);
    expect(Math.max(...DEMO_TAKES.map((t) => t.daysAgo))).toBeGreaterThan(100);
    expect(DEMO_REWINDS.some((r) => r.notes)).toBe(true);
    expect(DEMO_CHAINS.map((c) => c.drill).sort()).toEqual(["chain_bridge", "word_chain"]);
  });

  it("uses unique keys and ids that the removal can tell from real ones", () => {
    const ids = DEMO_TAKES.map((t) => demoSessionId(t.key));
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.every(isDemoId)).toBe(true);
    expect(isDemoId("1abc-xyz")).toBe(false);
  });

  it("never places a take in the future", () => {
    const now = new Date("2026-10-24T05:30:00");
    for (const t of DEMO_TAKES) expect(new Date(recordedAtFor(t.daysAgo, t.hour, now)).getTime()).toBeLessThanOrEqual(now.getTime());
  });

  it("has judged answers that pass the real review schema with every annotation located", () => {
    for (const spec of DEMO_TAKES.filter((t) => t.judged)) {
      const { words } = buildWords(spec.speech, spec.seed);
      const verbatim = verbatimOf(words);
      const review = acceptJudgedReview(rawReview(spec.judged!, cleanTranscript(verbatim)), { kind: "impromptu", transcript: verbatim });
      expect(review).not.toBeNull();
      expect(review!.annotations).toHaveLength(spec.judged!.annotations.length);
    }
  });

  it("has Rewind notes that pass the real Rewind check", () => {
    for (const spec of DEMO_REWINDS.filter((r) => r.notes)) {
      const transcript = verbatimOf(buildWords(spec.speech, 40 + spec.seconds).words);
      const checked = checkRewindReview(spec.notes, transcript, { final: true });
      expect(checked.ok).toBe(true);
    }
  });
});

describe("the mock account", () => {
  const SERVER = DEFAULT_CONFIG.limits;

  it("uses the counts the server grants for each tier", () => {
    expect(TIER_TOTALS.free).toEqual({ takes: SERVER.freeMonthlyJudgedTakes, conversationMinutes: SERVER.freeMonthlyConversationMinutes });
    expect(TIER_TOTALS.beta).toEqual({ takes: SERVER.betaMonthlyJudgedTakes, conversationMinutes: SERVER.betaMonthlyConversationMinutes });
    expect(TIER_TOTALS.trial).toEqual({ takes: SERVER.trialJudgedTakes, conversationMinutes: SERVER.trialConversationMinutes });
    expect(TIER_TOTALS.plus).toEqual({ takes: SERVER.plusMonthlyJudgedTakes, conversationMinutes: SERVER.plusMonthlyConversationMinutes });
  });

  it("builds a signed-out free snapshot with no allowance", () => {
    const s = mockSnapshot(configForTier("free"));
    expect(s).toMatchObject({ status: "signedOut", userId: null, allowance: null, killSwitch: false, minorsMayUseAi: false });
  });

  it("builds free, trial, plus and beta allowances that the app's own wording reads", () => {
    const free = mockSnapshot(configForTier("free", { signIn: "anonymous" })).allowance!;
    expect(allowanceLine(free)).toMatch(/free judged take/);
    expect(usesOneLine(free)).toBe("Uses your free judged take for this month.");

    const used = mockSnapshot(configForTier("free", { signIn: "anonymous", takesLeft: 0 }));
    expect(used.allowed.take).toBe(false);
    expect(usedUpLine(used.allowance!)).toMatch(/You've used this month's free judged take\. The next one comes on 1 /);

    const trial = mockSnapshot(configForTier("trial")).allowance!;
    expect(trial).toMatchObject({ plan: "trial", tier: "trial", takesTotal: 20 });
    expect(trial.trialEndsAt).not.toBeNull();
    expect(allowanceLine(trial)).toMatch(/left in your trial · free until/);

    const plus = mockSnapshot(configForTier("plus", { takesLeft: 0, conversationMinutesLeft: 0 }));
    expect(plus.allowance!.plan).toBe("plus");
    expect(plus.allowed).toMatchObject({ take: false, conversation: false });
    expect(conversationMinutesLine(plus.allowance)).toMatch(/No conversation minutes left this month/);

    const beta = mockSnapshot(configForTier("beta")).allowance!;
    expect(beta).toMatchObject({ plan: "free", tier: "beta", takesTotal: 15 });
  });

  it("clamps the counts to the tier", () => {
    const a = mockSnapshot(configForTier("free", { signIn: "anonymous", takesLeft: 50, conversationMinutesLeft: 9 })).allowance!;
    expect(a.takesLeft).toBe(1);
    expect(a.conversationMinutesLeft).toBe(0);
  });

  it("carries the server switches", () => {
    const s = mockSnapshot(configForTier("plus", { killSwitch: true, minorsMayUseAi: true, plusPurchasable: false, mode: "beta" }));
    expect(s).toMatchObject({ killSwitch: true, minorsMayUseAi: true, plusPurchasable: false, mode: "beta" });
    expect(describeMock(configForTier("plus", { killSwitch: true, serverUnreachable: true }))).toMatch(/Tono Plus.*kill switch.*server unreachable/);
  });

  it("reads back what it stored and drops anything odd", () => {
    const stored = JSON.parse(JSON.stringify(configForTier("trial", { takesLeft: 3 })));
    expect(parseMockConfig(stored)).toEqual(configForTier("trial", { takesLeft: 3 }));
    expect(parseMockConfig({ tier: "gold" })).toBeNull();
    expect(parseMockConfig("x")).toBeNull();
    expect(parseMockConfig({ tier: "plus", takesLeft: "many" })!.takesLeft).toBe(60);
  });

  it("makes paywall prices through the real plan builder", () => {
    const withTrial = mockPlans("trial")!;
    expect(withTrial.map((p) => p.id)).toEqual(["annual", "monthly"]);
    expect(buyLabel(withTrial[0])).toBe("Start 14-day free trial");
    expect(trialLine(withTrial[0])).toBe("14 days free, then $49.99 a year");
    const without = mockPlans("no_trial")!;
    expect(buyLabel(without[0])).toBe("Subscribe for $49.99 / year");
    expect(mockPlans("failed")).toBeNull();
  });
});

describe("state presets", () => {
  it("builds the profile the last onboarding question and setup check leave", () => {
    const profile = standardProfile({ age: "adult", today: "2026-10-24", now: new Date("2026-10-24T10:00:00Z") });
    expect(profile.onboardingStep).toBe(QUESTIONS.length);
    expect(profile.onboardingCompletedAt).toBe("2026-10-24T10:00:00.000Z");
    expect(profile.startedAt).toBe("2026-10-24");
    // What the questions require is answered.
    expect(profile.contexts.length).toBeGreaterThan(0);
    expect(profile.obstacles.length).toBeGreaterThan(0);
    expect(profile.speakingComfort).toBeDefined();
    expect(profile.videoComfort).toBeDefined();
    expect(profile.experience).toBeDefined();
    expect(profile.practicePlace).toBeDefined();
    // No warm-up (the standard answers avoid Nerves) and the face stays on screen.
    expect(defaultsFromProfile(profile)).toMatchObject({ warmUp: false, recordBlind: false, stutterMode: false });
  });

  it("maps each age choice to the answer the app reads", () => {
    const answer = (id: (typeof AGE_CHOICES)[number]["id"]) => isAdultFromAge(standardProfile({ age: id, today: "2026-10-24" }).ageRange);
    expect(answer("under_18")).toBe(false);
    expect(answer("adult")).toBe(true);
    expect(answer("unsaid")).toBeNull();
    expect(answer("skipped")).toBeNull();
    expect("ageRange" in standardProfile({ age: "skipped", today: "2026-10-24" })).toBe(false);
  });
});
