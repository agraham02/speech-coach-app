import { useEffect } from "react";
import { Text, View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { radii, spacing, typography } from "../../theme/theme";
import { makeStyles, useTheme } from "../../theme/ThemeProvider";
import { colorForScore } from "./scoreColor";

interface ScoreBarProps {
  label: string;
  score: number;
  notes?: string;
  suffix?: string;
}

export function ScoreBar({ label, score, notes, suffix }: ScoreBarProps) {
  const styles = useStyles();
  const { colors } = useTheme();
  const fillColor = colorForScore(score, colors);
  const targetPercent = Math.max(0, Math.min(10, score)) * 10;
  const widthPercent = useSharedValue(0);

  useEffect(() => {
    widthPercent.value = withTiming(targetPercent, { duration: 700 });
  }, [targetPercent, widthPercent]);

  const fillStyle = useAnimatedStyle(() => ({
    width: `${widthPercent.value}%`,
  }));

  return (
    <View style={styles.container}>
      <View style={styles.labelRow}>
        <Text style={styles.label}>{label}</Text>
        <Text style={[styles.scoreText, { color: fillColor }]}>
          {score}/10{suffix ? ` · ${suffix}` : ""}
        </Text>
      </View>
      <View style={styles.track}>
        <Animated.View style={[styles.fill, fillStyle, { backgroundColor: fillColor }]} />
      </View>
      {notes ? <Text style={styles.notes}>{notes}</Text> : null}
    </View>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  container: { gap: spacing.xs },
  labelRow: { flexDirection: "row", justifyContent: "space-between" },
  label: { color: colors.textPrimary, fontSize: typography.body, fontWeight: "600" },
  scoreText: { fontSize: typography.caption, fontWeight: "700" },
  track: { height: 6, borderRadius: radii.pill, backgroundColor: colors.surfaceRaised, overflow: "hidden" },
  fill: { height: "100%", borderRadius: radii.pill },
  notes: { color: colors.textSecondary, fontSize: typography.caption, lineHeight: 17 },
}));
