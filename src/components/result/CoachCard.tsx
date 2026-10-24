import { Pressable, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Card } from "../common/Card";
import { Txt } from "../common/Txt";
import { makeStyles, useTheme } from "../../theme/ThemeProvider";
import { SKILL_LABELS } from "../../theme/tokens";
import type { CoachOutput } from "../../domain/coach/ruleCoach";
import { provenanceLabel } from "../../domain/analysis/provenance";

// The one coaching card for a take: what went well, the one thing to change
// next, and (on a judged take) the reviewer's summary and a drill, then a
// follow-up question to answer out loud (the "think on your feet" rep). The
// strength and the tip are Tono AI's words on a judged take and the rules'
// otherwise, and the footer says which. The numbers behind it are on the
// Scores tab, not repeated here.
export interface ReviewCoaching {
  summary: string;
  drill: string;
}

export function CoachCard({ coach, review, onAnswerFollowUp }: { coach: CoachOutput; review?: ReviewCoaching | null; onAnswerFollowUp?: (question: string) => void }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const focus = colors.skill[coach.focusSkill];

  return (
    <Card style={styles.card}>
      <View style={styles.header}>
        <Txt variant="footnote" weight="600" tone="muted">
          Coaching
        </Txt>
        <View style={[styles.focusPill, { backgroundColor: focus.bg }]}>
          <Txt variant="caption1" weight="700" color={focus.fg}>
            Focus: {SKILL_LABELS[coach.focusSkill]}
          </Txt>
        </View>
      </View>

      {review?.summary ? <Txt variant="callout">{review.summary}</Txt> : null}

      <View style={styles.line}>
        <Ionicons name="thumbs-up-outline" size={18} color={colors.success} />
        <Txt variant="callout" style={styles.flex}>
          {coach.strength}
        </Txt>
      </View>
      <View style={styles.line}>
        <Ionicons name="build-outline" size={18} color={colors.warning} />
        <Txt variant="callout" weight="600" style={styles.flex}>
          {coach.tip}
        </Txt>
      </View>

      {review?.drill ? (
        <View style={styles.drill}>
          <Txt variant="caption1" tone="muted">
            Next drill
          </Txt>
          <Txt variant="callout">{review.drill}</Txt>
        </View>
      ) : null}

      {coach.followUpQuestion ? (
        <View style={styles.followUp}>
          <Txt variant="caption2" tone="accent" uppercase>
            Follow-up question
          </Txt>
          <Txt variant="callout">{coach.followUpQuestion}</Txt>
          {onAnswerFollowUp ? (
            <Pressable
              onPress={() => onAnswerFollowUp(coach.followUpQuestion!)}
              style={styles.answer}
              accessibilityRole="button"
              accessibilityLabel="Answer the follow-up question"
            >
              <Ionicons name="mic-outline" size={16} color={colors.onAccent} />
              <Txt variant="footnote" weight="700" tone="onAccent">
                Answer it
              </Txt>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      <Txt variant="caption1" tone="muted">
        {provenanceLabel(coach.provenance)}
      </Txt>
    </Card>
  );
}

const useStyles = makeStyles((t) => ({
  card: { gap: t.space.md },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  focusPill: { paddingHorizontal: t.space.sm + 2, paddingVertical: 4, borderRadius: t.radius.pill },
  line: { flexDirection: "row", gap: t.space.sm, alignItems: "flex-start" },
  flex: { flex: 1 },
  drill: { gap: 2, padding: t.space.md, borderRadius: t.radius.md, backgroundColor: t.colors.surfaceRaised },
  followUp: { gap: t.space.xs, padding: t.space.md, borderRadius: t.radius.md, backgroundColor: t.colors.accentMuted },
  answer: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 6,
    marginTop: t.space.xs,
    paddingHorizontal: t.space.md,
    paddingVertical: t.space.sm,
    borderRadius: t.radius.pill,
    backgroundColor: t.colors.accent,
  },
}));
