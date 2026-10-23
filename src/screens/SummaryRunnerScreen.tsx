import { useEffect, useRef, useState } from "react";
import { ScrollView, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../navigation";
import { ScreenContainer } from "../components/common/ScreenContainer";
import { Header } from "../components/common/Header";
import { Card } from "../components/common/Card";
import { Txt } from "../components/common/Txt";
import { PrimaryButton } from "../components/common/PrimaryButton";
import { SkeletonCard } from "../components/common/Skeleton";
import { showGlobalToast } from "../components/common/ToastProvider";
import { useLiveSpeech } from "../hooks/useLiveSpeech";
import { useSpokenTurn } from "../hooks/useSpokenTurn";
import { DRILL_TITLES, type DrillOutcome } from "../domain/drills/drillSpecs";
import type { TurnMeasurement } from "../domain/conversation/evaluateConversation";
import { prepareSummary, type SummarySetup } from "../domain/summary/prepareSummary";
import { evaluateSummary, type SummaryDetails } from "../domain/summary/evaluateSummary";
import { words } from "../domain/conversation/text";
import { getDrillLevel, recordDrillOutcome } from "../services/db/progressRepo";
import { reviewSummary, type SummaryReviewResult } from "../services/summary/summaryReview";
import { producerName } from "../domain/analysis/provenance";
import { completePracticeStep } from "../services/practice/practiceEvents";
import { logger } from "../utils/logger";
import { makeStyles, useTheme } from "../theme/ThemeProvider";

type Props = NativeStackScreenProps<RootStackParamList, "Summary">;
type Stage = "intro" | "read" | "listening" | "saving" | "result";

// Say it short: read something, then say it back in a sentence or two. The
// phone measures sentences, time and key words; the AI (when it is on) checks
// the idea itself. Your words aren't shown while you speak, on purpose.
export function SummaryRunnerScreen({ route, navigation }: Props) {
  const { drill, contentId, practice } = route.params;
  const styles = useStyles();
  const { colors } = useTheme();
  const speech = useLiveSpeech();
  const [setup, setSetup] = useState<SummarySetup | null>(null);
  const [stage, setStage] = useState<Stage>("intro");
  const [turnIndex, setTurnIndex] = useState(0);
  const [result, setResult] = useState<{ outcome: DrillOutcome; details: SummaryDetails } | null>(null);
  const [reviewed, setReviewed] = useState<SummaryReviewResult | null>(null);
  const [heardNothing, setHeardNothing] = useState(false);
  const measurementsRef = useRef<TurnMeasurement[]>([]);
  const turnRef = useRef(0);
  const startingRef = useRef(false);
  const seedRef = useRef(Math.floor(Math.random() * 100_000));
  const setupRef = useRef<SummarySetup | null>(null);

  async function load(seed: number) {
    const level = await getDrillLevel(drill);
    const next = prepareSummary(drill, level, seed, contentId);
    setupRef.current = next;
    setSetup(next);
  }

  useEffect(() => {
    load(seedRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drill, contentId]);

  const spoken = useSpokenTurn(speech, setup ? { endSilenceMs: setup.endSilenceMs, maxWaitMs: setup.maxWaitMs, maxReplyMs: setup.maxReplyMs } : null, (measurement) => {
    measurementsRef.current[turnRef.current] = measurement;
    const current = setupRef.current;
    if (current && turnRef.current + 1 < current.turns.length) {
      turnRef.current += 1;
      setTurnIndex(turnRef.current);
      setStage("read");
    } else {
      wrapUp();
    }
  });

  async function start() {
    if (!setup || startingRef.current) return;
    startingRef.current = true;
    measurementsRef.current = [];
    turnRef.current = 0;
    setResult(null);
    setReviewed(null);
    setHeardNothing(false);
    const ready = await speech.session.prepare();
    if (ready !== "ready") {
      startingRef.current = false;
      showGlobalToast(ready === "denied" ? "Microphone permission is needed for this drill." : "Speech recognition isn't available.", "error");
      return;
    }
    setTurnIndex(0);
    setStage("read");
  }

  function beginTurn() {
    setStage("listening");
    spoken.begin();
  }

  async function wrapUp() {
    const current = setupRef.current;
    if (!current) return;
    startingRef.current = false;
    setStage("saving");
    const measurements = measurementsRef.current;
    // Nothing recognized in any turn: a mic problem or a blank. Either way it
    // isn't scored, so it can't make anything harder or easier.
    if (measurements.length === 0 || measurements.every((m) => !m?.transcript.trim())) {
      setHeardNothing(true);
      setStage("result");
      return;
    }
    try {
      const transcripts = current.turns.map((_, i) => measurements[i]?.transcript ?? "");
      const review = await reviewSummary(current, transcripts);
      const evaluated = evaluateSummary(current, measurements, review?.review ?? null);
      await recordDrillOutcome({
        drillType: current.type,
        outcome: evaluated.outcome,
        level: current.level,
        contentId: current.contentId,
        lessonId: practice?.lessonId,
        metrics: { ...evaluated.details, reviewSource: review ? review.provenance.producer : null },
      });
      setReviewed(review);
      setResult(evaluated);
    } catch (error) {
      logger.error(`[summary] ${current.type} failed to score — ${(error as Error).message}`);
      showGlobalToast("Couldn't save that one.", "error");
    }
    setStage("result");
  }

  async function done() {
    if (result) await completePracticeStep(practice, result.outcome.score);
    navigation.goBack();
  }

  function tryAgain() {
    startingRef.current = false;
    seedRef.current += 1;
    setSetup(null);
    setStage("intro");
    setResult(null);
    setReviewed(null);
    setHeardNothing(false);
    load(seedRef.current);
  }

  if (!setup) {
    return (
      <ScreenContainer>
        <SkeletonCard lines={4} />
      </ScreenContainer>
    );
  }

  const turn = setup.turns[turnIndex];
  const multi = setup.turns.length > 1;
  const skill = colors.skill.impromptu;
  const budget = turn.budgetSeconds;

  return (
    <ScreenContainer style={styles.container}>
      <Header eyebrow={`${DRILL_TITLES[setup.type]} · level ${Math.floor(setup.level)}`} title={setup.title} onBack={() => navigation.goBack()} backIcon="close" />

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {stage === "intro" ? (
          <>
            <Txt variant="callout" tone="secondary">
              {setup.instructions}
            </Txt>
            <Txt variant="caption1" tone="muted">
              {setup.type === "relay" ? "The paragraph hides when you start speaking, and so do your own words — you'll see them at the end." : "Your own words stay hidden while you speak — you'll see them at the end."}
            </Txt>
          </>
        ) : null}

        {stage === "read" || stage === "listening" ? (
          <>
            {multi ? (
              <Txt variant="caption1" tone="muted">
                {turn.eyebrow}
              </Txt>
            ) : null}
            {stage === "read" || !turn.hideWhileSpeaking ? (
              <Card style={styles.card}>
                {!multi ? (
                  <Txt variant="caption1" weight="600" color={skill.fg}>
                    {turn.eyebrow}
                  </Txt>
                ) : null}
                <Txt variant={multi ? "body" : "title3"} weight="500">
                  {turn.show}
                </Txt>
              </Card>
            ) : null}
            {stage === "read" ? (
              <Txt variant="footnote" tone="secondary">
                {turn.rolling
                  ? "This time: the previous paragraph in one sentence, then this one in one sentence."
                  : multi
                    ? "Read it once, then tap Got it. It hides, and you say it back."
                    : "Take a moment to find your first sentence."}
              </Txt>
            ) : null}
          </>
        ) : null}

        {stage === "listening" ? (
          <View style={styles.center}>
            <View style={[styles.pulse, { backgroundColor: skill.bg, transform: [{ scale: 1 + Math.max(0, speech.volume) / 20 }] }]} />
            <Txt variant="headline" align="center">
              {turn.rolling ? "Last one in a sentence, then this one." : setup.cue}
            </Txt>
            <Txt variant="footnote" tone="muted" align="center">
              Listening — it moves on when you pause.
            </Txt>
            <View style={styles.budgetTrack} accessibilityLabel={`About ${budget} seconds`}>
              <View style={[styles.budgetFill, { width: `${Math.min(100, (spoken.elapsedMs / (budget * 1000)) * 100)}%`, backgroundColor: skill.fg }]} />
            </View>
          </View>
        ) : null}

        {stage === "saving" ? (
          <View style={styles.center}>
            <Txt variant="headline" align="center">
              Checking your summary…
            </Txt>
          </View>
        ) : null}

        {stage === "result" && result ? renderResult(result) : null}
        {stage === "result" && heardNothing ? (
          <Card style={styles.card}>
            <Txt variant="headline">Didn't catch an answer.</Txt>
            <Txt variant="footnote" tone="secondary">
              If you blanked, that's exactly what this practices, and nothing was counted. If you did speak, check the mic isn't muted.
            </Txt>
          </Card>
        ) : null}
      </ScrollView>

      {stage === "intro" ? <PrimaryButton label="Start" onPress={start} /> : null}
      {stage === "read" ? <PrimaryButton label={multi ? "Got it" : "I'm ready"} onPress={beginTurn} /> : null}
      {stage === "listening" ? <PrimaryButton label="Done" variant="secondary" onPress={() => spoken.finish()} /> : null}
      {stage === "saving" ? <PrimaryButton label="Saving…" onPress={() => undefined} loading /> : null}
      {stage === "result" ? (
        <View style={styles.row}>
          <PrimaryButton label="Again" variant="secondary" onPress={tryAgain} style={styles.flex} />
          <PrimaryButton label="Done" onPress={done} style={styles.flex} />
        </View>
      ) : null}
    </ScreenContainer>
  );

  // A render helper, not a nested component, so re-renders don't remount it.
  function renderResult({ outcome, details }: { outcome: DrillOutcome; details: SummaryDetails }) {
    if (!setup) return null;
    const review = details.review ?? null;
    const label = `From your AI coach (${producerName(reviewed?.provenance)})`;
    const jargon = new Set([...(details.turns[0]?.longWords ?? []), ...(review?.drill === "explain_simple" ? review.jargon.flatMap((j) => words(j)) : [])]);
    return (
      <>
        <Card style={styles.card}>
          <Txt variant="title3">{outcome.summary}</Txt>
          <Txt variant="footnote" tone="secondary">
            {outcome.success ? "Nice. The next one asks for a little less." : "Next one eases off a little. Showing up is the practice."}
          </Txt>
        </Card>

        {review ? (
          <Card style={styles.card}>
            <Txt variant="caption1" weight="600" color={colors.skill.impromptu.fg}>
              {label}
            </Txt>
            <Txt variant="callout">{review.note}</Txt>
            {review.drill === "sum_up" && review.cut ? <Txt variant="footnote" tone="secondary">You could drop: “{review.cut}”</Txt> : null}
            {review.drill === "explain_simple" && review.wrong ? <Txt variant="footnote" tone="secondary">Worth fixing: {review.wrong}</Txt> : null}
            {review.drill === "explain_simple" ? (
              <Txt variant="footnote" tone="secondary">
                {review.usedExample ? "You gave an example — that helps." : "Try adding one example or comparison."}
              </Txt>
            ) : null}
            <Txt variant="footnote" tone="muted">
              {review.drill === "explain_simple" ? "Simpler:" : "Tighter:"}
            </Txt>
            <Txt variant="callout" weight="500">
              {review.drill === "explain_simple" ? review.simpler : review.tighter}
            </Txt>
          </Card>
        ) : null}

        {details.turns.map((t, i) => {
          const spokenText = measurementsRef.current[i]?.transcript ?? "";
          const turnReview = review?.drill === "relay" ? review.turns[i] : null;
          const example = setup.turns[i].example;
          return (
            <Card key={i} style={styles.card}>
              {details.turns.length > 1 ? (
                <Txt variant="caption1" tone="muted">
                  {setup.turns[i].eyebrow}
                </Txt>
              ) : null}
              {t.notes.map((n) => (
                <Txt key={n} variant="callout">
                  {n}
                </Txt>
              ))}
              {turnReview?.missed ? <Txt variant="footnote" tone="secondary">You missed: {turnReview.missed}</Txt> : null}
              {spokenText ? (
                <Txt variant="footnote" tone="muted">
                  “{setup.type === "explain_simple" ? renderHighlighted(spokenText, jargon) : spokenText}”
                </Txt>
              ) : null}
              {!review && example ? (
                <>
                  <Txt variant="footnote" tone="muted">
                    One way to say it:
                  </Txt>
                  <Txt variant="footnote" tone="secondary">
                    {example}
                  </Txt>
                </>
              ) : null}
            </Card>
          );
        })}

        {!review ? (
          <Txt variant="caption1" tone="muted">
            Turn on your AI coach in Settings to have the idea itself checked, not just the sentences and time.
          </Txt>
        ) : null}
      </>
    );
  }

  function renderHighlighted(text: string, flagged: Set<string>) {
    return text.split(/(\s+)/).map((token, i) => {
      const norm = token.toLowerCase().replace(/[^a-z']/g, "");
      return flagged.has(norm) ? (
        <Txt key={i} variant="footnote" color={colors.warning}>
          {token}
        </Txt>
      ) : (
        token
      );
    });
  }
}

const useStyles = makeStyles((t) => ({
  container: { gap: t.space.md },
  scroll: { gap: t.space.md, paddingBottom: t.space.lg },
  card: { gap: t.space.sm },
  center: { alignItems: "center", gap: t.space.md, paddingVertical: t.space.lg },
  pulse: { width: 96, height: 96, borderRadius: 48 },
  budgetTrack: { alignSelf: "stretch", height: 4, borderRadius: 2, backgroundColor: t.colors.surfaceRaised, overflow: "hidden" },
  budgetFill: { height: "100%", borderRadius: 2, opacity: 0.6 },
  row: { flexDirection: "row", gap: t.space.sm },
  flex: { flex: 1 },
}));
