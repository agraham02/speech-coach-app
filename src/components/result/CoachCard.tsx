import { Pressable, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Card } from "../common/Card";
import { Txt } from "../common/Txt";
import { makeStyles, useTheme } from "../../theme/ThemeProvider";
import { SKILL_LABELS } from "../../theme/tokens";
import type { CoachOutput, Verdict } from "../../domain/coach/ruleCoach";

// The on-device coach's read on one take: what went well, the one thing to
// change next, the measurements behind it, and a follow-up question to
// answer out loud (the "think on your feet" rep).
export function CoachCard({ coach, onAnswerFollowUp }: { coach: CoachOutput; onAnswerFollowUp?: (question: string) => void }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const verdictColor: Record<Verdict, string> = { good: colors.success, ok: colors.warning, work: colors.danger };
  const focus = colors.skill[coach.focusSkill];

  return (
    <Card style={styles.card}>
      <View style={styles.header}>
        <Txt variant="caption2" tone="muted" uppercase>
          Coach
        </Txt>
        <View style={[styles.focusPill, { backgroundColor: focus.bg }]}>
          <Txt variant="caption1" weight="700" color={focus.fg}>
            Focus: {SKILL_LABELS[coach.focusSkill]}
          </Txt>
        </View>
      </View>

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

      {coach.observations.length > 0 ? (
        <View style={styles.observations}>
          {coach.observations.map((o) => (
            <View key={o.label} style={styles.observation}>
              <View style={[styles.dot, { backgroundColor: verdictColor[o.verdict] }]} />
              <Txt variant="footnote" tone="secondary" style={styles.flex}>
                {o.label}
              </Txt>
              <Txt variant="footnote" weight="600">
                {o.value}
              </Txt>
            </View>
          ))}
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
        {coach.source === "apple" ? "Written by the on-device model from your measurements." : "From measurements made on this phone."}
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
  observations: { gap: 6, paddingTop: t.space.xs, borderTopWidth: 1, borderTopColor: t.colors.separator },
  observation: { flexDirection: "row", alignItems: "center", gap: t.space.sm, paddingTop: 6 },
  dot: { width: 8, height: 8, borderRadius: 4 },
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
