import * as Haptics from "expo-haptics";
import { useEffect, useRef } from "react";

const COOLDOWN_MS = 4000;

// Fires one haptic buzz per "face lost" event while recording, not continuously.
// A cooldown prevents a buzz storm if the face keeps flickering in/out.
export function useHapticFaceWarning(isRecording: boolean, faceDetected: boolean) {
  const lastBuzzAtRef = useRef(0);
  const wasFaceDetectedRef = useRef(true);

  useEffect(() => {
    if (!isRecording) {
      wasFaceDetectedRef.current = true;
      return;
    }

    const justLostFace = wasFaceDetectedRef.current && !faceDetected;
    wasFaceDetectedRef.current = faceDetected;

    if (justLostFace) {
      const now = Date.now();
      if (now - lastBuzzAtRef.current > COOLDOWN_MS) {
        lastBuzzAtRef.current = now;
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      }
    }
  }, [isRecording, faceDetected]);
}
