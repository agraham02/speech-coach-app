import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, ScrollView, Text, TextInput, View } from "react-native";
import { File } from "expo-file-system";
import { StatusBar } from "expo-status-bar";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp, NativeStackScreenProps } from "@react-navigation/native-stack";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { RootStackParamList } from "../../navigation";
import { CameraPreview } from "../../components/recording/CameraPreview";
import { Header } from "../../components/common/Header";
import { PrimaryButton } from "../../components/common/PrimaryButton";
import { ScreenContainer } from "../../components/common/ScreenContainer";
import { Txt } from "../../components/common/Txt";
import { useCameraPermissions } from "../../hooks/useCameraPermissions";
import { AUDIO_EXTRACTOR_VERSION } from "../../domain/dsp/audioFeatures";
import { PRESENCE_THRESHOLDS_VERSION } from "../../domain/presenceMetrics";
import { labTest } from "../../domain/signalLab/registry";
import { currentCue, cueSchedule, failedEvaluation, makeResult, secondsLeft, stepDurationMs, STEP_TAIL_MS } from "../../domain/signalLab/runPlan";
import type { LabOutcome, LabStep, StepMeasure, StepMeasures } from "../../domain/signalLab/types";
import { analyzeLabClip } from "../../services/dev/signalLab/analyze";
import { useLabCapture } from "../../services/dev/signalLab/useLabCapture";
import { appVersion } from "../../services/dev/devInfo";
import { annotateLatestResult, saveLabResult } from "../../services/dev/signalLabStore";
import { makeStyles, useTheme } from "../../theme/ThemeProvider";

type Props = NativeStackScreenProps<RootStackParamList, "DevSignalLabRun">;

type Phase = "intro" | "countdown" | "capturing" | "analyzing" | "result";

const COUNTDOWN_SECONDS = 3;

function needsCamera(steps: LabStep[]): boolean {
  return steps.some((s) => s.capture !== "none");
}
function needsAudio(steps: LabStep[]): boolean {
  return steps.some((s) => s.capture === "take" || s.capture === "face_take");
}

