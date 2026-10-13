import { analyzePitchVolume, decodeVideoAudio } from "../../domain/audioAnalysis";
import { pitchRangeSemitones } from "../../domain/cadence/moveIt";

// Pitch range (semitones) of a short saved take — decoded with the same
// path as session audio. null when the file can't be decoded or there's too
// little voiced audio; callers fall back to the live loudness range.
export async function measureTakePitchRange(uri: string | null): Promise<number | null> {
  if (!uri) return null;
  const decoded = await decodeVideoAudio(uri);
  if (!decoded) return null;
  const analysis = analyzePitchVolume(decoded.waveform, decoded.sampleRate);
  if (analysis.status !== "complete") return null;
  return pitchRangeSemitones(analysis.pitchContourHz);
}
