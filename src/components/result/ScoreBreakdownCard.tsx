import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Card } from "../common/Card";
import { Reveal } from "../common/Skeleton";
import { Txt } from "../common/Txt";
import { colorForScore } from "./scoreColor";
import { headlineSheet, type CategoryScore, type ScoreFactor, type SubScore, type TakeScores } from "../../domain/scoring/takeScore";
import { producerName } from "../../domain/analysis/provenance";
import { tick } from "../../utils/haptics";
import { radii, spacing, typography, font } from "../../theme/theme";
import { makeStyles, useTheme } from "../../theme/ThemeProvider";

// How the take's score is built: one row per skill (the taxonomy in
// domain/scoring/taxonomy.ts), its score, and how much it counts. Tap a skill
// to see its sub-scores: each one says whether it was judged by Tono AI or
// measured on the phone, with the judge's note or the measurement and the
// rule behind it. The judged score is the take's score whenever it exists.
export function ScoreBreakdownCard({ scores, pending }: { scores: TakeScores; pending?: boolean }) {
  const styles = useStyles();
  const [open, setOpen] = useState<string | null>(null);
  const sheet = headlineSheet(scores);
  const judge = producerName(scores.judgedBy);

  return (
    <Card style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.label}>{pending ? "Scored so far" : "How this score is built"}</Text>
        <Txt variant="caption1" tone="muted">
          Tap one to see why
        </Txt>
      </View>
      {sheet.categories.map((c) => (
        <CategoryRow
          key={c.skill}
          category={c}
          measured={scores.measured?.categories.find((m) => m.skill === c.skill)?.score ?? null}
          judged={scores.judged ? c.score : null}
          judge={judge}
          open={open === c.skill}
          onToggle={() => {
            tick();
            setOpen((k) => (k === c.skill ? null : c.skill));
          }}
        />
      ))}
      <Text style={styles.footnote}>
        {pending
          ? "Still measuring the rest. The total score appears when every part is in."
          : scores.judged
            ? `Judged by ${judge}, with the phone's measurements as its evidence${scores.measured ? `. Measured on the phone alone, this take scores ${scores.measured.overall}` : ""}.`
            : "Measured on this phone. A review by Tono AI adds what the words did and how it came across, and becomes the score."}
      </Text>
    </Card>
  );
}

function CategoryRow({
  category: c,
  measured,
  judged,
  judge,
  open,
  onToggle,
}: {
  category: CategoryScore;
  measured: number | null;
  judged: number | null;
  judge: string;
  open: boolean;
  onToggle: () => void;
}) {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <View style={styles.row}>
      <Pressable onPress={onToggle} accessibilityRole="button" accessibilityState={{ expanded: open }} accessibilityHint="Shows how this part was scored" style={styles.rowPress}>
        <View style={styles.rowTop}>
          <Text style={styles.name}>{c.label}</Text>
          <View style={styles.valueRow}>
            <Text style={[styles.value, { color: colorForScore(c.score, colors) }]}>{c.score}</Text>
            <Ionicons name={open ? "chevron-up" : "chevron-down"} size={14} color={colors.textMuted} />
          </View>
        </View>
        <View style={styles.track}>
          <View style={[styles.fill, { width: `${c.score * 10}%`, backgroundColor: colorForScore(c.score, colors) }]} />
        </View>
        <Text style={styles.meta}>
          {[judged != null ? `${judge} ${judged}` : null, measured != null ? `Phone ${measured}` : null, `${Math.round(c.weight * 100)}% of total`]
            .filter(Boolean)
            .join(" · ")}
        </Text>
      </Pressable>
      {open ? (
        <Reveal style={styles.detail}>
          {c.subscores.map((s) => (
            <SubScoreRow key={s.id} sub={s} judge={judge} />
          ))}
        </Reveal>
      ) : null}
    </View>
  );
}

function SubScoreRow({ sub: s, judge }: { sub: SubScore; judge: string }) {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <View style={styles.group}>
      <View style={styles.factorTop}>
        <Txt variant="subhead" weight="600" style={styles.flex}>
          {s.label}{" "}
          <Txt variant="footnote" tone="muted">
            · {s.layer === "judged" ? judge : "measured on the phone"}
            {s.rollsUp ? "" : ", not in the total"}
          </Txt>
        </Txt>
        <Txt variant="subhead" weight="600" tabular color={colorForScore(s.score, colors)}>
          {s.score}
        </Txt>
      </View>
      {s.notes ? (
        <Txt variant="footnote" tone="secondary">
          {s.notes}
        </Txt>
      ) : null}
      {s.factors?.map((f) => <FactorRow key={f.label} factor={f} />)}
    </View>
  );
}

function FactorRow({ factor: f }: { factor: ScoreFactor }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const badge =
    f.delta != null
      ? { text: f.delta > 0 ? `+${f.delta}` : `${f.delta}`, color: f.delta > 0 ? colors.success : colors.warning }
      : f.score != null
        ? { text: `${f.score}`, color: colorForScore(f.score, colors) }
        : null;
  return (
    <View style={styles.factor}>
      <View style={styles.factorTop}>
        <Txt variant="footnote" weight="600" style={styles.flex}>
          {f.label} <Txt variant="footnote" tone="muted">· {f.value}</Txt>
        </Txt>
        {badge ? (
          <Txt variant="footnote" weight="600" tabular color={badge.color}>
            {badge.text}
          </Txt>
        ) : null}
      </View>
      <Txt variant="footnote" tone="secondary">
        {f.rule}
      </Txt>
    </View>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  card: { gap: spacing.sm },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" },
  label: { color: colors.textMuted, fontSize: 13, ...font("600") },
  row: { gap: spacing.sm },
  rowPress: { gap: 4, paddingVertical: 2 },
  rowTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" },
  valueRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  name: { color: colors.textPrimary, fontSize: typography.body, ...font("600") },
  value: { fontSize: typography.body, ...font("800") },
  track: { height: 6, borderRadius: radii.pill, backgroundColor: colors.surfaceRaised, overflow: "hidden" },
  fill: { height: 6, borderRadius: radii.pill },
  meta: { ...font("400"), color: colors.textMuted, fontSize: typography.caption },
  detail: { gap: spacing.md, padding: spacing.md, borderRadius: radii.md, backgroundColor: colors.surfaceRaised, marginBottom: spacing.xs },
  group: { gap: spacing.xs },
  factor: { gap: 2, paddingLeft: spacing.sm },
  factorTop: { flexDirection: "row", alignItems: "baseline", gap: spacing.sm },
  flex: { flex: 1 },
  footnote: { ...font("400"), color: colors.textSecondary, fontSize: typography.caption, lineHeight: 17 },
}));
