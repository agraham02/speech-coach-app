import { useEffect, useRef, useState } from "react";
import { ScrollView, View } from "react-native";
import * as Speech from "expo-speech";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../navigation";
import { ScreenContainer } from "../components/common/ScreenContainer";
import { Header } from "../components/common/Header";
import { Card } from "../components/common/Card";
import { Txt } from "../components/common/Txt";
import { PrimaryButton } from "../components/common/PrimaryButton";
import { ProgressRing } from "../components/common/ProgressRing";
import { EmptyState } from "../components/common/EmptyState";
import { ScaleChips } from "../components/conversation/ScaleChips";
import { useLiveSpeech } from "../hooks/useLiveSpeech";
import { fullText } from "../domain/speech/liveTranscript";
import { DRILL_TITLES } from "../domain/drills/drillSpecs";
import { prepareConversation, type ConversationSetup, type ReplayMoment } from "../domain/conversation/prepareConversation";
import { evaluateConversation, type ConversationDetails, type TurnMeasurement } from "../domain/conversation/evaluateConversation";
import { assignPartnerVoices, type VoiceStyle } from "../domain/conversation/voices";
import type { ConversationMetrics } from "../domain/conversation/attemptMetrics";
import type { DrillOutcome } from "../domain/drills/drillSpecs";
import type { PartnerVoice } from "../content/conversationContent";
import { getDrillLevel, recordDrillOutcome } from "../services/db/progressRepo";
import { getBlankMoment, getBlankMoments, markBlankMomentPracticed } from "../services/db/socialRepo";
import { completePracticeStep } from "../services/practice/practiceEvents";
import { showGlobalToast } from "../components/common/ToastProvider";
import { logger } from "../utils/logger";
import { makeStyles, useTheme } from "../theme/ThemeProvider";

type Props = NativeStackScreenProps<RootStackParamList, "Conversation">;
type Stage = "intro" | "partner" | "hold" | "listening" | "rate" | "saving" | "result" | "empty";

// Gap between the partner's last word and opening the mic, so the
// recognizer doesn't hear the tail of the phone's own voice.
const MIC_OPEN_DELAY_MS = 300;
const POLL_MS = 200;
const NAMES: Record<PartnerVoice, string> = { a: "Alex", b: "Sam", c: "Jordan" };

