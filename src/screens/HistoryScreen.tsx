import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Pressable, RefreshControl, ScrollView, SectionList, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../navigation";
import { ScreenContainer } from "../components/common/ScreenContainer";
import { useToast } from "../components/common/ToastProvider";
import { FilterSheet } from "../components/history/FilterSheet";
import { ProgressVideoStrip } from "../components/history/ProgressVideoStrip";
import { groupByMonth, type MonthGroup } from "../domain/sessionHistory";
import {
  deleteSession,
  deleteSessionVideo,
  getAllSessionsWithScores,
  type SessionWithScore,
} from "../services/db/sessionsRepo";
import { getAllPrompts } from "../services/db/promptsRepo";
import { FREE_RECORD_PROMPT } from "../data/topics";
import { deleteRecording, resolveVideoUri } from "../services/storage/videoStorage";
import { subscribeToAllSessions } from "../services/pipeline/processingEvents";
import { getScriptById } from "../services/db/scriptsRepo";
import { useTabBarBottomInset } from "../hooks/useTabBarBottomInset";
import { colorForScore } from "../components/result/scoreColor";
import type { Prompt, Session } from "../domain/sessionTypes";
import { formatDuration } from "../utils/dateUtils";
import { spacing, typography } from "../theme/theme";
import { makeStyles, useTheme } from "../theme/ThemeProvider";
import type { Colors } from "../theme/theme";

const statusMeta = (colors: Colors): Record<Session["status"], { label: string; color: string; icon: keyof typeof Ionicons.glyphMap }> => ({
  recording: { label: "Recording", color: colors.textMuted, icon: "radio-button-on-outline" },
  processing: { label: "Processing", color: colors.accent, icon: "sync-outline" },
  done: { label: "Done", color: colors.success, icon: "checkmark-circle-outline" },
  error: { label: "Failed", color: colors.danger, icon: "alert-circle-outline" },
});

// "keepsake": progress videos kept when old videos are cleared.
type StatusFilter = "all" | "keepsake" | Session["status"];

const STATUS_FILTERS: { key: StatusFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "keepsake", label: "Progress videos" },
  { key: "done", label: "Done" },
  { key: "processing", label: "Processing" },
  { key: "error", label: "Failed" },
];

type DurationFilter = "all" | "short" | "medium" | "long";

const DEFAULT_OPEN_MONTHS = 2;

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

const COLLECTIONS: { route: "Practice" | "PromptLibrary" | "MarkItUp" | "Drills" | "Frameworks"; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { route: "Practice", label: "Free practice", icon: "mic-outline" },
  { route: "PromptLibrary", label: "Prompts", icon: "library-outline" },
  { route: "MarkItUp", label: "Mark it up", icon: "document-text-outline" },
  { route: "Drills", label: "Twisters", icon: "flash-outline" },
  { route: "Frameworks", label: "Frameworks", icon: "book-outline" },
];

