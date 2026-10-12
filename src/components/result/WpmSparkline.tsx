import { Text, View } from "react-native";
import { LineChart } from "react-native-gifted-charts";
import type { WpmPoint } from "../../domain/sessionTypes";
import { spacing, typography, font } from "../../theme/theme";
import { makeStyles, useTheme } from "../../theme/ThemeProvider";

// Real words-per-minute over time, from word-level timestamps (on-device
// ASR) — shown alongside (not instead of) the existing Rate
// ScoreBar's single averaged number, which stays Gemini's own qualitative
// judgment. Only renders when word-level data exists; returns null otherwise
// so it never shows an empty/broken chart for older or Gemini-fallback sessions.
export function WpmSparkline({ wpmCurve }: { wpmCurve: WpmPoint[] | null }) {
  const styles = useStyles();
  const { colors } = useTheme();
  if (!wpmCurve || wpmCurve.length === 0) return null;

  const data = wpmCurve.map((point) => ({ value: point.wpm, label: `${point.bucketStartSeconds}s` }));
  const maxWpm = Math.max(...wpmCurve.map((p) => p.wpm), 60);

  return (
    <View style={styles.container}>
      <Text style={styles.label}>Pace over time</Text>
      <LineChart
        data={data}
        height={100}
        color={colors.accent}
        thickness={2}
        curved
        areaChart
        startFillColor={colors.accent}
        startOpacity={0.2}
        endOpacity={0}
        maxValue={Math.ceil((maxWpm + 20) / 20) * 20}
        noOfSections={3}
        initialSpacing={8}
        endSpacing={8}
        rulesColor={colors.border}
        rulesType="dashed"
        xAxisColor={colors.border}
        yAxisColor={colors.border}
        yAxisTextStyle={{ ...font("400"), color: colors.textMuted, fontSize: 9 }}
        xAxisLabelTextStyle={{ ...font("400"), color: colors.textMuted, fontSize: 9 }}
        dataPointsColor={colors.accent}
        hideDataPoints
      />
    </View>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  container: { gap: spacing.xs, marginTop: spacing.sm },
  label: { color: colors.textSecondary, fontSize: 13, ...font("600") },
}));