// Conversation practice: the phone says a line (spoken *and* shown — iPhones
// in silent mode don't play speech), you reply, it measures only process —
// how soon you replied, whether you asked about what they said, whether you
// stopped. Your words aren't shown while you speak, on purpose: watching
// yourself is the habit this skill trains away from.
export function ConversationRunnerScreen({ route, navigation }: Props) {
  const { drill, contentId, practice, blankMomentId } = route.params;
  const styles = useStyles();
  const { colors } = useTheme();
  const speech = useLiveSpeech();
  const [setup, setSetup] = useState<ConversationSetup | null>(null);
  const [replay, setReplay] = useState<ReplayMoment | null>(null);
  const [stage, setStage] = useState<Stage>("intro");
  const [turnIndex, setTurnIndex] = useState(0);
  const [spokenLines, setSpokenLines] = useState(0);
  const [holdLeft, setHoldLeft] = useState(0);
  const [selfFocusBefore, setSelfFocusBefore] = useState<number | null>(null);
  const [selfFocusAfter, setSelfFocusAfter] = useState<number | null>(null);
  const [selfRating, setSelfRating] = useState<number | null>(null);
  const [result, setResult] = useState<{ outcome: DrillOutcome; details: ConversationDetails } | null>(null);
  const [heardNothing, setHeardNothing] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const voicesRef = useRef<Record<PartnerVoice, VoiceStyle> | null>(null);
  const measurementsRef = useRef<TurnMeasurement[]>([]);
  const partnerEndAtRef = useRef(0);
  const listenStartAtRef = useRef(0);
  const endingRef = useRef(false);
  const cancelledRef = useRef(false);
  const seedRef = useRef(Math.floor(Math.random() * 100_000));

  // --- setup -------------------------------------------------------------

  async function load(seed: number) {
    let moment: ReplayMoment | undefined;
    if (drill === "conv_replay") {
      const found = blankMomentId ? await getBlankMoment(blankMomentId) : (await getBlankMoments())[0] ?? null;
      if (!found) {
        setStage("empty");
        return;
      }
      moment = { id: found.id, text: found.text };
      setReplay(moment);
    }
    const level = await getDrillLevel(drill);
    setSetup(prepareConversation(drill, level, seed, contentId, moment));
  }

  useEffect(() => {
    load(seedRef.current);
    Speech.getAvailableVoicesAsync()
      .then((voices) => {
        voicesRef.current = assignPartnerVoices(voices);
      })
      .catch(() => {
        voicesRef.current = assignPartnerVoices([]);
      });
    return () => {
      cancelledRef.current = true;
      Speech.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drill, contentId, blankMomentId]);

  // --- the partner speaks --------------------------------------------------

  function speakTurn(index: number) {
    if (!setup) return;
    const turn = setup.turns[index];
    setTurnIndex(index);
    setSpokenLines(0);
    setStage("partner");
    const sayLine = (i: number) => {
      if (cancelledRef.current) return;
      if (i >= turn.lines.length) {
        partnerEndAtRef.current = Date.now();
        if (turn.holdSeconds) {
          setHoldLeft(turn.holdSeconds);
          setStage("hold");
        } else {
          setTimeout(() => beginListening(), MIC_OPEN_DELAY_MS);
        }
        return;
      }
      setSpokenLines(i + 1);
      const line = turn.lines[i];
      const style = voicesRef.current?.[line.voice] ?? { pitch: 1, rate: 1 };
      const next = () => sayLine(i + 1);
      Speech.speak(line.text, { voice: style.voice, pitch: style.pitch, rate: style.rate * 0.98, onDone: next, onError: next, onStopped: () => undefined });
    };
    sayLine(0);
  }

  // Hold one word: a silent countdown, then the mic opens. The reply clock
  // starts when the wait ends.
  useEffect(() => {
    if (stage !== "hold") return;
    if (holdLeft <= 0) {
      partnerEndAtRef.current = Date.now();
      beginListening();
      return;
    }
    const t = setTimeout(() => setHoldLeft((h) => h - 1), 1000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, holdLeft]);

  // --- you reply -----------------------------------------------------------

  function beginListening() {
    if (cancelledRef.current) return;
    endingRef.current = false;
    speech.session.start({ volumeMeter: true, volumeIntervalMs: 100 });
    listenStartAtRef.current = Date.now();
    setElapsedMs(0);
    setStage("listening");
  }

  // Ends the reply on silence after speech, on a long wait with no speech,
  // or at the hard cap — the recognizer itself never ends on silence.
  useEffect(() => {
    if (stage !== "listening" || !setup) return;
    const timer = setInterval(() => {
      const now = Date.now();
      const elapsed = now - listenStartAtRef.current;
      setElapsedMs(elapsed);
      const snap = speech.session.getSnapshot();
      const heard = fullText(snap.transcript).trim().length > 0;
      const last = snap.transcript.lastResultAtMs;
      if (heard && last != null && now - last >= setup.endSilenceMs) endTurn();
      else if (!heard && elapsed >= setup.maxWaitMs) endTurn();
      else if (elapsed >= setup.maxReplyMs) endTurn();
    }, POLL_MS);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, setup]);

  async function endTurn() {
    if (!setup || endingRef.current) return;
    endingRef.current = true;
    try {
      const transcript = await speech.session.stop();
      measurementsRef.current[turnIndex] = {
        transcript: fullText(transcript),
        segments: transcript.committed.map((u) => u.text),
        partnerEndAt: partnerEndAtRef.current,
        listenStartAt: listenStartAtRef.current,
        volume: [...speech.session.getVolumeSamples()],
        firstResultAt: transcript.firstResultAtMs,
        lastResultAt: transcript.lastResultAtMs,
      };
    } catch (error) {
      logger.error(`[conversation] stopping recognition failed — ${(error as Error).message}`);
    }
    if (cancelledRef.current) return;
    if (turnIndex + 1 < setup.turns.length) {
      speakTurn(turnIndex + 1);
    } else {
      setStage("rate");
    }
  }

  async function start() {
    if (!setup) return;
    measurementsRef.current = [];
    setResult(null);
    setHeardNothing(false);
    setSelfFocusAfter(null);
    setSelfRating(null);
    const ready = await speech.session.prepare();
    if (ready !== "ready") {
      showGlobalToast(ready === "denied" ? "Microphone permission is needed for this drill." : "Speech recognition isn't available.", "error");
      return;
    }
    speakTurn(0);
  }

  // --- wrap up ---------------------------------------------------------------

  async function finish() {
    if (!setup) return;
    setStage("saving");
    const measurements = measurementsRef.current.filter(Boolean);
    // Nothing recognized in any turn: a mic problem or a blank — either way
    // it isn't scored, so it can't make anything harder or easier.
    if (measurements.length === 0 || measurements.every((m) => !m.transcript.trim())) {
      setHeardNothing(true);
      setStage("result");
      return;
    }
    try {
      const evaluated = evaluateConversation(setup, measurements, { selfRating: selfRating ?? undefined });
      const metrics: ConversationMetrics = { ...evaluated.details, selfFocusBefore, selfFocusAfter };
      await recordDrillOutcome({
        drillType: setup.type,
        outcome: evaluated.outcome,
        level: setup.level,
        contentId: setup.contentId,
        lessonId: practice?.lessonId,
        metrics,
      });
      if (replay) await markBlankMomentPracticed(replay.id);
      setResult(evaluated);
    } catch (error) {
      logger.error(`[conversation] ${setup.type} failed to score — ${(error as Error).message}`);
      showGlobalToast("Couldn't save that one.", "error");
    }
    setStage("result");
  }

  async function done() {
    if (result) await completePracticeStep(practice, result.outcome.score);
    navigation.goBack();
  }

  function tryAgain() {
    seedRef.current += 1;
    setSetup(null);
    setStage("intro");
    setResult(null);
    setHeardNothing(false);
    load(seedRef.current);
  }

  function skipReply() {
    endTurn();
  }

  // --- render ----------------------------------------------------------------

  if (stage === "empty") {
    return (
      <ScreenContainer style={styles.container}>
        <Header eyebrow={DRILL_TITLES[drill]} onBack={() => navigation.goBack()} backIcon="close" />
        <EmptyState
          icon="chatbubbles-outline"
          title="No moments to replay yet"
          body="After a conversation, open Today → Debrief and add a moment you blanked on. It'll show up here as practice."
          actionLabel="Back"
          onAction={() => navigation.goBack()}
        />
      </ScreenContainer>
    );
  }

  if (!setup) {
    return (
      <ScreenContainer>
        <Txt tone="muted">Loading…</Txt>
      </ScreenContainer>
    );
  }

  const turn = setup.turns[turnIndex];
  const multi = setup.turns.length > 1;
  const group = setup.type === "conv_group";
  const linesToShow = stage === "intro" ? [] : stage === "partner" ? turn.lines.slice(0, spokenLines) : turn.lines;
  const budget = turn?.budgetSeconds;

  return (
    <ScreenContainer style={styles.container}>
      <Header eyebrow={`${DRILL_TITLES[setup.type]} · level ${Math.floor(setup.level)}`} title={setup.title} onBack={() => navigation.goBack()} backIcon="close" />

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {stage === "intro" ? (
          <>
            <Txt variant="callout" tone="secondary">
              {setup.instructions}
            </Txt>
            <Card style={styles.card}>
              <Txt variant="headline">Right now, how much of your attention is on yourself?</Txt>
              <ScaleChips value={selfFocusBefore} onChange={setSelfFocusBefore} lowLabel="On them" highLabel="On me" accessibilityLabel="Attention on yourself, 0 to 10" />
              <Txt variant="caption1" tone="muted">
                Optional — it's how you'll see your attention shift over time.
              </Txt>
            </Card>
            <Txt variant="caption1" tone="muted">
              Your partner talks out loud — turn off silent mode to hear them. Their words also appear on screen.
            </Txt>
          </>
        ) : null}

        {stage !== "intro" && stage !== "rate" && stage !== "saving" && stage !== "result" ? (
          <>
            {multi ? (
              <Txt variant="caption2" tone="muted" uppercase>
                {setup.type === "squeeze" ? `Take ${turnIndex + 1} of ${setup.turns.length}` : `Turn ${turnIndex + 1} of ${setup.turns.length}`}
              </Txt>
            ) : null}
            {linesToShow.map((line, i) => (
              <Card key={i} style={[styles.bubble, { borderColor: colors.skill.conversation.bg }]}>
                <Txt variant="caption1" weight="700" color={colors.skill.conversation.fg}>
                  {group ? NAMES[line.voice] : setup.type === "conv_replay" ? "They said" : "Partner"}
                </Txt>
                <Txt variant="title3">{line.text}</Txt>
              </Card>
            ))}
          </>
        ) : null}

        {stage === "hold" ? (
          <View style={styles.center}>
            <ProgressRing size={120} strokeWidth={8} progress={holdLeft / Math.max(turn.holdSeconds ?? 1, 1)} color={colors.skill.conversation.fg}>
              <Txt variant="largeTitle">{holdLeft}</Txt>
            </ProgressRing>
            <Txt tone="secondary">Keep just one word in mind…</Txt>
          </View>
        ) : null}

        {stage === "listening" ? (
          <View style={styles.center}>
            <View style={[styles.pulse, { backgroundColor: colors.skill.conversation.bg, transform: [{ scale: 1 + Math.max(0, speech.volume) / 20 }] }]} />
            <Txt variant="headline" align="center">
              {setup.cue}
            </Txt>
            <Txt variant="footnote" tone="muted" align="center">
              Listening — it moves on when you pause.
            </Txt>
            {budget ? (
              <View style={styles.budgetTrack} accessibilityLabel={`About ${budget} seconds`}>
                <View style={[styles.budgetFill, { width: `${Math.min(100, (elapsedMs / (budget * 1000)) * 100)}%`, backgroundColor: colors.skill.conversation.fg }]} />
              </View>
            ) : null}
          </View>
        ) : null}

        {stage === "rate" ? (
          <>
            {setup.selfRatingQuestion ? (
              <Card style={styles.card}>
                <Txt variant="headline">{setup.selfRatingQuestion}</Txt>
                <ScaleChips value={selfRating} onChange={setSelfRating} min={1} max={5} lowLabel="Not really" highLabel="Fully" accessibilityLabel="Self rating, 1 to 5" />
              </Card>
            ) : null}
            <Card style={styles.card}>
              <Txt variant="headline">And now — how much of your attention was on yourself?</Txt>
              <ScaleChips value={selfFocusAfter} onChange={setSelfFocusAfter} lowLabel="On them" highLabel="On me" accessibilityLabel="Attention on yourself, 0 to 10" />
            </Card>
          </>
        ) : null}

        {stage === "result" && result ? (
          <ResultView setup={setup} result={result} />
        ) : null}
        {stage === "result" && heardNothing ? (
          <Card style={styles.card}>
            <Txt variant="headline">Didn't catch a reply.</Txt>
            <Txt variant="footnote" tone="secondary">
              If you blanked — that's exactly what this practices, and nothing was counted. Try one of the moves next time: ask about the last thing they
              said. If you did speak, check the mic isn't muted.
            </Txt>
          </Card>
        ) : null}
      </ScrollView>

      {stage === "intro" ? <PrimaryButton label="Start" onPress={start} /> : null}
      {stage === "listening" ? <PrimaryButton label="Done" variant="secondary" onPress={skipReply} /> : null}
      {stage === "rate" ? (
        <PrimaryButton label="See how it went" onPress={finish} disabled={!!setup.selfRatingQuestion && selfRating == null} />
      ) : null}
      {stage === "saving" ? <PrimaryButton label="Saving…" onPress={() => undefined} loading /> : null}
      {stage === "result" ? (
        <View style={styles.row}>
          <PrimaryButton label="Again" variant="secondary" onPress={tryAgain} style={styles.flex} />
          <PrimaryButton label="Done" onPress={done} style={styles.flex} />
        </View>
      ) : null}
    </ScreenContainer>
  );

  function ResultView({ setup, result }: { setup: ConversationSetup; result: { outcome: DrillOutcome; details: ConversationDetails } }) {
    const { outcome, details } = result;
    return (
      <>
        <Card style={styles.card}>
          <Txt variant="title3">{outcome.summary}</Txt>
          <Txt variant="footnote" tone="secondary">
            {outcome.success ? "Nice. The next one asks for a little more." : "Next one eases off a little. Showing up is the practice."}
          </Txt>
          {selfFocusBefore != null && selfFocusAfter != null ? (
            <Txt variant="footnote" tone="secondary">
              Attention on yourself: {selfFocusBefore} → {selfFocusAfter}
            </Txt>
          ) : null}
        </Card>
        {details.turns.map((t, i) => (
          <Card key={i} style={styles.card}>
            {details.turns.length > 1 ? (
              <Txt variant="caption2" tone="muted" uppercase>
                {setup.type === "squeeze" ? `Take ${i + 1}` : `Turn ${i + 1}`}
              </Txt>
            ) : null}
            {t.notes.map((n) => (
              <Txt key={n} variant="callout">
                {n}
              </Txt>
            ))}
            {measurementsRef.current[i]?.transcript ? (
              <Txt variant="footnote" tone="muted">
                “{measurementsRef.current[i].transcript}”
              </Txt>
            ) : null}
          </Card>
        ))}
        {details.retention != null ? (
          <Txt variant="footnote" tone="secondary">
            Your shortest take kept {Math.round(details.retention * 100)}% of its words from the first telling.
          </Txt>
        ) : null}
      </>
    );
  }
}

const useStyles = makeStyles((t) => ({
  container: { gap: t.space.md },
  scroll: { gap: t.space.md, paddingBottom: t.space.lg },
  card: { gap: t.space.sm },
  bubble: { gap: t.space.xs, borderWidth: 1 },
  center: { alignItems: "center", gap: t.space.md, paddingVertical: t.space.lg },
  pulse: { width: 96, height: 96, borderRadius: 48 },
  budgetTrack: { alignSelf: "stretch", height: 4, borderRadius: 2, backgroundColor: t.colors.surfaceRaised, overflow: "hidden" },
  budgetFill: { height: "100%", borderRadius: 2, opacity: 0.6 },
  row: { flexDirection: "row", gap: t.space.sm },
  flex: { flex: 1 },
}));
