import { useEffect, useMemo, type RefObject } from "react";
import { Platform, StyleSheet } from "react-native";
import { Camera, useCameraDevice, useFrameProcessor, type Camera as VisionCamera, type Frame } from "react-native-vision-camera";
import { Worklets, useSharedValue } from "react-native-worklets-core";
import { detectFaceLandmarks, useFaceLandmarkerPlugin, type FaceLandmarkerOutput } from "vision-camera-face-landmarker";
import { logger } from "../../utils/logger";

// Internal VisionCamera frame API: lets a frame outlive its processor call
// so detection can run off the camera thread.
type RefCountedFrame = Frame & { incrementRefCount(): void; decrementRefCount(): void };

interface CameraPreviewProps {
  cameraRef: RefObject<VisionCamera | null>;
  isActive: boolean;
  onFaceFrame: (output: FaceLandmarkerOutput) => void;
  // Off when nothing is recorded (the setup check's framing step), so the
  // camera doesn't hold the microphone the next step needs.
  audio?: boolean;
}

// ~10 detections a second is plenty for presence metrics and leaves the
// phone headroom for recording.
const MIN_INTERVAL_MS = 100;

export function CameraPreview({ cameraRef, isActive, onFaceFrame, audio = true }: CameraPreviewProps) {
  const device = useCameraDevice("front");
  const plugin = useFaceLandmarkerPlugin();
  const busy = useSharedValue(false);
  const lastRunAt = useSharedValue(0);

  useEffect(() => {
    if (!plugin) logger.warn("[camera] face landmarker plugin isn't in this build — no presence analysis");
  }, [plugin]);

  // Results cross back as JSON: plain data, nothing tied to the frame.
  const deliver = useMemo(() => Worklets.createRunOnJS((json: string) => onFaceFrame(JSON.parse(json))), [onFaceFrame]);

  // Detection runs on its own worklet context so the preview never waits on it.
  const detectAsync = useMemo(
    () =>
      Worklets.defaultContext.createRunAsync((frame: RefCountedFrame) => {
        "worklet";
        try {
          if (plugin) deliver(JSON.stringify(detectFaceLandmarks(plugin, frame)));
        } catch (error) {
          deliver(JSON.stringify({ error: String(error) }));
        } finally {
          frame.decrementRefCount();
          busy.value = false;
        }
      }),
    [plugin, deliver, busy],
  );

  const frameProcessor = useFrameProcessor(
    (frame) => {
      "worklet";
      if (busy.value) return;
      const now = Date.now();
      if (now - lastRunAt.value < MIN_INTERVAL_MS) return;
      lastRunAt.value = now;
      busy.value = true;
      const counted = frame as RefCountedFrame;
      counted.incrementRefCount();
      detectAsync(counted);
    },
    [detectAsync],
  );

  if (!device) {
    return null;
  }

  return (
    <Camera
      ref={cameraRef}
      style={StyleSheet.absoluteFill}
      device={device}
      isActive={isActive}
      video={true}
      audio={audio}
      // MediaPipe on iOS only accepts BGRA buffers ("rgb" here); Android
      // converts YUV itself.
      pixelFormat={Platform.OS === "ios" ? "rgb" : "yuv"}
      frameProcessor={plugin ? frameProcessor : undefined}
    />
  );
}
