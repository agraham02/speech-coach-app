import { useCallback, useRef, useState } from "react";
import { isFace, type FaceLandmarkerOutput } from "vision-camera-face-landmarker";
import { isWellFramed } from "../domain/faceFraming";
import { readGuide, type FramingStatus, type GuideGeometry } from "../domain/faceGuide";
import { orientFace } from "../domain/faceOrientation";
import { eyeClosure, sampleFromFace } from "../domain/faceSignals";
import { feedBlink, loseFace, newBlinkState } from "../domain/blinkCounter";
import type { PresenceSample } from "../domain/presenceMetrics";
import { INVERT_GAZE_Y } from "../services/face/faceAxes";
import { logger } from "../utils/logger";

export type { FramingStatus };

interface Options {
  // The oval on the preview and the view it's measured in. With it, "good" means
  // the face is really inside the oval; without it, anywhere in the wide zone
  // (domain/faceFraming.ts).
  guide?: GuideGeometry | null;
}

// Every detection is kept (about 15 to 20 a second): the face track stores
// them packed, and quick glances and nods need the full rate.
const SAMPLE_INTERVAL_MS = 0;

// Turns face-landmarker frames into framing state for the recording UI, and
// a presence timeline (on-device "video analysis") while a take records.
export function useFaceDetection({ guide = null }: Options = {}) {
  const [faceDetected, setFaceDetected] = useState(false);
  const [framingStatus, setFramingStatus] = useState<FramingStatus>("none");
  const [guideHint, setGuideHint] = useState<string | null>(null);
  const guideRef = useRef(guide);
  guideRef.current = guide;
  const framingRef = useRef<FramingStatus>("none");
  const lastSeenAtRef = useRef(0);
  // One entry per detection while a take is recording. Kept in a ref — no
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
        framingRef.current = "none";
        setFramingStatus("none");
        setGuideHint(null);
      }
      return;
    }

    lastSeenAtRef.current = now;
    setFaceDetected(true);
    // Upright, as the preview shows it: the plugin reports the sideways buffer.
    const face = orientFace(output);
    // The take's presence samples keep the wide zone; only what the oval
    // tells you uses the stricter check.
    const wellFramed = isWellFramed(face.bounds);
    const read = guideRef.current ? readGuide(face, guideRef.current, framingRef.current) : null;
    framingRef.current = read ? read.status : wellFramed ? "good" : "off_center";
    setFramingStatus(framingRef.current);
    setGuideHint(read?.hint ?? null);
    if (timeline) blinkRef.current = feedBlink(blinkRef.current, eyeClosure(face), now);
    if (sampleDue) timeline.push({ ...sampleFromFace(face, tMs, wellFramed, { invertGazeY: INVERT_GAZE_Y }), blinks: newBlinks() });
  }, []);

  return { faceDetected, framingStatus, guideHint, onFaceFrame, startTimeline, stopTimeline };
}
