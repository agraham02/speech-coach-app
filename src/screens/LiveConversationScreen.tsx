import { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../navigation";
import { ScreenContainer } from "../components/common/ScreenContainer";
import { Header } from "../components/common/Header";
import { Card } from "../components/common/Card";
import { Txt } from "../components/common/Txt";
import { Chip } from "../components/common/Chip";
import { PrimaryButton } from "../components/common/PrimaryButton";
import { ScaleSlider } from "../components/common/ScaleSlider";
import { SkeletonCard } from "../components/common/Skeleton";
import { showGlobalToast } from "../components/common/ToastProvider";
import { SAMPLE_CONVERSATION } from "../content/liveScenes";
import { conversationMinutesLine } from "../domain/aiAllowance";
import { producerName } from "../domain/analysis/provenance";
import type { Provenance } from "../domain/analysis/types";
import { MOVE_LABELS, rulesDebrief, type LiveDebrief } from "../domain/conversation/live/debrief";
import { evaluateLive, type LiveDetails } from "../domain/conversation/live/evaluateLive";
import { focusForLesson, prepareLive, type LiveFocus, type LiveSetup } from "../domain/conversation/live/prepareLive";
import { completedTurns } from "../domain/conversation/live/turnMachine";
import { clampSpeed, PARTNER_VOICES, voiceFor } from "../domain/conversation/live/voices";
import type { DrillOutcome } from "../domain/drills/drillSpecs";
import { useLiveConversation } from "../hooks/useLiveConversation";
import { useAccount } from "../services/account/accountStore";
import { requestAnalysis } from "../services/analysis";
import { openPaywall } from "../services/cloud/consent";
import { alertGate, liveGateNow, readyForLiveConversation, whyNoLiveConversation } from "../services/conversation/liveGate";
import { getDrillLevel, recordDrillOutcome } from "../services/db/progressRepo";
import { completePracticeStep } from "../services/practice/practiceEvents";
import { getPartnerSpeed, getPartnerVoicePref, setPartnerSpeed, setPartnerVoicePref } from "../services/prefs/prefsStore";
import { purchasesEnabled } from "../services/purchases/purchases";
import { logger } from "../utils/logger";
import { makeStyles, useTheme } from "../theme/ThemeProvider";

type Props = NativeStackScreenProps<RootStackParamList, "LiveConversation">;
type Stage = "intro" | "running" | "rate" | "saving" | "result";

const SPEEDS: { value: number; label: string }[] = [
  { value: 0.9, label: "A bit slower" },
  { value: 1, label: "Normal" },
  { value: 1.1, label: "A bit faster" },
];

// A live conversation (Tono Plus): the partner speaks in a natural voice, you
// reply, the phone listens and decides when you've finished, the partner
// answers in character, for a few turns; then a short debrief of the moves you
// made. Scored on process only, like every Conversation drill. Your words
// aren't shown while you speak; the partner's are, always (silent mode,
// hearing, or a voice that didn't come).
//
// Without Plus (or the trial) this screen shows what the exercise is, a short
// sample, and one quiet line about Plus. No alerts, no countdowns.
export function LiveConversationScreen({ route, navigation }: Props) {
  const { practice, contentId } = route.params ?? {};
  const focus: LiveFocus = route.params?.focus ?? focusForLesson(practice?.lessonId) ?? "reply";
  const styles = useStyles();
  const { colors } = useTheme();
  const account = useAccount();
  const [setup, setSetup] = useState<LiveSetup | null>(null);
  const [stage, setStage] = useState<Stage>("intro");
  const [voicePref, setVoicePref] = useState(getPartnerVoicePref);
  const [speed, setSpeed] = useState(() => clampSpeed(getPartnerSpeed()));
  const [selfFocusBefore, setSelfFocusBefore] = useState<number | null>(null);
  const [selfFocusAfter, setSelfFocusAfter] = useState<number | null>(null);
  const [result, setResult] = useState<{ outcome: DrillOutcome | null; details: LiveDetails } | null>(null);
  const [debrief, setDebrief] = useState<{ value: LiveDebrief; provenance: Provenance | null } | null>(null);
  const [starting, setStarting] = useState(false);
  const seedRef = useRef(Math.floor(Math.random() * 100_000));
  // Re-read on every render: the account answers in the background.
  void account;
  const gate = liveGateNow();

  useEffect(() => {
    getDrillLevel("conv_live").then((level) => setSetup(prepareLive(focus, level, seedRef.current, contentId)));
  }, [focus, contentId]);

  const voice = setup ? voiceFor(voicePref, setup.personaVoice) : "Achird";
  const live = useLiveConversation(setup, { voice, speed });
  const phase = live.state.phase;

  useEffect(() => {
    if (stage === "running" && phase === "finished") setStage("rate");
  }, [stage, phase]);

  const replies = useMemo(() => completedTurns(live.state).map((t) => t.reply.measurement.transcript.trim()), [live.state]);

  async function start() {
    if (!setup || starting) return;
    setStarting(true);
    try {
      const ready = await readyForLiveConversation();
      if (!ready.open) {
        alertGate(ready);
        return;
      }
      const mic = await live.prepareMic();
      if (mic !== "ready") {
        showGlobalToast(mic === "denied" ? "Microphone permission is needed for this." : "Speech recognition isn't available.", "error");
        return;
      }
      setPartnerVoicePref(voicePref);
      setPartnerSpeed(speed);
      setResult(null);
      setDebrief(null);
      setSelfFocusAfter(null);
      setStage("running");
      live.start();
    } finally {
      setStarting(false);
    }
  }

  async function finish() {
    if (!setup) return;
    setStage("saving");
    const turns = completedTurns(live.state);
    const seconds = live.state.startedAt ? (Date.now() - live.state.startedAt) / 1000 : 0;
    const evaluated = evaluateLive(
      setup.focus,
      turns.map((t) => ({ partnerText: t.partner.text, measurement: t.reply.measurement, cutOff: t.reply.endReason === "cap", partnerSkipped: t.partnerSkipped })),
      { endedBy: live.state.endedBy, seconds },
    );
    setResult(evaluated);
    setStage("result");
    if (!evaluated.outcome) return;
    try {
      await recordDrillOutcome({
        drillType: "conv_live",
        outcome: evaluated.outcome,
        level: setup.level,
        contentId: setup.contentId,
        lessonId: practice?.lessonId,
        // Process numbers only: no transcripts are stored.
        metrics: { ...evaluated.details, selfFocusBefore, selfFocusAfter },
      });
    } catch (error) {
      logger.error(`[live] couldn't save — ${(error as Error).message}`);
      showGlobalToast("Couldn't save that one.", "error");
    }
    // The debrief: Tono AI's notes on the moves, or the phone's own.
    const input = {
      setting: setup.scene.setting,
      partnerName: setup.scene.partner.name,
      focus: setup.focus,
      turns: turns.map((t, i) => ({
        partner: t.partner.text,
        reply: t.reply.measurement.transcript,
        cutOff: t.reply.endReason === "cap",
        latencyMs: evaluated.details.turns[i]?.latencyMs ?? null,
        speakingSeconds: evaluated.details.turns[i]?.speakingSeconds ?? null,
      })),
      details: evaluated.details,
    };
    try {
      const r = await requestAnalysis("conversation_debrief", input, { hasVideo: false, hasTranscript: true, takeOptIn: true });
      if (r.status === "done") setDebrief({ value: r.value, provenance: r.provenance });
      else if (r.status === "unavailable" && r.fallback) setDebrief({ value: r.fallback.value, provenance: r.fallback.provenance });
      else setDebrief({ value: rulesDebrief(evaluated.details, replies), provenance: null });
    } catch (error) {
      logger.warn(`[live] debrief failed — ${(error as Error).message}`);
      setDebrief({ value: rulesDebrief(evaluated.details, replies), provenance: null });
    }
  }

  async function done() {
    if (result?.outcome) await completePracticeStep(practice, result.outcome.score);
    navigation.goBack();
  }

  function again() {
    seedRef.current += 1;
    live.reset();
    setStage("intro");
    setResult(null);
    setDebrief(null);
    getDrillLevel("conv_live").then((level) => setSetup(prepareLive(focus, level, seedRef.current)));
  }

  if (!setup) {
    return (
      <ScreenContainer>
        <SkeletonCard lines={4} />
      </ScreenContainer>
    );
  }

  const turn = live.state.turns[live.state.turns.length - 1];
  const minutesLine = conversationMinutesLine(account.allowance);

  return (
    <ScreenContainer style={styles.container}>
      <Header
        eyebrow="Live conversation"
        title={setup.title}
        onBack={() => {
          live.end();
          navigation.goBack();
        }}
        backIcon="close"
      />

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {stage === "intro" ? renderIntro() : null}
        {stage === "running" ? renderRunning() : null}
        {stage === "rate" ? (
          <Card style={styles.card}>
            <Txt variant="headline">And now: how much of your attention was on yourself?</Txt>
            <ScaleSlider value={selfFocusAfter} onChange={setSelfFocusAfter} lowLabel="On them" highLabel="On me" accessibilityLabel="Attention on yourself, 0 to 10" />
          </Card>
        ) : null}
        {stage === "result" && result ? renderResult(result) : null}
      </ScrollView>

      {stage === "intro" && (gate.open || gate.reason === "no_consent") ? <PrimaryButton label="Start the conversation" onPress={start} loading={starting} /> : null}
      {stage === "running" ? renderControls() : null}
      {stage === "rate" ? <PrimaryButton label="See how it went" onPress={finish} /> : null}
      {stage === "saving" ? <PrimaryButton label="Saving…" onPress={() => undefined} loading /> : null}
      {stage === "result" ? (
        <View style={styles.row}>
          <PrimaryButton label="Another" variant="secondary" onPress={again} style={styles.flex} />
          <PrimaryButton label="Done" onPress={done} style={styles.flex} />
        </View>
      ) : null}
    </ScreenContainer>
  );

  function renderIntro() {
    if (!setup) return null;
    const shut = !gate.open && gate.reason !== "no_consent";
    return (
      <>
        <Txt variant="callout" tone="secondary">
          {setup.instructions}
        </Txt>
        {shut ? (
          <>
            <Card style={styles.card}>
              <Txt variant="caption1" weight="700" color={colors.skill.conversation.fg}>
                What it sounds like
              </Txt>
              {SAMPLE_CONVERSATION.map((line, i) => (
                <Txt key={i} variant="callout" tone={line.who === "you" ? "secondary" : undefined}>
                  {line.who === "you" ? "You: " : "Them: "}
                  {line.text}
                </Txt>
              ))}
            </Card>
            {gate.open === false && gate.locked ? (
              <Card style={styles.card}>
                <Txt variant="headline">Live conversation is part of Tono Plus</Txt>
                <Txt variant="footnote" tone="secondary">
                  A partner who talks back in a natural voice and answers what you actually said, then a short look at the moves you made. The lesson and its drills
                  are here for you either way.
                </Txt>
                {purchasesEnabled() ? <PrimaryButton label="See Tono Plus" variant="ghost" size="sm" icon="sparkles-outline" onPress={openPaywall} /> : null}
              </Card>
            ) : gate.open === false ? (
              <Card style={styles.card}>
                <Txt variant="footnote" tone="secondary">
                  {whyNoLiveConversation(gate.reason)}
                </Txt>
              </Card>
            ) : null}
          </>
        ) : (
          <>
            <Card style={styles.card}>
              <Txt variant="caption1" weight="700" color={colors.skill.conversation.fg}>
                Who you're talking to
              </Txt>
              <Txt variant="callout">
                {setup.scene.partner.name}, {setup.scene.partner.role}.
              </Txt>
              <Txt variant="footnote" tone="secondary">
                {setup.scene.setting}.
              </Txt>
            </Card>
            <Card style={styles.card}>
              <Txt variant="caption1" weight="700" color={colors.skill.conversation.fg}>
                Voice
              </Txt>
              <View style={styles.chips}>
                <Chip label="Their own" selected={voicePref === "persona"} onPress={() => setVoicePref("persona")} />
                {PARTNER_VOICES.map((v) => (
                  <Chip key={v.id} label={v.description === "Easy-going" ? `${v.description} (${v.id})` : v.description} selected={voicePref === v.id} onPress={() => setVoicePref(v.id)} />
                ))}
              </View>
              <View style={styles.chips}>
                {SPEEDS.map((s) => (
                  <Chip key={s.value} label={s.label} selected={speed === s.value} onPress={() => setSpeed(s.value)} />
                ))}
              </View>
            </Card>
            <Card style={styles.card}>
              <Txt variant="headline">Right now, how much of your attention is on yourself?</Txt>
              <ScaleSlider value={selfFocusBefore} onChange={setSelfFocusBefore} lowLabel="On them" highLabel="On me" accessibilityLabel="Attention on yourself, 0 to 10" />
              <Txt variant="caption1" tone="muted">
                Optional. It's how you'll see your attention shift over time.
              </Txt>
            </Card>
            <Txt variant="caption1" tone="muted">
              About {setup.maxReplies} turns. It listens until you pause, and waits through a thinking pause; tap Done if you'd rather. Your words go to Tono AI as
              text so your partner can answer; your voice stays on your phone.{minutesLine ? ` ${minutesLine}.` : ""}
            </Txt>
          </>
        )}
      </>
    );
  }

  function renderRunning() {
    if (!setup) return null;
    return (
      <>
        {turn ? (
          <Pressable onPress={live.skipPartner} disabled={phase !== "partner"} accessibilityRole="button" accessibilityHint="Stops the partner so you can reply">
            <Card style={styles.bubble}>
              <Txt variant="caption1" weight="700" color={colors.skill.conversation.fg}>
                {setup.scene.partner.name}
              </Txt>
              <Txt variant="title3">{turn.partner.text}</Txt>
              {phase === "partner" ? (
                <Txt variant="caption2" tone="muted">
                  Tap to cut in
                </Txt>
              ) : null}
            </Card>
          </Pressable>
        ) : null}

        {phase === "opening" || phase === "thinking" ? (
          <View style={styles.center}>
            <Txt variant="footnote" tone="muted">
              {phase === "opening" ? "Starting…" : `${setup.scene.partner.name} is thinking…`}
            </Txt>
          </View>
        ) : null}

        {phase === "listening" || phase === "gap" ? (
          <View style={styles.center}>
            <View style={[styles.pulse, { backgroundColor: colors.skill.conversation.bg, transform: [{ scale: 1 + Math.max(0, live.volume) / 20 }] }]} />
            <Txt variant="headline" align="center">
              {setup.cue}
            </Txt>
            <Txt variant="footnote" tone="muted" align="center">
              {phase === "gap" ? "Your turn…" : "Listening. It moves on when you pause."}
            </Txt>
          </View>
        ) : null}

        {phase === "capturing" ? (
          <View style={styles.center}>
            <Txt variant="footnote" tone="muted">
              Got it.
            </Txt>
          </View>
        ) : null}

        {phase === "paused" ? (
          <Card style={styles.card}>
            <Txt variant="headline">Paused</Txt>
            <Txt variant="footnote" tone="secondary">
              Pick it up again when you're ready. You'll reply to what they last said.
            </Txt>
          </Card>
        ) : null}

        {phase === "failed" && live.state.failure ? (
          <Card style={styles.card}>
            <Txt variant="headline">{live.state.failure.reason === "offline" ? "Lost the connection" : "That didn't come through"}</Txt>
            <Txt variant="footnote" tone="secondary">
              {live.state.failure.reason === "offline"
                ? "Live conversation needs a connection. Try again, or finish here and see how it went."
                : live.state.failure.reason === "quota"
                  ? "That's this month's conversation minutes. You can still see how this one went."
                  : live.state.failure.retryable
                    ? "Try again, or finish here and see how it went."
                    : "Finish here and see how it went."}
            </Txt>
          </Card>
        ) : null}

        {live.voiceFailed ? (
          <Txt variant="caption1" tone="muted">
            The voice didn't come through for a line, so it's shown as text.
          </Txt>
        ) : null}
      </>
    );
  }

  function renderControls() {
    if (phase === "listening") return <PrimaryButton label="Done" variant="secondary" onPress={live.done} />;
    if (phase === "paused") return <PrimaryButton label="Carry on" onPress={live.resume} />;
    if (phase === "failed") {
      return (
        <View style={styles.row}>
          {live.state.failure?.retryable ? <PrimaryButton label="Try again" variant="secondary" onPress={live.retry} style={styles.flex} /> : null}
          <PrimaryButton label="See how it went" onPress={live.end} style={styles.flex} />
        </View>
      );
    }
    return <PrimaryButton label="End" variant="ghost" onPress={live.end} />;
  }

  function renderResult({ outcome, details }: { outcome: DrillOutcome | null; details: LiveDetails }) {
    if (!outcome) {
      return (
        <Card style={styles.card}>
          <Txt variant="headline">Didn't catch a reply.</Txt>
          <Txt variant="footnote" tone="secondary">
            If you froze, that's exactly what this practices, and nothing was counted. Next time, try one of the moves: ask about the last thing they said. If you did
            speak, check the mic isn't muted.
          </Txt>
        </Card>
      );
    }
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
        {debrief ? (
          <Card style={styles.card}>
            <Txt variant="caption1" weight="700" color={colors.skill.conversation.fg}>
              Moves you made · {producerName(debrief.provenance)}
            </Txt>
            <Txt variant="callout">{debrief.value.strength}</Txt>
            {debrief.value.moments.map((m, i) => (
              <Txt key={i} variant="footnote" tone="secondary">
                Turn {m.turn} · {MOVE_LABELS[m.move]}: “{m.quote}”
              </Txt>
            ))}
            <Txt variant="callout">{debrief.value.tryNext}</Txt>
          </Card>
        ) : (
          <SkeletonCard lines={3} />
        )}
        {details.turns.map((t, i) => (
          <Card key={i} style={styles.card}>
            <Txt variant="caption2" tone="muted">
              Turn {i + 1}
            </Txt>
            {t.notes.map((n) => (
              <Txt key={n} variant="callout">
                {n}
              </Txt>
            ))}
            {replies[i] ? (
              <Txt variant="footnote" tone="muted">
                “{replies[i]}”
              </Txt>
            ) : null}
          </Card>
        ))}
      </>
    );
  }
}

const useStyles = makeStyles((t) => ({
  container: { gap: t.space.md },
  scroll: { gap: t.space.md, paddingBottom: t.space.lg },
  card: { gap: t.space.sm },
  bubble: { gap: t.space.xs },
  center: { alignItems: "center", gap: t.space.md, paddingVertical: t.space.lg },
  pulse: { width: 96, height: 96, borderRadius: 48 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: t.space.xs },
  row: { flexDirection: "row", gap: t.space.sm },
  flex: { flex: 1 },
}));
