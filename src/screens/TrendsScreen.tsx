import { useCallback, useEffect, useState } from "react";
import { Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../navigation";
import { ScreenContainer } from "../components/common/ScreenContainer";
import { Header } from "../components/common/Header";
import { Card } from "../components/common/Card";
import { Badge } from "../components/common/Badge";
import { SKILL_DEFS } from "../domain/scoring/taxonomy";
import type { Layer } from "../domain/scoring/taxonomy";
import { HeroCard } from "../components/common/HeroCard";
import { ScoreTrendChart, type TrendPoint } from "../components/trends/ScoreTrendChart";
import { ScoreLinesChart } from "../components/trends/ScoreLinesChart";
import { highestStreakMilestone } from "../domain/streaks";
import { getStreakState } from "../services/db/progressRepo";
import { computeThisWeekVsLastWeek, hasLayer, TREND_SKILLS, type ScorePoint } from "../domain/trends";
import {
  DEFAULT_CURRICULUM_LEVEL,
  difficultyTierLabel,
  explainCurriculumChange,
  levelToDifficultyTier,
  type CurriculumLevel,
} from "../domain/curriculum";
import { getCompletedSessionDates, getScoreSeries } from "../services/db/statsRepo";
import { getCurriculumHistory, recomputeCurriculumLevel } from "../services/db/curriculumRepo";
import { getCurriculumOverride } from "../services/prefs/prefsStore";
import { subscribeToAllSessions } from "../services/pipeline/processingEvents";
import { useTabBarBottomInset } from "../hooks/useTabBarBottomInset";
import { fontDisplay, spacing, typography, font } from "../theme/theme";
import { makeStyles, useTheme } from "../theme/ThemeProvider";

const RECENT_COUNT = 10;
const CHART_TAKES = 20;

function shortDate(isoDatetime: string): string {
  return new Date(isoDatetime).toLocaleDateString(undefined, { month: "numeric", day: "numeric" });
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

// One layer's week against the week before, by skill. Only takes that have
// the layer are in it, so a judged week and a measured week are never mixed.
function LayerWeek({ layer, points }: { layer: Layer; points: ScorePoint[] }) {
  const styles = useStyles();
  const { thisWeek, lastWeek } = computeThisWeekVsLastWeek(points, layer);
  return (
    <Card style={styles.weekCard}>
      <Text style={styles.sectionLabel}>{layer === "judged" ? "This week, judged by Tono AI" : "This week, measured on this phone"}</Text>
      <Text style={styles.weekSessionCount}>
        {thisWeek.sessionCount} take{thisWeek.sessionCount === 1 ? "" : "s"}
      </Text>
      <View style={styles.weekStatRow}>
        <Text style={styles.weekStatLabel}>Overall</Text>
        <Text style={styles.weekStatValue}>{thisWeek.overall ?? "—"}/10</Text>
      </View>
      <DeltaIndicator current={thisWeek.overall} previous={lastWeek.overall} />
      {TREND_SKILLS.map((skill) => (
        <View key={skill} style={styles.weekStatRow}>
          <Text style={styles.weekStatLabel}>{SKILL_DEFS[skill].label}</Text>
          <Text style={styles.weekStatValue}>{thisWeek.bySkill[skill] ?? "—"}/10</Text>
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
  const [curriculumLevel, setCurriculumLevel] = useState<CurriculumLevel>(DEFAULT_CURRICULUM_LEVEL);
  const [curriculumExplanation, setCurriculumExplanation] = useState("");
  const [curriculumPoints, setCurriculumPoints] = useState<TrendPoint[]>([]);

  const refresh = useCallback(async () => {
    const dates = await getCompletedSessionDates();
    setTotalSessions(dates.length);
    setStreaks(await getStreakState());

    setPoints(await getScoreSeries());

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

  const hasScoredSessions = points.length > 0;
  const layersShown = (["judged", "measured"] as Layer[]).filter((l) => hasLayer(points, l));

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

        <Card style={styles.curriculumCard}>
          <View style={styles.curriculumHeaderRow}>
            <View>
              <Text style={styles.sectionLabel}>Practice difficulty</Text>
              <Text style={styles.curriculumLevelText}>
                Step {curriculumLevel} · {difficultyTierLabel(levelToDifficultyTier(curriculumLevel))}
              </Text>
            </View>
            <Pressable
              onPress={() => navigation.navigate("Curriculum")}
              style={styles.curriculumLink}
              accessibilityRole="button"
              accessibilityLabel="View practice difficulty"
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
            <Text style={styles.emptyText}>Score trends will show up here once you have a few scored takes.</Text>
          </View>
        ) : (
          <>
            <Card style={styles.recentCard}>
              <Text style={styles.sectionLabel}>Last {Math.min(points.length, CHART_TAKES)} scored takes</Text>
              <ScoreLinesChart points={points.slice(-CHART_TAKES)} />
            </Card>
            {layersShown.map((layer) => (
              <LayerWeek key={layer} layer={layer} points={points} />
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
  curriculumCard: { gap: spacing.xs },
  curriculumHeaderRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  curriculumLevelText: { color: colors.textPrimary, fontSize: typography.bodyLarge, ...font("700"), marginTop: 2 },
  curriculumLink: { flexDirection: "row", alignItems: "center", gap: 2 },
  curriculumLinkText: { color: colors.accent, fontSize: typography.caption, ...font("600") },
  curriculumExplanation: { ...font("400"), color: colors.textSecondary, fontSize: typography.caption, lineHeight: 18 },
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
