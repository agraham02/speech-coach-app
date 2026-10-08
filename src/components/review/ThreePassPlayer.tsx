import { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useEvent } from "expo";
import { useVideoPlayer, VideoView } from "expo-video";
import type { TranscriptWord } from "../../domain/sessionTypes";
import { radii, spacing, typography } from "../../theme/theme";
import { makeStyles, useTheme } from "../../theme/ThemeProvider";
import { getReviewPasses, markReviewPass } from "../../services/db/progressRepo";

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
}: {
  sessionId: string;
  videoUri: string;
  transcriptWords: TranscriptWord[] | null;
  transcriptText: string | null;
}) {
  const styles = useStyles();
  const { colors } = useTheme();
  const [pass, setPass] = useState<Pass>("watch");
  const [rate, setRate] = useState(1);
  const [completed, setCompleted] = useState<Set<Pass>>(new Set());

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

  useEffect(() => {
    player.muted = pass === "watch";
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
    player.pause();
  }

  const currentMs = currentTime * 1000;
  const activeWordIndex = useMemo(() => {
    if (!transcriptWords?.length) return -1;
    return transcriptWords.findIndex((w) => currentMs >= w.startMs && currentMs < w.endMs + 150);
  }, [transcriptWords, currentMs]);

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

      <View style={styles.videoWrap}>
        <VideoView style={styles.video} player={player} nativeControls contentFit="contain" />
        {pass === "listen" ? (
          // The video stays mounted (and audible) under an opaque panel —
          // unmounting it would stop playback on some platforms.
          <View style={styles.listenPanel} pointerEvents="box-none">
            <ScrollView contentContainerStyle={styles.listenScroll}>
              {transcriptWords?.length ? (
                <Text style={styles.listenText}>
                  {transcriptWords.map((w, i) => (
                    <Text key={i} style={i === activeWordIndex ? styles.listenWordActive : undefined}>
                      {w.text}{" "}
                    </Text>
                  ))}
                </Text>
              ) : (
                <Text style={styles.listenText}>{transcriptText ?? "Listening only — no picture."}</Text>
              )}
            </ScrollView>
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
  passChipText: { color: colors.textSecondary, fontSize: typography.caption, fontWeight: "600" },
  passChipTextSelected: { color: colors.onAccent },
  videoWrap: { borderRadius: radii.lg, overflow: "hidden", backgroundColor: "black" },
  video: { width: "100%", height: 360 },
  listenPanel: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 64, // leave the native controls reachable
    backgroundColor: colors.surface,
  },
  listenScroll: { padding: spacing.md },
  listenText: { color: colors.textSecondary, fontSize: typography.bodyLarge, lineHeight: 26 },
  listenWordActive: { color: colors.textPrimary, fontWeight: "700", backgroundColor: colors.accentMuted },
  footer: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  focus: { flex: 1, color: colors.textSecondary, fontSize: typography.caption, lineHeight: 17 },
  rateRow: { flexDirection: "row", gap: 4 },
  rateChip: { paddingHorizontal: spacing.sm, paddingVertical: 4, borderRadius: radii.pill, backgroundColor: colors.surfaceRaised },
  rateChipSelected: { backgroundColor: colors.accentMuted },
  rateText: { color: colors.textMuted, fontSize: typography.caption, fontWeight: "600" },
  rateTextSelected: { color: colors.accent },
}));
