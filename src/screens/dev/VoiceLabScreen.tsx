import { useState } from "react";
import { Alert, View } from "react-native";
import Svg, { Line, Polyline } from "react-native-svg";
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
import { decodeVideoAudio } from "../../domain/audioAnalysis";
import { AUDIO_EXTRACTOR_VERSION, extractAudioFeatures } from "../../domain/dsp/audioFeatures";
import { labChartPoints, summarizeFeatures, type VoiceLabSummary } from "../../domain/dev/voiceLab";
import { extractOffThread } from "../../services/audio/dspRuntime";
import { copyText } from "../../utils/copyText";
import { logger } from "../../utils/logger";
import { makeStyles, useTheme } from "../../theme/ThemeProvider";

type Props = NativeStackScreenProps<RootStackParamList, "DevVoiceLab">;

interface LabResult {
  sessionId: string;
  extractor: string;
  durationS: number;
  // The file's own audio as decoded without resampling (rate 0).
  nativeSampleRate: number | null;
  nativeChannels: number | null;
  decode16kMs: number;
  summary: VoiceLabSummary;
  // The same extraction run where the pipeline runs it (the background
  // worklet runtime when it works) and straight on the JS thread, for timings.
  pipelineThread: "worklet" | "js";
  pipelineMs: number;
  jsThreadMs: number;
  chart: { t: number; st: number | null }[];
}

const RANGE_ST = 9;

// Signal capture (docs/research/signal-capture.md): runs the app's audio
// extractor on one take's audio, on this phone, and shows what it measures
// and how long it takes, on the background runtime and on the JS thread.
// Nothing is stored.
export function VoiceLabScreen({ navigation, route }: Props) {
  const { sessionId } = route.params;
  const styles = useStyles();
  const showToast = useToast();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<LabResult | null>(null);

  async function run() {
    setBusy(true);
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

      const pipeline = await extractOffThread(decoded.waveform, decoded.sampleRate);
      await new Promise((r) => setTimeout(r, 50));
      const j0 = performance.now();
      extractAudioFeatures(decoded.waveform, decoded.sampleRate);
      const jsThreadMs = performance.now() - j0;

      const lab: LabResult = {
        sessionId,
        extractor: AUDIO_EXTRACTOR_VERSION,
        durationS: Math.round((decoded.waveform.length / decoded.sampleRate) * 10) / 10,
        nativeSampleRate,
        nativeChannels,
        decode16kMs: Math.round(decode16kMs),
        summary: summarizeFeatures(pipeline.features),
        pipelineThread: pipeline.thread,
        pipelineMs: pipeline.elapsedMs,
        jsThreadMs: Math.round(jsThreadMs),
        chart: labChartPoints(pipeline.features),
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

  const s = result?.summary;
  const fmt = (v: number | null | undefined, unit: string) => (v == null ? "–" : v + unit);
  return (
    <Screen
      title="Voice Lab"
      eyebrow="Signal capture"
      onBack={navigation.goBack}
      right={<IconButton icon="copy-outline" accessibilityLabel="Copy the result" disabled={!result} onPress={copyResult} />}
    >
      <Txt variant="subhead" tone="secondary">
        Runs the voice analysis on this take{"’"}s audio twice: where the app runs it, then on the main thread for a timing. The phone is busy for a few seconds.
      </Txt>
      <PrimaryButton label={result ? "Run again" : "Run the analysis"} onPress={run} loading={busy} />
      {result && s ? (
        <>
          <Card style={styles.card}>
            <Fact label="Audio in the file" value={(result.nativeSampleRate ?? "?") + " Hz, " + (result.nativeChannels ?? "?") + " ch"} />
            <Fact label="Length" value={result.durationS + " s"} />
            <Fact label="Decode to 16 kHz" value={result.decode16kMs + " ms"} />
            <Fact label={result.pipelineThread === "worklet" ? "Analysis, background runtime" : "Analysis, main thread (fallback)"} value={result.pipelineMs + " ms"} />
            <Fact label="Analysis, main thread" value={result.jsThreadMs + " ms"} />
          </Card>
          <Card style={styles.card}>
            <Fact label="Frames with a pitch" value={s.voicedPercent + "% (" + fmt(s.voicedSeconds, " s") + ")"} />
            <Fact label="Median pitch" value={fmt(s.medianHz, " Hz")} />
            <Fact label="Range p10–p90" value={fmt(s.rangeSemitones, " st")} />
            <Fact label="Pitch SD" value={fmt(s.sdSemitones, " st")} />
            <Fact label="Pitch confidence" value={fmt(s.meanConfidence, "")} />
            <Fact label="Noise floor" value={s.noiseFloorDb + " dBFS"} />
            <Fact label="Speaking level" value={fmt(s.speechMedianDbfs, " dBFS")} />
            <Fact label="Voice over noise" value={fmt(s.snrDb, " dB")} />
            <Fact label="Loudness range while speaking" value={fmt(s.loudnessSpreadDb, " dB")} />
            <Fact label="Syllable-peak SD" value={fmt(s.syllablePeakSdDb, " dB")} />
            <Fact label="Pauses / breaths / peaks" value={s.pauses + " / " + s.breaths + " / " + s.syllablePeaks} />
          </Card>
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

// Semitones from the median over time, broken at every gap.
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
  for (const p of result.chart) {
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
        {RANGE_ST}), gaps left empty.
      </Txt>
      <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)} style={{ height }}>
        {width > 0 ? (
          <Svg width={width} height={height}>
            <Line x1={0} y1={height / 2} x2={width} y2={height / 2} stroke={colors.textMuted} strokeWidth={1} opacity={0.3} />
            {runs.map((points, i) => (
              <Polyline key={i} points={points} fill="none" stroke={colors.violet} strokeWidth={1.5} />
            ))}
          </Svg>
        ) : null}
      </View>
    </Card>
  );
}

const useStyles = makeStyles((t) => ({
  card: { gap: t.space.sm },
  fact: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: t.space.md },
}));
