import { SPEECH, type AudioFeatures } from "../dsp/audioFeatures";
import { classifyEnding, terminalSlope, type EndingKind } from "../dsp/endings";
import { mergePauses } from "../dsp/pauseMerge";
import { pausesFromFeatures } from "../dsp/pauses";
import { cleanPitch } from "../dsp/pitchCleanup";
import { phrasePitchVariation } from "../dsp/phrasePitch";
import { percentile } from "../dsp/pitchTracker";
import { scoreSyllablePeaks, strongestWord } from "../dsp/stressCues";
import { normalizeWord } from "../speech/normalize";
import { speakingWpm } from "../signals/audioSummary";
import type { VoiceLabSummary } from "../dev/voiceLab";
import type { LabCheck, LabOutcome, LabStep, LabTestEntry, StepMeasures } from "./types";

// The Voice tests (docs/overhaul/PLAN.md, section 6.5, the "Voice" rows of the
// test table). Each entry is a definition plus a pure evaluator; the runner
// records the steps, and registry.ts lists them in the lab.
//
// How an evaluator decides. A check with a `bar` is decisive; a check without
// one is shown for information (usually the candidate formula next to today's
// number). The test fails as soon as one decisive check fails, passes when all
// pass, and is `null` ("unclear") when nothing failed but something could not
// be measured. Missing or thin measures never pass and never fail on a guess.
// Step ids are prefixed with the test's name, so a runner may keep every
// step's measures in one record.

// --- Shared pieces ---

type Numbers = LabOutcome["numbers"];
type Audio = { features: AudioFeatures; summary: VoiceLabSummary };

const round = (n: number, d = 1) => Math.round(n * 10 ** d) / 10 ** d;
const isNum = (n: number | null | undefined): n is number => typeof n === "number" && Number.isFinite(n);
const pct = (n: number) => `${Math.round(n * 100)}%`;
const db = (n: number) => `${round(n)} dB`;
const st = (n: number) => `${round(n)} st`;

const check = (label: string, value: string, pass: boolean | null, bar?: string): LabCheck => (bar === undefined ? { label, value, pass } : { label, value, pass, bar });

function decide(checks: LabCheck[]): boolean | null {
  const decisive = checks.filter((c) => c.bar !== undefined);
  if (decisive.some((c) => c.pass === false)) return false;
  if (decisive.length === 0 || decisive.some((c) => c.pass === null)) return null;
  return true;
}

function result(checks: LabCheck[], numbers: Numbers, passText: string, failText: (failed: LabCheck[]) => string, unclearText: string): LabOutcome {
  const pass = decide(checks);
  const failed = checks.filter((c) => c.bar !== undefined && c.pass === false);
  return { pass, checks, numbers, summary: pass === true ? passText : pass === false ? failText(failed) : unclearText };
}

const thin = (summary: string, numbers: Numbers = {}): LabOutcome => ({ pass: null, checks: [], summary, numbers });

const listFailed = (failed: LabCheck[]) => failed.map((c) => `${c.label.toLowerCase()} ${c.value}`).join("; ");

function audioOf(measures: StepMeasures, id: string): Audio | null {
  return measures[id]?.audio ?? null;
}

function speechSeconds(f: AudioFeatures): number {
  let n = 0;
  for (let i = 0; i < f.speech.length; i++) if (f.speech[i] === SPEECH) n++;
  return (n * f.hopMs) / 1000;
}

// Share of speech frames that have a pitch.
function voicedShare(f: AudioFeatures): number | null {
  let speech = 0;
  let voiced = 0;
  for (let i = 0; i < f.speech.length; i++) {
    if (f.speech[i] !== SPEECH) continue;
    speech++;
    if (f.f0Hz[i] > 0) voiced++;
  }
  return speech ? voiced / speech : null;
}

const semis = (hz: number, ref: number) => 12 * Math.log2(hz / ref);

// Words of a script as the lab compares them.
const norm = normalizeWord;

// --- 1. Pitch variety ---

const NEUTRAL_PARAGRAPH =
  "The town library opened a new reading room last spring. It has tall windows that face the garden, and long wooden tables where people spread out their books. " +
  "On weekday mornings it is mostly quiet, with a few students and a retired teacher who always sits by the radiator. " +
  "In the afternoon the children arrive after school, and a volunteer reads a story aloud near the shelves of picture books. " +
  "Once a month the library hosts a small market of used books, and the money goes toward repairing the roof. " +
  "Most visitors say they come for the calm, and many of them stay far longer than they planned.";

const PV = { flat: "pitch_variety.flat", normal: "pitch_variety.normal", lively: "pitch_variety.lively" } as const;
const PV_KEYS = ["flat", "normal", "lively"] as const;
const PV_MIN_SPEECH_SECONDS = 15;
const PV_STEP_UP = 1.15;

