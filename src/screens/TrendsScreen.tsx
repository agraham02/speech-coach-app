import { useCallback, useEffect, useState } from "react";
import { RefreshControl, ScrollView, View } from "react-native";
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
import { spacing } from "../theme/theme";
import { Txt } from "../components/common/Txt";
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
    return <Txt variant="footnote" tone="muted" style={styles.deltaNeutral}>Not enough data yet</Txt>;
  }
  const diff = Math.round((current - previous) * 10) / 10;
  if (diff === 0) {
    return (
      <View style={styles.deltaRow}>
        <Ionicons name="remove" size={14} color={colors.textMuted} />
        <Txt variant="footnote" tone="muted">Same as last week</Txt>
      </View>
    );
  }
  const isUp = diff > 0;
  const isGood = invert ? !isUp : isUp;
  return (
    <View style={styles.deltaRow}>
      <Ionicons name={isUp ? "arrow-up" : "arrow-down"} size={14} color={isGood ? colors.success : colors.warning} />
      <Txt variant="footnote" weight="600" color={isGood ? colors.success : colors.warning}>
        {Math.abs(diff)} vs last week
      </Txt>
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
      <Txt variant="footnote" tone="accent" weight="600">{line === "message" ? "This week, Message, judged by Tono AI" : "This week, Delivery, measured on this phone"}</Txt>
      <Txt variant="headline">
        {thisWeek.sessionCount} take{thisWeek.sessionCount === 1 ? "" : "s"}
      </Txt>
      <View style={styles.weekStatRow}>
        <Txt variant="callout" tone="secondary">{line === "message" ? "Message" : "Delivery"}</Txt>
        <Txt variant="callout" weight="600">{thisWeek.score ?? "—"}/100</Txt>
      </View>
      <DeltaIndicator current={thisWeek.score} previous={lastWeek.score} />
      {line === "delivery" && TREND_PILLARS.map((pillar) => (
        <View key={pillar} style={styles.weekStatRow}>
          <Txt variant="callout" tone="secondary">{nodeName(pillar)}</Txt>
          <Txt variant="callout" weight="600">{thisWeek.byPillar[pillar] ?? "—"}/100</Txt>
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
            <Txt variant="title1">{streaks.currentStreak}</Txt>
            <Txt variant="callout" tone="secondary">day streak</Txt>
          </View>
          <Txt variant="footnote" tone="muted">
            Longest streak: {streaks.longestStreak} · Total sessions: {totalSessions}
          </Txt>
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
            <Txt variant="callout" tone="muted" align="center" style={styles.emptyText}>Score trends will show up here once you have a few scored takes.</Txt>
          </View>
        ) : (
          <>
            <Card style={styles.recentCard}>
              <Txt variant="footnote" tone="accent" weight="600">Last {Math.min(points.length, CHART_TAKES)} scored takes</Txt>
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
  scroll: { flex: 1 },
  scrollContent: { gap: spacing.md, paddingBottom: spacing.lg },
  streakCard: { gap: spacing.xs },
  streakRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  weekCard: { gap: spacing.sm },
  weekHeaderRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  weekStatRow: { flexDirection: "row", justifyContent: "space-between", marginTop: spacing.xs },
  deltaRow: { flexDirection: "row", alignItems: "center", gap: spacing.xs, marginTop: -spacing.xs },
  deltaNeutral: { marginTop: -spacing.xs },
  recentCard: { gap: spacing.md },
  empty: { alignItems: "center", justifyContent: "center", gap: spacing.md, paddingVertical: spacing.xxl },
  emptyText: { paddingHorizontal: spacing.xl },
}));
