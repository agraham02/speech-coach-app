import { useEffect, useMemo, useRef, useState } from "react";
import { Animated, Easing, Pressable, ScrollView, View } from "react-native";
import * as Haptics from "expo-haptics";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../navigation";
import { ScreenContainer } from "../components/common/ScreenContainer";
import { Header } from "../components/common/Header";
import { Card } from "../components/common/Card";
import { Txt } from "../components/common/Txt";
import { PrimaryButton } from "../components/common/PrimaryButton";
import { ProgressRing } from "../components/common/ProgressRing";
import { WARM_UPS } from "../content/drillContent";
import { getGuided } from "../content/lessons";
import { scoreSelfRating } from "../domain/drills/drillSpecs";
import { getDrillLevel, recordDrillOutcome } from "../services/db/progressRepo";
import { completePracticeStep } from "../services/practice/practiceEvents";
import { makeStyles, useTheme } from "../theme/ThemeProvider";

type Props = NativeStackScreenProps<RootStackParamList, "Guided">;

// The breathing circle never shrinks below this fraction of its full size.
const BREATH_MIN_SCALE = 0.68;

// Warm-ups (timed steps) and guided exercises (steps + an honest 1-5
// self-rating, for things the phone can't measure reliably).
export function GuidedScreen({ route, navigation }: Props) {
  const { warmupId, guidedId, practice } = route.params;
  const warmUp = warmupId ? WARM_UPS.find((w) => w.id === warmupId) : undefined;
  const guided = guidedId ? getGuided(guidedId) : undefined;

  if (warmUp) return <WarmUpRunner warmUp={warmUp} onDone={() => finish(null)} onBack={() => navigation.goBack()} />;
  if (guided) return <GuidedRunner exercise={guided} onDone={(score) => finish(score)} onBack={() => navigation.goBack()} />;
  return null;

  async function finish(score: number | null) {
    await completePracticeStep(practice, score);
    navigation.goBack();
  }
}

function WarmUpRunner({
  warmUp,
  onDone,
  onBack,
}: {
  warmUp: (typeof WARM_UPS)[number];
  onDone: () => void;
  onBack: () => void;
}) {
  const styles = useStyles();
  const { colors } = useTheme();
  const rounds = warmUp.rounds ?? 1;
  const sequence = useMemo(
    () => Array.from({ length: rounds }, (_, round) => warmUp.steps.map((step) => ({ step, round }))).flat(),
    [warmUp, rounds],
  );
  const totalSeconds = sequence.reduce((sum, s) => sum + s.step.seconds, 0);
  const [index, setIndex] = useState(-1); // -1 = not started
  const [tick, setTick] = useState<{ index: number; left: number } | null>(null);
  const scale = useRef(new Animated.Value(BREATH_MIN_SCALE)).current;
  const current = sequence[index];
  const finished = index >= sequence.length;

  // Counts down against a deadline rather than by ticks, so it stays right
  // if the app is briefly backgrounded or the JS thread stalls.
  useEffect(() => {
    if (index < 0 || index >= sequence.length) return;
    const { step } = sequence[index];
    const deadline = Date.now() + step.seconds * 1000;
    Haptics.selectionAsync().catch(() => undefined);
    if (step.phase === "in" || step.phase === "out") {
      Animated.timing(scale, {
        toValue: step.phase === "in" ? BREATH_MIN_SCALE + (1 - BREATH_MIN_SCALE) * (step.fill ?? 1) : BREATH_MIN_SCALE,
        duration: step.seconds * 1000,
        easing: Easing.inOut(Easing.sin),
        useNativeDriver: true,
      }).start();
    }
    const timer = setInterval(() => {
      const left = Math.ceil((deadline - Date.now()) / 1000);
      if (left <= 0) {
        clearInterval(timer);
        setIndex((i) => i + 1);
      } else {
        setTick({ index, left });
      }
    }, 250);
    return () => clearInterval(timer);
  }, [index, sequence, scale]);

  const breathing = current?.step.phase != null;
  // Until the first tick of a step lands, show its full duration (not a stale 0).
  const remaining = current ? (tick?.index === index ? tick.left : current.step.seconds) : 0;

  return (
    <ScreenContainer style={styles.container}>
      <Header eyebrow="Warm-up" title={warmUp.title} onBack={onBack} backIcon="close" />
      <View style={styles.center}>
        {index < 0 ? (
          <Card style={styles.list}>
            {warmUp.steps.map((s, i) => (
              <View key={i} style={styles.listRow}>
                <Txt variant="headline">{s.label}</Txt>
                <Txt variant="subhead" tone="secondary">
                  {s.detail}
                </Txt>
              </View>
            ))}
            <Txt variant="footnote" tone="muted">
              {rounds > 1 ? `${rounds} rounds · ` : ""}about {totalSeconds >= 90 ? `${Math.round(totalSeconds / 60)} min` : `${totalSeconds} seconds`}
            </Txt>
          </Card>
        ) : finished ? (
          <Txt variant="title2" align="center">
            Warmed up. Nice.
          </Txt>
        ) : (
          <View style={styles.activeStep}>
            <View style={styles.ringWrap}>
              {breathing ? <Animated.View style={[styles.breathCircle, { transform: [{ scale }] }]} /> : null}
              <ProgressRing size={160} strokeWidth={10} progress={remaining / Math.max(current.step.seconds, 1)} color={colors.accent}>
                <Txt variant="largeTitle">{remaining}</Txt>
              </ProgressRing>
            </View>
            <Txt variant="title2" align="center">
              {current.step.label}
            </Txt>
            <Txt variant="callout" tone="secondary" align="center">
              {current.step.detail}
            </Txt>
            <Txt variant="footnote" tone="muted">
              {rounds > 1 ? `Round ${current.round + 1} of ${rounds}` : `Step ${index + 1} of ${sequence.length}`}
            </Txt>
          </View>
        )}
      </View>
      {index < 0 ? <PrimaryButton label="Start" onPress={() => setIndex(0)} /> : null}
      {index >= 0 && !finished ? <PrimaryButton label="Skip" variant="secondary" onPress={() => setIndex((i) => i + 1)} /> : null}
      {finished ? <PrimaryButton label="Done" onPress={onDone} /> : null}
    </ScreenContainer>
  );
}