const pitchVarietyTest: LabTestEntry = {
  def: {
    id: "voice.pitch_variety",
    group: "voice",
    title: "Pitch variety",
    summary: "Read the same paragraph flat, normally and lively. Does the pitch reading tell them apart?",
    minutes: 4,
    steps: [
      {
        id: PV.flat,
        title: "Read it flat",
        instruction: "Read the paragraph in as flat and even a voice as you can, like a recording of a list. Keep going for the whole time.",
        script: NEUTRAL_PARAGRAPH,
        seconds: 50,
        capture: "take",
      },
      {
        id: PV.normal,
        title: "Read it normally",
        instruction: "Read the same paragraph the way you would to a friend.",
        script: NEUTRAL_PARAGRAPH,
        seconds: 50,
        capture: "take",
      },
      {
        id: PV.lively,
        title: "Read it lively",
        instruction: "Read the same paragraph as if telling a story to a room of children. Exaggerate the ups and downs.",
        script: NEUTRAL_PARAGRAPH,
        seconds: 50,
        capture: "take",
      },
    ],
    bars: [
      "Flat take: under 2.5 semitones of range",
      "Lively take: over 4.5 semitones of range",
      "Clear order flat < normal < lively on variation (each at least 15% above the last), on today's SD and on the within-phrase SD",
      "Pitch found for 60% or more of speech frames in every take",
    ],
    onFail: "SwiftF0 via Core ML",
  },
  evaluate(measures) {
    const takes = PV_KEYS.map((k) => {
      const a = audioOf(measures, PV[k]);
      return a ? { k, a, speech: speechSeconds(a.features) } : null;
    });
    const missing = PV_KEYS.filter((_, i) => !takes[i]);
    if (missing.length) return thin(`No recording for the ${missing.join(" and ")} take.`);
    const have = takes as NonNullable<(typeof takes)[number]>[];
    const short = have.filter((t) => t.speech < PV_MIN_SPEECH_SECONDS);
    if (short.length) return thin(`Too little speech in the ${short.map((t) => t.k).join(" and ")} take (${short.map((t) => `${round(t.speech)} s`).join(", ")}); read for the whole time.`);

    const rows = have.map((t) => ({
      k: t.k,
      range: t.a.summary.rangeSemitones,
      sd: t.a.summary.sdSemitones,
      voicedSeconds: t.a.summary.voicedSeconds,
      share: voicedShare(t.a.features),
      phrase: phrasePitchVariation(t.a.features),
    }));
    const [flat, normal, lively] = rows;

    const numbers: Numbers = {};
    for (const r of rows) {
      numbers[`${r.k}_rangeSt`] = r.range;
      numbers[`${r.k}_sdSt`] = r.sd;
      numbers[`${r.k}_voicedSeconds`] = r.voicedSeconds;
      numbers[`${r.k}_voicedShare`] = r.share === null ? null : round(r.share, 2);
      numbers[`${r.k}_phraseSdSt`] = r.phrase.weightedMeanSdSt;
      numbers[`${r.k}_phraseMedianSdSt`] = r.phrase.medianSdSt;
      numbers[`${r.k}_phraseRangeSt`] = r.phrase.weightedMeanRangeSt;
      numbers[`${r.k}_usablePhrases`] = r.phrase.usablePhrases;
    }

    const ordered = (a: number | null, b: number | null, c: number | null) => (isNum(a) && isNum(b) && isNum(c) ? b >= a * PV_STEP_UP && c >= b * PV_STEP_UP : null);
    const fmt = (a: number | null, b: number | null, c: number | null) => [a, b, c].map((n) => (isNum(n) ? round(n, 2) : "?")).join(" < ");
    const orderToday = ordered(flat.sd, normal.sd, lively.sd);
    const orderPhrase = ordered(flat.phrase.weightedMeanSdSt, normal.phrase.weightedMeanSdSt, lively.phrase.weightedMeanSdSt);
    const worstShare = rows.every((r) => r.share !== null) ? Math.min(...rows.map((r) => r.share as number)) : null;
    numbers.orderHoldsToday = orderToday;
    numbers.orderHoldsWithinPhrase = orderPhrase;
    numbers.worstVoicedShare = worstShare === null ? null : round(worstShare, 2);

    const checks: LabCheck[] = [
      check("Flat take range", isNum(flat.range) ? st(flat.range) : "no pitch", isNum(flat.range) ? flat.range < 2.5 : null, "under 2.5 semitones"),
      check("Lively take range", isNum(lively.range) ? st(lively.range) : "no pitch", isNum(lively.range) ? lively.range > 4.5 : null, "over 4.5 semitones"),
      check("Order on today's SD", `${fmt(flat.sd, normal.sd, lively.sd)} st`, orderToday, "flat < normal < lively, each 15% up"),
      check(
        "Order on within-phrase SD",
        `${fmt(flat.phrase.weightedMeanSdSt, normal.phrase.weightedMeanSdSt, lively.phrase.weightedMeanSdSt)} st`,
        orderPhrase,
        "flat < normal < lively, each 15% up",
      ),
      check("Pitch found", rows.map((r) => `${r.k} ${r.share === null ? "?" : pct(r.share)}`).join(", "), worstShare === null ? null : worstShare >= 0.6, "60% of speech frames or more"),
      check("Normal take range", isNum(normal.range) ? st(normal.range) : "no pitch", null),
      check("Within-phrase range, flat / normal / lively", fmt(flat.phrase.weightedMeanRangeSt, normal.phrase.weightedMeanRangeSt, lively.phrase.weightedMeanRangeSt) + " st", null),
    ];
    return result(
      checks,
      numbers,
      "The pitch reading tells flat, normal and lively apart, and finds your voice in most frames.",
      (failed) => `The pitch reading missed: ${listFailed(failed)}.`,
      "Nothing failed, but some figures could not be measured.",
    );
  },
};

// --- 2. Pitch glide ---

const GL = { slide: "pitch_glide.slide" } as const;

interface GlideStats {
  voicedFrames: number;
  maxJumpSt: number | null;
  windows: number;
  nonDecreasingShare: number | null;
  riseSt: number | null;
}

