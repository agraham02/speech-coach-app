import { useCallback, useState } from "react";
import { ScrollView, View } from "react-native";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../navigation";
import { ScreenContainer } from "../components/common/ScreenContainer";
import { Header } from "../components/common/Header";
import { Card } from "../components/common/Card";
import { Txt } from "../components/common/Txt";
import { ChipGroup } from "../components/common/Chip";
import { ListRow } from "../components/common/ListRow";
import { SkillRings } from "../components/common/SkillRings";
import { MetricChart } from "../components/common/MetricChart";
import { StatTile } from "../components/common/StatTile";
import { ConversationProgress } from "../components/conversation/ConversationProgress";
import { ProgressProfileCards } from "../components/onboarding/SkillCheckCards";
import { useTabBarBottomInset } from "../hooks/useTabBarBottomInset";
import { getAllDrillLevels, getDailySessionCounts, getPracticeDates, getRecentDrillAttempts, getSkillStates } from "../services/db/progressRepo";
import { getDailySessionGoal, getReminderSettings } from "../services/prefs/prefsStore";
import { goalDays } from "../domain/dailyGoal";
import { getSessionMetricSeries, getWeeklySummaries, type SessionMetricPoint, type WeekSummary } from "../services/db/statsRepo";
import { computeStreaks } from "../domain/streaks";
import { DRILL_SKILL, DRILL_TITLES, type DrillType } from "../domain/drills/drillSpecs";
import { SKILL_LABELS, type SkillId } from "../theme/tokens";
import { SKILLS } from "../domain/mastery";
import { makeStyles, useTheme } from "../theme/ThemeProvider";

const WEEKS = 5;

function emptyBySkill(): Record<SkillId, number[]> {
  return Object.fromEntries(SKILLS.map((s) => [s, []])) as unknown as Record<SkillId, number[]>;
}