export function HistoryScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
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
  // Months opened or closed by hand; everything else follows the default.
  const [toggledMonths, setToggledMonths] = useState<Record<string, boolean>>({});
  // Free Recording is its own category (see data/topics.ts), so filtering by
  // category here naturally covers "prompted vs. free" too, without needing a
  // separate toggle for it. Refreshed on focus (not module-level) since
  // prompts are DB-backed now and a just-added custom prompt needs to show
  // up in the filter list immediately.
  const [categoryFilters, setCategoryFilters] = useState<string[]>(["all", FREE_RECORD_PROMPT.category]);
  const [promptsById, setPromptsById] = useState<Map<string, Prompt>>(new Map());
  const hasSecondaryFilters = categoryFilter !== "all" || durationFilter !== "all";

  const refresh = useCallback(() => {
    getAllSessionsWithScores().then(setSessions);
  }, []);

  const refreshPrompts = useCallback(() => {
    getAllPrompts().then((prompts) => {
      setCategoryFilters(["all", ...new Set(prompts.map((p) => p.category)), FREE_RECORD_PROMPT.category]);
      setPromptsById(new Map(prompts.map((p) => [p.id, p])));
    });
  }, []);

  // What a row is about. Script sessions store the script id in prompt_id,
  // which used to fail the prompt lookup and show "Unknown prompt".
  function resolvePrompt(promptId: string, session?: Session): Pick<Prompt, "text" | "category"> | undefined {
    if (session?.sessionType === "script_practice") {
      const script = session.scriptId ? getScriptById(session.scriptId) : undefined;
      return script ? { text: script.title, category: script.category } : { text: "Script practice", category: "Script" };
    }
    if (promptId === FREE_RECORD_PROMPT.id) return FREE_RECORD_PROMPT;
    if (session?.subjectExtras?.promptText) {
      return { text: session.subjectExtras.promptText, category: session.subjectExtras.promptCategory ?? "Practice" };
    }
    return promptsById.get(promptId);
  }

  useFocusEffect(refresh);
  useFocusEffect(refreshPrompts);

  useEffect(() => subscribeToAllSessions(() => refresh()), [refresh]);

  async function handleRefresh() {
    setRefreshing(true);
    await getAllSessionsWithScores().then(setSessions);
    setRefreshing(false);
  }

  const filteredSessions = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return sessions.filter((session) => {
      if (statusFilter === "keepsake") {
        if (!session.videoKeepsake || session.videoDeletedAt) return false;
      } else if (statusFilter !== "all" && session.status !== statusFilter) return false;
      if (durationFilter !== "all" && durationBucket(session.durationSeconds) !== durationFilter) return false;
      const prompt = resolvePrompt(session.promptId, session);
      if (categoryFilter !== "all" && prompt?.category !== categoryFilter) return false;
      if (!query) return true;
      const haystack = `${prompt?.text ?? ""} ${prompt?.category ?? ""}`.toLowerCase();
      return haystack.includes(query);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessions, searchQuery, statusFilter, categoryFilter, durationFilter, promptsById]);

  // Every session opens on Result — progress, retries and every later
  // action (deep review, Notion, practice again) live there.
  function openSession(session: Session) {
    navigation.navigate("Result", { sessionId: session.id });
  }

  async function handleDeleteVideo(session: Session) {
    await deleteSessionVideo(session.id);
    deleteRecording(resolveVideoUri(session));
    setSessions((prev) =>
      prev.map((s) => (s.id === session.id ? { ...s, videoDeletedAt: new Date().toISOString() } : s)),
    );
    showToast("Video deleted — transcript and scores kept", "success");
  }

  async function handleDeleteSession(session: Session) {
    await deleteSession(session.id);
    deleteRecording(resolveVideoUri(session));
    setSessions((prev) => prev.filter((s) => s.id !== session.id));
    showToast("Session deleted", "success");
  }

  function confirmDelete(session: SessionWithScore) {
    const buttons: Parameters<typeof Alert.alert>[2] = [{ text: "Cancel", style: "cancel" }];
    if (!session.videoDeletedAt) {
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
      "Delete Video frees up space but keeps the transcript and scores (a deep review won't be possible afterwards). Delete Session removes it everywhere, including your stats.",
      buttons,
    );
  }

  const hasAnySessions = sessions.length > 0;
  const anyFilter = statusFilter !== "all" || hasSecondaryFilters;
  const filtersActive = searchQuery.trim() !== "" || anyFilter;
  const groups = useMemo(() => groupByMonth(filteredSessions), [filteredSessions]);
  // The two newest months start open, older ones collapse to their summary
  // line; while searching or filtering everything opens so no match hides.
  const isOpen = (key: string, index: number) => toggledMonths[key] ?? (filtersActive || index < DEFAULT_OPEN_MONTHS);
  const sections = groups.map((g, i) => ({ ...g, index: i, open: isOpen(g.key, i), data: isOpen(g.key, i) ? g.data : [] }));
  const keepsakes = useMemo(() => sessions.filter((s) => s.videoKeepsake && !s.videoDeletedAt), [sessions]);

  function toggleMonth(key: string, index: number) {
    setToggledMonths((prev) => ({ ...prev, [key]: !isOpen(key, index) }));
  }

  return (
    <ScreenContainer style={styles.container} edges={["top", "left", "right"]}>
      <Text style={styles.title}>Library</Text>

      {/* Everything you can practice outside the daily plan. */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.collections} style={styles.collectionsScroll}>
        {COLLECTIONS.map((c) => (
          <Pressable
            key={c.route}
            onPress={() => navigation.navigate(c.route)}
            style={styles.collection}
            accessibilityRole="button"
            accessibilityLabel={c.label}
          >
            <Ionicons name={c.icon} size={22} color={colors.accent} />
            <Text style={styles.collectionText}>{c.label}</Text>
          </Pressable>
        ))}
      </ScrollView>
      <Text style={styles.sectionLabel}>YOUR RECORDINGS</Text>

      {hasAnySessions ? (
        <View style={styles.searchRow}>
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
          <Pressable
            onPress={() => setFilterSheetVisible(true)}
            style={styles.filterButton}
            accessibilityRole="button"
            accessibilityLabel="Filters"
            accessibilityState={{ selected: anyFilter }}
          >
            <Ionicons name="funnel-outline" size={18} color={anyFilter ? colors.accent : colors.textSecondary} />
            {anyFilter ? <View style={styles.filterDot} /> : null}
          </Pressable>
        </View>
      ) : null}

      <FilterSheet
        visible={filterSheetVisible}
        onClose={() => setFilterSheetVisible(false)}
        statusOptions={STATUS_FILTERS}
        statusValue={statusFilter}
        onStatusChange={(value) => setStatusFilter(value as StatusFilter)}
        categoryOptions={categoryFilters}
        categoryValue={categoryFilter}
        onCategoryChange={setCategoryFilter}
        durationOptions={DURATION_FILTERS}
        durationValue={durationFilter}
        onDurationChange={(value) => setDurationFilter(value as DurationFilter)}
        onReset={() => {
          setStatusFilter("all");
          setCategoryFilter("all");
          setDurationFilter("all");
        }}
      />

      {!hasAnySessions ? (
        <View style={styles.empty}>
          <Ionicons name="time-outline" size={40} color={colors.textMuted} />
          <Text style={styles.emptyText}>No sessions yet — your recordings will show up here.</Text>
        </View>
      ) : !groups.length ? (
        <View style={styles.empty}>
          <Ionicons name={statusFilter === "keepsake" ? "bookmark-outline" : "search-outline"} size={40} color={colors.textMuted} />
          <Text style={styles.emptyText}>
            {statusFilter === "keepsake"
              ? "No progress videos yet. Pin a take from its results, or clear old videos in Settings — the best take from each month is kept."
              : "Nothing matches your search or filter."}
          </Text>
        </View>
      ) : (
        <SectionList
          style={styles.list}
          sections={sections}
          keyExtractor={(item) => item.id}
          stickySectionHeadersEnabled
          contentContainerStyle={{ paddingBottom: spacing.lg + tabBarInset }}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.accent} />}
          ListHeaderComponent={filtersActive ? null : <ProgressVideoStrip sessions={keepsakes} onOpen={openSession} />}
          renderSectionHeader={({ section }) => (
            <MonthHeader group={section} open={section.open} onToggle={() => toggleMonth(section.key, section.index)} />
          )}
          renderItem={({ item }) => {
            const prompt = resolvePrompt(item.promptId, item);
            const status = statusMeta(colors)[item.status];
            const score = item.overallScore;
            return (
              <Pressable
                onPress={() => openSession(item)}
                onLongPress={() => confirmDelete(item)}
                style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
                accessibilityLabel={`${prompt?.text ?? "Session"}, ${score != null ? `score ${score}, ` : ""}${status.label}, recorded ${formatSessionDate(item.recordedAt)}`}
                accessibilityHint="Double tap to open. Long press to delete."
              >
                <View style={[styles.scoreBadge, score != null && { borderColor: colorForScore(score, colors) }]}>
                  <Text style={[styles.scoreBadgeText, score != null && { color: colorForScore(score, colors) }]}>
                    {score != null ? score : "—"}
                  </Text>
                </View>
                <View style={styles.rowText}>
                  <Text style={styles.promptText} numberOfLines={1}>
                    {prompt?.text ?? "Unknown prompt"}
                  </Text>
                  <Text style={styles.metaText} numberOfLines={1}>
                    {formatSessionDate(item.recordedAt)} · {formatDuration(item.durationSeconds)}
                    {prompt?.category ? ` · ${prompt.category}` : ""}
                  </Text>
                </View>
                {item.status !== "done" ? <Ionicons name={status.icon} size={16} color={status.color} accessibilityLabel={status.label} /> : null}
                {item.videoKeepsake && !item.videoDeletedAt ? (
                  <Ionicons name="bookmark" size={14} color={colors.accent} accessibilityLabel="Progress video" />
                ) : null}
              </Pressable>
            );
          }}
        />
      )}
    </ScreenContainer>
  );
}

