import { centerTimeline, classifyLook, DEFAULT_PRESENCE_THRESHOLDS, type PresenceSample, type PresenceThresholds } from "./presenceMetrics";

// A candidate way to score eye contact (docs/overhaul/PLAN.md, section 6.5,
// table C). Today every frame counts the same, whether a look-away lasts a
// quarter of a second or ten, and the whole take is counted, not just the time
// you are speaking. This groups frames into looks and look-aways instead:
//  - a look-away shorter than FORGIVE_BELOW_MS counts as looking (a natural
//    glance, not a lost audience);
//  - a look-away of LONG_LOOKAWAY_MS or more is counted as a long look-away,
//    twice when the eyes went down (notes, or your own preview);
//  - only the time you are speaking is scored when speech spans are given.
// Pure. Nothing here replaces computePresenceMetrics; Signal Lab compares the
// two (presence.glances).

export const FORGIVE_BELOW_MS = 1200;
export const LONG_LOOKAWAY_MS = 3000;

// A gap between samples longer than this (the face detector dropping out)
// counts as this much, so one lost second can't stretch a look-away.
const MAX_SAMPLE_MS = 250;
const DEFAULT_SAMPLE_MS = 50;

export interface SpeechSpan {
  startMs: number;
  endMs: number;
}

export interface LookGroupOptions {
  thresholds?: PresenceThresholds;
  // Look-aways shorter than this count as looking.
  forgiveBelowMs?: number;
  // Look-aways of at least this long are long look-aways.
  longAtMs?: number;
  // When given, only these stretches of the take are scored. A look-away is
  // still grouped across a pause (looking away through a pause is still
  // looking away); it counts when any part of it falls in speech.
  speechSpans?: SpeechSpan[];
}

export interface LookGroups {
  // Of the time you were speaking (the whole take with no spans): the share
  // spent looking at the lens, with short look-aways counted as looking.
  // A missing face counts as looking away. 0-100, one decimal.
  onLensPercentSpeaking: number | null;
  // Long look-aways, with a look-away that had the eyes down counted twice.
  longLookAways: number;
  // The same count without the doubling: how many separate long look-aways.
  longLookAwayEvents: number;
  longLookAwaysPerMinute: number;
  // Short look-aways that were forgiven, and the time they added up to.
  glancesForgiven: number;
  forgivenMs: number;
  // Today's figure for comparison: the share of samples with a face that are
  // looking, over the whole take, every frame counted the same
  // (PresenceMetrics.eyeContactPercent without rounding to a whole number).
  plainOnLensPercent: number;
  // The longest single look-away, forgiven or not.
  longestLookAwayMs: number;
  speakingMs: number;
  samples: number;
}

interface Run {
  looking: boolean;
  from: number;
  to: number; // inclusive
  durMs: number;
  downSamples: number;
}

const round1 = (v: number) => Math.round(v * 10) / 10;

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function groupLooks(rawTimeline: PresenceSample[], opts: LookGroupOptions = {}): LookGroups | null {
  if (rawTimeline.length < 3) return null;
  const timeline = centerTimeline(rawTimeline);
  const t = opts.thresholds ?? DEFAULT_PRESENCE_THRESHOLDS;
  const forgiveBelowMs = opts.forgiveBelowMs ?? FORGIVE_BELOW_MS;
  const longAtMs = opts.longAtMs ?? LONG_LOOKAWAY_MS;
  const spans = opts.speechSpans;

  const n = timeline.length;
  const gaps: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    const d = timeline[i + 1].tMs - timeline[i].tMs;
    if (d > 0) gaps.push(Math.min(d, MAX_SAMPLE_MS));
  }
  const lastMs = gaps.length ? median(gaps) : DEFAULT_SAMPLE_MS;
  const dts = timeline.map((s, i) => (i < n - 1 ? Math.max(0, Math.min(timeline[i + 1].tMs - s.tMs, MAX_SAMPLE_MS)) : lastMs));

  const hasGaze = timeline.some((s) => s.present && s.gazeX !== undefined);
  const looks = timeline.map((s) => classifyLook(s, t, hasGaze));
  const speaking = timeline.map((s) => (spans ? spans.some((sp) => s.tMs >= sp.startMs && s.tMs < sp.endMs) : true));

  const runs: Run[] = [];
  for (let i = 0; i < n; i++) {
    const looking = looks[i].looking;
    const last = runs[runs.length - 1];
    const down = !looking && looks[i].direction === "down" ? 1 : 0;
    if (last && last.looking === looking) {
      last.to = i;
      last.durMs += dts[i];
      last.downSamples += down;
    } else {
      runs.push({ looking, from: i, to: i, durMs: dts[i], downSamples: down });
    }
  }

  const counted = timeline.map((_, i) => looks[i].looking);
  let glancesForgiven = 0;
  let forgivenMs = 0;
  let longLookAways = 0;
  let longLookAwayEvents = 0;
  let longestLookAwayMs = 0;
  for (const run of runs) {
    if (run.looking) continue;
    longestLookAwayMs = Math.max(longestLookAwayMs, run.durMs);
    const inSpeech = speaking.slice(run.from, run.to + 1).some(Boolean);
    if (run.durMs < forgiveBelowMs) {
      for (let i = run.from; i <= run.to; i++) counted[i] = true;
      if (inSpeech) {
        glancesForgiven += 1;
        forgivenMs += run.durMs;
      }
    } else if (run.durMs >= longAtMs && inSpeech) {
      longLookAwayEvents += 1;
      longLookAways += run.downSamples * 2 > run.to - run.from + 1 ? 2 : 1;
    }
  }

  let speakingMs = 0;
  let onLensMs = 0;
  for (let i = 0; i < n; i++) {
    if (!speaking[i]) continue;
    speakingMs += dts[i];
    if (counted[i]) onLensMs += dts[i];
  }

  const presentCount = timeline.reduce((c, s) => c + (s.present ? 1 : 0), 0);
  const plainLooking = timeline.reduce((c, s, i) => c + (s.present && looks[i].looking ? 1 : 0), 0);

  return {
    onLensPercentSpeaking: speakingMs > 0 ? round1((onLensMs / speakingMs) * 100) : null,
    longLookAways,
    longLookAwayEvents,
    longLookAwaysPerMinute: round1(longLookAways / (Math.max(speakingMs, 1000) / 60000)),
    glancesForgiven,
    forgivenMs: Math.round(forgivenMs),
    plainOnLensPercent: presentCount ? round1((plainLooking / presentCount) * 100) : 0,
    longestLookAwayMs: Math.round(longestLookAwayMs),
    speakingMs: Math.round(speakingMs),
    samples: n,
  };
}
