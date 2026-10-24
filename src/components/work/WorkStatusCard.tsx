import { ActivityIndicator, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Card } from "../common/Card";
import { PrimaryButton } from "../common/PrimaryButton";
import { Txt } from "../common/Txt";
import { WorkBar } from "./WorkBar";
import { etaSentence, remainingSeconds, type EtaContext, type WorkSummary } from "../../domain/analysis/progress";
import { reviewLine, workHeadline, workReassurance } from "../../domain/analysis/workCopy";
import { STEP_LABELS, type SessionStep } from "../../domain/sessionSteps";
import { makeStyles, useTheme } from "../../theme/ThemeProvider";

interface Props {
  work: WorkSummary;
  // Seconds since the work began (useTakeWork), for "taking longer than usual".
  elapsed: number;
  eta: EtaContext;
  // Retry one step. Left out where the screen has its own way to retry.
  onRetry?: (step: SessionStep) => void;
}

// The one waiting state for a take's analysis: which step, how far along,
// roughly how long, what happens if you leave, and, when something didn't
// finish, what to do. Rendered nothing when there is nothing to say.
export function WorkStatusCard({ work, elapsed, eta, onRetry }: Props) {
  const styles = useStyles();
  const { colors } = useTheme();
  if (work.phase === "idle" || work.phase === "done") return null;

  const busy = work.phase === "running" || work.phase === "queued";
  const range = remainingSeconds(work, eta);
  const waitingOnConnection = work.reviewWaitsForConnection;
  // Only the review is outstanding and it can't go: say that, not "step 5 of 5".
  const headline = waitingOnConnection && work.onDevice === "done" ? "Your numbers are in" : workHeadline(work);
  const problems = work.problems.filter((p) => !(waitingOnConnection && p.step === "cloud_review"));

  return (
    <Card style={styles.card} accessibilityLabel={headline}>
      <View style={styles.head}>
        {busy ? <ActivityIndicator size="small" color={colors.accent} /> : <Ionicons name={waitingOnConnection ? "cloud-offline-outline" : "alert-circle-outline"} size={20} color={waitingOnConnection ? colors.textSecondary : colors.danger} />}
        <Txt variant="headline" style={styles.flex}>
          {headline}
        </Txt>
      </View>
      <WorkBar work={work} />
      {busy ? (
        <Txt variant="footnote" tone="secondary">
          {etaSentence(range, elapsed)}
        </Txt>
      ) : null}
      {waitingOnConnection ? (
        <Txt variant="footnote" tone="secondary">
          {reviewLine(work)}
        </Txt>
      ) : null}
      {problems.map((p) => (
        <View key={p.step} style={styles.problem}>
          <View style={styles.flex}>
            <Txt variant="footnote" weight="600">
              {STEP_LABELS[p.step]}
            </Txt>
            <Txt variant="footnote" tone="danger">
              {p.message ?? (p.status === "interrupted" ? "Interrupted when the app was closed." : "It didn't finish.")}
            </Txt>
          </View>
          {onRetry && !busy ? <PrimaryButton label="Try again" variant="secondary" size="sm" onPress={() => onRetry(p.step)} /> : null}
        </View>
      ))}
      <Txt variant="caption1" tone="muted">
        {workReassurance(work)}
      </Txt>
    </Card>
  );
}

const useStyles = makeStyles((t) => ({
  card: { gap: t.space.sm + 2 },
  head: { flexDirection: "row", alignItems: "center", gap: t.space.sm + 2 },
  flex: { flex: 1 },
  problem: { flexDirection: "row", alignItems: "center", gap: t.space.md },
}));
