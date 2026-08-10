import { useCallback, useState } from "react";
import { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent } from "expo-speech-recognition";
import { logger } from "../utils/logger";

export interface UseLiveSpeechRecognition {
  isListening: boolean;
  partialTranscript: string;
  finalTranscript: string;
  // False if the on-device recognition service itself isn't available
  // (varies by OEM on Android — see plan.md Phase 3 Risks) — the caller
  // should fall back to the manual-timer mode without even trying start().
  isAvailable: boolean;
  permissionDenied: boolean;
  start: () => Promise<void>;
  stop: () => void;
}

// Thin wrapper around expo-speech-recognition's imperative module + event
// API, following the same thin-hook pattern as useCameraPermissions.ts.
// Deliberately does not throw — DrillSessionScreen degrades to the manual
// self-timer mode on !isAvailable or permissionDenied rather than crashing.
export function useLiveSpeechRecognition(): UseLiveSpeechRecognition {
  const [isListening, setIsListening] = useState(false);
  const [partialTranscript, setPartialTranscript] = useState("");
  const [finalTranscript, setFinalTranscript] = useState("");
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [isAvailable] = useState<boolean>(() => {
    try {
      return ExpoSpeechRecognitionModule.isRecognitionAvailable();
    } catch (error) {
      // Genuinely missing native module (e.g. this SDK-57 project running
      // against a package built for SDK 56 — see app.config.ts's note)
      // throws here rather than returning false — caught so the manual
      // fallback still works instead of crashing the whole screen.
      logger.error(`[useLiveSpeechRecognition] isRecognitionAvailable threw — ${(error as Error).message}`);
      return false;
    }
  });

  useSpeechRecognitionEvent("result", (event) => {
    const transcript = event.results[0]?.transcript ?? "";
    if (event.isFinal) {
      setFinalTranscript(transcript);
    } else {
      setPartialTranscript(transcript);
    }
  });

  useSpeechRecognitionEvent("end", () => {
    setIsListening(false);
  });

  useSpeechRecognitionEvent("error", (event) => {
    logger.warn(`[useLiveSpeechRecognition] ${event.error} — ${event.message}`);
    if (event.error === "not-allowed" || event.error === "service-not-allowed") {
      setPermissionDenied(true);
    }
    setIsListening(false);
  });

  const start = useCallback(async () => {
    setPartialTranscript("");
    setFinalTranscript("");
    try {
      const permission = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      if (!permission.granted) {
        setPermissionDenied(true);
        return;
      }
      setIsListening(true);
      ExpoSpeechRecognitionModule.start({ lang: "en-US", interimResults: true });
    } catch (error) {
      logger.error(`[useLiveSpeechRecognition] start failed — ${(error as Error).message}`);
      setIsListening(false);
      setPermissionDenied(true);
    }
  }, []);

  const stop = useCallback(() => {
    try {
      ExpoSpeechRecognitionModule.stop();
    } catch (error) {
      logger.error(`[useLiveSpeechRecognition] stop failed — ${(error as Error).message}`);
      setIsListening(false);
    }
  }, []);

  return { isListening, partialTranscript, finalTranscript, isAvailable, permissionDenied, start, stop };
}
