import { useCallback, useEffect, useRef, useState } from "react";
import { isFace, type FaceLandmarkerOutput } from "vision-camera-face-landmarker";
import { isWellFramed } from "../domain/faceFraming";
import { readGuide, type FramingStatus, type GuideGeometry } from "../domain/faceGuide";
import { orientFace } from "../domain/faceOrientation";
import { headProxies, sampleFromFace } from "../domain/faceSignals";
import { NO_READOUT, ReadoutSmoother, readFace, type FaceCenter, type FaceReading, type Readout, ZERO_CENTER } from "../domain/faceReadout";
import { INVERT_GAZE_Y } from "../services/face/faceAxes";

// A face gone this long stops counting as "in frame".
const LOSS_GRACE_MS = 400;

interface Options {
  // Told about every frame (null = no face), for capturing the center and
  // tracking the things to try. A ref, so it never causes a render.
  onReading?: (reading: FaceReading | null, tMs: number) => void;
  // The person's own neutral; the labels are read against it.
  center?: FaceCenter;
  // The oval on the preview and the view it's measured in. With it, "good"
  // means the face is really inside the oval, not just on screen.
  guide?: GuideGeometry | null;
}

// Face-landmarker frames as a live readout in words (domain/faceReadout.ts):
// where the eyes point, how the head is held, smile, brows. Throttled to
// what the camera delivers (about ten a second) and smoothed so a label does
// not flicker at its threshold.
export function useFaceReadout({ onReading, center = ZERO_CENTER, guide = null }: Options = {}) {
  const [readout, setReadout] = useState<Readout>(NO_READOUT);
  const [framingStatus, setFramingStatus] = useState<FramingStatus>("none");
  const [guideHint, setGuideHint] = useState<string | null>(null);
  const guideRef = useRef(guide);
  guideRef.current = guide;
  const framingRef = useRef<FramingStatus>("none");
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
        framingRef.current = "none";
        setFramingStatus("none");
        setGuideHint(null);
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
    // `framed` (the wide zone) stays what the readings carry; the oval's own
    // verdict is what the status and the hint show.
    const read = guideRef.current ? readGuide(face, guideRef.current, framingRef.current) : null;
    framingRef.current = read ? read.status : framed ? "good" : "off_center";
    setFramingStatus(framingRef.current);
    setGuideHint(read?.hint ?? null);
  }, []);

  useEffect(() => {
    smoother.current.reset();
  }, []);

  return { readout, framingStatus, guideHint, onFaceFrame };
}
