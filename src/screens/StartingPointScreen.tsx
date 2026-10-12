import { useCallback, useEffect, useState } from "react";
import { ScrollView, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../navigation";
import { ScreenContainer } from "../components/common/ScreenContainer";
import { Header } from "../components/common/Header";
import { Card } from "../components/common/Card";
import { Txt } from "../components/common/Txt";
import { PrimaryButton } from "../components/common/PrimaryButton";
import { RatingScale } from "../components/common/RatingScale";
import { LoadingSpinner } from "../components/common/LoadingSpinner";
import { VideoPlayback } from "../components/result/VideoPlayback";
import { useSessionSteps } from "../hooks/useSessionSteps";
import { getSkillCheck, saveConfidenceCheckin, setSkillCheckResults, type StoredSkillCheck } from "../services/db/skillChecksRepo";
import { getSessionById } from "../services/db/sessionsRepo";
import { getArtifact } from "../services/db/artifactsRepo";
import { measuredVoice } from "../services/sessions/sessionScoreService";
import { getLessonStates, getSkillStates, seedSkillRatings } from "../services/db/progressRepo";
import { completeOnboarding, resetToTabs } from "../services/onboarding/onboarding";
import { getUserProfile, setUserProfile } from "../services/prefs/prefsStore";
import { evaluateSkillCheck, feltBelowObserved, type SkillCheckInput, type SkillCheckResult } from "../domain/skillCheck";
import { defaultsFromProfile, priorityFor } from "../domain/profile";
import { previewPlans, type DailyPlan } from "../domain/dailyPlan";
import { getLesson } from "../content/lessons";
import { SKILLS } from "../domain/mastery";
import type { PauseAnalysis } from "../domain/dsp/pauses";
import type { PresenceMetrics } from "../domain/presenceMetrics";
import type { CoachOutput } from "../domain/coach/ruleCoach";
import type { Session } from "../domain/sessionTypes";
import { resolveVideoUri, videoExists } from "../services/storage/videoStorage";
import { SKILL_LABELS, type SkillId } from "../theme/tokens";
import { todayISODate } from "../utils/dateUtils";
import { makeStyles, useTheme } from "../theme/ThemeProvider";

type Props = NativeStackScreenProps<RootStackParamList, "StartingPoint">;

const ANALYSIS_STEPS = ["transcribe", "audio_metrics", "presence", "coach"];
const WEEKDAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

async function buildInput(check: StoredSkillCheck, session: Session | null): Promise<SkillCheckInput> {
  const profile = getUserProfile();
  const input: SkillCheckInput = {
    readAccuracy: check.pieces.read?.accuracyPercent ?? null,
    readWpm: check.pieces.read?.wpm ?? null,
    categoryCount: check.pieces.category?.count ?? null,
    categoryTarget: check.pieces.category?.target ?? null,
    replyLatencyMs: check.pieces.reply?.latencyMs ?? null,
    askedBack: check.pieces.reply?.asked ?? null,
    obstacles: profile?.obstacles ?? [],
    stutterMode: defaultsFromProfile(profile).stutterMode,
  };
  if (!session) return input;
  const [pauses, presence, coach] = await Promise.all([
    getArtifact<PauseAnalysis>(session.id, "pauses"),
    getArtifact<PresenceMetrics>(session.id, "presence"),
    getArtifact<CoachOutput>(session.id, "coach"),
  ]);
  const voice = measuredVoice(session);
  return {
    ...input,
    talkSeconds: session.durationSeconds,
    talkWpm: voice.wpmAvg,
    pitchRangeHz: voice.pitchRangeHz,
    fillerRatePerMinute: session.fillerRatePerMinute,
    boundaryPauseRate: pauses?.boundaryPauseRate ?? null,
    hesitations: pauses?.hesitations ?? null,
    eyeContactPercent: presence && presence.samples > 0 ? presence.eyeContactPercent : null,
    expressiveness: presence && presence.samples > 0 ? presence.expressiveness : null,
    hedgeCount: coach ? coach.hedges.length : null,
    strongEnding: coach?.strongEnding ?? null,
    structured: coach ? coach.structure.framework !== "None" : null,
  };
}

// After the skill check: strengths first, then up to two focus areas, in
// plain words — and no overall number. For the 30-day retake: the two takes
// side by side and how each skill moved.
export function StartingPointScreen({ route, navigation }: Props) {
  const { checkId } = route.params;
  const styles = useStyles();
  const { colors } = useTheme();
  const [check, setCheck] = useState<StoredSkillCheck | null>(null);
  const [previous, setPrevious] = useState<StoredSkillCheck | null>(null);
  const [result, setResult] = useState<SkillCheckResult | null>(null);
  const [week, setWeek] = useState<DailyPlan[] | null>(null);
  const [sessions, setSessions] = useState<{ now: Session | null; then: Session | null }>({ now: null, then: null });
  const [comfort, setComfort] = useState<number | null>(null);
  const profile = getUserProfile();

  useEffect(() => {
    getSkillCheck(checkId).then(async (c) => {
      setCheck(c);
      if (c?.retakeOf) setPrevious(await getSkillCheck(c.retakeOf));
    });
  }, [checkId]);

  const { steps } = useSessionSteps(check?.sessionId ?? "", () => undefined);
  // If the analysis stalls (the app was killed mid-way), go with what's there.
  const [waitedOut, setWaitedOut] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setWaitedOut(true), 90_000);
    return () => clearTimeout(t);
  }, []);
  const analysisDone =
    waitedOut ||
    !check?.sessionId ||
    (steps.length > 0 && steps.filter((s) => ANALYSIS_STEPS.includes(s.step)).every((s) => s.status !== "pending" && s.status !== "running"));

  const evaluate = useCallback(async () => {
    if (!check || result) return;
    const session = check.sessionId ? await getSessionById(check.sessionId) : null;
    const input = await buildInput(check, session);
    const evaluated = evaluateSkillCheck(input);
    await setSkillCheckResults(check.id, input, evaluated);
    if (!check.retakeOf) {
      await seedSkillRatings(Object.fromEntries(SKILLS.map((s) => [s, evaluated.skills[s].rating])));
      const p = getUserProfile();
      if (p?.speakingComfort) await saveConfidenceCheckin(todayISODate(), p.speakingComfort);
    }
    const [skills, lessons] = await Promise.all([getSkillStates(), getLessonStates()]);
    setWeek(
      previewPlans(
        {
          date: todayISODate(),
          minutes: 8,
          skills: Object.fromEntries(SKILLS.map((k) => [k, { rating: skills[k].rating, lastPracticedAt: skills[k].lastPracticedAt }])) as Record<SkillId, { rating: number; lastPracticedAt: string | null }>,
          recentFocus: [],
          lessons: Object.fromEntries(Object.entries(lessons).map(([id, l]) => [id, { done: l.done, nextReviewAt: l.nextReviewAt }])),
          priority: priorityFor(getUserProfile(), todayISODate()),
        },
        7,
      ),
    );
    setSessions({ now: session, then: null });
    setResult(evaluated);
  }, [check, result]);

  useEffect(() => {
    if (check && analysisDone) evaluate();
  }, [check, analysisDone, evaluate]);

  useEffect(() => {
    if (previous?.sessionId) getSessionById(previous.sessionId).then((then) => setSessions((s) => ({ ...s, then })));
  }, [previous]);

  async function finish() {
    if (check?.retakeOf) {
      if (comfort != null) {
        await saveConfidenceCheckin(todayISODate(), comfort);
        const p = getUserProfile();
        if (p) setUserProfile({ ...p, speakingComfort: comfort });
      }
      navigation.goBack();
      return;
    }
    completeOnboarding();
    resetToTabs(navigation);
  }

  if (!check || !result) {
    return (
      <ScreenContainer style={styles.centered}>
        <LoadingSpinner />
        <Txt variant="callout" tone="secondary" align="center">
          {check?.sessionId && !analysisDone ? "Listening back to your recording — on this phone, about a minute." : "Putting it together…"}
        </Txt>
      </ScreenContainer>
    );
  }

  const retake = !!check.retakeOf;
  const kinder = feltBelowObserved(check.felt, result.observed);
  const videoOf = (s: Session | null) => (s && !s.videoDeletedAt && videoExists(resolveVideoUri(s)) ? resolveVideoUri(s) : null);

  return (
    <ScreenContainer style={styles.container}>
      <Header eyebrow={retake ? "30 days on" : "Your starting point"} title={retake ? "Look how far you've come" : profile?.name ? `Here's where you start, ${profile.name}` : "Here's where you start"} />
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {kinder ? (
          <Card style={[styles.card, { borderColor: colors.success }]}>
            <Txt variant="title3">You came across better than you thought.</Txt>
            <Txt variant="subhead" tone="secondary">
              You rated it {check.felt} out of 5. What the phone measured looks more like a {result.observed}. That gap — being harder on yourself than anyone listening — is common, and it shrinks with practice.
            </Txt>
          </Card>
        ) : null}

        {retake && previous?.results ? (
          <Card style={styles.card}>
            <Txt variant="caption2" tone="muted" uppercase>
              How each skill moved
            </Txt>
            {SKILLS.map((s) => {
              const now = result.skills[s].score;
              const then = previous.results!.skills[s].score;
              if (now == null || then == null) return null;
              const delta = Math.round((now - then) * 10) / 10;
              return (
                <View key={s} style={styles.row}>
                  <Txt variant="callout" style={styles.flex}>
                    {SKILL_LABELS[s]}
                  </Txt>
                  <Txt variant="callout" weight="700" color={delta > 0 ? colors.success : delta < 0 ? colors.warning : colors.textSecondary}>
                    {delta > 0 ? `+${delta}` : delta === 0 ? "same" : `${delta}`}
                  </Txt>
                </View>
              );
            })}
          </Card>
        ) : null}

        {retake && (videoOf(sessions.then) || videoOf(sessions.now)) ? (
          <Card style={styles.card}>
            <Txt variant="caption2" tone="muted" uppercase>
              Then and now
            </Txt>
            {videoOf(sessions.then) ? <VideoPlayback videoUri={videoOf(sessions.then)!} /> : null}
            {videoOf(sessions.now) ? <VideoPlayback videoUri={videoOf(sessions.now)!} /> : null}
          </Card>
        ) : null}

        {result.strengths.length ? (
          <Card style={styles.card}>
            <Txt variant="caption2" tone="success" uppercase>
              Already working
            </Txt>
            {result.strengths.map((s) => (
              <View key={s.text} style={styles.point}>
                <Ionicons name="checkmark-circle" size={20} color={colors.success} />
                <View style={styles.flex}>
                  <Txt variant="caption1" weight="700" color={colors.skill[s.skill].fg}>
                    {SKILL_LABELS[s.skill]}
                  </Txt>
                  <Txt variant="callout">{s.text}</Txt>
                </View>
              </View>
            ))}
          </Card>
        ) : null}

        {result.focus.length ? (
          <Card style={styles.card}>
            <Txt variant="caption2" tone="accent" uppercase>
              {retake ? "Next to work on" : "Where we'll start"}
            </Txt>
            {result.focus.map((f) => (
              <View key={f.text} style={styles.point}>
                <Ionicons name="arrow-forward-circle" size={20} color={colors.accent} />
                <View style={styles.flex}>
                  <Txt variant="caption1" weight="700" color={colors.skill[f.skill].fg}>
                    {SKILL_LABELS[f.skill]}
                  </Txt>
                  <Txt variant="callout">{f.text}</Txt>
                </View>
              </View>
            ))}
          </Card>
        ) : null}

        {retake ? (
          <Card style={styles.card}>
            <Txt variant="headline">How do you feel about speaking in front of people now?</Txt>
            <RatingScale value={comfort} onChange={setComfort} lowLabel="I avoid it" highLabel="I enjoy it" />
            {profile?.speakingComfort ? (
              <Txt variant="footnote" tone="muted">
                A month ago you said {profile.speakingComfort}.
              </Txt>
            ) : null}
            {profile?.why ? (
              <Txt variant="footnote" tone="secondary">
                Why you started: “{profile.why}”
              </Txt>
            ) : null}
          </Card>
        ) : week ? (
          <Card style={styles.card}>
            <Txt variant="caption2" tone="muted" uppercase>
              Your first week
            </Txt>
            {week.map((p) => {
              const d = new Date(`${p.date}T12:00:00`);
              return (
                <View key={p.date} style={styles.row}>
                  <Txt variant="footnote" tone="muted" style={styles.day}>
                    {WEEKDAY[d.getDay()]}
                  </Txt>
                  <Txt variant="footnote" weight="700" color={colors.skill[p.focusSkill].fg} style={styles.skill}>
                    {SKILL_LABELS[p.focusSkill]}
                  </Txt>
                  <Txt variant="footnote" style={styles.flex} numberOfLines={1}>
                    {getLesson(p.lessonId)?.title ?? ""}
                  </Txt>
                </View>
              );
            })}
          </Card>
        ) : null}

        {!retake ? (
          <Txt variant="footnote" tone="secondary">
            Levels move slowly on purpose. Expect to notice a difference in three or four weeks — and at day 30 we'll run this same check again, so you can see it.
          </Txt>
        ) : null}
      </ScrollView>
      <PrimaryButton label={retake ? "Done" : "Let's go"} onPress={finish} />
    </ScreenContainer>
  );
}

const useStyles = makeStyles((t) => ({
  container: { gap: t.space.md },
  centered: { justifyContent: "center", alignItems: "center", gap: t.space.md },
  scroll: { gap: t.space.md, paddingBottom: t.space.lg },
  card: { gap: t.space.sm },
  row: { flexDirection: "row", alignItems: "center", gap: t.space.sm },
  point: { flexDirection: "row", gap: t.space.sm, alignItems: "flex-start" },
  day: { width: 34 },
  skill: { width: 100 },
  flex: { flex: 1 },
}));
