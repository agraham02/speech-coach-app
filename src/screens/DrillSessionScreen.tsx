import { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../navigation";
import { ScreenContainer } from "../components/common/ScreenContainer";
import { Card } from "../components/common/Card";
import { PrimaryButton } from "../components/common/PrimaryButton";
import { getTongueTwister } from "../data/tongueTwisters";
import { tokenizeScript } from "../domain/scriptTypes";
import { scoreDrillAttempt, scoreManualDrillAttempt } from "../domain/drillScoring";
import { insertDrillCompletion } from "../services/db/drillsRepo";
import { useLiveSpeechRecognition } from "../hooks/useLiveSpeechRecognition";
import { useRecordingTimer } from "../hooks/useRecordingTimer";
import { colors, radii, spacing, typography } from "../theme/theme";

type Props = NativeStackScreenProps<RootStackParamList, "DrillSession">;

type Stage = "idle" | "listening" | "manual_timing" | "result";

interface AttemptResult {
  accuracyPercent: number | null; // null = manual-timer attempt, nothing to compare against
  wpm: number;
}

// Normalizes the same way drillScoring.ts does, so the live highlight and
// the final score never disagree about what counts as "matched".
function normalizeWord(word: string): string {
  return word.toLowerCase().replace(/[^a-z0-9']/g, "");
}

export function DrillSessionScreen({ route, navigation }: Props) {
  const twister = getTongueTwister(route.params.twisterId);
  const [stage, setStage] = useState<Stage>("idle");
  const [result, setResult] = useState<AttemptResult | null>(null);
  const speech = useLiveSpeechRecognition();
  const timer = useRecordingTimer();
  // Tracks whether recognition has actually started listening at least once
  // for the current attempt — distinguishes "hasn't started yet" (still
  // awaiting the permission prompt, `isListening` is `false` because it
  // never got the chance to become true) from "started, then genuinely
  // ended" (also `false`, but for the opposite reason). Without this, the
  // auto-finalize effect below would fire the instant `stage` becomes
  // "listening", well before the user even answers the permission dialog —
  // confirmed live: denying permission produced an instant 0 WPM result
  // instead of letting the dialog resolve first.
  const hasStartedListeningRef = useRef(false);

  const targetWords = useMemo(() => (twister ? tokenizeScript(twister.text) : []), [twister]);

  // How many leading target words are matched, in order, by whatever's been
  // recognized so far — drives the live per-word highlight. Same
  // sequential-pointer approach as drillScoring.ts's final scorer, just
  // computed against the in-progress partial transcript instead of the
  // final one.
  const matchedCount = useMemo(() => {
    if (stage !== "listening") return 0;
    const recognizedWords = tokenizeScript(speech.partialTranscript || speech.finalTranscript)
      .map(normalizeWord)
      .filter(Boolean);
    let matched = 0;
    let searchFrom = 0;
    for (const targetWord of targetWords) {
      const foundAt = recognizedWords.indexOf(normalizeWord(targetWord), searchFrom);
      if (foundAt === -1) break;
      matched += 1;
      searchFrom = foundAt + 1;
    }
    return matched;
  }, [stage, speech.partialTranscript, speech.finalTranscript, targetWords]);

  async function finishListeningAttempt() {
    if (!twister) return;
    timer.stop();
    speech.stop();
    const recognized = speech.finalTranscript || speech.partialTranscript;
    const scored = scoreDrillAttempt(twister.text, recognized, Math.max(timer.elapsedSeconds, 1));
    await insertDrillCompletion({
      twisterId: twister.id,
      accuracyPercent: scored.accuracyPercent,
      wpm: scored.wpm,
      difficulty: twister.difficulty,
    });
    setResult({ accuracyPercent: scored.accuracyPercent, wpm: scored.wpm });
    setStage("result");
  }

  async function finishManualAttempt() {
    if (!twister) return;
    timer.stop();
    const wpm = scoreManualDrillAttempt(twister.text, Math.max(timer.elapsedSeconds, 1), twister.repeatCount);
    await insertDrillCompletion({
      twisterId: twister.id,
      accuracyPercent: 0,
      wpm,
      difficulty: twister.difficulty,
    });
    setResult({ accuracyPercent: null, wpm });
    setStage("result");
  }

  // Marks that recognition has genuinely started listening at least once
  // this attempt — read by the auto-finalize effect below to tell "hasn't
  // started yet" (still awaiting the permission prompt) apart from
  // "started, then ended". Both look identical as `isListening === false`.
  useEffect(() => {
    if (speech.isListening) hasStartedListeningRef.current = true;
  }, [speech.isListening]);

  // The native recognizer can end on its own well before the user taps Stop
  // — most commonly a "no-speech" timeout (confirmed live: Android's
  // SpeechRecognizer fires this after a few seconds of silence). Without
  // this, the screen would keep showing a live "still listening" timer over
  // a session that's already dead underneath it. Gated on
  // `hasStartedListeningRef` — without it, this fired the instant `stage`
  // became "listening", before the permission prompt was even answered
  // (confirmed live: denying permission produced an instant 0 WPM result).
  useEffect(() => {
    if (stage === "listening" && hasStartedListeningRef.current && !speech.isListening) {
      finishListeningAttempt();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [speech.isListening, stage]);

  // Permission genuinely denied — reacts to the hook's own committed state
  // rather than a synchronous check right after `await speech.start()`,
  // which would still read the pre-denial closure value (setState doesn't
  // update the current closure mid-function). Degrades to the manual timer
  // instead of sitting on a mic that will never start.
  useEffect(() => {
    if (stage === "listening" && speech.permissionDenied) {
      setStage("manual_timing");
    }
  }, [speech.permissionDenied, stage]);

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
    hasStartedListeningRef.current = false;
    timer.start();
    if (speech.isAvailable) {
      setStage("listening");
      await speech.start();
      // Deliberately no synchronous permissionDenied check here — the
      // effect above reacts to it once the state actually commits (see its
      // own comment for why a same-function read would be stale).
    } else {
      setStage("manual_timing");
    }
  }

  function handleRetry() {
    setResult(null);
    setStage("idle");
  }

  return (
    <ScreenContainer style={styles.container}>
      <View style={styles.header}>
        <Pressable
          onPress={() => navigation.goBack()}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Close"
        >
          <Ionicons name="close" size={24} color={colors.textPrimary} />
        </Pressable>
        <Text style={styles.repeatHint}>Repeat ×{twister.repeatCount}</Text>
      </View>

      <Card style={styles.targetCard}>
        <Text style={styles.targetText}>
          {targetWords.map((word, index) => (
            <Text key={index} style={index < matchedCount ? styles.wordMatched : styles.wordPending}>
              {word}
              {index < targetWords.length - 1 ? " " : ""}
            </Text>
          ))}
        </Text>
        {twister.focusSounds.length > 0 ? (
          <Text style={styles.focusSounds}>Focus: {twister.focusSounds.join(", ")}</Text>
        ) : null}
      </Card>

      {(stage === "manual_timing" || (stage === "listening" && !speech.isAvailable)) && (
        <Text style={styles.degradeNotice}>
          Live recognition isn't available on this device — using a self-timer instead. Approximate match only.
        </Text>
      )}

      {stage === "result" && result ? (
        <Card style={styles.resultCard}>
          <Text style={styles.resultWpm}>{result.wpm} WPM</Text>
          <Text style={styles.resultAccuracy}>
            {result.accuracyPercent === null
              ? "Logged from elapsed time — no live match available."
              : `${result.accuracyPercent}% approximate match`}
          </Text>
          <View style={styles.resultActions}>
            <PrimaryButton label="Retry" variant="secondary" onPress={handleRetry} style={styles.resultButton} />
            <PrimaryButton label="Done" onPress={() => navigation.goBack()} style={styles.resultButton} />
          </View>
        </Card>
      ) : (
        <View style={styles.controls}>
          {stage === "idle" ? (
            <PrimaryButton label="Start" onPress={handleStart} />
          ) : (
            <PrimaryButton
              label={`Stop · ${timer.elapsedSeconds}s`}
              variant="danger"
              onPress={stage === "listening" ? finishListeningAttempt : finishManualAttempt}
            />
          )}
        </View>
      )}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.md },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  repeatHint: { color: colors.textMuted, fontSize: typography.caption, fontWeight: "600" },
  targetCard: { gap: spacing.sm },
  targetText: { fontSize: typography.title, lineHeight: 34 },
  wordMatched: { color: colors.success, fontWeight: "700" },
  wordPending: { color: colors.textPrimary },
  focusSounds: { color: colors.textMuted, fontSize: typography.caption },
  degradeNotice: {
    color: colors.warning,
    fontSize: typography.caption,
    backgroundColor: colors.warningMuted,
    padding: spacing.sm,
    borderRadius: radii.sm,
  },
  controls: { marginTop: "auto" },
  resultCard: { gap: spacing.md, alignItems: "center", marginTop: "auto" },
  resultWpm: { color: colors.textPrimary, fontSize: typography.headline, fontWeight: "800" },
  resultAccuracy: { color: colors.textSecondary, fontSize: typography.body, textAlign: "center" },
  resultActions: { flexDirection: "row", gap: spacing.sm, width: "100%" },
  resultButton: { flex: 1 },
  missingText: { color: colors.textMuted, fontSize: typography.body },
});
