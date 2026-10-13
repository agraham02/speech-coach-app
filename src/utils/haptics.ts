import { Platform } from "react-native";
import * as Haptics from "expo-haptics";

// Fire-and-forget haptics with one vocabulary for the whole app. On Android,
// impact/notification go through the Vibrator API (not recommended for UI
// feedback per the expo-haptics docs), so they use the platform's own
// haptic constants instead.

export function tick(): void {
  if (Platform.OS === "android") {
    Haptics.performAndroidHapticsAsync(Haptics.AndroidHaptics.Segment_Tick).catch(() => undefined);
  } else {
    Haptics.selectionAsync().catch(() => undefined);
  }
}

export function tap(): void {
  if (Platform.OS === "android") {
    Haptics.performAndroidHapticsAsync(Haptics.AndroidHaptics.Context_Click).catch(() => undefined);
  } else {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
  }
}

export function success(): void {
  if (Platform.OS === "android") {
    Haptics.performAndroidHapticsAsync(Haptics.AndroidHaptics.Confirm).catch(() => undefined);
  } else {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
  }
}

export function warn(): void {
  if (Platform.OS === "android") {
    Haptics.performAndroidHapticsAsync(Haptics.AndroidHaptics.Reject).catch(() => undefined);
  } else {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => undefined);
  }
}
