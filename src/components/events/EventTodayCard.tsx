import { useCallback, useState } from "react";
import { Pressable, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../../navigation";
import { Card } from "../common/Card";
import { Txt } from "../common/Txt";
import { formatEventDate } from "../common/DatePicker";
import { bannerEvent, countdownLabel, daysAway, eventName, type BannerPick } from "../../domain/events";
import { syncEvents } from "../../services/db/eventsRepo";
import { todayISODate } from "../../utils/dateUtils";
import { logger } from "../../utils/logger";
import { makeStyles, useTheme } from "../../theme/ThemeProvider";

// The event you're speaking at next, near the top of Today: a countdown, and
// a way into the check-in that fits the moment (how you feel about it
// before, how it felt after). One event at a time, with a link to the rest.
export function EventTodayCard() {
  const styles = useStyles();
  const { colors } = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [pick, setPick] = useState<BannerPick | null>(null);

  useFocusEffect(
    useCallback(() => {
      syncEvents()
        .then((events) => setPick(bannerEvent(events, todayISODate())))
        .catch((err) => {
          logger.error(`[events] Today card failed to load — ${(err as Error).message}`);
          setPick(null);
        });
    }, []),
  );

  if (!pick) return null;
  const { event, phase, others } = pick;
  const name = eventName(event);
  const days = daysAway(event.date, todayISODate());
  const checkIn = (p: "before" | "after") => navigation.navigate("EventCheckIn", { eventId: event.id, phase: p });

  const title = phase === "today" ? `Your ${name} is today` : phase === "debrief" ? `How did your ${name} go?` : `Your ${name}`;
  const detail =
    phase === "upcoming" ? `${countdownLabel(days).replace(/^./, (c) => c.toUpperCase())} · ${formatEventDate(event.date)}` : phase === "debrief" ? `${formatEventDate(event.date)}. A couple of minutes to say how it felt.` : null;
  const focus = event.before?.focus;

  return (
    <Card onPress={() => checkIn(phase === "debrief" ? "after" : "before")} accessibilityLabel={title} style={styles.card}>
      <View style={styles.row}>
        <View style={[styles.icon, { backgroundColor: colors.accentMuted }]}>
          <Ionicons name={phase === "debrief" ? "chatbubble-ellipses-outline" : "calendar-clear-outline"} size={18} color={colors.textPrimary} />
        </View>
        <View style={styles.text}>
          <Txt variant="headline">{title}</Txt>
          {detail ? (
            <Txt variant="footnote" tone="secondary">
              {detail}
            </Txt>
          ) : null}
        </View>
        {phase !== "today" ? <Ionicons name="chevron-forward" size={18} color={colors.textMuted} /> : null}
      </View>

      {phase === "upcoming" ? (
        <Txt variant="subhead" tone={focus ? "secondary" : "accent"}>
          {focus ? `Your focus: ${focus}` : event.before ? "Checked in. Tap to update how you feel." : "How are you feeling about it?"}
        </Txt>
      ) : null}

      {phase === "today" ? (
        <View style={styles.actions}>
          {!event.before ? <Link label="Check in before" onPress={() => checkIn("before")} /> : focus ? <Txt variant="subhead" tone="secondary" style={styles.flex}>Your focus: {focus}</Txt> : null}
          <Link label="How did it go?" onPress={() => checkIn("after")} />
        </View>
      ) : null}

      {others > 0 ? <Link label={`${others} more coming up · See all`} onPress={() => navigation.navigate("Events")} quiet /> : null}
    </Card>
  );
}

function Link({ label, onPress, quiet }: { label: string; onPress: () => void; quiet?: boolean }) {
  const styles = useStyles();
  return (
    <Pressable onPress={onPress} hitSlop={8} style={styles.link} accessibilityRole="button" accessibilityLabel={label}>
      <Txt variant="subhead" weight="600" tone={quiet ? "secondary" : "accent"}>
        {label}
      </Txt>
    </Pressable>
  );
}

const useStyles = makeStyles((t) => ({
  card: { padding: t.space.md, gap: t.space.sm },
  row: { flexDirection: "row", alignItems: "center", gap: t.space.md },
  icon: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  text: { flex: 1, gap: 2 },
  actions: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: t.space.lg },
  link: { minHeight: 32, justifyContent: "center" },
  flex: { flex: 1 },
}));
