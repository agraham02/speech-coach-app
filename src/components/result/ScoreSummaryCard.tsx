import { View } from "react-native";
import { Card } from "../common/Card";
import { PrimaryButton } from "../common/PrimaryButton";
import { Txt } from "../common/Txt";
import { colorForScore } from "./scoreColor";
import type { PillarScore, TakeScores } from "../../domain/scoring/takeScore";
import { producerName } from "../../domain/analysis/provenance";
import { trustLabel } from "../../domain/signalLab/readingTrust";
import { makeStyles, useTheme } from "../../theme/ThemeProvider";

// The Overview's summary of the take: one row per pillar with its score, and
// under it the skills that make it up, with the same names and numbers the Scores
// tab shows. "See every score" opens the Scores tab for the notes, the numbers
// behind them and the graphs.
export function ScoreSummaryCard({ scores, pending, onSeeScores }: { scores: TakeScores; pending?: boolean; onSeeScores?: () => void }) {
  const styles = useStyles();
  const judge = producerName(scores.judgedBy);
  const checked = scores.headline === "overall";
  return (
    <Card style={styles.card}>
      <Txt variant="footnote" weight="600" tone="muted">
        {pending ? "Scored so far" : "Your scores"}
      </Txt>
      {scores.pillars.map((pillar) => (pillar.id === "message" && !checked ? <NotChecked key={pillar.id} /> : <PillarRow key={pillar.id} pillar={pillar} />))}
      <Txt variant="caption1" tone="secondary">
        {pending
          ? "Still measuring the rest. The total score appears when every part is in."
          : checked
            ? `Message judged by ${judge}. Delivery is measured on this phone, so it's the same with or without a review.`
            : "Delivery, measured on this phone. A review by Tono AI checks what you said and adds Message."}
      </Txt>
      {onSeeScores && !pending ? <PrimaryButton label="See every score" variant="secondary" onPress={onSeeScores} /> : null}
    </Card>
  );
}

function NotChecked() {
  const styles = useStyles();
  return (
    <View style={styles.row}>
      <View style={styles.top}>
        <Txt variant="callout" weight="600" style={styles.flex}>
          Message
        </Txt>
        <Txt variant="callout" tone="muted">
          Not checked
        </Txt>
      </View>
    </View>
  );
}

function PillarRow({ pillar: p }: { pillar: PillarScore }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const score = p.score ?? 0;
  const color = colorForScore(score, colors);
  const parts = p.skills.filter((s) => s.score != null);
  const beta = p.skills.flatMap((s) => s.leaves).filter((l) => l.trust);
  return (
    <View style={styles.row}>
      <View style={styles.top}>
        <Txt variant="callout" weight="600" style={styles.flex}>
          {p.name}
        </Txt>
        <Txt variant="callout" weight="600" tabular color={color}>
          {p.score ?? "–"}
        </Txt>
      </View>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${score}%`, backgroundColor: color }]} />
      </View>
      <Txt variant="caption1" tone="secondary">
        {parts.map((s) => `${s.name} ${s.score}`).join("  ·  ")}
      </Txt>
      {beta.length ? (
        <Txt variant="caption1" tone="muted">
          {beta.map((l) => `${l.name} ${l.score} (${trustLabel(l.trust!)})`).join("  ·  ")}, not in the total
        </Txt>
      ) : null}
      <Txt variant="caption1" tone="muted">
        {Math.round(p.share * 100)}% of the total
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
