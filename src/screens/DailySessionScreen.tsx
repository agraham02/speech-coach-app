import { useCallback, useEffect, useState } from "react";
import { Pressable, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../navigation";
import { ScreenContainer } from "../components/common/ScreenContainer";
import { Screen } from "../components/common/Screen";
import { HeroCard } from "../components/common/HeroCard";
import Animated, { ZoomIn } from "react-native-reanimated";
import { duration } from "../theme/motion";
import { Card } from "../components/common/Card";
import { Txt } from "../components/common/Txt";
import { PrimaryButton } from "../components/common/PrimaryButton";
import { getTodaysPlan, getTopUpPlan, completePlanStep, completeTopUpStep, type StoredPlan } from "../services/db/progressRepo";
import { SKILL_LABELS } from "../theme/tokens";
import { getAllSessions } from "../services/db/sessionsRepo";
import { getPlanMinutes, getUserProfile } from "../services/prefs/prefsStore";
import { defaultsFromProfile } from "../domain/profile";
import { launchStep } from "../services/practice/launchStep";
import { subscribePracticeSteps } from "../services/practice/practiceEvents";
import { showGlobalToast } from "../components/common/ToastProvider";
import { getLesson } from "../content/lessons";
import { isoDateFromDate, todayISODate } from "../utils/dateUtils";
import type { PlanStep } from "../domain/dailyPlan";
import { makeStyles, useTheme } from "../theme/ThemeProvider";

type Props = NativeStackScreenProps<RootStackParamList, "DailySession">;

// Runs today's plan one step at a time. Progress is saved per step, so
// leaving and coming back (or a restart) picks up where you left off.
export function DailySessionScreen({ route, navigation }: Props) {
  const slot = route.params?.slot;
  const styles = useStyles();
  const { colors } = useTheme();
  const [stored, setStored] = useState<StoredPlan | null>(null);
  const [launching, setLaunching] = useState(false);

  const load = useCallback(() => {
    (slot ? getTopUpPlan(slot, { quiet: defaultsFromProfile(getUserProfile()).quiet }) : getTodaysPlan(getPlanMinutes())).then(setStored);
  }, [slot]);

  useFocusEffect(load);
  useEffect(() => subscribePracticeSteps(() => load()), [load]);

  if (!stored) return <ScreenContainer />;
  const { plan } = stored;
  const done = new Set(stored.completedStepIds);
  const next = plan.steps.find((s) => !done.has(s.id));
  const lesson = getLesson(plan.lessonId);

  async function run(step: PlanStep) {
    if (launching) return;
    setLaunching(true);
    try {
      const practice = { planDate: plan.date, planStepId: step.id, planSlot: slot, lessonId: plan.lessonId || undefined };
      if (step.kind === "review") {
        // Review today's rep with the three-pass player.
        const today = todayISODate();
        const sessions = await getAllSessions();
        // recordedAt is UTC; compare its *local* date, or an evening rep
        // reads as tomorrow's.
        const latest = sessions.find((s) => isoDateFromDate(new Date(s.recordedAt)) === today && !s.videoDeletedAt);
        if (!latest) {
          showGlobalToast("Record today's rep first, then review it.", "info");
          return;
        }
        navigation.navigate("Result", { sessionId: latest.id, practice });
        return;
      }
      if (step.kind === "line" && step.lessonStep?.kind === "drill") {
        navigation.navigate("LineRep", { mode: "lineOfDay", lineIds: step.lessonStep.contentId ? [step.lessonStep.contentId] : undefined, practice });
        return;
      }
      if (step.lessonStep) await launchStep(navigation, step.lessonStep, practice);
    } finally {
      setLaunching(false);
    }
  }

  async function skip(step: PlanStep) {
    const updated = slot ? await completeTopUpStep(plan.date, slot, step.id) : await completePlanStep(plan.date, step.id);
    if (updated) setStored(updated);
  }

  const focus = colors.skill[plan.focusSkill];
  return (
    <Screen
      eyebrow={slot ? `Top-up ${slot + 1} · about ${plan.steps.reduce((m, s) => m + s.minutes, 0)} min` : `Today · ${plan.minutes} min`}
      title={slot ? `${SKILL_LABELS[plan.focusSkill]} top-up` : lesson?.title ?? "Daily session"}
      onBack={() => navigation.goBack()}
    >
      {stored.completedAt ? (
        <HeroCard accent={colors.success} contentStyle={styles.done}>
          <Animated.View entering={ZoomIn.duration(duration.slow)} style={styles.doneIcon}>
            <Ionicons name="checkmark" size={34} color={colors.background} />
          </Animated.View>
          <Txt variant="title1" align="center">
            {slot ? "Top-up done." : "That's today done."}
          </Txt>
          <Txt variant="callout" tone="secondary" align="center">
            {slot ? "Spread-out sessions stick better than one long one." : "Short daily reps beat occasional long ones. See you tomorrow."}
          </Txt>
          <PrimaryButton label="Back to Today" onPress={() => navigation.goBack()} style={styles.doneButton} />
        </HeroCard>
      ) : null}

      {lesson ? (
        <Card tone="raised" style={styles.teach}>
          <Txt variant="footnote" weight="600" tone="secondary">
            Why this matters
          </Txt>
          <Txt variant="callout">{lesson.teach.why}</Txt>
          {lesson.teach.how.map((h) => (
            <View key={h} style={styles.howRow}>
              <View style={[styles.howDot, { backgroundColor: focus.fg }]} />
              <Txt variant="subhead" style={styles.flex}>
                {h}
              </Txt>
            </View>
          ))}
          <Txt variant="caption1" tone="muted">
            {lesson.teach.source}
          </Txt>
        </Card>
      ) : null}

      <View>
        {plan.steps.map((step, i) => {
          const isDone = done.has(step.id);
          const isNext = next?.id === step.id;
          const last = i === plan.steps.length - 1;
          return (
            <View key={step.id} style={styles.stepRow}>
              <View style={styles.rail}>
                {!last ? <View style={[styles.line, isDone && { backgroundColor: focus.fg, opacity: 0.6 }]} /> : null}
                {isDone ? (
                  <Animated.View entering={ZoomIn.duration(260)} style={[styles.node, { backgroundColor: focus.fg, borderColor: focus.fg }]}>
                    <Ionicons name="checkmark" size={15} color={colors.background} />
                  </Animated.View>
                ) : (
                  <View style={[styles.node, isNext && styles.nodeNext]}>
                    <Txt variant="caption1" weight="700" color={isNext ? colors.onAccent : colors.textSecondary}>
                      {i + 1}
                    </Txt>
                  </View>
                )}
              </View>
              <Card style={[styles.stepCard, isDone && styles.stepDone, !isNext && !isDone && styles.stepLater]}>
                <View style={styles.stepHead}>
                  <Txt variant={isNext ? "title3" : "headline"} tone={isDone ? "muted" : "primary"} style={styles.flex}>
                    {step.title}
                  </Txt>
                  <Txt variant="footnote" tone="muted" tabular>
                    {step.minutes} min
                  </Txt>
                </View>
                {!isDone ? (
                  <Txt variant="subhead" tone="secondary" numberOfLines={isNext ? undefined : 2}>
                    {step.detail}
                  </Txt>
                ) : null}
                {!isDone ? (
                  <View style={styles.stepActions}>
                    <PrimaryButton
                      label={isNext ? "Start" : "Do this now"}
                      variant={isNext ? "primary" : "secondary"}
                      size={isNext ? "md" : "sm"}
                      iconRight={isNext ? "arrow-forward" : undefined}
                      onPress={() => run(step)}
                      style={isNext ? styles.flex : undefined}
                    />
                    <Pressable onPress={() => skip(step)} hitSlop={10} accessibilityRole="button" accessibilityLabel={`Skip ${step.title}`}>
                      <Txt variant="subhead" weight="500" tone="muted">
                        Skip
                      </Txt>
                    </Pressable>
                  </View>
                ) : null}
              </Card>
            </View>
          );
        })}
      </View>
    </Screen>
  );
}

const NODE = 26;

const useStyles = makeStyles((t) => ({
  teach: { gap: t.space.sm },
  howRow: { flexDirection: "row", gap: t.space.sm + 2, alignItems: "flex-start" },
  howDot: { width: 6, height: 6, borderRadius: 3, marginTop: 8 },
  flex: { flex: 1 },
  stepRow: { flexDirection: "row", gap: t.space.md - 4 },
  rail: { width: NODE, alignItems: "center", paddingTop: t.space.md + 2 },
  line: { position: "absolute", top: t.space.md + 2 + NODE + 4, bottom: -2, width: 1.5, borderRadius: 1, backgroundColor: t.colors.textMuted, opacity: 0.35 },
  node: {
    width: NODE,
    height: NODE,
    borderRadius: NODE / 2,
    borderWidth: 1.5,
    borderColor: t.colors.textMuted,
    alignItems: "center",
    justifyContent: "center",
  },
  nodeNext: { backgroundColor: t.colors.accent, borderColor: t.colors.accent },
  stepCard: { flex: 1, gap: t.space.sm, marginBottom: t.space.sm + 4 },
  stepDone: { backgroundColor: "transparent", shadowOpacity: 0, elevation: 0, paddingVertical: t.space.md },
  stepLater: { paddingVertical: t.space.md },
  stepHead: { flexDirection: "row", alignItems: "baseline", gap: t.space.sm },
  stepActions: { flexDirection: "row", alignItems: "center", gap: t.space.md, marginTop: t.space.xs },
  done: { alignItems: "center", gap: t.space.sm, paddingVertical: t.space.xl },
  doneIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: t.colors.success,
    marginBottom: t.space.sm,
  },
  doneButton: { alignSelf: "stretch", marginTop: t.space.md },
}));
