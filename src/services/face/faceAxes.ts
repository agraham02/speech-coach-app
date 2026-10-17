import { Platform } from "react-native";

// The vertical eye blendshapes come out inverted on the iOS front camera:
// looking up reads as looking down. Left/right and the head pose are fine
// (seen in the Face Lab, Auto orientation). Android hasn't been checked.
export const INVERT_GAZE_Y = Platform.OS === "ios";
