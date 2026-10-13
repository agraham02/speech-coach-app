import { useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import { AppState } from "react-native";
import { LiveSpeechSession, type LiveSpeechStatus, type VolumeSample } from "../services/speech/liveSpeechSession";
import { loadNativeSpeech } from "./useLiveSpeech";
import { fullText } from "../domain/speech/liveTranscript";

export interface RewindTake {
  // The recognizer's audio files, in order (several when it restarted).
  segments: string[];
  // What it heard, for when nothing better is available.
  liveText: string;
  volume: VolumeSample[];
  durationMs: number;
}

// Restarts allowed in one take. A restart happens at every silence on some
// phones, so a two-minute take needs far more than the usual allowance.
const MAX_RESTARTS = 200;
// Volume readings every 50 ms: a smooth live waveform.
const VOLUME_INTERVAL_MS = 50;

// Records a Rewind take with the live recognizer, keeping its audio. Unlike
// useLiveSpeech it only re-renders when the *status* changes — volume goes
// straight to onVolume, so a waveform drawn twenty times a second doesn't
// re-render the screen. A phone that can't save audio still gets the words.
export function useRewindRecorder() {
  const ref = useRef<LiveSpeechSession | null>(null);
  if (!ref.current) ref.current = new LiveSpeechSession(loadNativeSpeech());
  const session = ref.current;
  const startedAt = useRef(0);
  const status: LiveSpeechStatus = useSyncExternalStore(session.subscribe, () => session.getSnapshot().status);

  useEffect(() => {
    // Leaving the app ends the microphone; the screen finishes the take.
    const sub = AppState.addEventListener("change", (state) => {
      if (state !== "active") session.stop().catch(() => undefined);
    });
    return () => {
      sub.remove();
      session.dispose();
    };
  }, [session]);

  // Stable, so a waveform subscribed to it isn't resubscribed on every render.
  const onVolume = useMemo(() => session.onVolume.bind(session), [session]);

  async function start(): Promise<"ready" | "denied" | "unavailable"> {
    const ready = await session.prepare();
    if (ready !== "ready") return ready;
    session.start({ persistAudio: true, volumeMeter: true, volumeIntervalMs: VOLUME_INTERVAL_MS, maxRestarts: MAX_RESTARTS });
    startedAt.current = Date.now();
    return "ready";
  }

  async function stop(): Promise<RewindTake> {
    const transcript = await session.stop();
    return {
      segments: [...session.getRecordings()],
      liveText: fullText(transcript),
      volume: [...session.getVolumeSamples()],
      durationMs: Date.now() - startedAt.current,
    };
  }

  return { status, canSaveAudio: session.canPersistAudio(), start, stop, onVolume };
}
