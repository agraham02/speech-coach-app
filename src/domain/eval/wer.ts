// Transcription-quality metrics for the ASR Lab (Dev screen), used to pick
// the default on-device engine from real numbers rather than marketing.

const FILLER_RE = /^(um+|uh+|uhm+|erm?|ah+|hmm+)$/;

export function normalizeForWer(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[^a-z0-9' ]+/g, " ")
    .split(/\s+/)
    .filter(Boolean);
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

// Share of the reference's fillers ("um", "uh") the engine kept. Null when
// the reference has none to compare against.
export function fillerRetention(reference: string, hypothesis: string): number | null {
  const expected = countFillers(reference);
  if (expected === 0) return null;
  return Math.min(1, Math.round((countFillers(hypothesis) / expected) * 100) / 100);
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
