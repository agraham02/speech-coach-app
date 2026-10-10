import { useCallback, useState } from "react";
import { Alert, Pressable, ScrollView, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../navigation";
import { ScreenContainer } from "../components/common/ScreenContainer";
import { Header } from "../components/common/Header";
import { Card } from "../components/common/Card";
import { Txt } from "../components/common/Txt";
import { EmptyState } from "../components/common/EmptyState";
import { PrimaryButton } from "../components/common/PrimaryButton";
import { showGlobalToast } from "../components/common/ToastProvider";
import { deleteEvent, getEventBlankMoments, getEventHistory, type BlankMoment, type SocialEvent } from "../services/db/socialRepo";
import { logger } from "../utils/logger";
import { makeStyles, useTheme } from "../theme/ThemeProvider";

type Props = NativeStackScreenProps<RootStackParamList, "ConversationLog">;

function formatWhen(iso: string): string {
  const d = new Date(iso);
  return `${d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })} · ${d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`;
}

// Every Prime and Debrief, newest first. Read-only on purpose (see
// DebriefScreen on not replaying conversations over and over) — the one
// action is deleting an entry, e.g. a test or something you'd rather not keep.
export function ConversationLogScreen({ navigation }: Props) {
  const styles = useStyles();
  const [events, setEvents] = useState<SocialEvent[] | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  const load = useCallback(() => {
    getEventHistory()
      .then(setEvents)
      .catch((error) => {
        logger.error(`[conversation-log] load failed — ${(error as Error).message}`);
        setEvents([]);
      });
  }, []);
  useFocusEffect(load);

  function confirmDelete(event: SocialEvent) {
    Alert.alert(
      "Delete this entry?",
      "It's removed from the log and your predicted-vs-actual stats, along with any blanked moments saved for replay.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              await deleteEvent(event.id);
              setEvents((prev) => prev?.filter((e) => e.id !== event.id) ?? prev);
              showGlobalToast("Deleted", "success");
            } catch (error) {
              logger.error(`[conversation-log] delete failed — ${(error as Error).message}`);
              showGlobalToast("Couldn't delete that — try again", "error");
            }
          },
        },
      ],
    );
  }

  return (
    <ScreenContainer style={styles.container}>
      <Header eyebrow="Conversations" title="Conversation log" onBack={() => navigation.goBack()} />
      {events && events.length === 0 ? (
        <EmptyState
          icon="chatbubbles-outline"
          title="Nothing here yet"
          body="Prime a conversation before you head out, or debrief one afterwards — they'll show up here."
        />
      ) : (
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          {(events ?? []).map((event) => (
            <EventCard
              key={event.id}
              event={event}
              open={openId === event.id}
              onToggle={() => setOpenId(openId === event.id ? null : event.id)}
              onDelete={() => confirmDelete(event)}
              onDebrief={() => navigation.navigate("Debrief", { eventId: event.id })}
            />
          ))}
        </ScrollView>
      )}
    </ScreenContainer>
  );
}

function EventCard({
  event,
  open,
  onToggle,
  onDelete,
  onDebrief,
}: {
  event: SocialEvent;
  open: boolean;
  onToggle: () => void;
  onDelete: () => void;
  onDebrief: () => void;
}) {
  const styles = useStyles();
  const { colors } = useTheme();
  const [blanks, setBlanks] = useState<BlankMoment[]>([]);
  const debriefed = event.completedAt != null;
  const title = event.label ?? (debriefed ? "Conversation" : "Primed conversation");

  function toggle() {
    if (!open) getEventBlankMoments(event.id).then(setBlanks).catch(() => setBlanks([]));
    onToggle();
  }

  return (
    <Card style={styles.card}>
      <View style={styles.row}>
        <Pressable
          onPress={toggle}
          style={styles.flex}
          accessibilityRole="button"
          accessibilityState={{ expanded: open }}
          accessibilityLabel={`${title}, ${debriefed ? "debriefed" : "primed"}`}
        >
          <Txt variant="headline">{title}</Txt>
          <Txt variant="footnote" tone="secondary">
            {formatWhen(event.completedAt ?? event.createdAt)} · {debriefed ? "Debriefed" : "Primed"}
          </Txt>
          {event.predictedAwkward != null || event.actualAwkward != null ? (
            <Txt variant="footnote" tone="muted">
              Awkward: {event.predictedAwkward != null ? `expected ${event.predictedAwkward}` : ""}
              {event.predictedAwkward != null && event.actualAwkward != null ? " → " : ""}
              {event.actualAwkward != null ? `actually ${event.actualAwkward}` : ""}
            </Txt>
          ) : null}
        </Pressable>
        <Pressable onPress={onDelete} hitSlop={12} accessibilityRole="button" accessibilityLabel={`Delete ${title}`}>
          <Ionicons name="trash-outline" size={20} color={colors.textSecondary} />
        </Pressable>
      </View>

      {open ? (
        <View style={styles.details}>
          {event.outwardGoal ? <Detail label="Goal" text={event.outwardGoal} /> : null}
          {event.topics.length ? <Detail label="Topics" text={event.topics.join(" · ")} /> : null}
          {event.questions.length ? <Detail label="Questions" text={event.questions.join("\n")} /> : null}
          {event.debrief?.wentOkay ? <Detail label="Went okay" text={event.debrief.wentOkay} /> : null}
          {event.debrief?.tryNext ? <Detail label="Try next time" text={event.debrief.tryNext} /> : null}
          {event.debrief?.positiveSign ? <Detail label="Sign they enjoyed it" text={event.debrief.positiveSign} /> : null}
          {blanks.length ? <Detail label="Blanked on" text={blanks.map((b) => `“${b.text}”`).join("\n")} /> : null}
          {!debriefed ? <PrimaryButton label="Debrief it" variant="secondary" onPress={onDebrief} /> : null}
        </View>
      ) : null}
    </Card>
  );
}

function Detail({ label, text }: { label: string; text: string }) {
  return (
    <View>
      <Txt variant="caption2" tone="muted" uppercase>
        {label}
      </Txt>
      <Txt variant="subhead">{text}</Txt>
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  container: { gap: t.space.md },
  scroll: { gap: t.space.md, paddingBottom: t.space.xl },
  card: { gap: t.space.sm },
  row: { flexDirection: "row", alignItems: "flex-start", gap: t.space.md },
  flex: { flex: 1, gap: 2 },
  details: { gap: t.space.sm, paddingTop: t.space.xs },
}));
