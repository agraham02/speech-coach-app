import { useCallback, useState } from "react";
import { View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../navigation";
import { Screen } from "../components/common/Screen";
import { HeroCard } from "../components/common/HeroCard";
import { GuideTip } from "../components/common/GuideTip";
import { ListGroup, ListRow } from "../components/common/ListRow";
import { PrimaryButton } from "../components/common/PrimaryButton";
import { Txt } from "../components/common/Txt";
import { SETTINGS_SECTIONS } from "../components/settings/sections";
import { practiceDaysThisWeek } from "../domain/streaks";
import { countPhrases } from "../services/db/phrasebookRepo";
import { countThoughts } from "../services/db/selfTalkRepo";
import { listRewinds } from "../services/db/rewindRepo";
import { dayLabel } from "../domain/rewind/labels";
import { getSkillStates, getStreakDates, getStreakState } from "../services/db/progressRepo";
import { SkillRings } from "../components/common/SkillRings";
import { AppFooter } from "../components/settings/AppFooter";
import { SKILLS } from "../domain/mastery";
import type { SkillId } from "../theme/tokens";
import { getSelfLikesRun, getUserProfile } from "../services/prefs/prefsStore";
import { listSelfLikes } from "../services/db/selfLikesRepo";
import { runDays, RUN_DAYS } from "../domain/innerVoice/run";
import { todayISODate } from "../utils/dateUtils";
import { makeStyles, useTheme } from "../theme/ThemeProvider";

// The "You" tab: how you're doing (a short summary, with the full Progress a
// tap away), the inner-voice and phrase tools, and Settings.
export function YouScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [streak, setStreak] = useState({ current: 0, freezes: 0, daysThisWeek: 0 });
  const [phraseCount, setPhraseCount] = useState(0);
  const [mastery, setMastery] = useState<Record<SkillId, number>>(() => Object.fromEntries(SKILLS.map((k) => [k, 0])) as Record<SkillId, number>);
  const [thoughtCount, setThoughtCount] = useState(0);
  const [rewindLine, setRewindLine] = useState("Tell your day, two minutes");
  const [threeThings, setThreeThings] = useState("Something you like about yourself, each day");
  const name = getUserProfile()?.name?.trim();

  useFocusEffect(
    useCallback(() => {
      Promise.all([getStreakState(), getStreakDates()])
        .then(([state, dates]) => setStreak({ current: state.currentStreak, freezes: state.freezesHeld, daysThisWeek: practiceDaysThisWeek(dates) }))
        .catch(() => undefined);
      getSkillStates()
        .then((s) => setMastery(Object.fromEntries(SKILLS.map((k) => [k, s[k].rating])) as Record<SkillId, number>))
        .catch(() => undefined);
      countPhrases().then(setPhraseCount).catch(() => undefined);
      countThoughts().then(setThoughtCount).catch(() => undefined);
      listRewinds()
        .then((all) => setRewindLine(all.length ? `Last: ${dayLabel(all[0].date)}` : "Tell your day, two minutes"))
        .catch(() => undefined);
      listSelfLikes()
        .then((all) => {
          const run = getSelfLikesRun();
          const done = runDays(all, run.round);
          const today = all.some((e) => e.date === todayISODate());
          setThreeThings(
            run.mode === "paused"
              ? "On a break"
              : run.mode === "light"
                ? today
                  ? "Done for today"
                  : "One a day, no end"
                : done >= RUN_DAYS
                  ? "Thirty days done — see your list"
                  : `Day ${done + (today ? 0 : 1)} of ${RUN_DAYS}${today ? " · done today" : ""}`,
          );
        })
        .catch(() => undefined);
    }, []),
  );

  return (
    <Screen tabRoot large title="You" eyebrow={name || undefined} contentStyle={styles.content}>
      <HeroCard accent={colors.warning} contentStyle={styles.hero}>
        <View style={styles.heroTop}>
          <View>
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
          <View style={styles.heroSide}>
            <Txt variant="footnote" tone="secondary" align="right">
              This week
            </Txt>
            <Txt variant="title2" align="right" tabular>
              {streak.daysThisWeek} {streak.daysThisWeek === 1 ? "day" : "days"}
            </Txt>
            <View style={styles.freezeRow}>
              <Ionicons name="snow-outline" size={15} color={streak.freezes ? colors.blue : colors.textMuted} />
              <Txt variant="footnote" tone="secondary" tabular>
                {streak.freezes} {streak.freezes === 1 ? "freeze" : "freezes"}
              </Txt>
            </View>
          </View>
        </View>
        <SkillRings mastery={mastery} />
        <PrimaryButton label="See all progress" variant="secondary" size="md" iconRight="chevron-forward" onPress={() => navigation.navigate("Progress")} />
      </HeroCard>

      <ListGroup title="Inner voice">
        <ListRow icon="play-back-outline" title="Rewind" subtitle={rewindLine} chevron onPress={() => navigation.navigate("Rewind")} />
        <ListRow icon="heart-outline" title="Three things" subtitle={threeThings} chevron onPress={() => navigation.navigate("ThreeThings")} />
        <ListRow
          icon="chatbubbles-outline"
          title="Talk back"
          subtitle={thoughtCount ? `${thoughtCount} ${thoughtCount === 1 ? "worry" : "worries"} to look at fairly` : "Look at what your inner critic says, fairly"}
          chevron
          onPress={() => navigation.navigate("TalkBack")}
        />
      </ListGroup>

      <ListGroup>
        <ListRow
          icon="bookmarks-outline"
          title="Phrasebook"
          subtitle="Lines and phrases you want to be able to say"
          value={phraseCount ? String(phraseCount) : undefined}
          chevron
          onPress={() => navigation.navigate("Phrasebook")}
        />
      </ListGroup>

      <ListGroup title="Settings">
        {SETTINGS_SECTIONS.map((s) => (
          <ListRow key={s.key} icon={s.icon} title={s.title} subtitle={s.subtitle} chevron onPress={() => navigation.navigate("Settings", { section: s.key })} />
        ))}
      </ListGroup>
      <AppFooter />
      <GuideTip id="you" />
    </Screen>
  );
}

const useStyles = makeStyles((t) => ({
  content: { gap: t.space.lg },
  hero: { gap: t.space.lg },
  heroTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  streakLabel: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: -2 },
  heroSide: { alignItems: "flex-end", paddingTop: 6, gap: 2 },
  freezeRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 2 },
}));
