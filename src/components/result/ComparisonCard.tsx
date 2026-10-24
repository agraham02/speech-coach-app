import { View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Card } from "../common/Card";
import { Txt } from "../common/Txt";
import { makeStyles, useTheme } from "../../theme/ThemeProvider";
import type { SessionMetricPoint } from "../../services/db/statsRepo";
import { paceScore } from "../../domain/scoring/bands";


interface MetricRow {
  label: string;
  now: number | null;
  before: number | null;
  unit: string;
  better: (now: number, before: number) => boolean;
}

// Before/after for the same prompt: did this take improve on the last one?
export function ComparisonCard({ current, previous }: { current: SessionMetricPoint; previous: SessionMetricPoint }) {
  const styles = useStyles();
  const { colors } = useTheme();

  const all: MetricRow[] = [
    {
      label: "Pace",
      now: current.wpm,
      before: previous.wpm,
      unit: "wpm",
      // Closer to the 130 to 160 band that scores full marks (domain/scoring/bands.ts).
      better: (n, b) => paceScore(n) > paceScore(b),
    },
    { label: "Fillers", now: current.fillerRate, before: previous.fillerRate, unit: "/min", better: (n, b) => n < b },
    { label: "Eye contact", now: current.eyeContact, before: previous.eyeContact, unit: "%", better: (n, b) => n > b },
  ];
  const rows = all.filter((r) => r.now != null && r.before != null);

  if (rows.length === 0) return null;
  const daysAgo = Math.max(1, Math.round((Date.parse(current.recordedAt) - Date.parse(previous.recordedAt)) / 86_400_000));

  return (
    <Card style={styles.card}>
      <Txt variant="caption2" tone="muted" uppercase>
        Since your last take of this prompt · {daysAgo} day{daysAgo === 1 ? "" : "s"} ago
      </Txt>
      {rows.map((r) => {
        const same = Math.round(r.now!) === Math.round(r.before!);
        const improved = !same && r.better(r.now!, r.before!);
        return (
          <View key={r.label} style={styles.row}>
            <Txt variant="callout" style={styles.flex}>
              {r.label}
            </Txt>
            <Txt variant="footnote" tone="muted">
              {Math.round(r.before!)} →{" "}
            </Txt>
            <Txt variant="callout" weight="700">
              {Math.round(r.now!)} {r.unit}
            </Txt>
            <Ionicons
              name={same ? "remove" : improved ? "arrow-up-circle" : "arrow-down-circle"}
              size={18}
              color={same ? colors.textMuted : improved ? colors.success : colors.warning}
            />
          </View>
        );
      })}
    </Card>
  );
}

const useStyles = makeStyles((t) => ({
  card: { gap: t.space.sm },
  row: { flexDirection: "row", alignItems: "center", gap: t.space.xs },
  flex: { flex: 1 },
}));
