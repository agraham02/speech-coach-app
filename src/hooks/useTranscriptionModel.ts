import { useEffect, useState } from "react";
import { DEFAULT_ASR_MODEL, getDownloadState, isModelDownloaded, startDownload, subscribeDownloads, cancelDownload, pauseDownload } from "../services/asr/whisperModels";

export type TranscriptionModelStatus = "missing" | "downloading" | "paused" | "failed" | "ready";

// Where the transcription model download stands, kept current while it runs.
// The download itself is owned by the model manager and continues in the
// background, so a screen can come and go.
export function useTranscriptionModel() {
  const [, redraw] = useState(0);
  useEffect(() => subscribeDownloads(() => redraw((n) => n + 1)), []);
  const dl = getDownloadState(DEFAULT_ASR_MODEL);
  const status: TranscriptionModelStatus = isModelDownloaded(DEFAULT_ASR_MODEL) ? "ready" : (dl?.status as TranscriptionModelStatus | undefined) ?? "missing";
  return {
    status,
    percent: Math.round((dl?.progress ?? 0) * 100),
    bytesPerSecond: dl?.bytesPerSecond ?? 0,
    error: dl?.status === "failed" ? dl.error : null,
    start: () => startDownload(DEFAULT_ASR_MODEL),
    pause: () => pauseDownload(DEFAULT_ASR_MODEL),
    discard: () => cancelDownload(DEFAULT_ASR_MODEL),
  };
}
