import { ActivityIndicator, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { TranscriptWord } from "../../domain/sessionTypes";
import { hasUsableTimings, nextRate, rateLabel } from "../../domain/playback/followAlong";
import { FollowAlongTranscript } from "./FollowAlongTranscript";
import { Scrubber } from "./Scrubber";
import { PressableScale } from "../common/PressableScale";
import { Txt } from "../common/Txt";
import { makeStyles, useTheme } from "../../theme/ThemeProvider";

const SKIP_BACK_MS = 10_000;

// Whatever is playing, as the panel needs it. The Rewind player (a WAV
// through react-native-audio-api) and the impromptu listen pass (expo-video)
// each adapt their player to this.
export interface PlaybackTransport {
  positionMs: number;
  durationMs: number;
  playing: boolean;
  loading?: boolean;
  togglePlay: () => void;
  seek: (ms: number, options?: { play?: boolean }) => void;
  // Leave out to hide the speed control (the owner shows its own).
  rate?: number;
  setRate?: (rate: number) => void;
}

interface PlaybackPanelProps {
  transport: PlaybackTransport;
  words: TranscriptWord[] | null;
  // The transcript to show still when there are no word timings.
  fallbackText: string | null;
  // The surface the panel sits on, for the transcript's fades.
  background: string;
  // A line under the controls (where the words came from, and so on).
  note?: string | null;
}

// Listen back with the words: a follow-along transcript (tap a word to jump
// there), a scrubber, and play, back ten seconds and speed. Shared by the
// Rewind result and the impromptu Listen pass.
export function PlaybackPanel({ transport, words, fallbackText, background, note }: PlaybackPanelProps) {
  const styles = useStyles();
  const { colors } = useTheme();
  const { positionMs, durationMs, playing, loading, rate, setRate, togglePlay, seek } = transport;
  const timed = hasUsableTimings(words, durationMs) ? words : null;
  const missingTimings = !timed && !!fallbackText;

  return (
    <View style={styles.panel}>
      <FollowAlongTranscript
        words={timed}
        fallbackText={fallbackText}
        positionMs={positionMs}
        started={playing || positionMs > 0}
        onSeek={(ms) => seek(ms, { play: true })}
        background={background}
      />

      <Scrubber positionMs={positionMs} durationMs={durationMs} onSeek={(ms) => seek(ms)} />

      <View style={styles.controls}>
        <View style={styles.side}>
          <PressableScale
            onPress={() => seek(Math.max(0, positionMs - SKIP_BACK_MS))}
            style={styles.small}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Back 10 seconds"
          >
            <Ionicons name="play-back" size={18} color={colors.textPrimary} />
          </PressableScale>
        </View>

        <PressableScale
          onPress={togglePlay}
          style={styles.play}
          haptic="tick"
          accessibilityRole="button"
          accessibilityLabel={playing ? "Pause" : "Play"}
        >
          {loading ? (
            <ActivityIndicator color={colors.onAccent} />
          ) : (
            <Ionicons name={playing ? "pause" : "play"} size={26} color={colors.onAccent} style={playing ? undefined : styles.playIcon} />
          )}
        </PressableScale>

        <View style={[styles.side, styles.sideEnd]}>
          {rate != null && setRate ? (
            <PressableScale
              onPress={() => setRate(nextRate(rate))}
              style={styles.rate}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={`Speed ${rate} times`}
              accessibilityHint="Changes the playback speed"
            >
              <Txt variant="footnote" weight="600" tabular>
                {rateLabel(rate)}
              </Txt>
            </PressableScale>
          ) : null}
        </View>
      </View>

      {missingTimings || note ? (
        <Txt variant="caption1" tone="muted" align="center">
          {[missingTimings ? "No word timings for this transcript, so it doesn't follow along." : "", note ?? ""].filter(Boolean).join(" ")}
        </Txt>
      ) : null}
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  panel: { gap: t.space.sm + 2 },
  controls: { flexDirection: "row", alignItems: "center" },
  side: { flex: 1, flexDirection: "row" },
  sideEnd: { justifyContent: "flex-end" },
  small: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: t.colors.accentMuted,
  },
  play: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: t.colors.accent,
  },
  // The play triangle's weight sits left of its box; nudge it to look centered.
  playIcon: { marginLeft: 3 },
  rate: {
    minWidth: 48,
    height: 32,
    paddingHorizontal: 10,
    borderRadius: t.radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: t.colors.accentMuted,
  },
}));
