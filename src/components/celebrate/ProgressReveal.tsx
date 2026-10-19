import { ActivityIndicator, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Animated, { FadeInDown } from "react-native-reanimated";
import { Card } from "../common/Card";
import { Txt } from "../common/Txt";
import { CountUp } from "./CountUp";
import { DeltaBar } from "./DeltaBar";
import type { Beat } from "../../domain/progressMoment";
import { stageName, STAGE_NAMES, type Stage } from "../../domain/levels";
import { SKILL_LABELS } from "../../theme/tokens";
import { duration, easeOut } from "../../theme/motion";
import { makeStyles, useTheme } from "../../theme/ThemeProvider";

// Beats land this far apart the first time a moment plays.
export const BEAT_GAP_MS = 520;

interface ProgressRevealProps {
  beats: Beat[];
  // First viewing: beats land one after another. Afterwards they're just there.
  animate: boolean;
}

// "Your progress" on a take's Result: what it changed, a beat at a time.
export function ProgressReveal({ beats, animate }: ProgressRevealProps) {
  const styles = useStyles();
  if (beats.length === 0) return null;
  return (
    <Card style={styles.card}>
      <Txt variant="footnote" weight="500" tone="secondary">
        Your progress
      </Txt>
      {beats.map((beat, i) => (
        <Animated.View
          key={`${beat.kind}-${i}`}
          entering={animate ? FadeInDown.duration(duration.slow).delay(200 + i * BEAT_GAP_MS).easing(easeOut).withInitialValues({ transform: [{ translateY: 10 }] }) : undefined}
        >
          <BeatRow beat={beat} delay={animate ? 200 + i * BEAT_GAP_MS + 180 : 0} animate={animate} />
        </Animated.View>
      ))}
    </Card>
  );
}

// Before the moment can play: the skill moves wait for the deep review.
export function ProgressPending({ reviewing }: { reviewing: boolean }) {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <Card style={styles.pending}>
      <ActivityIndicator size="small" color={colors.textMuted} />
      <Txt variant="footnote" tone="secondary" style={styles.flex}>
        {reviewing ? "Your progress lands when the review is in." : "Working out what this take moved…"}
      </Txt>
    </Card>
  );
}

function BeatRow({ beat, delay, animate }: { beat: Beat; delay: number; animate: boolean }) {
  const styles = useStyles();
  const { colors } = useTheme();
  switch (beat.kind) {
    case "stage": {
      const c = colors.skill[beat.skill];
      return (
        <Line icon="ribbon" color={c.fg} bg={c.bg} title={`${SKILL_LABELS[beat.skill]} reached ${stageName(beat.stage)}`} detail={beat.speakerLevel != null ? `You're now speaker level ${beat.speakerLevel}.` : null} />
      );
    }
    case "best":
      return (
        <View style={styles.line}>
          <Icon name="star" color={colors.warning} bg={colors.warningMuted} />
          <View style={styles.flex}>
            <View style={styles.inline}>
              <Txt variant="headline">A personal best:</Txt>
              <CountUp variant="headline" from={beat.previousBest} to={beat.score} decimals={1} delay={animate ? delay : 0} durationMs={animate ? 900 : 1} />
            </View>
            <Txt variant="footnote" tone="secondary">
              Your best before this was {beat.previousBest}.
            </Txt>
          </View>
        </View>
      );
    case "score":
      return (
        <Line
          icon={beat.direction === "up" ? "trending-up" : beat.direction === "down" ? "pulse" : "remove"}
          color={beat.direction === "up" ? colors.success : colors.textSecondary}
          bg={beat.direction === "up" ? colors.successMuted : colors.surfaceRaised}
          title={beat.title}
          detail={beat.detail}
        />
      );
    case "skills":
      return (
        <View style={styles.skills}>
          {beat.moves.map((m, i) => {
            const c = colors.skill[m.skill];
            const up = m.delta > 0;
            const stage = (m.stageAfter ?? 1) as Stage;
            return (
              <View key={m.skill} style={styles.move}>
                <View style={styles.moveTop}>
                  <View style={styles.inline}>
                    <View style={[styles.dot, { backgroundColor: c.fg }]} />
                    <Txt variant="subhead" weight="600">
                      {SKILL_LABELS[m.skill]}
                    </Txt>
                    <Txt variant="caption1" tone="muted">
                      {stageName(stage)}
                      {stage < 5 ? ` → ${STAGE_NAMES[(stage + 1) as Stage]}` : ""}
                    </Txt>
                  </View>
                  <CountUp
                    variant="subhead"
                    weight="600"
                    color={up ? colors.success : colors.textMuted}
                    from={0}
                    to={m.delta}
                    decimals={1}
                    prefix={up ? "+" : ""}
                    delay={animate ? delay + i * 140 : 0}
                    durationMs={animate ? 800 : 1}
                  />
                </View>
                <DeltaBar value={m.progressAfter} from={m.progressBefore} color={c.fg} trackColor={c.bg} delay={animate ? delay + i * 140 : 0} />
              </View>
            );
          })}
        </View>
      );
    case "path":
      return <Line icon="map-outline" color={colors.textPrimary} bg={colors.surfaceRaised} title={`Lesson ${beat.lessonIndex} of ${beat.lessonCount}`} detail={`In ${beat.unitTitle}, on your path.`} />;
    case "streak":
      return (
        <Line
          icon="flame"
          color={colors.warning}
          bg={colors.warningMuted}
          title={beat.days === 1 ? "Day one of a new streak" : `${beat.days}-day streak, kept going`}
          detail={null}
        />
      );
    case "goal":
      return (
        <Line
          icon="checkmark-circle-outline"
          color={colors.success}
          bg={colors.successMuted}
          title={beat.done >= beat.goal ? "Today's goal, done" : `${beat.done} of ${beat.goal} sessions today`}
          detail={null}
        />
      );
  }
}

function Line({ icon, color, bg, title, detail }: { icon: keyof typeof Ionicons.glyphMap; color: string; bg: string; title: string; detail: string | null }) {
  const styles = useStyles();
  return (
    <View style={styles.line}>
      <Icon name={icon} color={color} bg={bg} />
      <View style={styles.flex}>
        <Txt variant="headline">{title}</Txt>
        {detail ? (
          <Txt variant="footnote" tone="secondary">
            {detail}
          </Txt>
        ) : null}
      </View>
    </View>
  );
}

function Icon({ name, color, bg }: { name: keyof typeof Ionicons.glyphMap; color: string; bg: string }) {
  const styles = useStyles();
  return (
    <View style={[styles.icon, { backgroundColor: bg }]}>
      <Ionicons name={name} size={18} color={color} />
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  card: { gap: t.space.md },
  pending: { flexDirection: "row", alignItems: "center", gap: t.space.sm + 2 },
  line: { flexDirection: "row", gap: t.space.sm + 4, alignItems: "flex-start" },
  icon: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center" },
  flex: { flex: 1, gap: 2 },
  inline: { flexDirection: "row", alignItems: "center", gap: t.space.sm - 2, flexShrink: 1 },
  skills: { gap: t.space.md - 2 },
  move: { gap: t.space.sm - 2 },
  moveTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: t.space.sm },
  dot: { width: 8, height: 8, borderRadius: 4 },
}));
