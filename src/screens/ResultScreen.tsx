import { useCallback, useEffect, useState } from "react";
import { Alert, Pressable, ScrollView, Text, View } from "react-native";
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
import { AccordionSection } from "../components/result/AccordionSection";
import { colorForScore } from "../components/result/scoreColor";
import { ThreePassPlayer } from "../components/review/ThreePassPlayer";
import { AnalysisStepsCard } from "../components/result/AnalysisStepsCard";
import { CoachCard } from "../components/result/CoachCard";
import { ComparisonCard } from "../components/result/ComparisonCard";
import { getPromptComparison } from "../services/db/statsRepo";
import type { CoachOutput } from "../domain/coach/ruleCoach";
import { AnnotatedTranscript } from "../components/result/AnnotatedTranscript";
import { ScoreRadarChart } from "../components/result/ScoreRadarChart";
import { WpmSparkline } from "../components/result/WpmSparkline";
import { PitchVolumeChart } from "../components/result/PitchVolumeChart";
import { useToast } from "../components/common/ToastProvider";
import { getSessionById, deleteSession, deleteSessionVideo } from "../services/db/sessionsRepo";
import { getPreviousOverallScore, getScoresBySessionId } from "../services/db/scoresRepo";
import { getPrompt } from "../services/db/promptsRepo";
import { getScriptById } from "../services/db/scriptsRepo";
import { deleteRecording, resolveVideoUri, videoExists } from "../services/storage/videoStorage";
import { requestStep } from "../services/pipeline/sessionPipeline";
import { getArtifact } from "../services/db/artifactsRepo";
import { describeSessionSubject, subjectFromSession, type SessionSubjectSummary } from "../services/sessions/sessionSubject";
import { useSessionSteps } from "../hooks/useSessionSteps";
import type { CloudTranscriptArtifact } from "../services/pipeline/steps/cloudReviewStep";
import type { SessionStep } from "../domain/sessionSteps";
import { logger } from "../utils/logger";
import { completePracticeStep } from "../services/practice/practiceEvents";
import { colorForCategory } from "../domain/categoryColor";
import { makeAdhocPrompt, type Prompt, type Session, type SessionScores } from "../domain/sessionTypes";
import { formatDuration } from "../utils/dateUtils";
import { fontDisplay, spacing, typography } from "../theme/theme";
import { makeStyles, useTheme } from "../theme/ThemeProvider";

type Props = NativeStackScreenProps<RootStackParamList, "Result">;
type ResultTab = "overview" | "scores" | "transcript";

// Rounds to 1 decimal — used for an accordion category's collapsed-header
// summary number, averaged from that category's individual ScoreBars since
// the grading model doesn't emit a per-category composite score itself.
function avgScore(...scores: number[]): number {
  return Math.round((scores.reduce((sum, s) => sum + s, 0) / scores.length) * 10) / 10;
}

