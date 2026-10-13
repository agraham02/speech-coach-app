import { useCallback, useState } from "react";
import { showGlobalToast } from "../common/ToastProvider";
import { Pressable, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
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
import { tick } from "../../utils/haptics";
import Animated, { ZoomIn } from "react-native-reanimated";

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

  // Optimistic: the tap shows at once (same rule as logMission), then the
  // saved value replaces it — or the old one comes back if saving fails.
  async function tap(missionId: string, target: number) {
    tick();
    const before = progress[missionId];
    const count = Math.min(target, (before?.count ?? 0) + 1);
    setProgress((prev) => ({ ...prev, [missionId]: { missionId, count, completedAt: count >= target ? (before?.completedAt ?? new Date().toISOString()) : null } }));
    try {
      const saved = await logMission(date, missionId, target);
      setProgress((prev) => ({ ...prev, [missionId]: saved }));
    } catch (error) {
      logger.error(`[missions] log failed — ${(error as Error).message}`);
      setProgress((prev) => restore(prev, missionId, before));
      showGlobalToast("Couldn't save that — try again", "error");
    }
  }

  async function reset(missionId: string) {
    const before = progress[missionId];
    setProgress((prev) => restore(prev, missionId, undefined));
    try {
      await resetMission(date, missionId);
    } catch (error) {
      logger.error(`[missions] reset failed — ${(error as Error).message}`);
      setProgress((prev) => restore(prev, missionId, before));
      showGlobalToast("Couldn't undo that — try again", "error");
    }
  }

  const open = openEvents[0];

  function restore(prev: Record<string, MissionProgress>, missionId: string, value: MissionProgress | undefined) {
    const next = { ...prev };
    if (value) next[missionId] = value;
    else delete next[missionId];
    return next;
  }
  const c = colors.skill.conversation;

  return (
    <Card style={styles.card}>
      <View style={styles.header}>
        <View style={[styles.dot, { backgroundColor: c.fg }]} />
        <Txt variant="title3" style={styles.flex}>
          Conversations
        </Txt>
        <Txt variant="footnote" tone="muted">
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
            {done ? (
              <Animated.View entering={ZoomIn.duration(240)} style={[styles.check, { backgroundColor: c.fg }]}>
                <Ionicons name="checkmark" size={14} color={colors.background} />
              </Animated.View>
            ) : (
              <View style={[styles.check, styles.checkOpen]} />
            )}
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
      <View style={styles.rule} />
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
        <ListRow
          icon="book-outline"
          iconColor={c.fg}
          iconBackground={c.bg}
          title="Conversation log"
          subtitle="Past primes and debriefs"
          chevron
          onPress={() => navigation.navigate("ConversationLog")}
        />
      </View>
    </Card>
  );
}

const useStyles = makeStyles((t) => ({
  card: { gap: t.space.xs },
  header: { flexDirection: "row", alignItems: "center", gap: t.space.sm, marginBottom: t.space.xs },
  dot: { width: 8, height: 8, borderRadius: 4 },
  mission: { flexDirection: "row", alignItems: "center", gap: t.space.md - 2, minHeight: 46 },
  check: { width: 22, height: 22, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  checkOpen: { borderWidth: 1.5, borderColor: t.colors.textMuted },
  pressed: { opacity: 0.6 },
  flex: { flex: 1 },
  rule: { height: StyleSheet.hairlineWidth, backgroundColor: t.colors.separator, marginVertical: t.space.xs },
  links: {},
}));
