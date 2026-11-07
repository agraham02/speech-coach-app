import { calibratedThresholds, normalizeTimeline, type FaceCalibration } from "../faceCalibration";
import { faceMovement } from "../faceMovement";
import { groupLooks } from "../lookGroups";
import type { PresenceMetrics, PresenceSample } from "../presenceMetrics";
import type { AudioFeatures } from "../dsp/audioFeatures";
import type { PauseAnalysis } from "../dsp/pauses";
import { phrasePitchVariation, splitPhrases } from "../dsp/phrasePitch";
import { scoreSyllablePeaks } from "../dsp/stressCues";
import { ramblingMetrics } from "../coach/ramblingMetrics";
import { countDetails } from "../rewind/stats";
import { countSyllables, speakingWpm } from "../signals/audioSummary";
import type { SignalSummary } from "../signals/types";
import { alignFinal, buildTarget, scoreAlignment } from "../speech/speechAlignment";
import { tokenizeHeard } from "../speech/normalize";
import { computeFillerStats } from "../transcriptAnnotations";
import type { TranscriptWord } from "../sessionTypes";
import type { PitchRangeBand } from "./bands";
import type { EndingKind, TakeFacts, TakeKindForLeaves } from "./takeLeaves";
import type { LeafId } from "./skillTree";

// Flattens what a take left behind into what its leaves read (takeLeaves.ts).
// Face and voice readings are worked out here from the take's stored 10 ms track,
// so Signal Lab's proven formulas are what counts, not older summaries: within-
// phrase pitch, three-cue stress, looks over speaking time, brow lifts and smiles.
// Pure.

export interface TakeFactsInput {
  kind: TakeKindForLeaves;
  durationSeconds: number;
  transcript: string | null;
  // Lined up with the voice (dsp/wordTrim.ts), when the audio track is there.
  words: TranscriptWord[] | null;
  features: AudioFeatures | null;
  timeline: PresenceSample[] | null;
  calibration: FaceCalibration | null;
  pauses: PauseAnalysis | null;
  summary: SignalSummary | null;
  presence: PresenceMetrics | null;
  coach: { hedges: string[]; strongEnding: boolean | null; structure: { framework: string; beatsFound: number } } | null;
  // Stuttering: fillers, stalls and restarts aren't measured against you.
  stutterMode: boolean;
  repeatedWordCount: number | null;
  // Seconds of prep; 0 or null is a cold start.
  prepSeconds: number | null;
  scriptText: string | null;
  budgetSeconds?: number | null;
  pitchBand?: PitchRangeBand;
  judged?: Partial<Record<LeafId, { score: number; notes: string | null }>>;
}

// Under this much of the take in frame, the face scores are left out.
const MIN_PRESENT_PERCENT = 40;