// Frame-to-frame jumps, 100 ms windows (median pitch of each) that do not fall
// by more than 0.25 st from the one before, and the rise from the first tenth
// of the voiced frames to the last tenth.
function glideStats(f0: ArrayLike<number>, hopMs: number): GlideStats {
  const sts: number[] = [];
  let maxJump = 0;
  for (let i = 0; i < f0.length; i++) {
    if (!(f0[i] > 0)) continue;
    const s = semis(f0[i], 100);
    if (i > 0 && f0[i - 1] > 0) maxJump = Math.max(maxJump, Math.abs(s - semis(f0[i - 1], 100)));
    sts.push(s);
  }
  const per = Math.max(1, Math.round(100 / hopMs));
  const meds: number[] = [];
  for (let a = 0; a < f0.length; a += per) {
    const w: number[] = [];
    for (let i = a; i < Math.min(f0.length, a + per); i++) if (f0[i] > 0) w.push(semis(f0[i], 100));
    if (w.length >= 3) meds.push(percentile(w, 0.5));
  }
  let ok = 0;
  for (let k = 1; k < meds.length; k++) if (meds[k] >= meds[k - 1] - 0.25) ok++;
  const edge = Math.max(5, Math.round(sts.length * 0.1));
  return {
    voicedFrames: sts.length,
    maxJumpSt: sts.length > 1 ? round(maxJump, 2) : null,
    windows: meds.length,
    nonDecreasingShare: meds.length >= 10 ? round(ok / (meds.length - 1), 2) : null,
    riseSt: sts.length >= 2 * edge ? round(percentile(sts.slice(-edge), 0.5) - percentile(sts.slice(0, edge), 0.5), 2) : null,
  };
}

const GLIDE_MIN_VOICED_SECONDS = 3;

const pitchGlideTest: LabTestEntry = {
  def: {
    id: "voice.pitch_glide",
    group: "voice",
    title: "Pitch glide",
    summary: "Slide your voice slowly from low to high on one vowel. A smooth rise shows the tracker is not jumping octaves.",
    minutes: 1,
    steps: [
      {
        id: GL.slide,
        title: "Low to high",
        instruction: "Say a long \"ahhh\" starting as low as is comfortable and slide up smoothly, as high as you can, over about 10 seconds. No breaks, no stepping.",
        seconds: 10,
        capture: "take",
      },
    ],
    bars: [
      "No frame-to-frame jump over 6 semitones",
      "At least 85% of 100 ms windows hold or rise",
      "A total rise of at least 7 semitones",
    ],
    onFail: "Better cleanup, or SwiftF0",
  },
  evaluate(measures) {
    const a = audioOf(measures, GL.slide);
    if (!a) return thin("No recording for the glide.");
    const f = a.features;
    const raw = glideStats(f.f0Hz, f.hopMs);
    const voicedSeconds = (raw.voicedFrames * f.hopMs) / 1000;
    if (voicedSeconds < GLIDE_MIN_VOICED_SECONDS || raw.nonDecreasingShare === null) return thin(`Only ${round(voicedSeconds)} s of pitch was found; hold the sound for the whole 10 seconds.`, { voicedSeconds: round(voicedSeconds) });
    const cleaned = cleanPitch(f.f0Hz, f.confidence);
    const after = glideStats(cleaned.f0Hz, f.hopMs);
    const passesAll = (s: GlideStats) => isNum(s.maxJumpSt) && s.maxJumpSt <= 6 && isNum(s.nonDecreasingShare) && s.nonDecreasingShare >= 0.85 && isNum(s.riseSt) && s.riseSt >= 7;

    const numbers: Numbers = {
      voicedSeconds: round(voicedSeconds),
      maxJumpSt: raw.maxJumpSt,
      windows: raw.windows,
      nonDecreasingShare: raw.nonDecreasingShare,
      riseSt: raw.riseSt,
      cleanedMaxJumpSt: after.maxJumpSt,
      cleanedNonDecreasingShare: after.nonDecreasingShare,
      cleanedRiseSt: after.riseSt,
      cleanupOctaveMoved: cleaned.counts.octaveMoved,
      cleanupSmoothed: cleaned.counts.smoothed,
      cleanedPasses: passesAll(after),
    };
    const checks: LabCheck[] = [
      check("Largest frame-to-frame jump", isNum(raw.maxJumpSt) ? st(raw.maxJumpSt) : "?", isNum(raw.maxJumpSt) ? raw.maxJumpSt <= 6 : null, "no more than 6 semitones"),
      check("Windows holding or rising", isNum(raw.nonDecreasingShare) ? `${pct(raw.nonDecreasingShare)} of ${raw.windows}` : "?", isNum(raw.nonDecreasingShare) ? raw.nonDecreasingShare >= 0.85 : null, "at least 85%"),
      check("Total rise", isNum(raw.riseSt) ? st(raw.riseSt) : "?", isNum(raw.riseSt) ? raw.riseSt >= 7 : null, "at least 7 semitones"),
      check("After cleanup: largest jump / windows rising / rise", `${after.maxJumpSt ?? "?"} st / ${isNum(after.nonDecreasingShare) ? pct(after.nonDecreasingShare) : "?"} / ${after.riseSt ?? "?"} st`, null),
    ];
    return result(
      checks,
      numbers,
      "The glide came out as one smooth rise, with no octave jumps.",
      (failed) => `The glide was not clean: ${listFailed(failed)}.${passesAll(after) ? " The same take passes after cleanup." : ""}`,
      "Nothing failed, but some figures could not be measured.",
    );
  },
};

