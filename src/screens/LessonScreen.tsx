import { useEffect, useRef, useState } from "react";
import { GuideTip } from "../components/common/GuideTip";
import { Pressable, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../navigation";
import { ScreenContainer } from "../components/common/ScreenContainer";
import { Screen } from "../components/common/Screen";
import { HeroCard } from "../components/common/HeroCard";
import { Badge } from "../components/common/Badge";
import { SectionHeader } from "../components/common/SectionHeader";
import { Card } from "../components/common/Card";
import { PressableScale } from "../components/common/PressableScale";
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

  const firstOpen = lesson.steps.findIndex((_, i) => !done.has(i));

  return (
    <Screen eyebrow={`${SKILL_LABELS[lesson.skill]} · ${lesson.minutes} min`} title={lesson.title} onBack={() => navigation.goBack()}>
      <HeroCard accent={skill.fg} contentStyle={styles.teach}>
        <Badge label="Why it matters" fg={skill.fg} bg={skill.bg} dot />
        {!teachOpen ? (
          <Pressable onPress={() => setShowTeach(true)} accessibilityRole="button">
            <Txt variant="callout" tone="secondary">
              {lesson.teach.how.join(" · ")}{" "}
              <Txt variant="callout" weight="600">
                More
              </Txt>
            </Txt>
          </Pressable>
        ) : null}
        {teachOpen ? <Txt variant="body">{lesson.teach.why}</Txt> : null}
        {(teachOpen ? lesson.teach.how : []).map((h, i) => (
          <View key={h} style={styles.howRow}>
            <Txt variant="title1" color={skill.fg} style={styles.howNumber}>
              {i + 1}
            </Txt>
            <Txt variant="callout" style={styles.flex}>
              {h}
            </Txt>
          </View>
        ))}
        {teachOpen ? (
          <PressableScale onPress={() => navigation.navigate("Sources")} accessibilityRole="link" accessibilityHint="Opens the list of sources">
            <Txt variant="caption1" tone="muted">
              Source: {lesson.teach.source}
            </Txt>
          </PressableScale>
        ) : null}
      </HeroCard>

      {state?.done ? (
        <View style={styles.completed}>
          <Ionicons name="checkmark-circle" size={16} color={colors.success} />
          <Txt variant="footnote" tone="secondary">
            Completed {state.attempts}× · next review {state.nextReviewAt ? new Date(state.nextReviewAt).toLocaleDateString() : "soon"}
          </Txt>
        </View>
      ) : null}

      <SectionHeader title="Practice" />
      {lesson.steps.map((step, i) => {
        const isDone = done.has(i);
        const isNext = i === firstOpen;
        return (
          <Card key={i} style={styles.step}>
            <View style={styles.stepRow}>
              <View style={[styles.node, isDone && { backgroundColor: skill.fg, borderColor: skill.fg }, isNext && styles.nodeNext]}>
                {isDone ? (
                  <Ionicons name="checkmark" size={15} color={colors.background} />
                ) : (
                  <Txt variant="caption1" weight="700" color={isNext ? colors.onAccent : colors.textSecondary}>
                    {i + 1}
                  </Txt>
                )}
              </View>
              <View style={styles.flex}>
                <Txt variant="headline">{stepTitle(step)}</Txt>
                <Txt variant="footnote" tone="secondary">
                  {stepDetail(step)}
                </Txt>
              </View>
            </View>
            <PrimaryButton
              label={isDone ? "Do it again" : "Start"}
              variant={isNext ? "primary" : "secondary"}
              size="md"
              iconRight={isNext ? "arrow-forward" : undefined}
              onPress={() => launchStep(navigation, step, { lessonId: lesson.id, lessonStepIndex: i })}
            />
          </Card>
        );
      })}
      <GuideTip id="lesson" />
    </Screen>
  );
}

const NODE = 28;

const useStyles = makeStyles((t) => ({
  teach: { gap: t.space.md - 4 },
  howRow: { flexDirection: "row", gap: t.space.md - 2, alignItems: "flex-start" },
  howNumber: { fontSize: 20, lineHeight: 24, width: 18 },
  flex: { flex: 1 },
  completed: { flexDirection: "row", alignItems: "center", gap: t.space.xs + 2, paddingHorizontal: 4 },
  step: { gap: t.space.md },
  stepRow: { flexDirection: "row", gap: t.space.md - 2, alignItems: "center" },
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
}));
