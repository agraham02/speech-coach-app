import { useEffect, useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useEvent } from "expo";
import { useVideoPlayer, VideoView } from "expo-video";
import type { TranscriptWord } from "../../domain/sessionTypes";
import { radii, spacing, typography, font } from "../../theme/theme";
import { makeStyles, useTheme } from "../../theme/ThemeProvider";
import { getReviewPasses, markReviewPass } from "../../services/db/progressRepo";
import { atEnd, clampMs } from "../../domain/playback/followAlong";
import { PlaybackPanel, type PlaybackTransport } from "../playback/PlaybackPanel";

// Vinh Giang's self-review method: watch the same take three times, each
// time paying attention to one channel. Watching with the sound off exposes
// body language you'd otherwise miss; listening without the picture exposes
// pace, pauses, fillers and melody; the last pass puts them back together.
type Pass = "watch" | "listen" | "both";

const PASSES: { key: Pass; label: string; icon: keyof typeof Ionicons.glyphMap; focus: string }[] = [
  {
    key: "watch",
    label: "1 · Watch",
    icon: "eye-outline",
    focus: "Sound off. Notice posture, gestures, eye contact and facial expression.",
  },
  {
    key: "listen",
    label: "2 · Listen",
    icon: "ear-outline",
    focus: "Picture off. Listen for pace, pauses, filler words and vocal melody.",
  },
  {
    key: "both",
    label: "3 · Both",
    icon: "videocam-outline",
    focus: "Everything together. Does your face match what your voice is saying?",
  },
];

const RATES = [1, 1.25, 1.5];

