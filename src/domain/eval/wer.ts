// Transcription-quality metrics for the ASR Lab (Dev screen), used to pick
// the default on-device engine from real numbers rather than marketing.

const FILLER_RE = /^(um+|uh+|uhm+|erm?|ah+|hmm+)$/;

// Engines write numbers either way ("the 1st time", "3 times"): spell the
// small ones out so formatting does not count as a mistake.
const NUMBER_WORDS: Record<string, string> = {
  "0": "zero", "1": "one", "2": "two", "3": "three", "4": "four", "5": "five", "6": "six", "7": "seven", "8": "eight", "9": "nine", "10": "ten",
  "11": "eleven", "12": "twelve", "13": "thirteen", "14": "fourteen", "15": "fifteen", "16": "sixteen", "17": "seventeen", "18": "eighteen", "19": "nineteen", "20": "twenty",
  "1st": "first", "2nd": "second", "3rd": "third", "4th": "fourth", "5th": "fifth", "6th": "sixth", "7th": "seventh", "8th": "eighth", "9th": "ninth", "10th": "tenth",
};

export function normalizeForWer(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[^a-z0-9' ]+/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => NUMBER_WORDS[w] ?? w);
}

// Lines the hypothesis up against the reference (the edit-distance path):
// for each reference word, the hypothesis word it matched or was swapped
// for, or -1 when the engine dropped it.
export function alignWords(ref: string[], hyp: string[]): number[] {
  const cols = hyp.length + 1;
  const cost = new Int32Array((ref.length + 1) * cols);
  for (let j = 0; j <= hyp.length; j++) cost[j] = j;
  for (let i = 1; i <= ref.length; i++) {
    cost[i * cols] = i;
    for (let j = 1; j <= hyp.length; j++) {
      const swap = cost[(i - 1) * cols + j - 1] + (ref[i - 1] === hyp[j - 1] ? 0 : 1);
      cost[i * cols + j] = Math.min(cost[(i - 1) * cols + j] + 1, cost[i * cols + j - 1] + 1, swap);
    }
  }
  const refToHyp = new Array<number>(ref.length).fill(-1);
  let i = ref.length;
  let j = hyp.length;
  while (i > 0 && j > 0) {
    const here = cost[i * cols + j];
    if (here === cost[(i - 1) * cols + j - 1] + (ref[i - 1] === hyp[j - 1] ? 0 : 1)) {
      refToHyp[i - 1] = j - 1;
      i -= 1;
      j -= 1;
    } else if (here === cost[(i - 1) * cols + j] + 1) {
      i -= 1;
    } else {
      j -= 1;
    }
  }
  return refToHyp;
}

// Word error rate = (substitutions + deletions + insertions) / reference words.
export function wordErrorRate(reference: string, hypothesis: string): number {
  const ref = normalizeForWer(reference);
  const hyp = normalizeForWer(hypothesis);
  if (ref.length === 0) return hyp.length === 0 ? 0 : 1;
  let prev = Array.from({ length: hyp.length + 1 }, (_, j) => j);
  for (let i = 1; i <= ref.length; i++) {
    const cur = [i];
    for (let j = 1; j <= hyp.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (ref[i - 1] === hyp[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return Math.round((prev[hyp.length] / ref.length) * 1000) / 1000;
}

export function countFillers(text: string): number {
  return normalizeForWer(text).filter((w) => FILLER_RE.test(w)).length;
}

export interface FillerMatch {
  // Fillers in the reference.
  expected: number;
  // Of those, how many the engine wrote in the same place.
  kept: number;
  // Fillers the engine wrote where none was said.
  invented: number;
}

// Matches fillers by position, not by count: an engine that drops the real
// ums and invents others elsewhere (a filler prompt can do that) keeps none.
export function matchFillers(reference: string, hypothesis: string): FillerMatch {
  const ref = normalizeForWer(reference);
  const hyp = normalizeForWer(hypothesis);
  const refToHyp = alignWords(ref, hyp);
  const matchedHyp = new Set<number>();
  let kept = 0;
  ref.forEach((word, i) => {
    const j = refToHyp[i];
    if (FILLER_RE.test(word) && j >= 0 && FILLER_RE.test(hyp[j])) {
      kept += 1;
      matchedHyp.add(j);
    }
  });
  const hypFillers = hyp.filter((w) => FILLER_RE.test(w)).length;
  return { expected: ref.filter((w) => FILLER_RE.test(w)).length, kept, invented: hypFillers - matchedHyp.size };
}

// Share of the reference's fillers ("um", "uh") the engine kept, in place.
// Null when the reference has none to compare against.
export function fillerRetention(reference: string, hypothesis: string): number | null {
  const { expected, kept } = matchFillers(reference, hypothesis);
  if (expected === 0) return null;
  return Math.round((kept / expected) * 100) / 100;
}

// 16-bit PCM mono WAV bytes from a float waveform — what Apple's file
// transcription API expects.
export function encodeWavPcm16(waveform: Float32Array, sampleRate: number): Uint8Array {
  const dataBytes = waveform.length * 2;
  const buffer = new ArrayBuffer(44 + dataBytes);
  const view = new DataView(buffer);
  const writeAscii = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
  };
  writeAscii(0, "RIFF");
  view.setUint32(4, 36 + dataBytes, true);
  writeAscii(8, "WAVE");
  writeAscii(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeAscii(36, "data");
  view.setUint32(40, dataBytes, true);
  for (let i = 0; i < waveform.length; i++) {
    const s = Math.max(-1, Math.min(1, waveform[i]));
    view.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Uint8Array(buffer);
}
