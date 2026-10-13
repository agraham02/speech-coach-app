import { Pressable, ScrollView, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { ScreenContainer } from "../common/ScreenContainer";
import { Card } from "../common/Card";
import { Txt } from "../common/Txt";
import { Chip } from "../common/Chip";
import { PrimaryButton } from "../common/PrimaryButton";
import { VideoPlayback } from "../result/VideoPlayback";
import { feelingWordsUsed, getEmotion, MIN_FEELING_SECONDS } from "../../domain/feelings";
import type { Session } from "../../domain/sessionTypes";
import type { StepState } from "../../domain/sessionSteps";
import { formatDuration } from "../../utils/dateUtils";
import { makeStyles, useTheme } from "../../theme/ThemeProvider";

interface Props {
  session: Session;
  steps: StepState[];
  hasVideo: boolean;
  videoUri: string;
  onDone: () => void;
  onDelete: () => void;
}

// A Feeling of the Week rep, after. No score, no chart, no coaching — just
// what you did: how long you talked, and the feeling words you reached for.
export function FeelingResultView({ session, steps, hasVideo, videoUri, onDone, onDelete }: Props) {
  const styles = useStyles();
  const { colors } = useTheme();
  const emotion = session.subjectExtras?.feelingEmotion ? getEmotion(session.subjectExtras.feelingEmotion) : null;
  const transcribing = steps.some((s) => s.step === "transcribe" && (s.status === "pending" || s.status === "running"));
  const words = session.transcriptVerbatim ? feelingWordsUsed(session.transcriptVerbatim) : [];
  const longEnough = session.durationSeconds >= MIN_FEELING_SECONDS;

  return (
    <ScreenContainer style={styles.container}>
      <View style={styles.header}>
        <View style={styles.flex}>
          <Txt variant="caption2" tone="muted" uppercase>
            Feeling of the week{emotion ? ` · ${emotion.label}` : ""}
          </Txt>
          <Txt variant="title2">You put it into words.</Txt>
        </View>
        <Pressable onPress={onDelete} hitSlop={12} accessibilityRole="button" accessibilityLabel="Delete session">
          <Ionicons name="trash-outline" size={22} color={colors.textSecondary} />
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Card style={styles.card}>
          <View style={styles.row}>
            <Ionicons name={longEnough ? "checkmark-circle" : "time-outline"} size={22} color={longEnough ? colors.success : colors.textSecondary} />
            <Txt variant="headline" style={styles.flex}>
              You talked for {formatDuration(session.durationSeconds)}
            </Txt>
          </View>
          <Txt variant="subhead" tone="secondary">
            {longEnough ? "That's a real stretch of saying how something felt — the hard part." : "Short still counts. Next time, try staying with it a little longer."}
          </Txt>
        </Card>

        <Card style={styles.card}>
          <Txt variant="headline">Feeling words you used</Txt>
          {transcribing ? (
            <Txt variant="subhead" tone="secondary">
              Listening back…
            </Txt>
          ) : words.length ? (
            <View style={styles.chips}>
              {words.map((w) => (
                <Chip key={w} label={w} background={colors.skill.conversation.bg} color={colors.skill.conversation.fg} />
              ))}
            </View>
          ) : (
            <Txt variant="subhead" tone="secondary">
              None that the phone caught — and that's fine. Next time, try naming the feeling out loud, as exactly as you can.
            </Txt>
          )}
        </Card>

        {hasVideo ? <VideoPlayback videoUri={videoUri} /> : null}
        <Txt variant="footnote" tone="muted">
          This stays private: it isn't scored, isn't in your stats, and won't be kept as a progress video.
        </Txt>
      </ScrollView>
      <PrimaryButton label="Done" onPress={onDone} />
    </ScreenContainer>
  );
}

const useStyles = makeStyles((t) => ({
  container: { gap: t.space.md },
  header: { flexDirection: "row", alignItems: "flex-start", gap: t.space.md },
  scroll: { gap: t.space.md, paddingBottom: t.space.lg },
  card: { gap: t.space.sm },
  row: { flexDirection: "row", alignItems: "center", gap: t.space.sm },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: t.space.sm },
  flex: { flex: 1 },
}));
