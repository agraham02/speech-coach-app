import { useEffect } from "react";
import { useClipPlayback } from "../../hooks/useClipPlayback";
import { PlaybackPanel } from "../playback/PlaybackPanel";
import { Card } from "../common/Card";
import { Txt } from "../common/Txt";
import { showGlobalToast } from "../common/ToastProvider";
import { makeStyles, useTheme } from "../../theme/ThemeProvider";
import type { TranscriptWord } from "../../domain/sessionTypes";

// Listen back to a Rewind with the words following along. Its own component
// so the ten-a-second position updates re-render this card, not the whole
// result screen.
export function RewindPlayer({
  uri,
  durationSeconds,
  words,
  transcript,
  live,
}: {
  uri: string;
  durationSeconds: number;
  words: TranscriptWord[] | null;
  transcript: string;
  // The live recognizer wrote the words, not Whisper.
  live: boolean;
}) {
  const styles = useStyles();
  const { colors } = useTheme();
  const playback = useClipPlayback(uri, durationSeconds * 1000);

  useEffect(() => {
    if (playback.failed) showGlobalToast("Couldn't play that back.", "error");
  }, [playback.failed]);

  return (
    <Card style={styles.card}>
      <Txt variant="headline">Listen back</Txt>
      <PlaybackPanel
        transport={playback}
        words={words}
        fallbackText={transcript || null}
        background={colors.surface}
        note={live ? "Written as you spoke, so it may be rougher than usual." : null}
      />
    </Card>
  );
}

const useStyles = makeStyles((t) => ({
  card: { gap: t.space.sm + 2 },
}));
