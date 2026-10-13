import { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../navigation";
import { ScreenContainer } from "../components/common/ScreenContainer";
import { Header } from "../components/common/Header";
import { Card } from "../components/common/Card";
import { Txt } from "../components/common/Txt";
import { PrimaryButton } from "../components/common/PrimaryButton";
import { MarkedTextView } from "../components/cadence/MarkedTextView";
import { useTakeRecorder } from "../hooks/useTakeRecorder";
import { getMovement } from "../content/movementContent";
import { getLines } from "../content/lines";
import { loudnessRange, moveItPlan, scoreMoveIt, comparableMeasure, type MoveItResult, type TakeRange, type TakeSpec } from "../domain/cadence/moveIt";
import { keepKinds } from "../domain/cadence/marks";
import { getDrillLevel, recordDrillOutcome } from "../services/db/progressRepo";
import { measureTakePitchRange } from "../services/audio/takeAnalysis";
import { completePracticeStep } from "../services/practice/practiceEvents";
import { showGlobalToast } from "../components/common/ToastProvider";
import { makeStyles, useTheme } from "../theme/ThemeProvider";

type Props = NativeStackScreenProps<RootStackParamList, "MoveIt">;
type Stage = "setup" | "take" | "results";

interface DoneTake extends TakeRange {
  spec: TakeSpec;
  uri: string | null;
  // Words were recognized — noise alone never counts as a take.
  heard: boolean;
}

function takeTitle(spec: TakeSpec): string {
  if (spec.kind === "neutral") return "Plain";
  if (spec.kind === "ghost") return "Still";
  return getMovement(spec.movementId ?? "")?.name ?? "Move";
}

function takeCue(spec: TakeSpec): string {
  if (spec.kind === "neutral") return "Just say it, the way you normally would.";
  if (spec.kind === "ghost") return "Stand still — no movement — and keep all that energy in your voice.";
  return getMovement(spec.movementId ?? "")?.cue ?? "";
}

// "Your voice isn't monotone — you're vocally lazy." Say one line plainly,
// then with big movements, then still with the same energy. The result is
// the contrast between your own takes, never a grade on your voice.
export function MoveItScreen({ route, navigation }: Props) {
  const practice = route.params?.practice;
  const styles = useStyles();
  const { colors } = useTheme();
  const recorder = useTakeRecorder();
  const seedRef = useRef(Math.floor(Math.random() * 10_000));
  const [level, setLevel] = useState(1);
  const [stage, setStage] = useState<Stage>("setup");
  const [index, setIndex] = useState(0);
  const [takes, setTakes] = useState<DoneTake[]>([]);
  const [result, setResult] = useState<MoveItResult | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getDrillLevel("move_it").then(setLevel);
  }, []);

  const plan = useMemo(() => moveItPlan(level, seedRef.current), [level]);
  const line = useMemo(() => {
    const pool = getLines().filter((l) => l.category === plan.lineCategory && l.sentences <= 2);
    // The classic line from the exercise comes first, the very first time.
    const first = getLines().find((l) => l.id === "e01");
    return level <= 1 && first ? first : pool[seedRef.current % pool.length];
  }, [plan, level]);
  // Stress only — movement does the rest.
  const shown = useMemo(() => ({ text: line.text, marks: keepKinds(line.marks, ["emphasis"]) }), [line]);
  const spec = plan.takes[index];

  async function toggleTake() {
    if (recorder.state === "recording") {
      const take = await recorder.stop();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
      const done: DoneTake = { spec, uri: take.uri, loudness: loudnessRange(take.volume), pitch: null, heard: take.transcript.trim().length > 0 };
      const next = [...takes.slice(0, index), done];
      setTakes(next);
      // Pitch needs the saved audio decoded — fill it in when it's ready.
      measureTakePitchRange(take.uri).then((pitch) => {
        setTakes((current) => current.map((t) => (t === done ? { ...t, pitch } : t)));
      });
      if (index < plan.takes.length - 1) setIndex(index + 1);
      else setStage("results");
      return;
    }
    await recorder.start();
  }

  // Score once the still take's pitch analysis has had its chance.
  useEffect(() => {
    if (stage !== "results" || takes.length < plan.takes.length) return;
    const neutral = takes[0];
    const ghost = takes[takes.length - 1];
    if (!neutral.heard || !ghost.heard) {
      setResult(null);
      return;
    }
    const timer = setTimeout(() => setResult(scoreMoveIt(neutral, ghost, plan.targetLift)), ghost.pitch === null ? 2500 : 0);
    return () => clearTimeout(timer);
  }, [stage, takes, plan]);

  async function finish() {
    if (saving) return;
    setSaving(true);
    if (result) {
      const change = await recordDrillOutcome({
        drillType: "move_it",
        outcome: result.outcome,
        level,
        contentId: line.id,
        lessonId: practice?.lessonId,
        metrics: { measure: result.measure, lift: result.lift, takes: takes.map((t) => ({ take: t.spec.movementId ?? t.spec.kind, loudness: t.loudness, pitch: t.pitch })) },
      });
      if (change.leveledUp) showGlobalToast("Level up — Move it asks for a little more now.", "success");
    }
    await completePracticeStep(practice, result?.outcome.score ?? null);
    navigation.goBack();
  }

  function again() {
    seedRef.current += 1;
    setTakes([]);
    setIndex(0);
    setResult(null);
    setStage("setup");
  }

  const heardBoth = takes.length >= 2 && takes[0].heard && takes[takes.length - 1].heard;
  const measure = heardBoth ? comparableMeasure(takes[0], takes[takes.length - 1]) : null;
  const raw = takes.map((t) => (measure === "pitch" ? t.pitch : t.loudness));
  const values = raw.map((v) => v ?? 0);
  const max = Math.max(1, ...values);

  return (
    <ScreenContainer style={styles.container}>
      <Header eyebrow={`Move it · level ${Math.floor(level)}`} title={stage === "results" ? "Your takes" : stage === "take" ? `${takeTitle(spec)} take` : "Move it"} onBack={() => navigation.goBack()} backIcon="close" />

      {stage === "setup" ? (
        <ScrollView contentContainerStyle={styles.scroll}>
          <Txt variant="callout" tone="secondary">
            Your voice isn't monotone — it's under-used. Big movements push your pitch and volume around without you having to think about it. Say the same line a few ways, then once standing still, keeping the energy.
          </Txt>
          <Card style={styles.card}>
            <MarkedTextView marked={shown} size="large" layout="flow" />
          </Card>
          <View style={styles.sequence}>
            {plan.takes.map((t, i) => (
              <View key={i} style={styles.seqItem}>
                <Txt variant="footnote" weight="700" tone={t.kind === "ghost" ? "accent" : "secondary"}>
                  {takeTitle(t)}
                </Txt>
                {i < plan.takes.length - 1 ? <Ionicons name="chevron-forward" size={14} color={colors.textMuted} /> : null}
              </View>
            ))}
          </View>
          <View style={styles.tip}>
            <Ionicons name="phone-portrait-outline" size={18} color={colors.textSecondary} />
            <Txt variant="footnote" tone="secondary" style={styles.flex}>
              Prop your phone up first — you'll need both hands. Audio only; nothing is filmed.
            </Txt>
          </View>
        </ScrollView>
      ) : null}

      {stage === "take" ? (
        <View style={styles.takeStage}>
          <Card style={styles.card}>
            <View style={styles.cueRow}>
              <Ionicons
                name={spec.kind === "move" ? getMovement(spec.movementId ?? "")?.icon ?? "body-outline" : spec.kind === "ghost" ? "body-outline" : "chatbubble-outline"}
                size={28}
                color={colors.accent}
              />
              <Txt variant="headline" style={styles.flex}>
                {takeCue(spec)}
              </Txt>
            </View>
            <MarkedTextView marked={shown} size="large" layout="flow" />
          </Card>
          <Pressable
            onPress={toggleTake}
            style={[styles.bigButton, { backgroundColor: recorder.state === "recording" ? colors.danger : colors.accent }]}
            accessibilityRole="button"
            accessibilityLabel={recorder.state === "recording" ? "Stop this take" : "Record this take"}
          >
            <Ionicons name={recorder.state === "recording" ? "stop" : "mic"} size={44} color={colors.onAccent} />
          </Pressable>
          <Txt variant="footnote" tone="muted" align="center">
            {recorder.state === "recording" ? "Say the line — tap to stop" : `Take ${index + 1} of ${plan.takes.length} · tap to record`}
          </Txt>
        </View>
      ) : null}

      {stage === "results" ? (
        <ScrollView contentContainerStyle={styles.scroll}>
          <Card style={styles.card}>
            <Txt variant="caption2" tone="muted" uppercase>
              {measure === "pitch" ? "Pitch range (semitones)" : "Loudness range"}
            </Txt>
            {takes.map((t, i) => (
              <View key={i} style={styles.barRow}>
                <Txt variant="footnote" weight="600" style={styles.barLabel} tone={t.spec.kind === "ghost" ? "accent" : "primary"}>
                  {takeTitle(t.spec)}
                </Txt>
                <View style={styles.barTrack}>
                  <View style={[styles.barFill, { width: `${Math.max(3, (values[i] / max) * 100)}%`, backgroundColor: t.spec.kind === "ghost" ? colors.accent : colors.skill.cadence.fg }]} />
                </View>
                <Txt variant="caption1" tone="muted" style={styles.barValue}>
                  {measure && raw[i] != null ? raw[i]!.toFixed(1) : "—"}
                </Txt>
                {t.uri ? (
                  <Pressable onPress={() => recorder.play(t.uri!)} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Play the ${takeTitle(t.spec)} take`}>
                    <Ionicons name={recorder.playing === t.uri ? "pause" : "play"} size={18} color={colors.accent} />
                  </Pressable>
                ) : null}
              </View>
            ))}
          </Card>
          {result ? (
            <Card style={styles.card}>
              <Txt variant="title3">
                Your still take had {result.lift}× the {result.measure === "pitch" ? "pitch range" : "loudness range"} of your plain take.
              </Txt>
              <Txt variant="subhead" tone="secondary">
                {result.lift > 1
                  ? "That's the energy the movement found, kept without the movement. Listen to the two back to back."
                  : "The movement didn't carry over this time. Try the still take again picturing the punch — just don't throw it."}
              </Txt>
            </Card>
          ) : measure === null && takes.length === plan.takes.length ? (
            <Card style={styles.card}>
              <Txt variant="headline">Couldn't hear enough to compare.</Txt>
              <Txt variant="footnote" tone="secondary">
                Check the mic isn't muted and the phone is close enough. Nothing was recorded.
              </Txt>
            </Card>
          ) : (
            <Txt variant="footnote" tone="muted">
              Measuring…
            </Txt>
          )}
        </ScrollView>
      ) : null}

      {stage === "setup" ? <PrimaryButton label="I'm ready" onPress={() => setStage("take")} /> : null}
      {stage === "results" ? (
        <View style={styles.row}>
          <PrimaryButton label="Again" variant="secondary" style={styles.flex} onPress={again} />
          <PrimaryButton label="Done" style={styles.flex} onPress={finish} loading={saving} />
        </View>
      ) : null}
    </ScreenContainer>
  );
}

const useStyles = makeStyles((t) => ({
  container: { gap: t.space.md },
  scroll: { gap: t.space.md, paddingBottom: t.space.lg },
  card: { gap: t.space.md },
  sequence: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: t.space.xs },
  seqItem: { flexDirection: "row", alignItems: "center", gap: t.space.xs },
  tip: { flexDirection: "row", gap: t.space.sm, alignItems: "flex-start" },
  takeStage: { flex: 1, justifyContent: "center", gap: t.space.lg },
  cueRow: { flexDirection: "row", gap: t.space.md, alignItems: "center" },
  bigButton: { alignSelf: "center", width: 140, height: 140, borderRadius: 70, alignItems: "center", justifyContent: "center" },
  barRow: { flexDirection: "row", alignItems: "center", gap: t.space.sm },
  barLabel: { width: 56 },
  barTrack: { flex: 1, height: 14, borderRadius: 7, backgroundColor: t.colors.surfaceRaised, overflow: "hidden" },
  barFill: { height: "100%", borderRadius: 7 },
  barValue: { width: 36, textAlign: "right" },
  row: { flexDirection: "row", gap: t.space.sm },
  flex: { flex: 1 },
}));
