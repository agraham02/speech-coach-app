import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../navigation";
import { ScreenContainer } from "../components/common/ScreenContainer";
import { Card } from "../components/common/Card";
import { Badge } from "../components/common/Badge";
import { useToast } from "../components/common/ToastProvider";
import { FilterSheet } from "../components/history/FilterSheet";
import {
  deleteSession,
  deleteSessionVideo,
  getAllSessionsWithScores,
  type SessionWithScore,
} from "../services/db/sessionsRepo";
import { getAllPrompts, getPrompt } from "../services/db/promptsRepo";
import { FREE_RECORD_PROMPT } from "../data/topics";
import { deleteRecording } from "../services/storage/videoStorage";
import { subscribeToAllSessions } from "../services/pipeline/processingEvents";
import { sessionToRecordingSubject } from "../services/pipeline/sessionProcessor";
import { useTabBarBottomInset } from "../hooks/useTabBarBottomInset";
import { colorForScore } from "../components/result/scoreColor";
import { colorForCategory } from "../domain/categoryColor";
import type { Session } from "../domain/sessionTypes";
import { formatDuration } from "../utils/dateUtils";
import { colors, spacing, typography } from "../theme/theme";

const STATUS_META: Record<Session["status"], { label: string; color: string; icon: keyof typeof Ionicons.glyphMap }> = {
  recording: { label: "Recording", color: colors.textMuted, icon: "radio-button-on-outline" },
  processing: { label: "Processing", color: colors.accent, icon: "sync-outline" },
  done: { label: "Done", color: colors.success, icon: "checkmark-circle-outline" },
  error: { label: "Failed", color: colors.danger, icon: "alert-circle-outline" },
};

type StatusFilter = "all" | Session["status"];

const STATUS_FILTERS: { key: StatusFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "done", label: "Done" },
  { key: "processing", label: "Processing" },
  { key: "error", label: "Failed" },
];

// Free Recording is its own category (see data/topics.ts), so filtering by
// category here naturally covers "prompted vs. free" too, without needing a
// separate toggle for it.
const CATEGORY_FILTERS = ["all", ...new Set(getAllPrompts().map((p) => p.category)), FREE_RECORD_PROMPT.category];

type DurationFilter = "all" | "short" | "medium" | "long";

const DURATION_FILTERS: { key: DurationFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "short", label: "Under 2 min" },
  { key: "medium", label: "2-4 min" },
  { key: "long", label: "Over 4 min" },
];

function durationBucket(durationSeconds: number): Exclude<DurationFilter, "all"> {
  if (durationSeconds < 120) return "short";
  if (durationSeconds < 240) return "medium";
  return "long";
}

