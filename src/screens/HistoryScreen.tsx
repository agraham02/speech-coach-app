import { useCallback, useEffect, useMemo, useState } from "react";
import { GuideTip } from "../components/common/GuideTip";
import { Alert, Pressable, RefreshControl, ScrollView, SectionList, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../navigation";
import { ScreenContainer } from "../components/common/ScreenContainer";
import { Txt } from "../components/common/Txt";
import { EmptyState } from "../components/common/EmptyState";
import { IconButton } from "../components/common/IconButton";
import { PressableScale } from "../components/common/PressableScale";
import { ProgressRing } from "../components/common/ProgressRing";
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
  // action (deep review, practice again) live there.
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

  const header = (
    <View style={styles.headerBlock}>
      <Txt variant="largeTitle">Library</Txt>

      {/* Everything you can practice outside the daily plan. */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.collections} style={styles.collectionsScroll}>
        {COLLECTIONS.map((c) => (
          <PressableScale
            key={c.route}
            onPress={() => navigation.navigate(c.route)}
            style={styles.collection}
            scaleTo={0.95}
            accessibilityRole="button"
            accessibilityLabel={c.label}
          >
            <View style={styles.collectionIcon}>
              <Ionicons name={c.icon} size={20} color={colors.textPrimary} />
            </View>
            <Txt variant="footnote" weight="600">
              {c.label}
            </Txt>
          </PressableScale>
        ))}
      </ScrollView>

      <View style={styles.recordingsHead}>
        <Txt variant="title3">Your recordings</Txt>
        {hasAnySessions ? (
          <Txt variant="footnote" tone="muted" tabular>
            {sessions.length} take{sessions.length === 1 ? "" : "s"}
          </Txt>
        ) : null}
      </View>

      {hasAnySessions ? (
        <View style={styles.searchRow}>
          <View style={styles.searchBox}>
            <Ionicons name="search" size={16} color={colors.textMuted} />
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
          <View>
            <IconButton icon="options-outline" onPress={() => setFilterSheetVisible(true)} accessibilityLabel="Filters" size={44} />
            {anyFilter ? <View style={styles.filterDot} /> : null}
          </View>
        </View>
      ) : null}

      {hasAnySessions && !filtersActive ? <ProgressVideoStrip sessions={keepsakes} onOpen={openSession} /> : null}
    </View>
  );

  return (
    <ScreenContainer style={styles.container} edges={["top", "left", "right"]}>
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

      <SectionList
        style={styles.list}
        sections={sections}
        keyExtractor={(item) => item.id}
        stickySectionHeadersEnabled
        contentContainerStyle={[styles.listContent, { paddingBottom: 32 + tabBarInset }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.textSecondary} />}
        ListHeaderComponent={header}
        ListEmptyComponent={
          !hasAnySessions ? (
            <EmptyState icon="videocam-outline" title="No recordings yet" body="Your takes will show up here, grouped by month, with their scores." />
          ) : (
            <EmptyState
              icon={statusFilter === "keepsake" ? "bookmark-outline" : "search-outline"}
              title={statusFilter === "keepsake" ? "No progress videos yet" : "Nothing matches"}
              body={
                statusFilter === "keepsake"
                  ? "Pin a take from its results, or clear old videos in Settings — the best take from each month is kept."
                  : "Try a different search or filter."
              }
            />
          )
        }
        renderSectionHeader={({ section }) => <MonthHeader group={section} open={section.open} onToggle={() => toggleMonth(section.key, section.index)} />}
        renderItem={({ item }) => {
          const prompt = resolvePrompt(item.promptId, item);
          const status = statusMeta(colors)[item.status];
          const score = item.overallScore;
          const scoreColor = score != null ? colorForScore(score, colors) : colors.textMuted;
          return (
            <PressableScale
              onPress={() => openSession(item)}
              onLongPress={() => confirmDelete(item)}
              scaleTo={0.98}
              style={styles.row}
              accessibilityLabel={`${prompt?.text ?? "Session"}, ${score != null ? `score ${score}, ` : ""}${status.label}, recorded ${formatSessionDate(item.recordedAt)}`}
              accessibilityHint="Double tap to open. Long press to delete."
            >
              <ProgressRing size={42} strokeWidth={3} progress={score != null ? score / 10 : 0} color={scoreColor}>
                <Txt variant="subhead" weight="600" color={score != null ? colors.textPrimary : colors.textMuted} tabular>
                  {score != null ? score : "–"}
                </Txt>
              </ProgressRing>
              <View style={styles.rowText}>
                <Txt variant="headline" numberOfLines={1}>
                  {prompt?.text ?? "Unknown prompt"}
                </Txt>
                <Txt variant="footnote" tone="muted" numberOfLines={1}>
                  {formatSessionDate(item.recordedAt)} · {formatDuration(item.durationSeconds)}
                  {prompt?.category ? ` · ${prompt.category}` : ""}
                </Txt>
              </View>
              {item.status !== "done" ? <Ionicons name={status.icon} size={16} color={status.color} accessibilityLabel={status.label} /> : null}
              {item.videoKeepsake && !item.videoDeletedAt ? <Ionicons name="bookmark" size={14} color={colors.warning} accessibilityLabel="Progress video" /> : null}
            </PressableScale>
          );
        }}
      />
      <GuideTip id="library" />
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
      <Txt variant="title3">{group.title}</Txt>
      <Txt variant="footnote" tone="muted">
        {takes}
      </Txt>
      <View style={styles.flex} />
      {group.avgScore != null ? (
        <Txt variant="footnote" weight="600" color={colorForScore(group.avgScore, colors)} tabular>
          avg {group.avgScore}
        </Txt>
      ) : null}
      {delta != null && delta !== 0 ? (
        <View style={styles.monthDelta}>
          <Ionicons name={delta > 0 ? "arrow-up" : "arrow-down"} size={12} color={delta > 0 ? colors.success : colors.warning} />
          <Txt variant="footnote" weight="600" color={delta > 0 ? colors.success : colors.warning} tabular>
            {Math.abs(delta)}
          </Txt>
        </View>
      ) : null}
      <Ionicons name={open ? "chevron-up" : "chevron-down"} size={16} color={colors.textMuted} />
    </Pressable>
  );
}

