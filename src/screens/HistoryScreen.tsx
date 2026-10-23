import { useCallback, useEffect, useMemo, useState } from "react";
import { logger } from "../utils/logger";
import { SkeletonRows } from "../components/common/Skeleton";
import { GuideTip, TourTarget } from "../components/common/GuideTip";
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
import { listRewinds, type Rewind } from "../services/db/rewindRepo";
import { confirmDeleteRewind } from "../components/rewind/confirmDeleteRewind";
import {
  DATE_RANGES,
  hasFilters,
  kindForSessionType,
  kindOptions,
  matchesFilters,
  matchesQuery,
  NO_FILTERS,
  searchText,
  sortNewestFirst,
  transcriptExcerpt,
  type DurationFilter,
  type LibraryFilters,
  type LibraryItem,
  type LibraryStatus,
  type StatusFilter,
} from "../domain/libraryItems";
import { formatDuration } from "../utils/dateUtils";
import { makeStyles, useTheme } from "../theme/ThemeProvider";
import type { Colors } from "../theme/theme";

const statusMeta = (colors: Colors): Record<Session["status"], { label: string; color: string; icon: keyof typeof Ionicons.glyphMap }> => ({
  recording: { label: "Recording", color: colors.textMuted, icon: "radio-button-on-outline" },
  processing: { label: "Processing", color: colors.accent, icon: "sync-outline" },
  done: { label: "Done", color: colors.success, icon: "checkmark-circle-outline" },
  error: { label: "Failed", color: colors.danger, icon: "alert-circle-outline" },
});

const STATUS_FILTERS: { key: StatusFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "keepsake", label: "Progress videos" },
  { key: "done", label: "Done" },
  { key: "processing", label: "Processing" },
  { key: "error", label: "Failed" },
];

const DEFAULT_OPEN_MONTHS = 2;
// While a Rewind is still being listened back to, the list checks again.
const REWIND_POLL_MS = 3000;

const DURATION_FILTERS: { key: DurationFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "short", label: "Under 2 min" },
  { key: "medium", label: "2-4 min" },
  { key: "long", label: "Over 4 min" },
];

type Item = LibraryItem<SessionWithScore, Rewind> & { haystack: string };

