import { useCallback, useState } from "react";
import { Pressable, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import * as Haptics from "expo-haptics";
import type { RootStackParamList } from "../../navigation";
import { Card } from "../common/Card";
import { Txt } from "../common/Txt";
import { ListRow } from "../common/ListRow";
import { missionsForDate } from "../../domain/conversation/realWorld";
import { getMissionProgress, logMission, resetMission, type MissionProgress } from "../../services/db/missionsRepo";
import { getBlankMoments, getOpenEvents, type SocialEvent } from "../../services/db/socialRepo";
import { todayISODate } from "../../utils/dateUtils";
import { logger } from "../../utils/logger";
import { makeStyles, useTheme } from "../../theme/ThemeProvider";

// Today's real-world side of the Conversation skill: two tiny missions,
// Prime before an event / Debrief after, and replaying moments you blanked.
export function ConversationTodayCard() {
  const styles = useStyles();
  const { colors } = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const date = todayISODate();
  const missions = missionsForDate(date);
  const [progress, setProgress] = useState<Record<string, MissionProgress>>({});
  const [openEvents, setOpenEvents] = useState<SocialEvent[]>([]);
  const [blankCount, setBlankCount] = useState(0);

  useFocusEffect(
    useCallback(() => {
      getMissionProgress(date).then(setProgress).catch(() => setProgress({}));
      getOpenEvents().then(setOpenEvents).catch(() => setOpenEvents([]));
      getBlankMoments()
        .then((b) => setBlankCount(b.length))
        .catch(() => setBlankCount(0));
    }, [date]),
  );

  async function tap(missionId: string, target: number) {
    Haptics.selectionAsync().catch(() => undefined);
    try {
      const p = await logMission(date, missionId, target);
      setProgress((prev) => ({ ...prev, [missionId]: p }));
    } catch (error) {
      logger.error(`[missions] log failed — ${(error as Error).message}`);
    }
  }

  async function reset(missionId: string) {
    await resetMission(date, missionId).catch(() => undefined);
    setProgress((prev) => {
      const next = { ...prev };
      delete next[missionId];
      return next;
    });
  }

  const open = openEvents[0];
  const c = colors.skill.conversation;

  return (
    <Card style={styles.card}>
      <View style={styles.header}>
        <Txt variant="caption2" tone="muted" uppercase>
          Conversations
        </Txt>
        <Txt variant="caption1" tone="muted">
          Today's missions
        </Txt>
      </View>
      {missions.map((m) => {
        const p = progress[m.id];
        const count = p?.count ?? 0;
        const done = count >= m.target;
        return (
          <Pressable
            key={m.id}
            onPress={() => (done ? undefined : tap(m.id, m.target))}
            onLongPress={() => reset(m.id)}
            style={({ pressed }) => [styles.mission, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel={`${m.text} ${done ? "done" : m.target > 1 ? `${count} of ${m.target}` : "not done yet"}. Long press to undo.`}
          >
            <Ionicons name={done ? "checkmark-circle" : "ellipse-outline"} size={22} color={done ? colors.success : c.fg} />
            <Txt variant="callout" tone={done ? "muted" : "primary"} style={styles.flex}>
              {m.text}
            </Txt>
            {m.target > 1 && !done ? (
              <Txt variant="footnote" tone="muted">
                {count}/{m.target}
              </Txt>
            ) : null}
          </Pressable>
        );
      })}
      <View style={styles.links}>
        {open ? (
          <ListRow
            icon="chatbubble-ellipses-outline"
            iconColor={c.fg}
            iconBackground={c.bg}
            title="How did it go?"
            subtitle={`Debrief${open.label ? ` · ${open.label}` : ""}`}
            chevron
            onPress={() => navigation.navigate("Debrief", { eventId: open.id })}
          />
        ) : (
          <ListRow
            icon="sparkles-outline"
            iconColor={c.fg}
            iconBackground={c.bg}
            title="Heading out?"
            subtitle="Prime it — about a minute"
            chevron
            onPress={() => navigation.navigate("Prime")}
          />
        )}
        {!open ? (
          <ListRow icon="create-outline" iconColor={c.fg} iconBackground={c.bg} title="Debrief a conversation" chevron onPress={() => navigation.navigate("Debrief")} />
        ) : null}
        {blankCount > 0 ? (
          <ListRow
            icon="refresh-outline"
            iconColor={c.fg}
            iconBackground={c.bg}
            title="Replay a moment you blanked"
            subtitle={`${blankCount} saved`}
            chevron
            onPress={() => navigation.navigate("Conversation", { drill: "conv_replay" })}
          />
        ) : null}
      </View>
    </Card>
  );
}

const useStyles = makeStyles((t) => ({
  card: { gap: t.space.sm },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  mission: { flexDirection: "row", alignItems: "center", gap: t.space.md, minHeight: 44 },
  pressed: { opacity: 0.6 },
  flex: { flex: 1 },
  links: { marginTop: t.space.xs },
}));
