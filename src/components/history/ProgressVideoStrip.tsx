import { useEffect } from "react";
import { FlatList, Pressable, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useVideoPlayer, VideoView } from "expo-video";
import type { SessionWithScore } from "../../services/db/sessionsRepo";
import { resolveVideoUri } from "../../services/storage/videoStorage";
import { colorForScore } from "../result/scoreColor";
import { radii, spacing, typography } from "../../theme/theme";
import { makeStyles, useTheme } from "../../theme/ThemeProvider";

// Progress videos (one kept per month, or pinned by hand) as a row of
// still frames — a visual timeline of how you've changed on camera.
export function ProgressVideoStrip({ sessions, onOpen }: { sessions: SessionWithScore[]; onOpen: (session: SessionWithScore) => void }) {
  const styles = useStyles();
  if (!sessions.length) return null;
  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>PROGRESS VIDEOS</Text>
      <FlatList
        horizontal
        data={sessions}
        keyExtractor={(s) => s.id}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
        // Each card holds a video player, so only a few are mounted at once.
        initialNumToRender={4}
        windowSize={3}
        renderItem={({ item }) => <ProgressVideoCard session={item} onPress={() => onOpen(item)} />}
      />
    </View>
  );
}

function ProgressVideoCard({ session, onPress }: { session: SessionWithScore; onPress: () => void }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const date = new Date(session.recordedAt);
  const label = date.toLocaleDateString(undefined, { month: "short", year: "numeric" });
  return (
    <Pressable onPress={onPress} style={styles.card} accessibilityRole="button" accessibilityLabel={`Progress video from ${label}`}>
      <StillFrame uri={resolveVideoUri(session)} />
      <View style={styles.overlay}>
        <Text style={styles.month}>{label}</Text>
        {session.overallScore != null ? (
          <Text style={[styles.score, { color: colorForScore(session.overallScore, colors) }]}>{session.overallScore}</Text>
        ) : null}
      </View>
      <View style={styles.play}>
        <Ionicons name="play" size={14} color="white" />
      </View>
    </Pressable>
  );
}

// A paused, muted player showing a frame a second in (the very first frame
// is often black or mid-blink). No native thumbnail module needed.
function StillFrame({ uri }: { uri: string }) {
  const styles = useStyles();
  const player = useVideoPlayer(uri, (p) => {
    p.muted = true;
    p.loop = false;
  });
  useEffect(() => {
    const sub = player.addListener("statusChange", ({ status }) => {
      if (status === "readyToPlay" && player.currentTime < 0.5) player.currentTime = 1;
    });
    return () => sub.remove();
  }, [player]);
  return <VideoView player={player} style={styles.video} contentFit="cover" nativeControls={false} pointerEvents="none" />;
}

const CARD_WIDTH = 96;
const CARD_HEIGHT = 136;

const useStyles = makeStyles(({ colors }) => ({
  wrap: { gap: spacing.xs, marginBottom: spacing.md },
  label: { color: colors.textMuted, fontSize: typography.caption - 1, fontWeight: "700", letterSpacing: 1 },
  row: { gap: spacing.sm },
  card: { width: CARD_WIDTH, height: CARD_HEIGHT, borderRadius: radii.md, overflow: "hidden", backgroundColor: "black" },
  video: { width: CARD_WIDTH, height: CARD_HEIGHT },
  overlay: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: spacing.xs,
    paddingVertical: 4,
    backgroundColor: "rgba(0,0,0,0.55)",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  month: { color: "white", fontSize: typography.caption - 1, fontWeight: "700" },
  score: { fontSize: typography.caption, fontWeight: "800" },
  play: {
    position: "absolute",
    top: 6,
    right: 6,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.45)",
  },
}));