function ScoreDelta({ current, previous }: { current: number; previous: number | null }) {
  const styles = useStyles();
  const { colors } = useTheme();
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

function NumberTile({ value, label }: { value: string; label: string }) {
  const styles = useStyles();
  return (
    <View style={styles.tile}>
      <Text style={styles.tileValue}>{value}</Text>
      <Text style={styles.tileLabel}>{label}</Text>
    </View>
  );
}

export function ResultScreen({ route, navigation }: Props) {
  const styles = useStyles();
  const { colors } = useTheme();
  const { sessionId } = route.params;
  const showToast = useToast();
  const [session, setSession] = useState<Session | null>(null);
  const [prompt, setPrompt] = useState<Prompt | undefined>(undefined);
  const [scores, setScores] = useState<SessionScores | null>(null);
  const [previousOverallScore, setPreviousOverallScore] = useState<number | null>(null);
  const [tab, setTab] = useState<ResultTab>("overview");
  const [showClean, setShowClean] = useState(false);
  const [subjectSummary, setSubjectSummary] = useState<SessionSubjectSummary | null>(null);
  const [cloudTranscript, setCloudTranscript] = useState<CloudTranscriptArtifact | null>(null);
  const [coach, setCoach] = useState<CoachOutput | null>(null);
  const [comparison, setComparison] = useState<Awaited<ReturnType<typeof getPromptComparison>>>(null);

  // Reloaded whenever an analysis step finishes, so results fill in live.
  const loadAll = useCallback(() => {
    getSessionById(sessionId).then((s) => {
      setSession(s);
      if (!s) return;
      getPreviousOverallScore(s.recordedAt).then(setPreviousOverallScore);
      if (s.sessionType !== "script_practice") getPrompt(s.promptId).then(setPrompt);
      describeSessionSubject(s).then(setSubjectSummary);
    });
    getScoresBySessionId(sessionId).then(setScores);
    getArtifact<CloudTranscriptArtifact>(sessionId, "cloud_transcript").then(setCloudTranscript);
    getArtifact<CoachOutput>(sessionId, "coach").then(setCoach);
    getPromptComparison(sessionId).then(setComparison);
  }, [sessionId]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const { steps } = useSessionSteps(sessionId, loadAll);

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

  function handleRunStep(step: SessionStep) {
    requestStep(sessionId, step).catch((error) => {
      logger.error(`[result] ${step} failed to start — ${(error as Error).message}`);
      showToast("Couldn't start that — try again", "error");
    });
  }

  // Back to wherever this was opened from (daily session, History, a
  // library). Only a Plan-Your-Point screen underneath is skipped — that
  // take is finished.
  async function handleDone() {
    if (route.params.practice) await completePracticeStep(route.params.practice, null);
    const routes = navigation.getState().routes;
    const below = routes[routes.length - 2]?.name;
    if (!below || below === "PlanYourPoint") navigation.popToTop();
    else navigation.goBack();
  }

  // Answering the coach's follow-up out loud is a fresh impromptu rep.
  function handleAnswerFollowUp(question: string) {
    navigation.navigate("Recording", { kind: "prompt", prompt: makeAdhocPrompt(question, "Follow-up") });
  }

  async function handlePracticeAgain() {
    const subject = session ? await subjectFromSession(session) : null;
    if (!subject) {
      showToast("Couldn't find this prompt anymore", "error");
      return;
    }
    navigation.navigate("Recording", subject);
  }

  async function handleDeleteVideo() {
    await deleteSessionVideo(sessionId);
    deleteRecording(resolveVideoUri(session!));
    setSession((prev) => (prev ? { ...prev, videoDeletedAt: new Date().toISOString() } : prev));
    showToast("Video deleted — transcript and scores kept", "success");
  }

  async function handleDeleteSession() {
    await deleteSession(sessionId);
    deleteRecording(resolveVideoUri(session!));
    navigation.popToTop();
  }

  function handleDelete() {
    const buttons: Parameters<typeof Alert.alert>[2] = [{ text: "Cancel", style: "cancel" }];
    if (!session!.videoDeletedAt) {
      buttons.push({ text: "Delete Video", style: "destructive", onPress: handleDeleteVideo });
    }
    buttons.push({ text: "Delete Session", style: "destructive", onPress: handleDeleteSession });

    Alert.alert(
      "Delete this session?",
      "Delete Video frees up space but keeps the transcript and scores (a deep review won't be possible afterwards). Delete Session removes it everywhere, including your stats.",
      buttons,
    );
  }

  const videoUri = resolveVideoUri(session);
  const hasVideo = !session.videoDeletedAt && videoExists(videoUri);
  const deepReviewBlocked = !hasVideo ? "Needs the video, which has been deleted." : undefined;
  const avgWpm =
    session.transcriptWords && session.transcriptWords.length > 0 && session.durationSeconds > 0
      ? Math.round(session.transcriptWords.length / (session.durationSeconds / 60))
      : null;
  const pitchRange =
    session.pitchMaxHz != null && session.pitchMinHz != null ? Math.round(session.pitchMaxHz - session.pitchMinHz) : null;
  // Deep-review annotations quote Gemini's own transcript, so show that one
  // when annotating; otherwise the on-device transcript.
  const annotatedTranscript =
    scores && scores.annotations.length > 0 && cloudTranscript ? cloudTranscript.verbatim : session.transcriptVerbatim ?? "";

  return (
    <ScreenContainer style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text style={styles.headerType}>{subjectSummary?.typeLabel.toUpperCase() ?? ""}</Text>
          <Text style={styles.headerTitle} numberOfLines={2}>
            {subjectSummary?.title ?? ""}
          </Text>
        </View>
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
          {scores ? (
            <HeroCard
              contentStyle={styles.scoreHeroContent}
              accent={colorForScore(scores.overallScore, colors)}
              accentSecondary={colors.violet}
            >
              <ProgressRing
                size={132}
                strokeWidth={10}
                progress={scores.overallScore / 10}
                color={colorForScore(scores.overallScore, colors)}
              >
                <Text style={[styles.scoreHeroNumber, { color: colorForScore(scores.overallScore, colors) }]}>
                  {scores.overallScore}
                </Text>
                <Text style={styles.scoreHeroOutOf}>OUT OF 10</Text>
              </ProgressRing>
              <Text style={[styles.scoreHeroArchetype, { color: colorForScore(scores.overallScore, colors) }]}>
                {scores.archetypeDetected}
              </Text>
              <ScoreDelta current={scores.overallScore} previous={previousOverallScore} />
              <Text style={styles.scoreHeroFit}>{scores.archetypeFitForTopic}</Text>
            </HeroCard>
          ) : coach ? null : (
            <Card style={styles.numbersCard}>
              <Text style={styles.numbersLabel}>YOUR NUMBERS</Text>
              <View style={styles.numbersRow}>
                <NumberTile value={avgWpm != null ? `${avgWpm}` : "—"} label="words / min" />
                <NumberTile
                  value={session.fillerRatePerMinute != null ? `${session.fillerRatePerMinute}` : "—"}
                  label="fillers / min"
                />
                <NumberTile value={pitchRange != null ? `${pitchRange} Hz` : "—"} label="pitch range" />
              </View>
              <Text style={styles.rowSubtitle}>Measured on this phone. A deep review adds structure and presence scores.</Text>
            </Card>
          )}

          {coach ? <CoachCard coach={coach} onAnswerFollowUp={handleAnswerFollowUp} /> : null}

          {comparison ? <ComparisonCard current={comparison.current} previous={comparison.previous} /> : null}

          {prompt ? (
            <Card style={styles.promptCard}>
              <Badge label={prompt.category} {...colorForCategory(prompt.category, colors)} />
              <Text style={styles.promptText}>{prompt.text}</Text>
            </Card>
          ) : null}

          {script ? (
            <Card style={styles.promptCard}>
              <Badge label={script.category} {...colorForCategory(script.category, colors)} />
              <Text style={styles.rowTitle}>{script.title}</Text>
              <Text style={styles.promptText} numberOfLines={3}>
                {script.text}
              </Text>
            </Card>
          ) : null}

          {hasVideo ? (
            <ThreePassPlayer
              sessionId={sessionId}
              videoUri={videoUri}
              transcriptWords={session.transcriptWords}
              transcriptText={session.transcriptClean}
            />
          ) : (
            <View style={styles.videoRemovedRow}>
              <Ionicons name="trash-outline" size={16} color={colors.textMuted} />
              <Text style={styles.videoRemovedText}>Video removed to save space</Text>
            </View>
          )}

          <AnalysisStepsCard steps={steps} onRun={handleRunStep} disabledReason={{ cloud_review: deepReviewBlocked }} />

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

          <PrimaryButton label="Practice this prompt again" variant="secondary" onPress={handlePracticeAgain} />
        </ScrollView>
      ) : null}

      {tab === "scores" && scores ? (
        <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          <Card style={styles.radarCard}>
            <ScoreRadarChart scores={scores} />
          </Card>

          {/* Structure starts open since it's the first thing most people read;
              every other category starts collapsed — the radar chart above
              already gives the at-a-glance summary, so this replaces what used
              to be all ~9 factors expanded in one long scroll (confirmed live). */}
          <AccordionSection title="Structure" scoreLabel={`${scores.structureScore}/10`} defaultOpen>
            <ScoreBar
              label={scores.structureUsed === "none detected" ? "No clear structure" : scores.structureUsed}
              score={scores.structureScore}
              notes={scores.structureNotes}
            />
          </AccordionSection>

          <AccordionSection title="Content" scoreLabel={`${avgScore(scores.relevanceScore, scores.coherenceScore)}/10`}>
            <ScoreBar label="Relevance to prompt" score={scores.relevanceScore} notes={scores.relevanceNotes} />
            <ScoreBar label="Coherence & storytelling" score={scores.coherenceScore} notes={scores.coherenceNotes} />
          </AccordionSection>

          <AccordionSection
            title="Delivery"
            scoreLabel={`${avgScore(scores.rateScore, scores.volumeScore, scores.pitchMelodyScore, scores.tonalityScore, scores.pausingScore)}/10`}
          >
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
          </AccordionSection>

          <AccordionSection title="Presence" scoreLabel={`${avgScore(scores.eyeContactScore, scores.facialExpressivenessScore)}/10`}>
            <ScoreBar label="Eye Contact" score={scores.eyeContactScore} />
            <ScoreBar label="Facial Expressiveness" score={scores.facialExpressivenessScore} />
            <Text style={styles.bodyLanguageNotes}>{scores.bodyLanguageNotes}</Text>
          </AccordionSection>

          <AccordionSection title="Face-Voice Congruence" scoreLabel={`${scores.faceVoiceCongruenceScore}/10`}>
            <ScoreBar label="Congruence" score={scores.faceVoiceCongruenceScore} />
          </AccordionSection>

          {scores.cueComplianceScore !== null ? (
            <AccordionSection title="Cue Compliance" scoreLabel={`${scores.cueComplianceScore}/10`}>
              <ScoreBar
                label="Followed the on-screen cues"
                score={scores.cueComplianceScore}
                notes={scores.cueComplianceNotes ?? undefined}
              />
            </AccordionSection>
          ) : null}
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
              transcriptVerbatim={annotatedTranscript}
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

      <PrimaryButton label="Done" onPress={handleDone} />
    </ScreenContainer>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  container: { gap: spacing.md },
  centered: { alignItems: "center", justifyContent: "center" },
  header: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: spacing.md },
  headerText: { flex: 1, gap: 2 },
  headerType: { color: colors.textMuted, fontSize: typography.caption - 1, fontWeight: "700", letterSpacing: 1 },
  headerTitle: { color: colors.textPrimary, fontSize: typography.bodyLarge, fontWeight: "700", lineHeight: 22 },
  numbersCard: { gap: spacing.md },
  numbersLabel: { color: colors.textMuted, fontSize: typography.caption - 1, fontWeight: "700", letterSpacing: 1 },
  numbersRow: { flexDirection: "row", gap: spacing.sm },
  tile: { flex: 1, alignItems: "center", gap: 2, paddingVertical: spacing.sm, borderRadius: 12, backgroundColor: colors.surfaceRaised },
  tileValue: { color: colors.textPrimary, fontFamily: fontDisplay.bold, fontSize: 22 },
  tileLabel: { color: colors.textMuted, fontSize: typography.caption - 1 },
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
  radarCard: { alignItems: "center" },
  bodyLanguageNotes: { color: colors.textSecondary, fontSize: typography.caption, lineHeight: 17 },
}));
