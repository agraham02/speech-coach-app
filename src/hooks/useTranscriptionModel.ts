import { useEffect, useState } from "react";
import { skipModelDownloadActive, subscribeSkipModel } from "../services/dev/skipModel";
import { DEFAULT_ASR_MODEL, getDownloadState, isModelDownloaded, startDownload, subscribeDownloads, cancelDownload, pauseDownload } from "../services/asr/whisperModels";

export type TranscriptionModelStatus = "missing" | "downloading" | "paused" | "failed" | "ready";

// Where the transcription model download stands, kept current while it runs.
// The download itself is owned by the model manager and continues in the
// background, so a screen can come and go.
export function useTranscriptionModel() {
  const [, redraw] = useState(0);
  useEffect(() => {
    const stopDownloads = subscribeDownloads(() => redraw((n) => n + 1));
    const stopSkip = subscribeSkipModel(() => redraw((n) => n + 1));
    return () => {
      stopDownloads();
      stopSkip();
    };
  }, []);
  const dl = getDownloadState(DEFAULT_ASR_MODEL);
  // Dev builds: "skip the model download" counts as ready, so onboarding and
  // the banners do not wait for 574 MB. A transcript then fails with a clear
  // message (onDeviceAsrClient.ts).
  const status: TranscriptionModelStatus = isModelDownloaded(DEFAULT_ASR_MODEL) || skipModelDownloadActive() ? "ready" : (dl?.status as TranscriptionModelStatus | undefined) ?? "missing";
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
