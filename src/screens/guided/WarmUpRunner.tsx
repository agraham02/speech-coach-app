import { useEffect, useMemo, useRef, useState } from "react";
import { View } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";
import { ScreenContainer } from "../../components/common/ScreenContainer";
import { Header } from "../../components/common/Header";
import { Card } from "../../components/common/Card";
import { Txt } from "../../components/common/Txt";
import { PrimaryButton } from "../../components/common/PrimaryButton";
import { BreathAura } from "../../components/common/BreathAura";
import { CountdownRing } from "../../components/common/CountdownRing";
import { GateNote } from "../../components/celebrate/GateNote";
import { DrillProgressLine } from "../../components/celebrate/DrillProgressLine";
import { showGlobalToast } from "../../components/common/ToastProvider";
import type { WarmUp } from "../../content/drillContent";
import { outcome } from "../../domain/drills/drillSpecs";
import { breathRounds, warmUpTargets } from "../../domain/difficulty/knobs";
import { scoreBreathWarmUp, scoreMeasuredWarmUp, type MeasuredWindow, type WarmUpScore, type WarmUpTargets } from "../../domain/warmups/warmUpMeasures";
import { getDrillLevel, recordDrillOutcome, type ProgressChange } from "../../services/db/progressRepo";
import { createWarmUpCapture, type WarmUpCapture } from "../../services/audio/warmUpRecorder";
import { extractOffThread } from "../../services/audio/dspRuntime";
import { tick as hapticTick } from "../../utils/haptics";
import { logger } from "../../utils/logger";
import { duration } from "../../theme/motion";
import { makeStyles, useTheme } from "../../theme/ThemeProvider";

// A warm-up, step by step on a timer, with a number at the end (plan 3c.2).
// Warm-ups with a sound to measure (the hiss, pa-ta-ka, the siren) record the
// whole warm-up in one piece and read each measured step's window of it. The
// breathing ones can't be heard, so they count the rounds you finished.

const RING_WRAP = 300;

type Stage = "intro" | "running" | "checking" | "result";

