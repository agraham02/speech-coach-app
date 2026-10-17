import { useCallback, useRef, useState } from "react";
import { isFace, type FaceLandmarkerOutput } from "vision-camera-face-landmarker";
import { isWellFramed } from "../domain/faceFraming";
import { orientFace } from "../domain/faceOrientation";
import { eyeClosure, sampleFromFace } from "../domain/faceSignals";
import { feedBlink, loseFace, newBlinkState } from "../domain/blinkCounter";
import type { PresenceSample } from "../domain/presenceMetrics";
import { logger } from "../utils/logger";

export type FramingStatus = "none" | "off_center" | "good";

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
  // Blinks are counted on every frame (too quick for the 200 ms samples);
  // each sample carries how many finished since the one before.
  const blinkRef = useRef(newBlinkState());
  const blinksSampledRef = useRef(0);

  const startTimeline = useCallback(() => {
    timelineRef.current = [];
    timelineStartRef.current = Date.now();
    lastSampleAtRef.current = 0;
    blinkRef.current = newBlinkState();
    blinksSampledRef.current = 0;
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
    const newBlinks = () => {
      const n = blinkRef.current.count - blinksSampledRef.current;
      blinksSampledRef.current = blinkRef.current.count;
      return n;
    };

    if (!isFace(output)) {
      blinkRef.current = loseFace(blinkRef.current);
      if (sampleDue) timeline.push({ tMs, present: false, yaw: 0, pitch: 0, smile: 0, eyesOpen: 0, framed: false, blinks: newBlinks() });
      if (now - lastSeenAtRef.current > 500) {
        setFaceDetected(false);
        setFramingStatus("none");
      }
      return;
    }

    lastSeenAtRef.current = now;
    setFaceDetected(true);
    // Upright, as the preview shows it: the plugin reports the sideways buffer.
    const face = orientFace(output);
    const wellFramed = isWellFramed(face.bounds);
    setFramingStatus(wellFramed ? "good" : "off_center");
    if (timeline) blinkRef.current = feedBlink(blinkRef.current, eyeClosure(face), now);
    if (sampleDue) timeline.push({ ...sampleFromFace(face, tMs, wellFramed), blinks: newBlinks() });
  }, []);

  return { faceDetected, framingStatus, onFaceFrame, startTimeline, stopTimeline };
}
