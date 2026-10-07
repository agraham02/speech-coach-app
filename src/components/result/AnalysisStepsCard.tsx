import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Card } from "../common/Card";
import { STEP_LABELS, type SessionStep, type StepState } from "../../domain/sessionSteps";
import { colors, radii, spacing, typography } from "../../theme/theme";

const VISIBLE_STEPS: SessionStep[] = ["transcribe", "audio_metrics", "presence", "coach", "cloud_review", "notion"];

const OPTIONAL_DESCRIPTIONS: Partial<Record<SessionStep, string>> = {
  cloud_review: "Gemini scores structure, delivery and presence. Uploads the video.",
  notion: "Add the clean transcript to today's journal page.",
};

interface Props {
  steps: StepState[];
  onRun: (step: SessionStep) => void;
  // Why a step can't run right now (e.g. the video was deleted).
  disabledReason?: Partial<Record<SessionStep, string>>;
}

export function AnalysisStepsCard({ steps, onRun, disabledReason = {} }: Props) {
  const byStep = new Map(steps.map((s) => [s.step, s]));
  return (
    <Card style={styles.card}>
      <Text style={styles.label}>ANALYSIS</Text>
      {VISIBLE_STEPS.map((step) => {
        const state = byStep.get(step);
        if (!state) return null;
        // No face timeline was captured (older take, or a drill): there's
        // nothing a video analysis could run on, so don't offer it.
        if (step === "presence" && state.status === "skipped") return null;
        return <StepRow key={step} state={state} onRun={() => onRun(step)} disabledReason={disabledReason[step]} />;
      })}
    </Card>
  );
}

function StepRow({ state, onRun, disabledReason }: { state: StepState; onRun: () => void; disabledReason?: string }) {
  const { status, step } = state;
  const busy = status === "running" || status === "pending";
  let detail: string;
  let action: string | null;
  let icon: keyof typeof Ionicons.glyphMap;
  let tint: string;

  switch (status) {
    case "done":
      detail = step === "notion" ? "Sent to your journal" : "Done";
      action = step === "cloud_review" ? "Run again" : step === "notion" ? null : "Re-run";
      icon = "checkmark-circle";
      tint = colors.success;
      break;
    case "running":
      detail = "Working…";
      action = null;
      icon = "ellipse-outline";
      tint = colors.accent;
      break;
    case "pending":
      detail = "Waiting…";
      action = null;
      icon = "time-outline";
      tint = colors.textMuted;
      break;
    case "failed":
    case "interrupted":
      detail = state.lastError ?? (status === "interrupted" ? "Interrupted — the app was closed." : "Failed");
      action = "Retry";
      icon = "alert-circle";
      tint = colors.danger;
      break;
    default:
      detail = OPTIONAL_DESCRIPTIONS[step] ?? "Not run";
      action = step === "cloud_review" ? "Get" : step === "notion" ? "Send" : "Run";
      icon = "add-circle-outline";
      tint = colors.textMuted;
  }

  return (
    <View style={styles.row}>
      {busy ? <ActivityIndicator size="small" color={colors.accent} /> : <Ionicons name={icon} size={20} color={tint} />}
      <View style={styles.text}>
        <Text style={styles.title}>{STEP_LABELS[step]}</Text>
        <Text style={[styles.detail, (status === "failed" || status === "interrupted") && styles.detailError]} numberOfLines={3}>
          {disabledReason && !busy && status !== "done" ? disabledReason : detail}
        </Text>
      </View>
      {action && !busy ? (
        <Pressable
          onPress={onRun}
          disabled={!!disabledReason}
          style={[styles.action, disabledReason ? styles.actionDisabled : null]}
          accessibilityRole="button"
          accessibilityLabel={`${action} ${STEP_LABELS[step]}`}
        >
          <Text style={styles.actionText}>{action}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.md },
  label: { color: colors.textMuted, fontSize: typography.caption - 1, fontWeight: "700", letterSpacing: 1 },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  text: { flex: 1, gap: 2 },
  title: { color: colors.textPrimary, fontSize: typography.body, fontWeight: "600" },
  detail: { color: colors.textSecondary, fontSize: typography.caption, lineHeight: 17 },
  detailError: { color: colors.danger },
  action: { paddingHorizontal: spacing.md, paddingVertical: spacing.xs + 2, borderRadius: radii.pill, backgroundColor: colors.accentMuted },
  actionDisabled: { opacity: 0.4 },
  actionText: { color: colors.accent, fontSize: typography.caption, fontWeight: "700" },
});
