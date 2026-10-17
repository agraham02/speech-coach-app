// Raw signed 16-bit little-endian PCM from a float waveform (-1..1). This is
// what whisper.rn's transcribeData reads: handing it the Float32Array's own
// bytes makes every float look like two garbage samples, so the model hears
// twice as long a recording of noise.
export function pcm16FromFloat32(waveform: Float32Array): ArrayBuffer {
  const buffer = new ArrayBuffer(waveform.length * 2);
  const view = new DataView(buffer);
  for (let i = 0; i < waveform.length; i++) {
    const s = Math.max(-1, Math.min(1, waveform[i]));
    view.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return buffer;
}
