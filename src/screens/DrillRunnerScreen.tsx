import { useEffect, useMemo, useRef, useState } from "react";
import { SkeletonCard } from "../components/common/Skeleton";
import { GuideTip } from "../components/common/GuideTip";
import { ScrollView, View } from "react-native";
import * as Speech from "expo-speech";
import * as Haptics from "expo-haptics";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../navigation";
import { ScreenContainer } from "../components/common/ScreenContainer";
import { Header } from "../components/common/Header";
import { Card } from "../components/common/Card";
import { Txt } from "../components/common/Txt";
import { Chip } from "../components/common/Chip";
import { PrimaryButton } from "../components/common/PrimaryButton";
import { CountdownRing } from "../components/common/CountdownRing";
import { StatTile } from "../components/common/StatTile";
import { useLiveSpeech } from "../hooks/useLiveSpeech";
import { FIRST_RESULT_LATENCY_MS, fullText } from "../domain/speech/liveTranscript";
import { tokenizeHeard } from "../domain/speech/normalize";
import { buildTarget, followLive, type WordStatus } from "../domain/speech/speechAlignment";
import { prepareDrill, type DrillSetup } from "../domain/drills/prepareDrill";
import { evaluateDrill, type DrillDetails } from "../domain/drills/evaluateDrill";
import { DRILL_TITLES, type DrillOutcome } from "../domain/drills/drillSpecs";
import { uniqueContentWords, usedWord } from "../domain/dsp/volumePauses";
import { chainWords, nextSeed } from "../domain/drills/wordChain";
import { countReached, MAX_COUNT_RATE } from "../domain/drills/breathCount";
import { CHAIN_SEEDS } from "../content/drillContent";
import { defaultsFromProfile } from "../domain/profile";
import { getUserProfile } from "../services/prefs/prefsStore";
import { getDrillLevel, recordDrillOutcome, type ProgressChange } from "../services/db/progressRepo";
import { DrillProgressLine } from "../components/celebrate/DrillProgressLine";
import { completePracticeStep } from "../services/practice/practiceEvents";
import { showGlobalToast } from "../components/common/ToastProvider";
import { logger } from "../utils/logger";
import { makeStyles, useTheme } from "../theme/ThemeProvider";

type Props = NativeStackScreenProps<RootStackParamList, "Drill">;
type Stage = "intro" | "model" | "prep" | "listening" | "finalizing" | "result";

// One-breath count: this long without a new number means the breath ran out.
// Longer in stuttering mode, so a block is never taken for the end.
const BREATH_END_MS = 2000;
const BREATH_END_STUTTER_MS = 3500;

