import { useEffect, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
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
  const [index, setIndex] = useState(-1); // -1 = not started
  const [remaining, setRemaining] = useState(0);
  const step = warmUp.steps[index];

  useEffect(() => {
    if (index < 0 || index >= warmUp.steps.length) return;
    setRemaining(warmUp.steps[index].seconds);
    const timer = setInterval(() => {
      setRemaining((r) => {
        if (r <= 1) {
          clearInterval(timer);
          Haptics.selectionAsync().catch(() => undefined);
          setIndex((i) => i + 1);
          return 0;
        }
        return r - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [index, warmUp.steps]);

  const finished = index >= warmUp.steps.length;

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
          </Card>
        ) : finished ? (
          <Txt variant="title2" align="center">
            Warmed up. Nice.
          </Txt>
        ) : (
          <View style={styles.activeStep}>
            <ProgressRing size={160} strokeWidth={10} progress={remaining / Math.max(step.seconds, 1)} color={colors.accent}>
              <Txt variant="largeTitle">{remaining}</Txt>
            </ProgressRing>
            <Txt variant="title2" align="center">
              {step.label}
            </Txt>
            <Txt variant="callout" tone="secondary" align="center">
              {step.detail}
            </Txt>
            <Txt variant="footnote" tone="muted">
              Step {index + 1} of {warmUp.steps.length}
            </Txt>
          </View>
        )}
      </View>
      {index < 0 ? <PrimaryButton label="Start" onPress={() => setIndex(0)} /> : null}
      {index >= 0 && !finished ? <PrimaryButton label="Next step" variant="secondary" onPress={() => setIndex((i) => i + 1)} /> : null}
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
  const [rating, setRating] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  async function save() {
    if (rating == null) return;
    setSaving(true);
    const outcome = scoreSelfRating(rating);
    const level = await getDrillLevel("guided");
    await recordDrillOutcome({ drillType: "guided", outcome, level, contentId: exercise.id });
    onDone(outcome.score);
  }

  return (
    <ScreenContainer style={styles.container}>
      <Header eyebrow="Guided exercise" title={exercise.title} onBack={onBack} backIcon="close" />
      <ScrollView contentContainerStyle={styles.scroll}>
        {exercise.steps.map((text, i) => (
          <Card key={i} style={styles.guidedStep}>
            <Txt variant="caption2" tone="accent" uppercase>
              Step {i + 1}
            </Txt>
            <Txt variant="callout">{text}</Txt>
          </Card>
        ))}
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
      </ScrollView>
      <PrimaryButton label="Done" onPress={save} disabled={rating == null} loading={saving} />
    </ScreenContainer>
  );
}

const useStyles = makeStyles((t) => ({
  container: { gap: t.space.md },
  center: { flex: 1, justifyContent: "center" },
  list: { gap: t.space.md },
  listRow: { gap: 2 },
  activeStep: { alignItems: "center", gap: t.space.md },
  scroll: { gap: t.space.md, paddingBottom: t.space.lg },
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
