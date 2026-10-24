import { useMemo } from "react";
import { View } from "react-native";
import { Txt } from "../../common/Txt";
import { useTheme } from "../../../theme/ThemeProvider";
import { TimeChart, readSeries, type ChartLayer } from "./TimeChart";
import { useTimeline } from "./TimelineContext";
import { loudnessAxis, loudnessReadout, loudnessSeries, paceAxis, paceSeries, pitchAxis, pitchCoverageNote, pitchReadout, pitchSeries } from "../../../domain/results/charts";
import { spanOf } from "../../../domain/results/timeline";
import type { WpmPoint } from "../../../domain/sessionTypes";
import type { VoiceCharts } from "../../../services/signals/voiceCharts";
import { PACE_BAND } from "../../../domain/scoring/bands";

// The three charts of the Scores tab. Each sits directly under the score it
// explains, on the same time axis and with its unit in the title.

// Zoomed in past a third of the take, the finer buckets are used so the detail
// is there; the axis is always worked out from the whole take so it doesn't
// jump while you zoom.
function useChartData(voice: VoiceCharts | null | undefined) {
  const { viewport, durationMs } = useTimeline();
  if (!voice) return null;
  return spanOf(viewport) < durationMs / 3 ? voice.fine : voice.coarse;
}

export function PaceChart({ curve }: { curve: WpmPoint[] | null }) {
  const { colors } = useTheme();
  const layers = useMemo<ChartLayer[]>(() => (curve && curve.length ? [{ series: paceSeries(curve), color: colors.accent, area: true }] : []), [curve, colors.accent]);
  const axis = useMemo(() => paceAxis(curve ?? []), [curve]);
  if (!curve || !curve.length) return <Unavailable>Pace over time needs the word timings, which this take doesn't have.</Unavailable>;
  return (
    <TimeChart
      title="Pace over time"
      unit="words a minute"
      axis={axis}
      layers={layers}
      bands={[{ from: PACE_BAND.low, to: PACE_BAND.high, color: colors.success }]}
      readout={(ms) => readSeries(layers, ms, (v) => `${v} words a minute`, "No words in this stretch")}
      caption={`Shaded: ${PACE_BAND.low} to ${PACE_BAND.high} words a minute, full marks. Each point is a 5 second stretch, pauses included, so it reads lower than your speaking rate.`}
    />
  );
}

export function PitchChart({ voice, fullSt }: { voice: VoiceCharts | null | undefined; fullSt: number }) {
  const { colors } = useTheme();
  const data = useChartData(voice);
  const layers = useMemo<ChartLayer[]>(() => (data ? [{ series: pitchSeries(data), color: colors.violet }] : []), [data, colors.violet]);
  const axis = useMemo(() => pitchAxis(voice ? voice.coarse.pitchSt : []), [voice]);
  if (voice === undefined) return null;
  if (!voice) return <Unavailable>Voice analysis isn't available for this take, so there's no pitch chart.</Unavailable>;
  if (!voice.coarse.enoughVoice) {
    return <Unavailable>Not enough clear voice to chart the pitch. It needs about 3 seconds of voiced speech, and this take has less. That's the reading, not the chart.</Unavailable>;
  }
  const median = voice.coarse.medianHz;
  const note = pitchCoverageNote(voice.voicedShare, voice.voicedSeconds);
  return (
    <TimeChart
      title="Pitch over time"
      unit="semitones from your median"
      axis={axis}
      layers={layers}
      bands={[{ from: -fullSt / 2, to: fullSt / 2, color: colors.violet }]}
      readout={(ms) => readSeries(layers, ms, (v) => pitchReadout(v, median), "No clear pitch here (a pause or an unvoiced sound)")}
      caption={`0 is your median${median ? ` (${Math.round(median)} Hz)` : ""}; up is higher. Shaded: a ${fullSt} semitone band, the spread that scores full marks. Gaps are pauses and sounds with no pitch.${note ? ` ${note}` : ""}`}
    />
  );
}

export function LoudnessChart({ voice }: { voice: VoiceCharts | null | undefined }) {
  const { colors } = useTheme();
  const data = useChartData(voice);
  const layers = useMemo<ChartLayer[]>(() => (data ? [{ series: loudnessSeries(data), color: colors.teal, area: true }] : []), [data, colors.teal]);
  const axis = useMemo(() => loudnessAxis(voice ? voice.coarse.levelDb : []), [voice]);
  if (voice === undefined) return null;
  if (!voice) return <Unavailable>Voice analysis isn't available for this take, so there's no loudness chart.</Unavailable>;
  return (
    <TimeChart
      title="Loudness over time"
      unit="dB from your usual level"
      axis={axis}
      layers={layers}
      readout={(ms) => readSeries(layers, ms, loudnessReadout, "A pause")}
      caption="0 is how loud you usually are while speaking, so it doesn't depend on how close the phone was. Gaps are pauses."
    />
  );
}

function Unavailable({ children }: { children: string }) {
  return (
    <View>
      <Txt variant="footnote" tone="muted">
        {children}
      </Txt>
    </View>
  );
}
