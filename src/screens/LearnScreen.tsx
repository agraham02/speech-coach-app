import { useCallback, useState } from "react";
import { GuideTip, TourTarget } from "../components/common/GuideTip";
import { ScrollView, View } from "react-native";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import Animated, { FadeIn } from "react-native-reanimated";
import type { RootStackParamList } from "../navigation";
import { Screen } from "../components/common/Screen";
import { Card } from "../components/common/Card";
import { HeroCard } from "../components/common/HeroCard";
import { Txt } from "../components/common/Txt";
import { ListGroup, ListRow } from "../components/common/ListRow";
import { ProgressRing } from "../components/common/ProgressRing";
import { PressableScale } from "../components/common/PressableScale";
import { StepTimeline } from "../components/common/StepTimeline";
import { LESSONS, UNITS } from "../content/lessons";
import { getLessonStates, getSkillStates, type LessonState, type SkillState } from "../services/db/progressRepo";
import { SKILL_LABELS, type SkillId } from "../theme/tokens";
import { SKILLS } from "../domain/mastery";
import { stageName } from "../domain/levels";
import { todayISODate } from "../utils/dateUtils";
import { makeStyles, useTheme } from "../theme/ThemeProvider";
import { duration } from "../theme/motion";

const SKILL_BLURB: Record<SkillId, string> = {
  articulation: "Crisp consonants, finished words, clarity at speed.",
  cadence: "Pause, pace, pitch, rhythm and emphasis.",
  impromptu: "Word retrieval, structure on the fly, the mind-mouth link.",
  confidence: "Breath, nerves, volume, statements, eye contact and expression.",
  conversation: "Knowing what to say, staying present, starting and leaving, and getting to the point.",
};