const rewindStatus = (status: Rewind["status"]): LibraryStatus => (status === "failed" ? "error" : status);

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
  const [rewinds, setRewinds] = useState<Rewind[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [filters, setFilters] = useState<LibraryFilters>(NO_FILTERS);
  const setFilter = <K extends keyof LibraryFilters>(key: K, value: LibraryFilters[K]) => setFilters((prev) => ({ ...prev, [key]: value }));
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

  // Both lists, so Rewinds sit in the Library with the takes.
  const load = useCallback(
    () =>
      Promise.all([
        getAllSessionsWithScores().then(setSessions),
        listRewinds()
          .then(setRewinds)
          .catch((error) => logger.warn(`[library] couldn't load Rewinds — ${(error as Error).message}`)),
      ]),
    [],
  );

  const refresh = useCallback(() => {
    load().finally(() => setLoaded(true));
  }, [load]);

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

  // A Rewind fills in by itself after you tell it; follow it here too.
  const rewindProcessing = rewinds.some((r) => r.status === "processing");
  useEffect(() => {
    if (!rewindProcessing) return;
    const timer = setInterval(() => listRewinds().then(setRewinds).catch(() => undefined), REWIND_POLL_MS);
    return () => clearInterval(timer);
  }, [rewindProcessing]);

  async function handleRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  // One list, newest first. The search text is built once per load, not on
  // every keystroke.
  const items = useMemo<Item[]>(() => {
    const now = new Date();
    const fromSessions = sessions.map((s): Item => {
      const prompt = resolvePrompt(s.promptId, s);
      const base = {
        key: `s:${s.id}`,
        id: s.id,
        kind: kindForSessionType(s.sessionType),
        recordedAt: s.recordedAt,
        durationSeconds: s.durationSeconds,
        title: prompt?.text ?? "Unknown prompt",
        category: prompt?.category ?? null,
        transcript: s.transcriptClean ?? "",
        status: s.status,
        overallScore: s.overallScore,
        keepsake: !!s.videoKeepsake && !s.videoDeletedAt,
        session: s,
        rewind: null,
      };
      return { ...base, haystack: searchText(base, now) };
    });
    const fromRewinds = rewinds.map((r): Item => {
      const base = {
        key: `r:${r.id}`,
        id: r.id,
        kind: "rewind" as const,
        recordedAt: r.recordedAt,
        durationSeconds: r.durationSeconds,
        title: "Rewind",
        category: null,
        transcript: r.transcript,
        status: rewindStatus(r.status),
        overallScore: null,
        keepsake: false,
        session: null,
        rewind: r,
      };
      return { ...base, haystack: searchText(base, now) };
    });
    return sortNewestFirst([...fromSessions, ...fromRewinds]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessions, rewinds, promptsById]);

  const filteredItems = useMemo(() => {
    const now = new Date();
    return items.filter((item) => matchesFilters(item, filters, now) && matchesQuery(item.haystack, searchQuery));
  }, [items, filters, searchQuery]);

  const typeOptions = useMemo(() => kindOptions(items), [items]);

  // Every session opens on Result — progress, retries and every later
  // action (deep review, practice again) live there. A Rewind opens on its
  // own result.
  function openSession(session: Session) {
    navigation.navigate("Result", { sessionId: session.id });
  }

  function openItem(item: Item) {
    if (item.rewind) navigation.navigate("RewindResult", { id: item.rewind.id });
    else if (item.session) openSession(item.session);
  }

  function confirmDeleteItem(item: Item) {
    if (item.session) {
      confirmDelete(item.session);
      return;
    }
    const rewind = item.rewind;
    if (!rewind) return;
    confirmDeleteRewind(
      rewind,
      () => {
        setRewinds((prev) => prev.filter((r) => r.id !== rewind.id));
        showToast("Rewind deleted", "success");
      },
      () => showToast("Couldn't delete that — try again", "error"),
    );
  }

  // Both deletes are optimistic: the row changes first, and comes back if
  // the database refuses.
  async function handleDeleteVideo(session: Session) {
    const before = sessions;
    setSessions((prev) => prev.map((s) => (s.id === session.id ? { ...s, videoDeletedAt: new Date().toISOString() } : s)));
    try {
      await deleteSessionVideo(session.id);
      deleteRecording(resolveVideoUri(session));
      showToast("Video deleted — transcript and scores kept", "success");
    } catch (error) {
      logger.error(`[library] delete video failed — ${(error as Error).message}`);
      setSessions(before);
      showToast("Couldn't delete the video — try again", "error");
    }
  }

  async function handleDeleteSession(session: Session) {
    const before = sessions;
    setSessions((prev) => prev.filter((s) => s.id !== session.id));
    try {
      await deleteSession(session.id);
      deleteRecording(resolveVideoUri(session));
      showToast("Session deleted", "success");
    } catch (error) {
      logger.error(`[library] delete failed — ${(error as Error).message}`);
      setSessions(before);
      showToast("Couldn't delete that — try again", "error");
    }
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

  const hasAnySessions = items.length > 0;
  const statusFilter = filters.status;
  const anyFilter = hasFilters(filters);
  const filtersActive = searchQuery.trim() !== "" || anyFilter;
  const groups = useMemo(() => groupByMonth(filteredItems), [filteredItems]);
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
            {items.length} take{items.length === 1 ? "" : "s"}
          </Txt>
        ) : null}
      </View>

      {hasAnySessions ? (
        <View style={styles.searchRow}>
          <View style={styles.searchBox}>
            <Ionicons name="search" size={16} color={colors.textMuted} />
            <TextInput maxLength={80}
              style={styles.searchInput}
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Search what you said, prompts, dates"
              placeholderTextColor={colors.textMuted}
              returnKeyType="search"
              clearButtonMode="while-editing"
              autoCorrect={false}
              accessibilityLabel="Search recordings"
              accessibilityHint="Matches what you said, the prompt, the type, or a day such as Monday or Oct 12"
            />
          </View>
          <View>
            <IconButton icon="options-outline" onPress={() => setFilterSheetVisible(true)} accessibilityLabel="Filters" size={44} />
            {anyFilter ? <View style={styles.filterDot} /> : null}
          </View>
        </View>
      ) : null}

      {hasAnySessions && !filtersActive ? (
        <TourTarget id={keepsakes.length ? "library.videos" : undefined}>
          <ProgressVideoStrip sessions={keepsakes} onOpen={openSession} />
        </TourTarget>
      ) : null}
    </View>
  );

  return (
    <ScreenContainer style={styles.container} edges={["top", "left", "right"]}>
      <FilterSheet
        visible={filterSheetVisible}
        onClose={() => setFilterSheetVisible(false)}
        kindOptions={typeOptions}
        kindValue={filters.kind}
        onKindChange={(value) => setFilter("kind", value as LibraryFilters["kind"])}
        dateOptions={DATE_RANGES}
        dateValue={filters.date}
        onDateChange={(value) => setFilter("date", value as LibraryFilters["date"])}
        statusOptions={STATUS_FILTERS}
        statusValue={filters.status}
        onStatusChange={(value) => setFilter("status", value as StatusFilter)}
        categoryOptions={categoryFilters}
        categoryValue={filters.category}
        onCategoryChange={(value) => setFilter("category", value)}
        durationOptions={DURATION_FILTERS}
        durationValue={filters.duration}
        onDurationChange={(value) => setFilter("duration", value as DurationFilter)}
        onReset={() => setFilters(NO_FILTERS)}
      />

      <SectionList
        style={styles.list}
        sections={sections}
        keyExtractor={(item) => item.key}
        stickySectionHeadersEnabled
        contentContainerStyle={[styles.listContent, { paddingBottom: 32 + tabBarInset }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.textSecondary} />}
        ListHeaderComponent={header}
        ListEmptyComponent={
          !loaded ? (
            <SkeletonRows count={5} />
          ) : !hasAnySessions ? (
            <EmptyState icon="videocam-outline" title="No recordings yet" body="Your takes will show up here, grouped by month, with their scores." />
          ) : (
            <EmptyState
              icon={statusFilter === "keepsake" ? "bookmark-outline" : "search-outline"}
              title={statusFilter === "keepsake" ? "No progress videos yet" : "Nothing matches"}
              body={
                statusFilter === "keepsake"
                  ? "Pin a take from its results, or clear old videos in Settings — the best and the toughest take from each month are kept."
                  : "Try a different search or filter."
              }
            />
          )
        }
        renderSectionHeader={({ section }) => <MonthHeader group={section} open={section.open} onToggle={() => toggleMonth(section.key, section.index)} />}
        renderItem={({ item }) => {
          const status = statusMeta(colors)[item.status];
          const score = item.overallScore;
          const scoreColor = score != null ? colorForScore(score, colors) : colors.textMuted;
          const isRewind = item.kind === "rewind";
          // While searching, show where the words matched.
          const said = searchQuery.trim() ? transcriptExcerpt(item.transcript, searchQuery) : null;
          const meta = [formatSessionDate(item.recordedAt), formatDuration(item.durationSeconds), item.category ?? (isRewind ? "Your day" : "")].filter(Boolean).join(" · ");
          return (
            <PressableScale
              onPress={() => openItem(item)}
              onLongPress={() => confirmDeleteItem(item)}
              scaleTo={0.98}
              style={styles.row}
              accessibilityLabel={`${item.title}, ${score != null ? `score ${score}, ` : ""}${status.label}, recorded ${formatSessionDate(item.recordedAt)}${said ? `, you said: ${said}` : ""}`}
              accessibilityHint="Double tap to open. Long press to delete."
            >
              {isRewind ? (
                // No score for a Rewind (it grades content, not delivery).
                <View style={styles.kindIcon}>
                  <Ionicons name="play-back-outline" size={18} color={colors.textPrimary} />
                </View>
              ) : (
                <ProgressRing size={42} strokeWidth={3} progress={score != null ? score / 10 : 0} color={scoreColor}>
                  <Txt variant="subhead" weight="600" color={score != null ? colors.textPrimary : colors.textMuted} tabular>
                    {score != null ? score : "–"}
                  </Txt>
                </ProgressRing>
              )}
              <View style={styles.rowText}>
                <Txt variant="headline" numberOfLines={1}>
                  {item.title}
                </Txt>
                <Txt variant="footnote" tone="muted" numberOfLines={1}>
                  {meta}
                </Txt>
                {said ? (
                  <Txt variant="footnote" tone="secondary" numberOfLines={1}>
                    “{said}”
                  </Txt>
                ) : null}
              </View>
              {item.status !== "done" ? <Ionicons name={status.icon} size={16} color={status.color} accessibilityLabel={status.label} /> : null}
              {item.keepsake ? <Ionicons name="bookmark" size={14} color={colors.warning} accessibilityLabel="Progress video" /> : null}
            </PressableScale>
          );
        }}
      />
      <GuideTip id="library" />
    </ScreenContainer>
  );
}

// A month's summary line; tap to collapse or expand it.
function MonthHeader({ group, open, onToggle }: { group: MonthGroup<unknown>; open: boolean; onToggle: () => void }) {
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
  kindIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: t.colors.accentMuted,
  },
}));
