import { useEffect, useState } from "react";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../navigation";
import { FlatList, Pressable, Share, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { ScreenContainer } from "../components/common/ScreenContainer";
import { clearLogs, formatLogsForSharing, getLogs, subscribeLogs, type LogEntry } from "../services/logs/logStore";
import { useTabBarBottomInset } from "../hooks/useTabBarBottomInset";
import { spacing, typography, font, fontDisplay } from "../theme/theme";
import { makeStyles, useTheme } from "../theme/ThemeProvider";
import type { Colors } from "../theme/theme";

const levelColors = (colors: Colors): Record<LogEntry["level"], string> => ({
  info: colors.textSecondary,
  warn: colors.warning,
  error: colors.danger,
});

function formatTime(isoTimestamp: string): string {
  return new Date(isoTimestamp).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function DevScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const tabBarInset = useTabBarBottomInset();
  const [logs, setLogs] = useState<LogEntry[]>(getLogs());
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  useEffect(() => subscribeLogs(setLogs), []);

  return (
    <ScreenContainer style={styles.container} edges={["top", "left", "right"]}>
      <View style={styles.header}>
        <Text style={styles.title}>Dev Log</Text>
        <View style={styles.headerActions}>
          <Pressable
            onPress={() => navigation.navigate("AsrLab")}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Open ASR Lab"
          >
            <Ionicons name="flask-outline" size={22} color={colors.textSecondary} />
          </Pressable>
          <Pressable
            onPress={() => Share.share({ message: formatLogsForSharing() })}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Share logs"
          >
            <Ionicons name="share-outline" size={22} color={colors.textSecondary} />
          </Pressable>
          <Pressable onPress={clearLogs} hitSlop={12} accessibilityRole="button" accessibilityLabel="Clear logs">
            <Ionicons name="trash-outline" size={22} color={colors.textSecondary} />
          </Pressable>
        </View>
      </View>

      {logs.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="terminal-outline" size={40} color={colors.textMuted} />
          <Text style={styles.emptyText}>
            Nothing logged yet. Record a session — every step of saving, uploading to Gemini, transcribing, and
            running a deep review gets logged here as it happens.
          </Text>
        </View>
      ) : (
        <FlatList
          style={styles.list}
          data={logs}
          keyExtractor={(item) => item.id}
          contentContainerStyle={[styles.listContent, { paddingBottom: spacing.lg + tabBarInset }]}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => (
            <View style={styles.row}>
              <Text style={styles.time}>{formatTime(item.timestamp)}</Text>
              <Text style={[styles.message, { color: levelColors(colors)[item.level] }]}>{item.message}</Text>
            </View>
          )}
        />
      )}
    </ScreenContainer>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  // See TrendsScreen.tsx for why paddingBottom: 0 — overrides
  // ScreenContainer's default bottom padding, since the list's own
  // listContent already reserves end-of-content breathing room.
  container: { gap: spacing.md, paddingBottom: 0 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  headerActions: { flexDirection: "row", gap: spacing.lg },
  title: { color: colors.textPrimary, fontFamily: fontDisplay.title, fontSize: 30, lineHeight: 36, letterSpacing: -0.8 },
  list: { flex: 1 },
  listContent: { gap: spacing.sm, paddingBottom: spacing.lg },
  row: { flexDirection: "row", gap: spacing.sm, alignItems: "flex-start" },
  time: { ...font("400"), color: colors.textMuted, fontSize: typography.caption - 1, fontVariant: ["tabular-nums"], width: 76 },
  message: { flex: 1, fontSize: typography.caption, fontFamily: "monospace", lineHeight: 17 },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", gap: spacing.md },
  emptyText: { ...font("400"), color: colors.textMuted, fontSize: typography.body, textAlign: "center", paddingHorizontal: spacing.xl },
}));
