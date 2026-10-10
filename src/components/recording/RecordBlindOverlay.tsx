import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { RecordingTimer } from "./RecordingTimer";
import { darkColors as colors, spacing, typography } from "../../theme/theme";

interface RecordBlindOverlayProps {
  promptText: string;
  remainingSeconds: number;
}

// How long a tap shows the question and the time left.
const PEEK_MS = 4000;

// Opaque black cover over the live preview when "record blind" is on — the
// point is a blank screen, so nothing to watch yourself or the clock. Only a
// faint dot shows it's recording. A tap on the screen reveals the question
// and time left for a few seconds (you can lose the question mid-answer).
// The camera session and face-detection frame processor keep running
// underneath — this is purely a visual layer, so the haptic face-lost
// warning still fires.
export function RecordBlindOverlay({ promptText, remainingSeconds }: RecordBlindOverlayProps) {
  const [peeking, setPeeking] = useState(false);

  useEffect(() => {
    if (!peeking) return;
    const handle = setTimeout(() => setPeeking(false), PEEK_MS);
    return () => clearTimeout(handle);
  }, [peeking]);

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
      ) : (
        <View style={styles.recDot} />
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
  peek: { alignItems: "center", gap: spacing.lg },
  prompt: { color: colors.textSecondary, fontSize: typography.title, textAlign: "center", lineHeight: 30 },
});
