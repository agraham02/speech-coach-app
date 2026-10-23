import { useCallback, useEffect, useState } from "react";
import { View } from "react-native";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../../navigation";
import { Screen } from "../../components/common/Screen";
import { Card } from "../../components/common/Card";
import { IconButton } from "../../components/common/IconButton";
import { ListGroup, ListRow } from "../../components/common/ListRow";
import { PressableScale } from "../../components/common/PressableScale";
import { Txt } from "../../components/common/Txt";
import { useToast } from "../../components/common/ToastProvider";
import { Mono } from "../../components/dev/Mono";
import { getLogs, subscribeLogs } from "../../services/logs/logStore";
import { subscribeToAllSessions } from "../../services/pipeline/processingEvents";
import { isAppleModelAvailable } from "../../services/onDeviceLlm/onDeviceCoach";
import { appVersion, buildKind, countProblemSteps, osLabel, readDbVersion, transcriberLabel } from "../../services/dev/devInfo";
import { countRecent } from "../../domain/dev/logFilter";
import { copyText } from "../../utils/copyText";
import { makeStyles, useTheme } from "../../theme/ThemeProvider";

const DAY_MS = 24 * 60 * 60 * 1000;

// The Dev tab's home: a status card for what the build is and whether
// anything's wrong, then one row per tool. Each tool is its own screen.
export function DevHomeScreen() {
  const styles = useStyles();
  const showToast = useToast();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [errors, setErrors] = useState(() => countRecent(getLogs(), "error", DAY_MS));
  const [problemSteps, setProblemSteps] = useState<number | null>(null);
  const [db, setDb] = useState<{ current: number; latest: number } | null>(null);
  const [appleCoach] = useState(() => isAppleModelAvailable());

  useEffect(() => subscribeLogs((logs) => setErrors(countRecent(logs, "error", DAY_MS))), []);

  const refreshSteps = useCallback(() => {
    countProblemSteps()
      .then(setProblemSteps)
      .catch(() => setProblemSteps(null));
  }, []);

  useFocusEffect(
    useCallback(() => {
      refreshSteps();
      readDbVersion()
        .then(setDb)
        .catch(() => undefined);
    }, [refreshSteps]),
  );
  useEffect(() => subscribeToAllSessions(refreshSteps), [refreshSteps]);

  const dbOk = !db || db.current === db.latest;
  const facts: [string, string][] = [
    ["Build", buildKind() + " · v" + appVersion()],
    ["Device", osLabel()],
    ["Database", db ? "v" + db.current + (dbOk ? "" : " (expected v" + db.latest + ")") : "…"],
    ["Transcriber", transcriberLabel()],
    ["Apple Intelligence", appleCoach ? "On" : "Off"],
  ];

  async function copyStatus() {
    const lines = facts.map(([label, value]) => label + ": " + value);
    lines.push("Errors in 24 h: " + errors);
    if (problemSteps != null) lines.push("Problem steps: " + problemSteps);
    if (await copyText(lines.join("\n"))) showToast("Status copied.", "success");
  }

  return (
    <Screen
      title="Dev"
      eyebrow="Developer tools"
      large
      tabRoot
      right={<IconButton icon="copy-outline" accessibilityLabel="Copy status" onPress={copyStatus} />}
    >
      <Card style={styles.status}>
        <View style={styles.facts}>
          {facts.map(([label, value]) => (
            <View key={label} style={styles.fact}>
              <Txt variant="footnote" tone="secondary">
                {label}
              </Txt>
              <Mono tone={label === "Database" && !dbOk ? "danger" : "primary"}>{value}</Mono>
            </View>
          ))}
        </View>
        <View style={styles.counters}>
          <Counter
            label="Errors in 24 h"
            count={errors}
            bad={errors > 0}
            onPress={() => navigation.navigate("DevLogs", { level: "error" })}
          />
          <Counter
            label="Problem steps"
            count={problemSteps}
            bad={(problemSteps ?? 0) > 0}
            onPress={() => navigation.navigate("DevPipeline", { problemsOnly: true })}
          />
        </View>
      </Card>

      <ListGroup title="Inspect">
        <ListRow
          icon="git-network-outline"
          title="Pipeline"
          subtitle="Steps, errors and stored results for each take"
          chevron
          onPress={() => navigation.navigate("DevPipeline")}
        />
        <ListRow
          icon="terminal-outline"
          title="Logs"
          subtitle="Filter by level and tag, search, share"
          chevron
          onPress={() => navigation.navigate("DevLogs")}
        />
        <ListRow
          icon="speedometer-outline"
          title="Metrics"
          subtitle="Memory, CPU, thermal and battery, live and per run"
          chevron
          onPress={() => navigation.navigate("DevMetrics")}
        />
      </ListGroup>

      <ListGroup title="Labs">
        <ListRow
          icon="scan-outline"
          title="Face Lab"
          subtitle="Live eye and face tracking, calibration, thresholds"
          chevron
          onPress={() => navigation.navigate("DevFaceLab")}
        />
        <ListRow
          icon="flask-outline"
          title="ASR Lab"
          subtitle="Compare transcription engines on your own takes"
          chevron
          onPress={() => navigation.navigate("AsrLab")}
        />
      </ListGroup>

      <ListGroup title="Tools">
        <ListRow
          icon="construct-outline"
          title="App tools"
          subtitle="Replay tours, test reminders, review limit, storage"
          chevron
          onPress={() => navigation.navigate("DevTools")}
        />
      </ListGroup>

      <Txt variant="footnote" tone="muted" style={styles.note}>
        These tools exist only in development and preview builds.
      </Txt>
    </Screen>
  );
}

function Counter({ label, count, bad, onPress }: { label: string; count: number | null; bad: boolean; onPress: () => void }) {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <PressableScale onPress={onPress} scaleTo={0.97} accessibilityLabel={label} style={styles.counter}>
      <Mono variant="title2" color={bad ? colors.danger : colors.success}>
        {count == null ? "–" : String(count)}
      </Mono>
      <Txt variant="footnote" tone="secondary">
        {label}
      </Txt>
    </PressableScale>
  );
}

const useStyles = makeStyles((t) => ({
  status: { gap: t.space.md },
  facts: { gap: t.space.sm },
  fact: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: t.space.md },
  counters: { flexDirection: "row", gap: t.space.sm },
  counter: { flex: 1, gap: 2, padding: t.space.md - 4, borderRadius: t.radius.md, backgroundColor: t.colors.surfaceRaised },
  note: { paddingHorizontal: 4 },
}));
