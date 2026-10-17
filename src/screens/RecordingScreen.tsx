import { useEffect, useRef, useState } from "react";
import { GuideTip, TourTarget } from "../components/common/GuideTip";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { Camera as VisionCamera } from "react-native-vision-camera";
import type { RootStackParamList } from "../navigation";
import { PrimaryButton } from "../components/common/PrimaryButton";
import { CountdownRing } from "../components/common/CountdownRing";
import { CameraPreview } from "../components/recording/CameraPreview";
import { FramingGuideOverlay } from "../components/recording/FramingGuideOverlay";
import { PrepOverlay } from "../components/recording/PrepOverlay";
import { PromptBanner } from "../components/recording/PromptBanner";
import { RecordBlindOverlay } from "../components/recording/RecordBlindOverlay";
import { RecordBlindToggle } from "../components/recording/RecordBlindToggle";
import { RecordButton } from "../components/recording/RecordButton";
import { ScriptTeleprompterOverlay } from "../components/recording/ScriptTeleprompterOverlay";
import { WarmUpOverlay } from "../components/recording/WarmUpOverlay";
import { useCameraPermissions } from "../hooks/useCameraPermissions";
import { useCountdownTimer } from "../hooks/useCountdownTimer";
import { useFaceDetection } from "../hooks/useFaceDetection";
import { useHapticFaceWarning } from "../hooks/useHapticFaceWarning";
import { useRecordingTimer } from "../hooks/useRecordingTimer";
import {
  getPrepPhaseSettings,
  getPrepSettingsManuallySet,
  getRecordBlindPref,
  getRecordingDurationManuallySet,
  getRecordingDurationSettings,
  getWarmUpEnabled,
  setRecordBlindPref,
} from "../services/prefs/prefsStore";
import { resolvePrepDurationSeconds, resolveRecordingDurationSeconds } from "../domain/recordingSettings";
import { getWarmUpSteps } from "../domain/warmUpRoutine";
import {
  curriculumLevelToDurationSeconds,
  curriculumLevelToPrepSeconds,
  curriculumLevelToWarmUpIntensity,
} from "../domain/curriculum";
import { getEffectiveCurriculumLevel } from "../services/db/curriculumRepo";
import { persistRecording } from "../services/storage/videoStorage";
import { logger } from "../utils/logger";
import { StatusBar } from "expo-status-bar";
import { stashPresenceTimeline } from "../services/pipeline/presenceTimelineStore";
import { formatDuration } from "../utils/dateUtils";
import { darkColors as colors, spacing, typography, font } from "../theme/theme";

type Props = NativeStackScreenProps<RootStackParamList, "Recording">;

type Stage = "warmup" | "prep" | "idle" | "recording";

// A speech recording stops on its own only at twice its target length.
const SCRIPT_SOFT_CAP = 2;
// Room kept below the teleprompter for the record button and its hint.
const SCRIPT_CONTROLS_HEIGHT = 190;

