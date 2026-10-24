import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, BackHandler, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { RootStackParamList } from "../navigation";
import { CountdownRing } from "../components/common/CountdownRing";
import { IconButton } from "../components/common/IconButton";
import { PrimaryButton } from "../components/common/PrimaryButton";
import { Txt } from "../components/common/Txt";
import { Waveform } from "../components/rewind/Waveform";
import { cueForSeconds, MAX_REWIND_SECONDS, MIN_REWIND_SECONDS, type DayPart } from "../domain/rewind/stats";
import { useRewindRecorder } from "../hooks/useRewindRecorder";
import { discardRewindSegments, startRewind } from "../services/rewind/rewindProcessor";
import { formatDuration } from "../utils/dateUtils";
import { success, tap, tick } from "../utils/haptics";
import { duration } from "../theme/motion";
import { makeStyles, useTheme } from "../theme/ThemeProvider";

type Stage = "ready" | "recording" | "finishing" | "unavailable";

const CUES: Record<DayPart, string> = { morning: "Morning", midday: "Midday", evening: "Evening" };
// A soft cue that the end is near.
const NEARLY_DONE_SECONDS = 105;
const GET_READY_SECONDS = 3;

// Telling your day, out loud, for one to two minutes: a big live waveform and
// an End button — no pause, because the practice is to keep the thoughts
// coming. A faint cue walks from morning to midday to evening as time passes;
// it stops by itself at two minutes.
export function RewindRecordScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const recorder = useRewindRecorder();
  const [stage, setStage] = useState<Stage>("ready");
  const [elapsed, setElapsed] = useState(0);
  const [message, setMessage] = useState("");
  const startedAt = useRef(0);
  const finishing = useRef(false);
  const nudged = useRef(false);
  const stageRef = useRef<Stage>("ready");
  stageRef.current = stage;

  // Three, two, one — then the microphone opens.
  useEffect(() => {
    const timer = setTimeout(async () => {
      const ready = await recorder.start();
      if (ready !== "ready") {
        setMessage(ready === "denied" ? "Tono needs the microphone to hear your day. You can allow it in your phone's settings." : "This phone can't record speech right now.");
        setStage("unavailable");
        return;
      }
      startedAt.current = Date.now();
      setStage("recording");
      tap();
    }, GET_READY_SECONDS * 1000);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The clock, and the automatic stop at two minutes.
  useEffect(() => {
    if (stage !== "recording") return;
    const timer = setInterval(() => {
      const seconds = (Date.now() - startedAt.current) / 1000;
      setElapsed(seconds);
      if (seconds >= NEARLY_DONE_SECONDS && !nudged.current) {
        nudged.current = true;
        tick();
      }
      if (seconds >= MAX_REWIND_SECONDS) finish();
    }, 250);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage]);

  // Leaving the app ends the microphone: finish with what there is.
  useEffect(() => {
    if ((recorder.status === "idle" || recorder.status === "error") && stageRef.current === "recording" && !finishing.current) finish();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recorder.status]);

  async function finish() {
    if (finishing.current) return;
    finishing.current = true;
    setStage("finishing");
    const take = await recorder.stop();
    success();
    const id = await startRewind(take);
    navigation.replace("RewindResult", { id });
  }

  function leave() {
    if (finishing.current) return;
    if (stageRef.current !== "recording" || elapsed < 5) {
      recorder.stop().then((take) => discardRewindSegments(take.segments)).catch(() => undefined);
      navigation.goBack();
      return;
    }
    Alert.alert("Discard this take?", "Nothing is saved if you leave now.", [
      { text: "Keep going", style: "cancel" },
      {
        text: "Discard",
        style: "destructive",
        onPress: () => {
          finishing.current = true;
          recorder.stop().then((take) => discardRewindSegments(take.segments)).catch(() => undefined);
          navigation.goBack();
        },
      },
    ]);
  }

  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      leave();
      return true;
    });
    return () => sub.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [elapsed]);

  const canEnd = elapsed >= MIN_REWIND_SECONDS;
  const cue = cueForSeconds(elapsed);

  return (
    <View style={[styles.root, { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 16 }]}>
      <View style={styles.top}>{stage !== "finishing" ? <IconButton icon="close" onPress={leave} accessibilityLabel="Close" size={38} /> : null}</View>

      {stage === "ready" ? (
        <View style={styles.center}>
          <CountdownRing size={120} strokeWidth={6} durationMs={GET_READY_SECONDS * 1000} color={colors.skill.conversation.fg}>
            <Txt variant="callout" tone="secondary">
              Ready
            </Txt>
          </CountdownRing>
          <Txt variant="title3" align="center">
            Tell me about your day
          </Txt>
          <Txt variant="subhead" tone="secondary" align="center">
            Morning to night. Details, however small.
          </Txt>
        </View>
      ) : null}

      {stage === "unavailable" ? (
        <View style={styles.center}>
          <Txt variant="title3" align="center">
            Can't listen
          </Txt>
          <Txt variant="subhead" tone="secondary" align="center">
            {message}
          </Txt>
        </View>
      ) : null}

      {stage === "recording" || stage === "finishing" ? (
        <View style={styles.center}>
          <View style={styles.cueRow}>
            {stage === "recording" ? (
              <Animated.View key={cue} entering={FadeIn.duration(duration.slow)} exiting={FadeOut.duration(duration.fast)}>
                <Txt variant="callout" tone="secondary">
                  {CUES[cue]}
                </Txt>
              </Animated.View>
            ) : null}
          </View>
          <Waveform height={220} color={colors.skill.conversation.fg} subscribe={recorder.onVolume} live={stage === "recording"} />
          {stage === "finishing" ? (
            <View style={styles.finishing}>
              <ActivityIndicator color={colors.textPrimary} />
              <Txt variant="subhead" tone="secondary">
                Saving your take…
              </Txt>
            </View>
          ) : (
            <View style={styles.timer}>
              <Txt variant="display" tabular>
                {formatDuration(Math.floor(elapsed))}
              </Txt>
              <Txt variant="footnote" tone="muted" align="center">
                {canEnd ? "Finish whenever you like — it stops at 2:00." : "Keep going — what happened next?"}
              </Txt>
            </View>
          )}
        </View>
      ) : null}

      <View style={styles.bottom}>
        {stage === "recording" ? (
          <PrimaryButton label={canEnd ? "End" : `Keep going · ${formatDuration(Math.max(0, Math.ceil(MIN_REWIND_SECONDS - elapsed)))}`} onPress={finish} disabled={!canEnd} />
        ) : null}
        {stage === "unavailable" ? <PrimaryButton label="Back" variant="secondary" onPress={() => navigation.goBack()} /> : null}
      </View>
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  root: { flex: 1, backgroundColor: t.colors.background, paddingHorizontal: t.layout.gutter },
  top: { height: 44, alignItems: "flex-start", justifyContent: "center" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: t.space.lg },
  cueRow: { height: 24, alignItems: "center", justifyContent: "center" },
  timer: { alignItems: "center", gap: t.space.xs },
  finishing: { alignItems: "center", gap: t.space.sm, height: 80, justifyContent: "center" },
  bottom: { minHeight: 56, justifyContent: "flex-end" },
}));
