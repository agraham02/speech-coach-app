import { useCallback, useEffect, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../navigation";
import { ScreenContainer } from "../components/common/ScreenContainer";
import { Card } from "../components/common/Card";
import { Badge } from "../components/common/Badge";
import { getAllSessions } from "../services/db/sessionsRepo";
import { getPrompt } from "../services/db/promptsRepo";
import { subscribeToAllSessions } from "../services/pipeline/processingEvents";
import type { Session } from "../domain/sessionTypes";
import { formatDuration } from "../utils/dateUtils";
import { colors, spacing, typography } from "../theme/theme";

const STATUS_META: Record<Session["status"], { label: string; color: string; icon: keyof typeof Ionicons.glyphMap }> = {
  recording: { label: "Recording", color: colors.textMuted, icon: "radio-button-on-outline" },
  processing: { label: "Processing", color: colors.accent, icon: "sync-outline" },
  done: { label: "Done", color: colors.success, icon: "checkmark-circle-outline" },
  error: { label: "Failed", color: colors.danger, icon: "alert-circle-outline" },
};

function formatSessionDate(isoDatetime: string): string {
  const date = new Date(isoDatetime);
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" }) +
    " · " +
    date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

export function HistoryScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [sessions, setSessions] = useState<Session[]>([]);

  const refresh = useCallback(() => {
    getAllSessions().then(setSessions);
  }, []);

  useFocusEffect(refresh);

  useEffect(() => subscribeToAllSessions(() => refresh()), [refresh]);

  function openSession(session: Session) {
    const prompt = getPrompt(session.promptId);
    if (!prompt) return;

    if (session.status === "done") {
      navigation.navigate("Result", { sessionId: session.id });
    } else {
      navigation.navigate("Processing", {
        sessionId: session.id,
        prompt,
        videoUri: session.videoPath,
        durationSecondsLocal: session.durationSeconds,
      });
    }
  }

  return (
    <ScreenContainer style={styles.container}>
      <Text style={styles.title}>History</Text>
      {sessions.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="time-outline" size={40} color={colors.textMuted} />
          <Text style={styles.emptyText}>No sessions yet — your recordings will show up here.</Text>
        </View>
      ) : (
        <FlatList
          data={sessions}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => {
            const prompt = getPrompt(item.promptId);
            const status = STATUS_META[item.status];
            return (
              <Pressable onPress={() => openSession(item)}>
                <Card style={styles.row}>
                  <View style={styles.rowTop}>
                    {prompt ? <Badge label={prompt.category} /> : null}
                    <View style={styles.statusPill}>
                      <Ionicons name={status.icon} size={14} color={status.color} />
                      <Text style={[styles.statusText, { color: status.color }]}>{status.label}</Text>
                    </View>
                  </View>
                  <Text style={styles.promptText} numberOfLines={2}>
                    {prompt?.text ?? "Unknown prompt"}
                  </Text>
                  <View style={styles.rowBottom}>
                    <Text style={styles.metaText}>{formatSessionDate(item.recordedAt)}</Text>
                    <Text style={styles.metaText}>{formatDuration(item.durationSeconds)}</Text>
                  </View>
                </Card>
              </Pressable>
            );
          }}
        />
      )}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.md },
  title: { color: colors.textPrimary, fontSize: typography.title, fontWeight: "700" },
  list: { gap: spacing.md, paddingBottom: spacing.lg },
  row: { gap: spacing.sm },
  rowTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  statusPill: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  statusText: { fontSize: typography.caption, fontWeight: "700" },
  promptText: { color: colors.textPrimary, fontSize: typography.bodyLarge, fontWeight: "600" },
  rowBottom: { flexDirection: "row", justifyContent: "space-between" },
  metaText: { color: colors.textMuted, fontSize: typography.caption },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", gap: spacing.md },
  emptyText: { color: colors.textMuted, fontSize: typography.body, textAlign: "center", paddingHorizontal: spacing.xl },
});
