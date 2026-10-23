import { Text, View } from "react-native";
import { LineChart } from "react-native-gifted-charts";
import type { DspStatus } from "../../domain/sessionTypes";
import { spacing, typography, font } from "../../theme/theme";
import { makeStyles, useTheme } from "../../theme/ThemeProvider";

interface PitchVolumeChartProps {
  dspStatus: DspStatus | null;
  pitchContourHz: (number | null)[] | null;
  volumeEnvelopeDbfs: number[] | null;
}

// On-device pitch contour (dense YIN, domain/dsp/pitchTracker.ts; session 11
// replaces this chart with domain/signals/audioSummary.voiceChartData)
// and volume envelope, in 200ms buckets. Must degrade visibly, never
// silently, when dsp_status isn't 'complete' — a muted explanatory line
// instead of just omitting the chart, since a missing chart with no
// explanation reads as a bug rather than an expected degrade path.
export function PitchVolumeChart({ dspStatus, pitchContourHz, volumeEnvelopeDbfs }: PitchVolumeChartProps) {
  const styles = useStyles();
  const { colors } = useTheme();
  if (dspStatus !== "complete" || !pitchContourHz || !volumeEnvelopeDbfs) {
    return (
      <View style={styles.container}>
        <Text style={styles.label}>Pitch & volume over time</Text>
        <Text style={styles.unavailable}>
          {dspStatus === "failed" ? "Not available for this session." : "Not available — no on-device analysis run yet."}
        </Text>
      </View>
    );
  }

  // Gaps (unvoiced/silent buckets) render as 0 rather than being dropped, so
  // the x-axis stays aligned with the volume chart below it — a real "no
  // pitch detected here" reads honestly as a dip to the chart's floor, not a
  // misleading interpolated line across silence.
  const pitchData = pitchContourHz.map((hz, i) => ({ value: hz ?? 0, label: i % 5 === 0 ? `${(i * 0.2).toFixed(0)}s` : "" }));
  const volumeData = volumeEnvelopeDbfs.map((db) => ({ value: db }));
  const maxPitch = Math.max(...pitchContourHz.filter((h): h is number => h !== null), 200);

  return (
    <View style={styles.container}>
      <Text style={styles.label}>PITCH (Hz)</Text>
      <LineChart
        data={pitchData}
        height={80}
        color={colors.violet}
        thickness={2}
        curved
        maxValue={Math.ceil((maxPitch + 50) / 50) * 50}
        noOfSections={3}
        initialSpacing={4}
        endSpacing={4}
        rulesColor={colors.border}
        rulesType="dashed"
        xAxisColor={colors.border}
        yAxisColor={colors.border}
        yAxisTextStyle={{ ...font("400"), color: colors.textMuted, fontSize: 9 }}
        xAxisLabelTextStyle={{ ...font("400"), color: colors.textMuted, fontSize: 9 }}
        hideDataPoints
      />
      <Text style={[styles.label, styles.volumeLabel]}>VOLUME (dBFS)</Text>
      <LineChart
        data={volumeData}
        height={60}
        color={colors.teal}
        thickness={2}
        curved
        areaChart
        startFillColor={colors.teal}
        startOpacity={0.15}
        endOpacity={0}
        maxValue={0}
        mostNegativeValue={-60}
        noOfSections={2}
        initialSpacing={4}
        endSpacing={4}
        rulesColor={colors.border}
        rulesType="dashed"
        xAxisColor={colors.border}
        yAxisColor={colors.border}
        yAxisTextStyle={{ ...font("400"), color: colors.textMuted, fontSize: 9 }}
        hideDataPoints
        hideAxesAndRules={false}
      />
    </View>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  container: { gap: spacing.xs, marginTop: spacing.sm },
  label: { color: colors.textSecondary, fontSize: 13, ...font("600") },
  volumeLabel: { marginTop: spacing.sm },
  unavailable: { ...font("400"), color: colors.textMuted, fontSize: typography.caption, fontStyle: "italic" },
}));
