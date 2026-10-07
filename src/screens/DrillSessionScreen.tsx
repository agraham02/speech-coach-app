import { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../navigation";
import { ScreenContainer } from "../components/common/ScreenContainer";
import { Card } from "../components/common/Card";
import { PrimaryButton } from "../components/common/PrimaryButton";
import { getTongueTwister, TONGUE_TWISTERS } from "../data/tongueTwisters";
import { tokenizeHeard } from "../domain/speech/normalize";
import { fullText } from "../domain/speech/liveTranscript";
import {
  alignFinal,
  buildTarget,
  followLive,
  scoreAlignment,
  scoreManualAttempt,
  statusesFromAlignment,
  type DrillMiss,
  type DrillScore,
  type TargetWord,
  type WordStatus,
} from "../domain/speech/speechAlignment";
import { insertDrillCompletion } from "../services/db/drillsRepo";
import { getDrillLevel, recordDrillOutcome } from "../services/db/progressRepo";
import { paramsFor, scoreAccuracy, type DrillOutcome } from "../domain/drills/drillSpecs";
import { completePracticeStep } from "../services/practice/practiceEvents";
import { showGlobalToast } from "../components/common/ToastProvider";
import { useLiveSpeech } from "../hooks/useLiveSpeech";
import { useRecordingTimer } from "../hooks/useRecordingTimer";
import { logger } from "../utils/logger";
import { colors, radii, spacing, typography } from "../theme/theme";

type Props = NativeStackScreenProps<RootStackParamList, "DrillSession">;

type Stage = "idle" | "preparing" | "listening" | "finalizing" | "manual_timing" | "result";

type AttemptResult =
  | { kind: "live"; score: DrillScore; statuses: WordStatus[] }
  | { kind: "manual"; wpm: number }
  | { kind: "nothing_heard" };

// Once every target word has been resolved, the attempt completes on its own
// after this much quiet — no need to reach for Stop.
const AUTO_COMPLETE_QUIET_MS = 1500;
// Typical recognizer latency between speaking a word and its first partial;
// subtracted so WPM measures speaking time, not recognition delay.
const FIRST_RESULT_LATENCY_MS = 400;
// Safety cap on an attempt's length — generous, since people often pause
// before starting: the larger of a minute or 4x the expected reading time.
const EXPECTED_WPM = 150;
const MIN_CAP_MS = 60_000;

// Picks a twister at the adaptive level when a lesson didn't name one.
function pickTwisterForLevel(level: number): string {
  const tier = paramsFor("twister", level).tier;
  const pool = TONGUE_TWISTERS.filter((t) => t.difficulty === tier);
  return pool[Math.floor(Math.random() * pool.length)]?.id ?? TONGUE_TWISTERS[0].id;
}

export function DrillSessionScreen({ route, navigation }: Props) {
  const practice = route.params.practice;
  const [level, setLevel] = useState<number | null>(null);
  const [twisterId, setTwisterId] = useState<string | undefined>(route.params.twisterId);
  const twister = twisterId ? getTongueTwister(twisterId) : undefined;
  const targetWpm = level != null ? paramsFor("twister", level).targetWpm : undefined;
  const [lastOutcome, setLastOutcome] = useState<DrillOutcome | null>(null);

  useEffect(() => {
    getDrillLevel("twister").then((l) => {
      setLevel(l);
      setTwisterId((current) => current ?? pickTwisterForLevel(l));
    });
  }, []);
  const [stage, setStage] = useState<Stage>("idle");
  const [result, setResult] = useState<AttemptResult | null>(null);
  const speech = useLiveSpeech();
  const timer = useRecordingTimer();
  const finishingRef = useRef(false);
  const attemptStartedAtRef = useRef(0);

  const target = useMemo<TargetWord[]>(
    () => (twister ? buildTarget(twister.text, twister.repeatCount) : []),
    [twister],
  );
  const wordsPerRep = useMemo(() => (twister ? buildTarget(twister.text, 1).length : 0), [twister]);

  const live = useMemo(() => {
    if (stage !== "listening" && stage !== "finalizing") return null;
    return followLive(target, tokenizeHeard(speech.text).tokens);
  }, [stage, speech.text, target]);

  // Permission revoked or recognizer unavailable mid-attempt: keep the
  // attempt going on the self-timer instead of discarding it.
  useEffect(() => {
    if (stage === "listening" && (speech.status === "permission-denied" || speech.status === "unavailable")) {
      setStage("manual_timing");
    }
  }, [speech.status, stage]);

  // Auto-complete once everything has been said and the speaker goes quiet.
  useEffect(() => {
    if (stage !== "listening" || !live || live.cursor < target.length) return;
    const lastResultAt = speech.transcript.lastResultAtMs ?? Date.now();
    const wait = Math.max(0, AUTO_COMPLETE_QUIET_MS - (Date.now() - lastResultAt));
    const handle = setTimeout(() => finishListeningAttempt(), wait);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, live?.cursor, speech.transcript.lastResultAtMs, target.length]);

  // Safety cap so a forgotten attempt doesn't listen forever.
  useEffect(() => {
    if (stage !== "listening") return;
    const capMs = Math.max(MIN_CAP_MS, (target.length / EXPECTED_WPM) * 60_000 * 4);
    const handle = setTimeout(() => finishListeningAttempt(), capMs);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, target.length]);

  if (!twisterId || level == null) {
    return (
      <ScreenContainer style={styles.container}>
        <Text style={styles.missingText}>Loading…</Text>
      </ScreenContainer>
    );
  }

  if (!twister) {
    return (
      <ScreenContainer style={styles.container}>
        <Text style={styles.missingText}>Drill not found.</Text>
        <PrimaryButton label="Back" onPress={() => navigation.goBack()} />
      </ScreenContainer>
    );
  }

  async function handleStart() {
    setResult(null);
    finishingRef.current = false;
    if (speech.status === "unavailable") {
      beginManual();
      return;
    }
    setStage("preparing");
    // Permission first, *then* the clock — the old screen started timing
    // before the permission prompt was even answered.
    const ready = await speech.session.prepare();
    if (ready !== "ready") {
      beginManual();
      return;
    }
    speech.session.start({ contextualStrings: twister?.contextWords ?? [] });
    attemptStartedAtRef.current = Date.now();
    timer.start();
    setStage("listening");
  }

  function beginManual() {
    attemptStartedAtRef.current = Date.now();
    timer.start();
    setStage("manual_timing");
  }

  // Guarded so a Stop tap racing the auto-complete (or the safety cap) can
  // never save the same attempt twice.
  async function finishListeningAttempt() {
    if (!twister || finishingRef.current) return;
    finishingRef.current = true;
    setStage("finalizing");
    timer.stop();
    try {
      const transcript = await speech.session.stop();
      const tokens = tokenizeHeard(fullText(transcript)).tokens;
      if (tokens.length === 0) {
        // Nothing recognized at all (mic muted, too quiet, wrong input) —
        // that's not a 0% performance, so it isn't saved as one.
        setResult({ kind: "nothing_heard" });
        setStage("result");
        return;
      }
      const ops = alignFinal(target, tokens);
      const now = Date.now();
      const speakingMs =
        transcript.firstResultAtMs != null && transcript.lastResultAtMs != null
          ? transcript.lastResultAtMs - transcript.firstResultAtMs + FIRST_RESULT_LATENCY_MS
          : now - attemptStartedAtRef.current;
      const score = scoreAlignment(target, tokens, ops, { speakingMs }, twister.focusSounds);
      const outcome = scoreAccuracy(score.accuracyPercent, score.wpm, targetWpm);
      const change = await recordDrillOutcome({
        drillType: "twister",
        outcome,
        level: level ?? 1,
        contentId: twister.id,
        lessonId: practice?.lessonId,
        accuracyPercent: score.accuracyPercent,
        wpm: score.wpm,
        metrics: { misses: score.misses, perRep: score.perRep, focusSounds: score.focusSounds, extraWords: score.extraWords },
      });
      setLevel(change.levelAfter);
      setLastOutcome(outcome);
      if (change.leveledUp) showGlobalToast("Level up — twisters get a little harder now.", "success");
      setResult({ kind: "live", score, statuses: statusesFromAlignment(target, ops) });
    } catch (error) {
      logger.error(`[drill] finishing attempt failed — ${(error as Error).message}`);
      setResult({ kind: "manual", wpm: scoreManualAttempt(twister.text, timer.elapsedSeconds, twister.repeatCount) });
    }
    setStage("result");
  }

  async function finishManualAttempt() {
    if (!twister || finishingRef.current) return;
    finishingRef.current = true;
    timer.stop();
    speech.session.abort();
    const elapsedSeconds = Math.max((Date.now() - attemptStartedAtRef.current) / 1000, 1);
    const wpm = scoreManualAttempt(twister.text, elapsedSeconds, twister.repeatCount);
    await insertDrillCompletion({ twisterId: twister.id, accuracyPercent: null, wpm, difficulty: twister.difficulty });
    setResult({ kind: "manual", wpm });
    setStage("result");
  }

  async function handleDone() {
    await completePracticeStep(practice, lastOutcome?.score ?? null);
    navigation.goBack();
  }

  function handleRetry() {
    setResult(null);
    finishingRef.current = false;
    setStage("idle");
  }

  const currentRep = live?.currentRep ?? 0;
  const listening = stage === "listening" || stage === "finalizing";

  return (
    <ScreenContainer style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={12} accessibilityRole="button" accessibilityLabel="Close">
          <Ionicons name="close" size={24} color={colors.textPrimary} />
        </Pressable>
        <Text style={styles.repeatHint}>
          {listening
            ? `Rep ${Math.min(currentRep + 1, twister.repeatCount)} of ${twister.repeatCount}`
            : `Say it ×${twister.repeatCount}${targetWpm ? ` · ${targetWpm}+ wpm` : ""}`}
        </Text>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {stage === "result" && result?.kind === "live" ? (
          <ResultView twister={twister} target={target} wordsPerRep={wordsPerRep} result={result} />
        ) : (
          <Card style={styles.targetCard}>
            <Text style={styles.targetText} accessibilityLabel={twister.text}>
              {target
                .filter((w) => w.rep === (listening ? Math.min(currentRep, twister.repeatCount - 1) : 0))
                .map((word) => (
                  <Text
                    key={word.globalIndex}
                    style={[
                      styleForStatus(live?.statuses[word.globalIndex] ?? "pending"),
                      live && word.globalIndex === live.cursor ? styles.wordCurrent : null,
                    ]}
                  >
                    {word.display}
                    {word.display.endsWith("-") ? "" : " "}
                  </Text>
                ))}
            </Text>
            {twister.focusSounds.length > 0 ? (
              <Text style={styles.focusSounds}>Focus sounds: {twister.focusSounds.join(", ")}</Text>
            ) : null}
            {listening ? <ListeningStatus status={speech.status} heard={speech.text} /> : null}
          </Card>
        )}

        {stage === "manual_timing" ? (
          <Text style={styles.degradeNotice}>
            Live recognition isn't available right now, so this attempt uses a self-timer. Tap Stop when you finish.
          </Text>
        ) : null}

        {stage === "result" && result?.kind === "nothing_heard" ? (
          <Card style={styles.resultCard}>
            <Text style={styles.resultSub}>Didn't catch anything.</Text>
            <Text style={styles.focusSounds}>Check that your mic isn't muted, hold the phone a little closer, and try again.</Text>
          </Card>
        ) : null}

        {stage === "result" && result?.kind === "manual" ? (
          <Card style={styles.resultCard}>
            <Text style={styles.resultBig}>{result.wpm} WPM</Text>
            <Text style={styles.resultSub}>Logged from elapsed time — no live match was available.</Text>
          </Card>
        ) : null}
      </ScrollView>

      <View style={styles.controls}>
        {stage === "idle" ? <PrimaryButton label="Start" onPress={handleStart} /> : null}
        {stage === "preparing" ? <PrimaryButton label="Starting…" onPress={() => undefined} loading /> : null}
        {stage === "listening" && speech.status === "paused" ? (
          <PrimaryButton label="Resume listening" variant="secondary" onPress={() => speech.session.resume()} />
        ) : null}
        {stage === "listening" ? (
          <PrimaryButton label={`Stop · ${timer.elapsedSeconds}s`} variant="danger" onPress={finishListeningAttempt} />
        ) : null}
        {stage === "finalizing" ? <PrimaryButton label="Scoring…" onPress={() => undefined} loading /> : null}
        {stage === "manual_timing" ? (
          <PrimaryButton label={`Stop · ${timer.elapsedSeconds}s`} variant="danger" onPress={finishManualAttempt} />
        ) : null}
        {stage === "result" ? (
          <View style={styles.resultActions}>
            <PrimaryButton label="Try again" variant="secondary" onPress={handleRetry} style={styles.resultButton} />
            <PrimaryButton label="Done" onPress={handleDone} style={styles.resultButton} />
          </View>
        ) : null}
      </View>
    </ScreenContainer>
  );
}

function ListeningStatus({ status, heard }: { status: string; heard: string }) {
  const label =
    status === "restarting"
      ? "Reconnecting — keep going…"
      : status === "paused"
        ? "Paused by an interruption"
        : status === "error"
          ? "Recognition stopped. Tap Stop to score what was heard."
          : "Listening…";
  return (
    <View style={styles.listening}>
      <View style={[styles.listeningDot, status === "listening" ? styles.listeningDotOn : null]} />
      <View style={styles.listeningTextWrap}>
        <Text style={styles.listeningLabel}>{label}</Text>
        {heard ? (
          <Text style={styles.heardText} numberOfLines={2}>
            Heard: {heard}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

function ResultView({
  twister,
  target,
  wordsPerRep,
  result,
}: {
  twister: { repeatCount: number; focusSounds: string[] };
  target: TargetWord[];
  wordsPerRep: number;
  result: { score: DrillScore; statuses: WordStatus[] };
}) {
  const { score, statuses } = result;
  const misses = groupMisses(score.misses);
  const weakSounds = score.focusSounds.filter((f) => f.total > 0 && f.missed > 0);

  return (
    <View style={styles.resultWrap}>
      <Card style={styles.resultCard}>
        <Text style={styles.resultBig}>{score.accuracyPercent}%</Text>
        <Text style={styles.resultSub}>
          {score.cleanWordPercent}% words clean · {score.wpm} WPM · {score.repsCompleted}/{twister.repeatCount} reps
        </Text>
      </Card>

      <Card style={styles.repsCard}>
        {Array.from({ length: twister.repeatCount }, (_, rep) => (
          <View key={rep} style={styles.repRow}>
            <Text style={styles.repLabel}>Rep {rep + 1}</Text>
            <Text style={styles.repText}>
              {target
                .filter((w) => w.rep === rep)
                .map((w) => (
                  <Text key={w.globalIndex} style={styleForStatus(statuses[w.globalIndex])}>
                    {w.display}
                    {w.display.endsWith("-") ? "" : " "}
                  </Text>
                ))}
            </Text>
          </View>
        ))}
        <Text style={styles.legend}>
          <Text style={styles.wordHit}>clear</Text> · <Text style={styles.wordNear}>close</Text> ·{" "}
          <Text style={styles.wordMissed}>missed</Text>
        </Text>
      </Card>

      {misses.length > 0 ? (
        <Card style={styles.missesCard}>
          <Text style={styles.sectionLabel}>WHAT THE MIC HEARD</Text>
          {misses.slice(0, 8).map((m) => (
            <Text key={`${m.kind}-${m.target}-${m.heard}`} style={styles.missText}>
              {m.kind === "skipped" ? (
                <>
                  Skipped <Text style={styles.missWord}>“{m.target}”</Text>
                </>
              ) : (
                <>
                  Heard <Text style={styles.missWord}>“{m.heard}”</Text> for{" "}
                  <Text style={styles.missWord}>“{m.target}”</Text>
                </>
              )}
              {m.count > 1 ? <Text style={styles.missCount}> ×{m.count}</Text> : null}
            </Text>
          ))}
          {weakSounds.length > 0 ? (
            <Text style={styles.soundHint}>
              Slow down on the {weakSounds.map((f) => `“${f.sound}”`).join(" and ")} sound
              {weakSounds.length > 1 ? "s" : ""} — over-articulate, then build speed.
            </Text>
          ) : null}
        </Card>
      ) : (
        <Text style={styles.cleanNote}>Every word came through clearly{wordsPerRep > 6 ? " — try it faster next time." : "."}</Text>
      )}
    </View>
  );
}

function groupMisses(misses: DrillMiss[]): (DrillMiss & { count: number })[] {
  const grouped = new Map<string, DrillMiss & { count: number }>();
  for (const m of misses) {
    const key = `${m.kind}|${m.target}|${m.heard ?? ""}`;
    const existing = grouped.get(key);
    if (existing) existing.count += 1;
    else grouped.set(key, { ...m, count: 1 });
  }
  return [...grouped.values()].sort((a, b) => b.count - a.count);
}

function styleForStatus(status: WordStatus) {
  switch (status) {
    case "hit":
      return styles.wordHit;
    case "near":
      return styles.wordNear;
    case "missed":
      return styles.wordMissed;
    default:
      return styles.wordPending;
  }
}

const styles = StyleSheet.create({
  container: { gap: spacing.md },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  repeatHint: { color: colors.textMuted, fontSize: typography.caption, fontWeight: "600" },
  scrollContent: { gap: spacing.md, paddingBottom: spacing.md },
  targetCard: { gap: spacing.md },
  targetText: { fontSize: typography.title, lineHeight: 34 },
  wordHit: { color: colors.success, fontWeight: "700" },
  wordNear: { color: colors.warning, fontWeight: "700" },
  wordMissed: { color: colors.danger, fontWeight: "700" },
  wordPending: { color: colors.textPrimary },
  wordCurrent: { textDecorationLine: "underline", textDecorationColor: colors.accent },
  focusSounds: { color: colors.textMuted, fontSize: typography.caption },
  listening: { flexDirection: "row", gap: spacing.sm, alignItems: "flex-start" },
  listeningDot: { width: 10, height: 10, borderRadius: 5, marginTop: 4, backgroundColor: colors.textMuted },
  listeningDotOn: { backgroundColor: colors.danger },
  listeningTextWrap: { flex: 1, gap: 2 },
  listeningLabel: { color: colors.textSecondary, fontSize: typography.caption, fontWeight: "600" },
  heardText: { color: colors.textMuted, fontSize: typography.caption },
  degradeNotice: {
    color: colors.warning,
    fontSize: typography.caption,
    backgroundColor: colors.warningMuted,
    padding: spacing.sm,
    borderRadius: radii.sm,
  },
  controls: { gap: spacing.sm },
  resultWrap: { gap: spacing.md },
  resultCard: { gap: spacing.xs, alignItems: "center" },
  resultBig: { color: colors.textPrimary, fontSize: typography.headline + 8, fontWeight: "800" },
  resultSub: { color: colors.textSecondary, fontSize: typography.body, textAlign: "center" },
  repsCard: { gap: spacing.sm },
  repRow: { gap: 2 },
  repLabel: { color: colors.textMuted, fontSize: typography.caption, fontWeight: "700" },
  repText: { fontSize: typography.bodyLarge, lineHeight: 24 },
  legend: { color: colors.textMuted, fontSize: typography.caption },
  missesCard: { gap: spacing.sm },
  sectionLabel: { color: colors.textMuted, fontSize: typography.caption - 1, fontWeight: "700", letterSpacing: 0.8 },
  missText: { color: colors.textSecondary, fontSize: typography.body },
  missWord: { color: colors.textPrimary, fontWeight: "700" },
  missCount: { color: colors.textMuted },
  soundHint: { color: colors.accent, fontSize: typography.caption },
  cleanNote: { color: colors.success, fontSize: typography.body, textAlign: "center" },
  resultActions: { flexDirection: "row", gap: spacing.sm, width: "100%" },
  resultButton: { flex: 1 },
  missingText: { color: colors.textMuted, fontSize: typography.body },
});
