import { Text, View } from "react-native";
import { Card } from "../common/Card";
import { colorForScore } from "./scoreColor";
import type { SessionScoreBreakdown } from "../../domain/sessionScore";
import { radii, spacing, typography } from "../../theme/theme";
import { makeStyles, useTheme } from "../../theme/ThemeProvider";

// How the session score was put together: each category's score, what the
// phone and the cloud review said about it, and how much it counts.
export function ScoreBreakdownCard({ breakdown }: { breakdown: SessionScoreBreakdown }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const both = breakdown.sources.length === 2;

  return (
    <Card style={styles.card}>
      <Text style={styles.label}>HOW THIS SCORE IS BUILT</Text>
      {breakdown.components.map((c) => (
        <View key={c.key} style={styles.row}>
          <View style={styles.rowTop}>
            <Text style={styles.name}>{c.label}</Text>
            <Text style={[styles.value, { color: colorForScore(c.score, colors) }]}>{c.score}</Text>
          </View>
          <View style={styles.track}>
            <View style={[styles.fill, { width: `${c.score * 10}%`, backgroundColor: colorForScore(c.score, colors) }]} />
          </View>
          <Text style={styles.meta}>
            {[c.local != null ? `Phone ${c.local}` : null, c.cloud != null ? `Cloud ${c.cloud}` : null, `${Math.round(c.weight * 100)}% of total`]
              .filter(Boolean)
              .join(" · ")}
          </Text>
        </View>
      ))}
      <Text style={styles.footnote}>
        {both
          ? `Blends what this phone measured with the cloud review${breakdown.cloudOverall != null ? ` (its overall ${breakdown.cloudOverall}/10 counts for 15%)` : ""}.`
          : breakdown.sources[0] === "cloud"
            ? "From the cloud review."
            : "Measured on this phone. A cloud review adds content and tone judgments and sharpens this score."}
      </Text>
    </Card>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  card: { gap: spacing.sm },
  label: { color: colors.textMuted, fontSize: typography.caption - 1, fontWeight: "700", letterSpacing: 1 },
  row: { gap: 4 },
  rowTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" },
  name: { color: colors.textPrimary, fontSize: typography.body, fontWeight: "600" },
  value: { fontSize: typography.body, fontWeight: "800" },
  track: { height: 6, borderRadius: radii.pill, backgroundColor: colors.surfaceRaised, overflow: "hidden" },
  fill: { height: 6, borderRadius: radii.pill },
  meta: { color: colors.textMuted, fontSize: typography.caption },
  footnote: { color: colors.textSecondary, fontSize: typography.caption, lineHeight: 17 },
}));
