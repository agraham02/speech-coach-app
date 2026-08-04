import { useEffect } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useIsFocused } from "@react-navigation/native";
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

function buildSteps(wantsGrading: boolean, wantsNotionSync: boolean): Step[] {
  const steps: Step[] = [
    { key: "saving_locally", label: "Save your recording" },
    { key: "uploading", label: "Upload to Gemini" },
    { key: "transcribing", label: wantsGrading ? "Transcribe & analyze" : "Transcribe" },
  ];
  if (wantsNotionSync) {
    steps.push({ key: "saving_notion", label: "Save to Notion" });
  }
  return steps;
}

function buildPhaseToStepIndex(wantsNotionSync: boolean): Record<ProcessingPhase, number> {
  return {
    saving_locally: 0,
    uploading: 1,
    processing: 1,
    transcribing: 2,
    saving_notion: 3,
    done: wantsNotionSync ? 4 : 3,
    error: 0,
  };
}

// A live VIEWER of processing status, not the driver — the actual pipeline
// (services/pipeline/sessionProcessor) was already kicked off from the
// Preview screen and keeps running whether or not this screen is mounted.
// That's what lets you navigate away immediately instead of waiting here.
export function ProcessingScreen({ route, navigation }: Props) {
  const { sessionId, videoUri, durationSecondsLocal, wantsGrading, wantsNotionSync, ...subject } = route.params;
  const { phase, errorMessage } = useSessionProcessingStatus(sessionId);
  const isFocused = useIsFocused();

  const steps = buildSteps(wantsGrading, wantsNotionSync);
  const phaseToStepIndex = buildPhaseToStepIndex(wantsNotionSync);

  // Only auto-advance while the user is actually still looking at this
  // screen — if they've left (e.g. via "Continue in background"), completion
  // is announced by a toast instead so it never yanks them away from
  // whatever they're doing elsewhere in the app.
  useEffect(() => {
    if (phase === "done" && isFocused) {
      navigation.replace("Result", { sessionId });
    }
  }, [phase, isFocused, sessionId, navigation]);

  function retry() {
    processSession({ ...subject, sessionId, videoUri, durationSecondsLocal, wantsGrading, wantsNotionSync });
  }

  function continueInBackground() {
    navigation.popToTop();
  }

  if (phase === "error") {
    return (
      <ScreenContainer style={styles.centered}>
        <View style={styles.errorIconWrap}>
          <Ionicons name="alert-circle-outline" size={40} color={colors.danger} />
        </View>
        <Text style={styles.errorTitle}>Processing failed</Text>
        <Card style={styles.stepsCard}>
          <StepList steps={steps} currentIndex={phaseToStepIndex[phase]} />
        </Card>
        <Card style={styles.errorCard}>
          <Text style={styles.errorMessage}>{errorMessage}</Text>
        </Card>
        <View style={styles.errorActions}>
          <PrimaryButton label="Retry" onPress={retry} />
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer style={styles.centered}>
      <Text style={styles.title}>Processing your session</Text>
      <Card style={styles.stepsCard}>
        <StepList steps={steps} currentIndex={phaseToStepIndex[phase]} />
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
