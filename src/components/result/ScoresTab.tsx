import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useEvent } from "expo";
import { useVideoPlayer } from "expo-video";
import { Card } from "../common/Card";
import { IconButton } from "../common/IconButton";
import { Scrubber } from "../playback/Scrubber";
import { Txt } from "../common/Txt";
import { colorForScore } from "./scoreColor";
import { TimelineProvider } from "./charts/TimelineContext";
import { LoudnessChart, PaceChart, PitchChart } from "./charts/ScoreCharts";
import type { LeafScore, PillarScore, TakeScores } from "../../domain/scoring/takeScore";
import type { LeafId } from "../../domain/scoring/skillTree";
import type { Session, SessionScores } from "../../domain/sessionTypes";
import { producerName, provenanceLabel } from "../../domain/analysis/provenance";
import { trustLabel } from "../../domain/signalLab/readingTrust";
import { FIXED_PITCH_BAND } from "../../domain/scoring/bands";
import { pitchBandFor } from "../../services/sessions/sessionScoreService";
import { loadVoiceCharts, type VoiceCharts } from "../../services/signals/voiceCharts";
import { tick } from "../../utils/haptics";
import { makeStyles, useTheme } from "../../theme/ThemeProvider";

// The deep breakdown of a take: the skill tree for this attempt. Every pillar,
// every skill under it, every leaf with its score, who checked it, the judge's
// note, the raw number behind it and, under the few that have one, the graph of
// it over time. It reads the same sheet as the Overview's summary (domain/
// scoring/takeScore.ts), so the names and numbers always agree. Phase 6 replaces
// the layout (plan section 10).
interface ScoresTabProps {
  scores: TakeScores;
  // The judge's stored rubric, for the body-language note the totals leave out.
  rubric: SessionScores | null;
  session: Session;
  // The take's video file when it still exists: "Play from here" on a chart
  // plays its sound right here, so the line moves along the charts.
  videoUri?: string | null;
}

export function ScoresTab({ scores, rubric, session, videoUri }: ScoresTabProps) {
  const styles = useStyles();
  const [voice, setVoice] = useState<VoiceCharts | null | undefined>(undefined);
  const [fullSt, setFullSt] = useState<number>(FIXED_PITCH_BAND.fullSt);

  useEffect(() => {
    let live = true;
    loadVoiceCharts(session.id)
      .then((v) => live && setVoice(v))
      .catch(() => live && setVoice(null));
    pitchBandFor(session)
      .then((b) => live && setFullSt(b.fullSt))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [session]);

  const { playFrom, bar, playheadMs, playing } = useScorePlayer(videoUri ?? null);
  const judge = producerName(scores.judgedBy);
  const checked = scores.headline === "overall";
  const durationMs = Math.max(session.durationSeconds * 1000, voice?.durationMs ?? 0);

  return (
    <TimelineProvider durationMs={durationMs} playFrom={videoUri ? playFrom : undefined} playheadMs={playheadMs} playing={playing}>
      <ScrollView style={styles.flex} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <Card style={styles.head}>
        <View style={styles.headTop}>
          <View style={styles.flex}>
            <Txt variant="footnote" tone="muted">
              {checked ? `Overall, with Message judged by ${judge}` : "Delivery, measured on this phone"}
            </Txt>
            <Txt variant="footnote" tone="secondary">
              {checked ? "Each score below says whether Tono AI judged it or the phone measured it." : "The same formula for every take, from what the phone measured. Message wasn't checked, so it isn't in this score."}
            </Txt>
          </View>
          <Txt variant="title1" tabular>
            {scores.score}
          </Txt>
        </View>
        {checked ? (
          <Txt variant="caption1" tone="muted">
            {provenanceLabel(scores.judgedBy)}
          </Txt>
        ) : null}
      </Card>

      {scores.pillars.map((pillar) => (
        <PillarCard
          key={pillar.id}
          pillar={pillar}
          judge={judge}
          charts={{
            speaking_rate: <PaceChart curve={session.wpmCurve} />,
            pitch_variety: <PitchChart voice={voice} fullSt={fullSt} />,
            stand_out_stress: <LoudnessChart voice={voice} />,
          }}
          bodyNote={pillar.id === "presence" && checked && rubric?.bodyLanguageNotes ? rubric.bodyLanguageNotes : null}
        />
      ))}
      </ScrollView>
      {bar}
    </TimelineProvider>
  );
}

// The Scores tab's own player: "Play from here" starts the take's sound at the
// chosen moment and keeps you where you are, with the charts' line moving. A
// small bar appears (play or pause, scrub, close) and goes with the tab.
function useScorePlayer(videoUri: string | null) {
  const styles = useStyles();
  const [started, setStarted] = useState(false);
  const player = useVideoPlayer(videoUri, (p) => {
    p.loop = false;
    p.timeUpdateEventInterval = 0.1;
  });
  const { currentTime } = useEvent(player, "timeUpdate", { currentTime: 0, currentLiveTimestamp: null, currentOffsetFromLive: null, bufferedPosition: 0 });
  const { isPlaying } = useEvent(player, "playingChange", { isPlaying: player.playing });
  // The line holds where a scrub or a start put it until the player reports a time.
  const [seekedMs, setSeekedMs] = useState<number | null>(null);
  useEffect(() => setSeekedMs(null), [currentTime]);

  const playFrom = useCallback(
    (ms: number) => {
      player.currentTime = ms / 1000;
      setSeekedMs(ms);
      setStarted(true);
      player.play();
    },
    [player],
  );

  const durationMs = Math.round((player.duration || 0) * 1000);
  const positionMs = seekedMs ?? currentTime * 1000;

  function toggle() {
    if (isPlaying) {
      player.pause();
      return;
    }
    // Played to the end: again from the start.
    if (durationMs > 0 && positionMs >= durationMs - 250) {
      player.currentTime = 0;
      setSeekedMs(0);
    }
    player.play();
  }

  function close() {
    player.pause();
    setStarted(false);
    setSeekedMs(null);
  }

  const bar = started ? (
    <View style={styles.bar}>
      <IconButton icon={isPlaying ? "pause" : "play"} onPress={toggle} size={38} accessibilityLabel={isPlaying ? "Pause" : "Play"} />
      <View style={styles.flex}>
        <Scrubber
          positionMs={positionMs}
          durationMs={durationMs}
          onSeek={(ms) => {
            player.currentTime = ms / 1000;
            setSeekedMs(ms);
          }}
        />
      </View>
      <IconButton icon="close" onPress={close} size={38} accessibilityLabel="Close the player" />
    </View>
  ) : null;

  return { playFrom, bar, playheadMs: started ? positionMs : null, playing: isPlaying };
}

function PillarCard({ pillar: p, judge, charts, bodyNote }: { pillar: PillarScore; judge: string; charts: Partial<Record<LeafId, ReactNode>>; bodyNote: string | null }) {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <Card style={styles.category}>
      <View style={styles.categoryHead}>
        <Txt variant="headline" style={styles.flex}>
          {p.name}
        </Txt>
        <Txt variant="title2" tabular color={p.score != null ? colorForScore(p.score, colors) : colors.textMuted}>
          {p.score ?? "–"}
        </Txt>
      </View>
      <Txt variant="caption1" tone="muted">
        {p.share > 0 ? `${Math.round(p.share * 100)}% of the total` : "Phone estimates, not in the total"}
      </Txt>
      {p.skills.map((skill) => (
        <View key={skill.id} style={styles.skill}>
          <View style={styles.subTop}>
            <Txt variant="callout" weight="600" style={styles.flex}>
              {skill.name}
            </Txt>
            <Txt variant="callout" weight="600" tabular>
              {skill.score ?? "–"}
            </Txt>
          </View>
          {skill.leaves.map((leaf) => (
            <LeafBlock key={leaf.id} leaf={leaf} judge={judge}>
              {charts[leaf.id]}
            </LeafBlock>
          ))}
        </View>
      ))}
      {bodyNote ? (
        <View style={styles.sub}>
          <Txt variant="subhead" weight="600">
            Body language{" "}
            <Txt variant="footnote" tone="muted">
              · {judge}, not in the total
            </Txt>
          </Txt>
          <Txt variant="footnote" tone="secondary">
            {bodyNote}
          </Txt>
        </View>
      ) : null}
    </Card>
  );
}