// Runs one Signal Lab test: each step is recorded through the real capture
// path, analysed with the real extractors, and the test's evaluator then
// checks the numbers against its bars. The result is saved.
export function SignalLabRunScreen({ route }: Props) {
  const { testId } = route.params;
  const entry = labTest(testId);
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const capture = useLabCapture();
  const permissions = useCameraPermissions();

  const [phase, setPhase] = useState<Phase>("intro");
  const [stepIndex, setStepIndex] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [countdown, setCountdown] = useState(COUNTDOWN_SECONDS);
  const [outcome, setOutcome] = useState<LabOutcome | null>(null);
  const [problems, setProblems] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const [noteSaved, setNoteSaved] = useState(false);
  const measures = useRef<StepMeasures>({});
  const startedAt = useRef(0);
  const stopwatch = useRef<{ startedAt: number | null; ms: number | null }>({ startedAt: null, ms: null });
  const finishing = useRef(false);

  const steps = entry?.def.steps ?? [];
  const step = steps[stepIndex];
  const cameraOn = needsCamera(steps) && phase !== "result";

  // The latest of each, for timers that must not restart when they change.
  const captureRef = useRef(capture);
  captureRef.current = capture;

  // Release the camera and any recording when the screen goes.
  useEffect(
    () => () => {
      void captureRef.current.cancel();
    },
    [],
  );

  const finishRun = useCallback(() => {
    if (!entry) return;
    let result: LabOutcome;
    try {
      result = entry.evaluate(measures.current);
    } catch (error) {
      result = failedEvaluation(error);
    }
    saveLabResult(makeResult(entry.def.id, result, { appVersion: appVersion(), extractorVersion: AUDIO_EXTRACTOR_VERSION, thresholdsVersion: PRESENCE_THRESHOLDS_VERSION }));
    setOutcome(result);
    setPhase("result");
  }, [entry]);

  const finishStep = useCallback(async () => {
    if (!step || finishing.current) return;
    finishing.current = true;
    setPhase("analyzing");
    const found: string[] = [];
    try {
      const cap = step.capture === "none" ? { uri: null, durationMs: 0, face: null, faceWidth: null } : await capture.end();
      const measure: StepMeasure = { stepId: step.id, durationMs: cap.durationMs };
      if (cap.face) measure.face = cap.face;
      if (cap.faceWidth != null) measure.faceWidth = cap.faceWidth;
      if (step.stopwatch && stopwatch.current.ms != null) measure.stopwatchMs = stopwatch.current.ms;
      if (step.cues) measure.cues = cueSchedule(step);
      if (cap.uri) {
        const analysis = await analyzeLabClip(cap.uri, { words: step.words, engines: step.engines });
        if (analysis.audio) measure.audio = analysis.audio;
        if (analysis.words) measure.words = analysis.words;
        if (analysis.engines) measure.engines = analysis.engines;
        found.push(...analysis.problems);
        try {
          new File(cap.uri).delete();
        } catch {
          // A leftover test clip in the cache is harmless.
        }
      }
      measures.current = { ...measures.current, [step.id]: measure };
    } catch (error) {
      found.push(`${step.title}: ${(error as Error).message}`);
    }
    setProblems((p) => [...p, ...found]);
    finishing.current = false;
    if (stepIndex + 1 < steps.length) {
      setStepIndex(stepIndex + 1);
      setPhase("intro");
    } else {
      finishRun();
    }
  }, [step, stepIndex, steps.length, capture, finishRun]);

  const beginCapture = useCallback(() => {
    if (!step) return;
    try {
      stopwatch.current = { startedAt: null, ms: null };
      if (step.capture !== "none") capture.begin(step.capture);
    } catch (error) {
      setProblems((p) => [...p, (error as Error).message]);
    }
    startedAt.current = Date.now();
    setElapsed(0);
    setPhase("capturing");
    if (step.capture === "none") void finishStep();
  }, [step, capture, finishStep]);

  const beginRef = useRef(beginCapture);
  beginRef.current = beginCapture;
  const finishRef = useRef(finishStep);
  finishRef.current = finishStep;

  // The 3-2-1 before a step starts.
  useEffect(() => {
    if (phase !== "countdown") return;
    let left = COUNTDOWN_SECONDS;
    setCountdown(left);
    const timer = setInterval(() => {
      left -= 1;
      setCountdown(left);
      if (left <= 0) {
        clearInterval(timer);
        beginRef.current();
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [phase]);

  // The clock while a step records; a timed step ends itself.
  useEffect(() => {
    if (phase !== "capturing" || !step) return;
    const timer = setInterval(() => {
      const now = Date.now() - startedAt.current;
      setElapsed(now);
      if (now >= stepDurationMs(step)) {
        clearInterval(timer);
        void finishRef.current();
      }
    }, 100);
    return () => clearInterval(timer);
  }, [phase, step]);

  function tapStopwatch() {
    const sw = stopwatch.current;
    if (sw.startedAt == null) {
      stopwatch.current = { startedAt: Date.now(), ms: null };
      setElapsed((e) => e + 1);
    } else {
      stopwatch.current = { startedAt: sw.startedAt, ms: Date.now() - sw.startedAt };
      setTimeout(() => void finishRef.current(), STEP_TAIL_MS);
    }
  }

  async function leave() {
    await capture.cancel();
    navigation.goBack();
  }

  if (!entry || !step) {
    return (
      <ScreenContainer>
        <Header title="Test not found" onBack={() => navigation.goBack()} />
      </ScreenContainer>
    );
  }

  // The result: a solid screen, no camera.
  if (phase === "result" && outcome) {
    return (
      <ScreenContainer>
        <Header eyebrow="Signal Lab" title={entry.def.title} onBack={() => navigation.goBack()} backIcon="close" />
        <ScrollView contentContainerStyle={styles.resultScroll} keyboardShouldPersistTaps="handled">
          <Txt variant="title2">{outcome.pass === true ? "Passed" : outcome.pass === false ? "Failed" : "Couldn't say"}</Txt>
          <Txt variant="subhead" tone="secondary">
            {outcome.summary}
          </Txt>
          {outcome.checks.map((check) => (
            <View key={check.label} style={styles.check}>
              <Txt variant="footnote" weight="600">
                {check.pass === true ? "Pass" : check.pass === false ? "Fail" : "Info"} · {check.label}
              </Txt>
              <Txt variant="footnote" tone="secondary">
                {check.value}
                {check.bar ? ` (${check.bar})` : ""}
              </Txt>
            </View>
          ))}
          {problems.length > 0 ? (
            <View style={styles.check}>
              <Txt variant="footnote" weight="600">
                What went wrong on the way
              </Txt>
              {problems.map((p, i) => (
                <Txt key={i} variant="footnote" tone="secondary">
                  {p}
                </Txt>
              ))}
            </View>
          ) : null}
          <TextInput
            style={[styles.note, { color: colors.textPrimary, backgroundColor: colors.surfaceRaised }]}
            placeholder="A note about this run (phone on a stand, noisy room...)"
            placeholderTextColor={colors.textMuted}
            value={note}
            onChangeText={(t) => {
              setNote(t);
              setNoteSaved(false);
            }}
            multiline
          />
          <PrimaryButton
            label={noteSaved ? "Note saved" : "Save note"}
            variant="ghost"
            disabled={!note.trim() || noteSaved}
            onPress={() => {
              annotateLatestResult(entry.def.id, note.trim());
              setNoteSaved(true);
            }}
          />
          <PrimaryButton label="Done" onPress={() => navigation.goBack()} />
        </ScrollView>
      </ScreenContainer>
    );
  }

  if (needsCamera(steps) && !permissions.hasAllPermissions && needsAudio(steps)) {
    return (
      <ScreenContainer>
        <Header eyebrow="Signal Lab" title={entry.def.title} onBack={() => navigation.goBack()} />
        <View style={styles.centered}>
          <Txt variant="subhead" tone="secondary">
            This test needs the camera and the microphone.
          </Txt>
          <PrimaryButton label="Allow camera and microphone" onPress={() => void permissions.requestCameraPermission()} />
        </View>
      </ScreenContainer>
    );
  }

  const cue = phase === "capturing" ? currentCue(step, elapsed) : null;
  const stopwatchRunning = step.stopwatch && stopwatch.current.startedAt != null && stopwatch.current.ms == null;

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      {cameraOn ? <CameraPreview cameraRef={capture.cameraRef} isActive onFaceFrame={capture.onFaceFrame} audio={needsAudio(steps)} /> : null}
      <View style={[styles.top, { paddingTop: insets.top + 8 }]}>
        <Text style={styles.small}>
          {entry.def.title} · step {stepIndex + 1} of {steps.length}
        </Text>
        <Text style={styles.close} onPress={leave} accessibilityRole="button" accessibilityLabel="Close">
          Close
        </Text>
      </View>

      <View style={[styles.panel, { paddingBottom: insets.bottom + 16 }]}>
        <Text style={styles.title}>{step.title}</Text>
        <Text style={styles.body}>{step.instruction}</Text>
        {step.script ? (
          <ScrollView style={styles.script} contentContainerStyle={styles.scriptContent}>
            <Text style={styles.scriptText}>{step.script}</Text>
          </ScrollView>
        ) : null}

        {phase === "intro" ? (
          <PrimaryButton label={`Start (${step.seconds}s)`} onPress={() => (step.capture === "none" ? beginCapture() : setPhase("countdown"))} />
        ) : null}
        {phase === "countdown" ? <Text style={styles.big}>{countdown > 0 ? countdown : "Go"}</Text> : null}
        {phase === "capturing" ? (
          <>
            {cue ? <Text style={styles.cue}>{cue.label}</Text> : null}
            <Text style={styles.big}>{secondsLeft(step, elapsed)}</Text>
            {step.stopwatch ? (
              <PrimaryButton label={stopwatchRunning ? "Stop timing" : stopwatch.current.ms != null ? "Finishing..." : "Start timing"} onPress={tapStopwatch} />
            ) : (
              <PrimaryButton label="Stop now" variant="ghost" onPress={() => void finishStep()} />
            )}
          </>
        ) : null}
        {phase === "analyzing" ? (
          <View style={styles.analyzing}>
            <ActivityIndicator color="#fff" />
            <Text style={styles.body}>Analysing...</Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  root: { flex: 1, backgroundColor: "#000" },
  top: { position: "absolute", top: 0, left: 0, right: 0, flexDirection: "row", justifyContent: "space-between", paddingHorizontal: t.layout.gutter, backgroundColor: "rgba(0,0,0,0.45)", paddingBottom: 10 },
  small: { color: "#fff", fontSize: 14 },
  close: { color: "#fff", fontSize: 15, fontWeight: "600" },
  panel: { position: "absolute", left: 0, right: 0, bottom: 0, maxHeight: "62%", backgroundColor: "rgba(0,0,0,0.72)", paddingHorizontal: t.layout.gutter, paddingTop: 16, gap: 10 },
  title: { color: "#fff", fontSize: 20, fontWeight: "700" },
  body: { color: "rgba(255,255,255,0.85)", fontSize: 15, lineHeight: 21 },
  script: { maxHeight: 190 },
  scriptContent: { paddingVertical: 4 },
  scriptText: { color: "#fff", fontSize: 18, lineHeight: 26 },
  big: { color: "#fff", fontSize: 54, fontWeight: "700", textAlign: "center" },
  cue: { color: "#FFE55C", fontSize: 24, fontWeight: "700", textAlign: "center" },
  analyzing: { flexDirection: "row", alignItems: "center", gap: 10, justifyContent: "center", paddingVertical: 12 },
  centered: { flex: 1, justifyContent: "center", gap: t.space.md },
  resultScroll: { gap: t.space.md, paddingBottom: 48 },
  check: { gap: 2 },
  note: { minHeight: 72, borderRadius: t.radius.md, padding: t.space.md, fontSize: 15, textAlignVertical: "top" },
}));
