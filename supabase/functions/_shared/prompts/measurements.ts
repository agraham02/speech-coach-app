import { z } from "zod";

// What the phone measured about a take, as numbers. The server turns them
// into the prompt's "MEASURED ON THE PHONE" lines; the judge uses them as
// evidence and must never contradict them. Pure.

const n = z.number().finite();
const pct = z.number().min(0).max(100);

export const measurementsSchema = z.object({
  durationSeconds: n.nonnegative().max(3600),
  pace: z.object({ wpm: n.nonnegative().max(600), min: n.nonnegative().max(600).nullable(), max: n.nonnegative().max(600).nullable() }).nullable(),
  // Left out for someone who stutters: fillers are never measured against them.
  fillers: z
    .object({ total: z.number().int().min(0), perMinute: n.min(0).nullable(), hesitation: z.number().int().min(0), contextual: z.number().int().min(0) })
    .nullable(),
  repeatedWords: z.number().int().min(0).nullable(),
  pauses: z
    .object({
      perMinute: n.min(0),
      longestSeconds: n.min(0),
      // Mid-phrase gaps of 2 s or more; null for someone who stutters.
      hesitations: z.number().int().min(0).nullable(),
      // Share of sentence endings followed by a real pause, 0 to 1.
      boundaryShare: n.min(0).max(1).nullable(),
      firstWordSeconds: n.min(0).nullable(),
    })
    .nullable(),
  pitch: z.object({ medianHz: n.min(0).max(2000), rangeSemitones: n.min(0).max(60), sdSemitones: n.min(0).max(60).nullable() }).nullable(),
  loudness: z.object({ spreadDb: n.min(0).max(120), peakSdDb: n.min(0).max(60).nullable() }).nullable(),
  face: z
    .object({
      framedPercent: pct,
      eyeContactPercent: pct,
      eyeSource: z.enum(["eyes", "head"]),
      lookingDownPercent: pct.nullable(),
      lookingUpPercent: pct.nullable(),
      longestLookAwaySeconds: n.min(0),
      expressiveness: pct,
      smilePercent: pct,
      browRaisesPerMinute: n.min(0).nullable(),
      tensePercent: pct.nullable(),
      headMovementDeg: n.min(0).max(360),
      headTiltDeg: n.min(-180).max(180).nullable(),
    })
    .nullable(),
});

export type Measurements = z.infer<typeof measurementsSchema>;

const round = (value: number, digits = 0) => Number(value.toFixed(digits));

export function measurementLines(m: Measurements): string[] {
  const lines: string[] = [`- Duration: ${Math.round(m.durationSeconds)} s`];
  if (m.pace) {
    const range = m.pace.min != null && m.pace.max != null && m.pace.max > m.pace.min ? ` (from ${Math.round(m.pace.min)} to ${Math.round(m.pace.max)} wpm across the take)` : "";
    lines.push(`- Pace: ${Math.round(m.pace.wpm)} words per minute on average while speaking${range}`);
  }
  if (m.fillers) {
    const rate = m.fillers.perMinute != null ? ` (${round(m.fillers.perMinute, 1)} per minute)` : "";
    lines.push(
      `- Filler words: ${m.fillers.total}${rate}: ${m.fillers.hesitation} um/uh sounds, ${m.fillers.contextual} context fillers such as "like", "you know" or "actually" used as filler`,
    );
  }
  if (m.repeatedWords) lines.push(`- Repeated words (the same word twice in a row): ${m.repeatedWords}`);
  if (m.pauses) {
    const parts = [`${round(m.pauses.perMinute, 1)} pauses per minute`, `longest ${round(m.pauses.longestSeconds, 1)} s`];
    if (m.pauses.hesitations != null) parts.push(`${m.pauses.hesitations} hesitations (mid-phrase gaps of 2 s or more)`);
    if (m.pauses.boundaryShare != null) parts.push(`${Math.round(m.pauses.boundaryShare * 100)}% of sentence endings followed by a real pause`);
    lines.push(`- Pauses: ${parts.join("; ")}`);
    if (m.pauses.firstWordSeconds != null) lines.push(`- Time before the first word: ${round(m.pauses.firstWordSeconds, 1)} s`);
  }
  if (m.pitch) {
    const sd = m.pitch.sdSemitones != null ? ` (SD ${round(m.pitch.sdSemitones, 1)} semitones)` : "";
    lines.push(
      `- Pitch: median ${Math.round(m.pitch.medianHz)} Hz; the middle 80% of the voice spans ${round(m.pitch.rangeSemitones, 1)} semitones${sd} (under about 2.5 semitones tends to sound monotone; 4 to 6 is lively conversation)`,
    );
  }
  if (m.loudness) {
    const peaks = m.loudness.peakSdDb != null ? `; syllable peaks vary by ${round(m.loudness.peakSdDb, 1)} dB (SD; under about 2 dB reads flat, 3 dB or more is varied emphasis)` : "";
    lines.push(`- Loudness while speaking (pauses left out): a ${round(m.loudness.spreadDb, 1)} dB range between quiet and loud moments${peaks}`);
  }
  if (m.face) {
    const f = m.face;
    const face = [
      `in frame ${Math.round(f.framedPercent)}% of the time`,
      `eye contact with the lens ${Math.round(f.eyeContactPercent)}% (${f.eyeSource === "head" ? "from head direction only" : "from where the eyes point"})`,
    ];
    if (f.lookingDownPercent != null) face.push(`looking down ${Math.round(f.lookingDownPercent)}%`);
    if (f.lookingUpPercent != null) face.push(`looking up ${Math.round(f.lookingUpPercent)}%`);
    face.push(`longest look-away ${round(f.longestLookAwaySeconds, 1)} s`);
    face.push(`expressiveness ${Math.round(f.expressiveness)}/100`);
    face.push(`smiling ${Math.round(f.smilePercent)}%`);
    if (f.browRaisesPerMinute != null) face.push(`${round(f.browRaisesPerMinute, 1)} eyebrow raises per minute`);
    if (f.tensePercent != null) face.push(`tense (frowning or pressed lips) ${Math.round(f.tensePercent)}%`);
    face.push(`head movement ${round(f.headMovementDeg, 1)}°`);
    if (f.headTiltDeg != null) face.push(`typical head tilt ${round(f.headTiltDeg, 1)}°`);
    lines.push(`- Face (camera): ${face.join("; ")}`);
  } else {
    lines.push("- Face: not measured for this take (no camera data).");
  }
  return lines;
}
