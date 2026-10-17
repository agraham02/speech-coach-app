import { useMemo } from "react";
import { VisionCameraProxy, type Frame, type FrameProcessorPlugin } from "react-native-vision-camera";

// MediaPipe Face Landmarker, run per camera frame by the native plugin in
// ios/ and android/. Output for the first face found; `{}` means no face.
export interface FaceLandmarkerFace {
  // Size of the upright image the coordinates are normalized to.
  width: number;
  height: number;
  // [minX, minY, maxX, maxY], 0-1, over all 478 landmarks.
  bounds: [number, number, number, number];
  // Flat [x, y, z, x, y, z, …] for LANDMARK_INDICES, in that order.
  landmarks: number[];
  // All 52 ARKit-style blendshapes, 0-1 (eyeLookInLeft, mouthSmileRight, …).
  // Left/right are the subject's own left/right.
  blendshapes: Record<string, number>;
  // 4x4 facial transformation (head pose). Row-major on iOS, column-major on
  // Android — see headPoseFromMatrix. Empty when unavailable.
  matrix: number[];
  // The orientation the image was given to MediaPipe in (iOS).
  orientation?: string;
}

export type FaceLandmarkerOutput = FaceLandmarkerFace | { error: string } | Record<string, never>;

// Must match the native LANDMARK_INDICES.
export const LANDMARK_INDICES = {
  noseTip: 1,
  forehead: 10,
  chin: 152,
  faceEdgeRight: 234,
  faceEdgeLeft: 454,
  eyeOuterRight: 33,
  eyeOuterLeft: 263,
  betweenEyes: 168,
  upperLipInner: 13,
  lowerLipInner: 14,
} as const;

// The native plugin, or undefined when this build doesn't include it.
export function useFaceLandmarkerPlugin(): FrameProcessorPlugin | undefined {
  return useMemo(() => {
    try {
      return VisionCameraProxy.initFrameProcessorPlugin("detectFaceLandmarks", {});
    } catch {
      return undefined;
    }
  }, []);
}

// args.orientation ("up", "down", "left", "right") overrides the automatic
// choice on iOS; the Dev tab Face Lab uses it to compare them.
export function detectFaceLandmarks(plugin: FrameProcessorPlugin, frame: Frame, args?: { orientation?: string }): FaceLandmarkerOutput {
  "worklet";
  return (args ? plugin.call(frame, args) : plugin.call(frame)) as unknown as FaceLandmarkerOutput;
}

export function isFace(output: FaceLandmarkerOutput | null | undefined): output is FaceLandmarkerFace {
  return !!output && Array.isArray((output as FaceLandmarkerFace).bounds);
}
