import { useEffect, useRef, useState } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { Camera as VisionCamera } from "react-native-vision-camera";
import type { RootStackParamList } from "../navigation";
import { PrimaryButton } from "../components/common/PrimaryButton";
import { ProgressRing } from "../components/common/ProgressRing";
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
  getRecordBlindPref,
  getRecordingDurationSettings,
  getWarmUpEnabled,
  setRecordBlindPref,
} from "../services/prefs/prefsStore";
import { resolvePrepDurationSeconds, resolveRecordingDurationSeconds } from "../domain/recordingSettings";
import { DEFAULT_WARM_UP_INTENSITY, getWarmUpSteps } from "../domain/warmUpRoutine";
import { persistRecording } from "../services/storage/videoStorage";
import { formatDuration } from "../utils/dateUtils";
import { colors, spacing, typography } from "../theme/theme";

type Props = NativeStackScreenProps<RootStackParamList, "Recording">;

type Stage = "warmup" | "prep" | "idle" | "recording";

export function RecordingScreen({ route, navigation }: Props) {
  const subject = route.params;
  const isScript = subject.kind === "script";
  const prepText = isScript ? `Reading: ${subject.script.title}` : subject.prompt.text;
  const insets = useSafeAreaInsets();
  const cameraRef = useRef<VisionCamera>(null);
  const { hasAllPermissions, hasCameraPermission, hasMicrophonePermission, requestCameraPermission, requestMicrophonePermission } =
    useCameraPermissions();
  const { faceDetected, framingStatus, onFacesDetected, faceDetectionOptions } = useFaceDetection();
  const { elapsedSeconds, start, stop } = useRecordingTimer();
  const [recordBlind, setRecordBlind] = useState(!isScript && getRecordBlindPref());
  const [isFinishing, setIsFinishing] = useState(false);
  const stoppingRef = useRef(false);

  const [prepSettings] = useState(() => getPrepPhaseSettings());
  const [warmUpEnabled] = useState(() => getWarmUpEnabled());
  // Phase 5 will drive this by curriculum level instead of a fixed default —
  // see warmUpRoutine.ts's header comment.
  const [warmUpSteps] = useState(() => getWarmUpSteps(DEFAULT_WARM_UP_INTENSITY));
  // Concise Mode's duration is already resolved (from prefs) by the time it
  // reaches here as subject.conciseSeconds — it bypasses the general
  // recording-duration setting entirely, same as Script Practice bypassing
  // it for the script's own word count (see scriptTypes.ts).
  const isConcise = subject.kind === "prompt" && !!subject.conciseSeconds;
  const [targetDurationSeconds] = useState(() => {
    if (isScript) return subject.script.targetDurationSeconds;
    if (subject.kind === "prompt" && subject.conciseSeconds) return subject.conciseSeconds;
    return resolveRecordingDurationSeconds(getRecordingDurationSettings());
  });
  const [prepDurationSeconds] = useState(() =>
    prepSettings.enabled ? resolvePrepDurationSeconds(prepSettings) : 0,
  );
  const [stage, setStage] = useState<Stage>(() => {
    if (warmUpEnabled) return "warmup";
    return prepSettings.enabled ? "prep" : "idle";
  });

  useHapticFaceWarning(stage === "recording", faceDetected);

  function handleToggleRecordBlind(value: boolean) {
    setRecordBlind(value);
    setRecordBlindPref(value);
  }

  function advanceFromWarmUp() {
    setStage(prepSettings.enabled ? "prep" : "idle");
  }

  function beginRecording() {
    if (!cameraRef.current) return;
    stoppingRef.current = false;
    setStage("recording");
    start();
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
        Alert.alert("Recording error", error.message);
      },
    });
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

  useEffect(() => {
    if (stage === "recording" && remainingRecordingSeconds === 0) {
      handleStop();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, remainingRecordingSeconds]);

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
            Speech Coach needs both to record your practice sessions. Nothing is uploaded until you finish recording.
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
      <CameraPreview
        cameraRef={cameraRef}
        isActive
        onFacesDetected={onFacesDetected}
        faceDetectionOptions={faceDetectionOptions}
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
        <RecordBlindOverlay promptText={subject.prompt.text} elapsedSeconds={remainingRecordingSeconds} />
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
            cuesEnabled={subject.cuesEnabled}
            isRecording={stage === "recording"}
          />
        </View>
      )}

      {stage !== "warmup" && stage !== "prep" && (
        <View style={[styles.bottomBar, { paddingBottom: insets.bottom + spacing.lg }]}>
          {stage === "idle" && !isScript && (
            <RecordBlindToggle value={recordBlind} onValueChange={handleToggleRecordBlind} />
          )}
          <View style={styles.recordButtonGroup}>
            {/* The ring only appears once recording starts (and blind mode isn't
                hiding it), so it never reads as decoration on the idle button —
                it's specifically the countdown, made visible. */}
            {stage === "recording" && !recordBlind ? (
              <ProgressRing
                size={120}
                strokeWidth={6}
                progress={remainingRecordingSeconds / targetDurationSeconds}
                color={colors.danger}
                trackColor="rgba(255,255,255,0.15)"
              >
                <RecordButton isRecording disabled={isFinishing} onPress={handleStop} />
              </ProgressRing>
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
                  : recordBlind
                    ? "Tap to stop"
                    : `${formatDuration(remainingRecordingSeconds)} left · tap to stop`}
            </Text>
          </View>
        </View>
      )}
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
  permissionTitle: { color: colors.textPrimary, fontSize: typography.title, fontWeight: "700", textAlign: "center" },
  permissionText: { color: colors.textSecondary, fontSize: typography.body, textAlign: "center", lineHeight: 21 },
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
  recordHint: { color: colors.textSecondary, fontSize: typography.caption, fontWeight: "600" },
  recordHintUrgent: { color: colors.danger, fontWeight: "700" },
});
