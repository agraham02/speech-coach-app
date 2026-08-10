import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useCountdownTimer } from "../../hooks/useCountdownTimer";
import type { WarmUpStep } from "../../domain/warmUpRoutine";
import { colors, radii, spacing, typography } from "../../theme/theme";

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
        <Text style={styles.label}>
          Step {stepNumber} of {totalSteps} · {step.label}
        </Text>
        <Text style={styles.instruction}>{step.instruction}</Text>
      </View>

      <View style={styles.countdownWrap} pointerEvents="none">
        <Text style={styles.countdown}>{remainingSeconds}</Text>
      </View>

      <Pressable onPress={skip} style={styles.skipButton}>
        <Text style={styles.skipText}>{stepNumber === totalSteps ? "Finish" : "Next"}</Text>
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
      <Pressable
        onPress={onClose}
        style={[styles.closeButton, { top: topInset }]}
        hitSlop={12}
        accessibilityRole="button"
        accessibilityLabel="Close"
      >
        <Ionicons name="close" size={22} color={colors.textPrimary} />
      </Pressable>

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
  closeButton: {
    position: "absolute",
    left: spacing.lg,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1,
  },
  top: { gap: spacing.sm, paddingHorizontal: spacing.xl, alignItems: "center", marginTop: spacing.xl },
  label: { color: colors.accent, fontSize: typography.caption, fontWeight: "700", letterSpacing: 1 },
  instruction: { color: colors.textPrimary, fontSize: typography.title, fontWeight: "600", textAlign: "center" },
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
  countdown: { color: colors.textPrimary, fontSize: 56, fontWeight: "300", fontVariant: ["tabular-nums"] },
  skipButton: {
    backgroundColor: "rgba(0,0,0,0.55)",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm + 2,
    borderRadius: radii.pill,
  },
  skipText: { color: colors.textPrimary, fontSize: typography.body, fontWeight: "600" },
});
