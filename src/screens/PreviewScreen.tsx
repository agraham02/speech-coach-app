import { useState } from "react";
import { Alert, ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../navigation";
import { ScreenContainer } from "../components/common/ScreenContainer";
import { Card } from "../components/common/Card";
import { PrimaryButton } from "../components/common/PrimaryButton";
import { VideoPlayback } from "../components/result/VideoPlayback";
import { isFreeRecordPrompt } from "../data/topics";
import { deleteRecording } from "../services/storage/videoStorage";
import { processSession } from "../services/pipeline/sessionProcessor";
import { generateId } from "../utils/generateId";
import { logger } from "../utils/logger";
import { colors, spacing, typography } from "../theme/theme";

type Props = NativeStackScreenProps<RootStackParamList, "Preview">;

export function PreviewScreen({ route, navigation }: Props) {
  const { prompt, videoUri, durationSecondsLocal } = route.params;
  const isFreeRecord = isFreeRecordPrompt(prompt.id);

  const [wantsGrading, setWantsGrading] = useState(!isFreeRecord);
  const [wantsNotionSync, setWantsNotionSync] = useState(isFreeRecord);
  const [isSaving, setIsSaving] = useState(false);

  function handleDiscard() {
    Alert.alert("Discard this recording?", "It won't be saved anywhere.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Discard",
        style: "destructive",
        onPress: () => {
          deleteRecording(videoUri);
          navigation.popToTop();
        },
      },
    ]);
  }

  function handleSave() {
    setIsSaving(true);
    const sessionId = generateId();

    // Fire-and-forget: processing runs independently of this screen from
    // here on, so navigating anywhere (or closing the Processing viewer)
    // never interrupts the upload/transcribe/Notion pipeline.
    processSession({ sessionId, prompt, videoUri, durationSecondsLocal, wantsGrading, wantsNotionSync }).catch((error) =>
      logger.error(`[preview] unhandled processing error for ${sessionId}: ${(error as Error).message}`),
    );

    navigation.replace("Processing", {
      sessionId,
      prompt,
      videoUri,
      durationSecondsLocal,
      wantsGrading,
      wantsNotionSync,
    });
  }

  return (
    <ScreenContainer style={styles.container}>
      <Text style={styles.title}>Review your recording</Text>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <VideoPlayback videoUri={videoUri} />

        <Card style={styles.section}>
          <View style={styles.row}>
            <View style={styles.rowText}>
              <Text style={styles.rowTitle}>Get AI feedback</Text>
              <Text style={styles.rowSubtitle}>Structure, delivery, presence, and coaching notes.</Text>
            </View>
            <Switch
              value={wantsGrading}
              onValueChange={setWantsGrading}
              trackColor={{ true: colors.accent, false: "rgba(255,255,255,0.2)" }}
            />
          </View>
          <View style={styles.row}>
            <View style={styles.rowText}>
              <Text style={styles.rowTitle}>Sync to Notion</Text>
              <Text style={styles.rowSubtitle}>Append the clean transcript to today's journal entry.</Text>
            </View>
            <Switch
              value={wantsNotionSync}
              onValueChange={setWantsNotionSync}
              trackColor={{ true: colors.accent, false: "rgba(255,255,255,0.2)" }}
            />
          </View>
        </Card>
      </ScrollView>

      <View style={styles.actions}>
        <View style={styles.actionSlot}>
          <PrimaryButton label="Discard" variant="danger" onPress={handleDiscard} disabled={isSaving} />
        </View>
        <View style={styles.actionSlot}>
          <PrimaryButton label="Save" onPress={handleSave} loading={isSaving} />
        </View>
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.md },
  title: { color: colors.textPrimary, fontSize: typography.title, fontWeight: "700" },
  scrollContent: { gap: spacing.md, paddingBottom: spacing.lg },
  section: { gap: spacing.md },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.md },
  rowText: { flex: 1, gap: spacing.xs },
  rowTitle: { color: colors.textPrimary, fontSize: typography.body, fontWeight: "600" },
  rowSubtitle: { color: colors.textSecondary, fontSize: typography.caption, lineHeight: 17 },
  actions: { flexDirection: "row", gap: spacing.md },
  actionSlot: { flex: 1 },
});
