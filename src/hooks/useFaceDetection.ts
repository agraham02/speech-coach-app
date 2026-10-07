import { useCallback, useMemo, useRef, useState } from "react";
import { useWindowDimensions } from "react-native";
import type { Face, FrameFaceDetectionOptions } from "react-native-vision-camera-face-detector";
import type { Frame } from "react-native-vision-camera";
import type { PresenceSample } from "../domain/presenceMetrics";

export type FramingStatus = "none" | "off_center" | "good";

// Generous "center" region as a fraction of screen width/height — a face
// whose center falls outside this box (or is too small, i.e. too far away)
// doesn't count as well-framed even though it was technically detected.
const CENTER_ZONE = { xMin: 0.15, xMax: 0.85, yMin: 0.08, yMax: 0.85 };
const MIN_FACE_WIDTH_RATIO = 0.12;
const SAMPLE_INTERVAL_MS = 200;

// Wraps the face-detector's per-frame callback into simple, screen-relative
// framing state. Uses `autoMode` so the detector gives us bounds already
// scaled to screen points instead of raw sensor/frame coordinates — otherwise
// "is the face centered on screen" can't be answered correctly.
export function useFaceDetection() {
  const { width, height } = useWindowDimensions();
  const [faceDetected, setFaceDetected] = useState(false);
  const [framingStatus, setFramingStatus] = useState<FramingStatus>("none");
  const lastSeenAtRef = useRef(0);
  // Presence timeline (on-device "video analysis"), sampled ~5x/second while
  // a take is recording. Kept in a ref — no re-render per sample.
  const timelineRef = useRef<PresenceSample[] | null>(null);
  const timelineStartRef = useRef(0);
  const lastSampleAtRef = useRef(0);

  const startTimeline = useCallback(() => {
    timelineRef.current = [];
    timelineStartRef.current = Date.now();
    lastSampleAtRef.current = 0;
  }, []);

  // Ends sampling and hands back what was collected (null if not running).
  const stopTimeline = useCallback((): PresenceSample[] | null => {
    const timeline = timelineRef.current;
    timelineRef.current = null;
    return timeline;
  }, []);

  const faceDetectionOptions: FrameFaceDetectionOptions = useMemo(
    () => ({
      performanceMode: "fast",
      // Smile and eye-open probabilities feed the presence metrics.
      classificationMode: "all",
      cameraFacing: "front",
      autoMode: true,
      windowWidth: width,
      windowHeight: height,
    }),
    [width, height],
  );

  const onFacesDetected = useCallback(
    (faces: Face[], _frame: Frame) => {
      const now = Date.now();
      const timeline = timelineRef.current;
      const sampleDue = timeline && now - lastSampleAtRef.current >= SAMPLE_INTERVAL_MS;
      if (sampleDue) lastSampleAtRef.current = now;

      if (faces.length === 0) {
        if (sampleDue) {
          timeline.push({ tMs: now - timelineStartRef.current, present: false, yaw: 0, pitch: 0, smile: 0, eyesOpen: 0, framed: false });
        }
        if (now - lastSeenAtRef.current > 500) {
          setFaceDetected(false);
          setFramingStatus("none");
        }
        return;
      }

      lastSeenAtRef.current = now;
      setFaceDetected(true);

      const face = faces[0];
      const centerX = (face.bounds.x + face.bounds.width / 2) / width;
      const centerY = (face.bounds.y + face.bounds.height / 2) / height;
      const widthRatio = face.bounds.width / width;

      const wellFramed =
        centerX >= CENTER_ZONE.xMin &&
        centerX <= CENTER_ZONE.xMax &&
        centerY >= CENTER_ZONE.yMin &&
        centerY <= CENTER_ZONE.yMax &&
        widthRatio >= MIN_FACE_WIDTH_RATIO;

      setFramingStatus(wellFramed ? "good" : "off_center");
      if (sampleDue) {
        timeline.push({
          tMs: now - timelineStartRef.current,
          present: true,
          yaw: face.yawAngle,
          pitch: face.pitchAngle,
          smile: face.smilingProbability ?? 0,
          eyesOpen: ((face.leftEyeOpenProbability ?? 1) + (face.rightEyeOpenProbability ?? 1)) / 2,
          framed: wellFramed,
        });
      }
    },
    [width, height],
  );

  return { faceDetected, framingStatus, onFacesDetected, faceDetectionOptions, startTimeline, stopTimeline };
}
