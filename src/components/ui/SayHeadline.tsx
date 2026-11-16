import type { StyleProp, TextStyle } from "react-native";
import { useTheme } from "../../theme/ThemeProvider";
import { Txt } from "../common/Txt";
import { SAY_DEFAULT_HINT, SAY_SIZES, sayPlainText, sayTone, type SaySegment, type SaySize } from "./displayLogic";

export interface SayHeadlineProps {
  segments: readonly SaySegment[];
  // l 34/38 (default), m 27/31, s 22/27.
  size?: SaySize;
  style?: StyleProp<TextStyle>;
  numberOfLines?: number;
  testID?: string;
}

// A two-tone sentence headline: quiet words, with the parts that matter in full
// ink ("Today, **10 min**"). A phrase with onPress is the control: full ink with
// a dotted brand underline, announced as a button with a hint.
//
// Platform notes: nested text takes no hit slop, so a tappable phrase is as tall
// as its line (38dp at size l, shorter at m and s); the dotted style and the
// underline colour apply on iOS, and Android draws a plain underline.
export function SayHeadline({ segments, size = "l", style, numberOfLines, testID }: SayHeadlineProps) {
  const { colors } = useTheme();
  const metrics = SAY_SIZES[size];
  const anyPress = segments.some((s) => s.onPress);
  return (
    <Txt
      variant="say"
      tone="muted"
      style={[metrics, style]}
      numberOfLines={numberOfLines}
      accessibilityRole="header"
      // Without controls inside, the whole sentence reads as one. With them,
      // each phrase must stay reachable, so the parent doesn't override.
      accessibilityLabel={anyPress ? undefined : sayPlainText(segments)}
      testID={testID}
    >
      {segments.map((seg, i) => {
        const tone = sayTone(seg);
        if (seg.onPress) {
          return (
            <Txt
              key={i}
              variant="say"
              tone="primary"
              style={[
                metrics,
                {
                  textDecorationLine: "underline",
                  textDecorationStyle: "dotted",
                  textDecorationColor: colors.brand,
                },
              ]}
              onPress={seg.onPress}
              accessibilityRole="button"
              accessibilityLabel={seg.accessibilityLabel ?? seg.text}
              accessibilityHint={seg.accessibilityHint ?? SAY_DEFAULT_HINT}
            >
              {seg.text}
            </Txt>
          );
        }
        return (
          <Txt key={i} variant="say" tone={tone} style={metrics}>
            {seg.text}
          </Txt>
        );
      })}
    </Txt>
  );
}