// One screen for every live-speech drill (pace and pause reading, minimal
// pairs, shadowing, fluency sprints, random-word story, Just a Minute,
// projection). Content and scoring live in domain/drills; this screen only
// runs the clock, listens, and shows progress.
export function DrillRunnerScreen({ route, navigation }: Props) {
  const { drill, contentId, practice } = route.params;
  const styles = useStyles();
  const { colors } = useTheme();
  const speech = useLiveSpeech();
  const [setup, setSetup] = useState<DrillSetup | null>(null);
  const [stage, setStage] = useState<Stage>("intro");
  const [elapsedMs, setElapsedMs] = useState(0);
  const [prepLeft, setPrepLeft] = useState(0);
  const [result, setResult] = useState<{ outcome: DrillOutcome; details: DrillDetails } | null>(null);
  const [change, setChange] = useState<ProgressChange | null>(null);
  const startedAtRef = useRef(0);
  const finishingRef = useRef(false);
  const seedRef = useRef(Math.floor(Math.random() * 100_000));
  const profileDefaults = useMemo(() => defaultsFromProfile(getUserProfile()), []);
  // Word chain: every seed shown so far, and where in the transcript the
  // current one started (the chain on screen restarts with each seed).
  const [seeds, setSeeds] = useState<string[]>([]);
  const [segmentStart, setSegmentStart] = useState(0);
  const lastActivityRef = useRef(0);

  useEffect(() => {
    getDrillLevel(drill).then((level) => setSetup(prepareDrill(drill, level, seedRef.current, contentId)));
  }, [drill, contentId]);

  // Clock while listening; timed drills end on their own.
  useEffect(() => {
    if (stage !== "listening") return;
    const timer = setInterval(() => {
      const ms = Date.now() - startedAtRef.current;
      setElapsedMs(ms);
      if (setup?.seconds && ms >= setup.seconds * 1000) {
        finish();
        return;
      }
      // One-breath count: ends on its own once the numbers stop.
      const breathEnd = profileDefaults.stutterMode ? BREATH_END_STUTTER_MS : BREATH_END_MS;
      if (setup?.live === "breath" && heardCountRef.current > 0 && Date.now() - lastActivityRef.current > breathEnd + FIRST_RESULT_LATENCY_MS) {
        finish();
        return;
      }
      // Word chain: a blank brings up a fresh word instead of ending it.
      const stall = setup?.params.stallSeconds;
      // Recognition lags speech a little, so allow for that on top of the grace.
      if (setup?.live === "chain" && stall && Date.now() - lastActivityRef.current > stall * 1000 + FIRST_RESULT_LATENCY_MS) {
        lastActivityRef.current = Date.now();
        setSeeds((current) => [...current, nextSeed(CHAIN_SEEDS, current, seedRef.current + current.length * 7)]);
        setSegmentStart(heardCountRef.current);
        Haptics.selectionAsync().catch(() => undefined);
      }
    }, 250);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, setup]);

  // Prep countdown (random-word story).
  useEffect(() => {
    if (stage !== "prep") return;
    if (prepLeft <= 0) {
      beginListening();
      return;
    }
    const t = setTimeout(() => setPrepLeft((p) => p - 1), 1000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, prepLeft]);

  const target = useMemo(() => (setup?.targetText ? buildTarget(setup.targetText, 1) : []), [setup]);
  const heard = useMemo(() => tokenizeHeard(speech.text).tokens, [speech.text]);
  const heardCountRef = useRef(0);
  heardCountRef.current = heard.length;

  // A new recognized word counts as still going (word chain). The volume
  // meter isn't used: background noise keeps it above "silent" in a lot of
  // real rooms, so a blank would never be noticed.
  useEffect(() => {
    if (stage === "listening") lastActivityRef.current = Date.now();
  }, [heard.length, stage]);
  const following = stage === "listening" || stage === "finalizing";
  const live = useMemo(
    () => (following && setup?.live === "follow" && target.length ? followLive(target, heard) : null),
    [following, setup, target, heard],
  );

  // Reading drills finish on their own once the passage is done.
  useEffect(() => {
    if (stage !== "listening" || !live || live.cursor < target.length) return;
    const handle = setTimeout(() => finish(), 1500);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, live?.cursor, target.length]);

  useEffect(() => () => {
    Speech.stop();
  }, []);

  if (!setup) {
    return (
      <ScreenContainer>
        <SkeletonCard lines={4} />
      </ScreenContainer>
    );
  }

  async function start() {
    if (!setup) return;
    finishingRef.current = false;
    setResult(null);
    const ready = await speech.session.prepare();
    if (ready !== "ready") {
      showGlobalToast(ready === "denied" ? "Microphone permission is needed for this drill." : "Speech recognition isn't available.", "error");
      return;
    }
    if (setup.type === "shadowing" && setup.line) {
      setStage("model");
      Speech.speak(setup.line, { rate: 0.95, onDone: () => beginListening(), onError: () => beginListening() });
      return;
    }
    if (setup.prepSeconds && setup.prepSeconds > 0) {
      setPrepLeft(setup.prepSeconds);
      setStage("prep");
      return;
    }
    beginListening();
  }

  function beginListening() {
    if (!setup) return;
    setSeeds(setup.words ?? []);
    setSegmentStart(0);
    lastActivityRef.current = Date.now();
    speech.session.start({
      volumeMeter: true,
      volumeIntervalMs: 100,
      // Biasing toward the target words would hide mispronunciations in
      // minimal pairs; reading drills don't need it either.
      contextualStrings: setup.type === "random_word_story" ? setup.words : [],
    });
    startedAtRef.current = Date.now();
    setElapsedMs(0);
    setStage("listening");
  }

  async function finish() {
    if (!setup || finishingRef.current) return;
    finishingRef.current = true;
    setStage("finalizing");
    try {
      const transcript = await speech.session.stop();
      const speakingMs =
        transcript.firstResultAtMs != null && transcript.lastResultAtMs != null
          ? transcript.lastResultAtMs - transcript.firstResultAtMs + FIRST_RESULT_LATENCY_MS
          : Date.now() - startedAtRef.current;
      const text = fullText(transcript);
      const volume = speech.session.getVolumeSamples();
      // Nothing recognized (and, for the volume drill, nothing audible):
      // that's a mic problem, not a 0% attempt — don't record it.
      if (!text.trim() && (setup.live !== "volume" || !volume.some((v) => v.value > 0))) {
        setResult(null);
        setStage("result");
        return;
      }
      const evaluated = evaluateDrill(setup, {
        transcript: text,
        speakingMs,
        volume,
        seedWords: setup.live === "chain" ? seeds : undefined,
        penalizeResets: !profileDefaults.stutterMode,
        ignoreSlips: profileDefaults.stutterMode,
        relaxedAccuracy: profileDefaults.relaxAccuracy,
      });
      const moved = await recordDrillOutcome({
        drillType: setup.type,
        outcome: evaluated.outcome,
        level: setup.level,
        contentId: setup.contentId,
        lessonId: practice?.lessonId,
        accuracyPercent: evaluated.details.accuracyPercent ?? null,
        wpm: evaluated.details.wpm ?? null,
        metrics: evaluated.details,
      });
      setChange(moved);
      setResult(evaluated);
    } catch (error) {
      logger.error(`[drill] ${setup.type} failed to score — ${(error as Error).message}`);
      showGlobalToast("Couldn't score that attempt.", "error");
    }
    setStage("result");
  }

  async function done() {
    if (result) await completePracticeStep(practice, result.outcome.score);
    navigation.goBack();
  }

  function tryAgain() {
    seedRef.current += 1;
    getDrillLevel(drill).then((level) => setSetup(prepareDrill(drill, level, seedRef.current, contentId)));
    setStage("intro");
    setResult(null);
  }

  const secondsLeft = setup.seconds ? Math.max(0, Math.ceil(setup.seconds - elapsedMs / 1000)) : null;

  return (
    <ScreenContainer style={styles.container}>
      <Header eyebrow={`${DRILL_TITLES[setup.type]} · level ${Math.floor(setup.level)}`} title={setup.title} onBack={() => navigation.goBack()} backIcon="close" />

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {stage === "intro" ? (
          <Txt variant="callout" tone="secondary">
            {setup.instructions}
          </Txt>
        ) : null}

        {stage === "model" ? (
          <Txt variant="callout" tone="accent">
            Listen…
          </Txt>
        ) : null}

        {stage === "prep" ? (
          <View style={styles.center}>
            <CountdownRing size={120} strokeWidth={8} durationMs={(setup.prepSeconds ?? 1) * 1000}>
              <Txt variant="largeTitle">{prepLeft}</Txt>
            </CountdownRing>
            <Txt tone="secondary">Think of an opening line…</Txt>
          </View>
        ) : null}

        {DrillContent({ setup, statuses: live?.statuses, cursor: live?.cursor, heard: heard.map((t) => t.raw), showHeard: stage !== "intro" })}

        {stage === "listening" ? (
          LiveStats({ setup, elapsedMs, secondsLeft, volume: speech.volume, heard: heard.map((t) => t.raw), cursor: live?.cursor ?? 0 })
        ) : null}

        {stage === "result" && result ? ResultCard({ setup, result }) : null}
        {stage === "result" && result && change ? <DrillProgressLine change={change} drillTitle={DRILL_TITLES[setup.type]} /> : null}
        {stage === "result" && !result ? (
          <Card style={styles.card}>
            <Txt variant="headline">Didn't catch anything.</Txt>
            <Txt variant="footnote" tone="secondary">
              Check that your mic isn't muted, hold the phone a little closer, and try again. Nothing was recorded.
            </Txt>
          </Card>
        ) : null}
      </ScrollView>

      {stage === "intro" ? <PrimaryButton label={setup.type === "shadowing" ? "Play and repeat" : "Start"} onPress={start} /> : null}
      {stage === "listening" ? (
        <PrimaryButton
          label={setup.live === "breath" ? "Out of breath" : secondsLeft != null ? `Finish · ${secondsLeft}s` : "Finish"}
          variant="danger"
          onPress={finish}
        />
      ) : null}
      {stage === "finalizing" ? <PrimaryButton label="Scoring…" onPress={() => undefined} loading /> : null}
      {stage === "result" ? (
        <View style={styles.row}>
          <PrimaryButton label="Try again" variant="secondary" onPress={tryAgain} style={styles.flex} />
          <PrimaryButton label="Done" onPress={done} style={styles.flex} />
        </View>
      ) : null}
      <GuideTip id="drill" />
    </ScreenContainer>
  );

  // --- pieces -----------------------------------------------------------

  function DrillContent({
    setup,
    statuses,
    cursor,
    heard,
    showHeard,
  }: {
    setup: DrillSetup;
    statuses?: WordStatus[];
    cursor?: number;
    heard: string[];
    showHeard: boolean;
  }) {
    if (setup.live === "follow" && setup.displayText) {
      // Highlight the clean target text as it's followed; pause drills show
      // their marks underneath for reference.
      return (
        <Card style={styles.card}>
          {statuses ? (
            <Txt variant="quote" style={styles.passage}>
              {target.map((w, i) => (
                <Txt
                  key={i}
                  variant="quote"
                  color={
                    statuses[i] === "hit"
                      ? colors.success
                      : statuses[i] === "near"
                        ? colors.warning
                        : statuses[i] === "missed"
                          ? colors.danger
                          : colors.textPrimary
                  }
                  style={i === cursor ? styles.current : undefined}
                >
                  {w.display}{" "}
                </Txt>
              ))}
            </Txt>
          ) : (
            <Txt variant="quote" style={styles.passage}>
              {setup.displayText}
            </Txt>
          )}
          {setup.type === "pause_reading" && statuses ? (
            <Txt variant="footnote" tone="muted">
              {setup.displayText}
            </Txt>
          ) : null}
        </Card>
      );
    }
    if (setup.live === "story" && setup.words) {
      return (
        <View style={styles.chips}>
          {setup.words.map((w) => (
            <Chip key={w} label={w} selected={showHeard && usedWord(heard, w)} />
          ))}
        </View>
      );
    }
    if (setup.live === "count") {
      const counted = uniqueContentWords(heard, setup.letter);
      return (
        <Card style={styles.card}>
          <Txt variant="caption2" tone="muted" uppercase>
            Counted
          </Txt>
          <Txt variant="callout">{showHeard && counted.length ? counted.join(", ") : "—"}</Txt>
        </Card>
      );
    }
    if (setup.live === "chain") {
      const current = seeds[seeds.length - 1] ?? setup.words?.[0] ?? "";
      const bridge = setup.type === "chain_bridge";
      const links = showHeard && !bridge ? chainWords(heard.slice(segmentStart), seeds) : [];
      const said = showHeard && bridge ? heard.slice(segmentStart).slice(-16).join(" ") : "";
      return (
        <Card style={styles.card}>
          <Txt variant="caption2" tone="muted" uppercase>
            {seeds.length > 1 ? "Fresh word — start here" : "Start from"}
          </Txt>
          <Txt variant="largeTitle" tone="accent">
            {current}
          </Txt>
          {links.length ? (
            <Txt variant="title3" style={styles.passage}>
              {links.map((w, i) => (
                <Txt key={`${w}-${i}`} variant="title3" tone={i === links.length - 1 ? "primary" : "secondary"}>
                  {"→ "}
                  {w}{" "}
                </Txt>
              ))}
            </Txt>
          ) : null}
          {said ? (
            <Txt variant="callout" tone="secondary">
              …{said}
            </Txt>
          ) : null}
        </Card>
      );
    }
    if (setup.live === "breath") {
      const count = showHeard ? countReached(heard) : 0;
      return (
        <Card style={[styles.card, styles.center]}>
          <Txt variant="display" tabular color={count >= (setup.params.target ?? 0) ? colors.success : colors.textPrimary}>
            {count}
          </Txt>
          <Txt variant="footnote" tone="secondary">
            {stage === "listening" ? "Easy and even — about two a second" : `Target: ${setup.params.target} on one breath`}
          </Txt>
        </Card>
      );
    }
    if (setup.live === "free" && setup.category) {
      return (
        <Card style={styles.card}>
          <Txt variant="caption2" tone="muted" uppercase>
            Topic
          </Txt>
          <Txt variant="title3">{setup.category}</Txt>
        </Card>
      );
    }
    return null;
  }

  function LiveStats({
    setup,
    elapsedMs,
    secondsLeft,
    volume,
    heard,
    cursor,
  }: {
    setup: DrillSetup;
    elapsedMs: number;
    secondsLeft: number | null;
    volume: number;
    heard: string[];
    cursor: number;
  }) {
    const minutes = Math.max(elapsedMs - 800, 1000) / 60000;
    if (setup.type === "pace_reading") {
      const wpm = Math.round(cursor / minutes);
      const inBand = wpm >= (setup.params.wpmMin ?? 0) && wpm <= (setup.params.wpmMax ?? 999);
      return (
        <View style={styles.row}>
          <StatTile value={cursor > 3 ? `${wpm}` : "…"} label="words / min" color={cursor > 3 ? (inBand ? colors.success : colors.warning) : undefined} />
          <StatTile value={`${setup.params.wpmMin}–${setup.params.wpmMax}`} label="target" />
        </View>
      );
    }
    if (setup.live === "volume") {
      const target = setup.params.volumeTarget ?? 4;
      const pct = Math.max(0, Math.min(1, (volume + 2) / 12));
      return (
        <View style={styles.meterWrap}>
          <View style={styles.meterTrack}>
            <View style={[styles.meterTarget, { left: `${((target + 2) / 12) * 100}%` }]} />
            <View style={[styles.meterFill, { width: `${pct * 100}%`, backgroundColor: volume >= target ? colors.success : colors.warning }]} />
          </View>
          <Txt variant="footnote" tone="muted">
            {secondsLeft}s left · stay right of the line
          </Txt>
        </View>
      );
    }
    if (setup.live === "chain") {
      const target = setup.params.target ?? 8;
      const links = setup.type === "chain_bridge" ? null : chainWords(heard, seeds).length;
      return (
        <View style={styles.row}>
          {links != null ? <StatTile value={`${links}`} label={`of ${target} links`} color={links >= target ? colors.success : undefined} /> : null}
          <StatTile value={`${secondsLeft}`} label="seconds left" />
          <StatTile value={`${Math.max(0, seeds.length - 1)}`} label="fresh words" />
        </View>
      );
    }
    if (setup.live === "breath") return null;
    if (setup.live === "count") {
      const count = uniqueContentWords(heard, setup.letter).length;
      return (
        <View style={styles.row}>
          <StatTile value={`${count}`} label={`of ${setup.params.target}`} color={count >= (setup.params.target ?? 0) ? colors.success : undefined} />
          <StatTile value={`${secondsLeft}`} label="seconds left" />
        </View>
      );
    }
    if (secondsLeft != null) {
      return (
        <View style={styles.row}>
          <StatTile value={`${secondsLeft}`} label="seconds left" />
        </View>
      );
    }
    return null;
  }

  function ResultCard({ setup, result }: { setup: DrillSetup; result: { outcome: DrillOutcome; details: DrillDetails } }) {
    const { outcome, details } = result;
    return (
      <Card style={styles.card}>
        <Txt variant="largeTitle" color={outcome.success ? colors.success : colors.warning}>
          {Math.round(outcome.score * 100)}%
        </Txt>
        <Txt variant="headline">{outcome.summary}</Txt>
        <Txt variant="footnote" tone="secondary">
          {outcome.success ? "Passed — the next one will be a touch harder." : "Not quite — the next one will ease off a little."}
        </Txt>
        {details.misses && details.misses.length > 0 ? (
          <View style={styles.missList}>
            {details.misses.slice(0, 6).map((m, i) => (
              <Txt key={i} variant="footnote" tone="secondary">
                {m.kind === "skipped" ? `Skipped “${m.target}”` : `Heard “${m.heard}” for “${m.target}”`}
              </Txt>
            ))}
          </View>
        ) : null}
        {setup.type === "word_chain" && details.counted && details.counted.length > 0 ? (
          <Txt variant="footnote" tone="secondary">
            {[seeds[0] ?? setup.words?.[0], ...details.counted].join(" → ")}
          </Txt>
        ) : null}
        {setup.live === "chain" && (details.resets ?? 0) > 0 ? (
          <Txt variant="footnote" tone="muted">
            You blanked {details.resets === 1 ? "once" : `${details.resets} times`} and picked it back up. That recovery is the skill.
          </Txt>
        ) : null}
        {details.missingWords && details.missingWords.length > 0 ? (
          <Txt variant="footnote" tone="secondary">
            Didn't hear: {details.missingWords.join(", ")}
          </Txt>
        ) : null}
        {setup.type === "pause_reading" ? (
          <Txt variant="footnote" tone="muted">
            Pauses are measured from your volume, so close your mouth fully in each one.
          </Txt>
        ) : null}
        {setup.live === "breath" && details.perSecond != null ? (
          <Txt variant="footnote" tone="secondary">
            {details.perSecond > MAX_COUNT_RATE
              ? `About ${details.perSecond} numbers a second — slow to an easy two, and let the breath do the work.`
              : `About ${details.perSecond} numbers a second — a steady pace.`}
          </Txt>
        ) : null}
      </Card>
    );
  }
}

const useStyles = makeStyles((t) => ({
  container: { gap: t.space.md },
  scroll: { gap: t.space.md, paddingBottom: t.space.lg },
  center: { alignItems: "center", gap: t.space.md },
  card: { gap: t.space.sm },
  passage: { fontSize: 26, lineHeight: 34 },
  current: { textDecorationLine: "underline" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: t.space.sm },
  row: { flexDirection: "row", gap: t.space.sm },
  flex: { flex: 1 },
  missList: { gap: 2 },
  meterWrap: { gap: t.space.sm },
  meterTrack: { height: 22, borderRadius: 11, backgroundColor: t.colors.surfaceRaised, overflow: "hidden" },
  meterFill: { height: "100%", borderRadius: 11 },
  meterTarget: { position: "absolute", top: 0, bottom: 0, width: 3, backgroundColor: t.colors.textPrimary, zIndex: 2 },
}));
