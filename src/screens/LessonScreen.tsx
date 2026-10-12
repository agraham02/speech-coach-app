import { useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../navigation";
import { ScreenContainer } from "../components/common/ScreenContainer";
import { Header } from "../components/common/Header";
import { Card } from "../components/common/Card";
import { Txt } from "../components/common/Txt";
import { PrimaryButton } from "../components/common/PrimaryButton";
import { getLesson, getGuided, type LessonStep } from "../content/lessons";
import { WARM_UPS } from "../content/drillContent";
import { DRILL_TITLES } from "../domain/drills/drillSpecs";
import { FRAMEWORK_LABELS } from "../domain/coach/structureHeuristics";
import { completeLesson, getLessonStates, type LessonState } from "../services/db/progressRepo";
import { launchStep } from "../services/practice/launchStep";
import { subscribePracticeSteps } from "../services/practice/practiceEvents";
import { showGlobalToast } from "../components/common/ToastProvider";
import { SKILL_LABELS } from "../theme/tokens";
import { makeStyles, useTheme } from "../theme/ThemeProvider";
import { defaultsFromProfile } from "../domain/profile";
import { getUserProfile } from "../services/prefs/prefsStore";

type Props = NativeStackScreenProps<RootStackParamList, "Lesson">;

function stepTitle(step: LessonStep): string {
  switch (step.kind) {
    case "warmup":
      return WARM_UPS.find((w) => w.id === step.warmupId)?.title ?? "Warm-up";
    case "guided":
      return getGuided(step.guidedId)?.title ?? "Guided exercise";
    case "drill":
      return DRILL_TITLES[step.drill];
    case "rep":
      return step.framework ? `Rep: ${FRAMEWORK_LABELS[step.framework]}` : "Impromptu rep";
  }
}

function stepDetail(step: LessonStep): string {
  if (step.kind === "rep") return step.focus;
  if (step.kind === "warmup") return "About a minute";
  if (step.kind === "guided") return "Follow along, then rate yourself";
  return "Adapts to your level";
}

// A lesson: why it matters, how to do it, then the practice steps.
export function LessonScreen({ route, navigation }: Props) {
  const lesson = getLesson(route.params.lessonId);
  const styles = useStyles();
  const { colors } = useTheme();
  // Lots of training already: the explainer starts collapsed (tap to open).
  const [collapseTeach] = useState(() => defaultsFromProfile(getUserProfile()).collapseTeach);
  const [showTeach, setShowTeach] = useState<boolean | null>(null);
  const [done, setDone] = useState<Set<number>>(new Set());
  const [state, setState] = useState<LessonState | null>(null);
  const scoresRef = useRef<number[]>([]);

  useEffect(() => {
    getLessonStates().then((s) => setState(s[route.params.lessonId] ?? null));
  }, [route.params.lessonId]);

  useEffect(
    () =>
      subscribePracticeSteps(({ context, score }) => {
        if (context.lessonId !== lesson?.id || context.lessonStepIndex == null || context.planStepId) return;
        if (score != null) scoresRef.current.push(score);
        setDone((prev) => new Set(prev).add(context.lessonStepIndex!));
      }),
    [lesson?.id],
  );

  // All steps done: record the lesson (spaced review starts here).
  useEffect(() => {
    if (!lesson || done.size < lesson.steps.length) return;
    const scores = scoresRef.current;
    const avg = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 0.8;
    completeLesson(lesson.id, avg, avg >= 0.7).then(() => {
      showGlobalToast(`Lesson complete — it'll come back for review in a few days.`, "success");
      getLessonStates().then((s) => setState(s[lesson.id] ?? null));
    });
  }, [done, lesson]);

  if (!lesson) return <ScreenContainer />;
  const skill = colors.skill[lesson.skill];
  const teachOpen = showTeach ?? !collapseTeach;

  return (
    <ScreenContainer style={styles.container}>
      <Header eyebrow={`${SKILL_LABELS[lesson.skill]} · ${lesson.minutes} min`} title={lesson.title} onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={styles.scroll}>
        <Card style={styles.teach}>
          <View style={[styles.badge, { backgroundColor: skill.bg }]}>
            <Txt variant="caption1" weight="700" color={skill.fg}>
              Why it matters
            </Txt>
          </View>
          {!teachOpen ? (
            <Pressable onPress={() => setShowTeach(true)} accessibilityRole="button">
              <Txt variant="callout" tone="secondary">
                {lesson.teach.how.join(" · ")} <Txt variant="callout" tone="accent">More</Txt>
              </Txt>
            </Pressable>
          ) : null}
          {teachOpen ? <Txt variant="callout">{lesson.teach.why}</Txt> : null}
          {teachOpen ? (
            <Txt variant="caption2" tone="muted" uppercase>
              How
            </Txt>
          ) : null}
          {(teachOpen ? lesson.teach.how : []).map((h, i) => (
            <View key={h} style={styles.howRow}>
              <Txt variant="headline" color={skill.fg}>
                {i + 1}
              </Txt>
              <Txt variant="callout" style={styles.flex}>
                {h}
              </Txt>
            </View>
          ))}
          {teachOpen ? (
            <Txt variant="caption1" tone="muted">
              Source: {lesson.teach.source}
            </Txt>
          ) : null}
        </Card>

        {state?.done ? (
          <Txt variant="footnote" tone="success">
            Completed {state.attempts}× · next review {state.nextReviewAt ? new Date(state.nextReviewAt).toLocaleDateString() : "soon"}
          </Txt>
        ) : null}

        {lesson.steps.map((step, i) => {
          const isDone = done.has(i);
          return (
            <Card key={i} style={styles.step}>
              <View style={styles.stepRow}>
                <Ionicons name={isDone ? "checkmark-circle" : "ellipse-outline"} size={22} color={isDone ? colors.success : colors.textMuted} />
                <View style={styles.flex}>
                  <Txt variant="headline">{stepTitle(step)}</Txt>
                  <Txt variant="footnote" tone="secondary">
                    {stepDetail(step)}
                  </Txt>
                </View>
              </View>
              <PrimaryButton
                label={isDone ? "Do it again" : "Start"}
                variant={isDone ? "secondary" : "primary"}
                onPress={() => launchStep(navigation, step, { lessonId: lesson.id, lessonStepIndex: i })}
              />
            </Card>
          );
        })}
      </ScrollView>
    </ScreenContainer>
  );
}

const useStyles = makeStyles((t) => ({
  container: { gap: t.space.md },
  scroll: { gap: t.space.md, paddingBottom: t.space.xl },
  teach: { gap: t.space.sm },
  badge: { alignSelf: "flex-start", paddingHorizontal: t.space.sm + 2, paddingVertical: 4, borderRadius: t.radius.pill },
  howRow: { flexDirection: "row", gap: t.space.md, alignItems: "flex-start" },
  flex: { flex: 1 },
  step: { gap: t.space.md },
  stepRow: { flexDirection: "row", gap: t.space.md, alignItems: "center" },
}));
