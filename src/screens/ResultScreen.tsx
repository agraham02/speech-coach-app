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
import { HeroCard } from "../components/common/HeroCard";
import { ProgressRing } from "../components/common/ProgressRing";
import { SegmentedControl } from "../components/common/SegmentedControl";
import { ScoreBar } from "../components/result/ScoreBar";
import { colorForScore } from "../components/result/scoreColor";
import { VideoPlayback } from "../components/result/VideoPlayback";
import { AnnotatedTranscript } from "../components/result/AnnotatedTranscript";
import { ScoreRadarChart } from "../components/result/ScoreRadarChart";
import { WpmSparkline } from "../components/result/WpmSparkline";
import { PitchVolumeChart } from "../components/result/PitchVolumeChart";
import { useToast } from "../components/common/ToastProvider";
import { getSessionById, deleteSession, deleteSessionVideo } from "../services/db/sessionsRepo";
import { getPreviousOverallScore, getScoresBySessionId } from "../services/db/scoresRepo";
import { getPrompt } from "../services/db/promptsRepo";
import { getScriptById } from "../services/db/scriptsRepo";
import { deleteRecording } from "../services/storage/videoStorage";
import { syncSessionToNotion, gradeExistingSession, sessionToGradingContext } from "../services/pipeline/sessionProcessor";
import { describeGeminiError } from "../services/gemini/describeError";
import { describeNotionError } from "../services/notion/describeError";
import { colorForCategory } from "../domain/categoryColor";
import type { Prompt, Session, SessionScores } from "../domain/sessionTypes";
import { formatDuration } from "../utils/dateUtils";
import { colors, fontDisplay, spacing, typography } from "../theme/theme";

type Props = NativeStackScreenProps<RootStackParamList, "Result">;
type ResultTab = "overview" | "scores" | "transcript";

function ScoreDelta({ current, previous }: { current: number; previous: number | null }) {
  if (previous === null) return null;
  const diff = Math.round((current - previous) * 10) / 10;
  if (diff === 0) {
    return <Text style={styles.deltaNeutral}>Same as last session</Text>;
  }
  const isUp = diff > 0;
  return (
    <View style={styles.deltaRow}>
      <Ionicons name={isUp ? "arrow-up" : "arrow-down"} size={12} color={isUp ? colors.success : colors.warning} />
      <Text style={[styles.deltaText, { color: isUp ? colors.success : colors.warning }]}>
        {Math.abs(diff)} vs last session
      </Text>
    </View>
  );
}

