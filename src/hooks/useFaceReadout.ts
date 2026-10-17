import { useCallback, useEffect, useRef, useState } from "react";
import { isFace, type FaceLandmarkerOutput } from "vision-camera-face-landmarker";
import { isWellFramed } from "../domain/faceFraming";
import { orientFace } from "../domain/faceOrientation";
import { headProxies, sampleFromFace } from "../domain/faceSignals";
import { NO_READOUT, ReadoutSmoother, readFace, type FaceCenter, type FaceReading, type Readout, ZERO_CENTER } from "../domain/faceReadout";
import { INVERT_GAZE_Y } from "../services/face/faceAxes";
import type { FramingStatus } from "./useFaceDetection";

// A face gone this long stops counting as "in frame".
const LOSS_GRACE_MS = 400;

interface Options {
  // Told about every frame (null = no face), for capturing the center and
  // tracking the things to try. A ref, so it never causes a render.
  onReading?: (reading: FaceReading | null, tMs: number) => void;
  // The person's own neutral; the labels are read against it.
  center?: FaceCenter;
}

// Face-landmarker frames as a live readout in words (domain/faceReadout.ts):
// where the eyes point, how the head is held, smile, brows. Throttled to
// what the camera delivers (about ten a second) and smoothed so a label does
// not flicker at its threshold.
export function useFaceReadout({ onReading, center = ZERO_CENTER }: Options = {}) {
  const [readout, setReadout] = useState<Readout>(NO_READOUT);
  const [framingStatus, setFramingStatus] = useState<FramingStatus>("none");
  const smoother = useRef(new ReadoutSmoother(2));
  const lastSeenAt = useRef(0);
  const centerRef = useRef(center);
  centerRef.current = center;
  const onReadingRef = useRef(onReading);
  onReadingRef.current = onReading;

  const onFaceFrame = useCallback((output: FaceLandmarkerOutput) => {
    const now = Date.now();
    if (!isFace(output)) {
      onReadingRef.current?.(null, now);
      if (now - lastSeenAt.current > LOSS_GRACE_MS) {
        setReadout(smoother.current.push(NO_READOUT));
        setFramingStatus("none");
      }
      return;
    }
    lastSeenAt.current = now;
    // Upright, as the preview shows it: the plugin reports the sideways buffer.
    const face = orientFace(output);
    const framed = isWellFramed(face.bounds);
    const proxies = headProxies(face);
    const reading: FaceReading = {
      tMs: now,
      sample: sampleFromFace(face, now, framed, { invertGazeY: INVERT_GAZE_Y }),
      framed,
      tip: proxies?.tip ?? centerRef.current.tip,
      turn: proxies?.turn ?? centerRef.current.turn,
    };
    onReadingRef.current?.(reading, now);
    setReadout(smoother.current.push(readFace(reading, centerRef.current)));
    setFramingStatus(framed ? "good" : "off_center");
  }, []);

  useEffect(() => {
    smoother.current.reset();
  }, []);

  return { readout, framingStatus, onFaceFrame };
}