// A month's summary line; tap to collapse or expand it.
function MonthHeader({ group, open, onToggle }: { group: MonthGroup<SessionWithScore>; open: boolean; onToggle: () => void }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const delta = group.deltaVsPrevious;
  const takes = `${group.count} take${group.count === 1 ? "" : "s"}`;
  return (
    <Pressable
      onPress={onToggle}
      style={styles.monthHeader}
      accessibilityRole="button"
      accessibilityState={{ expanded: open }}
      accessibilityLabel={`${group.title}, ${takes}${group.avgScore != null ? `, average score ${group.avgScore}` : ""}`}
    >
      <Ionicons name={open ? "chevron-down" : "chevron-forward"} size={16} color={colors.textSecondary} />
      <Text style={styles.monthTitle}>{group.title}</Text>
      <Text style={styles.monthMeta}>{takes}</Text>
      <View style={styles.flex} />
      {group.avgScore != null ? (
        <Text style={[styles.monthAvg, { color: colorForScore(group.avgScore, colors) }]}>avg {group.avgScore}</Text>
      ) : null}
      {delta != null && delta !== 0 ? (
        <View style={styles.monthDelta}>
          <Ionicons name={delta > 0 ? "arrow-up" : "arrow-down"} size={12} color={delta > 0 ? colors.success : colors.warning} />
          <Text style={[styles.monthDeltaText, { color: delta > 0 ? colors.success : colors.warning }]}>{Math.abs(delta)}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  collectionsScroll: { flexGrow: 0 },
  collections: { gap: spacing.sm, paddingRight: spacing.md },
  collection: {
    width: 92,
    paddingVertical: spacing.md,
    alignItems: "center",
    gap: spacing.xs,
    borderRadius: 16,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  collectionText: { color: colors.textPrimary, fontSize: typography.caption, fontWeight: "600" },
  sectionLabel: { color: colors.textMuted, fontSize: 11, fontWeight: "700", letterSpacing: 0.8 },
  // See TrendsScreen.tsx for why paddingBottom: 0 — overrides
  // ScreenContainer's default bottom padding, since the list's own
  // listContent already reserves end-of-content breathing room.
  container: { gap: spacing.md, paddingBottom: 0 },
  title: { color: colors.textPrimary, fontSize: typography.title, fontWeight: "700" },
  searchRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  searchBox: {
    flex: 1,
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
  list: { flex: 1 },
  // Opaque so a sticky header covers the rows scrolling under it.
  monthHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    backgroundColor: colors.background,
    borderBottomWidth: 1,
    borderBottomColor: colors.separator,
  },
  monthTitle: { color: colors.textPrimary, fontSize: typography.body, fontWeight: "700" },
  monthMeta: { color: colors.textMuted, fontSize: typography.caption },
  monthAvg: { fontSize: typography.caption, fontWeight: "800" },
  monthDelta: { flexDirection: "row", alignItems: "center", gap: 1 },
  monthDeltaText: { fontSize: typography.caption, fontWeight: "700" },
  flex: { flex: 1 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.sm + 2,
    borderBottomWidth: 1,
    borderBottomColor: colors.separator,
  },
  rowPressed: { opacity: 0.6 },
  scoreBadge: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  scoreBadgeText: { color: colors.textMuted, fontSize: typography.caption, fontWeight: "800" },
  rowText: { flex: 1, gap: 2 },
  promptText: { color: colors.textPrimary, fontSize: typography.body, fontWeight: "600" },
  metaText: { color: colors.textMuted, fontSize: typography.caption },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", gap: spacing.md },
  emptyText: { color: colors.textMuted, fontSize: typography.body, textAlign: "center", paddingHorizontal: spacing.xl },
}));
