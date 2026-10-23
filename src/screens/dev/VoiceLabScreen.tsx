import { useState } from "react";
import { Alert, View } from "react-native";
import Svg, { Circle, Line, Polyline } from "react-native-svg";
import { decodeAudioData } from "react-native-audio-api";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../../navigation";
import { Screen } from "../../components/common/Screen";
import { Card } from "../../components/common/Card";
import { IconButton } from "../../components/common/IconButton";
import { PrimaryButton } from "../../components/common/PrimaryButton";
import { Txt } from "../../components/common/Txt";
import { useToast } from "../../components/common/ToastProvider";
import { Mono } from "../../components/dev/Mono";
import { getSessionById } from "../../services/db/sessionsRepo";
import { resolveVideoUri } from "../../services/storage/videoStorage";
import { analyzePitchVolume, decodeVideoAudio } from "../../domain/audioAnalysis";
import { trackPitch } from "../../domain/dsp/pitchTracker";
import { semitoneSeries, summarizeBuckets, summarizeTrack, type TrackerSummary } from "../../domain/dev/voiceLab";
import { copyText } from "../../utils/copyText";
import { logger } from "../../utils/logger";
import { makeStyles, useTheme } from "../../theme/ThemeProvider";

type Props = NativeStackScreenProps<RootStackParamList, "DevVoiceLab">;

interface LabResult {
  sessionId: string;
  durationS: number;
  // The file's own audio as decoded without resampling (rate 0).
  nativeSampleRate: number | null;
  nativeChannels: number | null;
  decode16kMs: number;
  noiseFloorDb: number;
  // Median level of the frames with a pitch: your speaking level.
  voicedLevelDb: number | null;
  current: TrackerSummary;
  proposed: TrackerSummary;
  chart: {
    current: { t: number; st: number | null }[];
    proposed: { t: number; st: number | null }[];
  };
}

const RANGE_ST = 9;

function medianOf(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return Math.round(sorted[Math.floor(sorted.length / 2)] * 10) / 10;
}

