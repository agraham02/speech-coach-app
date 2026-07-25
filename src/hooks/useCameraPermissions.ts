import { useCameraPermission, useMicrophonePermission } from "react-native-vision-camera";
import { useEffect, useState } from "react";

export function useCameraPermissions() {
  const camera = useCameraPermission();
  const microphone = useMicrophonePermission();
  const [requested, setRequested] = useState(false);

  useEffect(() => {
    if (requested) return;
    setRequested(true);
    if (!camera.hasPermission) camera.requestPermission();
    if (!microphone.hasPermission) microphone.requestPermission();
  }, [requested, camera, microphone]);

  return {
    hasAllPermissions: camera.hasPermission && microphone.hasPermission,
    hasCameraPermission: camera.hasPermission,
    hasMicrophonePermission: microphone.hasPermission,
    requestCameraPermission: camera.requestPermission,
    requestMicrophonePermission: microphone.requestPermission,
  };
}
