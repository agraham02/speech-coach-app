// The per-take feature track ("signals" artifact): what the phone measured,
// stored small and versioned, so every summary and score can be recomputed
// from it after the video (and with it the audio) is gone, and so a take
// measured by an older extractor can be told apart. See
// docs/research/signal-capture.md, section 8. Words are not copied in: the
// take's own transcript words (sessions.transcript_words_json) are kept with
// it and are what the summaries were built against.

export const SIGNALS_SCHEMA = 1;

export interface Extractor {
  name: string;
  version: string;
  // Where it ran: a background worklet runtime or the JS thread.
  thread?: "worklet" | "js";
  elapsedMs?: number;
}

// The audio track, 10 ms frames. Arrays are packed (domain/signals/pack.ts).
export interface AudioTrack {
  extractor: Extractor;
  // The rate the audio was analysed at (decoded from the take's AAC track).
  sampleRate: number;
  hopMs: number;
  offsetMs: number;
  frames: number;
  // Int16 cents over 55 Hz; UNVOICED_CENTS = no pitch.
  f0Cents: string;
  // Uint8 0-255, the pitch tracker's confidence.
  f0Confidence: string;
  // Int16 centi-dBFS, wideband 10 ms level.
  levelCdB: string;
  // Uint8 per frame: 0 pause, 1 speech, 2 breath.
  speech: string;
  // Uint32 frame indices of syllable peaks.
  peaks: string;
  noiseFloorDb: number;
}

// The face track, one entry per face detection (irregular, about 15 to 20 a
// second while recording).
export interface FaceTrack {
  extractor: Extractor & { thresholdsVersion: number };
  rateHz: number;
  samples: number;
  // Uint32 ms since recording started.
  tMs: string;
  // Uint8 bit flags: 1 = face present, 2 = well framed.
  flags: string;
  // Int16 tenths of a degree.
  yawDeg: string;
  pitchDeg: string;
  rollDeg: string;
  // Int16 thousandths, eyes relative to the head (-1..1), as presence reads them.
  gazeX: string;
  gazeY: string;
  // Uint8 blinks finished since the previous entry.
  blinks: string;
  // BLENDSHAPE_NAMES.length Uint8 (0-255) per entry, in that order. Empty
  // when the detections carried none.
  blendshapes: string;
}

export interface PitchStats {
  voicedSeconds: number;
  // Voiced frames as a share of speech frames.
  voicedShare: number;
  medianHz: number | null;
  sdSemitones: number | null;
  rangeSemitones: number | null;
  meanConfidence: number | null;
}

export interface LoudnessStats {
  // Median 50 ms loudness while speaking.
  speechMedianDbfs: number;
  // p90 - p10 of 50 ms loudness while speaking: dynamic range.
  spreadDb: number;
  // SD of syllable-peak levels: emphasis variation. Null under 5 peaks.
  syllablePeakSdDb: number | null;
  // Speaking level over the noise floor: how clearly the voice stands out.
  snrDb: number;
}

export interface PauseStats {
  count: number;
  perMinute: number;
  meanMs: number;
  longestMs: number;
  boundaryRate: number | null;
  midPhrase: number;
  hesitations: number;
  breaths: number;
  breathsPerMinute: number;
}

export interface RateStats {
  // Words a minute over the speaking span (first word to last).
  speakingWpm: number;
  // Syllables a second while actually talking (pauses taken out).
  articulationSylPerSec: number | null;
  // SD of the articulation rate across phrases.
  paceSdSylPerSec: number | null;
  // Second half against first half, percent (positive = sped up).
  paceDriftPercent: number | null;
}

export interface ProsodyStats {
  emphasis: { strongPeaks: number; onContentWords: number | null } | null;
  // Statements whose last 300 ms rose by 2.5 semitones or more.
  uptalk: { statements: number; rising: number } | null;
  // Sentences whose last word fell 6 dB or more under the sentence's level.
  trailingOff: { sentences: number; trailing: number } | null;
  // Wordless, voiced, flat stretches between words: an "um" the transcript
  // may have missed.
  possibleMissedFillers: { count: number; atMs: number[] };
}

export interface FillerTypeCounts {
  hesitation: number;
  contextual: number;
  hesitationPerMinute: number;
  contextualPerMinute: number;
}

export interface PresenceStats {
  eyeContactShare: number;
  lookingDownShare: number | null;
  lookingUpShare: number | null;
  blinksPerMinute: number;
  expressiveness: number;
  headMovementDeg: number;
  nodsPerMinute: number | null;
  smileShare: number;
}

export interface SignalSummary {
  pitch: PitchStats | null;
  loudness: LoudnessStats | null;
  pauses: PauseStats | null;
  rate: RateStats | null;
  prosody: ProsodyStats | null;
  fillers: FillerTypeCounts | null;
  presence: PresenceStats | null;
  // Reasons a number should not be trusted ("few voiced seconds", "noisy",
  // "face lost 40% of the time").
  lowConfidence: string[];
}

export interface TakeSignals {
  schema: typeof SIGNALS_SCHEMA;
  durationMs: number;
  audio: AudioTrack | null;
  face: FaceTrack | null;
  summary: SignalSummary;
}

export function emptySummary(): SignalSummary {
  return { pitch: null, loudness: null, pauses: null, rate: null, prosody: null, fillers: null, presence: null, lowConfidence: [] };
}
