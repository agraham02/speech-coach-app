import { Linking, Platform } from "react-native";
import * as Notifications from "expo-notifications";
import { Camera } from "react-native-vision-camera";
import { fromCameraStatus, fromExpoResponse, type PermissionKey, type PermissionLine, type PermissionState } from "../../domain/permissions";
import { logger } from "../../utils/logger";

// Reads and asks for the permissions Tono uses (domain/permissions.ts). Speech
// recognition is its own permission on iOS only; on Android it's the mic's.

interface SpeechPermissions {
  getSpeechRecognizerPermissionsAsync(): Promise<{ granted: boolean; canAskAgain: boolean }>;
  requestSpeechRecognizerPermissionsAsync(): Promise<{ granted: boolean; canAskAgain: boolean }>;
}

// Not there in Expo Go, so load it only when asked.
function speechModule(): SpeechPermissions | null {
  try {
    return require("expo-speech-recognition").ExpoSpeechRecognitionModule as SpeechPermissions;
  } catch {
    return null;
  }
}

export const PERMISSION_KEYS: PermissionKey[] = Platform.OS === "ios" ? ["camera", "microphone", "speech", "notifications"] : ["camera", "microphone", "notifications"];

async function readOne(key: PermissionKey): Promise<PermissionState> {
  try {
    switch (key) {
      case "camera":
        return fromCameraStatus(Camera.getCameraPermissionStatus());
      case "microphone":
        return fromCameraStatus(Camera.getMicrophonePermissionStatus());
      case "speech": {
        const speech = speechModule();
        return speech ? fromExpoResponse(await speech.getSpeechRecognizerPermissionsAsync()) : "blocked";
      }
      case "notifications":
        return fromExpoResponse(await Notifications.getPermissionsAsync());
    }
  } catch (error) {
    logger.warn(`[permissions] couldn't read ${key} — ${(error as Error).message}`);
    return "ask";
  }
}

export async function readPermissions(): Promise<PermissionLine[]> {
  return Promise.all(PERMISSION_KEYS.map(async (key) => ({ key, state: await readOne(key) })));
}

// Shows the system prompt. A no-op once the phone won't show it again.
export async function requestPermission(key: PermissionKey): Promise<void> {
  try {
    switch (key) {
      case "camera":
        await Camera.requestCameraPermission();
        return;
      case "microphone":
        await Camera.requestMicrophonePermission();
        return;
      case "speech":
        await speechModule()?.requestSpeechRecognizerPermissionsAsync();
        return;
      case "notifications":
        await Notifications.requestPermissionsAsync();
        return;
    }
  } catch (error) {
    logger.warn(`[permissions] couldn't ask for ${key} — ${(error as Error).message}`);
  }
}

export function openPhoneSettings(): void {
  Linking.openSettings().catch(() => undefined);
}
