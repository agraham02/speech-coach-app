import { useCallback, useState } from "react";
import { Skeleton } from "../components/common/Skeleton";
import { GuideTip } from "../components/common/GuideTip";
import { StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import Animated, { FadeIn } from "react-native-reanimated";
import type { RootStackParamList } from "../navigation";
import { Screen } from "../components/common/Screen";
import { Card } from "../components/common/Card";
import { HeroCard } from "../components/common/HeroCard";
import { Txt } from "../components/common/Txt";
import { Chip } from "../components/common/Chip";
import { ListGroup, ListRow } from "../components/common/ListRow";
import { SectionHeader } from "../components/common/SectionHeader";
import { SkillRings } from "../components/common/SkillRings";
import { MetricChart } from "../components/common/MetricChart";
import { ConversationProgress } from "../components/conversation/ConversationProgress";
import { ProgressProfileCards } from "../components/onboarding/SkillCheckCards";
import { getAllDrillLevels, getDailySessionCounts, getPracticeDates, getRecentDrillAttempts, getSkillStates } from "../services/db/progressRepo";
import { getDailySessionGoal, getReminderSettings } from "../services/prefs/prefsStore";
import { goalDays } from "../domain/dailyGoal";
import { getSessionMetricSeries, getWeeklySummaries, type SessionMetricPoint, type WeekSummary } from "../services/db/statsRepo";
import { computeStreaks } from "../domain/streaks";
import { DRILL_SKILL, DRILL_TITLES, type DrillType } from "../domain/drills/drillSpecs";
import { SKILL_LABELS, type SkillId } from "../theme/tokens";
import { SKILLS } from "../domain/mastery";
import { makeStyles, useTheme } from "../theme/ThemeProvider";
import { duration } from "../theme/motion";

const WEEKS = 5;
const WEEKDAYS = ["M", "T", "W", "T", "F", "S", "S"];

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
  const todayKey = localDay(today.toISOString());
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
    <Screen tabRoot large title="Progress">
      <ProgressProfileCards />

      <HeroCard accent={colors.warning} contentStyle={styles.streakCard}>
        <View style={styles.streakTop}>
          <View style={styles.streakNumber}>
            <Txt variant="display" tabular>
              {streak.current}
            </Txt>
            <View style={styles.streakLabel}>
              <Ionicons name="flame" size={16} color={colors.warning} />
              <Txt variant="subhead" weight="600">
                day streak
              </Txt>
            </View>
          </View>
          <View style={styles.streakSide}>
            <Txt variant="footnote" tone="secondary" align="right">
              Longest
            </Txt>
            <Txt variant="title2" align="right" tabular>
              {streak.longest}
            </Txt>
            {goalWeek ? (
              <>
                <Txt variant="footnote" tone="secondary" align="right" style={styles.sideGap}>
                  {goalWeek.goal} a day
                </Txt>
                <Txt variant="title2" align="right" tabular color={goalWeek.met ? colors.success : undefined}>
                  {goalWeek.met}/{goalWeek.of}
                </Txt>
              </>
            ) : null}
          </View>
        </View>
        <View style={styles.calendar}>
          <View style={styles.calendarRow}>
            {WEEKDAYS.map((d, i) => (
              <Txt key={i} variant="caption2" tone="muted" align="center" style={styles.weekday}>
                {d}
              </Txt>
            ))}
          </View>
          {weeks.map((row, i) => (
            <View key={i} style={styles.calendarRow}>
              {row.map((cell) => {
                const practiced = practiceDays.has(cell.day);
                return (
                  <View
                    key={cell.day}
                    style={[
                      styles.dayCell,
                      practiced && styles.dayPracticed,
                      cell.day === todayKey && styles.dayToday,
                      cell.future && styles.dayFuture,
                    ]}
                    accessibilityLabel={`${cell.day}${practiced ? ", practiced" : ""}`}
                  />
                );
              })}
            </View>
          ))}
        </View>
      </HeroCard>

      {weeks2 ? (
        <View style={styles.section}>
          <SectionHeader title="This week" />
          <Card style={styles.weekRow}>
            <WeekStat value={weeks2.thisWeek.practiceDays} last={weeks2.lastWeek.practiceDays} label="days" />
            <View style={styles.vRule} />
            <WeekStat value={weeks2.thisWeek.reps} last={weeks2.lastWeek.reps} label="reps" />
            <View style={styles.vRule} />
            <WeekStat value={weeks2.thisWeek.drills} last={weeks2.lastWeek.drills} label="drills" />
          </Card>
          {weeks2.thisWeek.avgDrillScore != null ? (
            <Txt variant="footnote" tone="secondary" style={styles.note}>
              Average drill score {weeks2.thisWeek.avgDrillScore}%
              {weeks2.lastWeek.avgDrillScore != null ? ` (last week ${weeks2.lastWeek.avgDrillScore}%)` : ""} — drills get harder as you improve,
              so a steady score means you're climbing.
            </Txt>
          ) : null}
        </View>
      ) : (
        <View style={styles.section}>
          <SectionHeader title="This week" />
          <Skeleton height={76} radius={20} />
        </View>
      )}

      {mastery ? (
        <View style={styles.section}>
          <SectionHeader title="Skill mastery" subtitle="Rises when you beat what your level predicts. Drills adjust so you succeed about 4 times in 5." />
          <Card>
            <SkillRings mastery={mastery} />
          </Card>
        </View>
      ) : null}

      <View style={styles.section}>
        <SectionHeader title="By skill" />
        <View style={styles.chips}>
          {SKILLS.map((s) => (
            <Chip key={s} label={SKILL_LABELS[s]} dot={colors.skill[s].fg} selected={s === skill} onPress={() => setSkill(s)} />
          ))}
        </View>
        <Animated.View key={skill} entering={FadeIn.duration(duration.base)}>
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
                    <Txt variant="subhead" tone="secondary" style={styles.flex}>
                      {DRILL_TITLES[l.type]}
                    </Txt>
                    <View style={styles.levelBar}>
                      <View style={[styles.levelFill, { width: `${Math.min(100, (l.level / 10) * 100)}%`, backgroundColor: c.fg }]} />
                    </View>
                    <Txt variant="footnote" weight="600" tabular style={styles.levelValue}>
                      {l.level.toFixed(1)}
                    </Txt>
                  </View>
                ))}
              </View>
            ) : null}
          </Card>
        </Animated.View>
        {skill === "conversation" ? <ConversationProgress /> : null}
      </View>

      <View style={styles.section}>
        <SectionHeader title="Your recordings" subtitle="The last 30, measured on your phone." />
        <Card>
          <MetricChart title="Pace" values={series.map((p) => p.wpm).filter((v): v is number => v != null)} unit="wpm" color={colors.skill.cadence.fg} />
        </Card>
        <Card>
          <MetricChart
            title="Filler words"
            values={series.map((p) => p.fillerRate).filter((v): v is number => v != null)}
            unit="/min"
            color={colors.skill.impromptu.fg}
          />
        </Card>
        <Card>
          <MetricChart
            title="Eye contact"
            values={series.map((p) => p.eyeContact).filter((v): v is number => v != null)}
            unit="%"
            maxValue={100}
            color={colors.skill.confidence.fg}
          />
        </Card>
      </View>

      <ListGroup>
        <ListRow icon="speedometer-outline" title="Level & difficulty" subtitle="Your impromptu level and manual override" chevron onPress={() => navigation.navigate("Curriculum")} />
        <ListRow icon="analytics-outline" title="Deep review trends" subtitle="Scores from cloud deep reviews" chevron onPress={() => navigation.navigate("Trends")} />
      </ListGroup>
      <GuideTip id="progress" />
    </Screen>
  );
}

