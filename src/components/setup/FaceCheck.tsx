import { useCallback, useEffect, useRef, useState } from "react";
import { Platform, ScrollView, View, useWindowDimensions } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { Camera as VisionCamera } from "react-native-vision-camera";
import { Card } from "../common/Card";
import { CountdownRing } from "../common/CountdownRing";
import { PrimaryButton } from "../common/PrimaryButton";
import { Txt } from "../common/Txt";
import { CameraPreview } from "../recording/CameraPreview";
import { FramingGuideOverlay } from "../recording/FramingGuideOverlay";
import { useFaceReadout } from "../../hooks/useFaceReadout";
import { buildCalibration } from "../../domain/faceCalibration";
import {
  EYES_LABEL,
  FACE_LABEL,
  HEAD_LABEL,
  TRIES,
  ZERO_CENTER,
  feedTries,
  newTryState,
  summarizeCenter,
  type FaceCenter,
  type FaceReading,
  type TryState,
} from "../../domain/faceReadout";
import { setFaceCalibration } from "../../services/prefs/prefsStore";
import { success, tap, tick } from "../../utils/haptics";
import { logger } from "../../utils/logger";
import { makeStyles, useTheme } from "../../theme/ThemeProvider";

type Phase = "frame" | "center" | "try";

// About two seconds of a well-placed face before moving on.
const GOOD_TICKS = 4;
const CENTER_MS = 2500;

interface FaceCheckProps {
  // Called when the person finishes or skips. `saved` is true when a
  // calibration was stored.
  onDone: (saved: boolean) => void;
}

// The face half of setup: find your frame, look at the lens so Tono learns
// where "eye contact" is for you, then try things and watch Tono see them.
// No landmark overlay: the point is the words (eyes on the screen, off to
// your left, chin up, smiling…). What it learns calibrates the presence
// scoring (domain/faceCalibration.ts).
export function FaceCheck({ onDone }: FaceCheckProps) {
  const styles = useStyles();
  const { colors } = useTheme();
  const { height } = useWindowDimensions();
  const cameraRef = useRef<VisionCamera>(null);
  const [phase, setPhase] = useState<Phase>("frame");
  const [goodFor, setGoodFor] = useState(0);
  const [centerRun, setCenterRun] = useState(0);
  const [centerFailed, setCenterFailed] = useState(false);
  const [center, setCenter] = useState<FaceCenter>(ZERO_CENTER);
  const [tries, setTries] = useState<TryState>(newTryState);

  const phaseRef = useRef<Phase>("frame");
  phaseRef.current = phase;
  const centerRef = useRef<FaceCenter>(ZERO_CENTER);
  const centerUsableRef = useRef(false);
  const captureRef = useRef<FaceReading[]>([]);
  const triesRef = useRef<TryState>(newTryState());

  const onReading = useCallback((reading: FaceReading | null, tMs: number) => {
    if (phaseRef.current === "center" && reading) captureRef.current.push(reading);
    if (phaseRef.current === "try") {
      const out = feedTries(triesRef.current, reading, centerRef.current, tMs);
      triesRef.current = out.state;
      if (out.newlyDone.length) {
        setTries(out.state);
        tap();
      }
    }
  }, []);
  const { readout, framingStatus, onFaceFrame } = useFaceReadout({ onReading, center });
  const framingRef = useRef(framingStatus);
  framingRef.current = framingStatus;

  // Frame: about two seconds of a well-placed face, then straight on.
  useEffect(() => {
    if (phase !== "frame") return;
    const t = setInterval(() => setGoodFor((g) => (framingRef.current === "good" ? g + 1 : 0)), 500);
    return () => clearInterval(t);
  }, [phase]);

  useEffect(() => {
    if (phase !== "frame" || goodFor < GOOD_TICKS) return;
    tick();
    captureRef.current = [];
    setCenterFailed(false);
    setCenterRun((n) => n + 1);
    setPhase("center");
  }, [phase, goodFor]);

  // Center: a couple of seconds looking at the lens.
  useEffect(() => {
    if (phase !== "center" || centerFailed) return;
    const t = setTimeout(() => {
      const summary = summarizeCenter(captureRef.current);
      if (!summary.usable) {
        setCenterFailed(true);
        return;
      }
      centerUsableRef.current = true;
      centerRef.current = summary.center;
      setCenter(summary.center);
      tap();
      setPhase("try");
    }, CENTER_MS);
    return () => clearTimeout(t);
  }, [phase, centerRun, centerFailed]);

  const allDone = tries.done.length === TRIES.length;
  useEffect(() => {
    if (allDone) success();
  }, [allDone]);

  function retryCenter() {
    captureRef.current = [];
    setCenterFailed(false);
    setCenterRun((n) => n + 1);
  }

  function finish() {
    if (centerUsableRef.current) {
      setFaceCalibration(buildCalibration(centerRef.current, triesRef.current.peaks, new Date(), Platform.OS));
      logger.info(`[face-check] saved — ${triesRef.current.done.length} of ${TRIES.length} tried, peaks ${JSON.stringify(triesRef.current.peaks)}`);
      onDone(true);
    } else {
      onDone(false);
    }
  }

  const trying = phase === "try";
  const faceHere = readout.face !== "out";

  return (
    <View style={styles.root}>
      <View style={[styles.cameraWrap, trying ? { height: Math.min(230, height * 0.28) } : styles.cameraFill]}>
        <CameraPreview cameraRef={cameraRef} isActive onFaceFrame={onFaceFrame} audio={false} />
        {phase === "frame" ? <FramingGuideOverlay status={framingStatus} /> : null}
        {phase === "center" ? (
          <View style={styles.centerOverlay} pointerEvents="none">
            {centerFailed ? null : (
              <CountdownRing size={96} strokeWidth={6} durationMs={CENTER_MS} runKey={centerRun} color="white">
                <Ionicons name="eye-outline" size={30} color="white" />
              </CountdownRing>
            )}
          </View>
        ) : null}
        {!trying ? (
          <View style={styles.note}>
            <Txt variant="footnote" color="white" align="center">
              {phase === "frame"
                ? faceHere
                  ? "Center your face, eyes about a third of the way down."
                  : "Can't find your face — face a window or a lamp, and hold the phone at eye level."
                : centerFailed
                  ? "Couldn't get a clear look. Hold the phone at eye level, in good light."
                  : "Look at the camera lens, at the top of your phone."}
            </Txt>
          </View>
        ) : null}
      </View>

      {trying ? (
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <Card style={styles.card}>
            <View style={styles.cardHead}>
              <Txt variant="headline">Tono sees</Txt>
              <Txt variant="footnote" tone="muted" tabular>
                {tries.done.length} of {TRIES.length} tried
              </Txt>
            </View>
            <Row label="Face" value={FACE_LABEL[readout.face]} on={faceHere} />
            <Row label="Eyes" value={readout.eyes ? EYES_LABEL[readout.eyes] : "—"} on={faceHere && !!readout.eyes} />
            <Row label="Head" value={readout.head ? HEAD_LABEL[readout.head] : "—"} on={faceHere && !!readout.head} />
            <Row label="Smile" value={faceHere ? (readout.smiling ? "Smiling" : "Neutral") : "—"} on={readout.smiling} />
            <Row label="Brows" value={faceHere ? (readout.brows ? "Raised" : "Relaxed") : "—"} on={readout.brows} />
          </Card>

          <View style={styles.tries}>
            <Txt variant="footnote" tone="secondary">
              Try each one and watch it tick off. Left and right are yours, as you face the phone.
            </Txt>
            <View style={styles.chips}>
              {TRIES.map((t) => {
                const done = tries.done.includes(t.id);
                return (
                  <View key={t.id} style={[styles.chip, done ? { backgroundColor: colors.successMuted } : null]}>
                    <Ionicons name={done ? "checkmark-circle" : "ellipse-outline"} size={16} color={done ? colors.success : colors.textMuted} />
                    <Txt variant="footnote" tone={done ? "primary" : "secondary"} weight={done ? "600" : "400"}>
                      {t.label}
                    </Txt>
                  </View>
                );
              })}
            </View>
          </View>
        </ScrollView>
      ) : null}

      {trying ? (
        <PrimaryButton label={allDone ? "Done" : "Next"} onPress={finish} />
      ) : centerFailed ? (
        <View style={styles.row}>
          <PrimaryButton label="Skip" variant="secondary" style={styles.flex} onPress={() => onDone(false)} />
          <PrimaryButton label="Try again" style={styles.flex} onPress={retryCenter} />
        </View>
      ) : (
        <PrimaryButton label="Skip for now" variant="secondary" onPress={() => onDone(false)} />
      )}
    </View>
  );
}