// --- 3. Endings ---

export interface EndingSentence {
  text: string;
  expect: Extract<EndingKind, "rising" | "falling">;
}

// The last word of each sentence appears nowhere else in the script, so the
// transcript can be searched for it in order.
export const ENDING_SENTENCES: EndingSentence[] = [
  { text: "The train leaves at noon.", expect: "falling" },
  { text: "Is the window open?", expect: "rising" },
  { text: "We painted the fence green.", expect: "falling" },
  { text: "Did she bring her umbrella?", expect: "rising" },
  { text: "The soup needs more salt.", expect: "falling" },
  { text: "Are they coming tonight?", expect: "rising" },
  { text: "He parked beside the library.", expect: "falling" },
  { text: "Can you see the harbor?", expect: "rising" },
  { text: "My brother plays the piano.", expect: "falling" },
  { text: "Will it rain tomorrow?", expect: "rising" },
];

const ENDINGS_SCRIPT = ENDING_SENTENCES.map((s, i) => `${i + 1}. ${s.text}   (${s.expect === "falling" ? "statement: let it fall" : "question: let it rise"})`).join("\n");
const EN = { read: "endings.read" } as const;
const ENDINGS_MIN_FOUND = 8;

const endingsTest: LabTestEntry = {
  def: {
    id: "voice.endings",
    group: "voice",
    title: "Endings",
    summary: "Read five statements that fall and five questions that rise. Does the app hear which is which?",
    minutes: 2,
    steps: [
      {
        id: EN.read,
        title: "Ten short sentences",
        instruction: "Read the sentences in order, with a short breath between them. Say the statements as flat facts with the voice dropping at the end, and the questions with the voice rising. Do not read the notes in brackets.",
        script: ENDINGS_SCRIPT,
        seconds: 60,
        capture: "take",
        words: true,
      },
    ],
    bars: ["At least 80% of the sentence endings classified right (falling for statements, rising for questions)"],
    onFail: "Leaf stays display-only",
  },
  evaluate(measures) {
    const a = audioOf(measures, EN.read);
    const words = measures[EN.read]?.words;
    if (!a) return thin("No recording for the sentences.");
    if (!words || words.length === 0) return thin("The recording has no transcript, so sentence ends are unknown.");

    const cleanedFeatures = { ...a.features, f0Hz: cleanPitch(a.features.f0Hz, a.features.confidence).f0Hz };
    let cursor = 0;
    const rows = ENDING_SENTENCES.map((s) => {
      const last = norm(s.text.split(/\s+/).pop() ?? "");
      let idx = -1;
      for (let i = cursor; i < words.length; i++) {
        if (norm(words[i].text) === last) {
          idx = i;
          break;
        }
      }
      if (idx === -1) return { s, endMs: null as number | null, slope: null as number | null, kind: null as EndingKind | null, rawKind: null as EndingKind | null };
      cursor = idx + 1;
      const endMs = words[idx].endMs;
      const slope = terminalSlope(cleanedFeatures, endMs);
      return { s, endMs, slope, kind: classifyEnding(slope), rawKind: classifyEnding(terminalSlope(a.features, endMs)) };
    });
    const found = rows.filter((r) => r.endMs !== null);
    if (found.length < ENDINGS_MIN_FOUND) return thin(`Only ${found.length} of ${rows.length} sentences were found in the transcript; read them in order and clearly.`, { sentencesFound: found.length });

    const right = found.filter((r) => r.kind === r.s.expect).length;
    const rawRight = found.filter((r) => r.rawKind === r.s.expect).length;
    const of = (kind: "falling" | "rising") => {
      const group = found.filter((r) => r.s.expect === kind);
      return { right: group.filter((r) => r.kind === kind).length, total: group.length };
    };
    const falling = of("falling");
    const rising = of("rising");
    const rate = right / found.length;

    const numbers: Numbers = {
      sentencesFound: found.length,
      right,
      rate: round(rate, 2),
      fallingRight: falling.right,
      fallingTotal: falling.total,
      risingRight: rising.right,
      risingTotal: rising.total,
      rawRight,
      slopeThresholdStPerS: 3,
    };
    rows.forEach((r, i) => {
      numbers[`s${i + 1}_expect`] = r.s.expect;
      numbers[`s${i + 1}_slopeStPerS`] = r.slope;
      numbers[`s${i + 1}_heard`] = r.kind;
    });

    const checks: LabCheck[] = [
      check("Endings classified right", `${right} of ${found.length} (${pct(rate)})`, rate >= 0.8, "at least 80%"),
      check("Falling statements right", `${falling.right} of ${falling.total}`, null),
      check("Rising questions right", `${rising.right} of ${rising.total}`, null),
      check("Right without pitch cleanup", `${rawRight} of ${found.length}`, null),
    ];
    return result(
      checks,
      numbers,
      `The app told statements from questions in ${right} of ${found.length} endings.`,
      () => `Only ${right} of ${found.length} endings were classified right (${falling.right} of ${falling.total} falling, ${rising.right} of ${rising.total} rising).`,
      "Not enough to say.",
    );
  },
};

// --- 4. Volume gain ---

