import { useRef, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { ScreenContainer } from "../../components/common/ScreenContainer";
import { Header } from "../../components/common/Header";
import { Card } from "../../components/common/Card";
import { Txt } from "../../components/common/Txt";
import { PrimaryButton } from "../../components/common/PrimaryButton";
import { GateNote } from "../../components/celebrate/GateNote";
import { DrillProgressLine } from "../../components/celebrate/DrillProgressLine";
import { showGlobalToast } from "../../components/common/ToastProvider";
import { useLiveSpeech } from "../../hooks/useLiveSpeech";
import type { getGuided } from "../../content/lessons";
import { GUIDED_MEASURES, scoreGuided, type Clip, type GuidedScore } from "../../domain/guided/guidedMeasures";
import { FIRST_RESULT_LATENCY_MS, fullText } from "../../domain/speech/liveTranscript";
import type { VolumeReading } from "../../domain/dsp/volumePauses";
import { outcome } from "../../domain/drills/drillSpecs";
import { getDrillLevel, recordDrillOutcome, type ProgressChange } from "../../services/db/progressRepo";
import { transcribeDrillClips } from "../../services/speech/clipTranscript";
import { tick as hapticTick } from "../../utils/haptics";
import { logger } from "../../utils/logger";
import { makeStyles } from "../../theme/ThemeProvider";

// A guided exercise with a microphone (docs/overhaul/PLAN.md, 3c.1). One
// instruction at a time; the steps that ask you to say something have a Record
// button. At the end Whisper reads each recording, the checks in
// domain/guided/guidedMeasures.ts add up to a number, and it moves the skills the
// exercise trains. Some exercises also ask for your own rating, where the plan
// gives it a share of the number.

type Exercise = NonNullable<ReturnType<typeof getGuided>>;

interface Recorded {
  text: string;
  volume: VolumeReading[];
  startDelayMs: number | null;
  spokenMs: number;
  uris: string[];
}

type Stage = "steps" | "rating" | "checking" | "result";

export function MeasuredGuidedRunner({ exercise, onDone, onBack }: { exercise: Exercise; onDone: (score: number | null) => void; onBack: () => void }) {
  const styles = useStyles();
  const speech = useLiveSpeech();
  const measure = GUIDED_MEASURES[exercise.id];
  const total = exercise.steps.length;
  const [stepIndex, setStepIndex] = useState(0);
  const [stage, setStage] = useState<Stage>("steps");
  const [recording, setRecording] = useState<number | null>(null);
  const [recorded, setRecorded] = useState<Record<number, Recorded>>({});
  const [rating, setRating] = useState<number | null>(null);
  const [result, setResult] = useState<{ scored: GuidedScore; quick: boolean; change: ProgressChange | null } | null>(null);
  const startedAtRef = useRef(0);
  const busy = useRef(false);

  const tryIndex = measure.tries.findIndex((t) => t.step === stepIndex);
  const thisTry = tryIndex >= 0 ? measure.tries[tryIndex] : null;
  const lastStep = stepIndex >= total - 1;

  async function startRecording(index: number) {
    if (busy.current) return;
    busy.current = true;
    try {
      const ready = await speech.session.prepare();
      if (ready !== "ready") {
        showGlobalToast(ready === "denied" ? "Microphone permission is needed for this exercise." : "Speech recognition isn't available.", "error");
        return;
      }
      startedAtRef.current = Date.now();
      speech.session.start({ persistAudio: true, volumeMeter: true, volumeIntervalMs: 100 });
      hapticTick();
      setRecording(index);
    } finally {
      busy.current = false;
    }
  }

  async function stopRecording(index: number) {
    if (busy.current) return;
    busy.current = true;
    try {
      const transcript = await speech.session.stop();
      const first = transcript.firstResultAtMs;
      const last = transcript.lastResultAtMs;
      const clip: Recorded = {
        text: fullText(transcript),
        volume: speech.session.getVolumeSamples(),
        startDelayMs: first != null ? Math.max(0, first - startedAtRef.current - FIRST_RESULT_LATENCY_MS) : null,
        spokenMs: first != null && last != null ? last - first + FIRST_RESULT_LATENCY_MS : Date.now() - startedAtRef.current,
        uris: [...speech.session.getRecordings()],
      };
      setRecorded((r) => ({ ...r, [index]: clip }));
    } catch (error) {
      logger.warn(`[guided] a recording failed — ${(error as Error).message}`);
      showGlobalToast("That recording didn't work. Try again.", "error");
    } finally {
      setRecording(null);
      busy.current = false;
    }
  }

  function next() {
    hapticTick();
    if (!lastStep) {
      setStepIndex(stepIndex + 1);
      return;
    }
    if (measure.selfShare > 0) setStage("rating");
    else void finish(null);
  }

  // Whisper reads every recording; the checks add up; the skills move.
  async function finish(finalRating: number | null) {
    setStage("checking");
    let quick = false;
    const clips: (Clip | null)[] = [];
    for (let i = 0; i < measure.tries.length; i++) {
      const rec = recorded[measure.tries[i].step];
      if (!rec) {
        clips.push(null);
        continue;
      }
      const whisper = await transcribeDrillClips(rec.uris);
      if (!whisper) quick = true;
      clips.push({ text: whisper?.text ?? rec.text, words: whisper?.words ?? null, volume: rec.volume, startDelayMs: whisper?.words.length ? Math.max(0, whisper.words[0].startMs) : rec.startDelayMs, spokenMs: rec.spokenMs });
    }
    const scored = scoreGuided(exercise.id, clips, finalRating);
    let change: ProgressChange | null = null;
    try {
      const level = await getDrillLevel("guided");
      const score = scored.score ?? 0;
      change = await recordDrillOutcome({
        drillType: "guided",
        outcome: outcome(score, `${Math.round(score * 100)}% · ${measure.explain}`),
        level,
        contentId: exercise.id,
        skill: exercise.skill,
        source: "measured",
        gate: scored.gate,
        quick,
      });
    } catch (error) {
      logger.error(`[guided] ${exercise.id} failed to score — ${(error as Error).message}`);
      showGlobalToast("Couldn't score that exercise.", "error");
    }
    setResult({ scored, quick, change });
    setStage("result");
  }

  const dots = total + 1;
  const position = stage === "steps" ? stepIndex : total;

  return (
    <ScreenContainer style={styles.container}>
      <Header eyebrow="Guided exercise" title={exercise.title} onBack={onBack} backIcon="close" />
      <View style={styles.dots} accessibilityLabel={stage === "steps" ? `Step ${stepIndex + 1} of ${total}` : "Your number"}>
        {Array.from({ length: dots }, (_, i) => (
          <View key={i} style={[styles.dot, i <= position && styles.dotOn]} />
        ))}
      </View>
      <ScrollView contentContainerStyle={styles.scroll}>
        {stage === "steps" ? (
          <>
            <Card style={styles.card}>
              <Txt variant="caption2" tone="accent" uppercase>
                Step {stepIndex + 1} of {total}
              </Txt>
              <Txt variant="title3">{exercise.steps[stepIndex]}</Txt>
            </Card>
            {thisTry ? (
              <Card style={styles.card}>
                <Txt variant="headline">{thisTry.prompt}</Txt>
                {recording === thisTry.step ? (
                  <PrimaryButton label="Stop" variant="danger" onPress={() => stopRecording(thisTry.step)} />
                ) : (
                  <PrimaryButton
                    label={recorded[thisTry.step] ? "Record again" : "Record"}
                    variant={recorded[thisTry.step] ? "secondary" : "primary"}
                    disabled={recording != null}
                    onPress={() => startRecording(thisTry.step)}
                  />
                )}
                {recorded[thisTry.step] ? (
                  <Txt variant="footnote" tone="secondary">
                    Recorded. You can record it again or go on.
                  </Txt>
                ) : (
                  <Txt variant="footnote" tone="muted">
                    Say it out loud with the button pressed. You can skip it, but then it can't count.
                  </Txt>
                )}
              </Card>
            ) : null}
          </>
        ) : null}

        {stage === "rating" ? (
          <Card style={styles.card}>
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
          </Card>
        ) : null}

        {stage === "checking" ? (
          <Card style={styles.card}>
            <Txt variant="headline">Checking your recordings…</Txt>
            <Txt variant="footnote" tone="secondary">
              A few seconds.
            </Txt>
          </Card>
        ) : null}

        {stage === "result" && result ? (
          <>
            {result.scored.score != null ? (
              <Card style={styles.card}>
                <Txt variant="largeTitle">{Math.round(result.scored.score * 100)}%</Txt>
                <Txt variant="footnote" tone="secondary">
                  {measure.explain}
                </Txt>
              </Card>
            ) : null}
            {!result.scored.gate.passed ? <GateNote gate={result.scored.gate} /> : null}
            {result.scored.parts.length ? (
              <Card style={styles.card}>
                {result.scored.parts.map((p, i) => (
                  <View key={i} style={styles.part}>
                    <Txt variant="subhead">{p.note}</Txt>
                    <Txt variant="caption1" tone="muted">
                      {p.label}
                    </Txt>
                  </View>
                ))}
              </Card>
            ) : null}
            {result.change ? <DrillProgressLine change={result.change} drillTitle={exercise.title} /> : null}
            {result.quick ? (
              <Txt variant="footnote" tone="muted">
                Quick check: some of this was scored from what your phone heard live, so it counts a little less. Download the transcription model (Settings, Coaching & AI) for the full check.
              </Txt>
            ) : null}
          </>
        ) : null}
      </ScrollView>

      {stage === "steps" ? (
        <View style={styles.navRow}>
          {stepIndex > 0 ? (
            <View style={styles.flex}>
              <PrimaryButton label="Back" variant="secondary" disabled={recording != null} onPress={() => setStepIndex(stepIndex - 1)} />
            </View>
          ) : null}
          <View style={styles.flex}>
            <PrimaryButton label={lastStep ? "I've done it" : "Next"} disabled={recording != null} onPress={next} />
          </View>
        </View>
      ) : null}
      {stage === "rating" ? <PrimaryButton label="See my number" disabled={rating == null} onPress={() => finish(rating)} /> : null}
      {stage === "result" ? <PrimaryButton label="Done" onPress={() => onDone(result?.scored.score ?? null)} /> : null}
    </ScreenContainer>
  );
}

const useStyles = makeStyles((t) => ({
  container: { gap: t.space.md },
  dots: { flexDirection: "row", gap: t.space.xs },
  dot: { height: 6, flex: 1, borderRadius: 3, backgroundColor: t.colors.surfaceRaised },
  dotOn: { backgroundColor: t.colors.accent },
  scroll: { flexGrow: 1, justifyContent: "center", gap: t.space.md, paddingBottom: t.space.lg },
  card: { gap: t.space.sm },
  part: { gap: 2 },
  navRow: { flexDirection: "row", gap: t.space.sm },
  flex: { flex: 1 },
  ratingRow: { flexDirection: "row", justifyContent: "space-between", marginTop: t.space.sm },
  ratingChip: { width: 52, height: 52, borderRadius: 26, alignItems: "center", justifyContent: "center", backgroundColor: t.colors.surfaceRaised },
  ratingChipOn: { backgroundColor: t.colors.accent },
}));