export function ThreePassPlayer({
  sessionId,
  videoUri,
  transcriptWords,
  transcriptText,
  startAt,
}: {
  sessionId: string;
  videoUri: string;
  transcriptWords: TranscriptWord[] | null;
  transcriptText: string | null;
  // "Play from here" on the Scores tab's charts: open on the picture and
  // sound together and start at this moment. `nonce` makes a repeat of the
  // same moment count as a new request.
  startAt?: { ms: number; nonce: number } | null;
}) {
  const styles = useStyles();
  const { colors } = useTheme();
  const [pass, setPass] = useState<Pass>("watch");
  const [rate, setRate] = useState(1);
  const [completed, setCompleted] = useState<Set<Pass>>(new Set());
  // A seek shows at once, even paused (time updates only come while it
  // plays), until the player reports a time of its own.
  const [seekedMs, setSeekedMs] = useState<number | null>(null);

  useEffect(() => {
    getReviewPasses(sessionId).then((passes) => setCompleted(new Set(passes)));
  }, [sessionId]);
  const player = useVideoPlayer(videoUri, (p) => {
    p.loop = false;
    p.timeUpdateEventInterval = 0.25;
  });
  const { currentTime } = useEvent(player, "timeUpdate", {
    currentTime: 0,
    currentLiveTimestamp: null,
    currentOffsetFromLive: null,
    bufferedPosition: 0,
  });
  const { isPlaying } = useEvent(player, "playingChange", { isPlaying: player.playing });
  // Re-renders once the video has loaded, so the scrubber learns its length.
  const { status } = useEvent(player, "statusChange", { status: player.status });
  useEffect(() => setSeekedMs(null), [currentTime]);

  // Start where a chart pointed, once the video has loaded.
  const startedFor = useRef<number | null>(null);
  useEffect(() => {
    if (!startAt || startedFor.current === startAt.nonce || status !== "readyToPlay") return;
    startedFor.current = startAt.nonce;
    setPass("both");
    player.currentTime = startAt.ms / 1000;
    setSeekedMs(startAt.ms);
    player.play();
  }, [startAt, status, player]);

  useEffect(() => {
    player.muted = pass === "watch";
    // The listen pass follows the words, so it wants finer position updates;
    // the picture passes only need the native controls.
    player.timeUpdateEventInterval = pass === "listen" ? 0.1 : 0.25;
  }, [player, pass, sessionId]);

  useEffect(() => {
    player.playbackRate = rate;
  }, [player, rate]);

  // A pass counts as done once it has been played to the end.
  useEffect(() => {
    const sub = player.addListener("playToEnd", () => {
      setCompleted((prev) => new Set(prev).add(pass));
      markReviewPass(sessionId, pass).catch(() => undefined);
    });
    return () => sub.remove();
  }, [player, pass]);

  function selectPass(next: Pass) {
    setPass(next);
    player.currentTime = 0;
    setSeekedMs(0);
    player.pause();
  }

  // The listen pass hides the picture — and with it the native controls —
  // so it gets the shared playback panel: play, scrub, follow the words.
  const durationMs = Math.round((player.duration || 0) * 1000);
  const transport: PlaybackTransport = {
    positionMs: seekedMs ?? currentTime * 1000,
    durationMs,
    playing: isPlaying,
    togglePlay() {
      if (isPlaying) {
        player.pause();
        return;
      }
      if (atEnd(player.currentTime * 1000, durationMs)) {
        player.currentTime = 0;
        setSeekedMs(0);
      }
      player.play();
    },
    seek(ms, options) {
      const target = clampMs(ms, durationMs || ms);
      player.currentTime = target / 1000;
      setSeekedMs(target);
      if (options?.play && !isPlaying) player.play();
    },
  };

  const info = PASSES.find((p) => p.key === pass)!;

  return (
    <View style={styles.container}>
      <View style={styles.passRow}>
        {PASSES.map((p) => {
          const selected = p.key === pass;
          return (
            <Pressable
              key={p.key}
              onPress={() => selectPass(p.key)}
              style={[styles.passChip, selected && styles.passChipSelected]}
              accessibilityRole="button"
              accessibilityState={{ selected }}
            >
              <Ionicons
                name={completed.has(p.key) ? "checkmark-circle" : p.icon}
                size={16}
                color={completed.has(p.key) ? colors.success : selected ? colors.onAccent : colors.textSecondary}
              />
              <Text style={[styles.passChipText, selected && styles.passChipTextSelected]}>{p.label}</Text>
            </Pressable>
          );
        })}
      </View>

      <View style={[styles.videoWrap, pass === "listen" && styles.listenWrap]}>
        {/* The video stays mounted (and audible) under the opaque panel in
            the listen pass — unmounting it would stop playback on some
            platforms. */}
        <VideoView
          style={pass === "listen" ? styles.videoHidden : styles.video}
          player={player}
          nativeControls={pass !== "listen"}
          contentFit="contain"
          importantForAccessibility={pass === "listen" ? "no-hide-descendants" : "auto"}
          accessibilityElementsHidden={pass === "listen"}
        />
        {pass === "listen" ? (
          <View style={styles.listenPanel}>
            <PlaybackPanel
              transport={transport}
              words={transcriptWords}
              fallbackText={transcriptText ?? "Listening only — no picture."}
              background={colors.surface}
            />
          </View>
        ) : null}
      </View>

      <View style={styles.footer}>
        <Text style={styles.focus}>{info.focus}</Text>
        <View style={styles.rateRow}>
          {RATES.map((r) => (
            <Pressable key={r} onPress={() => setRate(r)} style={[styles.rateChip, r === rate && styles.rateChipSelected]}>
              <Text style={[styles.rateText, r === rate && styles.rateTextSelected]}>{r}×</Text>
            </Pressable>
          ))}
        </View>
      </View>
    </View>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  container: { gap: spacing.sm },
  passRow: { flexDirection: "row", gap: spacing.xs },
  passChip: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingVertical: spacing.sm,
    borderRadius: radii.pill,
    backgroundColor: colors.surfaceRaised,
  },
  passChipSelected: { backgroundColor: colors.accent },
  passChipText: { color: colors.textSecondary, fontSize: typography.caption, ...font("600") },
  passChipTextSelected: { color: colors.onAccent },
  videoWrap: { borderRadius: radii.lg, overflow: "hidden", backgroundColor: "black" },
  video: { width: "100%", height: 360 },
  // The listen pass sizes to its panel; the video sits hidden behind it.
  listenWrap: { backgroundColor: colors.surface },
  videoHidden: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, opacity: 0 },
  listenPanel: { padding: spacing.md, backgroundColor: colors.surface },
  footer: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  focus: { ...font("400"), flex: 1, color: colors.textSecondary, fontSize: typography.caption, lineHeight: 17 },
  rateRow: { flexDirection: "row", gap: 4 },
  rateChip: { paddingHorizontal: spacing.sm, paddingVertical: 4, borderRadius: radii.pill, backgroundColor: colors.surfaceRaised },
  rateChipSelected: { backgroundColor: colors.accentMuted },
  rateText: { color: colors.textMuted, fontSize: typography.caption, ...font("600") },
  rateTextSelected: { color: colors.accent },
}));