const useStyles = makeStyles((t) => ({
  // The list runs edge to edge so the sticky month headers span the screen.
  container: { paddingHorizontal: 0, paddingBottom: 0, paddingTop: 0 },
  list: { flex: 1 },
  listContent: { paddingHorizontal: t.layout.gutter },
  headerBlock: { gap: t.space.md + 4, paddingTop: t.space.xl + 4, paddingBottom: t.space.sm },
  collectionsScroll: { flexGrow: 0, marginHorizontal: -t.layout.gutter },
  collections: { gap: t.space.sm + 2, paddingHorizontal: t.layout.gutter },
  collection: {
    width: 108,
    paddingVertical: t.space.md,
    paddingHorizontal: t.space.sm + 4,
    alignItems: "flex-start",
    gap: t.space.md,
    borderRadius: t.radius.lg - 4,
    backgroundColor: t.colors.surface,
    ...t.shadow.card,
  },
  collectionIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: t.colors.accentMuted,
    alignItems: "center",
    justifyContent: "center",
  },
  recordingsHead: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", marginTop: t.space.sm },
  searchRow: { flexDirection: "row", alignItems: "center", gap: t.space.sm },
  searchBox: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: t.space.sm,
    backgroundColor: t.colors.surfaceRaised,
    borderRadius: t.radius.pill,
    paddingHorizontal: t.space.md,
    height: 44,
  },
  searchInput: { flex: 1, color: t.colors.textPrimary, ...t.type.callout, padding: 0 },
  filterDot: {
    position: "absolute",
    top: 8,
    right: 8,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: t.colors.warning,
  },
  // Opaque so a sticky header covers the rows scrolling under it.
  monthHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: t.space.sm,
    paddingTop: t.space.md,
    paddingBottom: t.space.sm,
    backgroundColor: t.colors.background,
  },
  monthDelta: { flexDirection: "row", alignItems: "center", gap: 1 },
  flex: { flex: 1 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: t.space.md - 2,
    paddingVertical: t.space.sm + 2,
  },
  rowText: { flex: 1, gap: 2 },
}));