function sentencesOf(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function plainness(text: string): { wordsPerSentence: number; longWordShare: number } | null {
  const words = text.split(/\s+/).filter((w) => /[a-z]/i.test(w));
  if (!words.length) return null;
  const long = words.filter((w) => countSyllables(w) >= 3).length;
  return { wordsPerSentence: words.length / Math.max(sentencesOf(text).length, 1), longWordShare: long / words.length };
}

function endingOf(strong: boolean | null | undefined, trailing: { sentences: number; trailing: number } | null | undefined): EndingKind | null {
  if (strong == null) return null;
  if (!strong) return "trailing";
  // The words end cleanly. If the voice mostly drops away at sentence ends, it's
  // neutral rather than clear (plan 6.4, rule 10: words and voice together).
  return trailing && trailing.sentences >= 2 && trailing.trailing / trailing.sentences > 0.5 ? "neutral" : "clear";
}

function firstVoiceSeconds(features: AudioFeatures | null, words: TranscriptWord[] | null): number | null {
  if (features) {
    const at = features.speech.findIndex((v) => v === 1);
    if (at >= 0) return (at * features.hopMs + features.offsetMs) / 1000;
  }
  return words?.length ? words[0].startMs / 1000 : null;
}

function presenceFacts(input: TakeFactsInput): TakeFacts["presence"] {
  const { presence, timeline, calibration, features } = input;
  if (!presence || presence.samples <= 0 || presence.presentPercent < MIN_PRESENT_PERCENT) return null;
  const movesOf = () => {
    const m = timeline ? faceMovement(timeline, calibration) : null;
    return m ? m.browLiftsPerMinute + m.smilesPerMinute : null;
  };
  const groups = timeline
    ? groupLooks(calibration ? normalizeTimeline(timeline, calibration) : timeline, {
        ...(calibration ? { thresholds: calibratedThresholds(calibration) } : {}),
        ...(features ? { speechSpans: splitPhrases(features) } : {}),
      })
    : null;
  // A take with no stored track has only the plain share to go on.
  if (!groups || groups.onLensPercentSpeaking == null) {
    return { onLensPercent: presence.eyeContactPercent, longLookAwaysPerMinute: 0, faceMovesPerMinute: movesOf() };
  }
  return { onLensPercent: groups.onLensPercentSpeaking, longLookAwaysPerMinute: groups.longLookAwaysPerMinute, faceMovesPerMinute: movesOf() };
}

export function buildTakeFacts(input: TakeFactsInput): TakeFacts {
  const { kind, durationSeconds, transcript, words, features, summary, coach, stutterMode } = input;
  const minutes = Math.max(durationSeconds / 60, 0.5);
  const text = transcript?.trim() ? transcript : null;
  const typed = text ? computeFillerStats(text, durationSeconds) : null;
  const rambling = text ? ramblingMetrics({ transcript: text, durationSeconds }) : null;
  const stress = features ? scoreSyllablePeaks(features, words) : null;
  const plain = text ? plainness(text) : null;
  const trailing = summary?.prosody?.trailingOff ?? null;

  let readAccuracyPercent: number | null = null;
  if (kind === "script" && input.scriptText && text) {
    const target = buildTarget(input.scriptText, 1);
    const heard = tokenizeHeard(text);
    readAccuracyPercent = scoreAlignment(target, heard.tokens, alignFinal(target, heard.tokens), { speakingMs: durationSeconds * 1000 }).accuracyPercent;
  }

  return {
    kind,
    durationSeconds,
    wordCount: text ? text.split(/\s+/).filter((w) => /[a-z0-9]/i.test(w)).length : 0,
    wpm: summary?.rate?.speakingWpm ?? speakingWpm(words),
    paceSdSylPerSec: summary?.rate?.paceSdSylPerSec ?? null,
    paceDriftPercent: summary?.rate?.paceDriftPercent ?? null,
    boundaryPauseRate: input.pauses?.boundaryPauseRate ?? null,
    pitchPhraseSdSt: features ? phrasePitchVariation(features).weightedMeanSdSt : null,
    pitchBand: input.pitchBand,
    endings: summary?.prosody?.uptalk ?? null,
    standOut: stress?.standOut ?? null,
    strongOnContentShare: stress?.contentShare ?? null,
    lastWordCarry: trailing,
    fillers: !stutterMode && typed ? { hesitationPerMinute: typed.hesitation.ratePerMinute, contextualPerMinute: typed.contextual.ratePerMinute } : null,
    stalls: !stutterMode && input.pauses ? input.pauses.hesitations : null,
    restarts: !stutterMode && rambling ? rambling.restarts + (input.repeatedWordCount ?? 0) : null,
    readAccuracyPercent,
    presence: presenceFacts(input),
    hedges: coach ? coach.hedges.length : null,
    ending: endingOf(coach?.strongEnding, trailing),
    pointFirst: rambling ? rambling.pointFirst : null,
    structure: coach ? { framework: coach.structure.framework, shaped: coach.structure.framework !== "None", beatsFound: coach.structure.beatsFound } : null,
    wordsPerSentence: plain?.wordsPerSentence ?? null,
    longWordShare: plain?.longWordShare ?? null,
    detoursPerMinute: rambling ? rambling.tangentMarkers / minutes : null,
    detailsPerMinute: text ? countDetails(text).total / minutes : null,
    secondsToFirstWord: kind === "impromptu" && !input.prepSeconds ? firstVoiceSeconds(features, words) : null,
    budgetSeconds: input.budgetSeconds,
    judged: input.judged,
  };
}
