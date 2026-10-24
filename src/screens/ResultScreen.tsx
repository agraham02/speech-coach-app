import { useCallback, useEffect, useState } from "react";
import { Reveal, Skeleton, SkeletonCard, SkeletonHero } from "../components/common/Skeleton";
import { GuideTip, TourScrollContext, TourTarget, useTourScroll } from "../components/common/GuideTip";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../navigation";
import { ScreenContainer } from "../components/common/ScreenContainer";
import { PrimaryButton } from "../components/common/PrimaryButton";
import { Card } from "../components/common/Card";
import { Badge } from "../components/common/Badge";
import { HeroCard } from "../components/common/HeroCard";
import { IconButton } from "../components/common/IconButton";
import { Txt } from "../components/common/Txt";
import { ProgressRing } from "../components/common/ProgressRing";
import { SegmentedControl } from "../components/common/SegmentedControl";
import { colorForScore } from "../components/result/scoreColor";
import { ThreePassPlayer } from "../components/review/ThreePassPlayer";
import { AnalysisStepsCard } from "../components/result/AnalysisStepsCard";
import { CoachCard } from "../components/result/CoachCard";
import { ComparisonCard } from "../components/result/ComparisonCard";
import { ScoreSummaryCard } from "../components/result/ScoreSummaryCard";
import { ScoresTab } from "../components/result/ScoresTab";
import { headlineSheet, SCORE_SHEET_VERSION, type TakeScores } from "../domain/scoring/takeScore";
import { measuredVoice, refreshSessionScore } from "../services/sessions/sessionScoreService";
import { FeltCard, ObservedCard, useFeltObserved } from "../components/result/FeltObservedCard";
import { CloudUsageNote } from "../components/result/CloudUsageNote";
import { getPromptComparison } from "../services/db/statsRepo";
import type { CoachOutput } from "../domain/coach/ruleCoach";
import { AnnotatedTranscript } from "../components/result/AnnotatedTranscript";
import { groundAiMarks } from "../domain/results/aiMarks";
import { producerName } from "../domain/analysis/provenance";
import { useToast } from "../components/common/ToastProvider";
import { getSessionById } from "../services/db/sessionsRepo";
import { confirmDeleteTake } from "../components/common/confirmDeleteTake";
import { getPreviousOverallScore, getScoresBySessionId } from "../services/db/scoresRepo";
import { getPrompt } from "../services/db/promptsRepo";
import { getScriptById } from "../services/db/scriptsRepo";
import { resolveVideoUri, videoExists } from "../services/storage/videoStorage";
import { requestStep } from "../services/pipeline/sessionPipeline";
import { currentProvider, reviewBlockedReason } from "../services/cloud/providers";
import { readyForDeepReview } from "../services/cloud/consent";
import { setVideoKeepsake } from "../services/data/videoKeepsakes";
import { getArtifact } from "../services/db/artifactsRepo";
import { describeSessionSubject, subjectFromSession, type SessionSubjectSummary } from "../services/sessions/sessionSubject";
import { useSessionSteps } from "../hooks/useSessionSteps";
import { useProgressMoment } from "../hooks/useProgressMoment";
import { ProgressPending, ProgressReveal } from "../components/celebrate/ProgressReveal";
import { FeelingResultView } from "../components/feelings/FeelingResultView";
import type { SessionStep } from "../domain/sessionSteps";
import { logger } from "../utils/logger";
import { completePracticeStep } from "../services/practice/practiceEvents";
import { colorForCategory } from "../domain/categoryColor";
import { makeAdhocPrompt, type Prompt, type Session, type SessionScores } from "../domain/sessionTypes";
import { taskLabel, taskOf } from "../domain/promptTask";
import { formatDuration } from "../utils/dateUtils";
import { fontDisplay, radii, spacing, typography, font } from "../theme/theme";
import { makeStyles, useTheme } from "../theme/ThemeProvider";

