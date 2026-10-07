import { useCallback, useEffect, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../navigation";
import { ScreenContainer } from "../components/common/ScreenContainer";
import { Header } from "../components/common/Header";
import { Card } from "../components/common/Card";
import { Txt } from "../components/common/Txt";
import { PrimaryButton } from "../components/common/PrimaryButton";
import { getTodaysPlan, completePlanStep, type StoredPlan } from "../services/db/progressRepo";
import { getAllSessions } from "../services/db/sessionsRepo";
import { getPlanMinutes } from "../services/prefs/prefsStore";
import { launchStep } from "../services/practice/launchStep";
import { subscribePracticeSteps } from "../services/practice/practiceEvents";
import { showGlobalToast } from "../components/common/ToastProvider";
import { getLesson } from "../content/lessons";
import { todayISODate } from "../utils/dateUtils";
import type { PlanStep } from "../domain/dailyPlan";
import { makeStyles, useTheme } from "../theme/ThemeProvider";

type Props = NativeStackScreenProps<RootStackParamList, "DailySession">;

// Runs today's plan one step at a time. Progress is saved per step, so
// leaving and coming back (or a restart) picks up where you left off.
export function DailySessionScreen({ navigation }: Props) {
  const styles = useStyles();
  const { colors } = useTheme();
  const [stored, setStored] = useState<StoredPlan | null>(null);
  const [launching, setLaunching] = useState(false);

  const load = useCallback(() => {
    getTodaysPlan(getPlanMinutes()).then(setStored);
  }, []);

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
      const practice = { planDate: plan.date, planStepId: step.id, lessonId: plan.lessonId };
      if (step.kind === "review") {
        // Review today's rep with the three-pass player.
        const today = todayISODate();
        const sessions = await getAllSessions();
        const latest = sessions.find((s) => s.recordedAt.slice(0, 10) === today && !s.videoDeletedAt);
        if (!latest) {
          showGlobalToast("Record today's rep first, then review it.", "info");
          return;
        }
        navigation.navigate("Result", { sessionId: latest.id, practice });
        return;
      }
      if (step.lessonStep) await launchStep(navigation, step.lessonStep, practice);
    } finally {
      setLaunching(false);
    }
  }

  async function skip(step: PlanStep) {
    const updated = await completePlanStep(plan.date, step.id);
    if (updated) setStored(updated);
  }

  return (
    <ScreenContainer style={styles.container}>
      <Header eyebrow={`Today · ${plan.minutes} min`} title={lesson?.title ?? "Daily session"} onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={styles.scroll}>
        {lesson ? (
          <Card style={styles.teach}>
            <Txt variant="caption2" tone="accent" uppercase>
              Why this matters
            </Txt>
            <Txt variant="callout">{lesson.teach.why}</Txt>
            {lesson.teach.how.map((h) => (
              <View key={h} style={styles.howRow}>
                <Ionicons name="checkmark" size={16} color={colors.accent} />
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

        {plan.steps.map((step, i) => {
          const isDone = done.has(step.id);
          const isNext = next?.id === step.id;
          return (
            <Card key={step.id} style={[styles.stepCard, isNext && styles.stepNext]}>
              <View style={styles.stepRow}>
                <View style={[styles.stepNumber, isDone && styles.stepNumberDone]}>
                  {isDone ? <Ionicons name="checkmark" size={16} color={colors.onAccent} /> : <Txt variant="footnote" weight="700">{i + 1}</Txt>}
                </View>
                <View style={styles.flex}>
                  <Txt variant="headline" tone={isDone ? "muted" : "primary"}>
                    {step.title}
                  </Txt>
                  <Txt variant="footnote" tone="secondary">
                    {step.detail}
                  </Txt>
                </View>
              </View>
              {!isDone ? (
                <View style={styles.stepActions}>
                  <PrimaryButton label={isNext ? "Start" : "Do this now"} variant={isNext ? "primary" : "secondary"} onPress={() => run(step)} style={styles.flex} />
                  <Pressable onPress={() => skip(step)} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Skip ${step.title}`}>
                    <Txt variant="footnote" tone="muted">
                      Skip
                    </Txt>
                  </Pressable>
                </View>
              ) : null}
            </Card>
          );
        })}

        {stored.completedAt ? (
          <Card style={styles.done}>
            <Ionicons name="trophy" size={32} color={colors.success} />
            <Txt variant="title3" align="center">
              That's today done.
            </Txt>
            <Txt variant="subhead" tone="secondary" align="center">
              Short daily reps beat occasional long ones. See you tomorrow.
            </Txt>
            <PrimaryButton label="Back to Today" onPress={() => navigation.goBack()} style={styles.doneButton} />
          </Card>
        ) : null}
      </ScrollView>
    </ScreenContainer>
  );
}

const useStyles = makeStyles((t) => ({
  container: { gap: t.space.md },
  scroll: { gap: t.space.md, paddingBottom: t.space.xl },
  teach: { gap: t.space.sm },
  howRow: { flexDirection: "row", gap: t.space.sm, alignItems: "flex-start" },
  flex: { flex: 1 },
  stepCard: { gap: t.space.md },
  stepNext: { borderColor: t.colors.accent },
  stepRow: { flexDirection: "row", gap: t.space.md, alignItems: "center" },
  stepNumber: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: t.colors.surfaceRaised,
  },
  stepNumberDone: { backgroundColor: t.colors.success },
  stepActions: { flexDirection: "row", alignItems: "center", gap: t.space.md },
  done: { alignItems: "center", gap: t.space.sm },
  doneButton: { alignSelf: "stretch", marginTop: t.space.sm },
}));
