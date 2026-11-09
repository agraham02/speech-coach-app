import { useCallback, useEffect, useState } from "react";
import { RefreshControl, ScrollView, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../navigation";
import { ScreenContainer } from "../components/common/ScreenContainer";
import { Header } from "../components/common/Header";
import { Card } from "../components/common/Card";
import { Badge } from "../components/common/Badge";
import { HeroCard } from "../components/common/HeroCard";
import { ScoreLinesChart } from "../components/trends/ScoreLinesChart";
import { highestStreakMilestone } from "../domain/streaks";
import { getStreakState } from "../services/db/progressRepo";
import { computeThisWeekVsLastWeek, hasLine, TREND_PILLARS, type ScorePoint, type TrendLine } from "../domain/trends";
import { nodeName } from "../domain/scoring/skillTree";
import { getCompletedSessionDates, getScoreSeries } from "../services/db/statsRepo";
import { subscribeToAllSessions } from "../services/pipeline/processingEvents";
import { useTabBarBottomInset } from "../hooks/useTabBarBottomInset";
import { fontDisplay, spacing, typography, font } from "../theme/theme";
import { makeStyles, useTheme } from "../theme/ThemeProvider";

const CHART_TAKES = 20;

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
  const styles = useStyles();
  const { colors } = useTheme();
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

// One line's week against the week before. Only takes that have the line are in
// it: everyone has Delivery, and only judged takes have Message.
function LineWeek({ line, points }: { line: TrendLine; points: ScorePoint[] }) {
  const styles = useStyles();
  const { thisWeek, lastWeek } = computeThisWeekVsLastWeek(points, line);
  return (
    <Card style={styles.weekCard}>
      <Text style={styles.sectionLabel}>{line === "message" ? "This week, Message, judged by Tono AI" : "This week, Delivery, measured on this phone"}</Text>
      <Text style={styles.weekSessionCount}>
        {thisWeek.sessionCount} take{thisWeek.sessionCount === 1 ? "" : "s"}
      </Text>
      <View style={styles.weekStatRow}>
        <Text style={styles.weekStatLabel}>{line === "message" ? "Message" : "Delivery"}</Text>
        <Text style={styles.weekStatValue}>{thisWeek.score ?? "—"}/100</Text>
      </View>
      <DeltaIndicator current={thisWeek.score} previous={lastWeek.score} />
      {line === "delivery" && TREND_PILLARS.map((pillar) => (
        <View key={pillar} style={styles.weekStatRow}>
          <Text style={styles.weekStatLabel}>{nodeName(pillar)}</Text>
          <Text style={styles.weekStatValue}>{thisWeek.byPillar[pillar] ?? "—"}/100</Text>
        </View>
      ))}
    </Card>
  );
}

export function TrendsScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const tabBarInset = useTabBarBottomInset();
  const [totalSessions, setTotalSessions] = useState(0);
  const [streaks, setStreaks] = useState({ currentStreak: 0, longestStreak: 0 });
  const [points, setPoints] = useState<ScorePoint[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const refresh = useCallback(async () => {
    const dates = await getCompletedSessionDates();
    setTotalSessions(dates.length);
    setStreaks(await getStreakState());

    setPoints(await getScoreSeries());

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

  const hasScoredSessions = points.length > 0;
  const linesShown = (["delivery", "message"] as TrendLine[]).filter((l) => hasLine(points, l));

  return (
    <ScreenContainer style={styles.container}>
      <Header title="Score trends" onBack={() => navigation.goBack()} backIcon="chevron-back"
      />
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

        {!hasScoredSessions ? (
          <View style={styles.empty}>
            <Ionicons name="trending-up-outline" size={40} color={colors.textMuted} />
            <Text style={styles.emptyText}>Score trends will show up here once you have a few scored takes.</Text>
          </View>
        ) : (
          <>
            <Card style={styles.recentCard}>
              <Text style={styles.sectionLabel}>Last {Math.min(points.length, CHART_TAKES)} scored takes</Text>
              <ScoreLinesChart points={points.slice(-CHART_TAKES)} />
            </Card>
            {linesShown.map((line) => (
              <LineWeek key={line} line={line} points={points} />
            ))}
          </>
        )}
      </ScrollView>
    </ScreenContainer>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  titleRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  // paddingBottom: 0 overrides ScreenContainer's default bottom padding —
  // this screen's own ScrollView already reserves breathing room via
  // scrollContent's paddingBottom, and the tab bar sits directly below with
  // no further gap needed, unlike stack-pushed screens with a fixed button.
  container: { gap: spacing.md, paddingBottom: 0 },
  title: { color: colors.textPrimary, fontSize: typography.title, ...font("700") },
  scroll: { flex: 1 },
  scrollContent: { gap: spacing.md, paddingBottom: spacing.lg },
  streakCard: { gap: spacing.xs },
  streakRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  streakNumber: { color: colors.textPrimary, fontSize: typography.headline, fontFamily: fontDisplay.title },
  streakLabel: { ...font("400"), color: colors.textSecondary, fontSize: typography.body },
  streakMeta: { ...font("400"), color: colors.textMuted, fontSize: typography.caption },
  sectionLabel: { color: colors.accent, fontSize: 13, ...font("600") },
  weekCard: { gap: spacing.sm },
  weekHeaderRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  weekSessionCount: { color: colors.textPrimary, fontSize: typography.body, ...font("600") },
  weekStatRow: { flexDirection: "row", justifyContent: "space-between", marginTop: spacing.xs },
  weekStatLabel: { ...font("400"), color: colors.textSecondary, fontSize: typography.body },
  weekStatValue: { color: colors.textPrimary, fontSize: typography.body, ...font("700") },
  deltaRow: { flexDirection: "row", alignItems: "center", gap: spacing.xs, marginTop: -spacing.xs },
  deltaText: { fontSize: typography.caption, ...font("600") },
  deltaNeutral: { ...font("400"), color: colors.textMuted, fontSize: typography.caption, marginTop: -spacing.xs },
  recentCard: { gap: spacing.md },
  empty: { alignItems: "center", justifyContent: "center", gap: spacing.md, paddingVertical: spacing.xxl },
  emptyText: { ...font("400"), color: colors.textMuted, fontSize: typography.body, textAlign: "center", paddingHorizontal: spacing.xl },
}));