function localDay(iso: string): string {
  const d = new Date(iso.length === 10 ? `${iso}T12:00:00` : iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// How you're improving — every chart here is measured on-device.
export function ProgressScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const tabBarInset = useTabBarBottomInset();
  const [mastery, setMastery] = useState<Record<SkillId, number> | null>(null);
  const [skill, setSkill] = useState<SkillId>("articulation");
  const [drillScores, setDrillScores] = useState<Record<SkillId, number[]>>(emptyBySkill);
  const [levels, setLevels] = useState<{ type: DrillType; level: number }[]>([]);
  const [series, setSeries] = useState<SessionMetricPoint[]>([]);
  const [practiceDays, setPracticeDays] = useState<Set<string>>(new Set());
  const [streak, setStreak] = useState({ current: 0, longest: 0 });
  const [weeks2, setWeeks2] = useState<{ thisWeek: WeekSummary; lastWeek: WeekSummary } | null>(null);
  // Daily goal above 1: days in the last week the goal was met.
  const [goalWeek, setGoalWeek] = useState<{ goal: number; met: number; of: number } | null>(null);

  useFocusEffect(
    useCallback(() => {
      getSkillStates().then((s) => setMastery(Object.fromEntries(SKILLS.map((k) => [k, s[k].rating])) as Record<SkillId, number>));
      getRecentDrillAttempts(300).then((attempts) => {
        const bySkill = emptyBySkill();
        for (const a of [...attempts].reverse()) {
          const k = a.skill ?? DRILL_SKILL[a.drillType];
          if (k && a.score != null) bySkill[k].push(Math.round(a.score * 100));
        }
        for (const k of SKILLS) bySkill[k] = bySkill[k].slice(-20);
        setDrillScores(bySkill);
      });
      getAllDrillLevels().then((all) =>
        setLevels(
          Object.entries(all)
            .map(([type, v]) => ({ type: type as DrillType, level: v!.level }))
            .filter((l) => DRILL_TITLES[l.type]),
        ),
      );
      getSessionMetricSeries(30).then(setSeries);
      getWeeklySummaries().then(setWeeks2);
      const goal = getDailySessionGoal();
      if (goal > 1) {
        getDailySessionCounts().then((counts) => setGoalWeek({ goal, ...goalDays(counts, goal, new Date(), 7, getReminderSettings().practiceDays) }));
      } else {
        setGoalWeek(null);
      }
      getPracticeDates().then((dates) => {
        const s = computeStreaks(dates, new Date(), getReminderSettings().practiceDays);
        setStreak({ current: s.currentStreak, longest: s.longestStreak });
        setPracticeDays(new Set(dates.map(localDay)));
      });
    }, []),
  );

  // Last WEEKS weeks, Monday-first, oldest row first.
  const today = new Date();
  const start = new Date(today);
  start.setDate(today.getDate() - ((today.getDay() + 6) % 7) - (WEEKS - 1) * 7);
  const weeks: { day: string; future: boolean }[][] = [];
  for (let w = 0; w < WEEKS; w++) {
    const row: { day: string; future: boolean }[] = [];
    for (let d = 0; d < 7; d++) {
      const date = new Date(start);
      date.setDate(start.getDate() + w * 7 + d);
      row.push({ day: localDay(date.toISOString()), future: date > today });
    }
    weeks.push(row);
  }

  const c = colors.skill[skill];
  const skillLevels = levels.filter((l) => DRILL_SKILL[l.type] === skill && l.type !== "guided" && l.type !== "warmup");

  return (
    <ScreenContainer style={styles.container} edges={["top", "left", "right"]}>
      <Header title="Progress" large />
      <ScrollView contentContainerStyle={[styles.scroll, { paddingBottom: tabBarInset + 24 }]} showsVerticalScrollIndicator={false}>
        <ProgressProfileCards />
        {mastery ? (
          <Card style={styles.card}>
            <Txt variant="caption2" tone="muted" uppercase>
              Skill mastery
            </Txt>
            <SkillRings mastery={mastery} />
            <Txt variant="footnote" tone="secondary">
              Mastery rises when you beat what your current level predicts, and drill difficulty adjusts so you succeed about 4 times in 5.
            </Txt>
          </Card>
        ) : null}

        <Card style={styles.card}>
          <View style={styles.row}>
            <StatTile value={`${streak.current}`} label="day streak" color={colors.warning} />
            <StatTile value={`${streak.longest}`} label="longest" />
            {goalWeek ? <StatTile value={`${goalWeek.met}/${goalWeek.of}`} label={`days at ${goalWeek.goal} a day`} color={goalWeek.met ? colors.success : undefined} /> : null}
          </View>
          <View style={styles.calendar}>
            {weeks.map((row, i) => (
              <View key={i} style={styles.calendarRow}>
                {row.map((cell) => (
                  <View
                    key={cell.day}
                    style={[
                      styles.dayCell,
                      practiceDays.has(cell.day) && { backgroundColor: colors.success },
                      cell.future && styles.dayFuture,
                    ]}
                    accessibilityLabel={`${cell.day}${practiceDays.has(cell.day) ? ", practiced" : ""}`}
                  />
                ))}
              </View>
            ))}
          </View>
        </Card>

        {weeks2 ? (
          <Card style={styles.card}>
            <Txt variant="caption2" tone="muted" uppercase>
              This week vs last week
            </Txt>
            <View style={styles.row}>
              <StatTile value={`${weeks2.thisWeek.practiceDays}`} label={`days (last: ${weeks2.lastWeek.practiceDays})`} />
              <StatTile value={`${weeks2.thisWeek.reps}`} label={`reps (last: ${weeks2.lastWeek.reps})`} />
              <StatTile value={`${weeks2.thisWeek.drills}`} label={`drills (last: ${weeks2.lastWeek.drills})`} />
            </View>
            {weeks2.thisWeek.avgDrillScore != null ? (
              <Txt variant="footnote" tone="secondary">
                Average drill score {weeks2.thisWeek.avgDrillScore}%
                {weeks2.lastWeek.avgDrillScore != null ? ` (last week ${weeks2.lastWeek.avgDrillScore}%)` : ""} — drills get harder as you
                improve, so a steady score means you're climbing.
              </Txt>
            ) : null}
          </Card>
        ) : null}

        <ChipGroup scroll options={SKILLS.map((s) => ({ key: s, label: SKILL_LABELS[s] }))} value={skill} onChange={setSkill} />
        <Card style={styles.card}>
          {/* Conversation drills are scored on process, not quality, so no
              percentage chart for them — see ConversationProgress instead. */}
          {skill !== "conversation" ? (
            <MetricChart title="Drill scores" values={drillScores[skill]} color={c.fg} maxValue={100} unit="%" emptyText="Do a few drills in this track to see a trend." />
          ) : (
            <>
              <Txt variant="headline">Drill levels</Txt>
              {skillLevels.length === 0 ? (
                <Txt variant="footnote" tone="muted">
                  Do a few conversation drills to see your levels.
                </Txt>
              ) : null}
            </>
          )}
          {skillLevels.length > 0 ? (
            <View style={styles.levels}>
              {skillLevels.map((l) => (
                <View key={l.type} style={styles.levelRow}>
                  <Txt variant="footnote" tone="secondary" style={styles.flex}>
                    {DRILL_TITLES[l.type]}
                  </Txt>
                  <Txt variant="footnote" weight="700" color={c.fg}>
                    level {l.level.toFixed(1)}
                  </Txt>
                </View>
              ))}
            </View>
          ) : null}
        </Card>

        {skill === "conversation" ? <ConversationProgress /> : null}

        <Card style={styles.card}>
          <MetricChart title="Pace" values={series.map((p) => p.wpm).filter((v): v is number => v != null)} unit="wpm" color={colors.skill.cadence.fg} />
        </Card>
        <Card style={styles.card}>
          <MetricChart
            title="Filler words"
            values={series.map((p) => p.fillerRate).filter((v): v is number => v != null)}
            unit="/min"
            color={colors.skill.impromptu.fg}
          />
        </Card>
        <Card style={styles.card}>
          <MetricChart
            title="Eye contact"
            values={series.map((p) => p.eyeContact).filter((v): v is number => v != null)}
            unit="%"
            maxValue={100}
            color={colors.skill.confidence.fg}
          />
        </Card>

        <Card style={styles.links}>
          <ListRow icon="speedometer-outline" title="Level & difficulty" subtitle="Your impromptu level and manual override" chevron onPress={() => navigation.navigate("Curriculum")} />
          <ListRow icon="analytics-outline" title="Deep review trends" subtitle="Scores from cloud deep reviews" chevron onPress={() => navigation.navigate("Trends")} />
        </Card>
      </ScrollView>
    </ScreenContainer>
  );
}

const useStyles = makeStyles((t) => ({
  container: { gap: t.space.md, paddingBottom: 0 },
  scroll: { gap: t.space.md },
  card: { gap: t.space.md },
  row: { flexDirection: "row", gap: t.space.sm },
  flex: { flex: 1 },
  calendar: { gap: 6 },
  calendarRow: { flexDirection: "row", justifyContent: "space-between" },
  dayCell: { width: 32, height: 32, borderRadius: 8, backgroundColor: t.colors.surfaceRaised },
  dayFuture: { opacity: 0.3 },
  levels: { gap: 4 },
  levelRow: { flexDirection: "row", alignItems: "center" },
  links: { paddingVertical: t.space.sm },
}));
