// The bands that turn a measurement into a 0-10 sub-score, in one place.
// The measured score sheet, the rule coach's verdicts and the skill check all
// read these, so "a good pace" is the same pace everywhere. Each band is a
// judgment call from published norms, not calibrated on labelled takes yet;
// the doc lists which ones session 06's Voice Lab data should retune. Pure.

const clamp10 = (n: number) => Math.max(0, Math.min(10, n));

// Pace: full marks between 130 and 160 words a minute; every 7 outside costs
// a point.
export const PACE_BAND = { low: 130, high: 160, perPoint: 7 } as const;

export function paceScore(wpm: number): number {
  const distance = wpm < PACE_BAND.low ? PACE_BAND.low - wpm : wpm > PACE_BAND.high ? wpm - PACE_BAND.high : 0;
  return clamp10(10 - distance / PACE_BAND.perPoint);
}

// Pauses: full marks once 60% of sentence ends get a real pause.
export const PAUSE_FULL_RATE = 0.6;

export function pauseScore(boundaryPauseRate: number): number {
  return clamp10((boundaryPauseRate / PAUSE_FULL_RATE) * 10);
}

// Pitch variety: the p10 to p90 spread of the voice in semitones around the
// speaker's own median (domain/dsp/pitchTracker.ts). Semitones make it fair to
// every voice: the same musical movement is half as many Hz at 100 Hz as at
// 200 Hz, so the old Hz scoring asked a low voice to move twice as far.
//
// The band starts fixed and becomes personal after 5 or more of your own
// takes with a measured range. The fixed numbers come from session 05's
// research, not yet from the Voice Lab takes on the phone: through a
// simulated phone chain the tracker read a monotone voice at 2.1 st, a normal
// one at 3.9 and a lively one at 5.5 (truth 1.9, 3.8 and 5.3); Ahmad's own
// takes read 2.4 to 5.8. So 1 st scores 0 and 5 st full marks: monotone about
// 3/10, ordinary 7, lively 10. Retune with the device test plan, section F.
// A range is only measured from 8 or more voiced seconds with the voice 12 dB
// or more over the noise (domain/signals/audioSummary.pitchRangeScorable).

export interface PitchRangeBand {
  // Range that scores 0, and the range that earns full marks.
  zeroSt: number;
  fullSt: number;
  source: "fixed" | "personal";
  // Your own takes the personal band was set from (0 for the fixed band).
  takes: number;
  // Your usual range (the median of those takes), when personal.
  usualSt: number | null;
}

export const FIXED_PITCH_BAND: PitchRangeBand = { zeroSt: 1, fullSt: 5, source: "fixed", takes: 0, usualSt: null };

export const PERSONAL_BASELINE_MIN_TAKES = 5;
export const PERSONAL_BASELINE_MAX_TAKES = 20;
// Full marks a little over your usual range, but never below 4 st (a habit
// of speaking flat must not set the bar at flat) and never above 6 st (a
// naturally lively speaker isn't asked for theatre).
const PERSONAL_STRETCH_ST = 0.5;
const PERSONAL_FULL_MIN_ST = 4;
const PERSONAL_FULL_MAX_ST = 6;

// Under this the coach and the skill check call the voice flat.
export const PITCH_FLAT_ST = 2.5;

// `prior`: earlier takes' ranges, newest first.
export function pitchRangeBand(prior: number[]): PitchRangeBand {
  const recent = prior.filter((v) => Number.isFinite(v) && v > 0).slice(0, PERSONAL_BASELINE_MAX_TAKES);
  if (recent.length < PERSONAL_BASELINE_MIN_TAKES) return FIXED_PITCH_BAND;
  const sorted = [...recent].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const usual = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  const full = Math.max(PERSONAL_FULL_MIN_ST, Math.min(PERSONAL_FULL_MAX_ST, usual + PERSONAL_STRETCH_ST));
  return {
    zeroSt: FIXED_PITCH_BAND.zeroSt,
    fullSt: Math.round(full * 10) / 10,
    source: "personal",
    takes: recent.length,
    usualSt: Math.round(usual * 10) / 10,
  };
}

export function pitchScore(rangeSt: number, band: PitchRangeBand = FIXED_PITCH_BAND): number {
  return clamp10(((rangeSt - band.zeroSt) / (band.fullSt - band.zeroSt)) * 10);
}

// Emphasis (session 06's syllable-peak spread): monotone read 1.65 dB and a
// normal or lively voice about 3 dB in the spike. Full marks at 3 dB, nothing
// at 1 dB. Uncalibrated.
export function emphasisScore(peakSdDb: number): number {
  return clamp10(((peakSdDb - 1) / 2) * 10);
}

// Fillers: the first 2 a minute go unnoticed; each one after costs 0.8.
// Contextual fillers (like, actually) count at half, because some of them
// aren't fillers at all and the context rule is conservative.
export const FILLERS_FREE_PER_MINUTE = 2;
export const CONTEXTUAL_FILLER_WEIGHT = 0.5;

export function fillerScore(hesitationPerMinute: number, contextualPerMinute = 0): number {
  const effective = hesitationPerMinute + CONTEXTUAL_FILLER_WEIGHT * contextualPerMinute;
  return clamp10(10 - Math.max(0, effective - FILLERS_FREE_PER_MINUTE) * 0.8);
}

// Stalls: each mid-phrase gap of 2 s or more, a minute, costs 2 points.
export function stallScore(stalls: number, durationSeconds: number): number {
  return clamp10(10 - stallsPerMinute(stalls, durationSeconds) * 2);
}

export function stallsPerMinute(stalls: number, durationSeconds: number): number {
  return stalls / Math.max(durationSeconds / 60, 0.5);
}

// Eye contact: full marks at 75% on the lens with gaze tracking, 90% when only
// the head direction was known.
export function eyeContactTarget(source: "gaze" | "head" | undefined): number {
  return source === "head" ? 90 : 75;
}

export function eyeContactScore(percent: number, source: "gaze" | "head" | undefined): number {
  return clamp10((percent / eyeContactTarget(source)) * 10);
}

// Expression: full marks at 30 on the 0-100 scale. Since session 06 the
// metric leaves out the jaw (it moved with every syllable and saturated);
// its scale (presenceMetrics EXPRESSION_SCALE) was set so 30 still means a
// face that moves with the words. Retune with the device test plan, F.
export const EXPRESSION_FULL = 30;

export function expressionScore(expressiveness: number): number {
  return clamp10((expressiveness / EXPRESSION_FULL) * 10);
}

// Conviction: starts at 8; a clear ending adds 1, trailing off costs 2, and
// each hedge after the first two costs 0.5 (up to 3).
export function convictionScore(hedges: number, strongEnding: boolean | null): number {
  const ending = strongEnding === true ? 1 : strongEnding === false ? -2 : 0;
  return clamp10(8 + ending - hedgeCost(hedges));
}

export function hedgeCost(hedges: number): number {
  return Math.min(3, Math.max(0, hedges - 2) * 0.5);
}

// Structure as the phone's rules see it: a recognised shape starts at 8, none
// at 4; a rep that asked for a framework and got another is capped at 5.
export function structureScore(shaped: boolean, missedTarget: boolean): number {
  const base = shaped ? 8 : 4;
  return missedTarget ? Math.min(base, 5) : base;
}

// A sub-score as the coach card's dot: good, ok or work on.
export type Verdict = "good" | "ok" | "work";

export function verdictFor(score: number): Verdict {
  return score >= 8 ? "good" : score >= 6 ? "ok" : "work";
}