const VG = { normal: "volume_gain.normal", quiet: "volume_gain.quiet", loud: "volume_gain.loud" } as const;
const VOLUME_SCRIPT = "Count slowly from one to ten, then start again, until the time is up.";

const volumeGainTest: LabTestEntry = {
  def: {
    id: "voice.volume_gain",
    group: "voice",
    title: "Volume gain",
    summary: "Speak at a normal, a quiet and a loud level with the phone held still. A reading that stays flat means the recording is levelling the audio for you.",
    minutes: 2,
    steps: [
      { id: VG.normal, title: "Normal voice", instruction: "Hold the phone still at arm's length and count at your normal speaking level.", script: VOLUME_SCRIPT, seconds: 5, capture: "take" },
      { id: VG.quiet, title: "Quiet voice", instruction: "Same distance, same phone position. Count quietly, as if someone nearby is sleeping.", script: VOLUME_SCRIPT, seconds: 5, capture: "take" },
      { id: VG.loud, title: "Loud voice", instruction: "Same distance. Count loudly, as if speaking across a big room. Do not shout.", script: VOLUME_SCRIPT, seconds: 5, capture: "take" },
    ],
    bars: ["At least 15 dB between the quiet and the loud take", "Quiet < normal < loud"],
    onFail: "Change the takes' audio set-up (below)",
  },
  evaluate(measures) {
    const levels = (["quiet", "normal", "loud"] as const).map((k) => ({ k, db: audioOf(measures, VG[k])?.summary.speechMedianDbfs ?? null }));
    const absent = levels.filter((l) => !isNum(l.db)).map((l) => l.k);
    if (absent.length) return thin(`No speech level for the ${absent.join(" and ")} take; speak the whole time.`);
    const [quiet, normal, loud] = levels.map((l) => l.db as number);
    const spread = loud - quiet;
    const numbers: Numbers = {
      quietDbfs: quiet,
      normalDbfs: normal,
      loudDbfs: loud,
      quietToLoudDb: round(spread),
      quietSnrDb: audioOf(measures, VG.quiet)?.summary.snrDb ?? null,
      loudSnrDb: audioOf(measures, VG.loud)?.summary.snrDb ?? null,
    };
    const checks: LabCheck[] = [
      check("Quiet to loud", db(spread), spread >= 15, "at least 15 dB"),
      check("Order", `quiet ${db(quiet)}, normal ${db(normal)}, loud ${db(loud)}`, quiet < normal && normal < loud, "quiet < normal < loud"),
    ];
    return result(
      checks,
      numbers,
      `The reading follows your voice: ${db(spread)} from quiet to loud.`,
      (failed) =>
        spread < 15
          ? `Only ${db(spread)} between quiet and loud. The recording may be levelling the audio.`
          : `The levels were out of order: ${listFailed(failed)}.`,
      "Not enough to say.",
    );
  },
};

// --- 5. Volume and distance ---

const VD = { far: "volume_distance.far", near: "volume_distance.near" } as const;

const volumeDistanceTest: LabTestEntry = {
  def: {
    id: "voice.volume_distance",
    group: "voice",
    title: "Volume and distance",
    summary: "Speak at the same level at arm's length and again at half that distance. Face size from the same take should cancel the change.",
    minutes: 1,
    steps: [
      { id: VD.far, title: "Arm's length", instruction: "Hold the phone at arm's length with your face in view and count at your normal level.", script: VOLUME_SCRIPT, seconds: 8, capture: "face_take" },
      { id: VD.near, title: "Half the distance", instruction: "Bring the phone to half that distance, face still in view. Keep your voice at exactly the same level.", script: VOLUME_SCRIPT, seconds: 8, capture: "face_take" },
    ],
    bars: ["About a 6 dB rise when you come closer (4 to 8 dB)", "Within 2 dB after correcting for face size"],
    onFail: "Volume leaves stay drills-only",
  },
  evaluate(measures) {
    const far = audioOf(measures, VD.far)?.summary.speechMedianDbfs ?? null;
    const near = audioOf(measures, VD.near)?.summary.speechMedianDbfs ?? null;
    if (!isNum(far) || !isNum(near)) return thin("No speech level for one of the takes; speak the whole time.");
    const farW = measures[VD.far]?.faceWidth;
    const nearW = measures[VD.near]?.faceWidth;
    const hasFace = isNum(farW) && isNum(nearW) && farW > 0 && nearW > 0;
    const rise = near - far;
    const correction = hasFace ? 20 * Math.log10(nearW / farW) : null;
    // What is left of the rise once the face-size correction has taken out the
    // distance: close to 0 when the correction explains it.
    const left = correction === null ? null : rise - correction;
    const numbers: Numbers = {
      farDbfs: far,
      nearDbfs: near,
      riseDb: round(rise),
      faceWidthFar: isNum(farW) ? farW : null,
      faceWidthNear: isNum(nearW) ? nearW : null,
      faceCorrectionDb: correction === null ? null : round(correction),
      leftAfterCorrectionDb: left === null ? null : round(left),
    };
    const checks: LabCheck[] = [
      check("Rise coming closer", db(rise), rise >= 4 && rise <= 8, "4 to 8 dB"),
      check("Left after face-size correction", left === null ? "no face size" : db(left), left === null ? null : Math.abs(left) <= 2, "within 2 dB of nothing"),
      check("Face-size correction", correction === null ? "no face size" : db(correction), null),
    ];
    return result(
      checks,
      numbers,
      `Coming closer raised the level by ${db(rise)}, and face size took out all but ${left === null ? "" : db(Math.abs(left))}.`,
      (failed) => `Distance check missed: ${listFailed(failed)}.`,
      "The rise was in range, but there was no face size to check the correction with.",
    );
  },
};

