import { useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import { RecordingTimer } from "./RecordingTimer";
import { tap } from "../../utils/haptics";
import { duration } from "../../theme/motion";
import { darkColors as colors, spacing, typography, font } from "../../theme/theme";

interface RecordBlindOverlayProps {
  promptText: string;
  remainingSeconds: number;
  targetSeconds: number;
}

// How long a tap shows the question and the time left.
const PEEK_MS = 4000;
// How long a time warning stays up.
const WARNING_MS = 3500;

// When to warn that time is running out: 30 and 10 seconds left for a take
// of a minute or more, just 10 for shorter ones, none for the very short.
export function wrapUpWarnings(targetSeconds: number): number[] {
  if (targetSeconds >= 60) return [30, 10];
  if (targetSeconds >= 20) return [10];
  return [];
}

// Opaque black cover over the live preview when "record blind" is on — the
// point is a blank screen, so nothing to watch yourself or the clock. Only a
// faint dot shows it's recording. A tap on the screen reveals the question
// and time left for a few seconds (you can lose the question mid-answer).
// With no clock in view, it warns as time runs out: the time left fades in
// for a moment, with a tap pattern you can feel (two taps at 30 seconds,
// three at 10 — different from the single buzz when your face is lost).
// The camera session and face-detection frame processor keep running
// underneath — this is purely a visual layer.
export function RecordBlindOverlay({ promptText, remainingSeconds, targetSeconds }: RecordBlindOverlayProps) {
  const [peeking, setPeeking] = useState(false);
  const [warning, setWarning] = useState<number | null>(null);
  const warned = useRef(new Set<number>());

  useEffect(() => {
    if (!peeking) return;
    const handle = setTimeout(() => setPeeking(false), PEEK_MS);
    return () => clearTimeout(handle);
  }, [peeking]);

  useEffect(() => {
    const at = wrapUpWarnings(targetSeconds).find((s) => remainingSeconds === s && !warned.current.has(s));
    if (at == null) return;
    warned.current.add(at);
    setWarning(at);
    const taps = at <= 10 ? 3 : 2;
    for (let i = 0; i < taps; i++) setTimeout(tap, i * 160);
  }, [remainingSeconds, targetSeconds]);

  useEffect(() => {
    if (warning == null) return;
    const handle = setTimeout(() => setWarning(null), WARNING_MS);
    return () => clearTimeout(handle);
  }, [warning]);

  const finalStretch = remainingSeconds <= 10 && wrapUpWarnings(targetSeconds).length > 0;

  return (
    <Pressable
      style={styles.container}
      onPress={() => setPeeking(true)}
      accessibilityRole="button"
      accessibilityLabel="Preview hidden. Tap to see the question and time left."
    >
      {peeking ? (
        <View style={styles.peek}>
          <Text style={styles.prompt}>{promptText}</Text>
          <RecordingTimer elapsedSeconds={remainingSeconds} />
        </View>
      ) : warning != null ? (
        <Animated.View entering={FadeIn.duration(duration.slow)} exiting={FadeOut.duration(duration.slow)} style={styles.peek} accessibilityLiveRegion="assertive">
          <Text style={styles.warning}>{warning} seconds left</Text>
          <Text style={styles.warningHint}>{warning <= 10 ? "Land your last point." : "Start heading for your point."}</Text>
        </Animated.View>
      ) : (
        <View style={[styles.recDot, finalStretch && styles.recDotFinal]} />
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "black",
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xl,
  },
  recDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.danger, opacity: 0.35 },
  // The last ten seconds: the dot brightens, so a glance says "wrap up".
  recDotFinal: { width: 10, height: 10, borderRadius: 5, opacity: 0.9 },
  peek: { alignItems: "center", gap: spacing.lg },
  prompt: { ...font("400"), color: colors.textSecondary, fontSize: typography.title, textAlign: "center", lineHeight: 30 },
  warning: { ...font("600"), color: colors.textPrimary, fontSize: 34, letterSpacing: -0.8, fontVariant: ["tabular-nums"] },
  warningHint: { ...font("400"), color: colors.textSecondary, fontSize: typography.body, textAlign: "center" },
});
