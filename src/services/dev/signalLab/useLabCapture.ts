import { useCallback, useMemo, useRef } from "react";
import type { Camera as VisionCamera } from "react-native-vision-camera";
import { isFace, type FaceLandmarkerOutput } from "vision-camera-face-landmarker";
import { orientFace } from "../../../domain/faceOrientation";
import type { PresenceSample } from "../../../domain/presenceMetrics";
import type { LabCapture } from "../../../domain/signalLab/types";
import { useFaceDetection } from "../../../hooks/useFaceDetection";

export interface Captured {
  // The recorded mp4, for take steps.
  uri: string | null;
  durationMs: number;
  // The face timeline, for face steps.
  face: PresenceSample[] | null;
  // The face's width as a share of the frame, averaged over the step.
  faceWidth: number | null;
}

// Records a step the way a real take is recorded (VisionCamera, mp4 and H.264,
// the face tracker running beside it), and collects the face timeline for
// steps that only watch the face. Render <CameraPreview cameraRef onFaceFrame/>
// with what this returns.
export function useLabCapture() {
  const cameraRef = useRef<VisionCamera>(null);
  const { onFaceFrame: detect, startTimeline, stopTimeline } = useFaceDetection();
  const widths = useRef<number[]>([]);
  const collecting = useRef(false);
  const startedAt = useRef(0);
  const recording = useRef<Promise<{ uri: string; durationMs: number }> | null>(null);

  const onFaceFrame = useCallback(
    (output: FaceLandmarkerOutput) => {
      if (collecting.current && isFace(output)) {
        const [x0, , x1] = orientFace(output).bounds;
        widths.current.push(x1 - x0);
      }
      detect(output);
    },
    [detect],
  );

  const begin = useCallback(
    (capture: LabCapture) => {
      startedAt.current = Date.now();
      widths.current = [];
      collecting.current = true;
      if (capture === "face" || capture === "face_take") startTimeline();
      if (capture === "take" || capture === "face_take") {
        const camera = cameraRef.current;
        if (!camera) throw new Error("The camera isn't ready.");
        recording.current = new Promise((resolve, reject) => {
          camera.startRecording({
            fileType: "mp4",
            videoCodec: "h264",
            onRecordingFinished: (video) => resolve({ uri: video.path.startsWith("file://") ? video.path : `file://${video.path}`, durationMs: Math.round(video.duration * 1000) }),
            onRecordingError: reject,
          });
        });
      }
    },
    [startTimeline],
  );

  const end = useCallback(async (): Promise<Captured> => {
    const elapsed = Date.now() - startedAt.current;
    collecting.current = false;
    const face = stopTimeline();
    let clip: { uri: string; durationMs: number } | null = null;
    if (recording.current) {
      const pending = recording.current;
      recording.current = null;
      await cameraRef.current?.stopRecording();
      clip = await pending;
    }
    const w = widths.current;
    return { uri: clip?.uri ?? null, durationMs: clip?.durationMs ?? elapsed, face, faceWidth: w.length ? w.reduce((a, b) => a + b, 0) / w.length : null };
  }, [stopTimeline]);

  const cancel = useCallback(async () => {
    collecting.current = false;
    stopTimeline();
    recording.current = null;
    try {
      await cameraRef.current?.cancelRecording();
    } catch {
      // Nothing was recording.
    }
  }, [stopTimeline]);

  // One object for the life of the screen, so effects that use it don't restart.
  return useMemo(() => ({ cameraRef, onFaceFrame, begin, end, cancel }), [onFaceFrame, begin, end, cancel]);
}
