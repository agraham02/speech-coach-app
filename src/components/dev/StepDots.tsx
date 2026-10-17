import { View } from "react-native";
import { ALL_STEPS, type StepState, type StepStatus } from "../../domain/sessionSteps";
import { makeStyles, useTheme } from "../../theme/ThemeProvider";
import type { Palette } from "../../theme/tokens";

// The dot color for a step's status. Skipped is hollow (see StepDots).
export function stepStatusColor(status: StepStatus | undefined, colors: Palette): string {
  switch (status) {
    case "done":
      return colors.success;
    case "failed":
      return colors.danger;
    case "interrupted":
      return colors.warning;
    case "running":
    case "pending":
      return colors.textPrimary;
    default:
      return colors.textMuted;
  }
}

// One dot per pipeline step, in order: transcript, voice, video, coaching,
// deep review.
export function StepDots({ steps }: { steps: StepState[] }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const byStep = new Map(steps.map((s) => [s.step, s.status]));
  return (
    <View style={styles.row} accessibilityLabel={ALL_STEPS.map((step) => step + " " + (byStep.get(step) ?? "none")).join(", ")}>
      {ALL_STEPS.map((step) => {
        const status = byStep.get(step);
        const color = stepStatusColor(status, colors);
        const hollow = status === undefined || status === "skipped";
        return <View key={step} style={[styles.dot, hollow ? { borderColor: color, borderWidth: 1.5 } : { backgroundColor: color }]} />;
      })}
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  row: { flexDirection: "row", alignItems: "center", gap: 6 },
  dot: { width: 10, height: 10, borderRadius: 5 },
}));
