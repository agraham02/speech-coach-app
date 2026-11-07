import type { EvidenceSource } from "../../content/skillGrid";
import { phrasePitchScore, FIXED_PHRASE_PITCH_BAND, standOutScore, stallsPerMinute, type PitchRangeBand, STAND_OUT_FULL } from "./bands";
import type { LeafId } from "./skillTree";

// Each leaf a take can show, on 0-100, from its own formula in plan section 6.2.
// A leaf built on more than one signal takes them together (plan 6.4, rule 10):
// On the lens is head and eyes over speaking time; At sentence ends is the voice
// gate and the word ends; Stand-out stress is pitch, loudness and length;
// Rhythm is the spread across phrases and the speed-up; Clear endings is the
// words and how the voice lands. Numbers marked "tune" are first guesses to set
// from real takes. Pure.

export type TakeKind = "impromptu" | "script";
export type TakeKindForLeaves = TakeKind;

export type EndingKind = "clear" | "neutral" | "trailing";

export interface TakeFacts {
  kind: TakeKindForLeaves;
  durationSeconds: number;
  wordCount: number;
  // Voice
  wpm: number | null;
  paceSdSylPerSec: number | null;
  paceDriftPercent: number | null;
  boundaryPauseRate: number | null;
  pitchPhraseSdSt: number | null;
  pitchBand?: PitchRangeBand;
  endings: { statements: number; rising: number } | null;
  // Pitch, loudness and length of the strongest syllables, in clear steps up.
  standOut: number | null;
  strongOnContentShare: number | null;
  lastWordCarry: { sentences: number; trailing: number } | null;
  // Clarity. Null: not counted against this speaker (stuttering) or no transcript.
  fillers: { hesitationPerMinute: number; contextualPerMinute: number } | null;
  stalls: number | null;
  restarts: number | null;
  readAccuracyPercent: number | null;
  // Presence. Null: no face, or out of frame most of the time.
  presence: { onLensPercent: number; longLookAwaysPerMinute: number; faceMovesPerMinute: number | null } | null;
  hedges: number | null;
  ending: EndingKind | null;
  // Message, from the words. Coarse: these are phone estimates.
  // A Concise take's limit, in seconds.
  budgetSeconds?: number | null;
  pointFirst: boolean | null;
  structure: { framework: string; shaped: boolean; beatsFound: number } | null;
  wordsPerSentence: number | null;
  longWordShare: number | null;
  detoursPerMinute: number | null;
  detailsPerMinute: number | null;
  // With no prep only; otherwise null.
  secondsToFirstWord: number | null;
  // Tono AI's rubric levels, 0-100, on the leaves it owns.
  judged?: Partial<Record<LeafId, { score: number; notes: string | null }>>;
  // The judge says this can't be scored as an answer: why.
  notScorable?: string | null;
}

export interface LeafReading {
  score: number; // 0-100
  source: EvidenceSource;
  // The raw number, in words: "2.1 ums a minute".
  value: string;
  // How the score was worked out.
  rule: string;
  // The judge's note.
  notes?: string | null;
}

export type TakeLeafReadings = Partial<Record<LeafId, LeafReading>>;

const clamp = (n: number) => Math.max(0, Math.min(100, n));
const round1 = (n: number) => Math.round(n * 10) / 10;

const SPEAKING_RATE = { low: 130, high: 160, perWord: 1.4 } as const;
const SENTENCE_END_FULL = 0.6;
const ON_LENS_FULL = 85;
const FACE_MOVES_FULL = 12; // tune
const FILLERS_FREE = 2;
const FILLER_COST = 8;
// Rhythm, tune: the spread is free up to this, and so is a small speed-up.
const RHYTHM_SD_FREE = 1;
const RHYTHM_SD_COST = 40;
const RHYTHM_DRIFT_FREE = 10;
const RHYTHM_DRIFT_COST = 2;
const RESTARTS_FREE = 1; // tune
const RESTART_COST = 10;
const DETOUR_COST = 25; // tune
const DETAILS_FULL = 6; // tune
const PLAIN_WORDS_PER_SENTENCE = 20;
const PLAIN_LONG_SHARE = 0.15;
const START_FREE_SECONDS = 1.5; // tune
const START_COST = 20;
const BEATS_IN_A_FRAMEWORK = 3;

