// The four things Tono asks the phone for, and what state each is in.
// Pure: the services read the real status and hand it to these.

export type PermissionKey = "camera" | "microphone" | "speech" | "notifications";

// granted: on. ask: not asked yet (or asked and can be again), so the system
// prompt will show. blocked: said no, or the phone forbids it, so only the
// phone's Settings can change it.
export type PermissionState = "granted" | "ask" | "blocked";

export interface PermissionLine {
  key: PermissionKey;
  state: PermissionState;
}

export const PERMISSION_INFO: Record<PermissionKey, { title: string; why: string; icon: "videocam-outline" | "mic-outline" | "chatbubble-ellipses-outline" | "notifications-outline" }> = {
  camera: { title: "Camera", why: "Video takes, and the face check for eye contact and expression", icon: "videocam-outline" },
  microphone: { title: "Microphone", why: "Every recording and drill", icon: "mic-outline" },
  speech: { title: "Speech recognition", why: "Follows your words live in drills", icon: "chatbubble-ellipses-outline" },
  notifications: { title: "Notifications", why: "Practice reminders and event check-ins", icon: "notifications-outline" },
};

// VisionCamera's names. On Android a "denied" it can't re-ask already reads
// "not-determined", so "denied" really is a closed door on both platforms.
export function fromCameraStatus(status: "granted" | "not-determined" | "denied" | "restricted"): PermissionState {
  if (status === "granted") return "granted";
  if (status === "not-determined") return "ask";
  return "blocked";
}

// Expo's permission responses (notifications, speech recognition).
export function fromExpoResponse(response: { granted: boolean; canAskAgain: boolean }): PermissionState {
  if (response.granted) return "granted";
  return response.canAskAgain ? "ask" : "blocked";
}

export function stateLabel(state: PermissionState): string {
  return state === "granted" ? "On" : state === "ask" ? "Not asked yet" : "Off";
}

// What the Settings row does when tapped: the system prompt can only show
// while it's still askable; after that, the phone's Settings is the only way.
export function tapAction(state: PermissionState): "request" | "settings" {
  return state === "ask" ? "request" : "settings";
}

export function needsAttention(lines: PermissionLine[]): PermissionLine[] {
  return lines.filter((l) => l.state !== "granted");
}