// --- 6. Emphasis ---

const EM = { flat: "emphasis.flat", stressed: "emphasis.stressed" } as const;
const EMPHASIS_FLAT = "The new bridge will open in spring, but only if the crews finish the deck before winter.";
const EMPHASIS_STRESSED = "The new BRIDGE will open in SPRING, but only if the CREWS finish the DECK before WINTER.";

const emphasisTest: LabTestEntry = {
  def: {
    id: "voice.emphasis",
    group: "voice",
    title: "Emphasis",
    summary: "Read a passage flat, then stressing its key words. Both today's emphasis number and the three-cue stand-out score should rise.",
    minutes: 2,
    steps: [
      { id: EM.flat, title: "Flat", instruction: "Read the passage in an even voice, giving no word more weight than another. Read it three times in a row without a pause.", script: `${EMPHASIS_FLAT} ${EMPHASIS_FLAT} ${EMPHASIS_FLAT}`, seconds: 25, capture: "take" },
      { id: EM.stressed, title: "Stressing the key words", instruction: "Read the same passage three times, and push the words in capitals: louder, higher and a little longer.", script: `${EMPHASIS_STRESSED} ${EMPHASIS_STRESSED} ${EMPHASIS_STRESSED}`, seconds: 25, capture: "take" },
    ],
    bars: ["Syllable-peak spread at least 1 dB higher in the stressed read", "Stand-out score at least 0.5 higher in the stressed read"],
    onFail: "Leaf stays display-only",
  },
  evaluate(measures) {
    const flat = audioOf(measures, EM.flat);
    const stressed = audioOf(measures, EM.stressed);
    if (!flat || !stressed) return thin("A recording is missing; both reads are needed.");
    const sdFlat = flat.summary.syllablePeakSdDb;
    const sdStressed = stressed.summary.syllablePeakSdDb;
    const a = scoreSyllablePeaks(flat.features);
    const b = scoreSyllablePeaks(stressed.features);
    if (!isNum(sdFlat) || !isNum(sdStressed) || a.standOut === null || b.standOut === null) {
      return thin("Too few syllable peaks to measure emphasis in one of the reads.", { flatPeaks: a.peaks.length, stressedPeaks: b.peaks.length });
    }
    const sdGain = sdStressed - sdFlat;
    const standOutGain = b.standOut - a.standOut;
    const numbers: Numbers = {
      flatPeakSdDb: sdFlat,
      stressedPeakSdDb: sdStressed,
      peakSdGainDb: round(sdGain, 2),
      flatStandOut: a.standOut,
      stressedStandOut: b.standOut,
      standOutGain: round(standOutGain, 2),
      flatPeaks: a.peaks.length,
      stressedPeaks: b.peaks.length,
    };
    const checks: LabCheck[] = [
      check("Syllable-peak spread, stressed minus flat", `${db(sdGain)} (${sdFlat} to ${sdStressed})`, sdGain >= 1, "at least 1 dB more"),
      check("Stand-out score, stressed minus flat", `${round(standOutGain, 2)} (${a.standOut} to ${b.standOut})`, standOutGain >= 0.5, "at least 0.5 more"),
    ];
    return result(
      checks,
      numbers,
      "Stressing the key words clearly raised both emphasis numbers.",
      (failed) => `The stressed read did not stand out enough: ${listFailed(failed)}.`,
      "Not enough to say.",
    );
  },
};

// --- 7. Word stress ---

export const STRESS_SENTENCE = ["I", "didn't", "say", "she", "stole", "the", "money"];
const WS_PASS = 5;
const wsId = (k: number) => `word_stress.${k + 1}`;

const wordStressSteps: LabStep[] = STRESS_SENTENCE.map((w, k) => ({
  id: wsId(k),
  title: `Stress "${w}"`,
  instruction: `Say the sentence once, putting the stress on "${w}". The other words stay light. Pause before the next one.`,
  script: STRESS_SENTENCE.map((x, j) => (j === k ? x.toUpperCase() : x)).join(" "),
  seconds: 6,
  capture: "take",
  words: true,
}));

