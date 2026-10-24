import { useEffect, useRef, useState } from "react";
import { Alert, ScrollView, Switch, Text, View } from "react-native";
import { usePreventRemove } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../navigation";
import { ScreenContainer } from "../components/common/ScreenContainer";
import { Card } from "../components/common/Card";
import { PrimaryButton } from "../components/common/PrimaryButton";
import { VideoPlayback } from "../components/result/VideoPlayback";
import { deleteRecording } from "../services/storage/videoStorage";
import { createSessionFromTake } from "../services/pipeline/sessionPipeline";
import { setVideoKeepsake } from "../services/data/videoKeepsakes";
import { logger } from "../utils/logger";
import { completePracticeStep } from "../services/practice/practiceEvents";
import { getCloudReviewDefault } from "../services/prefs/prefsStore";
import { currentProvider, hasConsent } from "../services/cloud/providers";
import { showLevelFor } from "../services/analysis";
import { getAccount, useAccount } from "../services/account/accountStore";
import { usesOneLine } from "../domain/aiAllowance";
import { readyForDeepReview } from "../services/cloud/consent";
import { spacing, typography, font, fontDisplay } from "../theme/theme";
import { makeStyles, useTheme } from "../theme/ThemeProvider";
import { TranscriptionBanner } from "../components/common/TranscriptionBanner";

type Props = NativeStackScreenProps<RootStackParamList, "Preview">;

// Use the take, retake it, or throw it away. Nothing is final here: on-device
// analysis always runs, and a deep review can be added from the session at
// any time later.
export function PreviewScreen({ route, navigation }: Props) {
  const styles = useStyles();
  const { colors } = useTheme();
  const { videoUri, durationSecondsLocal, ...subject } = route.params;
  // A feeling rep is private by default: nothing leaves the phone unless
  // switched on here.
  const isFeeling = subject.kind === "prompt" && !!subject.feeling;
  // On by default only once a provider is set up and allowed.
  const provider = currentProvider();
  const account = useAccount();
  // Tono AI also needs someone signed in, with reviews left.
  const [wantsCloudReview, setWantsCloudReview] = useState(
    () => !isFeeling && getCloudReviewDefault() && hasConsent(provider.id) && (provider.id !== "tono" || (getAccount().status === "signedIn" && getAccount().allowed.review)),
  );
  // What a review costs the person: a review from their allowance, or their own key.
  const paidBy = provider.id === "tono" ? (account.allowance && usesOneLine(account.allowance)) || "Counts toward your Tono AI reviews." : "Uses your own key.";

  async function toggleCloudReview(on: boolean) {
    if (!on) {
      setWantsCloudReview(false);
      return;
    }
    if (await readyForDeepReview(() => navigation.navigate("Settings", { section: "deepReviews" }))) setWantsCloudReview(true);
  }
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
        // A key removed, or Tono AI signed out of, since the switch went on:
        // save without the review.
        wantsCloudReview: wantsCloudReview && (await showLevelFor("take_review", { hasVideo: true, hasTranscript: true, takeOptIn: true })) === "judged",
      });
      // A lesson / daily-plan rep counts as done once the take is kept.
      if (subject.kind === "prompt") completePracticeStep(subject.practice, null, sessionId);
      if (subject.kind === "prompt" && subject.skillCheck) {
        // Kept for the side-by-side at the 30-day retake; no scored result
        // during onboarding.
        await setVideoKeepsake(sessionId, true);
        markResolved(() => navigation.goBack());
        return;
      }
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

        <TranscriptionBanner />

        <Card style={styles.section}>
          <Text style={styles.note}>
            Your transcript, pace, pauses and voice analysis run on this phone either way.
          </Text>
          <View style={styles.row}>
            <View style={styles.rowText}>
              <Text style={styles.rowTitle}>Deep review</Text>
              <Text style={styles.rowSubtitle}>
                {provider.input === "video"
                  ? `${provider.name} scores ${subject.kind === "script" ? "delivery, presence and how well you followed the marks" : "structure, delivery and presence"} from the video. ${paidBy}`
                  : `${provider.name} scores ${subject.kind === "script" ? "your reading" : "structure, content and delivery"} from your transcript and the phone's measurements — the video stays here. ${paidBy}`}
              </Text>
            </View>
            <Switch
              value={wantsCloudReview}
              onValueChange={toggleCloudReview}
              trackColor={{ true: colors.success, false: colors.switchTrackOff }}
              thumbColor="#FFFFFF"
            />
          </View>
          <Text style={styles.hint}>
            {isFeeling
              ? "This is a private feeling rep — the deep review stays off unless you turn it on. You can still add it later."
              : "You can add a deep review later from the session."}
          </Text>
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

const useStyles = makeStyles(({ colors }) => ({
  container: { gap: spacing.md },
  title: { color: colors.textPrimary, fontFamily: fontDisplay.title, fontSize: 30, lineHeight: 36, letterSpacing: -0.8 },
  scroll: { flex: 1 },
  scrollContent: { gap: spacing.md, paddingBottom: spacing.lg },
  section: { gap: spacing.md },
  note: { ...font("400"), color: colors.textSecondary, fontSize: typography.caption, lineHeight: 18 },
  hint: { ...font("400"), color: colors.textMuted, fontSize: typography.caption },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.md },
  rowText: { flex: 1, gap: spacing.xs },
  rowTitle: { color: colors.textPrimary, fontSize: typography.body, ...font("600") },
  rowSubtitle: { ...font("400"), color: colors.textSecondary, fontSize: typography.caption, lineHeight: 17 },
  actions: { gap: spacing.sm },
  secondaryRow: { flexDirection: "row", gap: spacing.md },
  actionSlot: { flex: 1 },
}));