export function takeLeafReadings(f: TakeFacts): TakeLeafReadings {
  const out: TakeLeafReadings = {};
  const measured = (leaf: LeafId, score: number, value: string, rule: string) => {
    out[leaf] = { score: round1(clamp(score)), source: "measured", value, rule };
  };
  const estimate = (leaf: LeafId, score: number, value: string, rule: string) => {
    out[leaf] = { score: round1(clamp(score)), source: "phone_estimate", value, rule };
  };

  // --- Voice ---------------------------------------------------------------
  if (f.wpm != null) {
    const wpm = Math.round(f.wpm);
    const off = wpm < SPEAKING_RATE.low ? SPEAKING_RATE.low - wpm : wpm > SPEAKING_RATE.high ? wpm - SPEAKING_RATE.high : 0;
    measured("speaking_rate", 100 - off * SPEAKING_RATE.perWord, `${wpm} words a minute`, `Full marks between ${SPEAKING_RATE.low} and ${SPEAKING_RATE.high} words a minute.${off ? ` You were ${off} ${wpm < SPEAKING_RATE.low ? "under" : "over"}.` : ""}`);
  }
  if (f.paceSdSylPerSec != null || f.paceDriftPercent != null) {
    const spreadCost = Math.max(0, (f.paceSdSylPerSec ?? 0) - RHYTHM_SD_FREE) * RHYTHM_SD_COST;
    const driftCost = Math.max(0, (f.paceDriftPercent ?? 0) - RHYTHM_DRIFT_FREE) * RHYTHM_DRIFT_COST;
    const drift = f.paceDriftPercent != null ? `, ${f.paceDriftPercent > 0 ? "up" : "down"} ${Math.abs(Math.round(f.paceDriftPercent))}% in the second half` : "";
    measured("rhythm", 100 - spreadCost - driftCost, `Pace spread ${round1(f.paceSdSylPerSec ?? 0)} syllables a second${drift}`, "A steady pace across phrases, without speeding up as you go.");
  }
  if (f.boundaryPauseRate != null) {
    measured("sentence_ends", (f.boundaryPauseRate / SENTENCE_END_FULL) * 100, `${Math.round(f.boundaryPauseRate * 100)}% of sentence ends`, `Full marks once ${SENTENCE_END_FULL * 100}% of your sentence ends get a pause. A beat at each full stop lets the point land.`);
  }
  if (f.pitchPhraseSdSt != null) {
    const band = f.pitchBand ?? FIXED_PHRASE_PITCH_BAND;
    const yours = band.source === "personal" ? `${band.fullSt} semitones, a little over your usual ${band.usualSt}` : `${band.fullSt} semitones`;
    measured("pitch_variety", phrasePitchScore(f.pitchPhraseSdSt, band) * 10, `${round1(f.pitchPhraseSdSt)} semitones within a phrase`, `How much your pitch moves inside each phrase. Full marks at ${yours}.`);
  }
  if (f.endings && f.endings.statements > 0) {
    const falling = f.endings.statements - f.endings.rising;
    measured("endings_fall", (falling / f.endings.statements) * 100, `${falling} of ${f.endings.statements} statements`, "Statements that don't rise at the end.");
  }
  if (f.standOut != null) {
    measured("stand_out_stress", standOutScore(f.standOut) * 10, `${round1(f.standOut)} steps up`, `How far your strongest words stand out, in pitch, loudness and length together. Full marks at ${STAND_OUT_FULL} steps.`);
  }
  if (f.strongOnContentShare != null) {
    measured("stress_right_words", f.strongOnContentShare * 100, `${Math.round(f.strongOnContentShare * 100)}% on content words`, "Strong syllables landing on the words that carry the meaning.");
  }
  if (f.lastWordCarry && f.lastWordCarry.sentences >= 2) {
    const kept = f.lastWordCarry.sentences - f.lastWordCarry.trailing;
    measured("volume_carry", (kept / f.lastWordCarry.sentences) * 100, `${kept} of ${f.lastWordCarry.sentences} sentences`, "Sentences whose last word stays within 6 dB of the rest. It compares you with yourself, so how far you are from the phone doesn't change it.");
  }

  // --- Clarity -------------------------------------------------------------
  if (f.fillers) {
    const { hesitationPerMinute: h, contextualPerMinute: c } = f.fillers;
    measured("ums_uhs", 100 - Math.max(0, h - FILLERS_FREE) * FILLER_COST, `${round1(h)} ums a minute`, `The first ${FILLERS_FREE} a minute go unnoticed, and each one after costs ${FILLER_COST}. Swap "um" for a closed-mouth pause.`);
    measured("like_actually", 100 - Math.max(0, c * 0.5 - FILLERS_FREE) * FILLER_COST, `${round1(c)} a minute`, `Words like "like" and "actually" count at half, since some of them aren't fillers.`);
  }
  if (f.stalls != null) {
    const perMinute = stallsPerMinute(f.stalls, f.durationSeconds);
    measured("stalls", 100 - perMinute * 20, `${f.stalls} (${round1(perMinute)} a minute)`, "A stall is a gap of 2 seconds or more in the middle of a phrase, and each one a minute costs 20. Pausing between sentences is fine.");
  }
  if (f.restarts != null) {
    const perMinute = f.restarts / Math.max(f.durationSeconds / 60, 0.5);
    measured("restarts", 100 - Math.max(0, perMinute - RESTARTS_FREE) * RESTART_COST, `${f.restarts} (${round1(perMinute)} a minute)`, "Starting a sentence over or saying a word twice. One a minute goes unnoticed.");
  }
  if (f.readAccuracyPercent != null) {
    measured("read_accuracy", f.readAccuracyPercent, `${Math.round(f.readAccuracyPercent)}% of the words`, "Words heard as written.");
  }

  // --- Presence ------------------------------------------------------------
  if (f.presence) {
    const { onLensPercent, longLookAwaysPerMinute, faceMovesPerMinute } = f.presence;
    measured("on_lens", (onLensPercent / ON_LENS_FULL) * 100, `${Math.round(onLensPercent)}% of speaking time`, `Full marks at ${ON_LENS_FULL}% of the time you're speaking, head and eyes together. Glances under about 1.2 seconds are forgiven.`);
    measured("long_lookaways", 100 - longLookAwaysPerMinute * 20, `${round1(longLookAwaysPerMinute)} a minute`, "Look-aways over 3 seconds cost 20 each. Looking down counts double, since it usually means notes or your own preview.");
    if (faceMovesPerMinute != null) {
      measured("face_movement", (faceMovesPerMinute / FACE_MOVES_FULL) * 100, `${round1(faceMovesPerMinute)} brow lifts and smiles a minute`, `Measured against your own resting face. Full marks at ${FACE_MOVES_FULL} a minute.`);
    }
  }

  // A script's words were given, so nothing below reads them.
  if (f.kind === "script") return out;

  if (f.hedges != null) {
    measured("hedges", 100 - Math.max(0, f.hedges - 2) * 5, `${f.hedges} hedges`, "\"I think\", \"maybe\", \"I guess\": the first two are free, and each one after costs 5.");
  }
  if (f.ending) {
    const scores: Record<EndingKind, number> = { clear: 100, neutral: 60, trailing: 30 };
    const words: Record<EndingKind, string> = { clear: "Clear", neutral: "Neutral", trailing: "Trailed off" };
    measured("clear_endings", scores[f.ending], words[f.ending], "Your last words, and whether your voice held through the ends of your sentences. Finish on your point, then stop talking.");
  }

  // --- Message -------------------------------------------------------------
  if (f.pointFirst != null) {
    estimate("point_first", f.pointFirst ? 100 : 0, f.pointFirst ? "Yes" : "No", "Does the first sentence carry the point? The phone can only guess at this from its shape.");
  }
  if (f.structure) {
    estimate("has_shape", f.structure.shaped ? 80 : 40, f.structure.shaped ? f.structure.framework : "None found", "The phone looks for the words of a known shape: 80 if it finds one, 40 if not. Tono AI judges this properly.");
    estimate("hits_beats", (f.structure.beatsFound / BEATS_IN_A_FRAMEWORK) * 100, `${f.structure.beatsFound} of ${BEATS_IN_A_FRAMEWORK} beats`, "The beats of the shape you used that the phone could find.");
  }
  if (f.wordsPerSentence != null && f.longWordShare != null) {
    const longCost = Math.max(0, f.longWordShare - PLAIN_LONG_SHARE) * 200;
    const wordCost = Math.max(0, f.wordsPerSentence - PLAIN_WORDS_PER_SENTENCE) * 4;
    measured("plain_words", 100 - longCost - wordCost, `${Math.round(f.wordsPerSentence)} words a sentence, ${Math.round(f.longWordShare * 100)}% long words`, `Full marks at ${PLAIN_WORDS_PER_SENTENCE} words a sentence or fewer, with ${PLAIN_LONG_SHARE * 100}% long words or fewer.`);
  }
  if (f.budgetSeconds) {
    const over = Math.max(0, f.durationSeconds - f.budgetSeconds);
    measured("within_limits", (1 - over / f.budgetSeconds) * 100, `${Math.round(f.durationSeconds)} of ${f.budgetSeconds} seconds`, "Inside the limit is full marks. Going over costs its share of the limit.");
  }
  if (f.detoursPerMinute != null) {
    measured("no_detours", 100 - f.detoursPerMinute * DETOUR_COST, `${round1(f.detoursPerMinute)} a minute`, "\"By the way\", \"anyway\" and other side roads.");
  }
  if (f.detailsPerMinute != null) {
    estimate("specifics", (f.detailsPerMinute / DETAILS_FULL) * 100, `${round1(f.detailsPerMinute)} a minute`, `Names, numbers, times and senses. Full marks at ${DETAILS_FULL} a minute.`);
  }
  if (f.secondsToFirstWord != null) {
    measured("starting_fast", 100 - Math.max(0, f.secondsToFirstWord - START_FREE_SECONDS) * START_COST, `${round1(f.secondsToFirstWord)} s to your first word`, `With no prep. Full marks inside ${START_FREE_SECONDS} seconds.`);
  }
  for (const [leaf, judged] of Object.entries(f.judged ?? {}) as [LeafId, { score: number; notes: string | null }][]) {
    out[leaf] = { score: round1(clamp(judged.score)), source: "judge", value: `Level ${Math.round(judged.score / 20)} of 5`, rule: out[leaf]?.rule ?? "Judged by Tono AI against written levels, 0 to 5.", notes: judged.notes };
  }
  return out;
}
