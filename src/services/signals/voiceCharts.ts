import { getTakeSignals } from "./signalsStore";
import { unpackAudioTrack, voiceChartData, type VoiceChartData } from "../../domain/signals/audioSummary";

// A take's pitch and loudness for the Scores tab, from the stored 10 ms feature
// track (the `signals` artifact), so it needs neither the video nor the audio.
// Two resolutions: the whole take at about 240 points fits the screen width,
// and a finer one (about 1,200) for when you zoom in on a stretch.
export interface VoiceCharts {
  durationMs: number;
  coarse: VoiceChartData;
  fine: VoiceChartData;
  // Voiced share of the speaking, and the voiced seconds, as the tracker found them.
  voicedShare: number | null;
  voicedSeconds: number | null;
  // Reasons to read the numbers with care ("few voiced seconds", "noisy").
  lowConfidence: string[];
}

export const COARSE_POINTS = 240;
export const FINE_POINTS = 1200;

// Null when the take has no audio track (the voice analysis failed, or never ran).
export async function loadVoiceCharts(sessionId: string): Promise<VoiceCharts | null> {
  const signals = await getTakeSignals(sessionId);
  if (!signals?.audio) return null;
  const features = unpackAudioTrack(signals.audio, signals.durationMs);
  return {
    durationMs: signals.durationMs,
    coarse: voiceChartData(features, COARSE_POINTS),
    fine: voiceChartData(features, FINE_POINTS),
    voicedShare: signals.summary.pitch?.voicedShare ?? null,
    voicedSeconds: signals.summary.pitch?.voicedSeconds ?? null,
    lowConfidence: signals.summary.lowConfidence,
  };
}
