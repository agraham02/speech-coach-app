import { ActivityIndicator, View } from "react-native";
import { Card } from "../common/Card";
import { Txt } from "../common/Txt";
import { SegmentBar } from "./WorkBar";
import { etaSentence, NOTES_SECONDS, rewindSeconds } from "../../domain/analysis/progress";
import type { StepStatus } from "../../domain/sessionSteps";
import type { RewindStage } from "../../services/rewind/rewindProcessor";
import { makeStyles, useTheme } from "../../theme/ThemeProvider";

const STAGES: { key: RewindStage; label: string }[] = [
  { key: "audio", label: "Joining your recording" },
  { key: "words", label: "Writing out your words" },
  { key: "counting", label: "Counting the details" },
];

// A Rewind being listened back to: which of its three steps, roughly how long,
// what happens if you leave. `stage` null means it isn't running right now
// (the app was closed and it is about to be picked up again).
export function RewindWorkCard({ stage, talkSeconds, elapsed }: { stage: RewindStage | null; talkSeconds: number; elapsed: number }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const at = STAGES.findIndex((s) => s.key === stage);
  const statuses: StepStatus[] = STAGES.map((_, i) => (stage == null ? "pending" : i < at ? "done" : i === at ? "running" : "pending"));
  const headline = stage == null ? "Picking up where it left off" : `Step ${at + 1} of ${STAGES.length}: ${STAGES[at].label}`;
  return (
    <Card style={styles.card} accessibilityLabel={headline}>
      <View style={styles.head}>
        <ActivityIndicator size="small" color={colors.accent} />
        <Txt variant="headline" style={styles.flex}>
          {headline}
        </Txt>
      </View>
      <SegmentBar statuses={statuses} />
      <Txt variant="footnote" tone="secondary">
        {etaSentence(rewindSeconds(talkSeconds), elapsed)} On this phone.
      </Txt>
      <Txt variant="caption1" tone="muted">
        You can leave this screen. If you close the app, it picks up again next time you open it.
      </Txt>
    </Card>
  );
}

// Notes being written by Tono AI.
export function NotesWorkCard({ elapsed }: { elapsed: number }) {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <View style={styles.notes}>
      <View style={styles.head}>
        <ActivityIndicator size="small" color={colors.accent} />
        <Txt variant="headline" style={styles.flex}>
          Writing your notes
        </Txt>
      </View>
      <Txt variant="footnote" tone="secondary">
        {etaSentence(NOTES_SECONDS, elapsed)} Every quote is checked against your words first, and a draft that doesn't match is written again, which takes longer.
      </Txt>
      <Txt variant="caption1" tone="muted">
        Only the words of this take are sent. You can leave this screen; the notes will be here when you come back. If you close the app the request is lost, and the button comes back.
      </Txt>
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  card: { gap: t.space.sm + 2 },
  notes: { gap: t.space.sm },
  head: { flexDirection: "row", alignItems: "center", gap: t.space.sm + 2 },
  flex: { flex: 1 },
}));