export function RecordingScreen({ route, navigation }: Props) {
  const subject = route.params;
  const isScript = subject.kind === "script";
  const prepText = isScript ? `Reading: ${subject.script.title}` : subject.prompt.text;
  const insets = useSafeAreaInsets();
  const cameraRef = useRef<VisionCamera>(null);
  const { hasAllPermissions, hasCameraPermission, hasMicrophonePermission, requestCameraPermission, requestMicrophonePermission } =
    useCameraPermissions();
  const { faceDetected, framingStatus, onFaceFrame, startTimeline, stopTimeline } = useFaceDetection();
  const { elapsedSeconds, start, stop } = useRecordingTimer();
  const [recordBlind, setRecordBlind] = useState(!isScript && getRecordBlindPref());
  const [isFinishing, setIsFinishing] = useState(false);
  const stoppingRef = useRef(false);
  // Set while a take is being thrown away via "Restart" — the cancel
  // surfaces as a recording error, which shouldn't alert in that case.
  const restartingRef = useRef(false);

  // The curriculum's level-driven prep applies unless the user has
  // explicitly configured their own prep phase in the Session Options sheet
  // — same manual-always-wins precedent as targetDurationSeconds below. Auto
  // prep is always "on": Level 1-2 give a full, fixed window while the habit
  // is new; Level 3+ shrinks and randomizes it (see curriculum.ts's
  // LEVEL_PREP_RANGE) since less-rehearsed, spontaneous speaking is the
  // point of leveling up.
  // Lesson / daily-plan reps carry their own prep and length (from the
  // adaptive difficulty), and their plan already includes a warm-up.
  const fromPractice = subject.kind === "prompt" && !!subject.practice;
  const lessonPrep = subject.kind === "prompt" ? subject.prepSeconds : undefined;
  const [prepEnabled] = useState(() => {
    // A speech is studied on its own screen first — no countdown that hides it.
    if (isScript) return false;
    if (lessonPrep != null) return lessonPrep > 0;
    return getPrepSettingsManuallySet() ? getPrepPhaseSettings().enabled : true;
  });
  const isFeeling = subject.kind === "prompt" && !!subject.feeling;
  const [warmUpEnabled] = useState(() => !fromPractice && !isScript && !isFeeling && getWarmUpEnabled());
  // Warm-up length scales with curriculum level — harder levels get a
  // longer, more thorough warm-up (see curriculum.ts's LEVEL_WARM_UP_INTENSITY
  // table and its judgment-call note).
  const [warmUpSteps] = useState(() => getWarmUpSteps(curriculumLevelToWarmUpIntensity(getEffectiveCurriculumLevel().level)));
  // Concise Mode's duration is already resolved (from prefs) by the time it
  // reaches here as subject.conciseSeconds — it bypasses the general
  // recording-duration setting entirely, same as Script Practice bypassing
  // it for the script's own word count (see scriptTypes.ts).
  const isConcise = subject.kind === "prompt" && !!subject.conciseSeconds;
  const [targetDurationSeconds] = useState(() => {
    if (isScript) return subject.script.targetDurationSeconds;
    if (subject.kind === "prompt" && subject.conciseSeconds) return subject.conciseSeconds;
    if (subject.kind === "prompt" && subject.targetSeconds) return subject.targetSeconds;
    // The curriculum's level-driven duration applies unless the user has
    // explicitly set their own recording length in the Session Options
    // sheet — an explicit manual choice always wins over the auto
    // suggestion (see curriculum.ts's plan notes; matches how a manual
    // curriculum-level override also always wins over the auto level).
    if (!getRecordingDurationManuallySet()) {
      return curriculumLevelToDurationSeconds(getEffectiveCurriculumLevel().level);
    }
    return resolveRecordingDurationSeconds(getRecordingDurationSettings());
  });
  const [prepDurationSeconds] = useState(() => {
    if (!prepEnabled) return 0;
    if (lessonPrep != null) return lessonPrep;
    if (getPrepSettingsManuallySet()) return resolvePrepDurationSeconds(getPrepPhaseSettings());
    return curriculumLevelToPrepSeconds(getEffectiveCurriculumLevel().level);
  });
  const [stage, setStage] = useState<Stage>(() => {
    if (warmUpEnabled) return "warmup";
    return prepEnabled ? "prep" : "idle";
  });

  useHapticFaceWarning(stage === "recording", faceDetected);

  function handleToggleRecordBlind(value: boolean) {
    setRecordBlind(value);
    setRecordBlindPref(value);
  }

  function advanceFromWarmUp() {
    setStage(prepEnabled ? "prep" : "idle");
  }

  function beginRecording() {
    if (!cameraRef.current) return;
    stoppingRef.current = false;
    setStage("recording");
    start();
    startTimeline();
    cameraRef.current.startRecording({
      // Forces a uniform mp4/H.264 container on both platforms (Android
      // already defaults here; iOS defaults to .mov) — required so
      // react-native-audio-api's decodeAudioData (used by the on-device DSP
      // pipeline) can reliably decode the recording's audio track, since its
      // documented format support is mp3/wav/mp4/m4a/aac, not mov.
      fileType: "mp4",
      videoCodec: "h264",
      onRecordingFinished: async (video) => {
        stop();
        setIsFinishing(true);
        try {
          const videoUri = video.path.startsWith("file://") ? video.path : `file://${video.path}`;
          // Persisted under a temp name (not a session id yet — nothing's
          // saved to the DB until the user confirms on the Preview screen).
          const persistedUri = await persistRecording(videoUri, `preview-${Date.now()}`);
          stashPresenceTimeline(persistedUri, stopTimeline());
          const durationSecondsLocal = Math.round(video.duration);

          navigation.replace("Preview", {
            ...subject,
            videoUri: persistedUri,
            durationSecondsLocal,
          });
        } catch (error) {
          setIsFinishing(false);
          Alert.alert("Couldn't save recording", (error as Error).message);
        }
      },
      onRecordingError: (error) => {
        setStage("idle");
        stop();
        stopTimeline();
        if (restartingRef.current) {
          restartingRef.current = false;
          return;
        }
        Alert.alert("Recording error", error.message);
      },
    });
  }

  // Throws the current take away and goes back to "ready" (no warm-up or
  // prep again) — a bad start no longer means finishing and discarding.
  async function handleRestartTake() {
    if (!cameraRef.current || stoppingRef.current) return;
    restartingRef.current = true;
    stoppingRef.current = true;
    try {
      await cameraRef.current.cancelRecording();
    } catch (error) {
      restartingRef.current = false;
      logger.error(`[recording] restart failed — ${(error as Error).message}`);
    }
    stop();
    setStage("idle");
  }

  async function handleStop() {
    if (!cameraRef.current || stoppingRef.current) return;
    stoppingRef.current = true;
    await cameraRef.current.stopRecording();
  }

  const { remainingSeconds: prepRemaining, skip: skipPrep } = useCountdownTimer(
    prepDurationSeconds,
    beginRecording,
    stage === "prep",
  );

  const remainingRecordingSeconds = Math.max(0, targetDurationSeconds - elapsedSeconds);
  // A speech's target is a guide, not a limit — reading with the marked
  // pauses runs long. Only a generous cap stops it on its own.
  const scriptCapSeconds = targetDurationSeconds * SCRIPT_SOFT_CAP;

  useEffect(() => {
    if (stage !== "recording") return;
    if (isScript ? elapsedSeconds >= scriptCapSeconds : remainingRecordingSeconds === 0) {
      handleStop();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, remainingRecordingSeconds, elapsedSeconds]);

  if (!hasAllPermissions) {
    return (
      <View style={[styles.permissionContainer, { paddingTop: insets.top + spacing.lg, paddingBottom: insets.bottom + spacing.lg }]}>
        <Pressable
          onPress={() => navigation.goBack()}
          style={styles.closeButton}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Close"
        >
          <Ionicons name="close" size={24} color={colors.textPrimary} />
        </Pressable>
        <View style={styles.permissionBody}>
          <Ionicons name="videocam-outline" size={48} color={colors.accent} />
          <Text style={styles.permissionTitle}>Camera & microphone access</Text>
          <Text style={styles.permissionText}>
            Tono needs both to record your practice sessions. Nothing is uploaded until you finish recording.
          </Text>
        </View>
        <PrimaryButton
          label={hasCameraPermission ? "Grant Microphone Access" : "Grant Camera Access"}
          onPress={hasCameraPermission ? requestMicrophonePermission : requestCameraPermission}
        />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Camera is always dark, so keep the status bar light. */}
      <StatusBar style="light" />
      <CameraPreview
        cameraRef={cameraRef}
        isActive
        onFaceFrame={onFaceFrame}
      />

      {stage === "warmup" && (
        <WarmUpOverlay
          steps={warmUpSteps}
          onComplete={advanceFromWarmUp}
          onClose={() => navigation.goBack()}
          topInset={insets.top + spacing.sm}
        />
      )}

      {stage === "prep" && (
        <PrepOverlay
          promptText={prepText}
          notes={subject.kind === "prompt" ? subject.prepNotes : undefined}
          remainingSeconds={prepRemaining}
          onSkip={skipPrep}
          onClose={() => navigation.goBack()}
          topInset={insets.top + spacing.sm}
        />
      )}

      {stage === "idle" && !isScript && (
        <View style={[styles.topBar, { top: insets.top + spacing.sm }]}>
          <Pressable
            onPress={() => navigation.goBack()}
            style={styles.iconButton}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Close"
          >
            <Ionicons name="close" size={22} color={colors.textPrimary} />
          </Pressable>
          <View style={styles.promptBannerSlot}>
            <PromptBanner text={subject.prompt.text} />
          </View>
        </View>
      )}

      {stage === "idle" && !isScript && <FramingGuideOverlay status={framingStatus} />}

      {stage === "recording" && !isScript && recordBlind && (
        <RecordBlindOverlay promptText={subject.prompt.text} remainingSeconds={remainingRecordingSeconds} targetSeconds={targetDurationSeconds} />
      )}

      {/* Show or hide the preview mid-take. Above the blind overlay so it
          stays reachable; dimmed while blind so it doesn't draw the eye. */}
      {stage === "recording" && !isScript && !isFinishing && (
        <Pressable
          onPress={() => handleToggleRecordBlind(!recordBlind)}
          style={[styles.iconButton, styles.previewToggle, { top: insets.top + spacing.sm }, recordBlind && styles.previewToggleBlind]}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel={recordBlind ? "Show preview" : "Hide preview"}
        >
          <Ionicons name={recordBlind ? "eye-off-outline" : "eye-outline"} size={22} color={colors.textPrimary} />
        </Pressable>
      )}

      {/* Script Practice replaces the spontaneous-mode prompt banner/framing
          guide/blind mode with a scrolling teleprompter for both idle (static,
          at the top of the script) and recording (auto-scrolling to the
          script's own pace) — reading along is the point, so there's no
          "blind" variant for this mode. */}
      {isScript && (stage === "idle" || stage === "recording") && (
        <View style={styles.teleprompterWrap} pointerEvents="box-none">
          {stage === "idle" && (
            <Pressable
              onPress={() => navigation.goBack()}
              style={[styles.iconButton, styles.teleprompterCloseButton, { top: insets.top + spacing.sm }]}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel="Close"
            >
              <Ionicons name="close" size={22} color={colors.textPrimary} />
            </Pressable>
          )}
          <ScriptTeleprompterOverlay
            script={subject.script}
            markLevel={subject.cuesEnabled ? subject.markLevel ?? "full" : "none"}
            isRecording={stage === "recording"}
            bottomInset={insets.bottom + SCRIPT_CONTROLS_HEIGHT}
          />
        </View>
      )}

      {stage !== "warmup" && stage !== "prep" && (
        <View style={[styles.bottomBar, { paddingBottom: insets.bottom + spacing.lg }]}>
          {stage === "idle" && !isScript && (
            <TourTarget id="recording.blind">
              <RecordBlindToggle value={recordBlind} onValueChange={handleToggleRecordBlind} />
            </TourTarget>
          )}
          {stage === "recording" && !isFinishing ? (
            <Pressable
              onPress={handleRestartTake}
              style={styles.restartButton}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel="Restart take"
            >
              <Ionicons name="refresh" size={20} color={colors.textPrimary} />
              <Text style={styles.restartText}>Restart</Text>
            </Pressable>
          ) : null}
          <TourTarget id="recording.record" style={styles.recordButtonGroup}>
            {/* The ring only appears once recording starts (and blind mode isn't
                hiding it), so it never reads as decoration on the idle button —
                it's specifically the countdown, made visible. */}
            {stage === "recording" && !recordBlind && !isScript ? (
              <CountdownRing size={120} strokeWidth={6} durationMs={targetDurationSeconds * 1000} color={colors.danger} trackColor="rgba(255,255,255,0.15)">
                <RecordButton isRecording disabled={isFinishing} onPress={handleStop} />
              </CountdownRing>
            ) : (
              <RecordButton
                isRecording={stage === "recording"}
                disabled={isFinishing}
                onPress={stage === "recording" ? handleStop : beginRecording}
              />
            )}
            <Text style={[styles.recordHint, isConcise && stage === "recording" && styles.recordHintUrgent]}>
              {isFinishing
                ? "Saving…"
                : stage !== "recording"
                  ? isConcise
                    ? `One point. ${targetDurationSeconds}s.`
                    : "Tap to start"
                  : isScript
                    ? `${formatDuration(elapsedSeconds)} · about ${formatDuration(targetDurationSeconds)} · tap to stop`
                    : recordBlind
                      ? "Tap to stop"
                      : `${formatDuration(remainingRecordingSeconds)} left · tap to stop`}
            </Text>
          </TourTarget>
        </View>
      )}
      {/* Once the camera is ready — not over the warm-up or the countdown. */}
      {stage === "idle" ? <GuideTip id="recording" /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "black" },
  permissionContainer: {
    flex: 1,
    backgroundColor: colors.background,
    paddingHorizontal: spacing.lg,
    justifyContent: "space-between",
  },
  closeButton: { alignSelf: "flex-start" },
  permissionBody: { flex: 1, alignItems: "center", justifyContent: "center", gap: spacing.md, paddingHorizontal: spacing.lg },
  permissionTitle: { color: colors.textPrimary, fontSize: typography.title, ...font("700"), textAlign: "center" },
  permissionText: { ...font("400"), color: colors.textSecondary, fontSize: typography.body, textAlign: "center", lineHeight: 21 },
  topBar: {
    position: "absolute",
    left: spacing.lg,
    right: spacing.lg,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
  },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center",
    justifyContent: "center",
  },
  promptBannerSlot: { flex: 1 },
  previewToggle: { position: "absolute", right: spacing.lg },
  previewToggleBlind: { opacity: 0.3 },
  teleprompterWrap: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 },
  teleprompterCloseButton: { position: "absolute", left: spacing.lg, zIndex: 1 },
  bottomBar: {
    position: "absolute",
    bottom: 0,
    left: spacing.lg,
    right: spacing.lg,
    gap: spacing.md,
  },
  recordButtonGroup: { alignItems: "center", gap: spacing.sm },
  restartButton: {
    position: "absolute",
    left: spacing.lg,
    bottom: spacing.xxl + spacing.lg,
    alignItems: "center",
    gap: 2,
    padding: spacing.sm,
    borderRadius: 999,
    backgroundColor: "rgba(0,0,0,0.45)",
    zIndex: 2,
  },
  restartText: { color: colors.textPrimary, fontSize: typography.caption - 1, ...font("600") },
  recordHint: { color: colors.textSecondary, fontSize: typography.caption, ...font("600") },
  recordHintUrgent: { color: colors.danger, ...font("700") },
});