const SOURCE_LABEL = { measured: "measured on the phone", phone_estimate: "phone estimate", self: "you said" } as const;

function LeafBlock({ leaf: l, judge, children }: { leaf: LeafScore; judge: string; children?: ReactNode }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);
  const color = colorForScore(l.score, colors);
  return (
    <View style={styles.sub}>
      <View style={styles.subTop}>
        <Txt variant="subhead" weight="600" style={styles.flex}>
          {l.name}{" "}
          <Txt variant="footnote" tone="muted">
            · {l.source === "judge" ? judge : SOURCE_LABEL[l.source]}
          </Txt>
        </Txt>
        <Txt variant="subhead" weight="600" tabular color={color}>
          {l.score}
        </Txt>
      </View>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${Math.max(0, Math.min(100, l.score))}%`, backgroundColor: color }]} />
      </View>
      {l.trust ? (
        <Txt variant="caption1" tone="muted">
          {trustLabel(l.trust)}, not in the total
        </Txt>
      ) : null}
      {l.notes ? (
        <Txt variant="footnote" tone="secondary">
          {l.notes}
        </Txt>
      ) : null}
      {children}
      <Pressable
        onPress={() => {
          tick();
          setOpen((o) => !o);
        }}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        style={styles.how}
      >
        <Txt variant="footnote" tone="accent" weight="600">
          {open ? "Hide how it's measured" : l.value}
        </Txt>
        <Ionicons name={open ? "chevron-up" : "chevron-down"} size={13} color={colors.accent} />
      </Pressable>
      {open ? (
        <View style={styles.factor}>
          <Txt variant="footnote" weight="600">
            {l.value}
          </Txt>
          <Txt variant="footnote" tone="secondary">
            {l.rule}
          </Txt>
        </View>
      ) : null}
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  flex: { flex: 1 },
  content: { gap: t.space.md, paddingBottom: t.space.lg },
  bar: { flexDirection: "row", alignItems: "center", gap: t.space.xs, paddingTop: t.space.xs },
  head: { gap: t.space.sm },
  headTop: { flexDirection: "row", alignItems: "center", gap: t.space.md },
  category: { gap: t.space.md },
  categoryHead: { flexDirection: "row", alignItems: "baseline", gap: t.space.sm },
  skill: { gap: t.space.sm },
  sub: { gap: t.space.xs + 2 },
  subTop: { flexDirection: "row", alignItems: "baseline", gap: t.space.sm },
  track: { height: 6, borderRadius: t.radius.pill, backgroundColor: t.colors.surfaceRaised, overflow: "hidden" },
  fill: { height: 6, borderRadius: t.radius.pill },
  how: { flexDirection: "row", alignItems: "center", gap: 4, paddingVertical: 2 },
  factor: { gap: 2, paddingLeft: t.space.sm },
}));
