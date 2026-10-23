import { useEffect, useMemo, useState } from "react";
import { Alert, Platform, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../../navigation";
import { Screen } from "../../components/common/Screen";
import { Card } from "../../components/common/Card";
import { IconButton } from "../../components/common/IconButton";
import { ListGroup, ListRow, SwitchRow } from "../../components/common/ListRow";
import { PrimaryButton } from "../../components/common/PrimaryButton";
import { SegmentedControl } from "../../components/common/SegmentedControl";
import { Txt } from "../../components/common/Txt";
import { useToast } from "../../components/common/ToastProvider";
import { Mono } from "../../components/dev/Mono";
import { Sparkline } from "../../components/dev/Sparkline";
import { useLiveMetrics } from "../../hooks/useLiveMetrics";
import {
  INTERVAL_CHOICES,
  LIVE_WINDOW,
  clearRuns,
  getLiveInterval,
  getRuns,
  isManualRunning,
  isOverlayOn,
  manualStartedMs,
  nativeMetricsAvailable,
  peekManual,
  setLiveInterval,
  setOverlayOn,
  startManual,
  stopManual,
  subscribeManual,
  subscribeRuns,
} from "../../services/dev/deviceMetrics";
import {
  childrenOf,
  describeCpu,
  describeRun,
  formatDurationMs,
  formatMemory,
  formatMemoryDelta,
  runsToCsv,
  thermalLabel,
  thermalLevel,
  type MetricRun,
  type RunKind,
} from "../../domain/dev/metrics";
import { copyText } from "../../utils/copyText";
import { copyJson } from "../../utils/shareJson";
import { exportContext } from "../../services/dev/devInfo";
import { makeStyles, useTheme } from "../../theme/ThemeProvider";

type Props = NativeStackScreenProps<RootStackParamList, "DevMetrics">;

const KIND_ICON: Record<RunKind, "git-network-outline" | "layers-outline" | "flask-outline" | "scan-outline" | "radio-button-on-outline"> = {
  pipeline: "git-network-outline",
  step: "layers-outline",
  asr: "flask-outline",
  face: "scan-outline",
  manual: "radio-button-on-outline",
};

// Memory, CPU, thermal, battery and storage, live and per run, for judging
// what on-device models cost. Runs are recorded automatically for pipeline
// steps, ASR Lab engines and the Face Lab camera; "Start recording" covers
// anything else (leave it running and go use the app).
export function MetricsScreen({ navigation }: Props) {
  const styles = useStyles();
  const { colors } = useTheme();
  const showToast = useToast();
  const { latest, history } = useLiveMetrics();
  const [runs, setRuns] = useState<MetricRun[]>(getRuns);
  const [recording, setRecording] = useState(isManualRunning);
  const [overlay, setOverlay] = useState(isOverlayOn);
  const [interval, setIntervalMs] = useState(getLiveInterval);
  const [expanded, setExpanded] = useState<string | null>(null);
  const hasNative = nativeMetricsAvailable();

  useEffect(() => subscribeRuns(setRuns), []);
  useEffect(() => subscribeManual(setRecording), []);

  const n = latest?.native ?? null;
  const ios = Platform.OS === "ios";
  const cores = n?.cpuCores;
  const memorySeries = useMemo(() => history.map((r) => r.native?.appMemoryBytes ?? null), [history]);
  const cpuSeries = useMemo(() => history.map((r) => r.cpuPercent), [history]);
  // Recomputed every tick (the hook re-renders once a reading lands).
  const manualSoFar = recording ? peekManual() : null;
  const manualSince = manualStartedMs();
  const thermal = thermalLevel(n?.thermalState);
  const thermalColor = thermal == null || thermal === 0 ? colors.textPrimary : thermal === 1 ? colors.warning : colors.danger;
  const tops = runs.filter((r) => !r.parentId);

  function toggleRecording() {
    if (recording) {
      const run = stopManual();
      if (run) showToast(run.label + ": " + describeRun(run), "success");
    } else {
      startManual();
    }
  }

  function chooseInterval(ms: number) {
    setIntervalMs(ms);
    setLiveInterval(ms);
  }

  function toggleOverlay(on: boolean) {
    setOverlay(on);
    setOverlayOn(on);
  }

  async function copyRuns(how: "csv" | "json") {
    const ok = how === "csv" ? await copyText(runsToCsv(runs)) : await copyJson({ kind: "tono-device-metrics", ...exportContext(), runs });
    if (ok) showToast(how === "csv" ? "Runs copied as CSV." : "Runs copied as JSON.", "success");
  }

  function confirmClear() {
    Alert.alert("Clear recorded runs?", "This only clears the Metrics list.", [
      { text: "Cancel", style: "cancel" },
      { text: "Clear", style: "destructive", onPress: clearRuns },
    ]);
  }

  const appFacts: [string, string][] = n
    ? [
        ["Resident (RSS)", formatMemory(n.appResidentBytes)],
        ["Peak since launch", formatMemory(n.appLifetimePeakBytes)],
        ...(ios ? ([["Headroom before iOS kills it", formatMemory(n.appHeadroomBytes)]] as [string, string][]) : []),
        ...(!ios ? ([["Native heap", formatMemory(n.nativeHeapBytes)], ["Java heap", formatMemory(n.javaHeapBytes)]] as [string, string][]) : []),
        ["JS heap (Hermes)", formatMemory(latest?.jsHeapBytes)],
      ]
    : [["JS heap (Hermes)", formatMemory(latest?.jsHeapBytes)]];

  const deviceFacts: [string, string][] = [
    ...(n
      ? ([
          ["RAM free" + (ios ? " (rough)" : ""), formatMemory(n.deviceAvailableBytes) + " of " + formatMemory(n.deviceTotalBytes) + (n.deviceLowMemory ? ", low" : "")],
          ["Battery", batteryText(n.batteryLevel, n.batteryState, n.lowPowerMode)],
          ...(n.batteryCurrentMicroAmps != null ? ([["Current draw", Math.round(Math.abs(n.batteryCurrentMicroAmps) / 1000) + " mA"]] as [string, string][]) : []),
        ] as [string, string][])
      : []),
    ["Storage free", formatMemory(latest?.storageFreeBytes) + " of " + formatMemory(latest?.storageTotalBytes)],
  ];

  return (
    <Screen
      title="Metrics"
      eyebrow="Dev"
      onBack={navigation.goBack}
      right={<IconButton icon="copy-outline" accessibilityLabel="Copy runs as CSV" onPress={() => copyRuns("csv")} />}
    >
      {!hasNative ? (
        <Card>
          <Txt variant="footnote" tone="warning">
            This build has no metrics module yet, so memory, CPU, thermal and battery are missing and runs only record their time. Make a new build to get them.
          </Txt>
        </Card>
      ) : null}

      <Card style={styles.card}>
        <View style={styles.headline}>
          <View style={styles.big}>
            <Txt variant="footnote" tone="secondary">
              {ios ? "App memory (footprint)" : "App memory (PSS)"}
            </Txt>
            <Mono variant="title2">{formatMemory(n?.appMemoryBytes)}</Mono>
          </View>
          <View style={styles.big}>
            <Txt variant="footnote" tone="secondary">
              App CPU
            </Txt>
            <Mono variant="title2">{latest?.cpuPercent != null ? Math.round(latest.cpuPercent) + "%" : "-"}</Mono>
          </View>
        </View>
        <Sparkline values={memorySeries} slots={LIVE_WINDOW} />
        <Sparkline values={cpuSeries} slots={LIVE_WINDOW} max={Math.max(100, (cores ?? 1) * 100)} height={28} color={colors.textMuted} />
        <Txt variant="caption1" tone="muted">
          {"Last " + Math.round((LIVE_WINDOW * interval) / 1000) + " s. CPU: 100% is one full core. Now " + describeCpu(latest?.cpuPercent ?? null, cores) + "."}
        </Txt>
        <View style={styles.facts}>
          {appFacts.map(([label, value]) => (
            <Fact key={label} label={label} value={value} />
          ))}
        </View>
      </Card>

      <Card style={styles.card}>
        <View style={styles.facts}>
          <Fact label="Thermal" value={thermalLabel(n?.thermalState) + (n?.thermalHeadroom != null ? " (headroom " + n.thermalHeadroom.toFixed(2) + ")" : "")} color={thermalColor} />
          {deviceFacts.map(([label, value]) => (
            <Fact key={label} label={label} value={value} />
          ))}
        </View>
      </Card>

      <View style={styles.section}>
        <PrimaryButton label={recording ? "Stop recording" : "Start recording"} icon={recording ? "stop" : "radio-button-on"} onPress={toggleRecording} />
        <Txt variant="caption1" tone="muted">
          {recording && manualSince
            ? "Recording for " +
              formatDurationMs(Date.now() - manualSince) +
              (manualSoFar ? ", peak " + formatMemory(manualSoFar.peakMemoryBytes) + " (" + formatMemoryDelta(manualSoFar.peakMemoryBytes - manualSoFar.startMemoryBytes) + "), CPU " + Math.round(manualSoFar.avgCpuPercent) + "% avg" : "") +
              ". It keeps going if you leave this screen."
            : "Records peaks until you stop it, on any screen. Pipeline steps, ASR Lab engines and the Face Lab camera are recorded on their own."}
        </Txt>
      </View>

      <ListGroup title="Display">
        <SwitchRow title="Overlay on every screen" subtitle="Memory, CPU and thermal in a corner while you use the app" value={overlay} onValueChange={toggleOverlay} />
      </ListGroup>
      <View style={styles.section}>
        <Txt variant="footnote" tone="secondary">
          Live refresh
        </Txt>
        <SegmentedControl
          size="sm"
          options={INTERVAL_CHOICES.map((ms) => ({ key: String(ms), label: ms < 1000 ? ms + " ms" : ms / 1000 + " s" }))}
          value={String(interval)}
          onChange={(key) => chooseInterval(Number(key))}
        />
      </View>

      <ListGroup title="Recorded runs">
        {tops.length === 0 ? (
          <ListRow title="Nothing recorded yet" subtitle="Save a take, run an engine in the ASR Lab, or start a recording." />
        ) : (
          tops.slice(0, 30).flatMap((run) => {
            const steps = run.kind === "pipeline" ? childrenOf(runs, run.id) : [];
            const open = expanded === run.id;
            const rows = [
              <ListRow
                key={run.id}
                icon={KIND_ICON[run.kind]}
                title={run.label + " · " + timeOf(run.startedAt)}
                subtitle={describeRun(run)}
                chevron={steps.length > 0}
                onPress={steps.length > 0 ? () => setExpanded(open ? null : run.id) : undefined}
              />,
            ];
            if (open) {
              for (const step of steps) rows.push(<ListRow key={step.id} title={"  " + step.label} subtitle={describeRun(step)} />);
            }
            return rows;
          })
        )}
      </ListGroup>
      {tops.length > 0 ? (
        <View style={styles.actions}>
          <PrimaryButton label="Copy JSON" variant="secondary" size="sm" onPress={() => copyRuns("json")} />
          <PrimaryButton label="Clear" variant="ghost" size="sm" onPress={confirmClear} />
        </View>
      ) : null}

      <Txt variant="caption1" tone="muted" style={styles.note}>
        {ios
          ? "Footprint is what Xcode's memory gauge shows and what iOS counts against the app's limit. Headroom is how much more the app may take before iOS ends it. Battery level moves in coarse steps on iOS, so drain only shows over long runs; use Xcode's energy gauge for short ones."
          : "PSS is the app's share of RAM, what Android Studio's profiler and the system count. Native heap is where model weights usually live. Current draw is instantaneous and its sign depends on the phone maker. Whole-device CPU is closed to apps since Android 8."}
      </Txt>
    </Screen>
  );
}

function Fact({ label, value, color }: { label: string; value: string; color?: string }) {
  const styles = useStyles();
  return (
    <View style={styles.fact}>
      <Txt variant="footnote" tone="secondary" style={styles.factLabel}>
        {label}
      </Txt>
      <Mono color={color}>{value}</Mono>
    </View>
  );
}

function batteryText(level: number | undefined, state: string | undefined, lowPower: boolean): string {
  const parts = [level != null ? Math.round(level * 100) + "%" : "-"];
  if (state && state !== "unknown") parts.push(state);
  if (lowPower) parts.push(Platform.OS === "ios" ? "Low Power Mode" : "battery saver");
  return parts.join(", ");
}

function timeOf(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" }) + " " + date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

const useStyles = makeStyles((t) => ({
  card: { gap: t.space.sm + 2 },
  headline: { flexDirection: "row", gap: t.space.md },
  big: { flex: 1, gap: 2 },
  facts: { gap: t.space.sm },
  fact: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: t.space.md },
  factLabel: { flexShrink: 1 },
  section: { gap: t.space.sm },
  actions: { flexDirection: "row", gap: t.space.sm },
  note: { paddingHorizontal: 4 },
}));
