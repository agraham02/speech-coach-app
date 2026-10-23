import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Share, View, type LayoutChangeEvent } from "react-native";
import { useIsFocused } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useCameraPermission, type Camera as VisionCamera } from "react-native-vision-camera";
import { isFace, type FaceLandmarkerOutput } from "vision-camera-face-landmarker";
import type { RootStackParamList } from "../../navigation";
import { Screen } from "../../components/common/Screen";
import { Card } from "../../components/common/Card";
import { Chip } from "../../components/common/Chip";
import { IconButton } from "../../components/common/IconButton";
import { PrimaryButton } from "../../components/common/PrimaryButton";
import { SegmentedControl } from "../../components/common/SegmentedControl";
import { Txt } from "../../components/common/Txt";
import { CameraPreview } from "../../components/recording/CameraPreview";
import { FaceOverlay } from "../../components/dev/FaceOverlay";
import { GazeTarget, type GazePoint } from "../../components/dev/GazeTarget";
import { Meter } from "../../components/dev/Meter";
import { Mono } from "../../components/dev/Mono";
import { Stepper } from "../../components/dev/Stepper";
import { isWellFramed } from "../../domain/faceFraming";
import { describeFaceAxes, orientFace, type OrientedFace } from "../../domain/faceOrientation";
import { eyeClosure, headProxies, sampleFromFace } from "../../domain/faceSignals";
import { EYES_LABEL, FACE_LABEL, HEAD_LABEL, ZERO_CENTER, readFace, type FaceCenter } from "../../domain/faceReadout";
import { getFaceCalibration } from "../../services/prefs/prefsStore";
import { INVERT_GAZE_Y } from "../../services/face/faceAxes";
import { feedBlink, loseFace, newBlinkState } from "../../domain/blinkCounter";
import {
  CALIBRATION_MS,
  CALIBRATION_STEPS,
  THRESHOLD_FIELDS,
  describeLook,
  formatThresholdValue,
  formatThresholdsAsCode,
  gazeStats,
  nudgeThreshold,
  stepForTime,
  summarizeCalibration,
  thresholdsEqual,
  type CalibrationSample,
} from "../../domain/dev/faceLab";
import { classifyLook, computePresenceMetrics, DEFAULT_PRESENCE_THRESHOLDS, type PresenceSample, type PresenceThresholds } from "../../domain/presenceMetrics";
import { getFaceThresholds, resetFaceThresholds, setFaceThresholds } from "../../services/dev/devStore";
import { rescoreRecent, type RescoreRow } from "../../services/dev/rescore";
import { beginRun } from "../../services/dev/deviceMetrics";
import { makeStyles, useTheme } from "../../theme/ThemeProvider";

type Props = NativeStackScreenProps<RootStackParamList, "DevFaceLab">;
type Tab = "live" | "calibrate" | "thresholds";

const TRAIL_MS = 2000;
const NO_FACE: PresenceSample = { tMs: 0, present: false, yaw: 0, pitch: 0, smile: 0, eyesOpen: 0, framed: false };

interface LiveFrame {
  face: OrientedFace | null;
  // Head tip and turn from the landmarks (what the face check reads).
  proxies: { tip: number; turn: number } | null;
  sample: PresenceSample;
  framed: boolean;
  trail: GazePoint[];
}

type Calibration = { status: "idle" } | { status: "running"; elapsed: number } | { status: "done"; samples: CalibrationSample[] };