// Signal-capture spike (docs/research/signal-capture.md): runs today's pitch
// tracker and the candidate on one take's audio, on this phone, and shows
// how much of the voice each one finds, the pitch range each reports, and
// how long each takes in Hermes. Nothing is stored.
export function VoiceLabScreen({ navigation, route }: Props) {
  const { sessionId } = route.params;
  const styles = useStyles();
  const showToast = useToast();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<LabResult | null>(null);

  async function run() {
    setBusy(true);
    // Let the spinner draw before the JS thread is busy for a few seconds.
    await new Promise((r) => setTimeout(r, 50));
    try {
      const session = await getSessionById(sessionId);
      if (!session) throw new Error("This take is not in the database.");
      if (session.videoDeletedAt) throw new Error("This take's video was deleted, so there is no audio left to analyse.");
      const uri = resolveVideoUri(session);

      let nativeSampleRate: number | null = null;
      let nativeChannels: number | null = null;
      try {
        const native = await decodeAudioData(uri, 0);
        nativeSampleRate = native.sampleRate;
        nativeChannels = native.numberOfChannels;
      } catch (error) {
        logger.warn("[voicelab] native-rate decode failed — " + (error as Error).message);
      }

      const d0 = performance.now();
      const decoded = await decodeVideoAudio(uri);
      const decode16kMs = performance.now() - d0;
      if (!decoded) throw new Error("Couldn't decode this take's audio.");

      const c0 = performance.now();
      const today = analyzePitchVolume(decoded.waveform, decoded.sampleRate);
      const currentMs = performance.now() - c0;

      const p0 = performance.now();
      const track = trackPitch(decoded.waveform, decoded.sampleRate);
      const proposedMs = performance.now() - p0;

      const current = summarizeBuckets(today.pitchContourHz, currentMs);
      const proposed = summarizeTrack(track, proposedMs);
      const median = proposed.medianHz ?? current.medianHz;
      const lab: LabResult = {
        sessionId,
        durationS: Math.round((decoded.waveform.length / decoded.sampleRate) * 10) / 10,
        nativeSampleRate,
        nativeChannels,
        decode16kMs: Math.round(decode16kMs),
        noiseFloorDb: Math.round(track.noiseFloorDb * 10) / 10,
        voicedLevelDb: medianOf(track.frames.filter((f) => f.f0Hz !== null).map((f) => f.levelDb)),
        current,
        proposed,
        chart: {
          current: semitoneSeries(
            today.pitchContourHz.map((_, i) => i * 0.2 + 0.1),
            today.pitchContourHz,
            median,
          ),
          proposed: semitoneSeries(
            track.frames.map((f) => f.tMs / 1000),
            track.frames.map((f) => f.f0Hz),
            median,
          ),
        },
      };
      setResult(lab);
      logger.info("[voicelab] " + JSON.stringify({ ...lab, chart: undefined }));
    } catch (error) {
      Alert.alert("Voice Lab", (error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function copyResult() {
    if (!result) return;
    if (await copyText(JSON.stringify({ ...result, chart: undefined }, null, 2))) showToast("Voice Lab result copied.", "success");
  }

  return (
    <Screen
      title="Voice Lab"
      eyebrow="Signal capture"
      onBack={navigation.goBack}
      right={<IconButton icon="copy-outline" accessibilityLabel="Copy the result" disabled={!result} onPress={copyResult} />}
    >
      <Txt variant="subhead" tone="secondary">
        Runs today{"’"}s pitch tracker and the candidate on this take{"’"}s audio. The phone is busy for a few seconds.
      </Txt>
      <PrimaryButton label={result ? "Run again" : "Run both trackers"} onPress={run} loading={busy} />
      {result ? (
        <>
          <Card style={styles.card}>
            <Fact label="Audio in the file" value={(result.nativeSampleRate ?? "?") + " Hz, " + (result.nativeChannels ?? "?") + " ch"} />
            <Fact label="Length" value={result.durationS + " s"} />
            <Fact label="Decode to 16 kHz" value={result.decode16kMs + " ms"} />
            <Fact label="Noise floor (band 60-1000 Hz)" value={result.noiseFloorDb + " dBFS"} />
            <Fact label="Speaking level (voiced frames)" value={(result.voicedLevelDb ?? "?") + " dBFS"} />
          </Card>
          <Compare current={result.current} proposed={result.proposed} />
          <Chart result={result} />
        </>
      ) : null}
    </Screen>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  const styles = useStyles();
  return (
    <View style={styles.fact}>
      <Txt variant="footnote" tone="secondary">
        {label}
      </Txt>
      <Mono>{value}</Mono>
    </View>
  );
}

function Compare({ current, proposed }: { current: TrackerSummary; proposed: TrackerSummary }) {
  const styles = useStyles();
  const fmt = (v: number | null, unit: string) => (v == null ? "–" : v + unit);
  const rows: [string, string, string][] = [
    ["Frames", String(current.frames), String(proposed.frames)],
    ["With a pitch", current.voicedPercent + "%", proposed.voicedPercent + "%"],
    ["Median", fmt(current.medianHz, " Hz"), fmt(proposed.medianHz, " Hz")],
    ["Max − min (scored today)", fmt(current.hzRange, " Hz"), fmt(proposed.hzRange, " Hz")],
    ["Range p10–p90", fmt(current.rangeSemitones, " st"), fmt(proposed.rangeSemitones, " st")],
    ["SD", fmt(current.sdSemitones, " st"), fmt(proposed.sdSemitones, " st")],
    ["Time on this phone", current.elapsedMs + " ms", proposed.elapsedMs + " ms"],
  ];
  return (
    <Card style={styles.card}>
      <View style={styles.row}>
        <Txt variant="footnote" tone="secondary" style={styles.cellLabel}>
          {" "}
        </Txt>
        <Txt variant="footnote" style={styles.cell}>
          Today
        </Txt>
        <Txt variant="footnote" style={styles.cell}>
          Candidate
        </Txt>
      </View>
      {rows.map(([label, a, b]) => (
        <View key={label} style={styles.row}>
          <Txt variant="footnote" tone="secondary" style={styles.cellLabel}>
            {label}
          </Txt>
          <Mono style={styles.cell}>{a}</Mono>
          <Mono style={styles.cell}>{b}</Mono>
        </View>
      ))}
    </Card>
  );
}

// Semitones from the median over time: today's buckets as dots, the
// candidate as lines broken at every gap.
function Chart({ result }: { result: LabResult }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const [width, setWidth] = useState(0);
  const height = 140;
  const duration = Math.max(result.durationS, 1);
  const x = (t: number) => (t / duration) * width;
  const y = (st: number) => height / 2 - (Math.max(-RANGE_ST, Math.min(RANGE_ST, st)) / RANGE_ST) * (height / 2 - 4);
  const runs: string[] = [];
  let run: string[] = [];
  for (const p of result.chart.proposed) {
    if (p.st == null) {
      if (run.length > 1) runs.push(run.join(" "));
      run = [];
    } else run.push(x(p.t).toFixed(1) + "," + y(p.st).toFixed(1));
  }
  if (run.length > 1) runs.push(run.join(" "));
  return (
    <Card style={styles.card}>
      <Txt variant="footnote" tone="secondary">
        Pitch, semitones from the median ({"±"}
        {RANGE_ST}). Lines: candidate. Dots: today.
      </Txt>
      <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)} style={{ height }}>
        {width > 0 ? (
          <Svg width={width} height={height}>
            <Line x1={0} y1={height / 2} x2={width} y2={height / 2} stroke={colors.textMuted} strokeWidth={1} opacity={0.3} />
            {runs.map((points, i) => (
              <Polyline key={i} points={points} fill="none" stroke={colors.violet} strokeWidth={1.5} />
            ))}
            {result.chart.current.map((p, i) => (p.st == null ? null : <Circle key={i} cx={x(p.t)} cy={y(p.st)} r={2.5} fill={colors.textPrimary} />))}
          </Svg>
        ) : null}
      </View>
    </Card>
  );
}

const useStyles = makeStyles((t) => ({
  card: { gap: t.space.sm },
  fact: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: t.space.md },
  row: { flexDirection: "row", alignItems: "center", gap: t.space.sm },
  cellLabel: { flex: 1.6 },
  cell: { flex: 1, textAlign: "right" },
}));
