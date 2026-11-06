import { summarizeFeatures } from "../../dev/voiceLab";
import type { AudioFeatures } from "../../dsp/audioFeatures";
import type { TranscriptWord } from "../../sessionTypes";
import { READINGS } from "../readingTrust";
import { LAB_TESTS } from "../registry";
import type { LabOutcome, StepMeasure, StepMeasures } from "../types";
import {
  ENDING_SENTENCES,
  PACE_PASSAGE,
  PAUSE_PASSAGE,
  STRESS_SENTENCE,
  VOICE_TESTS,
  pauseMarks,
  wordCountOf,
} from "../voiceTests";
import { glideFeatures, phraseTake, pausedReading, sentenceTake, stressedSentence } from "./syntheticFeatures";

const test = (name: string) => {
  const t = VOICE_TESTS.find((e) => e.def.id === `voice.${name}`);
  if (!t) throw new Error(`no voice.${name}`);
  return t;
};
const run = (name: string, measures: StepMeasures): LabOutcome => test(name).evaluate(measures);

const measure = (stepId: string, features: AudioFeatures, extra: Partial<StepMeasure> = {}): StepMeasure => ({
  stepId,
  durationMs: features.durationMs,
  audio: { features, summary: summarizeFeatures(features) },
  ...extra,
});
const put = (...ms: StepMeasure[]): StepMeasures => Object.fromEntries(ms.map((m) => [m.stepId, m]));
const check = (o: LabOutcome, label: string) => o.checks.find((c) => c.label.startsWith(label));

