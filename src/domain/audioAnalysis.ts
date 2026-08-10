import { decodeAudioData } from "react-native-audio-api";
import Pitchfinder from "pitchfinder";
import { logger } from "../utils/logger";

// 16kHz matches what react-native-executorch's Whisper transcribe() expects
// too — decoding once at this rate lets the same waveform feed both the
// on-device ASR call and this DSP pass, instead of decoding the video twice.
export const ASR_SAMPLE_RATE = 16000;

export interface DecodedAudio {
  waveform: Float32Array;
  sampleRate: number;
}

// Single shared decode step for a recorded session's video file. Never
// throws — callers get `null` on failure and degrade accordingly (ASR falls
// back to Gemini/AssemblyAI transcription, DSP marks dsp_status='failed').
export async function decodeVideoAudio(videoUri: string): Promise<DecodedAudio | null> {
  try {
    const audioBuffer = await decodeAudioData(videoUri, ASR_SAMPLE_RATE);
    return { waveform: audioBuffer.getChannelData(0), sampleRate: audioBuffer.sampleRate };
  } catch (error) {
    logger.error(`[audioAnalysis] decodeVideoAudio failed — ${(error as Error).message}`);
    return null;
  }
}

export type DspStatus = "complete" | "failed";

export interface PitchVolumeAnalysis {
  status: DspStatus;
  pitchContourHz: (number | null)[]; // 200ms buckets, null = unvoiced/silent
  volumeEnvelopeDbfs: number[]; // 200ms buckets
  pitchAvgHz: number | null;
  pitchMinHz: number | null;
  pitchMaxHz: number | null;
  volumeAvgDbfs: number | null;
  volumeStddevDbfs: number | null;
}

const FRAME_SIZE = 2048;
const BUCKET_MS = 200;
// A plain RMS-energy gate, not a real VAD model — this is the "last-resort
// fallback" tier from plan.md's Phase 2 (Silero VAD was deferred along with
// the rest of the ONNX-model work; see the plan's Windows-build-blocker
// notes). The threshold is a reasonable-sounding heuristic for phone-mic
// recordings, not empirically tuned against real sessions yet.
const SILENCE_RMS_THRESHOLD = 0.01;
const DBFS_FLOOR = -60;

function rms(frame: Float32Array): number {
  let sumSquares = 0;
  for (let i = 0; i < frame.length; i++) sumSquares += frame[i] * frame[i];
  return Math.sqrt(sumSquares / frame.length);
}

function rmsToDbfs(value: number): number {
  const db = 20 * Math.log10(Math.max(value, 1e-6));
  return Math.max(db, DBFS_FLOOR);
}

function average(nums: number[]): number {
  return nums.reduce((sum, n) => sum + n, 0) / nums.length;
}

function stddev(nums: number[], mean: number): number {
  return Math.sqrt(average(nums.map((n) => (n - mean) ** 2)));
}

const FAILED_ANALYSIS: PitchVolumeAnalysis = {
  status: "failed",
  pitchContourHz: [],
  volumeEnvelopeDbfs: [],
  pitchAvgHz: null,
  pitchMinHz: null,
  pitchMaxHz: null,
  volumeAvgDbfs: null,
  volumeStddevDbfs: null,
};

// Pure function over an already-decoded waveform (see decodeVideoAudio) — no
// I/O, easily testable. Pitch via YIN (pitchfinder, pure JS) — the plan's
// documented fallback tier; PESTO/onnxcrepe were deferred along with Silero
// VAD (see plan.md). Downsamples into 200ms buckets before returning (a
// 3-min session is ~900 points/array — trivial to store/chart). Never
// throws — returns a `failed`-status result the caller can degrade on.
export function analyzePitchVolume(waveform: Float32Array, sampleRate: number): PitchVolumeAnalysis {
  try {
    const detectPitch = Pitchfinder.YIN({ sampleRate });
    const samplesPerBucket = Math.round((BUCKET_MS / 1000) * sampleRate);
    const pitchContourHz: (number | null)[] = [];
    const volumeEnvelopeDbfs: number[] = [];

    for (let bucketStart = 0; bucketStart < waveform.length; bucketStart += samplesPerBucket) {
      const bucketEnd = Math.min(bucketStart + samplesPerBucket, waveform.length);
      const bucket = waveform.subarray(bucketStart, bucketEnd);
      const bucketRms = rms(bucket);
      volumeEnvelopeDbfs.push(rmsToDbfs(bucketRms));

      if (bucketRms < SILENCE_RMS_THRESHOLD) {
        pitchContourHz.push(null);
        continue;
      }

      const center = Math.floor((bucketStart + bucketEnd) / 2);
      const frameStart = Math.max(0, Math.min(center - Math.floor(FRAME_SIZE / 2), waveform.length - FRAME_SIZE));
      const frame = waveform.subarray(frameStart, frameStart + FRAME_SIZE);
      const pitch = frame.length >= FRAME_SIZE ? detectPitch(frame) : null;
      pitchContourHz.push(pitch && pitch > 0 ? pitch : null);
    }

    const voicedPitches = pitchContourHz.filter((p): p is number => p !== null);
    const finiteVolumes = volumeEnvelopeDbfs.filter((v) => Number.isFinite(v));
    const volumeAvgDbfs = finiteVolumes.length > 0 ? average(finiteVolumes) : null;

    return {
      status: "complete",
      pitchContourHz,
      volumeEnvelopeDbfs,
      pitchAvgHz: voicedPitches.length > 0 ? average(voicedPitches) : null,
      pitchMinHz: voicedPitches.length > 0 ? Math.min(...voicedPitches) : null,
      pitchMaxHz: voicedPitches.length > 0 ? Math.max(...voicedPitches) : null,
      volumeAvgDbfs,
      volumeStddevDbfs: volumeAvgDbfs !== null ? stddev(finiteVolumes, volumeAvgDbfs) : null,
    };
  } catch (error) {
    logger.error(`[audioAnalysis] analyzePitchVolume failed — ${(error as Error).message}`);
    return FAILED_ANALYSIS;
  }
}