type Props = NativeStackScreenProps<RootStackParamList, "Result">;
type ResultTab = "overview" | "scores" | "transcript";

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
  const [coach, setCoach] = useState<CoachOutput | null>(null);
  const [takeScores, setTakeScores] = useState<TakeScores | null>(null);
  // A moment picked on a Scores chart, for the Overview player to start at.
  const [startAt, setStartAt] = useState<{ ms: number; nonce: number } | null>(null);
  // Felt vs observed: the first question at the top, the second by the video.
  const feltObserved = useFeltObserved(sessionId);
  const [comparison, setComparison] = useState<Awaited<ReturnType<typeof getPromptComparison>>>(null);

  // Reloaded whenever an analysis step finishes, so results fill in live.
  const loadAll = useCallback(() => {
    getSessionById(sessionId).then((s) => {
      setSession(s);
      if (!s) return;
      if (s.sessionType !== "script_practice") getPrompt(s.promptId).then(setPrompt);
      describeSessionSubject(s).then(setSubjectSummary);
    });
    getScoresBySessionId(sessionId).then(setScores);
    getArtifact<CoachOutput>(sessionId, "coach").then(setCoach);
    // A take scored before the current rules is rescored now. The delta
    // compares with the last take scored in the same layer (judged with
    // judged, measured with measured), never across the two.
    getArtifact<TakeScores>(sessionId, "session_score")
      .then((b) => (b && b.version >= SCORE_SHEET_VERSION ? b : refreshSessionScore(sessionId)))
      .then((fresh) => {
        setTakeScores(fresh);
        getSessionById(sessionId).then((s) => {
          if (s && fresh) getPreviousOverallScore(s.recordedAt, fresh.headline).then(setPreviousOverallScore);
        });
      });
    getPromptComparison(sessionId).then(setComparison);
  }, [sessionId]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const { steps } = useSessionSteps(sessionId, loadAll);
  const { tourScroll, scrollProps } = useTourScroll();
  // Impromptu takes move your skills; their Result plays what moved.
  const movesSkills = session?.sessionType === "spontaneous" || session?.sessionType === "concise";
  const { moment, animate } = useProgressMoment(sessionId, movesSkills);

  if (!session) {
    return (
      <ScreenContainer style={styles.skeleton}>
        <Skeleton height={14} width="30%" />
        <Skeleton height={28} width="75%" />
        <View style={styles.skeletonTiles}>
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} height={72} radius={16} style={styles.flex} />
          ))}
        </View>
        <SkeletonCard lines={4} />
        <SkeletonCard lines={3} />
      </ScreenContainer>
    );
  }

  const script = session.sessionType === "script_practice" && session.scriptId ? getScriptById(session.scriptId) : undefined;

  // The Scores tab reads the take's score sheets, so it is there for every
  // scored take (measured on the phone, or judged too); the transcript exists
  // regardless, so Transcript stays available either way.
  const tabs: { key: ResultTab; label: string }[] = takeScores
    ? [
        { key: "overview", label: "Overview" },
        { key: "scores", label: "Scores" },
        { key: "transcript", label: "Transcript" },
      ]
    : [
        { key: "overview", label: "Overview" },
        { key: "transcript", label: "Transcript" },
      ];

  async function handleRunStep(step: SessionStep) {
    if (step === "cloud_review" && !(await readyForDeepReview(() => navigation.navigate("Settings", { section: "deepReviews" })))) return;
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

  async function handleToggleKeepsake() {
    const keep = !session!.videoKeepsake;
    setSession((prev) => (prev ? { ...prev, videoKeepsake: keep } : prev));
    try {
      await setVideoKeepsake(sessionId, keep);
      showToast(keep ? "Kept as a progress video — clearing old videos won't remove it" : "No longer a progress video", "success");
    } catch (error) {
      logger.error(`[result] keepsake failed — ${(error as Error).message}`);
      setSession((prev) => (prev ? { ...prev, videoKeepsake: !keep } : prev));
      showToast("Couldn't save that — try again", "error");
    }
  }

  // Delete erases the whole take (with a few seconds to undo, offered from
  // wherever you land); "free up space" deletes only the video.
  function handleDelete() {
    confirmDeleteTake(session!, {
      onDeleted: () => navigation.popToTop(),
      onFreed: () => {
        setSession((prev) => (prev ? { ...prev, videoDeletedAt: new Date().toISOString() } : prev));
        showToast("Video deleted. Transcript and scores kept", "success");
      },
      onFailed: () => showToast("Couldn't delete that. Try again", "error"),
    });
  }

  const videoUri = resolveVideoUri(session);
  const hasVideo = !session.videoDeletedAt && videoExists(videoUri);

  // A Feeling of the Week rep is process only — no score, chart or coaching.
  if (session.sessionType === "feeling") {
    return <FeelingResultView session={session} steps={steps} hasVideo={hasVideo} videoUri={videoUri} onDone={handleDone} onDelete={handleDelete} />;
  }
  const deepReviewBlocked = reviewBlockedReason(currentProvider(), { hasVideo, hasDeviceTranscript: !!session.transcriptVerbatim });
  // Pace over the speaking span, and pitch range in semitones: the same
  // numbers the score reads.
  const { wpmAvg: avgWpm, pitchRangeSt: pitchRange } = measuredVoice(session);
  // The take's score: the judged sheet's overall whenever it exists, else
  // the measured one (domain/scoring/takeScore.ts).
  const overall = takeScores ? headlineSheet(takeScores).overall : null;
  // The transcript shown is always the phone's own. Tono AI's marks are kept
  // only where their quote is found in it (domain/results/aiMarks.ts).
  const shownTranscript = session.transcriptVerbatim ?? "";
  const aiMarks = scores ? groundAiMarks(shownTranscript, scores.annotations) : [];

  // What's still being worked out, so each section can hold its place with
  // a skeleton instead of popping in when its step finishes.
  const working = (step: SessionStep) => {
    const status = steps.find((s) => s.step === step)?.status;
    return status === "pending" || status === "running" || status === "interrupted";
  };
  const measuring = steps.length === 0 || (["transcribe", "audio_metrics", "presence", "coach"] as SessionStep[]).some(working);
  const reviewing = working("cloud_review");
  // The total waits until every part is in: averaging only what has finished
  // makes it jump (a lone voice score read 10, then settled at 9). A take that
  // already has a review keeps its score while it is reviewed again.
  const scoreSettled = !measuring && !(reviewing && !scores);

  return (
    <ScreenContainer style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <Txt variant="footnote" weight="500" tone="secondary" style={styles.flex}>
            {subjectSummary?.typeLabel ?? ""}
          </Txt>
          {hasVideo ? (
            <IconButton
              icon={session.videoKeepsake ? "bookmark" : "bookmark-outline"}
              color={session.videoKeepsake ? colors.warning : undefined}
              onPress={handleToggleKeepsake}
              size={38}
              accessibilityLabel={session.videoKeepsake ? "Remove from progress videos" : "Keep as a progress video"}
            />
          ) : null}
          <IconButton icon="trash-outline" onPress={handleDelete} size={38} accessibilityLabel="Delete session" />
        </View>
        <Txt variant="title1" numberOfLines={3}>
          {subjectSummary?.title ?? ""}
        </Txt>
      </View>

      <SegmentedControl options={tabs} value={tab} onChange={setTab} />

      {tab === "overview" ? (
        <TourScrollContext.Provider value={tourScroll}>
        <ScrollView {...scrollProps} style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          {hasVideo ? <FeltCard state={feltObserved} /> : null}

          <TourTarget id="result.score">
          {overall != null && scoreSettled ? (
            <Reveal key="hero">
              <HeroCard
                contentStyle={styles.scoreHeroContent}
                accent={colorForScore(overall, colors)}
                accentSecondary={colors.violet}
              >
                <ProgressRing size={156} strokeWidth={8} progress={overall / 10} color={colorForScore(overall, colors)}>
                  <Txt variant="display" style={styles.scoreHeroNumber}>
                    {overall}
                  </Txt>
                  <Text style={styles.scoreHeroOutOf}>out of 10</Text>
                </ProgressRing>
                <Text style={styles.scoreHeroLayer}>
                  {takeScores?.headline === "judged" ? `Judged by ${producerName(takeScores.judgedBy)}` : "Measured on this phone"}
                </Text>
                {movesSkills ? null : <ScoreDelta current={overall} previous={previousOverallScore} />}
                {reviewing ? (
                  <View style={styles.reviewingRow}>
                    <ActivityIndicator size="small" color={colors.textMuted} />
                    <Txt variant="footnote" tone="muted">
                      Deep review on the way — this score will sharpen.
                    </Txt>
                  </View>
                ) : null}
              </HeroCard>
            </Reveal>
          ) : measuring || reviewing ? (
            <SkeletonHero key="hero-skeleton" note={measuring ? "Listening back and measuring, on this phone…" : "Waiting for the deep review…"} />
          ) : coach ? null : (
            <Reveal key="numbers">
              <Card style={styles.numbersCard}>
                <Text style={styles.numbersLabel}>Your numbers</Text>
                <View style={styles.numbersRow}>
                  <NumberTile value={avgWpm != null ? `${avgWpm}` : "—"} label="words / min" />
                  <NumberTile
                    value={session.fillerRatePerMinute != null ? `${session.fillerRatePerMinute}` : "—"}
                    label="fillers / min"
                  />
                  <NumberTile value={pitchRange != null ? `${Math.round(pitchRange * 10) / 10} st` : "—"} label="pitch range" />
                </View>
                <Text style={styles.rowSubtitle}>Measured on this phone. A deep review adds structure and presence scores.</Text>
              </Card>
            </Reveal>
          )}
          </TourTarget>

          {movesSkills ? (
            moment ? (
              <ProgressReveal beats={moment.beats} animate={animate} />
            ) : measuring || reviewing ? (
              <ProgressPending reviewing={reviewing} />
            ) : null
          ) : null}

          <TourTarget id="result.breakdown">
          {takeScores ? (
            <Reveal key="breakdown">
              <ScoreSummaryCard scores={takeScores} pending={!scoreSettled} onSeeScores={() => setTab("scores")} />
            </Reveal>
          ) : measuring ? (
            <SkeletonCard key="breakdown-skeleton" lines={4} />
          ) : null}
          </TourTarget>

          {coach ? (
            <Reveal key="coach">
              <CoachCard
                coach={coach}
                review={scores && takeScores?.headline === "judged" ? { summary: scores.coachingSummary, drill: scores.recommendedDrill } : null}
                onAnswerFollowUp={handleAnswerFollowUp}
              />
            </Reveal>
          ) : measuring ? (
            <SkeletonCard key="coach-skeleton" lines={3} />
          ) : null}

          {comparison ? (
            <Reveal key="comparison">
              <ComparisonCard current={comparison.current} previous={comparison.previous} />
            </Reveal>
          ) : null}

          {prompt ? (
            <Card style={styles.promptCard}>
              <View style={styles.promptBadges}>
                <Badge label={prompt.category} {...colorForCategory(prompt.category, colors)} />
                {taskLabel(taskOf(prompt)) ? <Badge label={taskLabel(taskOf(prompt))!} /> : null}
              </View>
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
            <>
              <ThreePassPlayer
                sessionId={sessionId}
                videoUri={videoUri}
                transcriptWords={session.transcriptWords}
                transcriptText={session.transcriptClean}
                startAt={startAt}
              />
              <ObservedCard state={feltObserved} />
            </>
          ) : (
            <View style={styles.videoRemovedRow}>
              <Ionicons name="trash-outline" size={16} color={colors.textMuted} />
              <Text style={styles.videoRemovedText}>Video removed to save space</Text>
            </View>
          )}

          <TourTarget id="result.steps">
            <AnalysisStepsCard steps={steps} onRun={handleRunStep} disabledReason={{ cloud_review: deepReviewBlocked }} />
          </TourTarget>

          {scores ? <CloudUsageNote sessionId={sessionId} refreshKey={reviewing} /> : null}

          {!scores && reviewing ? <SkeletonCard key="coaching-skeleton" lines={4} /> : null}
          <PrimaryButton label="Practice this prompt again" variant="secondary" onPress={handlePracticeAgain} />
        </ScrollView>
        </TourScrollContext.Provider>
      ) : null}

      {tab === "scores" && takeScores ? (
        <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          <ScoresTab
            scores={takeScores}
            rubric={scores}
            session={session}
            onPlayFrom={
              hasVideo
                ? (ms) => {
                    setStartAt({ ms, nonce: Date.now() });
                    setTab("overview");
                  }
                : undefined
            }
          />
        </ScrollView>
      ) : null}

      {tab === "transcript" ? (
        <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionLabel}>Your response</Text>
            <Text style={styles.duration}>{formatDuration(session.durationSeconds)}</Text>
          </View>
          <Card>
            <AnnotatedTranscript
              transcriptVerbatim={shownTranscript}
              durationSeconds={session.durationSeconds}
              fillerWordCount={session.fillerWordCount}
              fillerRatePerMinute={session.fillerRatePerMinute}
              transcriptWords={session.transcriptWords}
              repeatedWordCount={session.repeatedWordCount}
              aiMarks={aiMarks}
              aiBy={takeScores?.headline === "judged" ? producerName(takeScores.judgedBy) : null}
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
      <GuideTip id="result" />
    </ScreenContainer>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  container: { gap: spacing.md },
  flex: { flex: 1 },
  skeleton: { gap: 16, paddingTop: 24 },
  skeletonTiles: { flexDirection: "row", gap: 8 },
  header: { gap: spacing.xs },
  headerTop: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  headerText: { flex: 1, gap: 2 },
  headerActions: { flexDirection: "row", alignItems: "center", gap: spacing.lg },
  headerType: { color: colors.textMuted, fontSize: 13, ...font("600") },
  headerTitle: { color: colors.textPrimary, fontSize: typography.bodyLarge, ...font("700"), lineHeight: 22 },
  numbersCard: { gap: spacing.md },
  numbersLabel: { color: colors.textMuted, fontSize: 13, ...font("600") },
  numbersRow: { flexDirection: "row", gap: spacing.sm },
  tile: { flex: 1, alignItems: "center", gap: 2, paddingVertical: spacing.md - 2, borderRadius: radii.md, backgroundColor: colors.surfaceRaised },
  tileValue: { color: colors.textPrimary, fontFamily: fontDisplay.title, fontSize: 26, lineHeight: 32, letterSpacing: -0.6 },
  tileLabel: { ...font("400"), color: colors.textMuted, fontSize: typography.caption - 1 },
  scroll: { flex: 1 },
  scrollContent: { gap: spacing.md, paddingBottom: spacing.lg },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.md },
  rowText: { flex: 1, gap: spacing.xs },
  rowTitle: { color: colors.textPrimary, fontSize: typography.body, ...font("600") },
  rowSubtitle: { ...font("400"), color: colors.textSecondary, fontSize: typography.caption },
  gradeCard: { gap: spacing.md },
  scoreHeroContent: { alignItems: "center", gap: spacing.sm, paddingVertical: spacing.xl },
  scoreHeroNumber: { fontSize: 60, lineHeight: 66, letterSpacing: -2.4 },
  scoreHeroOutOf: { ...font("400"), color: colors.textMuted, fontSize: 13, marginTop: 2 },
  scoreHeroLayer: { ...font("500"), color: colors.textSecondary, fontSize: typography.caption, marginTop: spacing.sm },
  reviewingRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: spacing.sm },
  deltaRow: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  deltaText: { fontSize: typography.caption, ...font("600") },
  deltaNeutral: { ...font("400"), color: colors.textMuted, fontSize: typography.caption },
  promptCard: { gap: spacing.sm },
  promptBadges: { flexDirection: "row", gap: spacing.xs + 2, flexWrap: "wrap" },
  promptText: { fontFamily: fontDisplay.spoken, color: colors.textPrimary, fontSize: 19, lineHeight: 26, letterSpacing: -0.2 },
  sectionHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  sectionLabel: { color: colors.textSecondary, fontSize: 13, ...font("600") },
  sectionSpacer: { marginTop: spacing.sm },
  duration: { ...font("400"), color: colors.textMuted, fontSize: typography.caption },
  transcript: { ...font("400"), color: colors.textPrimary, fontSize: typography.bodyLarge, lineHeight: 25 },
  verbatimToggle: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.xs, paddingVertical: spacing.sm },
  verbatimToggleText: { color: colors.textSecondary, fontSize: typography.body, ...font("600") },
  videoRemovedRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.xs, paddingVertical: spacing.sm },
  videoRemovedText: { ...font("400"), color: colors.textMuted, fontSize: typography.body },
  verbatimCard: { backgroundColor: colors.surfaceRaised },
}));
