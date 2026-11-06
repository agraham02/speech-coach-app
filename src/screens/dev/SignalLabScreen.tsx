import { useCallback, useMemo, useState } from "react";
import { View } from "react-native";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../../navigation";
import { Screen } from "../../components/common/Screen";
import { Card } from "../../components/common/Card";
import { ListGroup, ListRow, SwitchRow } from "../../components/common/ListRow";
import { PrimaryButton } from "../../components/common/PrimaryButton";
import { Txt } from "../../components/common/Txt";
import { useToast } from "../../components/common/ToastProvider";
import { exportContext } from "../../services/dev/devInfo";
import { clearLabResults, getLabResults, getReadingPreview, setReadingPreview } from "../../services/dev/signalLabStore";
import { LAB_GROUP_LABELS, type LabGroup, type LabStatus } from "../../domain/signalLab/types";
import { LAB_TESTS, labTestsIn } from "../../domain/signalLab/registry";
import { READINGS, trustLabel, type ReadingId, type ReadingPreview } from "../../domain/signalLab/readingTrust";
import { buildSignalLabExport, latestResult, readingStandings, STATUS_LABELS, statusOf, type LabResults } from "../../domain/signalLab/results";
import { copyJson, exportFileName, shareJsonFile } from "../../utils/shareJson";
import { makeStyles } from "../../theme/ThemeProvider";

const GROUPS: LabGroup[] = ["voice", "clarity", "presence", "content"];

const STATUS_ICON: Record<LabStatus, "ellipse-outline" | "checkmark-circle" | "close-circle" | "help-circle" | "lock-closed"> = {
  not_run: "ellipse-outline",
  pass: "checkmark-circle",
  fail: "close-circle",
  unclear: "help-circle",
  blocked: "lock-closed",
};

function shortDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

// Dev, Signal Lab: the tests that decide which readings can be trusted
// (docs/overhaul/PLAN.md, section 6.5). Run them on the iPhone; the export is
// what gets pasted back so the formulas and the statuses can be set from data.
export function SignalLabScreen() {
  const styles = useStyles();
  const showToast = useToast();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [results, setResults] = useState<LabResults>(() => getLabResults());
  const [preview, setPreview] = useState<ReadingPreview>(() => getReadingPreview());

  useFocusEffect(
    useCallback(() => {
      setResults(getLabResults());
      setPreview(getReadingPreview());
    }, []),
  );

  const standings = useMemo(() => readingStandings(LAB_TESTS, results), [results]);
  const passed = LAB_TESTS.filter((t) => statusOf(t.def, results) === "pass").length;
  const beta = standings.filter((r) => r.status !== "now");
  const ready = beta.filter((r) => r.readyToPromote);

  function togglePreview(id: ReadingId, on: boolean) {
    const next = { ...preview, [id]: on };
    setPreview(next);
    setReadingPreview(next);
  }

  function exportInput() {
    return buildSignalLabExport({ context: exportContext(), entries: LAB_TESTS, results, preview });
  }

  async function copy() {
    const onClipboard = await copyJson(exportInput());
    showToast(onClipboard ? "Signal Lab results copied." : "Opened the share sheet.", "success");
  }

  return (
    <Screen title="Signal Lab" eyebrow="Dev" onBack={() => navigation.goBack()}>
      <Card style={styles.card}>
        <Txt variant="headline">
          {passed} of {LAB_TESTS.length} tests passed
        </Txt>
        <Txt variant="footnote" tone="secondary">
          A reading on probation or being tuned doesn't count towards a score until its tests pass here and the status is changed in code. Run the tests on the iPhone, then export and send the results back.
        </Txt>
        {ready.length > 0 ? (
          <Txt variant="footnote" weight="600">
            Ready to promote: {ready.map((r) => r.label).join(", ")}.
          </Txt>
        ) : null}
      </Card>

      {GROUPS.map((group) => {
        const tests = labTestsIn(group);
        return (
          <ListGroup key={group} title={LAB_GROUP_LABELS[group]}>
            {tests.length === 0 ? (
              <ListRow title="No tests yet" subtitle="They arrive with the next steps of phase 1" />
            ) : (
              tests.map(({ def }) => {
                const status = statusOf(def, results);
                const last = latestResult(results, def.id);
                const when = last ? ` · ${shortDate(last.at)}` : "";
                return (
                  <ListRow
                    key={def.id}
                    icon={STATUS_ICON[status]}
                    title={def.title}
                    subtitle={status === "blocked" ? (def.blockedBy ?? "Blocked") : `${STATUS_LABELS[status]}${when} · about ${def.minutes} min`}
                    chevron
                    onPress={() => navigation.navigate("DevSignalLabTest", { testId: def.id })}
                  />
                );
              })
            )}
          </ListGroup>
        );
      })}

      <ListGroup title="Readings that don't count yet">
        {beta.map((r) => {
          const done = r.tests.filter((t) => t.status === "pass").length;
          return (
            <SwitchRow
              key={r.id}
              title={r.label}
              subtitle={`${trustLabel(READINGS[r.id].status)} · tests ${done} of ${r.tests.length}${r.readyToPromote ? " · ready to promote" : ""}`}
              value={preview[r.id] === true}
              onValueChange={(on) => togglePreview(r.id, on)}
            />
          );
        })}
      </ListGroup>
      <Txt variant="caption1" tone="muted">
        The switches count a reading in this phone's scores as a preview. Rescore a take to see the change. They do nothing outside dev builds.
      </Txt>

      <ListGroup title="Other labs">
        <ListRow icon="scan-outline" title="Face Lab" subtitle="Live eye and face tracking, calibration, thresholds" chevron onPress={() => navigation.navigate("DevFaceLab")} />
        <ListRow icon="flask-outline" title="ASR Lab" subtitle="Compare transcription engines on your own takes" chevron onPress={() => navigation.navigate("AsrLab")} />
        <ListRow icon="pulse-outline" title="Voice Lab" subtitle="Open it from a take: Dev, Pipeline, pick a take" />
      </ListGroup>

      <View style={styles.actions}>
        <PrimaryButton label="Copy results as JSON" onPress={copy} />
        <PrimaryButton label="Share as a file" variant="ghost" onPress={() => shareJsonFile(exportFileName("signal-lab"), exportInput())} />
        <PrimaryButton
          label="Clear saved runs"
          variant="ghost"
          onPress={() => {
            clearLabResults();
            setResults({});
            showToast("Saved runs cleared.", "success");
          }}
        />
      </View>
    </Screen>
  );
}

const useStyles = makeStyles((t) => ({
  card: { gap: t.space.sm },
  actions: { gap: t.space.sm },
}));
