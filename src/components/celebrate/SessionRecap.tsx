import { useEffect, useState } from "react";
import { View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Animated from "react-native-reanimated";
import { Txt } from "../common/Txt";
import { CountUp } from "./CountUp";
import { DeltaBar } from "./DeltaBar";
import { getSessionsDoneToday, getSkillMovesSince, getStreakState } from "../../services/db/progressRepo";
import { getDailySessionGoal } from "../../services/prefs/prefsStore";
import { SKILL_LABELS, type SkillId } from "../../theme/tokens";
import { enter } from "../../theme/motion";
import { makeStyles, useTheme } from "../../theme/ThemeProvider";

// The end of a day's session: the streak ticking over, the goal's dots
// filling, and what today's practice did to each skill it touched.
export function SessionRecap() {
  const styles = useStyles();
  const { colors } = useTheme();
  const [streak, setStreak] = useState<number | null>(null);
  const [goal, setGoal] = useState<{ done: number; goal: number } | null>(null);
  const [moves, setMoves] = useState<{ skill: SkillId; from: number; to: number }[]>([]);

  useEffect(() => {
    const midnight = new Date();
    midnight.setHours(0, 0, 0, 0);
    getStreakState()
      .then((s) => setStreak(s.currentStreak))
      .catch(() => undefined);
    const g = getDailySessionGoal();
    getSessionsDoneToday()
      .then((done) => setGoal({ done: Math.min(done, g), goal: g }))
      .catch(() => undefined);
    getSkillMovesSince(midnight.toISOString())
      .then((m) => setMoves(m.filter((x) => Math.abs(x.to - x.from) >= 0.1).sort((a, b) => b.to - b.from - (a.to - a.from)).slice(0, 3)))
      .catch(() => undefined);
  }, []);

  return (
    <View style={styles.wrap}>
      <Animated.View entering={enter(2)} style={styles.pills}>
        {streak != null && streak > 0 ? (
          <View style={styles.pill}>
            <Ionicons name="flame" size={15} color={colors.warning} />
            <CountUp variant="subhead" weight="600" from={Math.max(0, streak - 1)} to={streak} delay={500} durationMs={600} suffix="-day streak" />
          </View>
        ) : null}
        {goal && goal.goal > 1 ? (
          <View style={styles.pill}>
            {Array.from({ length: goal.goal }, (_, i) => (
              <View key={i} style={[styles.goalDot, i < goal.done && { backgroundColor: colors.success, borderColor: colors.success }]} />
            ))}
            <Txt variant="subhead" weight="600" tabular>
              {goal.done} of {goal.goal} today
            </Txt>
          </View>
        ) : null}
      </Animated.View>
      {moves.length ? (
        <Animated.View entering={enter(3)} style={styles.moves}>
          <Txt variant="footnote" weight="500" tone="secondary">
            What today moved
          </Txt>
          {moves.map((m, i) => {
            const c = colors.skill[m.skill];
            const delta = Math.round((m.to - m.from) * 10) / 10;
            return (
              <View key={m.skill} style={styles.move}>
                <View style={styles.moveTop}>
                  <Txt variant="subhead" weight="600">
                    {SKILL_LABELS[m.skill]}
                  </Txt>
                  <CountUp
                    variant="subhead"
                    weight="600"
                    color={delta > 0 ? colors.success : colors.textMuted}
                    from={0}
                    to={delta}
                    decimals={1}
                    prefix={delta > 0 ? "+" : ""}
                    delay={700 + i * 150}
                  />
                </View>
                <DeltaBar value={m.to / 100} from={m.from / 100} color={c.fg} trackColor={c.bg} delay={700 + i * 150} />
              </View>
            );
          })}
        </Animated.View>
      ) : null}
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  wrap: { alignSelf: "stretch", gap: t.space.md, marginTop: t.space.sm },
  pills: { flexDirection: "row", flexWrap: "wrap", gap: t.space.sm, justifyContent: "center" },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: t.radius.pill,
    backgroundColor: t.colors.surfaceRaised,
  },
  goalDot: { width: 8, height: 8, borderRadius: 4, borderWidth: 1.5, borderColor: t.colors.textMuted },
  moves: { gap: t.space.sm + 2 },
  move: { gap: t.space.xs + 2 },
  moveTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
}));
