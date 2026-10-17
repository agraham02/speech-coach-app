import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Card } from "../common/Card";
import { Reveal } from "../common/Skeleton";
import { Txt } from "../common/Txt";
import { colorForScore } from "./scoreColor";
import { cloudFactors, type ScoreComponent, type ScoreFactor, type SessionScoreBreakdown } from "../../domain/sessionScore";
import type { SessionScores } from "../../domain/sessionTypes";
import { tick } from "../../utils/haptics";
import { radii, spacing, typography, font } from "../../theme/theme";
import { makeStyles, useTheme } from "../../theme/ThemeProvider";

// How the session score was put together: each category's score, what the
// phone and the AI coach said about it, and how much it counts. Tap a
// category to see its ingredients — each measurement, the rule that scored
// it (what took points away, what would earn them back), and the AI
// coach's own sub-scores and notes.
export function ScoreBreakdownCard({ breakdown, review, pending }: { breakdown: SessionScoreBreakdown; review?: SessionScores | null; pending?: boolean }) {
  const styles = useStyles();
  const [open, setOpen] = useState<string | null>(null);
  const both = breakdown.sources.length === 2;
  const share = Math.round((breakdown.cloudOverallShare ?? 0.15) * 100);

  return (
    <Card style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.label}>{pending ? "Scored so far" : "How this score is built"}</Text>
        <Txt variant="caption1" tone="muted">
          Tap one to see why
        </Txt>
      </View>
      {breakdown.components.map((c) => (
        <ComponentRow
          key={c.key}
          component={c}
          review={review ?? null}
          open={open === c.key}
          onToggle={() => {
            tick();
            setOpen((k) => (k === c.key ? null : c.key));
          }}
        />
      ))}
      <Text style={styles.footnote}>
        {pending
          ? "Still measuring the rest. The total score appears when every part is in."
          : both
          ? `Blends what this phone measured with your AI coach's review${breakdown.cloudOverall != null ? ` (its own overall ${breakdown.cloudOverall}/10 counts for ${share}%)` : ""}.${breakdown.cloudSource === "video" ? " The coach watched the video, so it leads wherever it could see." : ""}`
          : breakdown.sources[0] === "cloud"
            ? "From your AI coach's review."
            : "Measured on this phone. A deep review adds content and tone judgments, and leads the score once it's in."}
      </Text>
    </Card>
  );
}

function ComponentRow({ component: c, review, open, onToggle }: { component: ScoreComponent; review: SessionScores | null; open: boolean; onToggle: () => void }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const reviewFactors = review ? cloudFactors(review, c.key) : [];
  const cloudPct = c.cloudShare != null ? Math.round(c.cloudShare * 100) : null;
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
          {[c.local != null ? `Phone ${c.local}` : null, c.cloud != null ? `AI coach ${c.cloud}` : null, `${Math.round(c.weight * 100)}% of total`]
            .filter(Boolean)
            .join(" · ")}
        </Text>
      </Pressable>
      {open ? (
        <Reveal style={styles.detail}>
          {c.local != null && c.cloud != null && cloudPct != null ? (
            <Txt variant="footnote" tone="secondary">
              {cloudPct === 0 ? "Measured on the phone only." : `The AI coach's ${c.cloud} counts for ${cloudPct}% here, the phone's ${c.local} for ${100 - cloudPct}%.`}
            </Txt>
          ) : null}
          {c.factors?.length ? (
            <View style={styles.group}>
              <Txt variant="caption1" weight="600" tone="muted">
                Measured on this phone
              </Txt>
              {c.factors.map((f) => (
                <FactorRow key={f.label} factor={f} />
              ))}
            </View>
          ) : null}
          {reviewFactors.length ? (
            <View style={styles.group}>
              <Txt variant="caption1" weight="600" tone="muted">
                Your AI coach
              </Txt>
              {reviewFactors.map((f) => (
                <View key={f.label} style={styles.factor}>
                  <View style={styles.factorTop}>
                    <Txt variant="subhead" weight="600" style={styles.flex}>
                      {f.label}
                    </Txt>
                    <Txt variant="subhead" weight="600" tabular color={colorForScore(f.score, colors)}>
                      {f.score}
                    </Txt>
                  </View>
                  {f.notes ? (
                    <Txt variant="footnote" tone="secondary">
                      {f.notes}
                    </Txt>
                  ) : null}
                </View>
              ))}
            </View>
          ) : null}
          {!c.factors?.length && !reviewFactors.length ? (
            <Txt variant="footnote" tone="secondary">
              {c.key === "congruence" ? "Only a deep review that watches the video can judge whether your face matches your voice." : "No detail was kept for this take."}
            </Txt>
          ) : null}
        </Reveal>
      ) : null}
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
        <Txt variant="subhead" weight="600" style={styles.flex}>
          {f.label} <Txt variant="footnote" tone="muted">· {f.value}</Txt>
        </Txt>
        {badge ? (
          <Txt variant="subhead" weight="600" tabular color={badge.color}>
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
  group: { gap: spacing.sm },
  factor: { gap: 2 },
  factorTop: { flexDirection: "row", alignItems: "baseline", gap: spacing.sm },
  flex: { flex: 1 },
  footnote: { ...font("400"), color: colors.textSecondary, fontSize: typography.caption, lineHeight: 17 },
}));
