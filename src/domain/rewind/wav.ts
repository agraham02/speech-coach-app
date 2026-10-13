// Joins the pieces of a Rewind recording. The live recognizer saves a new
// audio file each time it restarts, so a two-minute take can arrive as
// several; they're joined into one waveform for transcribing and saving (the
// WAV itself is written with encodeWavPcm16 in domain/eval/wer.ts). Pure.

export const WAV_SAMPLE_RATE = 16_000;

// Several waveforms, back to back.
export function concatWaveforms(parts: Float32Array[]): Float32Array {
  const total = parts.reduce((sum, p) => sum + p.length, 0);
  const out = new Float32Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}
