import { useEffect } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../navigation";
import { ScreenContainer } from "../components/common/ScreenContainer";
import { PrimaryButton } from "../components/common/PrimaryButton";
import { Card } from "../components/common/Card";
import { StepList, type Step } from "../components/processing/StepList";
import { useSessionProcessingStatus } from "../hooks/useSessionProcessingStatus";
import { processSession } from "../services/pipeline/sessionProcessor";
import type { ProcessingPhase } from "../services/pipeline/processingEvents";
import { colors, spacing, typography } from "../theme/theme";

type Props = NativeStackScreenProps<RootStackParamList, "Processing">;

const STEPS: Step[] = [
  { key: "saving_locally", label: "Save your recording" },
  { key: "uploading", label: "Upload to Gemini" },
  { key: "transcribing", label: "Transcribe & analyze" },
  { key: "saving_notion", label: "Save to Notion" },
];

const PHASE_TO_STEP_INDEX: Record<ProcessingPhase, number> = {
  saving_locally: 0,
  uploading: 1,
  processing: 1,
  transcribing: 2,
  saving_notion: 3,
  done: 4,
  error: 0,
};

// A live VIEWER of processing status, not the driver — the actual pipeline
// (services/pipeline/sessionProcessor) was already kicked off from
// RecordingScreen and keeps running whether or not this screen is mounted.
// That's what lets you navigate away immediately instead of waiting here.
export function ProcessingScreen({ route, navigation }: Props) {
  const { sessionId, prompt, videoUri, durationSecondsLocal } = route.params;
  const { phase, errorMessage, notionFailedOnly } = useSessionProcessingStatus(sessionId);

  useEffect(() => {
    if (phase === "done") {
      navigation.replace("Result", { sessionId });
    }
  }, [phase, sessionId, navigation]);

  function retry() {
    processSession({ sessionId, prompt, videoUri, durationSecondsLocal });
  }

  function continueInBackground() {
    navigation.navigate("Tabs", { screen: "Home" });
  }

  if (phase === "error") {
    return (
      <ScreenContainer style={styles.centered}>
        <View style={styles.errorIconWrap}>
          <Ionicons
            name={notionFailedOnly ? "cloud-offline-outline" : "alert-circle-outline"}
            size={40}
            color={notionFailedOnly ? colors.warning : colors.danger}
          />
        </View>
        <Text style={styles.errorTitle}>
          {notionFailedOnly ? "Saved locally — Notion sync failed" : "Processing failed"}
        </Text>
        <Card style={styles.stepsCard}>
          <StepList steps={STEPS} currentIndex={notionFailedOnly ? 3 : PHASE_TO_STEP_INDEX[phase]} />
        </Card>
        <Card style={styles.errorCard}>
          <Text style={styles.errorMessage}>{errorMessage}</Text>
        </Card>
        <View style={styles.errorActions}>
          {notionFailedOnly ? (
            <PrimaryButton label="Continue" onPress={() => navigation.replace("Result", { sessionId })} />
          ) : (
            <PrimaryButton label="Retry" onPress={retry} />
          )}
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer style={styles.centered}>
      <Text style={styles.title}>Processing your session</Text>
      <Card style={styles.stepsCard}>
        <StepList steps={STEPS} currentIndex={PHASE_TO_STEP_INDEX[phase]} />
      </Card>
      <Text style={styles.hint}>This keeps running in the background — feel free to leave.</Text>
      <PrimaryButton label="Continue in background" variant="ghost" onPress={continueInBackground} />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  centered: { alignItems: "center", justifyContent: "center", gap: spacing.lg },
  title: { color: colors.textPrimary, fontSize: typography.title, fontWeight: "700" },
  stepsCard: { width: "100%" },
  hint: { color: colors.textMuted, fontSize: typography.caption, textAlign: "center" },
  errorIconWrap: { alignItems: "center" },
  errorTitle: { color: colors.textPrimary, fontSize: typography.title, fontWeight: "700", textAlign: "center" },
  errorCard: { width: "100%" },
  errorMessage: { color: colors.textSecondary, fontSize: typography.body, textAlign: "center", lineHeight: 20 },
  errorActions: { width: "100%" },
});
