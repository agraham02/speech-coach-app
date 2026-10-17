import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FlatList, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../../navigation";
import { Screen } from "../../components/common/Screen";
import { SegmentedControl } from "../../components/common/SegmentedControl";
import { PressableScale } from "../../components/common/PressableScale";
import { Txt } from "../../components/common/Txt";
import { Mono } from "../../components/dev/Mono";
import { StepDots } from "../../components/dev/StepDots";
import { getAllSessions } from "../../services/db/sessionsRepo";
import { getStepsForSessions } from "../../services/db/stepsRepo";
import { subscribeToAllSessions } from "../../services/pipeline/processingEvents";
import type { Session } from "../../domain/sessionTypes";
import type { StepState } from "../../domain/sessionSteps";
import { makeStyles } from "../../theme/ThemeProvider";

type Props = NativeStackScreenProps<RootStackParamList, "DevPipeline">;

const RECENT = 30;

const TYPE_LABEL: Record<Session["sessionType"], string> = {
  spontaneous: "Spontaneous",
  free_record: "Free record",
  concise: "Concise",
  script_practice: "Script",
  feeling: "Feeling",
};

export function hasProblem(steps: StepState[] | undefined): boolean {
  return !!steps?.some((s) => s.status === "failed" || s.status === "interrupted");
}

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

// The last takes with a dot for each pipeline step, live. Tap one for its
// steps, errors and stored results.
export function PipelineScreen({ navigation, route }: Props) {
  const styles = useStyles();
  const [view, setView] = useState<"all" | "problems">(route.params?.problemsOnly ? "problems" : "all");
  const [sessions, setSessions] = useState<Session[]>([]);
  const [steps, setSteps] = useState<Map<string, StepState[]>>(new Map());
  const [loaded, setLoaded] = useState(false);
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    const recent = (await getAllSessions()).slice(0, RECENT);
    setSessions(recent);
    setSteps(await getStepsForSessions(recent.map((s) => s.id)));
    setLoaded(true);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load().catch(() => setLoaded(true));
    }, [load]),
  );

  // Step events can come in bursts: refresh once they settle.
  useEffect(
    () =>
      subscribeToAllSessions(() => {
        if (refreshTimer.current) clearTimeout(refreshTimer.current);
        refreshTimer.current = setTimeout(() => load().catch(() => undefined), 250);
      }),
    [load],
  );
  useEffect(() => () => {
    if (refreshTimer.current) clearTimeout(refreshTimer.current);
  }, []);

  const visible = useMemo(() => (view === "problems" ? sessions.filter((s) => hasProblem(steps.get(s.id))) : sessions), [view, sessions, steps]);
  const problemCount = useMemo(() => sessions.filter((s) => hasProblem(steps.get(s.id))).length, [sessions, steps]);

  return (
    <Screen title="Pipeline" eyebrow="Dev" scroll={false} onBack={navigation.goBack}>
      <View style={styles.top}>
        <SegmentedControl
          options={[
            { key: "all", label: "Last " + RECENT },
            { key: "problems", label: "Problems" + (problemCount ? " " + problemCount : "") },
          ]}
          value={view}
          onChange={setView}
          size="sm"
        />
        <Txt variant="caption1" tone="muted">
          Dots: transcript, voice, video, coaching, deep review. Filled is done; hollow is skipped.
        </Txt>
      </View>
      {visible.length === 0 ? (
        <View style={styles.empty}>
          <Txt variant="subhead" tone="muted" align="center">
            {!loaded ? "Loading…" : view === "problems" ? "No failed or interrupted steps." : "No takes yet."}
          </Txt>
        </View>
      ) : (
        <FlatList
          data={visible}
          keyExtractor={(s) => s.id}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <PressableScale
              onPress={() => navigation.navigate("DevSession", { sessionId: item.id })}
              scaleTo={0.985}
              accessibilityLabel={"Take from " + formatWhen(item.recordedAt)}
              style={styles.row}
            >
              <View style={styles.rowText}>
                <Txt variant="headline">{formatWhen(item.recordedAt)}</Txt>
                <Mono tone="secondary">
                  {TYPE_LABEL[item.sessionType] + " · " + Math.round(item.durationSeconds) + " s · " + item.id.slice(0, 8)}
                </Mono>
              </View>
              <StepDots steps={steps.get(item.id) ?? []} />
            </PressableScale>
          )}
        />
      )}
    </Screen>
  );
}

const useStyles = makeStyles((t) => ({
  top: { gap: t.space.sm, paddingBottom: t.space.sm },
  list: { paddingBottom: t.space.xl },
  row: { flexDirection: "row", alignItems: "center", gap: t.space.md, paddingVertical: t.space.sm + 2, minHeight: 56 },
  rowText: { flex: 1, gap: 2 },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: t.space.xl },
}));
