import { useEffect, useRef, useState } from "react";
import { Alert, ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import { usePreventRemove } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../navigation";
import { ScreenContainer } from "../components/common/ScreenContainer";
import { Card } from "../components/common/Card";
import { PrimaryButton } from "../components/common/PrimaryButton";
import { VideoPlayback } from "../components/result/VideoPlayback";
import { isFreeRecordPrompt } from "../data/topics";
import { deleteRecording } from "../services/storage/videoStorage";
import { createSessionFromTake } from "../services/pipeline/sessionPipeline";
import { logger } from "../utils/logger";
import { colors, spacing, typography } from "../theme/theme";

type Props = NativeStackScreenProps<RootStackParamList, "Preview">;

// Use the take, retake it, or throw it away. Nothing is final here: on-device
// analysis always runs, and a deep review or Notion sync can be added from
// the session at any time later.
export function PreviewScreen({ route, navigation }: Props) {
  const { videoUri, durationSecondsLocal, ...subject } = route.params;
  const isFreeRecord = subject.kind === "prompt" && isFreeRecordPrompt(subject.prompt.id);
  const [wantsCloudReview, setWantsCloudReview] = useState(false);
  const [wantsNotionSync, setWantsNotionSync] = useState(isFreeRecord);
  const [isSaving, setIsSaving] = useState(false);
  // Set once the take has been saved or deliberately thrown away, so leaving
  // the screen no longer needs a confirmation.
  const resolvedRef = useRef(false);
  const [resolved, setResolved] = useState(false);
  // Navigation to run once `resolved` has committed — the prevent-remove
  // guard below reads it on render, so navigating in the same tick as
  // setResolved would still be blocked.
  const [pendingExit, setPendingExit] = useState<(() => void) | null>(null);

  function markResolved(exit?: () => void) {
    resolvedRef.current = true;
    setResolved(true);
    if (exit) setPendingExit(() => exit);
  }

  useEffect(() => {
    if (resolved && pendingExit) pendingExit();
  }, [resolved, pendingExit]);

  // A back-swipe used to leave the recording file behind forever. Now it
  // asks first, and discarding deletes the file.
  usePreventRemove(!resolved, ({ data }) => {
    Alert.alert("Discard this take?", "It hasn't been saved.", [
      { text: "Keep reviewing", style: "cancel" },
      {
        text: "Discard",
        style: "destructive",
        onPress: () => {
          deleteRecording(videoUri);
          markResolved(() => navigation.dispatch(data.action));
        },
      },
    ]);
  });

  function handleRetake() {
    deleteRecording(videoUri);
    // Same subject — prompt, PREP plan and Concise length all carry over.
    markResolved(() => navigation.replace("Recording", subject));
  }

  function handleDiscard() {
    Alert.alert("Discard this recording?", "It won't be saved anywhere.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Discard",
        style: "destructive",
        onPress: () => {
          deleteRecording(videoUri);
          markResolved(() => navigation.popToTop());
        },
      },
    ]);
  }

  async function handleSave() {
    if (resolvedRef.current) return;
    setIsSaving(true);
    try {
      const sessionId = await createSessionFromTake({
        subject,
        previewUri: videoUri,
        durationSecondsLocal,
        wantsCloudReview,
        wantsNotionSync,
      });
      markResolved(() => navigation.replace("Result", { sessionId }));
    } catch (error) {
      logger.error(`[preview] save failed — ${(error as Error).message}`);
      setIsSaving(false);
      Alert.alert("Couldn't save", (error as Error).message);
    }
  }

  return (
    <ScreenContainer style={styles.container}>
      <Text style={styles.title}>Review your take</Text>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <VideoPlayback videoUri={videoUri} />

        <Card style={styles.section}>
          <Text style={styles.note}>
            Your transcript, pace, pauses and voice analysis run on this phone either way.
          </Text>
          <View style={styles.row}>
            <View style={styles.rowText}>
              <Text style={styles.rowTitle}>Deep review (cloud)</Text>
              <Text style={styles.rowSubtitle}>
                {subject.kind === "script"
                  ? "Gemini scores delivery, presence and how well you followed the cues. Uploads the video."
                  : "Gemini scores structure, delivery and presence. Uploads the video."}
              </Text>
            </View>
            <Switch
              value={wantsCloudReview}
              onValueChange={setWantsCloudReview}
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
          <Text style={styles.hint}>You can add either of these later from the session.</Text>
        </Card>
      </ScrollView>

      <View style={styles.actions}>
        <PrimaryButton label="Use this take" onPress={handleSave} loading={isSaving} />
        <View style={styles.secondaryRow}>
          <View style={styles.actionSlot}>
            <PrimaryButton label="Retake" variant="secondary" onPress={handleRetake} disabled={isSaving} />
          </View>
          <View style={styles.actionSlot}>
            <PrimaryButton label="Discard" variant="ghost" onPress={handleDiscard} disabled={isSaving} />
          </View>
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
  note: { color: colors.textSecondary, fontSize: typography.caption, lineHeight: 18 },
  hint: { color: colors.textMuted, fontSize: typography.caption },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.md },
  rowText: { flex: 1, gap: spacing.xs },
  rowTitle: { color: colors.textPrimary, fontSize: typography.body, fontWeight: "600" },
  rowSubtitle: { color: colors.textSecondary, fontSize: typography.caption, lineHeight: 17 },
  actions: { gap: spacing.sm },
  secondaryRow: { flexDirection: "row", gap: spacing.md },
  actionSlot: { flex: 1 },
});