const wordStressTest: LabTestEntry = {
  def: {
    id: "voice.word_stress",
    group: "voice",
    title: "Word stress",
    summary: "Say one sentence seven times, stressing a different word each time. Does the loudest-looking word match the one you meant?",
    minutes: 3,
    steps: wordStressSteps,
    bars: ["The stressed word has the strongest peak in at least 5 of the 7 reads"],
    onFail: "Leaf stays display-only",
  },
  evaluate(measures) {
    const rows = STRESS_SENTENCE.map((target, k) => {
      const m = measures[wsId(k)];
      const words = m?.words;
      if (!m?.audio || !words || words.length === 0) return { k, target, ready: false as const };
      let idx = words.findIndex((w) => norm(w.text) === norm(target));
      if (idx === -1 && words.length === STRESS_SENTENCE.length) idx = k;
      if (idx === -1) return { k, target, ready: false as const };
      const scored = scoreSyllablePeaks(m.audio.features, words);
      const winner = strongestWord(scored);
      const loudWinner = strongestWord(scored, "loudness");
      return {
        k,
        target,
        ready: true as const,
        hit: winner === idx,
        loudHit: loudWinner === idx,
        winnerText: winner === null ? null : words[winner].text,
      };
    });
    const ready = rows.filter((r): r is Extract<typeof r, { ready: true }> => r.ready);
    if (ready.length === 0) return thin("No usable reads: each needs a recording and its transcript.");
    const hits = ready.filter((r) => r.hit).length;
    const loudHits = ready.filter((r) => r.loudHit).length;
    const missing = rows.length - ready.length;
    const pass = hits >= WS_PASS ? true : hits + missing < WS_PASS ? false : null;

    const numbers: Numbers = { readsScored: ready.length, hits, loudnessOnlyHits: loudHits, needed: WS_PASS };
    for (const r of rows) {
      numbers[`read${r.k + 1}_target`] = r.target;
      numbers[`read${r.k + 1}_strongest`] = r.ready ? r.winnerText : null;
    }
    const checks: LabCheck[] = [
      check("Reads where the stressed word ranked top", `${hits} of ${ready.length} scored (${rows.length} reads)`, pass, "at least 5 of 7"),
      check("Same, by loudness alone", `${loudHits} of ${ready.length}`, null),
      ...ready.filter((r) => !r.hit).map((r) => check(`Stressed "${r.target}"`, `strongest was ${r.winnerText === null ? "nothing" : `"${r.winnerText}"`}`, null)),
    ];
    return result(
      checks,
      numbers,
      `The stressed word ranked top in ${hits} of ${ready.length} reads.`,
      () => `The stressed word ranked top in only ${hits} of ${ready.length} reads.`,
      `${hits} of ${ready.length} so far; ${missing} read${missing === 1 ? "" : "s"} could not be scored.`,
    );
  },
};

// --- 8. Pauses ---

// Marked pauses sit after the word in front of each [pause]. The passage has no
// full stops, so the only places to stop are the marks.
export const PAUSE_PASSAGE =
  "Every morning the market opens before sunrise [pause] and the first stalls fill with bread and fruit while farmers arrive with crates of apples [pause] " +
  "pears and late summer plums so that by seven o'clock the street is full of shoppers [pause] some with baskets and some with small wheeled carts " +
  "and a man near the fountain sells coffee [pause] and the line for it never seems to shrink as children chase pigeons across the square [pause] " +
  "while their parents compare prices and the fish seller calls out the day's catch [pause] and a few people stop to listen until around nine the music starts [pause] " +
  "a single violin at first and then a guitar and by noon the crowds begin to thin [pause] as the sellers pack what is left and the last cart rolls away [pause] " +
  "and the cleaners come with their brooms so that soon the square is quiet again [pause] and the fountain is all that can be heard";

interface PauseMark {
  norm: string;
  // Which occurrence of that word in the passage (1 = first).
  nth: number;
}

export function pauseMarks(passage: string): PauseMark[] {
  const marks: PauseMark[] = [];
  const seen: Record<string, number> = {};
  let prev = "";
  for (const token of passage.split(/\s+/)) {
    if (token === "[pause]") {
      if (prev) marks.push({ norm: prev, nth: seen[prev] });
      continue;
    }
    const n = norm(token);
    if (!n) continue;
    seen[n] = (seen[n] ?? 0) + 1;
    prev = n;
  }
  return marks;
}

const PA = { read: "pauses.read" } as const;
const PAUSE_MATCH_MS = 300;
const PAUSE_MIN_LOCATED = 9;
const PAUSE_NEED_FOUND = 8;
const PAUSE_MAX_FALSE = 2;

const pausesTest: LabTestEntry = {
  def: {
    id: "voice.pauses",
    group: "voice",
    title: "Pauses",
    summary: "Read a passage with ten marked pauses. Does the app find them, and not invent others?",
    minutes: 2,
    steps: [
      {
        id: PA.read,
        title: "Ten marked pauses",
        instruction: "Read the passage once at an easy pace. Stop for about a second wherever you see [pause], and keep going without a stop everywhere else, even at commas. Do not read the marks aloud.",
        script: PAUSE_PASSAGE,
        seconds: 75,
        capture: "take",
        words: true,
      },
    ],
    bars: ["At least 8 of the 10 marked pauses found (one starts within 300 ms of the marked word's end)", "No more than 2 false pauses"],
    onFail: "Use Whisper gaps too, then Silero VAD",
  },
  evaluate(measures) {
    const a = audioOf(measures, PA.read);
    const words = measures[PA.read]?.words;
    if (!a) return thin("No recording for the passage.");
    if (!words || words.length === 0) return thin("The recording has no transcript, so the marked words cannot be found.");

    const marks = pauseMarks(PAUSE_PASSAGE);
    const ends: number[] = [];
    for (const m of marks) {
      let count = 0;
      const hit = words.find((w) => norm(w.text) === m.norm && ++count === m.nth);
      if (hit) ends.push(hit.endMs);
    }
    if (ends.length < PAUSE_MIN_LOCATED) return thin(`Only ${ends.length} of ${marks.length} marked words were found in the transcript; read the passage as written.`, { markedWordsFound: ends.length });

    const energy = pausesFromFeatures(a.features, words).pauses;
    const merged = mergePauses(energy, words);
    const score = (pauses: { startMs: number }[]) => {
      const found = ends.filter((e) => pauses.some((p) => Math.abs(p.startMs - e) <= PAUSE_MATCH_MS)).length;
      const falsePauses = pauses.filter((p) => !ends.some((e) => Math.abs(p.startMs - e) <= PAUSE_MATCH_MS)).length;
      return { found, falsePauses, total: pauses.length };
    };
    const e = score(energy);
    const g = score(merged);
    const wordsOnly = merged.filter((p) => p.source === "words").length;

    const numbers: Numbers = {
      marked: marks.length,
      markedWordsFound: ends.length,
      energyDetected: e.total,
      energyFound: e.found,
      energyFalse: e.falsePauses,
      mergedDetected: g.total,
      mergedFound: g.found,
      mergedFalse: g.falsePauses,
      mergedFromWordsOnly: wordsOnly,
      mergedPasses: g.found >= PAUSE_NEED_FOUND && g.falsePauses <= PAUSE_MAX_FALSE,
    };
    const checks: LabCheck[] = [
      check("Marked pauses found (energy detector)", `${e.found} of ${marks.length}`, e.found >= PAUSE_NEED_FOUND, "at least 8 of 10"),
      check("False pauses (energy detector)", `${e.falsePauses}`, e.falsePauses <= PAUSE_MAX_FALSE, "no more than 2"),
      check("Marked pauses found (energy plus Whisper gaps)", `${g.found} of ${marks.length}`, null),
      check("False pauses (energy plus Whisper gaps)", `${g.falsePauses}`, null),
    ];
    const mergedNote = numbers.mergedPasses ? " With Whisper's gaps added it would pass." : ` With Whisper's gaps added: ${g.found} found, ${g.falsePauses} false.`;
    return result(
      checks,
      numbers,
      `The energy detector found ${e.found} of ${marks.length} marked pauses with ${e.falsePauses} false.`,
      () => `The energy detector found ${e.found} of ${marks.length} marked pauses with ${e.falsePauses} false.${mergedNote}`,
      "Not enough to say.",
    );
  },
};

