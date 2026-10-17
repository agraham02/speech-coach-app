import type { ComponentProps } from "react";
import { Platform } from "react-native";
import { Txt } from "../common/Txt";

export const MONO_FONT = Platform.select({ ios: "Menlo", default: "monospace" });

// Values, IDs and log text in the Dev area: monospace, tabular figures. Never
// a fontWeight (see the design language) — the face has one weight.
export function Mono({ style, variant = "caption1", ...props }: ComponentProps<typeof Txt>) {
  return <Txt variant={variant} tabular {...props} style={[{ fontFamily: MONO_FONT }, style]} />;
}