// Every lesson, open to browse — each skill as a path through its units.
// "Next up" is the recommended lesson per track; reviews come due on a
// spaced schedule.
export function LearnScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [skill, setSkill] = useState<SkillId>("articulation");
  const [lessons, setLessons] = useState<Record<string, LessonState>>({});
  const [skills, setSkills] = useState<Record<SkillId, SkillState> | null>(null);

  useFocusEffect(
    useCallback(() => {
      getLessonStates().then(setLessons);
      getSkillStates().then(setSkills);
    }, []),
  );

  const today = todayISODate();
  const track = LESSONS.filter((l) => l.skill === skill);
  const nextUp = track.find((l) => !lessons[l.id]?.done)?.id;
  const c = colors.skill[skill];
  const doneCount = track.filter((l) => lessons[l.id]?.done).length;
  const rating = Math.round(skills?.[skill].rating ?? 0);

  return (
    <Screen tabRoot large title="Learn">
      <TourTarget id="learn.skills">
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabsScroll} contentContainerStyle={styles.tabs}>
        {SKILLS.map((s) => {
          const selected = s === skill;
          const sc = colors.skill[s];
          return (
            <PressableScale
              key={s}
              onPress={() => setSkill(s)}
              haptic={selected ? undefined : "tick"}
              scaleTo={0.94}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              accessibilityLabel={SKILL_LABELS[s]}
              style={[styles.tab, selected && styles.tabSelected]}
            >
              <ProgressRing size={34} strokeWidth={3} progress={(skills?.[s].rating ?? 0) / 100} color={sc.fg} trackColor={sc.bg}>
                <Txt variant="caption2" tabular>
                  {Math.round(skills?.[s].rating ?? 0)}
                </Txt>
              </ProgressRing>
              <Txt variant="subhead" weight={selected ? "600" : "500"} tone={selected ? "primary" : "secondary"}>
                {SKILL_LABELS[s]}
              </Txt>
            </PressableScale>
          );
        })}
      </ScrollView>
      </TourTarget>

      <Animated.View key={skill} entering={FadeIn.duration(duration.base)} style={styles.body}>
        <HeroCard accent={c.fg} contentStyle={styles.skillCard}>
          <View style={styles.flex}>
            <Txt variant="title1">{SKILL_LABELS[skill]}</Txt>
            <Txt variant="callout" tone="secondary">
              {SKILL_BLURB[skill]}
            </Txt>
            <View style={styles.progressRow}>
              <View style={styles.progressTrack}>
                <View style={[styles.progressFill, { width: `${(doneCount / Math.max(1, track.length)) * 100}%`, backgroundColor: c.fg }]} />
              </View>
              <Txt variant="footnote" tone="secondary" tabular>
                {doneCount} of {track.length}
              </Txt>
            </View>
          </View>
          <View style={styles.ringCol}>
            <ProgressRing size={76} strokeWidth={6} progress={rating / 100} color={c.fg} trackColor={c.bg}>
              <Txt variant="title1" style={styles.ringNumber}>
                {rating}
              </Txt>
            </ProgressRing>
            {skills ? (
              <Txt variant="caption1" weight="600" color={c.fg}>
                {stageName(skills[skill].stage)}
              </Txt>
            ) : null}
          </View>
        </HeroCard>

        {UNITS.filter((u) => u.skill === skill).map((unit, unitIndex) => (
          <TourTarget key={unit.id} id={unitIndex === 0 ? "learn.path" : undefined} style={styles.unit}>
            <View style={styles.unitHead}>
              <Txt variant="title3">{unit.title}</Txt>
              <Txt variant="subhead" tone="secondary">
                {unit.summary}
              </Txt>
            </View>
            <Card style={styles.path}>
              <StepTimeline
                color={c.fg}
                steps={track
                  .filter((l) => l.unitId === unit.id)
                  .map((lesson) => {
                    const st = lessons[lesson.id];
                    const due = !!st?.nextReviewAt && st.nextReviewAt.slice(0, 10) <= today;
                    const isNext = lesson.id === nextUp;
                    return {
                      id: lesson.id,
                      title: lesson.title,
                      subtitle: isNext ? "Next up" : undefined,
                      meta: due ? "Review due" : `${lesson.minutes} min`,
                      metaColor: due ? colors.warning : undefined,
                      state: st?.done && !due ? "done" : isNext ? "current" : "todo",
                      onPress: () => navigation.navigate("Lesson", { lessonId: lesson.id }),
                    };
                  })}
              />
            </Card>
          </TourTarget>
        ))}

        {skill === "conversation" ? (
          <Txt variant="footnote" tone="muted" style={styles.note}>
            These lessons are practice, not treatment. If worry about conversations is taking over your days, CBT for social anxiety has strong
            evidence and is worth looking into.
          </Txt>
        ) : null}

        <ListGroup>
          <ListRow icon="book-outline" title="Frameworks" subtitle="The models behind the lessons, and where they come from" chevron onPress={() => navigation.navigate("Frameworks")} />
        </ListGroup>
      </Animated.View>
      <GuideTip id="learn" />
    </Screen>
  );
}

const useStyles = makeStyles((t) => ({
  // Bleeds to the screen edges so the row scrolls under the gutter.
  tabsScroll: { flexGrow: 0, marginHorizontal: -t.layout.gutter },
  tabs: { gap: t.space.sm, paddingHorizontal: t.layout.gutter },
  tab: {
    flexDirection: "row",
    alignItems: "center",
    gap: t.space.sm,
    paddingLeft: 6,
    paddingRight: 14,
    paddingVertical: 6,
    borderRadius: t.radius.pill,
    backgroundColor: t.colors.surfaceRaised,
  },
  tabSelected: { backgroundColor: t.colors.surface, borderWidth: 1.5, borderColor: t.colors.accent, paddingLeft: 4.5, paddingRight: 12.5, paddingVertical: 4.5 },
  body: { gap: t.space.lg },
  skillCard: { flexDirection: "row", gap: t.space.md, alignItems: "center" },
  flex: { flex: 1, gap: t.space.xs },
  ringNumber: { fontSize: 24, lineHeight: 30, letterSpacing: -0.8 },
  ringCol: { alignItems: "center", gap: t.space.xs },
  progressRow: { flexDirection: "row", alignItems: "center", gap: t.space.sm, marginTop: t.space.sm },
  progressTrack: { flex: 1, height: 4, borderRadius: 2, backgroundColor: t.colors.surfaceRaised, overflow: "hidden" },
  progressFill: { height: 4, borderRadius: 2 },
  unit: { gap: t.space.sm + 4 },
  unitHead: { gap: 2, paddingHorizontal: 2 },
  path: { paddingBottom: t.space.sm + 4 },
  note: { paddingHorizontal: 2 },
}));
