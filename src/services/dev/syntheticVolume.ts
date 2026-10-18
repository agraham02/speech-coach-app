// Speech-like volume readings (-2..10, like the recognizer's meter) for the
// Dev tab's waveform preview, so the live waveform can be watched without
// talking. Delivered at a chosen rate, optionally uneven, the way an iPhone
// delivers them: about every 100 ms, give or take.

export type Cadence = { label: string; everyMs: number; unevenMs: number };

export const CADENCES: Cadence[] = [
  { label: "20 a second", everyMs: 50, unevenMs: 0 },
  { label: "10 a second", everyMs: 100, unevenMs: 0 },
  { label: "10, uneven (iPhone-like)", everyMs: 100, unevenMs: 45 },
];

// Four syllables a second, a breath between sentences of about three seconds.
function readingAt(seconds: number): number {
  const sentence = seconds % 3.6;
  if (sentence > 3) return -1;
  const syllable = Math.abs(Math.sin(sentence * Math.PI * 4));
  const emphasis = 0.55 + 0.45 * Math.sin(seconds * 1.3);
  return Math.max(0, 2 + syllable * 6 * emphasis + (Math.random() - 0.5) * 1.2);
}

export function syntheticVolume(cadence: Cadence): (listener: (value: number) => void) => () => void {
  return (listener) => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const started = Date.now();
    const tickOnce = () => {
      if (stopped) return;
      listener(readingAt((Date.now() - started) / 1000));
      const wobble = cadence.unevenMs ? (Math.random() * 2 - 1) * cadence.unevenMs : 0;
      timer = setTimeout(tickOnce, Math.max(10, cadence.everyMs + wobble));
    };
    timer = setTimeout(tickOnce, cadence.everyMs);
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  };
}
