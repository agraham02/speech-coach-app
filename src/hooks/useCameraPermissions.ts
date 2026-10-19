import { Linking } from "react-native";
import { Camera, useCameraPermission, useMicrophonePermission } from "react-native-vision-camera";
import { useCallback, useEffect, useState } from "react";
import { fromCameraStatus } from "../domain/permissions";

// `autoRequest` (the default) shows the system prompts the first time a screen
// that needs them opens; onboarding turns it off and asks on a tap.
export function useCameraPermissions({ autoRequest = true }: { autoRequest?: boolean } = {}) {
  const camera = useCameraPermission();
  const microphone = useMicrophonePermission();
  const [requested, setRequested] = useState(false);

  useEffect(() => {
    if (requested || !autoRequest) return;
    setRequested(true);
    if (!camera.hasPermission) camera.requestPermission();
    if (!microphone.hasPermission) microphone.requestPermission();
  }, [requested, autoRequest, camera, microphone]);

  // Once the phone has been told no, asking again does nothing, so the way
  // back is its Settings app.
  const cameraBlocked = !camera.hasPermission && fromCameraStatus(Camera.getCameraPermissionStatus()) === "blocked";
  const microphoneBlocked = !microphone.hasPermission && fromCameraStatus(Camera.getMicrophonePermissionStatus()) === "blocked";

  const { requestPermission: askCamera } = camera;
  const { requestPermission: askMicrophone } = microphone;
  const requestCameraPermission = useCallback(async () => {
    if (fromCameraStatus(Camera.getCameraPermissionStatus()) === "blocked") {
      Linking.openSettings().catch(() => undefined);
      return false;
    }
    return askCamera();
  }, [askCamera]);
  const requestMicrophonePermission = useCallback(async () => {
    if (fromCameraStatus(Camera.getMicrophonePermissionStatus()) === "blocked") {
      Linking.openSettings().catch(() => undefined);
      return false;
    }
    return askMicrophone();
  }, [askMicrophone]);

  return {
    hasAllPermissions: camera.hasPermission && microphone.hasPermission,
    hasCameraPermission: camera.hasPermission,
    hasMicrophonePermission: microphone.hasPermission,
    cameraBlocked,
    microphoneBlocked,
    requestCameraPermission,
    requestMicrophonePermission,
  };
}
