import { View } from "react-native";
import { Card } from "../common/Card";
import { Txt } from "../common/Txt";
import { PrimaryButton } from "../common/PrimaryButton";
import { Badge } from "../common/Badge";
import { conversationMinutesLine } from "../../domain/aiAllowance";
import { FOCUS_COPY, type LiveFocus } from "../../domain/conversation/live/prepareLive";
import { useAccount } from "../../services/account/accountStore";
import { liveGateNow } from "../../services/conversation/liveGate";
import { makeStyles, useTheme } from "../../theme/ThemeProvider";

// Under a Conversation lesson's practice steps: the same move, in a live
// conversation. Not a step, so a lesson never waits on it.
//
// With Plus (or the trial, or in beta): a plain way in. Without: one calm
// line on what Plus adds and a way to see what it is; never an alert, never a
// countdown. Under 18 or switched off: nothing at all (there's nothing to
// offer), and the lesson is complete without it.
export function LiveConversationCard({ focus, onOpen }: { focus: LiveFocus; onOpen: () => void }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const account = useAccount();
  const gate = liveGateNow();
  if (!gate.open && (gate.reason === "age_gate" || gate.reason === "kill_switch")) return null;
  const locked = !gate.open && gate.locked;
  const usedUp = !gate.open && !gate.locked && gate.reason === "quota";
  const minutes = conversationMinutesLine(account.allowance);
  return (
    <Card style={styles.card}>
      <View style={styles.head}>
        <Txt variant="headline" style={styles.flex}>
          Try it in a live conversation
        </Txt>
        {locked ? <Badge label="Tono Plus" fg={colors.skill.conversation.fg} bg={colors.skill.conversation.bg} /> : null}
      </View>
      <Txt variant="footnote" tone="secondary">
        {locked
          ? "A partner who talks back in a natural voice and answers what you actually said, for a few turns, then a short look at your moves. The drills above are yours either way."
          : `${FOCUS_COPY[focus].title}: a few turns with a partner who answers what you say, in a natural voice. A real back-and-forth, scored only on the moves you make.`}
      </Txt>
      {minutes && !locked ? (
        <Txt variant="caption1" tone="muted">
          {minutes}
        </Txt>
      ) : null}
      <PrimaryButton label={locked ? "See what it is" : "Talk it through"} variant={locked ? "ghost" : "secondary"} size="md" disabled={usedUp} onPress={onOpen} />
    </Card>
  );
}

const useStyles = makeStyles((t) => ({
  card: { gap: t.space.sm },
  head: { flexDirection: "row", alignItems: "center", gap: t.space.sm },
  flex: { flex: 1 },
}));
