import { useCallback, useState } from "react";
import { Skeleton, SkeletonLines } from "../components/common/Skeleton";
import { GuideTip, TourTarget } from "../components/common/GuideTip";
import { View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../navigation";
import { Screen } from "../components/common/Screen";
import { Card } from "../components/common/Card";
import { HeroCard } from "../components/common/HeroCard";
import { Txt } from "../components/common/Txt";
import { Badge } from "../components/common/Badge";
import { SegmentedControl } from "../components/common/SegmentedControl";
import { PrimaryButton } from "../components/common/PrimaryButton";
import { SectionHeader } from "../components/common/SectionHeader";
import { SkillRings } from "../components/common/SkillRings";
import { StepTimeline } from "../components/common/StepTimeline";
import { ListGroup, ListRow } from "../components/common/ListRow";
import { ConversationTodayCard } from "../components/conversation/ConversationTodayCard";
import { FeelingWeekCard } from "../components/feelings/FeelingWeekCard";
import { PastEntryCard } from "../components/innerVoice/PastEntryCard";
import { RewindTodayCard } from "../components/rewind/RewindTodayCard";
import { TodaySkillCheckCard } from "../components/onboarding/SkillCheckCards";
import { claimStreakRepair, getFirstActivityDate, getMinutesByDay, getSkillStates, getStreakRepair, getTodaysPlan, getStreakState, type SkillState, type StoredPlan } from "../services/db/progressRepo";
import type { StreakBreak } from "../domain/streaks";
import { getSpeakerLevel } from "../services/db/leafRepo";
import { dismissRepair, getPracticeAnchor, getPracticeAnchorHour, getReminderSettings, getTodayMinutes, getUsualMinutes, getUserProfile, setTodayMinutes, setUsualMinutes } from "../services/prefs/prefsStore";
import { MINUTE_CHOICES, minutesNudge, ringProgress, type DailyMinutes, type MinutesNudge } from "../domain/sessionLength";
import { isoDateFromDate } from "../utils/dateUtils";
import { syncDailyReminder } from "../services/notifications/reminderScheduler";
import { defaultsFromProfile } from "../domain/profile";
import { anchorFits } from "../domain/notificationCopy";
import { takeFreezeNotice } from "../services/streaks/freezeNotice";
import { showGlobalToast } from "../components/common/ToastProvider";
import { SKILLS } from "../domain/mastery";
import { getLesson } from "../content/lessons";
import { SKILL_LABELS, type SkillId } from "../theme/tokens";
import type { Stage } from "../domain/levels";
import { PressableScale } from "../components/common/PressableScale";
import { makeStyles, useTheme } from "../theme/ThemeProvider";
import { success, tick } from "../utils/haptics";
import { TranscriptionBanner } from "../components/common/TranscriptionBanner";
import { ActiveTakesCard } from "../components/work/ActiveTakesCard";
import { EventTodayCard } from "../components/events/EventTodayCard";
import { FeedbackPrompt } from "../components/feedback/FeedbackPrompt";
import { NewProgressCard } from "../components/celebrate/NewProgressCard";
import { PathNowCard } from "../components/path/PathNowCard";
import { PathChangeNotice } from "../components/path/PathChangeNotice";
import { getPathView, type PathView } from "../services/path/pathService";
import { lessonPosition } from "../domain/path";

function greeting(): string {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

function todayLabel(): string {
  return new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
}

// The home of the app: one short daily session, chosen for you — the one
// thing on screen that stands out — and everything else quieter below it.
export function TodayScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [minutes, setMinutes] = useState<DailyMinutes>(getTodayMinutes());
  const [usual, setUsual] = useState<DailyMinutes>(getUsualMinutes());
  const [minutesDone, setMinutesDone] = useState(0);
  const [nudge, setNudge] = useState<MinutesNudge>(null);
  const [repair, setRepair] = useState<StreakBreak | null>(null);
  const [stored, setStored] = useState<StoredPlan | null>(null);
  const [skillStates, setSkillStates] = useState<Record<SkillId, SkillState> | null>(null);
  const [level, setLevel] = useState<number | null>(null);
  const [streak, setStreak] = useState(0);
  const [freezes, setFreezes] = useState(0);
  const [pathView, setPathView] = useState<PathView | null>(null);
  const anchor = getPracticeAnchor();
  const profile = getUserProfile();
  const defaults = defaultsFromProfile(profile);

  const load = useCallback(
    (m = getTodayMinutes()) => {
      setMinutes(m);
      setUsual(getUsualMinutes());
      // The plan follows the path, so the path is brought up to date first.
      const planned = getPathView()
        .then(setPathView)
        .catch(() => undefined)
        .then(() => getTodaysPlan(m));
      planned.then(setStored);
      // A finished session wins a broken streak back; otherwise offer it.
      planned
        .then(() => claimStreakRepair())
        .then((won) => {
          if (won) {
            showGlobalToast(`Streak repaired: ${won + 1} days and counting`, "success");
            getStreakState().then((s) => setStreak(s.currentStreak));
          }
          return getStreakRepair();
        })
        .then(setRepair)
        .catch(() => setRepair(null));
      getSkillStates().then(setSkillStates);
      getSpeakerLevel().then(setLevel);
      getStreakState().then((state) => {
        setStreak(state.currentStreak);
        setFreezes(state.freezesHeld);
        const notice = takeFreezeNotice(state);
        if (notice) showGlobalToast(notice, "success");
      });
      // Today's ring, and the last week's minutes for the "make it your usual"
      // nudge (practice days only; today isn't over, so it isn't counted).
      Promise.all([getMinutesByDay(isoDateFromDate(new Date(Date.now() - 22 * 86_400_000))), getFirstActivityDate()])
        .then(([byDay, first]) => {
          const today = new Date();
          setMinutesDone(byDay[isoDateFromDate(today)] ?? 0);
          // The last 7 practice days before today (rest days skipped), and
          // none from before you started.
          const practiceDays = getReminderSettings().practiceDays ?? [];
          const days: number[] = [];
          for (let i = 1; i <= 21 && days.length < 7; i++) {
            const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i);
            if (!first || isoDateFromDate(d) < first) break;
            if (practiceDays.length && !practiceDays.includes(d.getDay())) continue;
            days.push(byDay[isoDateFromDate(d)] ?? 0);
          }
          setNudge(minutesNudge(days, getUsualMinutes()));
        })
        .catch(() => undefined);
    },
    [],
  );

  useFocusEffect(load);

  // The card's minutes change today only; your usual stays as it is.
  function changeMinutes(key: string) {
    const m = Number(key) as DailyMinutes;
    setMinutes(m);
    setTodayMinutes(m);
    getTodaysPlan(m, true).then(setStored);
    // A 20 or 30 minute day has a second block, with its own reminder.
    syncDailyReminder().catch(() => undefined);
  }

  function makeUsual(m: DailyMinutes) {
    tick();
    setUsualMinutes(m);
    setTodayMinutes(m);
    setUsual(m);
    setNudge(null);
    if (m !== minutes) changeMinutes(String(m));
    showGlobalToast(`${m} minutes is your usual now`, "success");
  }

  const plan = stored?.plan;
  const done = new Set(stored?.completedStepIds ?? []);
  const lesson = plan ? getLesson(plan.lessonId) : undefined;
  const started = done.size > 0;
  const finished = !!stored?.completedAt;
  const focus = plan ? colors.skill[plan.focusSkill] : null;
  const firstOpen = plan?.steps.findIndex((s) => !done.has(s.id)) ?? -1;
  const mastery = skillStates ? (Object.fromEntries(SKILLS.map((k) => [k, skillStates[k].rating])) as Record<SkillId, number>) : null;
  const stages = skillStates ? (Object.fromEntries(SKILLS.map((k) => [k, skillStates[k].stage])) as Record<SkillId, Stage>) : undefined;
  const planUnit = plan?.unitId ? pathView?.units.find((u) => u.unitId === plan.unitId) : undefined;
  const position = plan && planUnit ? lessonPosition(plan.lessonId) : null;

  return (
    <Screen
      tabRoot
      large
      eyebrow={profile?.name ? `${greeting()}, ${profile.name}` : greeting()}
      title="Today"
    >
      <TranscriptionBanner />
      <ActiveTakesCard />
      <View style={styles.meta}>
        <Txt variant="subhead" tone="secondary">
          {todayLabel()}
        </Txt>
        <View style={styles.pills}>
          {level != null ? (
            <PressableScale
              style={styles.pill}
              onPress={() => navigation.navigate("Level")}
              accessibilityRole="button"
              accessibilityLabel={`Speaker level ${level}. Shows each skill's stage`}
            >
              <Ionicons name="trophy-outline" size={14} color={colors.textSecondary} />
              <Txt variant="footnote" weight="600" tabular>
                Level {level}
              </Txt>
            </PressableScale>
          ) : null}
          {streak > 0 ? (
            <View style={styles.pill} accessibilityLabel={`${streak}-day streak${freezes ? `, ${freezes} streak freeze${freezes === 1 ? "" : "s"}` : ""}`}>
              <Ionicons name="flame" size={14} color={colors.warning} />
              <Txt variant="footnote" weight="600" tabular>
                {streak}-day streak
              </Txt>
              {freezes > 0 ? (
                <>
                  <Ionicons name="snow-outline" size={14} color={colors.blue} />
                  <Txt variant="footnote" weight="600" tabular color={colors.blue}>
                    {freezes}
                  </Txt>
                </>
              ) : null}
            </View>
          ) : null}
          <View style={styles.pill} accessibilityLabel={`${Math.round(minutesDone)} of ${minutes} minutes today`}>
            <View style={styles.ringTrack}>
              <View style={[styles.ringFill, { width: `${Math.round(ringProgress(minutesDone, minutes) * 100)}%` }]} />
            </View>
            <Txt variant="footnote" weight="600" tabular>
              {Math.min(Math.round(minutesDone), minutes)} of {minutes} min
            </Txt>
          </View>
        </View>
        {anchor && minutesDone === 0 && anchorFits(anchor, new Date(), getPracticeAnchorHour()) ? (
          <Txt variant="footnote" tone="muted">
            Your plan: {anchor.charAt(0).toLowerCase() + anchor.slice(1)}, practice.
          </Txt>
        ) : null}
      </View>

      <NewProgressCard />
      <PathChangeNotice refreshKey={pathView} />
      <EventTodayCard />
      <FeedbackPrompt />

      {!plan ? (
        <Card style={styles.heroSkeleton}>
          <Skeleton height={24} width={110} radius={12} />
          <Skeleton height={30} width="70%" />
          <SkeletonLines lines={2} />
          <SkeletonLines lines={4} height={18} />
          <Skeleton height={52} radius={26} />
        </Card>
      ) : null}
      {plan && lesson && focus ? (
        <TourTarget id="today.plan">
        <HeroCard accent={focus.fg} contentStyle={styles.hero}>
          <View style={styles.heroTop}>
            <Badge label={SKILL_LABELS[plan.focusSkill]} fg={focus.fg} bg={focus.bg} dot />
            {!started ? (
              <View style={styles.length}>
                <SegmentedControl size="sm" options={MINUTE_CHOICES.map((m) => ({ key: String(m), label: `${m}` }))} value={String(minutes)} onChange={changeMinutes} />
              </View>
            ) : (
              <Txt variant="footnote" tone="secondary" tabular>
                {done.size} of {plan.steps.length} done
              </Txt>
            )}
          </View>
          <View style={styles.heroTitle}>
            <Txt variant="title1">{lesson.title}</Txt>
            <Txt variant="callout" tone="secondary" numberOfLines={3}>
              {plan.isReview ? "Review — " : ""}
              {lesson.teach.why.split(". ")[0]}.
            </Txt>
            {planUnit && position ? (
              <View style={styles.pathLine}>
                <Txt variant="footnote" tone="secondary">
                  Lesson {position.index} of {position.count} in {planUnit.title}
                </Txt>
                {planUnit.reasons[0] ? (
                  <Txt variant="footnote" weight="600" color={focus.fg}>
                    {planUnit.reasons[0].text}
                  </Txt>
                ) : null}
              </View>
            ) : plan.isReview ? (
              <Txt variant="footnote" tone="secondary">
                A review day: a few lessons are due, so they come back now, while they're easy to keep.
              </Txt>
            ) : null}
          </View>
          <Txt variant="footnote" tone="secondary" tabular>
            {`${plan.minutes} min${(plan.blocks?.length ?? 1) > 1 ? ", in two blocks" : ""}`}
            {minutes !== usual ? " · today only" : ""}
          </Txt>
          {minutes !== usual && !started ? (
            <PressableScale onPress={() => makeUsual(minutes)} accessibilityRole="button" accessibilityLabel={`Make ${minutes} minutes your usual`}>
              <Txt variant="footnote" weight="600" color={focus.fg}>
                Make {minutes} min your usual
              </Txt>
            </PressableScale>
          ) : null}
          <StepTimeline
            color={focus.fg}
            dense
            steps={plan.steps.map((step, i) => ({
              id: step.id,
              title: step.title,
              meta: `${step.minutes} min`,
              state: done.has(step.id) ? "done" : i === firstOpen && started ? "current" : "todo",
            }))}
          />
          {finished ? (
            <View style={styles.finished}>
              <Ionicons name="checkmark-circle" size={22} color={colors.success} />
              <Txt variant="headline">Done for today</Txt>
            </View>
          ) : (
            <PrimaryButton
              label={started ? "Continue" : "Start session"}
              iconRight="arrow-forward"
              onPress={() => navigation.navigate("DailySession")}
            />
          )}
        </HeroCard>
        </TourTarget>
      ) : (
        <HeroCard contentStyle={styles.hero}>
          <View style={styles.placeholder} />
        </HeroCard>
      )}

      {pathView ? (
        <TourTarget id="today.path">
          <PathNowCard
            view={pathView}
            onOpenUnit={(u) => (u.nextLessonId ? navigation.navigate("Lesson", { lessonId: u.nextLessonId }) : navigation.navigate("Tabs", { screen: "Learn" }))}
            onOpenPath={() => navigation.navigate("Tabs", { screen: "Learn" })}
            onOpenFinale={() => navigation.navigate("PathFinale")}
          />
        </TourTarget>
      ) : null}

      {nudge ? (
        <Card style={styles.nudge}>
          <Txt variant="callout">
            {nudge.kind === "raise"
              ? `You've done more than ${usual} minutes three days running. Make ${nudge.to} your usual?`
              : `Your usual is ${usual} minutes, and this week has been lighter. ${nudge.to} minutes still counts. Make that your usual?`}
          </Txt>
          <View style={styles.nudgeActions}>
            <PrimaryButton label={`Make ${nudge.to} my usual`} variant="secondary" size="sm" onPress={() => makeUsual(nudge.to)} />
            <PressableScale onPress={() => setNudge(null)} accessibilityRole="button" accessibilityLabel="Keep my usual">
              <Txt variant="subhead" weight="500" tone="muted">
                Keep {usual}
              </Txt>
            </PressableScale>
          </View>
        </Card>
      ) : null}

      <TodaySkillCheckCard />

      {repair ? (
        <Card style={styles.nudge}>
          <Txt variant="headline">Your {repair.lost}-day streak broke</Txt>
          <Txt variant="callout" tone="secondary">
            Finish today's session to win it back. {repair.missed.length === 1 ? "One missed day" : "Two missed days"} won't undo the work.
          </Txt>
          {profile?.why ? (
            <View style={styles.why}>
              <Txt variant="footnote" weight="500" tone="secondary">
                Why you started
              </Txt>
              <Txt variant="quote">“{profile.why}”</Txt>
            </View>
          ) : null}
          <PressableScale
            onPress={() => {
              dismissRepair(repair.lastPracticed);
              setRepair(null);
            }}
            accessibilityRole="button"
            accessibilityLabel="Dismiss streak repair"
          >
            <Txt variant="subhead" weight="500" tone="muted">
              Start fresh instead
            </Txt>
          </PressableScale>
        </Card>
      ) : streak === 0 && profile?.why ? (
        <View style={styles.why}>
          <Txt variant="footnote" weight="500" tone="secondary">
            Why you started
          </Txt>
          <Txt variant="quote">
            “{profile.why}”
          </Txt>
        </View>
      ) : null}

      <RewindTodayCard />
      <PastEntryCard />
      <FeelingWeekCard featured={defaults.featureFeelings} />

      <ConversationTodayCard />

      {mastery ? (
        <TourTarget id="today.skills" style={styles.section}>
          <SectionHeader title="Your skills" action="Progress" onAction={() => navigation.navigate("Progress")} />
          <Card>
            <SkillRings mastery={mastery} stages={stages} focus={plan?.focusSkill} onPressSkill={(s) => navigation.navigate("SkillDetail", { skill: s })} />
          </Card>
        </TourTarget>
      ) : null}

      <ListGroup>
        <ListRow
          icon="mic-outline"
          title="Practice something else"
          subtitle="A prompt, free recording, Mark it up, drills"
          chevron
          onPress={() => navigation.navigate("Practice")}
        />
        <ListRow
          icon="calendar-clear-outline"
          title="Your events"
          subtitle="Something coming up? Add it, and check in before and after"
          chevron
          onPress={() => navigation.navigate("Events")}
        />
      </ListGroup>
      <GuideTip id="today" />
    </Screen>
  );
}

const useStyles = makeStyles((t) => ({
  heroSkeleton: { gap: t.space.md, paddingVertical: t.space.lg },
  meta: { gap: t.space.sm, marginTop: -4 },
  pills: { flexDirection: "row", flexWrap: "wrap", gap: t.space.sm },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: t.radius.pill,
    backgroundColor: t.colors.surfaceRaised,
  },
  ringTrack: { width: 28, height: 6, borderRadius: 3, backgroundColor: t.colors.textMuted + "44", overflow: "hidden" },
  ringFill: { height: 6, borderRadius: 3, backgroundColor: t.colors.success },
  nudge: { gap: t.space.sm },
  nudgeActions: { flexDirection: "row", alignItems: "center", gap: t.space.md },
  hero: { gap: t.space.lg - 4 },
  heroTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: t.space.md },
  length: { width: 190 },
  heroTitle: { gap: t.space.sm },
  pathLine: { gap: 2 },
  finished: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: t.space.sm, paddingVertical: t.space.sm },
  placeholder: { height: 320 },
  why: { gap: t.space.xs, paddingHorizontal: 4, paddingVertical: t.space.sm },
  section: { gap: t.space.sm + 4 },
}));