export function ResultScreen({ route, navigation }: Props) {
  const { sessionId } = route.params;
  const showToast = useToast();
  const [session, setSession] = useState<Session | null>(null);
  const [prompt, setPrompt] = useState<Prompt | undefined>(undefined);
  const [scores, setScores] = useState<SessionScores | null>(null);
  const [previousOverallScore, setPreviousOverallScore] = useState<number | null>(null);
  const [tab, setTab] = useState<ResultTab>("overview");
  const [showClean, setShowClean] = useState(false);
  const [showVideo, setShowVideo] = useState(false);
  const [isSyncingNotion, setIsSyncingNotion] = useState(false);
  const [isGrading, setIsGrading] = useState(false);

  useEffect(() => {
    getSessionById(sessionId).then((s) => {
      setSession(s);
      if (s) getPreviousOverallScore(s.recordedAt).then(setPreviousOverallScore);
      if (s && s.sessionType !== "script_practice") getPrompt(s.promptId).then(setPrompt);
    });
    getScoresBySessionId(sessionId).then(setScores);
  }, [sessionId]);

  if (!session) {
    return (
      <ScreenContainer style={styles.centered}>
        <LoadingSpinner />
      </ScreenContainer>
    );
  }

  const script = session.sessionType === "script_practice" && session.scriptId ? getScriptById(session.scriptId) : undefined;

  // The Scores tab is only meaningful once grading has happened — the
  // transcript exists regardless of whether grading was requested (see
  // sessionProcessor.ts's non-grading path), so Transcript stays available
  // either way.
  const tabs: { key: ResultTab; label: string }[] = scores
    ? [
        { key: "overview", label: "Overview" },
        { key: "scores", label: "Scores" },
        { key: "transcript", label: "Transcript" },
      ]
    : [
        { key: "overview", label: "Overview" },
        { key: "transcript", label: "Transcript" },
      ];

  async function handleNotionToggle(value: boolean) {
    if (!value || session!.notionSyncedAt) return;
    setIsSyncingNotion(true);
    try {
      await syncSessionToNotion(sessionId);
      const updated = await getSessionById(sessionId);
      setSession(updated);
      showToast("Saved to Notion", "success");
    } catch (error) {
      showToast(`Couldn't sync to Notion — ${describeNotionError(error)}`, "error");
    } finally {
      setIsSyncingNotion(false);
    }
  }

  async function handleGrade() {
    if (!session) return;
    const context = await sessionToGradingContext(session);
    if (!context) return;
    setIsGrading(true);
    try {
      await gradeExistingSession(sessionId, context, session.videoPath);
      const [updatedSession, updatedScores] = await Promise.all([
        getSessionById(sessionId),
        getScoresBySessionId(sessionId),
      ]);
      setSession(updatedSession);
      setScores(updatedScores);
      showToast("Grading complete", "success");
    } catch (error) {
      showToast(`Grading failed — ${describeGeminiError(error)}`, "error");
    } finally {
      setIsGrading(false);
    }
  }

  async function handleDeleteVideo() {
    await deleteSessionVideo(sessionId);
    deleteRecording(session!.videoPath);
    setSession((prev) => (prev ? { ...prev, videoDeletedAt: new Date().toISOString() } : prev));
    showToast("Video deleted — transcript and scores kept", "success");
  }

  async function handleDeleteSession() {
    await deleteSession(sessionId);
    deleteRecording(session!.videoPath);
    navigation.popToTop();
  }

  function handleDelete() {
    const buttons: Parameters<typeof Alert.alert>[2] = [{ text: "Cancel", style: "cancel" }];
    // Same rationale as HistoryScreen.tsx's confirmDelete: only offer once
    // grading is done and the video hasn't already been removed — grading
    // retry needs the local file since Gemini's Files API entries expire
    // after 48h (see sessionProcessor.ts).
    if (session!.status === "done" && !session!.videoDeletedAt) {
      buttons.push({ text: "Delete Video", style: "destructive", onPress: handleDeleteVideo });
    }
    buttons.push({ text: "Delete Session", style: "destructive", onPress: handleDeleteSession });

    Alert.alert(
      "Delete this session?",
      "Delete Video frees up space but keeps the transcript and scores. Delete Session removes it from History entirely (it's kept for Trends stats, just hidden here).",
      buttons,
    );
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

      <SegmentedControl options={tabs} value={tab} onChange={setTab} />

      {tab === "overview" ? (
        <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
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
            <HeroCard
              contentStyle={styles.scoreHeroContent}
              accent={colorForScore(scores.overallScore)}
              accentSecondary={colors.violet}
            >
              <ProgressRing
                size={132}
                strokeWidth={10}
                progress={scores.overallScore / 10}
                color={colorForScore(scores.overallScore)}
              >
                <Text style={[styles.scoreHeroNumber, { color: colorForScore(scores.overallScore) }]}>
                  {scores.overallScore}
                </Text>
                <Text style={styles.scoreHeroOutOf}>OUT OF 10</Text>
              </ProgressRing>
              <Text style={[styles.scoreHeroArchetype, { color: colorForScore(scores.overallScore) }]}>
                {scores.archetypeDetected}
              </Text>
              <ScoreDelta current={scores.overallScore} previous={previousOverallScore} />
              <Text style={styles.scoreHeroFit}>{scores.archetypeFitForTopic}</Text>
            </HeroCard>
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
              <Badge label={prompt.category} {...colorForCategory(prompt.category)} />
              <Text style={styles.promptText}>{prompt.text}</Text>
            </Card>
          ) : null}

          {script ? (
            <Card style={styles.promptCard}>
              <Badge label={script.category} {...colorForCategory(script.category)} />
              <Text style={styles.rowTitle}>{script.title}</Text>
              <Text style={styles.promptText} numberOfLines={3}>
                {script.text}
              </Text>
            </Card>
          ) : null}

          {session.videoDeletedAt ? (
            <View style={styles.videoRemovedRow}>
              <Ionicons name="trash-outline" size={16} color={colors.textMuted} />
              <Text style={styles.videoRemovedText}>Video removed to save space</Text>
            </View>
          ) : (
            <>
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
            </>
          )}

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
        </ScrollView>
      ) : null}

      {tab === "scores" && scores ? (
        <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
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
            <WpmSparkline wpmCurve={session.wpmCurve} />
            <ScoreBar label="Volume" score={scores.volumeScore} notes={scores.volumeNotes} />
            <ScoreBar label="Pitch & Melody" score={scores.pitchMelodyScore} notes={scores.pitchMelodyNotes} />
            <ScoreBar label="Tonality" score={scores.tonalityScore} notes={scores.tonalityNotes} />
            <ScoreBar label="Pausing" score={scores.pausingScore} notes={scores.pausingNotes} />
            <PitchVolumeChart
              dspStatus={session.dspStatus}
              pitchContourHz={session.pitchContourHz}
              volumeEnvelopeDbfs={session.volumeEnvelopeDbfs}
            />

            <Text style={[styles.sectionLabel, styles.sectionSpacer]}>PRESENCE</Text>
            <ScoreBar label="Eye Contact" score={scores.eyeContactScore} />
            <ScoreBar label="Facial Expressiveness" score={scores.facialExpressivenessScore} />
            <Text style={styles.bodyLanguageNotes}>{scores.bodyLanguageNotes}</Text>

            <Text style={[styles.sectionLabel, styles.sectionSpacer]}>FACE-VOICE CONGRUENCE</Text>
            <ScoreBar label="Congruence" score={scores.faceVoiceCongruenceScore} />

            {scores.cueComplianceScore !== null ? (
              <>
                <Text style={[styles.sectionLabel, styles.sectionSpacer]}>CUE COMPLIANCE</Text>
                <ScoreBar
                  label="Followed the on-screen cues"
                  score={scores.cueComplianceScore}
                  notes={scores.cueComplianceNotes ?? undefined}
                />
              </>
            ) : null}
          </Card>
        </ScrollView>
      ) : null}

      {tab === "transcript" ? (
        <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
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
              transcriptWords={session.transcriptWords}
              repeatedWordCount={session.repeatedWordCount}
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
      ) : null}

      <PrimaryButton label="Done" onPress={() => navigation.popToTop()} />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.md },
  centered: { alignItems: "center", justifyContent: "center" },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  headerSpacer: { width: 22 },
  scroll: { flex: 1 },
  scrollContent: { gap: spacing.md, paddingBottom: spacing.lg },
  notionCard: { gap: spacing.sm },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.md },
  rowText: { flex: 1, gap: spacing.xs },
  rowTitle: { color: colors.textPrimary, fontSize: typography.body, fontWeight: "600" },
  rowSubtitle: { color: colors.textSecondary, fontSize: typography.caption },
  gradeCard: { gap: spacing.md },
  scoreHeroContent: { alignItems: "center", gap: spacing.xs },
  scoreHeroNumber: { fontFamily: fontDisplay.bold, fontSize: 40, lineHeight: 44 },
  scoreHeroOutOf: { color: colors.textMuted, fontSize: typography.caption - 2, letterSpacing: 0.5, marginTop: 2 },
  scoreHeroArchetype: {
    fontSize: typography.caption,
    fontWeight: "800",
    letterSpacing: 1,
    textTransform: "uppercase",
    marginTop: spacing.xs,
  },
  scoreHeroFit: { color: colors.textSecondary, fontSize: typography.caption, lineHeight: 17, textAlign: "center", marginTop: spacing.xs },
  deltaRow: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  deltaText: { fontSize: typography.caption, fontWeight: "600" },
  deltaNeutral: { color: colors.textMuted, fontSize: typography.caption },
  promptCard: { gap: spacing.sm },
  promptText: { color: colors.textSecondary, fontSize: typography.body, lineHeight: 21, fontStyle: "italic" },
  sectionHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  sectionLabel: { color: colors.accent, fontSize: typography.caption - 1, fontWeight: "700", letterSpacing: 1 },
  sectionSpacer: { marginTop: spacing.sm },
  duration: { color: colors.textMuted, fontSize: typography.caption },
  transcript: { color: colors.textPrimary, fontSize: typography.bodyLarge, lineHeight: 25 },
  verbatimToggle: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.xs, paddingVertical: spacing.sm },
  verbatimToggleText: { color: colors.accent, fontSize: typography.body, fontWeight: "600" },
  videoRemovedRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.xs, paddingVertical: spacing.sm },
  videoRemovedText: { color: colors.textMuted, fontSize: typography.body },
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