// --- 9. Pace ---

export const PACE_PASSAGE =
  "A lighthouse stands at the edge of the harbor, where the old stone pier meets the open water. For more than a hundred years it has guided small boats home through fog and storms. " +
  "The keeper once climbed its narrow stairs each evening to light the lamp, and the beam could be seen from the hills ten miles away. " +
  "Today the lamp turns by itself, but visitors still climb the steps on summer weekends, pausing at each small window to look out at the waves. " +
  "At the top, the view stretches along the coast, over rooftops and fishing nets and the slow white line of the tide.";

const PC = { read: "pace.read" } as const;
const PACE_MIN_STOPWATCH_MS = 20000;
const PACE_TOLERANCE = 0.05;
export const wordCountOf = (text: string) => text.split(/\s+/).filter(Boolean).length;

const paceTest: LabTestEntry = {
  def: {
    id: "voice.pace",
    group: "voice",
    title: "Pace",
    summary: "Read a passage of known length against a stopwatch. The words-a-minute from the transcript should match the stopwatch.",
    minutes: 2,
    steps: [
      {
        id: PC.read,
        title: "Timed passage",
        instruction: "Tap Start, then read the passage once at your normal pace and tap Stop the moment you finish. Do not rush or add words.",
        script: PACE_PASSAGE,
        seconds: 90,
        capture: "take",
        words: true,
        stopwatch: true,
      },
    ],
    bars: ["Words per minute from the transcript within 5% of the passage's word count over the stopwatch time"],
    onFail: "Fix the timing source",
  },
  evaluate(measures) {
    const m = measures[PC.read];
    if (!m) return thin("No recording for the passage.");
    if (!isNum(m.stopwatchMs) || m.stopwatchMs < PACE_MIN_STOPWATCH_MS) return thin(m.stopwatchMs === undefined ? "The stopwatch was not used." : `The stopwatch read only ${round(m.stopwatchMs / 1000)} s; read the whole passage between Start and Stop.`);
    if (!m.words || m.words.length === 0) return thin("The recording has no transcript.");
    const heard = speakingWpm(m.words);
    if (heard === null) return thin("The transcript is too short to give a pace.");

    const count = wordCountOf(PACE_PASSAGE);
    const expected = count / (m.stopwatchMs / 60000);
    const diff = (heard - expected) / expected;
    const numbers: Numbers = {
      passageWords: count,
      transcriptWords: m.words.length,
      stopwatchMs: m.stopwatchMs,
      stopwatchWpm: round(expected),
      transcriptWpm: heard,
      differencePercent: round(diff * 100),
    };
    const checks: LabCheck[] = [
      check("Transcript pace against the stopwatch", `${heard} wpm against ${round(expected)} wpm (${diff >= 0 ? "+" : ""}${round(diff * 100)}%)`, Math.abs(diff) <= PACE_TOLERANCE, "within 5%"),
      check("Words in transcript against the passage", `${m.words.length} of ${count}`, null),
    ];
    return result(
      checks,
      numbers,
      `The transcript's pace is within ${round(Math.abs(diff) * 100)}% of the stopwatch.`,
      () => `The transcript's pace is ${round(Math.abs(diff) * 100)}% ${diff > 0 ? "faster" : "slower"} than the stopwatch (${heard} against ${round(expected)} wpm).`,
      "Not enough to say.",
    );
  },
};

export const VOICE_TESTS: LabTestEntry[] = [
  pitchVarietyTest,
  pitchGlideTest,
  endingsTest,
  volumeGainTest,
  volumeDistanceTest,
  emphasisTest,
  wordStressTest,
  pausesTest,
  paceTest,
];
