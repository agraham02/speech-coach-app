import { useCallback, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../navigation";
import { ScreenContainer } from "../components/common/ScreenContainer";
import { Header } from "../components/common/Header";
import { Card } from "../components/common/Card";
import { Txt } from "../components/common/Txt";
import { ChipGroup } from "../components/common/Chip";
import { PrimaryButton } from "../components/common/PrimaryButton";
import { SkillRings } from "../components/common/SkillRings";
import { ListRow } from "../components/common/ListRow";
import { ConversationTodayCard } from "../components/conversation/ConversationTodayCard";
import { FeelingWeekCard } from "../components/feelings/FeelingWeekCard";
import { useTabBarBottomInset } from "../hooks/useTabBarBottomInset";
import { getCompletedTopUpSlots, getSkillStates, getTodaysPlan, getTopUpPlan, getPracticeDates, getSessionsDoneToday, type StoredPlan } from "../services/db/progressRepo";
import { getDailySessionGoal, getPlanMinutes, getPracticeAnchor, getReminderSettings, setPlanMinutes } from "../services/prefs/prefsStore";
import { formatReminderHour, reminderHours } from "../domain/reminderSettings";
import { computeStreaks } from "../domain/streaks";
import { SKILLS } from "../domain/mastery";
import { getLesson } from "../content/lessons";
import { SKILL_LABELS, type SkillId } from "../theme/tokens";
import type { PlanStepKind } from "../domain/dailyPlan";
import { makeStyles, useTheme } from "../theme/ThemeProvider";

const STEP_ICONS: Record<PlanStepKind, keyof typeof Ionicons.glyphMap> = {
  warmup: "body-outline",
  line: "text-outline",
  drill: "pulse-outline",
  guided: "list-outline",
  rep: "videocam-outline",
  review: "eye-outline",
};

function greeting(): string {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

// The home of the app: one short daily session, chosen for you.
export function TodayScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const tabBarInset = useTabBarBottomInset();
  const [minutes, setMinutes] = useState(getPlanMinutes());
  const [stored, setStored] = useState<StoredPlan | null>(null);
  const [mastery, setMastery] = useState<Record<SkillId, number> | null>(null);
  const [streak, setStreak] = useState(0);
  const [goal, setGoal] = useState(getDailySessionGoal());
  const [doneToday, setDoneToday] = useState(0);
  const [topUp, setTopUp] = useState<{ slot: 1 | 2; stored: StoredPlan } | null>(null);
  const anchor = getPracticeAnchor();

  const load = useCallback(
    (m = minutes) => {
      getTodaysPlan(m).then(setStored);
      getSkillStates().then((s) => setMastery(Object.fromEntries(SKILLS.map((k) => [k, s[k].rating])) as Record<SkillId, number>));
      getPracticeDates().then((dates) => setStreak(computeStreaks(dates, new Date(), getReminderSettings().practiceDays).currentStreak));
      const g = getDailySessionGoal();
      setGoal(g);
      getSessionsDoneToday().then(setDoneToday);
      // The next top-up, once the main plan is finished.
      Promise.all([getTodaysPlan(m), getCompletedTopUpSlots()]).then(async ([main, slots]) => {
        const next = ([1, 2] as const).find((s) => s < g && !slots.includes(s));
        setTopUp(main.completedAt && next ? { slot: next, stored: await getTopUpPlan(next) } : null);
      });
    },
    [minutes],
  );

  useFocusEffect(load);

  function changeMinutes(key: string) {
    const m = Number(key) as 5 | 8 | 12;
    setMinutes(m);
    setPlanMinutes(m);
    getTodaysPlan(m, true).then(setStored);
  }

  const plan = stored?.plan;
  const done = new Set(stored?.completedStepIds ?? []);
  const lesson = plan ? getLesson(plan.lessonId) : undefined;
  const started = done.size > 0;
  const finished = !!stored?.completedAt;
  const focus = plan ? colors.skill[plan.focusSkill] : null;

  return (
    <ScreenContainer style={styles.container} edges={["top", "left", "right"]}>
      <Header
        eyebrow={greeting()}
        title="Today"
        large
        right={
          <Pressable onPress={() => navigation.navigate("Settings")} hitSlop={12} accessibilityRole="button" accessibilityLabel="Settings">
            <Ionicons name="settings-outline" size={24} color={colors.textSecondary} />
          </Pressable>
        }
      />
      <ScrollView contentContainerStyle={[styles.scroll, { paddingBottom: tabBarInset + 24 }]} showsVerticalScrollIndicator={false}>
        {streak > 0 ? (
          <View style={styles.streak}>
            <Ionicons name="flame" size={16} color={colors.warning} />
            <Txt variant="subhead" weight="600">
              {streak}-day streak
            </Txt>
          </View>
        ) : null}

        {goal > 1 ? (
          <View style={styles.goalRow} accessibilityLabel={`${Math.min(doneToday, goal)} of ${goal} sessions today`}>
            {Array.from({ length: goal }, (_, i) => (
              <View key={i} style={[styles.goalDot, i < doneToday && { backgroundColor: colors.success, borderColor: colors.success }]} />
            ))}
            <Txt variant="footnote" tone="secondary">
              {Math.min(doneToday, goal)} of {goal} sessions today{doneToday >= goal ? " · goal met" : ""}
            </Txt>
          </View>
        ) : null}
        {anchor && doneToday === 0 ? (
          <Txt variant="footnote" tone="muted">
            Your plan: {anchor.charAt(0).toLowerCase() + anchor.slice(1)}, practice.
          </Txt>
        ) : null}

        {topUp ? <TopUpCard slot={topUp.slot} stored={topUp.stored} goal={goal} onStart={() => navigation.navigate("DailySession", { slot: topUp.slot })} /> : null}

        {plan && lesson && focus ? (
          <Card style={styles.planCard}>
            <View style={styles.planHeader}>
              <Txt variant="caption2" tone="muted" uppercase>
                Today · {plan.minutes} min
              </Txt>
              <View style={[styles.focusPill, { backgroundColor: focus.bg }]}>
                <Txt variant="caption1" weight="700" color={focus.fg}>
                  {SKILL_LABELS[plan.focusSkill]}
                </Txt>
              </View>
            </View>
            <Txt variant="title2">{lesson.title}</Txt>
            <Txt variant="subhead" tone="secondary">
              {plan.isReview ? "Review — " : ""}
              {lesson.teach.why.split(". ")[0]}.
            </Txt>
            <View style={styles.steps}>
              {plan.steps.map((step) => {
                const isDone = done.has(step.id);
                return (
                  <View key={step.id} style={styles.step}>
                    <Ionicons
                      name={isDone ? "checkmark-circle" : STEP_ICONS[step.kind]}
                      size={20}
                      color={isDone ? colors.success : colors.textSecondary}
                    />
                    <Txt variant="callout" tone={isDone ? "muted" : "primary"} style={styles.flex}>
                      {step.title}
                    </Txt>
                    <Txt variant="footnote" tone="muted">
                      {step.minutes} min
                    </Txt>
                  </View>
                );
              })}
            </View>
            {finished ? (
              <View style={styles.finished}>
                <Ionicons name="trophy-outline" size={20} color={colors.success} />
                <Txt variant="headline" tone="success">
                  Done for today
                </Txt>
              </View>
            ) : (
              <PrimaryButton label={started ? "Continue" : "Start session"} onPress={() => navigation.navigate("DailySession")} />
            )}
            {!started ? (
              <ChipGroup
                options={[
                  { key: "5", label: "5 min" },
                  { key: "8", label: "8 min" },
                  { key: "12", label: "12 min" },
                ]}
                value={String(minutes)}
                onChange={changeMinutes}
              />
            ) : null}
          </Card>
        ) : null}

        <FeelingWeekCard />

        <ConversationTodayCard />

        {mastery ? (
          <Card style={styles.card}>
            <Txt variant="caption2" tone="muted" uppercase>
              Your skills
            </Txt>
            <SkillRings mastery={mastery} focus={plan?.focusSkill} />
          </Card>
        ) : null}

        <Card style={styles.card}>
          <ListRow
            icon="mic-outline"
            title="Practice something else"
            subtitle="Today's prompt, free record, scripts, drills"
            chevron
            onPress={() => navigation.navigate("Practice")}
          />
        </Card>
      </ScrollView>
    </ScreenContainer>
  );
}

function TopUpCard({ slot, stored, goal, onStart }: { slot: 1 | 2; stored: StoredPlan; goal: number; onStart: () => void }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const focus = colors.skill[stored.plan.focusSkill];
  const minutes = stored.plan.steps.reduce((m, s) => m + s.minutes, 0);
  const hour = reminderHours(getReminderSettings(), goal)[slot];
  const suggestion =
    hour != null && new Date().getHours() < hour
      ? `Best around ${formatReminderHour(hour)} — spacing sessions out helps them stick.`
      : "A good time for it now.";
  return (
    <Card style={styles.planCard}>
      <View style={styles.planHeader}>
        <Txt variant="caption2" tone="muted" uppercase>
          Top-up · session {slot + 1} of {goal} · {minutes} min
        </Txt>
        <View style={[styles.focusPill, { backgroundColor: focus.bg }]}>
          <Txt variant="caption1" weight="700" color={focus.fg}>
            {SKILL_LABELS[stored.plan.focusSkill]}
          </Txt>
        </View>
      </View>
      <View style={styles.steps}>
        {stored.plan.steps.map((step) => (
          <View key={step.id} style={styles.step}>
            <Ionicons name={stored.completedStepIds.includes(step.id) ? "checkmark-circle" : STEP_ICONS[step.kind]} size={20} color={colors.textSecondary} />
            <Txt variant="callout" style={styles.flex}>
              {step.title}
            </Txt>
            <Txt variant="footnote" tone="muted">
              {step.minutes} min
            </Txt>
          </View>
        ))}
      </View>
      <Txt variant="footnote" tone="secondary">
        {suggestion}
      </Txt>
      <PrimaryButton label={stored.completedStepIds.length ? "Continue top-up" : "Start top-up"} onPress={onStart} />
    </Card>
  );
}

const useStyles = makeStyles((t) => ({
  goalRow: { flexDirection: "row", alignItems: "center", gap: t.space.xs },
  goalDot: { width: 10, height: 10, borderRadius: 5, borderWidth: 1.5, borderColor: t.colors.textMuted },
  container: { gap: t.space.md, paddingBottom: 0 },
  scroll: { gap: t.space.md },
  streak: { flexDirection: "row", alignItems: "center", gap: t.space.xs },
  planCard: { gap: t.space.md },
  planHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  focusPill: { paddingHorizontal: t.space.sm + 2, paddingVertical: 4, borderRadius: t.radius.pill },
  steps: { gap: t.space.sm },
  step: { flexDirection: "row", alignItems: "center", gap: t.space.md },
  flex: { flex: 1 },
  finished: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: t.space.sm, paddingVertical: t.space.sm },
  card: { gap: t.space.md },
}));
