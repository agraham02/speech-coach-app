import { useMemo, useState } from "react";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp, NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../../navigation";
import { Screen } from "../../components/common/Screen";
import { Card } from "../../components/common/Card";
import { Txt } from "../../components/common/Txt";
import { getLabResults } from "../../services/dev/signalLabStore";
import { labTest } from "../../domain/signalLab/registry";
import { STATUS_LABELS, statusOf } from "../../domain/signalLab/results";
import { makeStyles } from "../../theme/ThemeProvider";

type Props = NativeStackScreenProps<RootStackParamList, "DevSignalLabTest">;

function when(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

// One Signal Lab test: what it asks, the bars it's held to, and the numbers
// from its recent runs.
export function SignalLabTestScreen({ route }: Props) {
  const styles = useStyles();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const entry = labTest(route.params.testId);
  const [results] = useState(() => getLabResults());
  const runs = useMemo(() => (entry ? (results[entry.def.id] ?? []) : []), [entry, results]);

  if (!entry) {
    return (
      <Screen title="Test not found" onBack={() => navigation.goBack()}>
        <Txt tone="secondary">No test is called {route.params.testId}.</Txt>
      </Screen>
    );
  }
  const { def } = entry;

  return (
    <Screen title={def.title} eyebrow={`Signal Lab · ${STATUS_LABELS[statusOf(def, results)]}`} onBack={() => navigation.goBack()}>
      <Txt variant="subhead" tone="secondary">
        {def.summary}
      </Txt>
      {def.blockedBy ? (
        <Card style={styles.card}>
          <Txt variant="headline">Blocked</Txt>
          <Txt variant="footnote" tone="secondary">
            {def.blockedBy}
          </Txt>
        </Card>
      ) : null}

      <Card style={styles.card}>
        <Txt variant="headline">The bars</Txt>
        {def.bars.map((bar) => (
          <Txt key={bar} variant="footnote">
            {bar}
          </Txt>
        ))}
        <Txt variant="caption1" tone="muted">
          If it fails: {def.onFail}
        </Txt>
      </Card>

      <Card style={styles.card}>
        <Txt variant="headline">What you'll do · about {def.minutes} min</Txt>
        {def.steps.map((step, i) => (
          <Txt key={step.id} variant="footnote">
            {i + 1}. {step.title} ({step.seconds}s): {step.instruction}
          </Txt>
        ))}
      </Card>

      <Txt variant="headline">Runs</Txt>
      {runs.length === 0 ? (
        <Txt variant="footnote" tone="secondary">
          No runs yet.
        </Txt>
      ) : (
        runs.map((run) => (
          <Card key={run.at} style={styles.card}>
            <Txt variant="subhead" weight="600">
              {run.outcome.pass === true ? "Passed" : run.outcome.pass === false ? "Failed" : "Unclear"} · {when(run.at)}
            </Txt>
            <Txt variant="footnote" tone="secondary">
              {run.outcome.summary}
            </Txt>
            {run.outcome.checks.map((check) => (
              <Txt key={check.label} variant="footnote">
                {check.pass === true ? "Pass" : check.pass === false ? "Fail" : "Info"} · {check.label}: {check.value}
                {check.bar ? ` (${check.bar})` : ""}
              </Txt>
            ))}
            {run.note ? (
              <Txt variant="caption1" tone="muted">
                Note: {run.note}
              </Txt>
            ) : null}
            <Txt variant="caption1" tone="muted">
              App {run.appVersion} · extractor {run.extractorVersion} · thresholds v{run.thresholdsVersion}
            </Txt>
          </Card>
        ))
      )}
    </Screen>
  );
}

const useStyles = makeStyles((t) => ({
  card: { gap: t.space.sm },
}));