describe("the voice test list", () => {
  it("has the nine tests, each with its bars, fallback and steps", () => {
    expect(VOICE_TESTS.map((t) => t.def.id)).toEqual([
      "voice.pitch_variety",
      "voice.pitch_glide",
      "voice.endings",
      "voice.volume_gain",
      "voice.volume_distance",
      "voice.emphasis",
      "voice.word_stress",
      "voice.pauses",
      "voice.pace",
    ]);
    for (const { def } of VOICE_TESTS) {
      expect(def.group).toBe("voice");
      expect(def.bars.length).toBeGreaterThan(0);
      expect(def.onFail.length).toBeGreaterThan(0);
      expect(def.steps.length).toBeGreaterThan(0);
      for (const s of def.steps) {
        expect(s.id.startsWith(def.id.replace("voice.", "") + ".")).toBe(true);
        expect(s.seconds).toBeGreaterThan(0);
        expect(s.instruction.length).toBeGreaterThan(10);
      }
    }
  });

  it("keeps step ids unique across tests", () => {
    const ids = VOICE_TESTS.flatMap((t) => t.def.steps.map((s) => s.id));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("is in the lab's registry and covers every voice test the readings wait on", () => {
    for (const t of VOICE_TESTS) expect(LAB_TESTS).toContain(t);
    const ids = new Set(VOICE_TESTS.map((t) => t.def.id));
    for (const r of Object.values(READINGS)) for (const id of r.tests) if (id.startsWith("voice.")) expect(ids.has(id)).toBe(true);
  });

  it("asks for words and a stopwatch where the plan says", () => {
    expect(test("word_stress").def.steps).toHaveLength(7);
    expect(test("word_stress").def.steps.every((s) => s.words === true)).toBe(true);
    expect(test("pauses").def.steps[0].words).toBe(true);
    expect(test("endings").def.steps[0].words).toBe(true);
    expect(test("pace").def.steps[0]).toMatchObject({ words: true, stopwatch: true });
    expect(test("volume_distance").def.steps.every((s) => s.capture === "face_take")).toBe(true);
    expect(test("pitch_variety").def.steps.map((s) => s.script)).toEqual(Array(3).fill(test("pitch_variety").def.steps[0].script));
  });

  it("says unclear, never pass or fail, with nothing recorded", () => {
    for (const t of VOICE_TESTS) {
      const o = t.evaluate({});
      expect(o.pass).toBeNull();
      expect(o.summary.length).toBeGreaterThan(5);
    }
  });

  it("gives the same answer for the same measures", () => {
    const m = put(measure("pitch_glide.slide", glideFeatures()));
    expect(run("pitch_glide", m)).toEqual(run("pitch_glide", m));
  });

  it("writes scripts the evaluators can follow", () => {
    expect(ENDING_SENTENCES.filter((s) => s.expect === "falling")).toHaveLength(5);
    expect(ENDING_SENTENCES.filter((s) => s.expect === "rising")).toHaveLength(5);
    const lasts = ENDING_SENTENCES.map((s) => s.text.replace(/[^\w ]/g, "").split(" ").pop());
    expect(new Set(lasts).size).toBe(10);
    for (const l of lasts) expect(ENDING_SENTENCES.map((s) => s.text).join(" ").split(new RegExp(`\\b${l}\\b`))).toHaveLength(2);
    expect(pauseMarks(PAUSE_PASSAGE)).toHaveLength(10);
    expect(PAUSE_PASSAGE).not.toMatch(/[.?!]/);
    expect(STRESS_SENTENCE.join(" ")).toBe("I didn't say she stole the money");
  });
});

describe("voice.pitch_variety", () => {
  const take = (wander: number, seed: number) => phraseTake({ wanderSt: wander, seed }).features;
  const good = put(
    measure("pitch_variety.flat", take(0.3, 1)),
    measure("pitch_variety.normal", take(1.2, 2)),
    measure("pitch_variety.lively", take(2.2, 3)),
  );

  it("passes when flat, normal and lively read apart", () => {
    const o = run("pitch_variety", good);
    expect(o.pass).toBe(true);
    expect(check(o, "Flat take range")?.pass).toBe(true);
    expect(check(o, "Order on within-phrase SD")?.pass).toBe(true);
    expect(o.numbers.flat_rangeSt).toBeLessThan(2.5);
    expect(o.numbers.lively_rangeSt as number).toBeGreaterThan(4.5);
    expect(o.numbers.lively_phraseSdSt as number).toBeGreaterThan(o.numbers.normal_phraseSdSt as number);
    expect(o.numbers.worstVoicedShare as number).toBeGreaterThan(0.6);
  });

  it("fails when the three reads sound the same", () => {
    const o = run("pitch_variety", put(measure("pitch_variety.flat", take(0.3, 1)), measure("pitch_variety.normal", take(0.3, 2)), measure("pitch_variety.lively", take(0.3, 3))));
    expect(o.pass).toBe(false);
    expect(check(o, "Lively take range")?.pass).toBe(false);
    expect(check(o, "Order on today's SD")?.pass).toBe(false);
    expect(o.summary).toMatch(/missed/);
  });

  it("fails when pitch is found in too few speech frames", () => {
    const sparse = take(2.2, 3);
    for (let i = 0; i < sparse.f0Hz.length; i++) if (i % 5 < 3) sparse.f0Hz[i] = 0;
    const o = run("pitch_variety", put(measure("pitch_variety.flat", take(0.3, 1)), measure("pitch_variety.normal", take(1.2, 2)), measure("pitch_variety.lively", sparse)));
    expect(o.pass).toBe(false);
    expect(check(o, "Pitch found")?.pass).toBe(false);
  });

  it("is unclear when a take is missing or has too little speech", () => {
    expect(run("pitch_variety", put(measure("pitch_variety.flat", take(0.3, 1)))).pass).toBeNull();
    const brief = phraseTake({ phrases: 1, wordsPerPhrase: 3 }).features;
    const o = run("pitch_variety", put(measure("pitch_variety.flat", brief), measure("pitch_variety.normal", take(1.2, 2)), measure("pitch_variety.lively", take(2.2, 3))));
    expect(o.pass).toBeNull();
    expect(o.summary).toMatch(/Too little speech/);
  });
});

describe("voice.pitch_glide", () => {
  it("passes a smooth rise", () => {
    const o = run("pitch_glide", put(measure("pitch_glide.slide", glideFeatures())));
    expect(o.pass).toBe(true);
    expect(o.numbers.riseSt as number).toBeGreaterThanOrEqual(7);
    expect(o.numbers.maxJumpSt as number).toBeLessThanOrEqual(6);
    expect(o.numbers.nonDecreasingShare as number).toBeGreaterThanOrEqual(0.85);
  });

  it("fails on octave jumps, and says when cleanup would have fixed them", () => {
    const o = run("pitch_glide", put(measure("pitch_glide.slide", glideFeatures({ octaveErrorsAtMs: [3000, 6500] }))));
    expect(o.pass).toBe(false);
    expect(check(o, "Largest frame-to-frame jump")?.pass).toBe(false);
    expect(o.numbers.cleanedPasses).toBe(true);
    expect(o.summary).toMatch(/passes after cleanup/);
  });

  it("fails a glide that goes nowhere", () => {
    const o = run("pitch_glide", put(measure("pitch_glide.slide", glideFeatures({ fromHz: 110, toHz: 130 }))));
    expect(o.pass).toBe(false);
    expect(check(o, "Total rise")?.pass).toBe(false);
  });

  it("fails a glide that wobbles down as often as up", () => {
    const wobble = glideFeatures({ jitterSt: 1.2 });
    expect(run("pitch_glide", put(measure("pitch_glide.slide", wobble))).pass).toBe(false);
  });

  it("is unclear with no recording or too little voice", () => {
    expect(run("pitch_glide", {}).pass).toBeNull();
    expect(run("pitch_glide", put(measure("pitch_glide.slide", glideFeatures({ seconds: 1 })))).pass).toBeNull();
  });
});

describe("voice.endings", () => {
  const shapes = ENDING_SENTENCES.map((s) => s.expect);
  const take = (list: ("falling" | "rising" | "flat")[]) => {
    const t = sentenceTake(list);
    // Give each sentence's last word the script's text.
    const words: TranscriptWord[] = t.words.map((w, i) => (i % 5 === 4 ? { ...w, text: ENDING_SENTENCES[Math.floor(i / 5)].text.split(" ").pop()! } : w));
    return { t, words };
  };

  it("passes when statements fall and questions rise", () => {
    const { t, words } = take(shapes);
    const o = run("endings", put(measure("endings.read", t.features, { words })));
    expect(o.pass).toBe(true);
    expect(o.numbers).toMatchObject({ sentencesFound: 10, right: 10, fallingRight: 5, risingRight: 5 });
  });

  it("fails when everything is read the same way", () => {
    const { t, words } = take(Array(10).fill("flat"));
    const o = run("endings", put(measure("endings.read", t.features, { words })));
    expect(o.pass).toBe(false);
    // Level statements aren't rising, so only the questions are wrong.
    expect(o.numbers.right).toBe(5);
    expect(o.numbers.statementsThatFell).toBe(0);
    expect(check(o, "Endings classified right")?.bar).toBe("at least 80%");
  });

  it("doesn't count a level statement as wrong", () => {
    const { t, words } = take(shapes.map((s) => (s === "falling" ? "flat" : s)));
    const o = run("endings", put(measure("endings.read", t.features, { words })));
    expect(o.pass).toBe(true);
    expect(o.numbers).toMatchObject({ right: 10, statementsThatFell: 0 });
  });

  it("leaves out an ending with no pitch to read", () => {
    const { t, words } = take(shapes);
    const f0Hz = t.features.f0Hz.slice();
    const end = words[4].endMs;
    for (let i = 0; i < f0Hz.length; i++) if (t.features.offsetMs + i * t.features.hopMs > end - 500 && t.features.offsetMs + i * t.features.hopMs < end + 400) f0Hz[i] = 0;
    const o = run("endings", put(measure("endings.read", { ...t.features, f0Hz }, { words })));
    expect(o.numbers).toMatchObject({ sentencesFound: 10, sentencesScored: 9, right: 9 });
    expect(o.pass).toBe(true);
  });

  it("fails at 70% and passes at 80%", () => {
    const swapped = (n: number) => shapes.map((s, i) => (i < n ? (s === "falling" ? "rising" : "falling") : s));
    const three = take(swapped(3));
    expect(run("endings", put(measure("endings.read", three.t.features, { words: three.words }))).pass).toBe(false);
    const two = take(swapped(2));
    expect(run("endings", put(measure("endings.read", two.t.features, { words: two.words }))).pass).toBe(true);
  });

  it("is unclear without a transcript or when the sentences cannot be found in it", () => {
    const { t, words } = take(shapes);
    expect(run("endings", put(measure("endings.read", t.features))).pass).toBeNull();
    expect(run("endings", put(measure("endings.read", t.features, { words: t.words }))).pass).toBeNull();
    expect(run("endings", put(measure("endings.read", t.features, { words: words.slice(0, 25) }))).pass).toBeNull();
  });
});

describe("voice.volume_gain", () => {
  const level = (id: string, db: number) => measure(id, phraseTake({ phrases: 1, wordsPerPhrase: 12, db }).features);

  it("passes when quiet, normal and loud are 15 dB apart in order", () => {
    const o = run("volume_gain", put(level("volume_gain.quiet", 42), level("volume_gain.normal", 55), level("volume_gain.loud", 68)));
    expect(o.pass).toBe(true);
    expect(o.numbers.quietToLoudDb as number).toBeGreaterThanOrEqual(15);
    expect(check(o, "Order")?.pass).toBe(true);
  });

  it("fails when the recording flattens the difference", () => {
    const o = run("volume_gain", put(level("volume_gain.quiet", 52), level("volume_gain.normal", 55), level("volume_gain.loud", 59)));
    expect(o.pass).toBe(false);
    expect(check(o, "Quiet to loud")?.pass).toBe(false);
    expect(o.summary).toMatch(/levelling/);
  });

  it("fails when the order is wrong even with enough spread", () => {
    const o = run("volume_gain", put(level("volume_gain.quiet", 60), level("volume_gain.normal", 42), level("volume_gain.loud", 70)));
    expect(o.pass).toBe(false);
    expect(check(o, "Order")?.pass).toBe(false);
  });

  it("is unclear when a take is missing or silent", () => {
    expect(run("volume_gain", put(level("volume_gain.normal", 55))).pass).toBeNull();
    const silent = measure("volume_gain.loud", glideFeatures({ seconds: 0.2 }));
    const o = run("volume_gain", put(level("volume_gain.quiet", 42), level("volume_gain.normal", 55), silent));
    expect(o.pass).toBeNull();
  });
});

describe("voice.volume_distance", () => {
  const level = (id: string, db: number, faceWidth?: number) => measure(id, phraseTake({ phrases: 1, wordsPerPhrase: 12, db }).features, faceWidth === undefined ? {} : { faceWidth });

  it("passes when the rise is about 6 dB and face size explains it", () => {
    const o = run("volume_distance", put(level("volume_distance.far", 50, 0.2), level("volume_distance.near", 56, 0.4)));
    expect(o.pass).toBe(true);
    expect(o.numbers.riseDb as number).toBeGreaterThanOrEqual(4);
    expect(o.numbers.faceCorrectionDb as number).toBeCloseTo(6, 0);
    expect(Math.abs(o.numbers.leftAfterCorrectionDb as number)).toBeLessThanOrEqual(2);
  });

  it("fails when the face-size correction does not explain the rise", () => {
    const o = run("volume_distance", put(level("volume_distance.far", 50, 0.3), level("volume_distance.near", 56, 0.3)));
    expect(o.pass).toBe(false);
    expect(check(o, "Rise coming closer")?.pass).toBe(true);
    expect(check(o, "Left after")?.pass).toBe(false);
  });

  it("fails when moving closer barely changes the level", () => {
    const o = run("volume_distance", put(level("volume_distance.far", 50, 0.2), level("volume_distance.near", 51, 0.4)));
    expect(o.pass).toBe(false);
    expect(check(o, "Rise coming closer")?.pass).toBe(false);
  });

  it("is unclear without face sizes (unless the rise already failed) or without levels", () => {
    expect(run("volume_distance", put(level("volume_distance.far", 50), level("volume_distance.near", 56))).pass).toBeNull();
    expect(run("volume_distance", put(level("volume_distance.far", 50), level("volume_distance.near", 51))).pass).toBe(false);
    expect(run("volume_distance", put(level("volume_distance.far", 50, 0.2))).pass).toBeNull();
  });
});

describe("the pitch variety export", () => {
  it("says where the frames sit, so far-out frames can be told from real range", () => {
    const f0Hz = new Float32Array(2000).fill(100);
    for (let i = 0; i < 200; i++) f0Hz[i] = 50;
    const confidence = new Float32Array(2000).fill(0.9);
    const speech = new Uint8Array(2000).fill(1);
    const features = { f0Hz, confidence, speech, hopMs: 10, offsetMs: 5, levelDb: new Float32Array(2000), peaks: new Int32Array(0) } as never;
    const summary = { rangeSemitones: 0, sdSemitones: 3, voicedSeconds: 20 } as never;
    const take = { audio: { features, summary } };
    const o = test("pitch_variety").evaluate({
      "pitch_variety.flat": { stepId: "pitch_variety.flat", durationMs: 20000, ...take },
      "pitch_variety.normal": { stepId: "pitch_variety.normal", durationMs: 20000, ...take },
      "pitch_variety.lively": { stepId: "pitch_variety.lively", durationMs: 20000, ...take },
    });
    expect(o.numbers.flat_farOutShare).toBe(0.1);
    expect(o.numbers.flat_medianHz).toBe(100);
    expect(o.numbers.flat_p1).toBe(-12);
  });
});

describe("voice.emphasis", () => {
  const passage = Array.from({ length: 40 }, (_, k) => (k % 2 ? "bridge" : "the"));
  const flat = stressedSentence(passage, []).features;
  const stressed = stressedSentence(passage, [3, 12, 21, 28, 35]).features;

  it("passes when stressing the key words lifts both numbers", () => {
    const o = run("emphasis", put(measure("emphasis.flat", flat), measure("emphasis.stressed", stressed)));
    expect(o.pass).toBe(true);
    expect(o.numbers.peakSdGainDb as number).toBeGreaterThanOrEqual(1);
    expect(o.numbers.standOutGain as number).toBeGreaterThanOrEqual(0.5);
  });

  it("fails when the stressed read is no different", () => {
    const o = run("emphasis", put(measure("emphasis.flat", flat), measure("emphasis.stressed", flat)));
    expect(o.pass).toBe(false);
    expect(o.checks.filter((c) => c.pass === false)).toHaveLength(2);
  });

  it("reports each number on its own", () => {
    // Louder on a few words only: today's number rises; the checks are listed separately.
    const loudOnly = stressedSentence(passage, [3, 12, 21, 28, 35], { loudDb: 6 }).features;
    const o = run("emphasis", put(measure("emphasis.flat", flat), measure("emphasis.stressed", loudOnly)));
    expect(check(o, "Syllable-peak spread")?.pass).toBe(true);
    expect(o.numbers.standOutGain).toBeDefined();
  });

  it("is unclear when a read is missing or has too few peaks", () => {
    expect(run("emphasis", put(measure("emphasis.flat", flat))).pass).toBeNull();
    const few = stressedSentence(["a", "b", "c"], [1]).features;
    expect(run("emphasis", put(measure("emphasis.flat", flat), measure("emphasis.stressed", few))).pass).toBeNull();
  });
});

describe("voice.word_stress", () => {
  const read = (k: number, stressedIndex: number) => {
    const r = stressedSentence(STRESS_SENTENCE, [stressedIndex]);
    return measure(`word_stress.${k + 1}`, r.features, { words: r.words });
  };
  const all = (stressedAt: (k: number) => number) => STRESS_SENTENCE.map((_, k) => read(k, stressedAt(k)));

  it("passes when the stressed word has the strongest peak in every read", () => {
    const o = run("word_stress", put(...all((k) => k)));
    expect(o.pass).toBe(true);
    expect(o.numbers).toMatchObject({ readsScored: 7, hits: 7 });
    expect(o.numbers.read5_strongest).toBe("stole");
  });

  it("fails when the app keeps finding the same word", () => {
    const o = run("word_stress", put(...all(() => 0)));
    expect(o.pass).toBe(false);
    expect(o.numbers.hits).toBe(1);
    expect(o.checks.some((c) => c.label === 'Stressed "money"' && c.value.includes('"I"'))).toBe(true);
  });

  it("counts a read it cannot score as unknown, not as a miss", () => {
    const reads = all((k) => k);
    expect(run("word_stress", put(...reads.slice(0, 5))).pass).toBe(true); // 5 hits, 2 missing
    expect(run("word_stress", put(...reads.slice(0, 4))).pass).toBeNull(); // 4 hits, 3 missing: could still reach 5
    const wrongTwo = all((k) => (k < 2 ? 6 : k)); // reads 1 and 2 wrong: 5 hits of 7
    expect(run("word_stress", put(...wrongTwo)).pass).toBe(true);
    const wrongThree = all((k) => (k < 3 ? 6 : k)); // 4 hits
    expect(run("word_stress", put(...wrongThree)).pass).toBe(false);
    const oneHitThreeMissing = all((k) => (k > 0 ? 6 : k)).slice(0, 4); // 1 hit, 3 missing: 4 at best
    expect(run("word_stress", put(...oneHitThreeMissing)).pass).toBe(false);
  });

  it("is unclear with no reads, or reads without a transcript", () => {
    expect(run("word_stress", {}).pass).toBeNull();
    const noWords = STRESS_SENTENCE.map((_, k) => measure(`word_stress.${k + 1}`, stressedSentence(STRESS_SENTENCE, [k]).features));
    expect(run("word_stress", put(...noWords)).pass).toBeNull();
  });
});

describe("voice.pauses", () => {
  const tokens = PAUSE_PASSAGE.split(/\s+/);
  const words = tokens.filter((t) => t !== "[pause]");
  const markIdx = tokens.flatMap((t, i) => (t === "[pause]" ? [tokens.slice(0, i).filter((x) => x !== "[pause]").length - 1] : []));
  const reading = (heard: (n: number) => boolean, extra: number[] = []) => {
    const pauses: Record<number, { ms: number; heard?: boolean }> = {};
    markIdx.forEach((i, n) => (pauses[i] = { ms: 900, heard: heard(n) }));
    for (const i of extra) pauses[i] = { ms: 700 };
    return pausedReading(words, pauses);
  };
  const measureOf = (r: ReturnType<typeof reading>) => put(measure("pauses.read", r.features, { words: r.words }));

  it("passes when the marked pauses are found and nothing else is", () => {
    const o = run("pauses", measureOf(reading(() => true)));
    expect(o.pass).toBe(true);
    expect(o.numbers).toMatchObject({ marked: 10, markedWordsFound: 10, energyFound: 10, energyFalse: 0, mergedFound: 10, mergedFalse: 0 });
  });

  it("passes on Whisper's gaps when the energy detector misses pauses", () => {
    const o = run("pauses", measureOf(reading((n) => n % 2 === 0 && n < 8 ? true : n === 9)));
    expect(o.numbers.energyFound).toBe(5);
    expect(o.pass).toBe(true);
    expect(check(o, "Marked pauses found (energy detector alone)")?.pass).toBeNull();
    expect(o.numbers.mergedFound).toBe(10);
    expect(o.numbers.mergedPasses).toBe(true);
  });

  it("fails when neither the energy detector nor Whisper hears the pauses", () => {
    const r = reading(() => false);
    const noGaps = r.words.map((w, i) => ({ ...w, endMs: i + 1 < r.words.length ? r.words[i + 1].startMs : w.endMs }));
    const o = run("pauses", put(measure("pauses.read", r.features, { words: noGaps })));
    expect(o.numbers.mergedFound).toBe(0);
    expect(o.pass).toBe(false);
    expect(check(o, "Marked pauses found (energy plus Whisper gaps)")?.pass).toBe(false);
  });

  it("fails on more than two false pauses", () => {
    const o = run("pauses", measureOf(reading(() => true, [5, 30, 60])));
    expect(o.numbers.mergedFalse).toBe(3);
    expect(o.pass).toBe(false);
    expect(check(o, "False pauses (energy plus Whisper gaps)")?.pass).toBe(false);
    const two = run("pauses", measureOf(reading(() => true, [5, 30])));
    expect(two.pass).toBe(true);
  });

  it("allows 2 missed pauses", () => {
    const o = run("pauses", measureOf(reading((n) => n >= 2)));
    expect(o.numbers.energyFound).toBe(8);
    expect(o.pass).toBe(true);
  });

  it("is unclear without a recording, a transcript, or the marked words in it", () => {
    expect(run("pauses", {}).pass).toBeNull();
    const r = reading(() => true);
    expect(run("pauses", put(measure("pauses.read", r.features))).pass).toBeNull();
    const wrong = r.words.map((w, i) => ({ ...w, text: `x${i}` }));
    const o = run("pauses", put(measure("pauses.read", r.features, { words: wrong })));
    expect(o.pass).toBeNull();
    expect(o.summary).toMatch(/marked words/);
  });
});

describe("voice.pace", () => {
  const count = wordCountOf(PACE_PASSAGE);
  const spoken = (fromMs: number, toMs: number): TranscriptWord[] =>
    Array.from({ length: count }, (_, i) => ({ text: `w${i}`, startMs: Math.round(fromMs + ((toMs - fromMs) * i) / count), endMs: Math.round(fromMs + ((toMs - fromMs) * (i + 0.9)) / count) }));
  const step = (extra: Partial<StepMeasure>): StepMeasures => put({ stepId: "pace.read", durationMs: 50000, ...extra });

  it("counts the passage's words", () => {
    expect(count).toBeGreaterThan(90);
    expect(count).toBeLessThan(130);
  });

  it("passes within 5% of the stopwatch", () => {
    const o = run("pace", step({ stopwatchMs: 45000, words: spoken(600, 44400) }));
    expect(o.pass).toBe(true);
    expect(Math.abs(o.numbers.differencePercent as number)).toBeLessThan(5);
    expect(o.numbers.passageWords).toBe(count);
  });

  it("doesn't count a lead-in before the first word", () => {
    // Whisper's first word sits at the top of the clip; the voice starts 3 s in.
    const lead = spoken(0, 42500);
    lead[0] = { ...lead[0], startMs: 0 };
    const speech = new Uint8Array(4300);
    for (let i = 300; i < 4250; i++) speech[i] = 1;
    const audio = { features: { speech, hopMs: 10, offsetMs: 5 } as never, summary: {} as never };
    const o = run("pace", step({ stopwatchMs: 39557, words: lead, audio }));
    expect(o.pass).toBe(true);
    expect(o.numbers.withoutLineUpWpm as number).toBeLessThan(o.numbers.transcriptWpm as number);
  });

  it("fails when the transcript's timing disagrees with the stopwatch", () => {
    const o = run("pace", step({ stopwatchMs: 45000, words: spoken(600, 30000) }));
    expect(o.pass).toBe(false);
    expect(o.summary).toMatch(/faster/);
    expect(run("pace", step({ stopwatchMs: 30000, words: spoken(600, 44400) })).summary).toMatch(/slower/);
  });

  it("is unclear without a stopwatch time, a transcript, or enough of either", () => {
    expect(run("pace", {}).pass).toBeNull();
    expect(run("pace", step({ words: spoken(600, 44400) })).pass).toBeNull();
    expect(run("pace", step({ stopwatchMs: 5000, words: spoken(600, 4400) })).pass).toBeNull();
    expect(run("pace", step({ stopwatchMs: 45000 })).pass).toBeNull();
    expect(run("pace", step({ stopwatchMs: 45000, words: [{ text: "hi", startMs: 0, endMs: 300 }] })).pass).toBeNull();
  });
});
