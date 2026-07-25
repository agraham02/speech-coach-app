import { StyleSheet, Text, View } from "react-native";
import { colors, typography } from "../../theme/theme";
import { colorForScore } from "./scoreColor";

export function OverallScoreRing({ score }: { score: number }) {
  const color = colorForScore(score);
  return (
    <View style={[styles.ring, { borderColor: color }]}>
      <Text style={[styles.score, { color }]}>{score}</Text>
      <Text style={styles.outOf}>/10</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  ring: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 3,
    alignItems: "center",
    justifyContent: "center",
  },
  score: { fontSize: typography.title, fontWeight: "800", lineHeight: typography.title + 2 },
  outOf: { color: colors.textMuted, fontSize: typography.caption - 2 },
});
