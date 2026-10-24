import { View } from "react-native";
import type { WorkSummary } from "../../domain/analysis/progress";
import type { StepStatus } from "../../domain/sessionSteps";
import { makeStyles, useTheme } from "../../theme/ThemeProvider";

// One segment per step of a take's work: filled when done, ink while running,
// quiet while it waits, red when it didn't finish. Shows how far along it is
// without pretending to know a percentage.
export function WorkBar({ work }: { work: WorkSummary }) {
  return <SegmentBar statuses={work.lines.map((l) => l.status)} />;
}

// The same bar for any list of steps (a Rewind's three stages, say).
export function SegmentBar({ statuses }: { statuses: StepStatus[] }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const done = statuses.filter((s) => s === "done").length;
  return (
    <View style={styles.row} accessibilityRole="progressbar" accessibilityLabel={`${done} of ${statuses.length} steps done`}>
      {statuses.map((status, i) => {
        const color = status === "done" ? colors.success : status === "running" ? colors.accent : status === "failed" || status === "interrupted" ? colors.danger : colors.surfaceRaised;
        return <View key={i} style={[styles.segment, { backgroundColor: color, opacity: status === "running" ? 0.85 : 1 }]} />;
      })}
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  row: { flexDirection: "row", gap: 4 },
  segment: { flex: 1, height: 4, borderRadius: 2 },
}));
