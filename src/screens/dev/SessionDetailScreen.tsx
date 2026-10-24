import { useCallback, useEffect, useState } from "react";
import { Alert, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../../navigation";
import { Screen } from "../../components/common/Screen";
import { Card } from "../../components/common/Card";
import { IconButton } from "../../components/common/IconButton";
import { ListGroup, ListRow } from "../../components/common/ListRow";
import { PressableScale } from "../../components/common/PressableScale";
import { Txt } from "../../components/common/Txt";
import { useToast } from "../../components/common/ToastProvider";
import { Mono } from "../../components/dev/Mono";
import { stepStatusColor } from "../../components/dev/StepDots";
import { getSessionById } from "../../services/db/sessionsRepo";
import { getSessionSteps } from "../../services/db/stepsRepo";
import { listArtifacts, type ArtifactInfo } from "../../services/db/artifactsRepo";
import { requestStep } from "../../services/pipeline/sessionPipeline";
import { subscribeToSession } from "../../services/pipeline/processingEvents";
import { ALL_STEPS, STEP_LABELS, isActive, type SessionStep, type StepState } from "../../domain/sessionSteps";
import { formatBytes } from "../../domain/dev/jsonView";
import type { Session } from "../../domain/sessionTypes";
import { copyText } from "../../utils/copyText";
import { copyJson, exportFileName, shareJsonFile } from "../../utils/shareJson";
import { exportTake } from "../../services/dev/exportTake";
import { logger } from "../../utils/logger";
import { makeStyles, useTheme } from "../../theme/ThemeProvider";

type Props = NativeStackScreenProps<RootStackParamList, "DevSession">;

function formatDateTime(iso: string | null): string {
  return iso ? new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", second: "2-digit" }) : "–";
}

// One take: its ids, each step's status and error (with a re-run), and the
// JSON it has stored.
export function SessionDetailScreen({ navigation, route }: Props) {
  const { sessionId } = route.params;
  const styles = useStyles();
  const showToast = useToast();
  const [session, setSession] = useState<Session | null>(null);
  const [steps, setSteps] = useState<StepState[]>([]);
  const [artifacts, setArtifacts] = useState<ArtifactInfo[]>([]);

  const load = useCallback(async () => {
    setSession(await getSessionById(sessionId));
    setSteps(await getSessionSteps(sessionId));
    setArtifacts(await listArtifacts(sessionId));
  }, [sessionId]);

  useFocusEffect(
    useCallback(() => {
      load().catch(() => undefined);
    }, [load]),
  );
  useEffect(() => subscribeToSession(sessionId, () => load().catch(() => undefined)), [sessionId, load]);

  // The whole take as JSON: transcript with word timings, fillers, pauses,
  // voice curves, scores and step state. Copy it, or send it as a file.
  async function exportAnalysis(how: "copy" | "share") {
    try {
      const data = await exportTake(sessionId);
      if (!data) {
        Alert.alert("Nothing to export", "This take is not in the database.");
        return;
      }
      if (how === "copy") {
        if (await copyJson(data)) showToast("Analysis JSON copied.", "success");
      } else {
        await shareJsonFile(exportFileName("take"), data);
      }
    } catch (error) {
      Alert.alert("Couldn't export", (error as Error).message);
    }
  }

  async function copy(label: string, value: string) {
    if (await copyText(value)) showToast(label + " copied.", "success");
  }

  function rerun(step: SessionStep) {
    const start = () => {
      logger.info("[dev] re-running " + step + " for " + sessionId);
      requestStep(sessionId, step).catch((error) => Alert.alert("Couldn't re-run", (error as Error).message));
    };
    if (step === "cloud_review") {
      Alert.alert("Have Tono AI judge it again?", "It sends this take to Tono AI again and uses one more judged take.", [
        { text: "Cancel", style: "cancel" },
        { text: "Re-run", onPress: start },
      ]);
    } else start();
  }

  const facts: [string, string][] = session
    ? [
        ["Recorded", formatDateTime(session.recordedAt)],
        ["Type", session.sessionType],
        ["Duration", Math.round(session.durationSeconds) + " s"],
        ["Status", session.status],
        ["Transcript", (session.transcriptionSource ?? "–") + (session.transcriptVerbatim ? " · " + session.transcriptVerbatim.split(/\s+/).length + " words" : " · none")],
        ["Voice analysis", session.dspStatus ?? "–"],
        ["Score", session.sessionScore != null ? session.sessionScore.toFixed(1) : "–"],
        ["Video", session.videoDeletedAt ? "deleted" : session.videoKeepsake ? "kept (compressed)" : "on this phone"],
        ["Wants deep review", session.wantsGrading ? "yes" : "no"],
      ]
    : [];

  return (
    <Screen
      title="Take"
      eyebrow="Pipeline"
      onBack={navigation.goBack}
      right={<IconButton icon="open-outline" accessibilityLabel="Open the result screen" onPress={() => navigation.navigate("Result", { sessionId })} />}
    >
      {session ? (
        <Card style={styles.card}>
          <PressableScale onPress={() => copy("ID", sessionId)} scaleTo={0.99} accessibilityLabel="Copy session id">
            <Txt variant="footnote" tone="secondary">
              Session id (tap to copy)
            </Txt>
            <Mono>{sessionId}</Mono>
          </PressableScale>
          {facts.map(([label, value]) => (
            <View key={label} style={styles.fact}>
              <Txt variant="footnote" tone="secondary">
                {label}
              </Txt>
              <Mono style={styles.factValue}>{value}</Mono>
            </View>
          ))}
          {session.lastError ? <Mono tone="danger" selectable>{session.lastError}</Mono> : null}
        </Card>
      ) : (
        <Txt variant="subhead" tone="muted">
          This take isn't in the database.
        </Txt>
      )}

      <ListGroup title="Steps">
        {ALL_STEPS.map((step) => {
          const state = steps.find((s) => s.step === step);
          return <StepRow key={step} step={step} state={state} onRerun={() => rerun(step)} />;
        })}
      </ListGroup>

      <ListGroup title="Export">
        <ListRow
          icon="copy-outline"
          title="Copy analysis as JSON"
          subtitle="Transcript with word times, fillers, pauses, voice curves, scores"
          onPress={() => exportAnalysis("copy")}
        />
        <ListRow icon="share-outline" title="Share analysis as a file" onPress={() => exportAnalysis("share")} />
      </ListGroup>

      <ListGroup title="Labs">
        <ListRow
          icon="pulse-outline"
          title="Voice Lab"
          subtitle={"Today’s pitch tracker against the candidate, on this take"}
          chevron
          onPress={() => navigation.navigate("DevVoiceLab", { sessionId })}
        />
      </ListGroup>

      <ListGroup title="Stored results">
        {artifacts.length === 0 ? (
          <ListRow title="Nothing stored yet" />
        ) : (
          artifacts.map((a) => (
            <ListRow
              key={a.kind}
              title={a.kind}
              subtitle={formatDateTime(a.createdAt) + " · v" + a.version}
              value={formatBytes(a.bytes)}
              chevron
              onPress={() => navigation.navigate("DevArtifact", { sessionId, kind: a.kind })}
            />
          ))
        )}
      </ListGroup>
    </Screen>
  );
}

function StepRow({ step, state, onRerun }: { step: SessionStep; state: StepState | undefined; onRerun: () => void }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const status = state?.status;
  const busy = isActive(status);
  return (
    <View style={styles.step}>
      <View style={styles.stepHead}>
        <View style={[styles.dot, { backgroundColor: stepStatusColor(status, colors) }]} />
        <View style={styles.stepText}>
          <Txt variant="headline">{STEP_LABELS[step]}</Txt>
          <Mono tone="secondary">
            {state ? state.status + " · " + state.attempts + (state.attempts === 1 ? " attempt" : " attempts") + " · " + formatDateTime(state.updatedAt) : "no row"}
          </Mono>
        </View>
        <IconButton icon="refresh" variant="plain" size={36} disabled={busy} accessibilityLabel={"Re-run " + STEP_LABELS[step]} onPress={onRerun} />
      </View>
      {state?.lastError ? (
        <Mono tone="danger" selectable style={styles.error}>
          {state.lastError}
        </Mono>
      ) : null}
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  card: { gap: t.space.sm },
  fact: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: t.space.md },
  factValue: { flexShrink: 1, textAlign: "right" },
  step: { paddingVertical: t.space.sm, gap: 4 },
  stepHead: { flexDirection: "row", alignItems: "center", gap: t.space.md - 2 },
  stepText: { flex: 1, gap: 1 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  error: { paddingLeft: 22 },
}));
