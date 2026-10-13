import { View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { makeStyles, useTheme } from "../../theme/ThemeProvider";
import type { Colors } from "../../theme/theme";
import { Txt } from "./Txt";

type BannerTone = "success" | "warning" | "danger" | "neutral";

const TONES = (colors: Colors): Record<BannerTone, { bg: string; fg: string; icon: keyof typeof Ionicons.glyphMap }> => ({
  success: { bg: colors.successMuted, fg: colors.success, icon: "checkmark-circle" },
  warning: { bg: colors.warningMuted, fg: colors.warning, icon: "alert-circle" },
  danger: { bg: colors.dangerMuted, fg: colors.danger, icon: "close-circle" },
  neutral: { bg: colors.surfaceRaised, fg: colors.textSecondary, icon: "information-circle" },
});

// An inline notice: a tinted block with an icon.
export function Banner({ text, tone = "neutral" }: { text: string; tone?: BannerTone }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const t = TONES(colors)[tone];
  return (
    <View style={[styles.container, { backgroundColor: t.bg }]}>
      <Ionicons name={t.icon} size={18} color={t.fg} />
      <Txt variant="subhead" weight="500" color={tone === "neutral" ? colors.textPrimary : t.fg} style={styles.text}>
        {text}
      </Txt>
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  container: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: t.space.sm + 2,
    borderRadius: t.radius.md,
    paddingVertical: t.space.md - 2,
    paddingHorizontal: t.space.md,
  },
  text: { flexShrink: 1 },
}));