// One number with its change from last week.
function WeekStat({ value, last, label }: { value: number; last: number; label: string }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const diff = value - last;
  return (
    <View style={styles.weekStat}>
      <Txt variant="title1" tabular>
        {value}
      </Txt>
      <Txt variant="footnote" tone="secondary">
        {label}
      </Txt>
      <View style={styles.delta}>
        {diff !== 0 ? <Ionicons name={diff > 0 ? "arrow-up" : "arrow-down"} size={11} color={diff > 0 ? colors.success : colors.textMuted} /> : null}
        <Txt variant="caption1" color={diff > 0 ? colors.success : colors.textMuted} tabular>
          {diff === 0 ? "no change" : `${Math.abs(diff)} vs last week`}
        </Txt>
      </View>
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  section: { gap: t.space.sm + 4 },
  note: { paddingHorizontal: 2 },
  card: { gap: t.space.md },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: t.space.sm },
  flex: { flex: 1 },
  streakCard: { gap: t.space.lg },
  streakTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  streakNumber: { gap: 0 },
  streakLabel: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: -2 },
  streakSide: { alignItems: "flex-end", gap: 0, paddingTop: 6 },
  sideGap: { marginTop: t.space.sm },
  calendar: { gap: 7 },
  calendarRow: { flexDirection: "row", justifyContent: "space-between" },
  weekday: { width: 34 },
  dayCell: { width: 34, height: 34, borderRadius: 10, backgroundColor: t.scheme === "dark" ? "rgba(255,250,235,0.06)" : "rgba(28,25,15,0.06)" },
  dayPracticed: { backgroundColor: t.colors.accent },
  dayToday: { borderWidth: 1.5, borderColor: t.colors.accent },
  dayFuture: { opacity: 0.35 },
  weekRow: { flexDirection: "row", alignItems: "stretch", paddingVertical: t.space.md },
  weekStat: { flex: 1, alignItems: "center", gap: 0 },
  vRule: { width: StyleSheet.hairlineWidth, backgroundColor: t.colors.separator },
  delta: { flexDirection: "row", alignItems: "center", gap: 2, marginTop: 4 },
  levels: { gap: t.space.sm + 2 },
  levelRow: { flexDirection: "row", alignItems: "center", gap: t.space.sm },
  levelBar: { width: 80, height: 4, borderRadius: 2, backgroundColor: t.colors.surfaceRaised, overflow: "hidden" },
  levelFill: { height: 4, borderRadius: 2 },
  levelValue: { width: 28, textAlign: "right" },
}));