export function WarmUpRunner({ warmUp, onDone, onBack }: { warmUp: WarmUp; onDone: (score: number | null) => void; onBack: () => void }) {
  const styles = useStyles();
  const { colors } = useTheme();
  // Its own difficulty (task 3d.5): a longer hiss, a faster pa-ta-ka, a wider
  // siren, more breathing rounds as it rises.
  const [level, setLevel] = useState<number | null>(null);
  useEffect(() => {
    getDrillLevel("warmup", warmUp.id).then(setLevel).catch(() => setLevel(1));
  }, [warmUp.id]);
  const targets: WarmUpTargets = warmUpTargets(level ?? 1);
  const measured = warmUp.steps.some((s) => s.measure);
  const rounds = measured ? (warmUp.rounds ?? 1) : breathRounds(warmUp.rounds ?? 1, level ?? 1);
  const sequence = useMemo(
    () => Array.from({ length: rounds }, (_, round) => warmUp.steps.map((step) => ({ step: step.measure === "hiss" ? { ...step, seconds: targets.hissSeconds } : step, round }))).flat(),
    [warmUp, rounds, targets.hissSeconds],
  );
  const totalSeconds = sequence.reduce((sum, s) => sum + s.step.seconds, 0);
  const [stage, setStage] = useState<Stage>("intro");
  const [index, setIndex] = useState(0);
  const [tick, setTick] = useState<{ index: number; left: number } | null>(null);
  const [result, setResult] = useState<{ scored: WarmUpScore; change: ProgressChange | null } | null>(null);
  const capture = useRef<WarmUpCapture | null>(null);
  const windows = useRef<Map<number, { startMs: number; endMs: number }>>(new Map());
  const skipped = useRef<Set<number>>(new Set());
  const starting = useRef(false);
  const mounted = useRef(true);
  const current = sequence[index];

  // Stop the microphone if the screen closes mid-warm-up.
  useEffect(
    () => () => {
      mounted.current = false;
      void capture.current?.stop();
      capture.current = null;
    },
    [],
  );

  // Counts down against a deadline rather than by ticks, so it stays right if
  // the app is briefly backgrounded or the JS thread stalls.
  useEffect(() => {
    if (stage !== "running") return;
    if (index >= sequence.length) {
      void finish();
      return;
    }
    const { step } = sequence[index];
    const deadline = Date.now() + step.seconds * 1000;
    if (capture.current) windows.current.set(index, { startMs: capture.current.elapsedMs(), endMs: Number.POSITIVE_INFINITY });
    hapticTick();
    const timer = setInterval(() => {
      const left = Math.ceil((deadline - Date.now()) / 1000);
      if (left <= 0) {
        clearInterval(timer);
        advance();
      } else {
        setTick({ index, left });
      }
    }, 250);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, stage, sequence]);

  function advance() {
    const w = windows.current.get(index);
    if (w && capture.current) w.endMs = capture.current.elapsedMs();
    setIndex((i) => i + 1);
  }

  function skip() {
    skipped.current.add(index);
    advance();
  }

  async function start() {
    if (starting.current) return;
    starting.current = true;
    if (measured) {
      const c = createWarmUpCapture();
      const ready = await c.start();
      // Closed while the microphone was starting: stop it, and go no further.
      if (!mounted.current) {
        void c.stop();
        return;
      }
      if (ready === "ready") capture.current = c;
      else showGlobalToast(ready === "denied" ? "Without the microphone this warm-up runs, but it can't be scored." : "The microphone didn't start, so this warm-up won't be scored.", "info");
    }
    setStage("running");
  }

  async function finish() {
    setStage("checking");
    let scored: WarmUpScore;
    if (measured) {
      const audio = capture.current ? await capture.current.stop().catch(() => null) : null;
      capture.current = null;
      if (!audio) {
        scored = { score: null, gate: { passed: false, kind: "not_checked", reason: "The microphone wasn't on, so this warm-up wasn't scored." }, parts: [] };
      } else {
        try {
          const { features } = await extractOffThread(audio.waveform, audio.sampleRate);
          const measuredWindows: MeasuredWindow[] = [];
          sequence.forEach((s, i) => {
            const w = windows.current.get(i);
            if (s.step.measure && w) measuredWindows.push({ measure: s.step.measure, startMs: w.startMs, endMs: Number.isFinite(w.endMs) ? w.endMs : features.durationMs });
          });
          scored = scoreMeasuredWarmUp(features, measuredWindows, targets);
        } catch (error) {
          logger.warn(`[warm-up] couldn't measure ${warmUp.id} — ${(error as Error).message}`);
          scored = { score: null, gate: { passed: false, kind: "not_checked", reason: "The recording couldn't be measured, so this warm-up wasn't scored." }, parts: [] };
        }
      }
    } else {
      let finished = 0;
      for (let r = 0; r < rounds; r++) {
        const inRound = sequence.map((s, i) => ({ s, i })).filter(({ s }) => s.round === r);
        if (inRound.every(({ i }) => !skipped.current.has(i))) finished++;
      }
      scored = scoreBreathWarmUp(finished, rounds);
    }
    let change: ProgressChange | null = null;
    try {
      const score = scored.score ?? 0;
      change = await recordDrillOutcome({
        drillType: "warmup",
        outcome: outcome(score, `${Math.round(score * 100)}% · ${warmUp.title}`),
        level: level ?? 1,
        contentId: warmUp.id,
        // A breath you can't hear is your own count.
        source: measured ? "measured" : "self",
        gate: scored.gate,
      });
    } catch (error) {
      logger.error(`[warm-up] ${warmUp.id} failed to score — ${(error as Error).message}`);
    }
    setResult({ scored, change });
    setStage("result");
  }

  const breathing = current?.step.phase != null;
  const remaining = current ? (tick?.index === index ? tick.left : current.step.seconds) : 0;

  return (
    <ScreenContainer style={styles.container}>
      <Header eyebrow="Warm-up" title={warmUp.title} onBack={onBack} backIcon="close" />
      <View style={styles.center}>
        {stage === "intro" ? (
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
              {measured ? " · the microphone listens" : ""}
            </Txt>
          </Card>
        ) : stage === "running" && current ? (
          <View style={styles.activeStep}>
            <View style={styles.ringWrap}>
              {breathing ? (
                <BreathAura size={RING_WRAP} color={colors.skill.confidence.fg} phase={current.step.phase} fill={current.step.fill} seconds={current.step.seconds} runKey={index} />
              ) : null}
              <CountdownRing size={160} strokeWidth={10} durationMs={current.step.seconds * 1000} runKey={index} color={colors.accent}>
                <Txt variant="largeTitle">{remaining}</Txt>
              </CountdownRing>
            </View>
            <Animated.View key={index} entering={FadeIn.duration(duration.base)} style={styles.stepText}>
              <Txt variant="title2" align="center">
                {current.step.label}
              </Txt>
              <Txt variant="callout" tone="secondary" align="center">
                {current.step.detail}
              </Txt>
            </Animated.View>
            {rounds > 1 ? (
              <View style={styles.roundDots} accessibilityLabel={`Round ${current.round + 1} of ${rounds}`}>
                {Array.from({ length: rounds }, (_, i) => (
                  <View key={i} style={[styles.roundDot, i <= current.round && styles.roundDotOn]} />
                ))}
              </View>
            ) : (
              <Txt variant="footnote" tone="muted">
                {`Step ${index + 1} of ${sequence.length}`}
              </Txt>
            )}
          </View>
        ) : stage === "checking" ? (
          <Txt variant="title3" align="center">
            Checking…
          </Txt>
        ) : result ? (
          <View style={styles.resultBlock}>
            {result.scored.score != null ? (
              <Card style={styles.list}>
                <Txt variant="largeTitle">{Math.round(result.scored.score * 100)}%</Txt>
                {result.scored.parts.map((p, i) => (
                  <View key={i} style={styles.listRow}>
                    <Txt variant="subhead">{p.note}</Txt>
                    <Txt variant="caption1" tone="muted">
                      {p.label}
                    </Txt>
                  </View>
                ))}
              </Card>
            ) : null}
            {!result.scored.gate.passed ? <GateNote gate={result.scored.gate} /> : null}
            {result.change ? <DrillProgressLine change={result.change} drillTitle={warmUp.title} /> : null}
          </View>
        ) : null}
      </View>
      {stage === "intro" ? <PrimaryButton label="Start" onPress={start} disabled={level == null} /> : null}
      {stage === "running" ? <PrimaryButton label="Skip" variant="secondary" onPress={skip} /> : null}
      {stage === "result" ? <PrimaryButton label="Done" onPress={() => onDone(result?.scored.score ?? null)} /> : null}
    </ScreenContainer>
  );
}

const useStyles = makeStyles((t) => ({
  container: { gap: t.space.md },
  center: { flex: 1, justifyContent: "center" },
  list: { gap: t.space.md },
  listRow: { gap: 2 },
  resultBlock: { gap: t.space.md },
  activeStep: { alignItems: "center", gap: t.space.md },
  ringWrap: { width: RING_WRAP, height: RING_WRAP, alignItems: "center", justifyContent: "center" },
  stepText: { alignItems: "center", gap: t.space.xs },
  roundDots: { flexDirection: "row", gap: t.space.sm },
  roundDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: t.colors.surfaceRaised },
  roundDotOn: { backgroundColor: t.colors.accent },
}));
