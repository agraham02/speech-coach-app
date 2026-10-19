import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Modal, Pressable, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Animated, { FadeIn, FadeOut, ZoomIn } from "react-native-reanimated";
import { HeroCard } from "../common/HeroCard";
import { PrimaryButton } from "../common/PrimaryButton";
import { Txt } from "../common/Txt";
import { Burst } from "./Burst";
import { DeltaBar } from "./DeltaBar";
import { STAGE_MEANING, stageName, type Stage } from "../../domain/levels";
import { SKILL_LABELS, type SkillId } from "../../theme/tokens";
import { duration, easeOut } from "../../theme/motion";
import { makeStyles, useTheme } from "../../theme/ThemeProvider";
import { success } from "../../utils/haptics";
import { subscribeToStageEarned, subscribeToUnitCompleted } from "../../services/progress/progressEvents";

// The big moments, one at a time over whatever screen you're on: a stage
// earned in a skill, or a unit finished. Calm — a glow in the skill's
// color, one soft burst, a haptic — and always one tap to carry on.

export type Celebration =
  | { kind: "stage"; skill: SkillId; stage: Stage; speakerLevel: number | null }
  | {
      kind: "unit";
      skill: SkillId;
      unitTitle: string;
      lessons: string[];
      // 0-100 rating when the unit started and now, if known.
      ratingFrom: number | null;
      ratingTo: number | null;
      next: string | null;
    };

let globalCelebrate: ((c: Celebration) => void) | null = null;

// Callable from anywhere, like showGlobalToast; no-op before the host mounts.
export function celebrate(c: Celebration): void {
  globalCelebrate?.(c);
}

export function CelebrationHost({ children }: { children: ReactNode }) {
  const [queue, setQueue] = useState<Celebration[]>([]);

  const push = useCallback((c: Celebration) => setQueue((q) => [...q, c]), []);
  useEffect(() => {
    globalCelebrate = push;
    // A drill that earns a stage celebrates right away, over its result.
    const unsubscribe = subscribeToStageEarned((e) => setTimeout(() => push({ kind: "stage", ...e }), 700));
    // So does finishing a unit on your path.
    const unsubscribeUnits = subscribeToUnitCompleted((e) => setTimeout(() => push({ kind: "unit", ...e }), 500));
    return () => {
      if (globalCelebrate === push) globalCelebrate = null;
      unsubscribe();
      unsubscribeUnits();
    };
  }, [push]);

  const current = queue[0] ?? null;
  return (
    <>
      {children}
      <Modal visible={!!current} transparent animationType="fade" statusBarTranslucent onRequestClose={() => setQueue((q) => q.slice(1))}>
        {current ? <CelebrationCard key={queue.length} celebration={current} onClose={() => setQueue((q) => q.slice(1))} /> : null}
      </Modal>
    </>
  );
}

function CelebrationCard({ celebration: c, onClose }: { celebration: Celebration; onClose: () => void }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const skill = colors.skill[c.skill];

  useEffect(() => {
    const t = setTimeout(success, 180);
    return () => clearTimeout(t);
  }, []);

  return (
    <Animated.View entering={FadeIn.duration(duration.base)} exiting={FadeOut.duration(duration.fast)} style={styles.scrim}>
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close" />
      <Animated.View entering={ZoomIn.duration(duration.slow).easing(easeOut)} style={styles.cardWrap}>
        <HeroCard accent={skill.fg} contentStyle={styles.card}>
          <View style={styles.burstArea}>
            <Burst color={skill.fg} secondary={colors.textPrimary} delay={120} />
            <View style={[styles.badge, { backgroundColor: skill.bg }]}>
              {c.kind === "stage" ? (
                <Txt variant="title1" color={skill.fg}>
                  {c.stage}
                </Txt>
              ) : (
                <Ionicons name="checkmark" size={36} color={skill.fg} />
              )}
            </View>
          </View>
          {c.kind === "stage" ? (
            <>
              <Txt variant="footnote" weight="500" tone="secondary" align="center">
                {SKILL_LABELS[c.skill]} reached a new stage
              </Txt>
              <Txt variant="largeTitle" align="center">
                {stageName(c.stage)}
              </Txt>
              <Txt variant="callout" tone="secondary" align="center">
                {STAGE_MEANING[c.stage]}
              </Txt>
              {c.speakerLevel != null ? (
                <Txt variant="headline" align="center" style={styles.level}>
                  Speaker level {c.speakerLevel}
                </Txt>
              ) : null}
            </>
          ) : (
            <>
              <Txt variant="footnote" weight="500" tone="secondary" align="center">
                Unit finished · {SKILL_LABELS[c.skill]}
              </Txt>
              <Txt variant="title1" align="center">
                {c.unitTitle}
              </Txt>
              {c.lessons.length ? (
                <Txt variant="subhead" tone="secondary" align="center">
                  You practiced {joinList(c.lessons)}.
                </Txt>
              ) : null}
              {c.ratingFrom != null && c.ratingTo != null && c.ratingTo !== c.ratingFrom ? (
                <View style={styles.rating}>
                  <DeltaBar value={c.ratingTo / 100} from={c.ratingFrom / 100} color={skill.fg} trackColor={skill.bg} delay={500} />
                  <Txt variant="footnote" tone="secondary" align="center" tabular>
                    {SKILL_LABELS[c.skill]} {Math.round(c.ratingFrom)} → {Math.round(c.ratingTo)} over this unit
                  </Txt>
                </View>
              ) : null}
              {c.next ? (
                <Txt variant="subhead" align="center" style={styles.level}>
                  Next on your path: {c.next}
                </Txt>
              ) : null}
            </>
          )}
          <PrimaryButton label="Keep going" onPress={onClose} />
        </HeroCard>
      </Animated.View>
    </Animated.View>
  );
}

function joinList(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

const useStyles = makeStyles((t) => ({
  scrim: { flex: 1, backgroundColor: t.colors.overlayScrim, justifyContent: "center", paddingHorizontal: t.layout.gutter },
  cardWrap: { width: "100%", maxWidth: 420, alignSelf: "center" },
  card: { gap: t.space.sm + 4, alignItems: "stretch", paddingVertical: t.space.xl },
  burstArea: { height: 112, alignItems: "center", justifyContent: "center", marginBottom: t.space.xs },
  badge: { width: 76, height: 76, borderRadius: 38, alignItems: "center", justifyContent: "center" },
  level: { marginTop: t.space.xs },
  rating: { gap: t.space.sm, marginTop: t.space.xs },
}));