function Row({ label, value, on }: { label: string; value: string; on: boolean }) {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <View style={styles.readRow}>
      <Txt variant="subhead" tone="secondary">
        {label}
      </Txt>
      <View style={styles.readValue}>
        <View style={[styles.dot, { backgroundColor: on ? colors.success : colors.textMuted, opacity: on ? 1 : 0.35 }]} />
        <Txt variant="callout" weight="500">
          {value}
        </Txt>
      </View>
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  root: { flex: 1, gap: t.space.md },
  cameraWrap: { borderRadius: t.radius.lg, overflow: "hidden", backgroundColor: "black" },
  cameraFill: { flex: 1 },
  note: { position: "absolute", left: t.space.md, right: t.space.md, bottom: t.space.md, padding: t.space.sm, borderRadius: t.radius.md, backgroundColor: "rgba(0,0,0,0.55)" },
  centerOverlay: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, alignItems: "center", justifyContent: "center" },
  scroll: { gap: t.space.md, paddingBottom: t.space.sm },
  card: { gap: t.space.sm },
  cardHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" },
  readRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", minHeight: 30 },
  readValue: { flexDirection: "row", alignItems: "center", gap: t.space.sm },
  dot: { width: 8, height: 8, borderRadius: 4 },
  tries: { gap: t.space.sm },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: t.space.sm },
  chip: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: t.space.md, paddingVertical: 8, borderRadius: t.radius.pill, backgroundColor: t.colors.surfaceRaised },
  row: { flexDirection: "row", gap: t.space.sm },
  flex: { flex: 1 },
}));
