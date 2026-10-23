import { decodeVideoAudio } from "../../domain/audioAnalysis";
import { summarizePitch } from "../../domain/dsp/pitchTracker";
import { extractOffThread } from "./dspRuntime";

// Pitch range (semitones, p10 to p90 around the median) of a short saved
// take — decoded with the same path as session audio and measured by the
// same tracker. null when the file can't be decoded or there's too little
// voiced audio; callers fall back to the live loudness range.
export async function measureTakePitchRange(uri: string | null): Promise<number | null> {
  if (!uri) return null;
  const decoded = await decodeVideoAudio(uri);
  if (!decoded) return null;
  const { features } = await extractOffThread(decoded.waveform, decoded.sampleRate);
  const range = summarizePitch(features).rangeSemitones;
  return range == null ? null : Math.round(range * 10) / 10;
}
