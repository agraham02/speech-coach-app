import { View } from "react-native";
import type { WorkSummary } from "../../domain/analysis/progress";
import { makeStyles, useTheme } from "../../theme/ThemeProvider";

// One segment per step of a take's work: filled when done, ink while running,
// quiet while it waits, red when it didn't finish. Shows how far along it is
// without pretending to know a percentage.
export function WorkBar({ work }: { work: WorkSummary }) {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <View style={styles.row} accessibilityRole="progressbar" accessibilityLabel={`${work.finished} of ${work.total} steps done`}>
      {work.lines.map((line) => {
        const color =
          line.status === "done"
            ? colors.success
            : line.status === "running"
              ? colors.accent
              : line.status === "failed" || line.status === "interrupted"
                ? colors.danger
                : colors.surfaceRaised;
        return <View key={line.step} style={[styles.segment, { backgroundColor: color, opacity: line.status === "running" ? 0.85 : 1 }]} />;
      })}
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  row: { flexDirection: "row", gap: 4 },
  segment: { flex: 1, height: 4, borderRadius: 2 },
}));