function GuidedRunner({
  exercise,
  onDone,
  onBack,
}: {
  exercise: NonNullable<ReturnType<typeof getGuided>>;
  onDone: (score: number) => void;
  onBack: () => void;
}) {
  const styles = useStyles();
  // One instruction at a time, then the self-rating. Showing every step
  // (and the rating) up front let you rate yourself without doing anything.
  const [stepIndex, setStepIndex] = useState(0);
  const [rating, setRating] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const total = exercise.steps.length;
  const ratingStage = stepIndex >= total;

  function go(next: number) {
    Haptics.selectionAsync().catch(() => undefined);
    setStepIndex(next);
  }

  async function save() {
    if (rating == null || saving) return;
    setSaving(true);
    const outcome = scoreSelfRating(rating);
    const level = await getDrillLevel("guided");
    await recordDrillOutcome({ drillType: "guided", outcome, level, contentId: exercise.id, skill: exercise.skill });
    onDone(outcome.score);
  }

  return (
    <ScreenContainer style={styles.container}>
      <Header eyebrow="Guided exercise" title={exercise.title} onBack={onBack} backIcon="close" />
      <View style={styles.dots} accessibilityLabel={ratingStage ? "Rate yourself" : `Step ${stepIndex + 1} of ${total}`}>
        {Array.from({ length: total + 1 }, (_, i) => (
          <View key={i} style={[styles.dot, i <= stepIndex && styles.dotOn]} />
        ))}
      </View>
      <ScrollView contentContainerStyle={styles.scroll}>
        {!ratingStage ? (
          <Card style={styles.guidedStep}>
            <Txt variant="caption2" tone="accent" uppercase>
              Step {stepIndex + 1} of {total}
            </Txt>
            <Txt variant="title3">{exercise.steps[stepIndex]}</Txt>
          </Card>
        ) : (
          <Card style={styles.guidedStep}>
            <Txt variant="headline">{exercise.ratingQuestion}</Txt>
            <View style={styles.ratingRow}>
              {[1, 2, 3, 4, 5].map((n) => (
                <Pressable
                  key={n}
                  onPress={() => setRating(n)}
                  style={[styles.ratingChip, rating === n && styles.ratingChipOn]}
                  accessibilityRole="button"
                  accessibilityLabel={`Rate ${n} out of 5`}
                  accessibilityState={{ selected: rating === n }}
                >
                  <Txt variant="headline" tone={rating === n ? "onAccent" : "primary"}>
                    {n}
                  </Txt>
                </Pressable>
              ))}
            </View>
            <View style={styles.ratingLabels}>
              <Txt variant="caption1" tone="muted">
                Not at all
              </Txt>
              <Txt variant="caption1" tone="muted">
                Completely
              </Txt>
            </View>
          </Card>
        )}
      </ScrollView>
      {ratingStage ? (
        <PrimaryButton label="Done" onPress={save} disabled={rating == null} loading={saving} />
      ) : (
        <View style={styles.navRow}>
          {stepIndex > 0 ? (
            <View style={styles.flex}>
              <PrimaryButton label="Back" variant="secondary" onPress={() => go(stepIndex - 1)} />
            </View>
          ) : null}
          <View style={styles.flex}>
            <PrimaryButton label={stepIndex === total - 1 ? "I've done it" : "Next"} onPress={() => go(stepIndex + 1)} />
          </View>
        </View>
      )}
    </ScreenContainer>
  );
}

const useStyles = makeStyles((t) => ({
  container: { gap: t.space.md },
  center: { flex: 1, justifyContent: "center" },
  list: { gap: t.space.md },
  listRow: { gap: 2 },
  activeStep: { alignItems: "center", gap: t.space.md },
  ringWrap: { width: 240, height: 240, alignItems: "center", justifyContent: "center" },
  breathCircle: { position: "absolute", width: 240, height: 240, borderRadius: 120, backgroundColor: t.colors.accent, opacity: 0.22 },
  dots: { flexDirection: "row", gap: t.space.xs },
  dot: { height: 6, flex: 1, borderRadius: 3, backgroundColor: t.colors.surfaceRaised },
  dotOn: { backgroundColor: t.colors.accent },
  navRow: { flexDirection: "row", gap: t.space.sm },
  flex: { flex: 1 },
  scroll: { flexGrow: 1, justifyContent: "center", gap: t.space.md, paddingBottom: t.space.lg },
  guidedStep: { gap: t.space.sm },
  ratingRow: { flexDirection: "row", justifyContent: "space-between", marginTop: t.space.sm },
  ratingChip: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: t.colors.surfaceRaised,
  },
  ratingChipOn: { backgroundColor: t.colors.accent },
  ratingLabels: { flexDirection: "row", justifyContent: "space-between" },
}));
