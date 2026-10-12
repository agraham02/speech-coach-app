import { View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Animated, { ZoomIn } from "react-native-reanimated";
import { makeStyles, useTheme } from "../../theme/ThemeProvider";
import { PressableScale } from "./PressableScale";
import { Txt } from "./Txt";

export interface TimelineStep {
  id: string;
  title: string;
  // Right-aligned meta ("2 min").
  meta?: string;
  subtitle?: string;
  state: "done" | "current" | "todo";
  onPress?: () => void;
}

const NODE = 22;

// Steps as a vertical path: nodes joined by a line, done ones filled with a
// check (in `color`), the current one ringed in ink. Used for today's plan,
// top-ups, the daily session and lessons.
export function StepTimeline({ steps, color, dense }: { steps: TimelineStep[]; color?: string; dense?: boolean }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const fill = color ?? colors.success;
  return (
    <View>
      {steps.map((step, i) => {
        const last = i === steps.length - 1;
        const row = (
          <View style={styles.row}>
            <View style={styles.rail}>
              {!last ? <View style={[styles.line, step.state === "done" && { backgroundColor: fill, opacity: 0.6 }]} /> : null}
              {step.state === "done" ? (
                <Animated.View entering={ZoomIn.duration(260)} style={[styles.node, { backgroundColor: fill, borderColor: fill }]}>
                  <Ionicons name="checkmark" size={14} color={colors.background} />
                </Animated.View>
              ) : (
                <View style={[styles.node, step.state === "current" && styles.nodeCurrent]}>
                  {step.state === "current" ? <View style={styles.nodeDot} /> : null}
                </View>
              )}
            </View>
            <View style={[styles.body, dense && styles.bodyDense, last && styles.bodyLast]}>
              <Txt variant={step.state === "current" ? "headline" : "callout"} tone={step.state === "done" ? "muted" : "primary"} numberOfLines={2}>
                {step.title}
              </Txt>
              {step.subtitle ? (
                <Txt variant="footnote" tone="secondary" numberOfLines={2}>
                  {step.subtitle}
                </Txt>
              ) : null}
            </View>
            {step.meta ? (
              <Txt variant="footnote" tone="muted" tabular>
                {step.meta}
              </Txt>
            ) : null}
            {step.onPress && step.state !== "done" ? <Ionicons name="chevron-forward" size={16} color={colors.textMuted} /> : null}
          </View>
        );
        return step.onPress ? (
          <PressableScale key={step.id} onPress={step.onPress} scaleTo={0.98} accessibilityRole="button" accessibilityLabel={step.title}>
            {row}
          </PressableScale>
        ) : (
          <View key={step.id}>{row}</View>
        );
      })}
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  // The rail stretches the whole row (gap included), so its line reaches the
  // next node.
  row: { flexDirection: "row", alignItems: "flex-start", gap: t.space.md - 2 },
  rail: { width: NODE, alignItems: "center", alignSelf: "stretch" },
  line: { position: "absolute", top: NODE + 3, bottom: 3, width: 1.5, borderRadius: 1, backgroundColor: t.colors.textMuted, opacity: 0.35 },
  node: {
    width: NODE,
    height: NODE,
    borderRadius: NODE / 2,
    borderWidth: 1.5,
    borderColor: t.colors.textMuted,
    alignItems: "center",
    justifyContent: "center",
  },
  nodeCurrent: { borderColor: t.colors.accent, borderWidth: 2 },
  nodeDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: t.colors.accent },
  body: { flex: 1, gap: 1, paddingBottom: t.space.md + 2 },
  bodyDense: { paddingBottom: t.space.sm + 6 },
  bodyLast: { paddingBottom: 0 },
}));
