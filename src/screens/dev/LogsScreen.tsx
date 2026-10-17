import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, FlatList, ScrollView, Share, TextInput, View, type NativeScrollEvent, type NativeSyntheticEvent } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../../navigation";
import { Screen } from "../../components/common/Screen";
import { IconButton } from "../../components/common/IconButton";
import { SegmentedControl } from "../../components/common/SegmentedControl";
import { Chip } from "../../components/common/Chip";
import { PressableScale } from "../../components/common/PressableScale";
import { Txt } from "../../components/common/Txt";
import { Mono } from "../../components/dev/Mono";
import { clearLogs, getLogs, subscribeLogs, type LogEntry } from "../../services/logs/logStore";
import { extraLineCount, filterLogs, firstLine, formatLogLines, isFiltering, logTag, tagCounts, type LogFilter, type LogLevelFilter } from "../../domain/dev/logFilter";
import { copyText } from "../../utils/copyText";
import { useToast } from "../../components/common/ToastProvider";
import { makeStyles, useTheme } from "../../theme/ThemeProvider";

type Props = NativeStackScreenProps<RootStackParamList, "DevLogs">;

const LEVELS: { key: LogLevelFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "warn", label: "Warnings+" },
  { key: "error", label: "Errors" },
];

// How far from the top still counts as at the top (new entries then slide in
// on their own).
const TOP_SLACK = 60;

function formatTime(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number, w = 2) => String(n).padStart(w, "0");
  return pad(d.getHours()) + ":" + pad(d.getMinutes()) + ":" + pad(d.getSeconds()) + "." + pad(d.getMilliseconds(), 3);
}

