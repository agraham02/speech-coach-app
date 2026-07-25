import { View, StyleSheet } from "react-native";
import { RadarChart } from "react-native-gifted-charts";
import type { SessionScores } from "../../domain/sessionTypes";
import { colors, spacing } from "../../theme/theme";

function average(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function ScoreRadarChart({ scores }: { scores: SessionScores }) {
  const deliveryAvg = average([
    scores.rateScore,
    scores.volumeScore,
    scores.pitchMelodyScore,
    scores.tonalityScore,
    scores.pausingScore,
  ]);
  const presenceAvg = average([scores.eyeContactScore, scores.facialExpressivenessScore]);
  const contentAvg = average([scores.relevanceScore, scores.coherenceScore]);

  const data = [
    scores.structureScore,
    contentAvg,
    deliveryAvg,
    presenceAvg,
    scores.faceVoiceCongruenceScore,
  ];

  return (
    <View style={styles.container}>
      <RadarChart
        data={data}
        labels={["Structure", "Content", "Delivery", "Presence", "Congruence"]}
        maxValue={10}
        noOfSections={4}
        chartSize={220}
        polygonConfig={{
          fill: colors.accent,
          opacity: 0.25,
          stroke: colors.accent,
          strokeWidth: 2,
        }}
        gridConfig={{ stroke: colors.border, strokeWidth: 1 }}
        labelConfig={{ stroke: colors.textSecondary, fontSize: 11 }}
        dataLabelsConfig={{ stroke: colors.textMuted, fontSize: 10 }}
        isAnimated
        animationDuration={600}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: "center", paddingVertical: spacing.sm },
});
