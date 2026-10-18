import { useEffect, useRef, useState } from "react";
import { File } from "expo-file-system";
import { useLiveSpeech } from "./useLiveSpeech";
import { playClip, stopClip } from "../services/audio/clipPlayer";
import { fullText } from "../domain/speech/liveTranscript";
import type { VolumeSample } from "../services/speech/liveSpeechSession";
import { showGlobalToast } from "../components/common/ToastProvider";

export interface Take {
  // The saved WAV (null where the phone can't save recognizer audio).
  uri: string | null;
  transcript: string;
  volume: VolumeSample[];
  durationMs: number;
}

function deleteFile(uri: string): void {
  try {
    const file = new File(uri);
    if (file.exists) file.delete();
  } catch {
    // Already gone, or still being written: the launch sweep gets it.
  }
}

// Records one short take — a read of a marked line, a Move It take — with
// the live recognizer, keeping its audio for listen-back and analysis. The
// recognizer writes WAVs to the cache; they're only for this screen, so the
// ones it no longer needs are deleted as it goes and the rest when it closes.
export function useTakeRecorder() {
  const speech = useLiveSpeech();
  const [state, setState] = useState<"idle" | "recording" | "stopping">("idle");
  const [playing, setPlaying] = useState<string | null>(null);
  const [startedAt, setStartedAt] = useState(0);
  const canSave = speech.session.canPersistAudio();
  const kept = useRef<string[]>([]);

  useEffect(
    () => () => {
      stopClip();
      for (const uri of kept.current) deleteFile(uri);
    },
    [],
  );

  async function start(): Promise<boolean> {
    stopClip();
    setPlaying(null);
    const ready = await speech.session.prepare();
    if (ready !== "ready") {
      showGlobalToast(ready === "denied" ? "Microphone permission is needed to record." : "Recording isn't available on this phone.", "error");
      return false;
    }
    speech.session.start({ persistAudio: true, volumeMeter: true, volumeIntervalMs: 100 });
    setStartedAt(Date.now());
    setState("recording");
    return true;
  }

  async function stop(): Promise<Take> {
    setState("stopping");
    const transcript = await speech.session.stop();
    const uris = speech.session.getRecordings();
    setState("idle");
    // A recognizer restart mid-take splits it into segments; only the last
    // is played back, so the earlier ones go now.
    const last = uris[uris.length - 1] ?? null;
    for (const uri of uris.slice(0, -1)) if (!kept.current.includes(uri)) deleteFile(uri);
    if (last && !kept.current.includes(last)) kept.current.push(last);
    return {
      uri: last,
      transcript: fullText(transcript),
      volume: [...speech.session.getVolumeSamples()],
      durationMs: Date.now() - startedAt,
    };
  }

  async function play(uri: string) {
    if (playing === uri) {
      stopClip();
      setPlaying(null);
      return;
    }
    setPlaying(uri);
    const ok = await playClip(uri, () => setPlaying((p) => (p === uri ? null : p)));
    if (!ok) {
      setPlaying(null);
      showGlobalToast("Couldn't play that take back.", "error");
    }
  }

  return { state, canSave, volume: speech.volume, text: speech.text, start, stop, play, playing };
}
