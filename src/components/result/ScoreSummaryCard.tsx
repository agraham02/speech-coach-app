import { View } from "react-native";
import { Card } from "../common/Card";
import { PrimaryButton } from "../common/PrimaryButton";
import { Txt } from "../common/Txt";
import { colorForScore } from "./scoreColor";
import { headlineSheet, type CategoryScore, type TakeScores } from "../../domain/scoring/takeScore";
import { producerName } from "../../domain/analysis/provenance";
import { makeStyles, useTheme } from "../../theme/ThemeProvider";

// The Overview's summary of the Scores tab: one row per skill with its score,
// and under it the subcategories that make it up, with the same names and
// numbers the Scores tab shows. Nothing is explained here; "See every score"
// opens the Scores tab for the notes, the numbers behind them and the graphs.
export function ScoreSummaryCard({ scores, pending, onSeeScores }: { scores: TakeScores; pending?: boolean; onSeeScores?: () => void }) {
  const styles = useStyles();
  const sheet = headlineSheet(scores);
  const judge = producerName(scores.judgedBy);

  return (
    <Card style={styles.card}>
      <Txt variant="footnote" weight="600" tone="muted">
        {pending ? "Scored so far" : "Your scores"}
      </Txt>
      {sheet.categories.map((c) => (
        <CategoryRow key={c.skill} category={c} other={scores.judged && scores.measured ? scores.measured.categories.find((m) => m.skill === c.skill)?.score ?? null : null} judge={judge} judged={scores.headline === "judged"} />
      ))}
      <Txt variant="caption1" tone="secondary">
        {pending
          ? "Still measuring the rest. The total score appears when every part is in."
          : scores.headline === "judged"
            ? `Judged by ${judge}${scores.measured ? `. Measured on this phone alone, the take scores ${scores.measured.overall}` : ""}.`
            : "Measured on this phone. A review by Tono AI adds what the words did and how it came across, and becomes the score."}
      </Txt>
      {onSeeScores && !pending ? <PrimaryButton label="See every score" variant="secondary" onPress={onSeeScores} /> : null}
    </Card>
  );
}

function CategoryRow({ category: c, other, judge, judged }: { category: CategoryScore; other: number | null; judge: string; judged: boolean }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const color = colorForScore(c.score, colors);
  const parts = c.subscores.filter((s) => s.rollsUp);
  return (
    <View style={styles.row}>
      <View style={styles.top}>
        <Txt variant="callout" weight="600" style={styles.flex}>
          {c.label}
        </Txt>
        <Txt variant="callout" weight="600" tabular color={color}>
          {c.score}
        </Txt>
      </View>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${c.score * 10}%`, backgroundColor: color }]} />
      </View>
      <Txt variant="caption1" tone="secondary">
        {parts.map((s) => `${s.label} ${s.score}`).join("  ·  ")}
      </Txt>
      <Txt variant="caption1" tone="muted">
        {Math.round(c.weight * 100)}% of the total{other != null && judged ? ` · ${judge} ${c.score}, this phone ${other}` : ""}
      </Txt>
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  card: { gap: t.space.md },
  flex: { flex: 1 },
  row: { gap: 4 },
  top: { flexDirection: "row", alignItems: "baseline" },
  track: { height: 6, borderRadius: t.radius.pill, backgroundColor: t.colors.surfaceRaised, overflow: "hidden" },
  fill: { height: 6, borderRadius: t.radius.pill },
}));
