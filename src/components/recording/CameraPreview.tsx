import { StyleSheet } from "react-native";
import { useCameraDevice, type Camera as VisionCamera } from "react-native-vision-camera";
import { Camera as FaceDetectionCamera, type Face, type FrameFaceDetectionOptions } from "react-native-vision-camera-face-detector";
import type { Frame } from "react-native-vision-camera";
import type { RefObject } from "react";

interface CameraPreviewProps {
  cameraRef: RefObject<VisionCamera | null>;
  isActive: boolean;
  onFacesDetected: (faces: Face[], frame: Frame) => void;
  faceDetectionOptions: FrameFaceDetectionOptions;
}

export function CameraPreview({ cameraRef, isActive, onFacesDetected, faceDetectionOptions }: CameraPreviewProps) {
  const device = useCameraDevice("front");

  if (!device) {
    return null;
  }

  return (
    <FaceDetectionCamera
      ref={cameraRef}
      style={StyleSheet.absoluteFill}
      device={device}
      isActive={isActive}
      video={true}
      audio={true}
      faceDetectionCallback={onFacesDetected}
      faceDetectionOptions={faceDetectionOptions}
    />
  );
}