export function LogsScreen({ navigation, route }: Props) {
  const styles = useStyles();
  const { colors } = useTheme();
  const showToast = useToast();
  const [logs, setLogs] = useState<LogEntry[]>(getLogs());
  const [filter, setFilter] = useState<LogFilter>({
    level: route.params?.level ?? "all",
    tags: route.params?.tag ? [route.params.tag] : [],
    query: "",
  });
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  // The newest entry at the moment you scrolled away from the top.
  const [anchorId, setAnchorId] = useState<string | null>(null);
  const [list, setList] = useState<FlatList<LogEntry> | null>(null);

  useEffect(() => subscribeLogs(setLogs), []);

  const visible = useMemo(() => filterLogs(logs, filter), [logs, filter]);
  const tags = useMemo(() => tagCounts(logs), [logs]);
  const filtering = isFiltering(filter);

  const levelColor = (level: LogEntry["level"]) => (level === "error" ? colors.danger : level === "warn" ? colors.warning : colors.textMuted);

  const toggleTag = (tag: string) => setFilter((f) => ({ ...f, tags: f.tags.includes(tag) ? f.tags.filter((t) => t !== tag) : [...f.tags, tag] }));

  const toggleExpanded = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  const onScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const awayFromTop = e.nativeEvent.contentOffset.y > TOP_SLACK;
      setAnchorId((current) => (awayFromTop ? current ?? visible[0]?.id ?? null : null));
    },
    [visible],
  );

  const newCount = useMemo(() => {
    if (!anchorId) return 0;
    const index = visible.findIndex((e) => e.id === anchorId);
    return index === -1 ? visible.length : index;
  }, [anchorId, visible]);

  async function copyEntry(entry: LogEntry) {
    const copied = await copyText(entry.message);
    if (copied) showToast("Copied.", "success");
  }

  function confirmClear() {
    Alert.alert("Clear all logs?", "The saved history on this phone is deleted.", [
      { text: "Cancel", style: "cancel" },
      { text: "Clear", style: "destructive", onPress: clearLogs },
    ]);
  }

  return (
    <Screen
      title="Logs"
      eyebrow="Dev"
      scroll={false}
      onBack={navigation.goBack}
      right={
        <>
          <IconButton icon="share-outline" accessibilityLabel={filtering ? "Share filtered logs" : "Share logs"} onPress={() => Share.share({ message: formatLogLines(visible) }).catch(() => undefined)} />
          <IconButton icon="trash-outline" accessibilityLabel="Clear logs" onPress={confirmClear} />
        </>
      }
    >
      <View style={styles.filters}>
        <SegmentedControl options={LEVELS} value={filter.level} onChange={(level) => setFilter((f) => ({ ...f, level }))} size="sm" />
        <View style={styles.search}>
          <Ionicons name="search" size={16} color={colors.textMuted} />
          <TextInput
            value={filter.query}
            onChangeText={(query) => setFilter((f) => ({ ...f, query }))}
            placeholder="Search"
            placeholderTextColor={colors.textMuted}
            autoCapitalize="none"
            autoCorrect={false}
            clearButtonMode="while-editing"
            style={styles.searchInput}
          />
        </View>
        {tags.length > 0 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tags}>
            {tags.map(({ tag, count }) => (
              <Chip key={tag} label={tag + " " + count} selected={filter.tags.includes(tag)} onPress={() => toggleTag(tag)} />
            ))}
          </ScrollView>
        ) : null}
        <Txt variant="caption1" tone="muted">
          {filtering ? visible.length + " of " + logs.length + " entries" : logs.length + " entries"}
        </Txt>
      </View>

      {visible.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="terminal-outline" size={36} color={colors.textMuted} />
          <Txt variant="subhead" tone="muted" align="center">
            {logs.length === 0 ? "Nothing logged yet. Record a take: each step of saving, transcribing and analyzing is logged here as it happens." : "No entries match these filters."}
          </Txt>
          {filtering ? <Chip label="Clear filters" onPress={() => setFilter({ level: "all", tags: [], query: "" })} /> : null}
        </View>
      ) : (
        <View style={styles.listWrap}>
          <FlatList
            ref={setList}
            data={visible}
            keyExtractor={(item) => item.id}
            onScroll={onScroll}
            scrollEventThrottle={100}
            // Entries are added at the top: hold the view still while reading
            // further down, and follow them when at the top.
            maintainVisibleContentPosition={{ minIndexForVisible: 0, autoscrollToTopThreshold: 10 }}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            renderItem={({ item }) => {
              const tag = logTag(item.message);
              const extra = extraLineCount(item.message);
              const open = expanded.has(item.id);
              return (
                <PressableScale
                  onPress={extra > 0 ? () => toggleExpanded(item.id) : undefined}
                  onLongPress={() => copyEntry(item)}
                  scaleTo={0.99}
                  accessibilityLabel={firstLine(item.message)}
                  style={styles.row}
                >
                  <View style={styles.meta}>
                    <View style={[styles.dot, { backgroundColor: levelColor(item.level) }]} />
                    <Mono variant="caption2" tone="muted">
                      {formatTime(item.timestamp)}
                    </Mono>
                    {tag ? (
                      <Mono variant="caption2" tone="secondary">
                        {tag}
                      </Mono>
                    ) : null}
                  </View>
                  <Mono color={item.level === "info" ? colors.textSecondary : levelColor(item.level)} selectable={open}>
                    {open ? item.message : firstLine(item.message)}
                  </Mono>
                  {extra > 0 && !open ? (
                    <Mono variant="caption2" tone="muted">
                      {"+" + extra + (extra === 1 ? " line" : " lines") + " · tap to expand"}
                    </Mono>
                  ) : null}
                </PressableScale>
              );
            }}
          />
          {newCount > 0 ? (
            <PressableScale style={styles.pill} onPress={() => list?.scrollToOffset({ offset: 0, animated: true })} accessibilityLabel="Jump to newest">
              <Ionicons name="arrow-up" size={14} color={colors.onAccent} />
              <Txt variant="footnote" weight="600" color={colors.onAccent}>
                {newCount >= visible.length ? "New entries" : newCount + " new"}
              </Txt>
            </PressableScale>
          ) : null}
        </View>
      )}
    </Screen>
  );
}

const useStyles = makeStyles((t) => ({
  filters: { gap: t.space.sm, paddingBottom: t.space.sm },
  search: {
    flexDirection: "row",
    alignItems: "center",
    gap: t.space.sm,
    paddingHorizontal: t.space.md - 2,
    height: 40,
    borderRadius: t.radius.pill,
    backgroundColor: t.colors.surfaceRaised,
  },
  searchInput: { flex: 1, color: t.colors.textPrimary, ...t.type.subhead, paddingVertical: 0 },
  tags: { gap: t.space.sm, paddingRight: t.space.md },
  listWrap: { flex: 1 },
  listContent: { paddingBottom: t.space.xl },
  row: { paddingVertical: t.space.sm, gap: 2 },
  meta: { flexDirection: "row", alignItems: "center", gap: t.space.sm },
  dot: { width: 7, height: 7, borderRadius: 4 },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", gap: t.space.md, paddingHorizontal: t.space.xl },
  pill: {
    position: "absolute",
    top: t.space.sm,
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: t.space.md,
    height: 34,
    borderRadius: t.radius.pill,
    backgroundColor: t.colors.accent,
  },
}));
