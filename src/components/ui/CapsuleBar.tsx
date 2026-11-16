import { View } from "react-native";
import { makeStyles, useTheme } from "../../theme/ThemeProvider";
import { capsuleFlexes, capsuleLabel, type CapsuleStep } from "./displayLogic";

export type { CapsuleStep } from "./displayLogic";

export interface CapsuleBarProps {
  steps: readonly CapsuleStep[];
  accessibilityLabel?: string;
  testID?: string;
}

// A session's steps as a row of thin pills, each as wide as its minutes: done
// in full ink, the current one at 40 percent, the rest a light neutral. One
// element for a screen reader: "Step 3 of 5, Drill".
export function CapsuleBar({ steps, accessibilityLabel, testID }: CapsuleBarProps) {
  const styles = useStyles();
  const { colors } = useTheme();
  const flexes = capsuleFlexes(steps);
  return (
    <View style={styles.row} accessible accessibilityLabel={accessibilityLabel ?? capsuleLabel(steps)} testID={testID}>
      {steps.map((step, i) => (
        <View
          key={i}
          style={[
            styles.cap,
            { flex: flexes[i] },
            step.state === "done" && { backgroundColor: colors.textPrimary },
            step.state === "current" && { backgroundColor: colors.textPrimary, opacity: 0.4 },
            step.state === "todo" && { backgroundColor: colors.accentMuted },
          ]}
        />
      ))}
    </View>
  );
}

const useStyles = makeStyles(() => ({
  row: { flexDirection: "row", gap: 5 },
  cap: { height: 8, borderRadius: 4 },
}));
