import { View, StyleSheet } from "react-native";
import { RadarChart } from "react-native-gifted-charts";
import type { SessionScores } from "../../domain/sessionTypes";
import { spacing, font } from "../../theme/theme";
import { useTheme } from "../../theme/ThemeProvider";

// A 0 is a subcategory the judge didn't score on this take: left out.
function average(values: number[]): number {
  const scored = values.filter((v) => v > 0);
  return scored.length ? scored.reduce((sum, value) => sum + value, 0) / scored.length : 0;
}

export function ScoreRadarChart({ scores }: { scores: SessionScores }) {
  const { colors } = useTheme();
  const deliveryAvg = average([
    scores.rateScore,
    scores.volumeScore,
    scores.pitchMelodyScore,
    scores.tonalityScore,
    scores.pausingScore,
  ]);
  const presenceAvg = average([scores.eyeContactScore, scores.facialExpressivenessScore]);
  const contentAvg = average([scores.relevanceScore, scores.coherenceScore]);

  // Face-voice match was cut from scoring (docs/decisions/scoring-taxonomy.md);
  // Structure and Content aren't judged on a scripted reading.
  const axes = [
    { label: "Structure", value: scores.structureScore },
    { label: "Content", value: contentAvg },
    { label: "Delivery", value: deliveryAvg },
    { label: "Presence", value: presenceAvg },
    { label: "Congruence", value: scores.faceVoiceCongruenceScore },
  ].filter((a) => a.value > 0);
  const data = axes.map((a) => a.value);

  return (
    <View style={styles.container}>
      <RadarChart
        data={data}
        labels={axes.map((a) => a.label)}
        maxValue={10}
        noOfSections={4}
        chartSize={220}
        polygonConfig={{
          fill: colors.accent,
          opacity: 0.25,
          stroke: colors.accent,
          strokeWidth: 2,
          showDataValuesAsLabels: true,
        }}
        gridConfig={{ stroke: colors.border, strokeWidth: 1, fill: "transparent", showGradient: false, opacity: 1 }}
        labelConfig={{ ...font("400"), stroke: colors.textSecondary, fontSize: 11 }}
        dataLabelsConfig={{ stroke: colors.textPrimary, fontSize: 11, ...font("700") }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: "center", paddingVertical: spacing.sm },
});
