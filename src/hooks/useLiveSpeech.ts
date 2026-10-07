import { useEffect, useRef, useSyncExternalStore } from "react";
import { AppState } from "react-native";
import { LiveSpeechSession, type SpeechNative } from "../services/speech/liveSpeechSession";
import { logger } from "../utils/logger";

// Loaded lazily: requireNativeModule throws at import time when the native
// module is missing from the build, which would otherwise crash the screen
// instead of letting it fall back to the manual timer.
function loadNativeSpeech(): SpeechNative | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { ExpoSpeechRecognitionModule } = require("expo-speech-recognition");
    return ExpoSpeechRecognitionModule as SpeechNative;
  } catch (error) {
    logger.error(`[useLiveSpeech] native speech module unavailable — ${(error as Error).message}`);
    return null;
  }
}

// React binding for LiveSpeechSession. One session per mounted screen;
// it's aborted on unmount and stopped gracefully when the app backgrounds.
export function useLiveSpeech() {
  const sessionRef = useRef<LiveSpeechSession | null>(null);
  if (!sessionRef.current) sessionRef.current = new LiveSpeechSession(loadNativeSpeech());
  const session = sessionRef.current;
  const snapshot = useSyncExternalStore(session.subscribe, session.getSnapshot);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state !== "active") {
        const status = session.getSnapshot().status;
        if (status === "listening" || status === "restarting" || status === "preparing") {
          session.stop().catch(() => undefined);
        }
      }
    });
    return () => {
      sub.remove();
      session.dispose();
    };
  }, [session]);

  return { ...snapshot, session };
}
