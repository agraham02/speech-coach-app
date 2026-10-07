import { useCallback, useEffect, useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../navigation";
import { ScreenContainer } from "../components/common/ScreenContainer";
import { Card } from "../components/common/Card";
import { Badge } from "../components/common/Badge";
import { HeroCard } from "../components/common/HeroCard";
import { ScoreTrendChart, type TrendPoint } from "../components/trends/ScoreTrendChart";
import { computeStreaks, highestStreakMilestone } from "../domain/streaks";
import { computeThisWeekVsLastWeek, type ScoredSessionSummary, type WeekStats } from "../domain/trends";
import {
  DEFAULT_CURRICULUM_LEVEL,
  difficultyTierLabel,
  explainCurriculumChange,
  levelToDifficultyTier,
  type CurriculumLevel,
} from "../domain/curriculum";
import { getCompletedSessionDates, getScoredSessionSummaries } from "../services/db/statsRepo";
import { getCurriculumHistory, recomputeCurriculumLevel } from "../services/db/curriculumRepo";
import { getCurriculumOverride } from "../services/prefs/prefsStore";
import { subscribeToAllSessions } from "../services/pipeline/processingEvents";
import { useTabBarBottomInset } from "../hooks/useTabBarBottomInset";
import { colors, fontDisplay, spacing, typography } from "../theme/theme";

const RECENT_COUNT = 10;

function shortDate(isoDatetime: string): string {
  return new Date(isoDatetime).toLocaleDateString(undefined, { month: "numeric", day: "numeric" });
}

// Blanks out a date label when it's the same as the point right before it, so
// two same-day sessions don't render as visually-duplicate axis labels (e.g.
// "7/25  7/25") that read as a bug rather than two distinct points.
function buildTrendPoints(summaries: ScoredSessionSummary[]): TrendPoint[] {
  let lastLabel: string | null = null;
  return summaries.map((s) => {
    const label = shortDate(s.recordedAt);
    const point: TrendPoint = { value: s.overallScore, label: label === lastLabel ? "" : label };
    lastLabel = label;
    return point;
  });
}

// invert flips "up is good" to "down is good" — for metrics where less is
// the improvement (e.g. restated-point rate), a decrease should read as
// success (green), not regression (warning), even though the number itself
// went down the same way a score dropping would.
function DeltaIndicator({
  current,
  previous,
  invert = false,
}: {
  current: number | null;
  previous: number | null;
  invert?: boolean;
}) {
  if (current === null || previous === null) {
    return <Text style={styles.deltaNeutral}>Not enough data yet</Text>;
  }
  const diff = Math.round((current - previous) * 10) / 10;
  if (diff === 0) {
    return (
      <View style={styles.deltaRow}>
        <Ionicons name="remove" size={14} color={colors.textMuted} />
        <Text style={styles.deltaNeutral}>Same as last week</Text>
      </View>
    );
  }
  const isUp = diff > 0;
  const isGood = invert ? !isUp : isUp;
  return (
    <View style={styles.deltaRow}>
      <Ionicons name={isUp ? "arrow-up" : "arrow-down"} size={14} color={isGood ? colors.success : colors.warning} />
      <Text style={[styles.deltaText, { color: isGood ? colors.success : colors.warning }]}>
        {Math.abs(diff)} vs last week
      </Text>
    </View>
  );
}

export function TrendsScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const tabBarInset = useTabBarBottomInset();
  const [totalSessions, setTotalSessions] = useState(0);
  const [streaks, setStreaks] = useState({ currentStreak: 0, longestStreak: 0 });
  const [weekly, setWeekly] = useState<{ thisWeek: WeekStats; lastWeek: WeekStats } | null>(null);
  const [recentPoints, setRecentPoints] = useState<TrendPoint[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [curriculumLevel, setCurriculumLevel] = useState<CurriculumLevel>(DEFAULT_CURRICULUM_LEVEL);
  const [curriculumExplanation, setCurriculumExplanation] = useState("");
  const [curriculumPoints, setCurriculumPoints] = useState<TrendPoint[]>([]);

  const refresh = useCallback(async () => {
    const dates = await getCompletedSessionDates();
    setTotalSessions(dates.length);
    setStreaks(computeStreaks(dates));

    const summaries = await getScoredSessionSummaries();
    setWeekly(computeThisWeekVsLastWeek(summaries));
    setRecentPoints(buildTrendPoints(summaries.slice(-RECENT_COUNT)));

    // Folds into this screen's existing refresh() (already wired to both
    // focus and the pipeline event bus below) rather than a separate
    // subscription — matches Phase 5's "pull-based on focus" plan note.
    const [decision, history] = await Promise.all([recomputeCurriculumLevel(), getCurriculumHistory(RECENT_COUNT)]);
    const override = getCurriculumOverride();
    const effectiveLevel = (override ?? decision.level) as CurriculumLevel;
    setCurriculumLevel(effectiveLevel);
    setCurriculumExplanation(
      explainCurriculumChange({
        direction: decision.direction,
        component: decision.component,
        componentScore: decision.componentScore,
        reason: decision.reason,
        level: effectiveLevel,
        overrideActive: override !== null,
      }),
    );
    setCurriculumPoints([...history].reverse().map((entry) => ({ value: entry.level, label: shortDate(entry.changedAt) })));
  }, []);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );
  useEffect(() => subscribeToAllSessions(() => refresh()), [refresh]);

  async function handleRefresh() {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  }

  const hasScoredSessions = recentPoints.length > 0;

  return (
    <ScreenContainer style={styles.container}>
      <View style={styles.titleRow}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={12} accessibilityRole="button" accessibilityLabel="Back">
          <Ionicons name="chevron-back" size={26} color={colors.textPrimary} />
        </Pressable>
        <Text style={styles.title}>Deep review trends</Text>
      </View>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: spacing.lg + tabBarInset }]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.accent} />}
      >
        <HeroCard contentStyle={styles.streakCard} accent={colors.warning} accentSecondary={colors.pink}>
          <View style={styles.streakRow}>
            <Ionicons name="flame" size={28} color={streaks.currentStreak > 0 ? colors.warning : colors.textMuted} />
            <Text style={styles.streakNumber}>{streaks.currentStreak}</Text>
            <Text style={styles.streakLabel}>day streak</Text>
          </View>
          <Text style={styles.streakMeta}>
            Longest streak: {streaks.longestStreak} · Total sessions: {totalSessions}
          </Text>
          {highestStreakMilestone(streaks.longestStreak) ? (
            <Badge
              label={`🏆 ${highestStreakMilestone(streaks.longestStreak)}-day milestone`}
              fg={colors.warning}
              bg={colors.warningMuted}
            />
          ) : null}
        </HeroCard>

        <Card style={styles.curriculumCard}>
          <View style={styles.curriculumHeaderRow}>
            <View>
              <Text style={styles.sectionLabel}>YOUR LEVEL</Text>
              <Text style={styles.curriculumLevelText}>
                Level {curriculumLevel} · {difficultyTierLabel(levelToDifficultyTier(curriculumLevel))}
              </Text>
            </View>
            <Pressable
              onPress={() => navigation.navigate("Curriculum")}
              style={styles.curriculumLink}
              accessibilityRole="button"
              accessibilityLabel="View curriculum details"
            >
              <Text style={styles.curriculumLinkText}>Details</Text>
              <Ionicons name="chevron-forward" size={14} color={colors.accent} />
            </Pressable>
          </View>
          <Text style={styles.curriculumExplanation}>{curriculumExplanation}</Text>
          {curriculumPoints.length > 1 ? <ScoreTrendChart data={curriculumPoints} maxValue={5} noOfSections={4} height={100} /> : null}
        </Card>

        {!hasScoredSessions ? (
          <View style={styles.empty}>
            <Ionicons name="trending-up-outline" size={40} color={colors.textMuted} />
            <Text style={styles.emptyText}>
              Score trends will show up here once you have a few graded sessions.
            </Text>
          </View>
        ) : (
          <>
            <Card style={styles.weekCard}>
              <Text style={styles.sectionLabel}>THIS WEEK</Text>
              <View style={styles.weekHeaderRow}>
                <Text style={styles.weekSessionCount}>
                  {weekly?.thisWeek.sessionCount ?? 0} session{weekly?.thisWeek.sessionCount === 1 ? "" : "s"}
                </Text>
                {weekly?.thisWeek.topArchetype ? <Badge label={weekly.thisWeek.topArchetype} /> : null}
              </View>

              <View style={styles.weekStatRow}>
                <Text style={styles.weekStatLabel}>Overall</Text>
                <Text style={styles.weekStatValue}>{weekly?.thisWeek.avgOverall ?? "—"}/10</Text>
              </View>
              <DeltaIndicator current={weekly?.thisWeek.avgOverall ?? null} previous={weekly?.lastWeek.avgOverall ?? null} />

              <View style={styles.weekStatRow}>
                <Text style={styles.weekStatLabel}>Structure</Text>
                <Text style={styles.weekStatValue}>{weekly?.thisWeek.avgStructure ?? "—"}/10</Text>
              </View>
              <View style={styles.weekStatRow}>
                <Text style={styles.weekStatLabel}>Delivery</Text>
                <Text style={styles.weekStatValue}>{weekly?.thisWeek.avgDelivery ?? "—"}/10</Text>
              </View>
              <View style={styles.weekStatRow}>
                <Text style={styles.weekStatLabel}>Coherence</Text>
                <Text style={styles.weekStatValue}>{weekly?.thisWeek.avgCoherence ?? "—"}/10</Text>
              </View>
              <DeltaIndicator
                current={weekly?.thisWeek.avgCoherence ?? null}
                previous={weekly?.lastWeek.avgCoherence ?? null}
              />

              <View style={styles.weekStatRow}>
                <Text style={styles.weekStatLabel}>Repeated ideas</Text>
                <Text style={styles.weekStatValue}>{weekly?.thisWeek.avgRestatedPointRate ?? "—"}/min</Text>
              </View>
              <DeltaIndicator
                current={weekly?.thisWeek.avgRestatedPointRate ?? null}
                previous={weekly?.lastWeek.avgRestatedPointRate ?? null}
                invert
              />
            </Card>

            <Card style={styles.recentCard}>
              <Text style={styles.sectionLabel}>LAST {recentPoints.length} GRADED SESSIONS</Text>
              <ScoreTrendChart data={recentPoints} />
            </Card>
          </>
        )}
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  titleRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  // paddingBottom: 0 overrides ScreenContainer's default bottom padding —
  // this screen's own ScrollView already reserves breathing room via
  // scrollContent's paddingBottom, and the tab bar sits directly below with
  // no further gap needed, unlike stack-pushed screens with a fixed button.
  container: { gap: spacing.md, paddingBottom: 0 },
  title: { color: colors.textPrimary, fontSize: typography.title, fontWeight: "700" },
  scroll: { flex: 1 },
  scrollContent: { gap: spacing.md, paddingBottom: spacing.lg },
  streakCard: { gap: spacing.xs },
  streakRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  streakNumber: { color: colors.textPrimary, fontSize: typography.headline, fontFamily: fontDisplay.bold },
  streakLabel: { color: colors.textSecondary, fontSize: typography.body },
  streakMeta: { color: colors.textMuted, fontSize: typography.caption },
  sectionLabel: { color: colors.accent, fontSize: typography.caption - 1, fontWeight: "700", letterSpacing: 1 },
  curriculumCard: { gap: spacing.xs },
  curriculumHeaderRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  curriculumLevelText: { color: colors.textPrimary, fontSize: typography.bodyLarge, fontWeight: "700", marginTop: 2 },
  curriculumLink: { flexDirection: "row", alignItems: "center", gap: 2 },
  curriculumLinkText: { color: colors.accent, fontSize: typography.caption, fontWeight: "600" },
  curriculumExplanation: { color: colors.textSecondary, fontSize: typography.caption, lineHeight: 18 },
  weekCard: { gap: spacing.sm },
  weekHeaderRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  weekSessionCount: { color: colors.textPrimary, fontSize: typography.body, fontWeight: "600" },
  weekStatRow: { flexDirection: "row", justifyContent: "space-between", marginTop: spacing.xs },
  weekStatLabel: { color: colors.textSecondary, fontSize: typography.body },
  weekStatValue: { color: colors.textPrimary, fontSize: typography.body, fontWeight: "700" },
  deltaRow: { flexDirection: "row", alignItems: "center", gap: spacing.xs, marginTop: -spacing.xs },
  deltaText: { fontSize: typography.caption, fontWeight: "600" },
  deltaNeutral: { color: colors.textMuted, fontSize: typography.caption, marginTop: -spacing.xs },
  recentCard: { gap: spacing.md },
  empty: { alignItems: "center", justifyContent: "center", gap: spacing.md, paddingVertical: spacing.xxl },
  emptyText: { color: colors.textMuted, fontSize: typography.body, textAlign: "center", paddingHorizontal: spacing.xl },
});
