// Pauses and loudness from the live recognizer's volume meter (readings
// roughly every 100 ms on a -2..10 scale, <= 0 meaning inaudible). Used by
// drills that run on live speech recognition, where there's no audio file.

export interface VolumeReading {
  tMs: number;
  value: number;
}

export interface VolumePauseSummary {
  speechStartMs: number | null;
  speechEndMs: number | null;
  pauses: { startMs: number; durationMs: number }[];
  // voiced readings / readings between first and last speech
  spokeRatio: number;
  // share of voiced readings at or above `target` (projection drill)
  fractionAtTarget: number | null;
}

export function summarizeVolume(readings: VolumeReading[], minPauseMs: number, target?: number, silence = 0): VolumePauseSummary {
  const voiced = readings.map((r) => r.value > silence);
  const first = voiced.indexOf(true);
  const last = voiced.lastIndexOf(true);
  if (first === -1) return { speechStartMs: null, speechEndMs: null, pauses: [], spokeRatio: 0, fractionAtTarget: target != null ? 0 : null };

  const pauses: { startMs: number; durationMs: number }[] = [];
  let runStart: number | null = null;
  let voicedCount = 0;
  let atTarget = 0;
  for (let i = first; i <= last; i++) {
    if (voiced[i]) {
      voicedCount += 1;
      if (target != null && readings[i].value >= target) atTarget += 1;
      if (runStart !== null) {
        const durationMs = readings[i].tMs - readings[runStart].tMs;
        if (durationMs >= minPauseMs) pauses.push({ startMs: readings[runStart].tMs, durationMs });
        runStart = null;
      }
    } else if (runStart === null) {
      runStart = i;
    }
  }
  return {
    speechStartMs: readings[first].tMs,
    speechEndMs: readings[last].tMs,
    pauses,
    spokeRatio: voicedCount / (last - first + 1),
    fractionAtTarget: target != null ? atTarget / Math.max(voicedCount, 1) : null,
  };
}

// Words for fluency drills: unique, not filler or function words.
const STOPWORDS = new Set(
  "a an the and or but so um uh er erm ah like i you he she it we they me my your is are was were be been am do did does have has had of to in on at for with um okay ok yeah yes no oh and then also um hmm".split(" "),
);

export function uniqueContentWords(tokens: string[], startsWith?: string): string[] {
  const seen = new Set<string>();
  for (const t of tokens) {
    const w = t.toLowerCase().replace(/[^a-z']/g, "");
    if (w.length < 2 || STOPWORDS.has(w)) continue;
    if (startsWith && !w.startsWith(startsWith)) continue;
    // fold simple plurals so "cat" and "cats" count once
    const key = w.length > 3 && w.endsWith("s") && !w.endsWith("ss") ? w.slice(0, -1) : w;
    seen.add(key);
  }
  return [...seen];
}

// Whether a required story word was worked in (allows plurals/-ing/-ed).
export function usedWord(tokens: string[], word: string): boolean {
  const target = word.toLowerCase();
  const stem = target.replace(/(e|s|es)$/, "");
  return tokens.some((t) => {
    const w = t.toLowerCase().replace(/[^a-z]/g, "");
    return w === target || (stem.length >= 3 && w.startsWith(stem));
  });
}
