import { useEffect, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { ScreenContainer } from "../components/common/ScreenContainer";
import { clearLogs, getLogs, subscribeLogs, type LogEntry } from "../services/logs/logStore";
import { colors, spacing, typography } from "../theme/theme";

const LEVEL_COLOR: Record<LogEntry["level"], string> = {
  info: colors.textSecondary,
  warn: colors.warning,
  error: colors.danger,
};

function formatTime(isoTimestamp: string): string {
  return new Date(isoTimestamp).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function DevScreen() {
  const [logs, setLogs] = useState<LogEntry[]>(getLogs());

  useEffect(() => subscribeLogs(setLogs), []);

  return (
    <ScreenContainer style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Dev Log</Text>
        <Pressable onPress={clearLogs} hitSlop={12}>
          <Ionicons name="trash-outline" size={22} color={colors.textSecondary} />
        </Pressable>
      </View>

      {logs.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="terminal-outline" size={40} color={colors.textMuted} />
          <Text style={styles.emptyText}>
            Nothing logged yet. Record a session — every step of saving, uploading to Gemini, transcribing, and
            syncing to Notion gets logged here as it happens.
          </Text>
        </View>
      ) : (
        <FlatList
          data={logs}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => (
            <View style={styles.row}>
              <Text style={styles.time}>{formatTime(item.timestamp)}</Text>
              <Text style={[styles.message, { color: LEVEL_COLOR[item.level] }]}>{item.message}</Text>
            </View>
          )}
        />
      )}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.md },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  title: { color: colors.textPrimary, fontSize: typography.title, fontWeight: "700" },
  list: { gap: spacing.sm, paddingBottom: spacing.lg },
  row: { flexDirection: "row", gap: spacing.sm, alignItems: "flex-start" },
  time: { color: colors.textMuted, fontSize: typography.caption - 1, fontVariant: ["tabular-nums"], width: 76 },
  message: { flex: 1, fontSize: typography.caption, fontFamily: "monospace", lineHeight: 17 },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", gap: spacing.md },
  emptyText: { color: colors.textMuted, fontSize: typography.body, textAlign: "center", paddingHorizontal: spacing.xl },
});
