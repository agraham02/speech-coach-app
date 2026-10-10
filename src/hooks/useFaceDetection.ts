import { useCallback, useRef, useState } from "react";
import { isFace, type FaceLandmarkerOutput } from "vision-camera-face-landmarker";
import { sampleFromFace } from "../domain/faceSignals";
import type { PresenceSample } from "../domain/presenceMetrics";
import { logger } from "../utils/logger";

export type FramingStatus = "none" | "off_center" | "good";

// Generous "center" region as a fraction of the image — a face whose center
// falls outside this box (or is too small, i.e. too far away) doesn't count
// as well-framed even though it was technically detected. The preview fills
// the screen, so image fractions are close to screen fractions.
const CENTER_ZONE = { xMin: 0.15, xMax: 0.85, yMin: 0.08, yMax: 0.85 };
const MIN_FACE_WIDTH_RATIO = 0.12;
const SAMPLE_INTERVAL_MS = 200;

// Turns face-landmarker frames into framing state for the recording UI, and
// a presence timeline (on-device "video analysis") while a take records.
export function useFaceDetection() {
  const [faceDetected, setFaceDetected] = useState(false);
  const [framingStatus, setFramingStatus] = useState<FramingStatus>("none");
  const lastSeenAtRef = useRef(0);
  // Sampled ~5x/second while a take is recording. Kept in a ref — no
  // re-render per sample.
  const timelineRef = useRef<PresenceSample[] | null>(null);
  const timelineStartRef = useRef(0);
  const lastSampleAtRef = useRef(0);
  const loggedErrorRef = useRef(false);

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

  const onFaceFrame = useCallback((output: FaceLandmarkerOutput) => {
    if ("error" in output && !loggedErrorRef.current) {
      loggedErrorRef.current = true;
      logger.error(`[face] landmarker error — ${output.error}`);
    }
    const now = Date.now();
    const timeline = timelineRef.current;
    const sampleDue = timeline && now - lastSampleAtRef.current >= SAMPLE_INTERVAL_MS;
    if (sampleDue) lastSampleAtRef.current = now;
    const tMs = now - timelineStartRef.current;

    if (!isFace(output)) {
      if (sampleDue) timeline.push({ tMs, present: false, yaw: 0, pitch: 0, smile: 0, eyesOpen: 0, framed: false });
      if (now - lastSeenAtRef.current > 500) {
        setFaceDetected(false);
        setFramingStatus("none");
      }
      return;
    }

    lastSeenAtRef.current = now;
    setFaceDetected(true);
    const [minX, minY, maxX, maxY] = output.bounds;
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    const wellFramed =
      centerX >= CENTER_ZONE.xMin &&
      centerX <= CENTER_ZONE.xMax &&
      centerY >= CENTER_ZONE.yMin &&
      centerY <= CENTER_ZONE.yMax &&
      maxX - minX >= MIN_FACE_WIDTH_RATIO;
    setFramingStatus(wellFramed ? "good" : "off_center");
    if (sampleDue) timeline.push(sampleFromFace(output, tMs, wellFramed));
  }, []);

  return { faceDetected, framingStatus, onFaceFrame, startTimeline, stopTimeline };
}
