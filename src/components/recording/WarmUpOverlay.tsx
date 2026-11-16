import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Txt } from "../common/Txt";
import { Ionicons } from "@expo/vector-icons";
import { useCountdownTimer } from "../../hooks/useCountdownTimer";
import type { WarmUpStep } from "../../domain/warmUpRoutine";
import { darkColors as colors, radii, spacing } from "../../theme/theme";

interface WarmUpOverlayProps {
  steps: WarmUpStep[];
  onComplete: () => void;
  onClose: () => void;
  topInset: number;
}

interface WarmUpStepViewProps {
  step: WarmUpStep;
  stepNumber: number;
  totalSteps: number;
  onStepDone: () => void;
}

// Rendered keyed by step index by the parent below, so mounting a new one
// per step is what resets the countdown — useCountdownTimer only seeds its
// `remainingSeconds` state once, from the `totalSeconds` it was constructed
// with, so reusing one instance across steps wouldn't restart the count.
function WarmUpStepView({ step, stepNumber, totalSteps, onStepDone }: WarmUpStepViewProps) {
  const { remainingSeconds, skip } = useCountdownTimer(step.seconds, onStepDone, true);

  return (
    <>
      <View style={styles.top}>
        <Txt variant="footnote" weight="600" style={styles.label}>
          Step {stepNumber} of {totalSteps} · {step.label}
        </Txt>
        <Txt variant="title2" style={styles.instruction}>{step.instruction}</Txt>
        <Txt variant="footnote" style={styles.explain}>{step.explain}</Txt>
      </View>

      <View style={styles.countdownWrap} pointerEvents="none">
        <Txt variant="display" tabular style={styles.countdown}>{remainingSeconds}</Txt>
      </View>

      <Pressable onPress={skip} style={styles.skipButton}>
        <Txt variant="callout" weight="600" style={styles.skipText}>{stepNumber === totalSteps ? "Finish" : "Next"}</Txt>
      </Pressable>
    </>
  );
}

// Shown while warming up, before the prep countdown (or directly before
// recording if prep is off). Same non-interactive-overlay-on-camera shape
// as PrepOverlay, but steps through several timed instructions in sequence
// instead of one countdown.
export function WarmUpOverlay({ steps, onComplete, onClose, topInset }: WarmUpOverlayProps) {
  const [stepIndex, setStepIndex] = useState(0);

  function handleStepDone() {
    if (stepIndex + 1 >= steps.length) {
      onComplete();
    } else {
      setStepIndex((prev) => prev + 1);
    }
  }

  const currentStep = steps[stepIndex];
  if (!currentStep) return null;

  return (
    <View style={styles.container} pointerEvents="box-none">
      <View style={[styles.topRow, { top: topInset }]}>
        <Pressable
          onPress={onClose}
          style={styles.closeButton}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Close"
        >
          <Ionicons name="close" size={22} color={colors.textPrimary} />
        </Pressable>

        {/* Distinct from ✕ on purpose — ✕ exits the whole recording screen
            (confirmed live, worth keeping separate), this only dismisses the
            warm-up and moves on to Prep/idle, same as finishing it normally. */}
        <Pressable
          onPress={onComplete}
          style={styles.skipAllButton}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Skip warm-up"
        >
          <Txt variant="footnote" weight="600" style={styles.skipAllText}>Skip warm-up</Txt>
        </Pressable>
      </View>

      <WarmUpStepView
        key={stepIndex}
        step={currentStep}
        stepNumber={stepIndex + 1}
        totalSteps={steps.length}
        onStepDone={handleStepDone}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: spacing.xxl,
  },
  topRow: {
    position: "absolute",
    left: spacing.lg,
    right: spacing.lg,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    zIndex: 1,
  },
  closeButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center",
    justifyContent: "center",
  },
  skipAllButton: {
    backgroundColor: "rgba(0,0,0,0.55)",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    borderRadius: radii.pill,
  },
  skipAllText: { color: colors.textPrimary },
  top: { gap: spacing.sm, paddingHorizontal: spacing.xl, alignItems: "center", marginTop: spacing.xl },
  label: { color: colors.accent },
  instruction: { color: colors.textPrimary, textAlign: "center" },
  // Deliberately smaller/softer than `instruction` — the "why" belongs to
  // this line now, not nested as jargon inside the instruction itself.
  explain: { color: colors.textSecondary, textAlign: "center" },
  countdownWrap: {
    width: 140,
    height: 140,
    borderRadius: 70,
    borderWidth: 4,
    borderColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.4)",
  },
  // A big digit sized to fill the ring, so size and line height are set here on top of the display variant.
  countdown: { color: colors.textPrimary, fontSize: 56, lineHeight: 58 },
  skipButton: {
    backgroundColor: "rgba(0,0,0,0.55)",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm + 2,
    borderRadius: radii.pill,
  },
  skipText: { color: colors.textPrimary },
});
