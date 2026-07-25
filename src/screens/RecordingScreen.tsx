import { useEffect, useRef, useState } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { Camera as VisionCamera } from "react-native-vision-camera";
import type { RootStackParamList } from "../navigation";
import { PrimaryButton } from "../components/common/PrimaryButton";
import { CameraPreview } from "../components/recording/CameraPreview";
import { FramingGuideOverlay } from "../components/recording/FramingGuideOverlay";
import { PrepOverlay } from "../components/recording/PrepOverlay";
import { PromptBanner } from "../components/recording/PromptBanner";
import { RecordBlindOverlay } from "../components/recording/RecordBlindOverlay";
import { RecordBlindToggle } from "../components/recording/RecordBlindToggle";
import { RecordButton } from "../components/recording/RecordButton";
import { RecordingTimer } from "../components/recording/RecordingTimer";
import { useCameraPermissions } from "../hooks/useCameraPermissions";
import { useCountdownTimer } from "../hooks/useCountdownTimer";
import { useFaceDetection } from "../hooks/useFaceDetection";
import { useHapticFaceWarning } from "../hooks/useHapticFaceWarning";
import { useRecordingTimer } from "../hooks/useRecordingTimer";
import {
  getPrepPhaseSettings,
  getRecordBlindPref,
  getRecordingDurationSettings,
  setRecordBlindPref,
} from "../services/prefs/prefsStore";
import { resolvePrepDurationSeconds, resolveRecordingDurationSeconds } from "../domain/recordingSettings";
import { persistRecording } from "../services/storage/videoStorage";
import { processSession } from "../services/pipeline/sessionProcessor";
import { generateId } from "../utils/generateId";
import { logger } from "../utils/logger";
import { colors, spacing, typography } from "../theme/theme";

type Props = NativeStackScreenProps<RootStackParamList, "Recording">;

type Stage = "prep" | "idle" | "recording";

export function RecordingScreen({ route, navigation }: Props) {
  const { prompt } = route.params;
  const insets = useSafeAreaInsets();
  const cameraRef = useRef<VisionCamera>(null);
  const { hasAllPermissions, hasCameraPermission, hasMicrophonePermission, requestCameraPermission, requestMicrophonePermission } =
    useCameraPermissions();
  const { faceDetected, framingStatus, onFacesDetected, faceDetectionOptions } = useFaceDetection();
  const { elapsedSeconds, start, stop } = useRecordingTimer();
  const [recordBlind, setRecordBlind] = useState(getRecordBlindPref());
  const [isFinishing, setIsFinishing] = useState(false);
  const stoppingRef = useRef(false);

  const [prepSettings] = useState(() => getPrepPhaseSettings());
  const [targetDurationSeconds] = useState(() => resolveRecordingDurationSeconds(getRecordingDurationSettings()));
  const [prepDurationSeconds] = useState(() =>
    prepSettings.enabled ? resolvePrepDurationSeconds(prepSettings) : 0,
  );
  const [stage, setStage] = useState<Stage>(prepSettings.enabled ? "prep" : "idle");

  useHapticFaceWarning(stage === "recording", faceDetected);

  function handleToggleRecordBlind(value: boolean) {
    setRecordBlind(value);
    setRecordBlindPref(value);
  }

  function beginRecording() {
    if (!cameraRef.current) return;
    stoppingRef.current = false;
    setStage("recording");
    start();
    cameraRef.current.startRecording({
      onRecordingFinished: async (video) => {
        stop();
        setIsFinishing(true);
        try {
          const sessionId = generateId();
          const videoUri = video.path.startsWith("file://") ? video.path : `file://${video.path}`;
          const persistedUri = await persistRecording(videoUri, sessionId);
          const durationSecondsLocal = Math.round(video.duration);

          // Fire-and-forget: processing runs independently of this screen from
          // here on, so navigating anywhere (or closing the Processing viewer)
          // never interrupts the upload/transcribe/Notion pipeline.
          processSession({ sessionId, prompt, videoUri: persistedUri, durationSecondsLocal }).catch((error) =>
            logger.error(`[recording] unhandled processing error for ${sessionId}: ${(error as Error).message}`),
          );

          navigation.replace("Processing", {
            sessionId,
            prompt,
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
        <Pressable onPress={() => navigation.goBack()} style={styles.closeButton} hitSlop={12}>
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

      {stage === "prep" && (
        <PrepOverlay
          promptText={prompt.text}
          remainingSeconds={prepRemaining}
          onSkip={skipPrep}
          onClose={() => navigation.goBack()}
          topInset={insets.top + spacing.sm}
        />
      )}

      {stage === "idle" && (
        <View style={[styles.topBar, { top: insets.top + spacing.sm }]}>
          <Pressable onPress={() => navigation.goBack()} style={styles.iconButton} hitSlop={12}>
            <Ionicons name="close" size={22} color={colors.textPrimary} />
          </Pressable>
          <View style={styles.promptBannerSlot}>
            <PromptBanner text={prompt.text} />
          </View>
        </View>
      )}

      {stage === "idle" && <FramingGuideOverlay status={framingStatus} />}

      {stage === "recording" && recordBlind && (
        <RecordBlindOverlay promptText={prompt.text} elapsedSeconds={remainingRecordingSeconds} />
      )}

      {stage === "recording" && !recordBlind && (
        <View style={[styles.timerBadge, { top: insets.top + spacing.md }]}>
          <RecordingTimer elapsedSeconds={remainingRecordingSeconds} size="small" />
        </View>
      )}

      {stage !== "prep" && (
        <View style={[styles.bottomBar, { paddingBottom: insets.bottom + spacing.lg }]}>
          {stage === "idle" && (
            <RecordBlindToggle value={recordBlind} onValueChange={handleToggleRecordBlind} />
          )}
          <View style={styles.recordButtonGroup}>
            <RecordButton
              isRecording={stage === "recording"}
              disabled={isFinishing}
              onPress={stage === "recording" ? handleStop : beginRecording}
            />
            <Text style={styles.recordHint}>
              {isFinishing ? "Saving…" : stage === "recording" ? "Tap to stop" : "Tap to start"}
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
  timerBadge: { position: "absolute", alignSelf: "center" },
  bottomBar: {
    position: "absolute",
    bottom: 0,
    left: spacing.lg,
    right: spacing.lg,
    gap: spacing.md,
  },
  recordButtonGroup: { alignItems: "center", gap: spacing.sm },
  recordHint: { color: colors.textSecondary, fontSize: typography.caption, fontWeight: "600" },
});