// A live look at what MediaPipe sees, and the tools to tune the eye-contact
// thresholds against your own face and real takes.
export function FaceLabScreen({ navigation }: Props) {
  const styles = useStyles();
  const { colors } = useTheme();
  const focused = useIsFocused();
  const { hasPermission, requestPermission } = useCameraPermission();
  const cameraRef = useRef<VisionCamera | null>(null);

  const [tab, setTab] = useState<Tab>("live");
  // The MediaPipe input orientation to test (iOS); undefined = the automatic choice.
  const [mpOrientation, setMpOrientation] = useState<string | undefined>(undefined);
  const [thresholds, setThresholds] = useState<PresenceThresholds>(getFaceThresholds);
  const [view, setView] = useState({ width: 0, height: 0 });
  const [frame, setFrame] = useState<LiveFrame | null>(null);
  const [fps, setFps] = useState(0);
  const [calibration, setCalibration] = useState<Calibration>({ status: "idle" });
  const [rescored, setRescored] = useState<RescoreRow[] | null>(null);
  const [rescoring, setRescoring] = useState(false);

  const frameCount = useRef(0);
  // Same per-frame counter a recording uses: blink ten times to check it.
  const blinks = useRef({ state: newBlinkState(), since: Date.now() });
  const trail = useRef<{ x: number; y: number; t: number }[]>([]);
  const run = useRef<{ startedAt: number; samples: CalibrationSample[] } | null>(null);

  const onFaceFrame = useCallback((output: FaceLandmarkerOutput) => {
    const now = Date.now();
    frameCount.current += 1;
    const face = isFace(output) ? orientFace(output) : null;
    const framed = face ? isWellFramed(face.bounds) : false;
    const sample = face ? sampleFromFace(face, now, framed, { invertGazeY: INVERT_GAZE_Y }) : { ...NO_FACE, tMs: now };
    blinks.current.state = face ? feedBlink(blinks.current.state, eyeClosure(face), now) : loseFace(blinks.current.state);

    if (face) trail.current.push({ x: sample.gazeX ?? 0, y: sample.gazeY ?? 0, t: now });
    trail.current = trail.current.filter((p) => now - p.t <= TRAIL_MS);
    setFrame({ face, proxies: face ? headProxies(face) : null, sample, framed, trail: trail.current.map((p) => ({ x: p.x, y: p.y })) });

    const active = run.current;
    if (active) {
      const clock = stepForTime(now - active.startedAt);
      if (clock && !clock.settling) active.samples.push({ step: clock.index, sample: { ...sample, tMs: now - active.startedAt } });
    }
  }, []);

  useEffect(() => {
    const id = setInterval(() => {
      setFps(frameCount.current);
      frameCount.current = 0;
    }, 1000);
    return () => clearInterval(id);
  }, []);

  // The camera and MediaPipe's cost while the Lab is open, for the Metrics
  // screen (dev builds with the metrics module).
  const cameraLive = focused && hasPermission;
  useEffect(() => {
    if (!cameraLive) return;
    const metrics = beginRun("face", "Face Lab camera");
    return () => {
      metrics.end();
    };
  }, [cameraLive]);

  const running = calibration.status === "running";
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => {
      const active = run.current;
      if (!active) return;
      const elapsed = Date.now() - active.startedAt;
      if (elapsed >= CALIBRATION_MS) {
        run.current = null;
        setCalibration({ status: "done", samples: active.samples });
      } else {
        setCalibration({ status: "running", elapsed });
      }
    }, 150);
    return () => clearInterval(id);
  }, [running]);

  // Leaving the screen ends a run in progress.
  useEffect(() => {
    if (!focused) {
      run.current = null;
      setCalibration((c) => (c.status === "running" ? { status: "idle" } : c));
    }
  }, [focused]);

  function startCalibration() {
    run.current = { startedAt: Date.now(), samples: [] };
    setCalibration({ status: "running", elapsed: 0 });
  }

  function changeThreshold(key: keyof PresenceThresholds, direction: 1 | -1) {
    const field = THRESHOLD_FIELDS.find((f) => f.key === key);
    if (!field) return;
    const next = { ...thresholds, [key]: nudgeThreshold(field, thresholds[key], direction) };
    setThresholds(next);
    setFaceThresholds(next);
    setRescored(null);
  }

  function resetThresholds() {
    resetFaceThresholds();
    setThresholds(DEFAULT_PRESENCE_THRESHOLDS);
    setRescored(null);
  }

  async function compareRecent() {
    setRescoring(true);
    try {
      setRescored(await rescoreRecent(thresholds));
    } finally {
      setRescoring(false);
    }
  }

  const look = useMemo(() => (frame ? classifyLook(frame.sample, thresholds, true) : null), [frame, thresholds]);
  const results = useMemo(() => (calibration.status === "done" ? summarizeCalibration(calibration.samples, thresholds) : null), [calibration, thresholds]);
  const dirty = !thresholdsEqual(thresholds, DEFAULT_PRESENCE_THRESHOLDS);
  const sample = frame?.face ? frame.sample : undefined;
  const saved = useMemo(() => getFaceCalibration(), []);
  // The saved face-check center when there is one; a typical level head otherwise.
  const readCenter: FaceCenter = useMemo(
    () => (saved ? { ...ZERO_CENTER, ...saved.center, tip: saved.center.tip ?? 0.42, turn: saved.center.turn ?? 0, smile: saved.rest.smile, browRaise: saved.rest.browRaise } : { ...ZERO_CENTER, tip: 0.42 }),
    [saved],
  );
  const readout = useMemo(() => (frame?.face ? readFace({ tMs: frame.sample.tMs, sample: frame.sample, framed: frame.framed, tip: frame.proxies?.tip ?? readCenter.tip, turn: frame.proxies?.turn ?? readCenter.turn }, readCenter) : null), [frame, readCenter]);
  const lookColor = !look ? colors.textMuted : look.reason === "no_face" ? colors.textMuted : look.looking ? colors.success : colors.warning;

  function shareRun() {
    if (calibration.status !== "done" || !results) return;
    const samples = calibration.samples.map((s) => s.sample);
    const metrics = computePresenceMetrics(samples, thresholds);
    const stats = gazeStats(samples);
    const lines = ["Face Lab calibration", "Thresholds: " + (dirty ? "changed" : "defaults")];
    for (const r of results) {
      lines.push(r.step.prompt + ": " + (r.lookingPercent ?? "-") + "% on the lens (" + r.samples + " samples, expected " + (r.step.expectLooking ? "on" : "off") + ")");
    }
    if (metrics) lines.push("Eye contact " + metrics.eyeContactPercent + "%, looking down " + (metrics.lookingDownPercent ?? "-") + "%");
    if (stats) {
      lines.push("|gazeX| p50 " + stats.gazeXAbs.p50.toFixed(2) + " p90 " + stats.gazeXAbs.p90.toFixed(2));
      lines.push("gazeY p10 " + stats.gazeY.p10.toFixed(2) + " p50 " + stats.gazeY.p50.toFixed(2));
      lines.push("|yaw| p50 " + stats.yawAbs.p50.toFixed(1) + " p90 " + stats.yawAbs.p90.toFixed(1));
    }
    if (dirty) lines.push("", formatThresholdsAsCode(thresholds));
    Share.share({ message: lines.join("\n") }).catch(() => undefined);
  }

  return (
    <Screen title="Face Lab" eyebrow="Dev" onBack={navigation.goBack}>
      <View style={styles.camera} onLayout={(e: LayoutChangeEvent) => setView({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height })}>
        {hasPermission ? (
          <>
            <CameraPreview cameraRef={cameraRef} isActive={focused} onFaceFrame={onFaceFrame} audio={false} orientation={mpOrientation} />
            <FaceOverlay face={frame?.face ?? null} view={view} mirror={false} framed={frame?.framed ?? false} />
            <View style={styles.badge}>
              <Mono variant="caption2" color="#FFFFFF">
                {fps + " fps"}
              </Mono>
            </View>
          </>
        ) : (
          <View style={styles.permission}>
            <Txt variant="subhead" tone="secondary" align="center">
              The Face Lab needs the camera. Nothing is recorded or saved.
            </Txt>
            <PrimaryButton label="Allow camera" size="md" onPress={() => requestPermission()} />
          </View>
        )}
      </View>

      <View style={styles.pill}>
        <View style={[styles.dot, { backgroundColor: lookColor }]} />
        <Txt variant="headline" style={styles.pillText}>
          {look ? describeLook(look) : "Waiting for the camera"}
        </Txt>
        <Mono tone={frame?.face ? (frame.framed ? "success" : "warning") : "muted"}>{frame?.face ? (frame.framed ? "framed" : "off-center") : ""}</Mono>
      </View>

      <SegmentedControl
        options={[
          { key: "live", label: "Live" },
          { key: "calibrate", label: "Calibrate" },
          { key: "thresholds", label: "Thresholds" },
        ]}
        value={tab}
        onChange={setTab}
      />

      {tab === "live" ? (
        <>
          <Card style={styles.targetCard}>
            <GazeTarget
              point={sample ? { x: sample.gazeX ?? 0, y: sample.gazeY ?? 0 } : null}
              trail={frame?.trail ?? []}
              limit={thresholds.gazeMaxOffset}
              downLimit={thresholds.lookingDown}
            />
          </Card>
          <Card style={styles.meters}>
            <Mono tone="secondary">
              {readout ? FACE_LABEL[readout.face] + " | eyes: " + (readout.eyes ? EYES_LABEL[readout.eyes] : "-") + " | head: " + (readout.head ? HEAD_LABEL[readout.head] : "-") + " | " + (readout.smiling ? "smiling" : "neutral") + " | brows " + (readout.brows ? "raised" : "relaxed") : "No face"}
            </Mono>
            <Mono tone="muted" variant="caption2">
              {"head tip " + (frame?.proxies ? frame.proxies.tip.toFixed(3) : "-") + " (centre " + readCenter.tip.toFixed(3) + ", down is higher) | turn " + (frame?.proxies ? frame.proxies.turn.toFixed(3) : "-") + " | " + (saved ? "calibrated " + saved.at.slice(0, 10) : "not calibrated")}
            </Mono>
            <Meter label="Head turn" value={sample?.yaw} min={-45} max={45} centered marks={[-thresholds.gazeHeadMaxDeg, thresholds.gazeHeadMaxDeg]} decimals={0} unit={"°"} alert={!!sample && Math.abs(sample.yaw) > thresholds.gazeHeadMaxDeg} />
            <Meter label="Head up/down" value={sample?.pitch} min={-45} max={45} centered marks={[-thresholds.gazeHeadMaxDeg, thresholds.gazeHeadMaxDeg]} decimals={0} unit={"°"} alert={!!sample && Math.abs(sample.pitch) > thresholds.gazeHeadMaxDeg} />
            <Meter label="Head tilt" value={sample?.roll} min={-30} max={30} centered marks={[-thresholds.tiltedDeg, thresholds.tiltedDeg]} decimals={0} unit={"°"} alert={!!sample && Math.abs(sample.roll ?? 0) > thresholds.tiltedDeg} />
            <Meter label="Eyes side" value={sample?.gazeX} min={-1} max={1} centered marks={[-thresholds.gazeMaxOffset, thresholds.gazeMaxOffset]} alert={!!sample && Math.abs(sample.gazeX ?? 0) > thresholds.gazeMaxOffset} />
            <Meter label="Eyes up/down" value={sample?.gazeY} min={-1} max={1} centered marks={[thresholds.lookingDown]} alert={!!sample && (sample.gazeY ?? 0) <= thresholds.lookingDown} />
            <Meter label="Eyes open" value={sample?.eyesOpen} min={0} max={1} marks={[thresholds.eyesClosed]} alert={!!sample && sample.eyesOpen < thresholds.eyesClosed} />
            <View style={styles.blinkRow}>
              <Mono tone="secondary" style={styles.blinkText}>
                {"Blinks " + blinks.current.state.count + " in " + Math.round((Date.now() - blinks.current.since) / 1000) + " s"}
              </Mono>
              <IconButton
                icon="refresh"
                variant="plain"
                size={32}
                accessibilityLabel="Reset the blink count"
                onPress={() => {
                  blinks.current = { state: newBlinkState(), since: Date.now() };
                }}
              />
            </View>
            <Meter label="Smile" value={sample?.smile} min={0} max={1} marks={[thresholds.smile]} alert={!!sample && sample.smile >= thresholds.smile} />
            <Meter label="Brow raise" value={sample?.browRaise} min={0} max={1} marks={[thresholds.browRaise]} alert={!!sample && (sample.browRaise ?? 0) >= thresholds.browRaise} />
            <Meter label="Brow down" value={sample?.browDown} min={0} max={1} marks={[thresholds.tense]} alert={!!sample && (sample.browDown ?? 0) >= thresholds.tense} />
            <Meter label="Jaw open" value={sample?.jawOpen} min={0} max={1} />
            <Meter label="Lips pressed" value={sample?.mouthPress} min={0} max={1} marks={[thresholds.tense]} alert={!!sample && (sample.mouthPress ?? 0) >= thresholds.tense} />
          </Card>
          <Txt variant="caption1" tone="muted">
            The white tick on each bar is the threshold in use. A bar turns amber when it is past it.
          </Txt>
          <OverlayDebug face={frame?.face ?? null} view={view} orientation={mpOrientation} onOrientation={setMpOrientation} />
        </>
      ) : null}

      {tab === "calibrate" ? (
        <>
          {calibration.status === "idle" ? (
            <Card style={styles.block}>
              <Txt variant="headline">A 25-second guided run</Txt>
              <Txt variant="subhead" tone="secondary">
                Five 5-second prompts: the lens, your own preview, notes below the phone, away to the side, eyes closed. It then shows how the current thresholds treat each one.
              </Txt>
              <PrimaryButton label="Start" onPress={startCalibration} disabled={!hasPermission} />
            </Card>
          ) : null}

          {calibration.status === "running" ? <RunningCard elapsed={calibration.elapsed} /> : null}

          {results ? (
            <Card style={styles.block}>
              {results.map((r) => (
                <View key={r.step.id} style={styles.result}>
                  <View style={styles.resultHead}>
                    <Txt variant="headline" style={styles.pillText}>
                      {r.step.prompt}
                    </Txt>
                    <Mono tone={r.passed === null ? "muted" : r.passed ? "success" : "danger"}>{r.lookingPercent === null ? "-" : r.lookingPercent + "%"}</Mono>
                  </View>
                  <Mono variant="caption2" tone="secondary">
                    {"should count as " + (r.step.expectLooking ? "on the lens" : "away") + (r.passed === false ? " (it does not)" : "") + "; " + r.samples + " samples" + reasonText(r.reasons)}
                  </Mono>
                </View>
              ))}
              <View style={styles.actions}>
                <PrimaryButton label="Run again" variant="secondary" size="md" onPress={startCalibration} style={styles.flex} />
                <PrimaryButton label="Share" variant="secondary" size="md" icon="share-outline" onPress={shareRun} style={styles.flex} />
              </View>
              <Txt variant="caption1" tone="muted">
                Change a threshold on the Thresholds tab and these results update.
              </Txt>
            </Card>
          ) : null}
        </>
      ) : null}

      {tab === "thresholds" ? (
        <>
          <Card style={styles.block}>
            {THRESHOLD_FIELDS.map((field) => (
              <Stepper
                key={field.key}
                label={field.label}
                hint={field.hint}
                valueText={formatThresholdValue(field, thresholds[field.key])}
                changed={thresholds[field.key] !== DEFAULT_PRESENCE_THRESHOLDS[field.key]}
                onMinus={() => changeThreshold(field.key, -1)}
                onPlus={() => changeThreshold(field.key, 1)}
              />
            ))}
          </Card>
          <Txt variant="caption1" tone="muted">
            These only affect this screen. Production scoring uses DEFAULT_PRESENCE_THRESHOLDS until you copy values into it.
          </Txt>
          <PrimaryButton label="Compare on recent takes" variant="secondary" loading={rescoring} onPress={compareRecent} />
          {rescored ? (
            <Card style={styles.block}>
              {rescored.length === 0 ? (
                <Txt variant="subhead" tone="muted">
                  No recent take kept a face timeline.
                </Txt>
              ) : (
                rescored.map((row) => (
                  <View key={row.sessionId} style={styles.result}>
                    <Txt variant="footnote" tone="secondary">
                      {new Date(row.recordedAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                    </Txt>
                    <Mono>{"eye contact " + row.defaults.eyeContactPercent + "% -> " + row.tuned.eyeContactPercent + "%"}</Mono>
                    <Mono tone="secondary">
                      {"looking down " + (row.defaults.lookingDownPercent ?? "-") + "% -> " + (row.tuned.lookingDownPercent ?? "-") + "%, longest away " + (row.defaults.longestLookAwayMs / 1000).toFixed(1) + " s -> " + (row.tuned.longestLookAwayMs / 1000).toFixed(1) + " s"}
                    </Mono>
                  </View>
                ))
              )}
            </Card>
          ) : null}
          <View style={styles.actions}>
            <PrimaryButton label="Share as code" variant="secondary" size="md" icon="code-slash-outline" disabled={!dirty} onPress={() => Share.share({ message: formatThresholdsAsCode(thresholds) }).catch(() => undefined)} style={styles.flex} />
            <PrimaryButton label="Reset" variant="ghost" size="md" disabled={!dirty} onPress={resetThresholds} style={styles.flex} />
          </View>
        </>
      ) : null}
    </Screen>
  );
}

function reasonText(reasons: Partial<Record<string, number>>): string {
  const parts = Object.entries(reasons).map(([reason, n]) => reason.replace("_", " ") + " " + n);
  return parts.length ? " (" + parts.join(", ") + ")" : "";
}

function RunningCard({ elapsed }: { elapsed: number }) {
  const styles = useStyles();
  const clock = stepForTime(elapsed);
  const step = clock ? CALIBRATION_STEPS[clock.index] : null;
  return (
    <Card style={styles.running}>
      <Mono tone="muted">{"Step " + ((clock?.index ?? 0) + 1) + " of " + CALIBRATION_STEPS.length}</Mono>
      <Txt variant="title2" align="center">
        {step?.prompt ?? "Done"}
      </Txt>
      <Mono variant="subhead" tone="secondary">
        {clock?.settling ? "Get ready..." : Math.ceil((clock?.remainingMs ?? 0) / 1000) + " s"}
      </Mono>
    </Card>
  );
}

const useStyles = makeStyles((t) => ({
  camera: { height: 330, borderRadius: t.radius.lg, overflow: "hidden", backgroundColor: t.colors.surface },
  badge: { position: "absolute", left: t.space.sm, top: t.space.sm, paddingHorizontal: 8, paddingVertical: 3, borderRadius: t.radius.pill, backgroundColor: "rgba(0,0,0,0.55)" },
  permission: { flex: 1, alignItems: "center", justifyContent: "center", gap: t.space.md, padding: t.space.lg },
  pill: { flexDirection: "row", alignItems: "center", gap: t.space.sm, minHeight: 36 },
  pillText: { flex: 1 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  targetCard: { alignItems: "center" },
  meters: { gap: 4 },
  blinkRow: { flexDirection: "row", alignItems: "center" },
  blinkText: { flex: 1 },
  block: { gap: t.space.sm },
  running: { alignItems: "center", gap: t.space.sm, paddingVertical: t.space.lg },
  result: { gap: 2, paddingVertical: 4 },
  resultHead: { flexDirection: "row", alignItems: "center", gap: t.space.sm },
  actions: { flexDirection: "row", gap: t.space.sm },
  flex: { flex: 1 },
}));

const MP_ORIENTATIONS: { key: string | undefined; label: string }[] = [
  { key: undefined, label: "Auto" },
  { key: "right", label: "right" },
  { key: "left", label: "left" },
  { key: "up", label: "up" },
  { key: "down", label: "down" },
];

// The raw numbers behind the overlay, and a switch for the orientation the
// camera image is handed to MediaPipe in, to compare them.
function OverlayDebug({
  face,
  view,
  orientation,
  onOrientation,
}: {
  face: OrientedFace | null;
  view: { width: number; height: number };
  orientation: string | undefined;
  onOrientation: (orientation: string | undefined) => void;
}) {
  const at = (i: number) => (face ? "(" + face.landmarks[i * 3].toFixed(2) + ", " + face.landmarks[i * 3 + 1].toFixed(2) + ")" : "-");
  return (
    <Card style={{ gap: 4 }}>
      <Txt variant="footnote" tone="secondary">
        Overlay debug (upright preview coordinates, 0-1)
      </Txt>
      <Mono variant="caption2">{"MediaPipe orientation " + (face?.orientation ?? "-") + ", turned " + (face?.axes ? describeFaceAxes(face.axes) : "-") + (face?.axesScore != null ? " (fit " + face.axesScore.toFixed(2) + " of 2)" : "")}</Mono>
      <Mono variant="caption2">{"image " + (face ? face.width + "x" + face.height : "-") + ", view " + Math.round(view.width) + "x" + Math.round(view.height)}</Mono>
      <Mono variant="caption2">{"forehead " + at(1) + "  chin " + at(2)}</Mono>
      <Mono variant="caption2">{"eye L " + at(5) + "  eye R " + at(6)}</Mono>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, paddingTop: 4 }}>
        {MP_ORIENTATIONS.map((o) => (
          <Chip key={o.label} label={o.label} selected={orientation === o.key} onPress={() => onOrientation(o.key)} />
        ))}
      </View>
      <Txt variant="caption1" tone="muted">
        Needs the build with the orientation switch. Look down and check that Eyes up/down goes negative and Head tilt stays near 0.
      </Txt>
    </Card>
  );
}
