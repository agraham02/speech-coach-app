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
  const { videoUri, durationSecondsLocal, ...subject } = route.params;
  const isFreeRecord = subject.kind === "prompt" && isFreeRecordPrompt(subject.prompt.id);
  // Script Practice defaults the other way from Free Record: grading is the
  // whole point of the mode (cue compliance especially), while a scripted
  // reading isn't the kind of thing that belongs in a personal journal, so
  // Notion sync defaults off.
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
    processSession({ ...subject, sessionId, videoUri, durationSecondsLocal, wantsGrading, wantsNotionSync }).catch(
      (error) => logger.error(`[preview] unhandled processing error for ${sessionId}: ${(error as Error).message}`),
    );

    navigation.replace("Processing", {
      ...subject,
      sessionId,
      videoUri,
      durationSecondsLocal,
      wantsGrading,
      wantsNotionSync,
    });
  }

  return (
    <ScreenContainer style={styles.container}>
      <Text style={styles.title}>Review your recording</Text>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
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
          <PrimaryButton label="Discard" variant="secondary" onPress={handleDiscard} disabled={isSaving} />
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
  scroll: { flex: 1 },
  scrollContent: { gap: spacing.md, paddingBottom: spacing.lg },
  section: { gap: spacing.md },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.md },
  rowText: { flex: 1, gap: spacing.xs },
  rowTitle: { color: colors.textPrimary, fontSize: typography.body, fontWeight: "600" },
  rowSubtitle: { color: colors.textSecondary, fontSize: typography.caption, lineHeight: 17 },
  actions: { flexDirection: "row", gap: spacing.md },
  actionSlot: { flex: 1 },
});
