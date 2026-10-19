import { StyleSheet, Text, View } from "react-native";
import type { FramingStatus, GuideOval } from "../../domain/faceGuide";
import { darkColors as colors, radii, spacing, typography, font } from "../../theme/theme";

const STATUS_COPY: Record<FramingStatus, string> = {
  none: "Move into frame",
  off_center: "Center your face in the oval",
  good: "You're centered and visible",
};

const STATUS_COLOR: Record<FramingStatus, string> = {
  none: colors.danger,
  off_center: colors.warning,
  good: colors.success,
};

interface Props {
  status: FramingStatus;
  // Where to draw the oval (view pixels). The face hooks judge the face
  // against this same oval, so what's drawn is what's checked. Nothing is
  // drawn until the view has been measured.
  oval: GuideOval | null;
  // What to change ("Move a little to the left"), shown in place of the
  // general instruction while the face is off the oval.
  hint?: string | null;
}

// Shown only before recording starts: confirms the speaker is centered in the
// oval, via the on-device face detector, before they commit to recording.
export function FramingGuideOverlay({ status, oval, hint }: Props) {
  if (!oval) return null;
  const ringColor = STATUS_COLOR[status];
  const copy = status === "off_center" && hint ? hint : STATUS_COPY[status];

  return (
    <View style={styles.container} pointerEvents="none">
      <View
        style={[
          styles.frame,
          { borderColor: ringColor, left: oval.cx - oval.rx, top: oval.cy - oval.ry, width: oval.rx * 2, height: oval.ry * 2, borderRadius: oval.rx },
        ]}
      />
      <View style={[styles.pill, { borderColor: ringColor, top: oval.cy + oval.ry + spacing.md }]}>
        <View style={[styles.dot, { backgroundColor: ringColor }]} />
        <Text style={styles.label}>{copy}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 },
  frame: { position: "absolute", borderWidth: 3 },
  pill: {
    position: "absolute",
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: "rgba(11,11,15,0.75)",
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.pill,
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
  label: { color: colors.textPrimary, fontSize: typography.caption, ...font("600") },
});