function formatSessionDate(isoDatetime: string): string {
  const date = new Date(isoDatetime);
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" }) +
    " · " +
    date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

export function HistoryScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const showToast = useToast();
  const tabBarInset = useTabBarBottomInset();
  const [sessions, setSessions] = useState<SessionWithScore[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [durationFilter, setDurationFilter] = useState<DurationFilter>("all");
  const [filterSheetVisible, setFilterSheetVisible] = useState(false);
  const hasSecondaryFilters = categoryFilter !== "all" || durationFilter !== "all";

  const refresh = useCallback(() => {
    getAllSessionsWithScores().then(setSessions);
  }, []);

  useFocusEffect(refresh);

  useEffect(() => subscribeToAllSessions(() => refresh()), [refresh]);

  async function handleRefresh() {
    setRefreshing(true);
    await getAllSessionsWithScores().then(setSessions);
    setRefreshing(false);
  }

  const filteredSessions = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return sessions.filter((session) => {
      if (statusFilter !== "all" && session.status !== statusFilter) return false;
      if (durationFilter !== "all" && durationBucket(session.durationSeconds) !== durationFilter) return false;
      const prompt = getPrompt(session.promptId);
      if (categoryFilter !== "all" && prompt?.category !== categoryFilter) return false;
      if (!query) return true;
      const haystack = `${prompt?.text ?? ""} ${prompt?.category ?? ""}`.toLowerCase();
      return haystack.includes(query);
    });
  }, [sessions, searchQuery, statusFilter, categoryFilter, durationFilter]);

  function openSession(session: Session) {
    if (session.status === "done") {
      navigation.navigate("Result", { sessionId: session.id });
      return;
    }

    const subject = sessionToRecordingSubject(session);
    if (!subject) return;
    navigation.navigate("Processing", {
      ...subject,
      sessionId: session.id,
      videoUri: session.videoPath,
      durationSecondsLocal: session.durationSeconds,
      wantsGrading: session.wantsGrading,
      wantsNotionSync: session.wantsNotionSync,
    });
  }

  async function handleDeleteVideo(session: Session) {
    await deleteSessionVideo(session.id);
    deleteRecording(session.videoPath);
    setSessions((prev) =>
      prev.map((s) => (s.id === session.id ? { ...s, videoDeletedAt: new Date().toISOString() } : s)),
    );
    showToast("Video deleted — transcript and scores kept", "success");
  }

  async function handleDeleteSession(session: Session) {
    await deleteSession(session.id);
    deleteRecording(session.videoPath);
    setSessions((prev) => prev.filter((s) => s.id !== session.id));
    showToast("Session deleted", "success");
  }

  function confirmDelete(session: SessionWithScore) {
    const buttons: Parameters<typeof Alert.alert>[2] = [{ text: "Cancel", style: "cancel" }];
    // Deleting just the video only makes sense once grading is done and the
    // video isn't there already — grading/retry needs the local file since
    // Gemini's Files API entries expire after 48h (see sessionProcessor.ts).
    if (session.status === "done" && !session.videoDeletedAt) {
      buttons.push({
        text: "Delete Video",
        style: "destructive",
        onPress: () => handleDeleteVideo(session),
      });
    }
    buttons.push({
      text: "Delete Session",
      style: "destructive",
      onPress: () => handleDeleteSession(session),
    });

    Alert.alert(
      "Delete this session?",
      "Delete Video frees up space but keeps the transcript and scores. Delete Session removes it from History entirely (it's kept for Trends stats, just hidden here).",
      buttons,
    );
  }

  const hasAnySessions = sessions.length > 0;
  const hasResults = filteredSessions.length > 0;

  return (
    <ScreenContainer style={styles.container} edges={["top", "left", "right"]}>
      <Text style={styles.title}>History</Text>

      {hasAnySessions ? (
        <View style={styles.filters}>
          <View style={styles.searchBox}>
            <Ionicons name="search-outline" size={16} color={colors.textMuted} />
            <TextInput
              style={styles.searchInput}
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Search by prompt or category"
              placeholderTextColor={colors.textMuted}
              returnKeyType="search"
              accessibilityLabel="Search sessions"
            />
          </View>
          <View style={styles.statusRow}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRowScroll} style={styles.statusScroll}>
              {STATUS_FILTERS.map((filter) => {
                const selected = statusFilter === filter.key;
                return (
                  <Pressable
                    key={filter.key}
                    onPress={() => setStatusFilter(filter.key)}
                    style={[styles.chip, selected && styles.chipSelected]}
                    accessibilityRole="button"
                    accessibilityLabel={`Filter by ${filter.label}`}
                    accessibilityState={{ selected }}
                  >
                    <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{filter.label}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
            <Pressable
              onPress={() => setFilterSheetVisible(true)}
              style={styles.filterButton}
              accessibilityRole="button"
              accessibilityLabel="More filters"
              accessibilityState={{ selected: hasSecondaryFilters }}
            >
              <Ionicons name="funnel-outline" size={18} color={hasSecondaryFilters ? colors.accent : colors.textSecondary} />
              {hasSecondaryFilters ? <View style={styles.filterDot} /> : null}
            </Pressable>
          </View>
        </View>
      ) : null}

      <FilterSheet
        visible={filterSheetVisible}
        onClose={() => setFilterSheetVisible(false)}
        categoryOptions={CATEGORY_FILTERS}
        categoryValue={categoryFilter}
        onCategoryChange={setCategoryFilter}
        durationOptions={DURATION_FILTERS}
        durationValue={durationFilter}
        onDurationChange={(value) => setDurationFilter(value as DurationFilter)}
        onReset={() => {
          setCategoryFilter("all");
          setDurationFilter("all");
        }}
      />

      {!hasAnySessions ? (
        <View style={styles.empty}>
          <Ionicons name="time-outline" size={40} color={colors.textMuted} />
          <Text style={styles.emptyText}>No sessions yet — your recordings will show up here.</Text>
        </View>
      ) : !hasResults ? (
        <View style={styles.empty}>
          <Ionicons name="search-outline" size={40} color={colors.textMuted} />
          <Text style={styles.emptyText}>Nothing matches your search or filter.</Text>
        </View>
      ) : (
        <FlatList
          style={styles.list}
          data={filteredSessions}
          keyExtractor={(item) => item.id}
          contentContainerStyle={[styles.listContent, { paddingBottom: spacing.lg + tabBarInset }]}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.accent} />}
          renderItem={({ item }) => {
            const prompt = getPrompt(item.promptId);
            const status = STATUS_META[item.status];
            return (
              <Pressable
                onPress={() => openSession(item)}
                onLongPress={() => confirmDelete(item)}
                accessibilityLabel={`${prompt?.text ?? "Session"}, ${status.label}, recorded ${formatSessionDate(item.recordedAt)}`}
                accessibilityHint="Double tap to open. Long press to delete."
              >
                <Card style={styles.row}>
                  <View style={styles.rowTop}>
                    <View style={styles.rowTopLeft}>
                      {prompt ? <Badge label={prompt.category} {...colorForCategory(prompt.category)} /> : null}
                      {item.overallScore !== null ? (
                        <Text style={[styles.scoreText, { color: colorForScore(item.overallScore) }]}>
                          {item.overallScore}/10
                        </Text>
                      ) : null}
                    </View>
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
  // See TrendsScreen.tsx for why paddingBottom: 0 — overrides
  // ScreenContainer's default bottom padding, since the list's own
  // listContent already reserves end-of-content breathing room.
  container: { gap: spacing.md, paddingBottom: 0 },
  title: { color: colors.textPrimary, fontSize: typography.title, fontWeight: "700" },
  filters: { gap: spacing.sm },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  searchInput: { flex: 1, color: colors.textPrimary, fontSize: typography.body, padding: 0 },
  statusRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  statusScroll: { flex: 1 },
  filterButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  filterDot: {
    position: "absolute",
    top: 6,
    right: 6,
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.accent,
  },
  chipRowScroll: { flexDirection: "row", gap: spacing.xs },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: 999,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipSelected: { backgroundColor: colors.accentMuted, borderColor: colors.accent },
  chipText: { color: colors.textSecondary, fontSize: typography.caption, fontWeight: "600" },
  chipTextSelected: { color: colors.accent },
  list: { flex: 1 },
  listContent: { gap: spacing.md, paddingBottom: spacing.lg },
  row: { gap: spacing.sm },
  rowTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  rowTopLeft: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  scoreText: { fontSize: typography.caption, fontWeight: "700" },
  statusPill: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  statusText: { fontSize: typography.caption, fontWeight: "700" },
  promptText: { color: colors.textPrimary, fontSize: typography.bodyLarge, fontWeight: "600" },
  rowBottom: { flexDirection: "row", justifyContent: "space-between" },
  metaText: { color: colors.textMuted, fontSize: typography.caption },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", gap: spacing.md },
  emptyText: { color: colors.textMuted, fontSize: typography.body, textAlign: "center", paddingHorizontal: spacing.xl },
});
