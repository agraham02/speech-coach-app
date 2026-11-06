import type { TranscriptWord } from "../sessionTypes";
import { SPEECH, type AudioFeatures } from "./audioFeatures";

// Takes the silence out of Whisper's word times. Whisper starts its first word
// at the top of the clip whatever is there, and can run a last word past the end
// of the voice: on a real read the first word "started" at 50 ms and the voice at
// 1,676 ms, which made the pace read 4% slow. So a word edge sitting in silence
// moves to the voice beside it, and nothing else moves. Stretching all the words
// to fit the voice was tried and was worse: mid-take, Whisper's ends were already
// within about 100 ms of the real pauses, and moving them lost half of them and
// every rising question. Pure. The stored transcript keeps Whisper's own times.

type Track = Pick<AudioFeatures, "speech" | "hopMs" | "offsetMs">;

// A blip of voice shorter than this doesn't count as the voice starting.
const MIN_RUN_FRAMES = 10;

export function trimWordsToVoice<W extends TranscriptWord>(words: W[] | null | undefined, features: Track): W[] | null {
  if (!words || words.length === 0) return words ?? null;
  const { speech, hopMs, offsetMs } = features;
  const n = speech.length;
  const frameAt = (ms: number) => Math.max(0, Math.min(n - 1, Math.round((ms - offsetMs) / hopMs)));
  const timeOf = (i: number) => Math.round(offsetMs + i * hopMs);

  // For each frame, whether it belongs to a run of voice long enough to count.
  const voiced = new Uint8Array(n);
  let found = false;
  for (let i = 0; i < n; ) {
    if (speech[i] !== SPEECH) {
      i++;
      continue;
    }
    let j = i;
    while (j < n && speech[j] === SPEECH) j++;
    if (j - i >= MIN_RUN_FRAMES) {
      voiced.fill(1, i, j);
      found = true;
    }
    i = j;
  }
  if (!found) return words;

  const nextVoice = (i: number) => {
    for (let k = i; k < n; k++) if (voiced[k]) return k;
    return -1;
  };
  const prevVoice = (i: number) => {
    for (let k = i; k >= 0; k--) if (voiced[k]) return k;
    return -1;
  };

  const out = words.map((w) => ({ ...w }));
  for (const w of out) {
    const startFrame = frameAt(w.startMs);
    if (!voiced[startFrame]) {
      const next = nextVoice(startFrame);
      if (next !== -1) w.startMs = timeOf(next);
    }
    const endFrame = frameAt(w.endMs);
    if (!voiced[endFrame]) {
      const prev = prevVoice(endFrame);
      if (prev !== -1) w.endMs = timeOf(prev);
    }
    // A word that sat wholly in silence ends up with no length, at the voice.
    if (w.endMs < w.startMs) w.endMs = w.startMs;
  }
  // Keep them in order after the moves.
  for (let i = 1; i < out.length; i++) {
    if (out[i].startMs < out[i - 1].endMs) out[i - 1].endMs = Math.max(out[i - 1].startMs, out[i].startMs);
  }
  return out;
}
