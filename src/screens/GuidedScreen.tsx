import { GuideTip } from "../components/common/GuideTip";
import { useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../navigation";
import { ScreenContainer } from "../components/common/ScreenContainer";
import { Header } from "../components/common/Header";
import { Card } from "../components/common/Card";
import { Txt } from "../components/common/Txt";
import { PrimaryButton } from "../components/common/PrimaryButton";
import { WARM_UPS } from "../content/drillContent";
import { getGuided } from "../content/lessons";
import { scoreSelfRating } from "../domain/drills/drillSpecs";
import { isMeasured, SELF_RATED_ONLY } from "../domain/guided/guidedMeasures";
import { MeasuredGuidedRunner } from "./guided/MeasuredGuidedRunner";
import { WarmUpRunner } from "./guided/WarmUpRunner";
import { getDrillLevel, recordDrillOutcome } from "../services/db/progressRepo";
import { completePracticeStep } from "../services/practice/practiceEvents";
import { announceTrail } from "../components/celebrate/trailToast";
import { guidedActivityId, warmupActivityId } from "../content/activities";
import { tick as hapticTick } from "../utils/haptics";
import { makeStyles } from "../theme/ThemeProvider";

type Props = NativeStackScreenProps<RootStackParamList, "Guided">;

// Warm-ups (timed steps) and guided exercises. Most guided exercises have a
// microphone and a number (screens/guided/MeasuredGuidedRunner.tsx); the three
// that depend on pitch and stress, which are unproven, end in an honest 1-5
// self-rating and say so.
export function GuidedScreen({ route, navigation }: Props) {
  const { warmupId, guidedId, practice } = route.params;
  const warmUp = warmupId ? WARM_UPS.find((w) => w.id === warmupId) : undefined;
  const guided = guidedId ? getGuided(guidedId) : undefined;

  if (warmUp) return <WarmUpRunner warmUp={warmUp} onDone={(score) => finish(score)} onBack={() => navigation.goBack()} />;
  if (guided && isMeasured(guided.id)) return <MeasuredGuidedRunner exercise={guided} onDone={(score) => finish(score)} onBack={() => navigation.goBack()} />;
  if (guided) return <GuidedRunner exercise={guided} onDone={(score) => finish(score)} onBack={() => navigation.goBack()} />;
  return null;

  async function finish(score: number | null) {
    await completePracticeStep(warmupId ? warmupActivityId(warmupId) : guidedActivityId(guidedId!), practice, score);
    navigation.goBack();
  }
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
    hapticTick();
    setStepIndex(next);
  }

  async function save() {
    if (rating == null || saving) return;
    setSaving(true);
    const outcome = scoreSelfRating(rating);
    const level = await getDrillLevel("guided", exercise.id);
    // A self-rating moves inner leaves only (plan 6.4, rule 6); the mic comes in 3c.1.
    announceTrail(await recordDrillOutcome({ drillType: "guided", outcome, level, contentId: exercise.id, skill: exercise.skill, source: "self" }));
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
            {SELF_RATED_ONLY[exercise.id] ? (
              <Txt variant="footnote" tone="muted">
                {SELF_RATED_ONLY[exercise.id]}
              </Txt>
            ) : null}
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
      <GuideTip id="guided" />
    </ScreenContainer>
  );
}

const useStyles = makeStyles((t) => ({
  container: { gap: t.space.md },
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
