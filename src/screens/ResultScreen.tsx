import { useEffect, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../navigation";
import { ScreenContainer } from "../components/common/ScreenContainer";
import { PrimaryButton } from "../components/common/PrimaryButton";
import { LoadingSpinner } from "../components/common/LoadingSpinner";
import { Card } from "../components/common/Card";
import { Badge } from "../components/common/Badge";
import { ScoreBar } from "../components/result/ScoreBar";
import { OverallScoreRing } from "../components/result/OverallScoreRing";
import { VideoPlayback } from "../components/result/VideoPlayback";
import { AnnotatedTranscript } from "../components/result/AnnotatedTranscript";
import { ScoreRadarChart } from "../components/result/ScoreRadarChart";
import { useToast } from "../components/common/ToastProvider";
import { getSessionById, deleteSession } from "../services/db/sessionsRepo";
import { getScoresBySessionId } from "../services/db/scoresRepo";
import { getPrompt } from "../services/db/promptsRepo";
import { deleteRecording } from "../services/storage/videoStorage";
import { syncSessionToNotion, gradeExistingSession } from "../services/pipeline/sessionProcessor";
import type { Session, SessionScores } from "../domain/sessionTypes";
import { formatDuration } from "../utils/dateUtils";
import { colors, spacing, typography } from "../theme/theme";

type Props = NativeStackScreenProps<RootStackParamList, "Result">;

export function ResultScreen({ route, navigation }: Props) {
  const { sessionId } = route.params;
  const showToast = useToast();
  const [session, setSession] = useState<Session | null>(null);
  const [scores, setScores] = useState<SessionScores | null>(null);
  const [showClean, setShowClean] = useState(false);
  const [showVideo, setShowVideo] = useState(false);
  const [isSyncingNotion, setIsSyncingNotion] = useState(false);
  const [isGrading, setIsGrading] = useState(false);

  useEffect(() => {
    getSessionById(sessionId).then(setSession);
    getScoresBySessionId(sessionId).then(setScores);
  }, [sessionId]);

  if (!session) {
    return (
      <ScreenContainer style={styles.centered}>
        <LoadingSpinner />
      </ScreenContainer>
    );
  }

  const prompt = getPrompt(session.promptId);

  async function handleNotionToggle(value: boolean) {
    if (!value || session!.notionSyncedAt) return;
    setIsSyncingNotion(true);
    try {
      await syncSessionToNotion(sessionId);
      const updated = await getSessionById(sessionId);
      setSession(updated);
      showToast("Saved to Notion", "success");
    } catch (error) {
      showToast(`Couldn't sync to Notion — ${(error as Error).message}`, "error");
    } finally {
      setIsSyncingNotion(false);
    }
  }

  async function handleGrade() {
    if (!session || !prompt) return;
    setIsGrading(true);
    try {
      await gradeExistingSession(sessionId, prompt, session.videoPath);
      const [updatedSession, updatedScores] = await Promise.all([
        getSessionById(sessionId),
        getScoresBySessionId(sessionId),
      ]);
      setSession(updatedSession);
      setScores(updatedScores);
      showToast("Grading complete", "success");
    } catch (error) {
      showToast(`Grading failed — ${(error as Error).message}`, "error");
    } finally {
      setIsGrading(false);
    }
  }

  function handleDelete() {
    Alert.alert("Delete this session?", "This removes the recording, transcript, and scores. This can't be undone.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          await deleteSession(sessionId);
          deleteRecording(session!.videoPath);
          navigation.popToTop();
        },
      },
    ]);
  }

  const notionSynced = !!session.notionSyncedAt;

  return (
    <ScreenContainer style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerSpacer} />
        <Pressable
          onPress={handleDelete}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Delete session"
        >
          <Ionicons name="trash-outline" size={22} color={colors.textSecondary} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <Card style={styles.notionCard}>
          <View style={styles.row}>
            <View style={styles.rowText}>
              <Text style={styles.rowTitle}>Sync to Notion</Text>
              <Text style={styles.rowSubtitle}>
                {notionSynced ? "Saved to your journal" : isSyncingNotion ? "Syncing…" : "Not sent yet"}
              </Text>
            </View>
            <Switch
              value={notionSynced}
              onValueChange={handleNotionToggle}
              disabled={notionSynced || isSyncingNotion}
              trackColor={{ true: colors.accent, false: "rgba(255,255,255,0.2)" }}
            />
          </View>
        </Card>

        {scores ? (
          <Card style={styles.overallCard}>
            <OverallScoreRing score={scores.overallScore} />
            <View style={styles.overallTextGroup}>
              <Text style={styles.sectionLabel}>OVERALL · {scores.archetypeDetected.toUpperCase()}</Text>
              <Text style={styles.archetypeFit}>{scores.archetypeFitForTopic}</Text>
            </View>
          </Card>
        ) : (
          <Card style={styles.gradeCard}>
            <View style={styles.rowText}>
              <Text style={styles.rowTitle}>No AI feedback yet</Text>
              <Text style={styles.rowSubtitle}>Get structure, delivery, presence, and coaching scores.</Text>
            </View>
            <PrimaryButton label="Grade with Gemini" onPress={handleGrade} loading={isGrading} />
          </Card>
        )}

        {prompt ? (
          <Card style={styles.promptCard}>
            <Badge label={prompt.category} />
            <Text style={styles.promptText}>{prompt.text}</Text>
          </Card>
        ) : null}

        <Pressable
          style={styles.verbatimToggle}
          onPress={() => setShowVideo((v) => !v)}
          accessibilityRole="button"
          accessibilityLabel={showVideo ? "Hide recording" : "Watch recording"}
        >
          <Ionicons name={showVideo ? "chevron-up" : "play-circle-outline"} size={18} color={colors.accent} />
          <Text style={styles.verbatimToggleText}>{showVideo ? "Hide recording" : "Watch recording"}</Text>
        </Pressable>
        {showVideo ? <VideoPlayback videoUri={session.videoPath} /> : null}

        {scores ? (
          <Card style={styles.coachingCard}>
            <Text style={styles.sectionLabel}>COACHING</Text>
            <Text style={styles.coachingSummary}>{scores.coachingSummary}</Text>
            <View style={styles.coachingRow}>
              <Ionicons name="thumbs-up-outline" size={16} color={colors.success} />
              <Text style={styles.coachingRowText}>
                <Text style={styles.coachingRowLabel}>Strength: </Text>
                {scores.topStrength}
              </Text>
            </View>
            <View style={styles.coachingRow}>
              <Ionicons name="build-outline" size={16} color={colors.warning} />
              <Text style={styles.coachingRowText}>
                <Text style={styles.coachingRowLabel}>Focus on: </Text>
                {scores.topFocusArea}
              </Text>
            </View>
            <View style={styles.drillBox}>
              <Text style={styles.drillLabel}>NEXT DRILL</Text>
              <Text style={styles.drillText}>{scores.recommendedDrill}</Text>
            </View>
          </Card>
        ) : null}

        {scores ? (
          <Card style={styles.scoresCard}>
            <ScoreRadarChart scores={scores} />

            <Text style={styles.sectionLabel}>STRUCTURE</Text>
            <ScoreBar
              label={scores.structureUsed === "none detected" ? "No clear structure" : scores.structureUsed}
              score={scores.structureScore}
              notes={scores.structureNotes}
            />

            <Text style={[styles.sectionLabel, styles.sectionSpacer]}>CONTENT</Text>
            <ScoreBar label="Relevance to prompt" score={scores.relevanceScore} notes={scores.relevanceNotes} />
            <ScoreBar label="Coherence & storytelling" score={scores.coherenceScore} notes={scores.coherenceNotes} />

            <Text style={[styles.sectionLabel, styles.sectionSpacer]}>DELIVERY</Text>
            <ScoreBar label="Rate" score={scores.rateScore} notes={scores.rateNotes} suffix={`${scores.rateWpmAvg} wpm`} />
            <ScoreBar label="Volume" score={scores.volumeScore} notes={scores.volumeNotes} />
            <ScoreBar label="Pitch & Melody" score={scores.pitchMelodyScore} notes={scores.pitchMelodyNotes} />
            <ScoreBar label="Tonality" score={scores.tonalityScore} notes={scores.tonalityNotes} />
            <ScoreBar label="Pausing" score={scores.pausingScore} notes={scores.pausingNotes} />

            <Text style={[styles.sectionLabel, styles.sectionSpacer]}>PRESENCE</Text>
            <ScoreBar label="Eye Contact" score={scores.eyeContactScore} />
            <ScoreBar label="Facial Expressiveness" score={scores.facialExpressivenessScore} />
            <Text style={styles.bodyLanguageNotes}>{scores.bodyLanguageNotes}</Text>

            <Text style={[styles.sectionLabel, styles.sectionSpacer]}>FACE-VOICE CONGRUENCE</Text>
            <ScoreBar label="Congruence" score={scores.faceVoiceCongruenceScore} />
          </Card>
        ) : null}

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionLabel}>YOUR RESPONSE</Text>
          <Text style={styles.duration}>{formatDuration(session.durationSeconds)}</Text>
        </View>
        <Card>
          <AnnotatedTranscript
            transcriptVerbatim={session.transcriptVerbatim ?? ""}
            durationSeconds={session.durationSeconds}
            fillerWordCount={session.fillerWordCount}
            fillerRatePerMinute={session.fillerRatePerMinute}
            annotations={scores?.annotations ?? []}
          />
        </Card>

        <Pressable style={styles.verbatimToggle} onPress={() => setShowClean((v) => !v)}>
          <Text style={styles.verbatimToggleText}>{showClean ? "Hide cleaned-up response" : "Show cleaned-up response"}</Text>
          <Ionicons name={showClean ? "chevron-up" : "chevron-down"} size={16} color={colors.accent} />
        </Pressable>
        {showClean ? (
          <Card style={styles.verbatimCard}>
            <Text style={styles.transcript}>{session.transcriptClean}</Text>
          </Card>
        ) : null}
      </ScrollView>

      <PrimaryButton label="Done" onPress={() => navigation.popToTop()} />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.md },
  centered: { alignItems: "center", justifyContent: "center" },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  headerSpacer: { width: 22 },
  scrollContent: { gap: spacing.md, paddingBottom: spacing.lg },
  notionCard: { gap: spacing.sm },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.md },
  rowText: { flex: 1, gap: spacing.xs },
  rowTitle: { color: colors.textPrimary, fontSize: typography.body, fontWeight: "600" },
  rowSubtitle: { color: colors.textSecondary, fontSize: typography.caption },
  gradeCard: { gap: spacing.md },
  overallCard: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  overallTextGroup: { flex: 1, gap: spacing.xs },
  archetypeFit: { color: colors.textSecondary, fontSize: typography.caption, lineHeight: 17 },
  promptCard: { gap: spacing.sm },
  promptText: { color: colors.textSecondary, fontSize: typography.body, lineHeight: 21, fontStyle: "italic" },
  sectionHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: spacing.sm },
  sectionLabel: { color: colors.accent, fontSize: typography.caption - 1, fontWeight: "700", letterSpacing: 1 },
  sectionSpacer: { marginTop: spacing.sm },
  duration: { color: colors.textMuted, fontSize: typography.caption },
  transcript: { color: colors.textPrimary, fontSize: typography.bodyLarge, lineHeight: 25 },
  verbatimToggle: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.xs, paddingVertical: spacing.sm },
  verbatimToggleText: { color: colors.accent, fontSize: typography.body, fontWeight: "600" },
  verbatimCard: { backgroundColor: colors.surfaceRaised },
  coachingCard: { gap: spacing.sm },
  coachingSummary: { color: colors.textPrimary, fontSize: typography.body, lineHeight: 21 },
  coachingRow: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm },
  coachingRowText: { flex: 1, color: colors.textSecondary, fontSize: typography.body, lineHeight: 20 },
  coachingRowLabel: { color: colors.textPrimary, fontWeight: "700" },
  drillBox: { backgroundColor: colors.accentMuted, borderRadius: 10, padding: spacing.md, gap: spacing.xs, marginTop: spacing.xs },
  drillLabel: { color: colors.accent, fontSize: typography.caption - 1, fontWeight: "700", letterSpacing: 1 },
  drillText: { color: colors.textPrimary, fontSize: typography.body, lineHeight: 20 },
  scoresCard: { gap: spacing.md },
  bodyLanguageNotes: { color: colors.textSecondary, fontSize: typography.caption, lineHeight: 17, marginTop: -spacing.xs },
});
