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
import { ListRow } from "../components/common/ListRow";
import { ProgressRing } from "../components/common/ProgressRing";
import { useTabBarBottomInset } from "../hooks/useTabBarBottomInset";
import { LESSONS, UNITS } from "../content/lessons";
import { getLessonStates, getSkillStates, type LessonState, type SkillState } from "../services/db/progressRepo";
import { SKILL_LABELS, type SkillId } from "../theme/tokens";
import { todayISODate } from "../utils/dateUtils";
import { makeStyles, useTheme } from "../theme/ThemeProvider";

const SKILL_ORDER: SkillId[] = ["articulation", "cadence", "impromptu", "confidence"];

const SKILL_BLURB: Record<SkillId, string> = {
  articulation: "Crisp consonants, finished words, clarity at speed.",
  cadence: "Pace, pauses, emphasis and melody.",
  impromptu: "Word retrieval, structure on the fly, the mind-mouth link.",
  confidence: "Nerves, volume, statements, eye contact and expression.",
};

// Every lesson, open to browse. "Next up" marks the recommended one per
// track; reviews come due on a spaced schedule.
export function LearnScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const tabBarInset = useTabBarBottomInset();
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

  return (
    <ScreenContainer style={styles.container} edges={["top", "left", "right"]}>
      <Header title="Learn" large />
      <ChipGroup scroll options={SKILL_ORDER.map((s) => ({ key: s, label: SKILL_LABELS[s] }))} value={skill} onChange={setSkill} />
      <ScrollView contentContainerStyle={[styles.scroll, { paddingBottom: tabBarInset + 24 }]} showsVerticalScrollIndicator={false}>
        <Card style={styles.skillCard}>
          <ProgressRing size={64} strokeWidth={6} progress={(skills?.[skill].rating ?? 0) / 100} color={c.fg} trackColor={c.bg}>
            <Txt variant="headline" color={c.fg}>
              {Math.round(skills?.[skill].rating ?? 0)}
            </Txt>
          </ProgressRing>
          <View style={styles.flex}>
            <Txt variant="title3">{SKILL_LABELS[skill]}</Txt>
            <Txt variant="subhead" tone="secondary">
              {SKILL_BLURB[skill]}
            </Txt>
            <Txt variant="caption1" tone="muted">
              {doneCount} of {track.length} lessons done
            </Txt>
          </View>
        </Card>

        {UNITS.filter((u) => u.skill === skill).map((unit) => (
          <View key={unit.id} style={styles.unit}>
            <Txt variant="caption2" tone="muted" uppercase>
              {unit.title}
            </Txt>
            <Txt variant="footnote" tone="secondary">
              {unit.summary}
            </Txt>
            <Card style={styles.lessonList}>
              {track
                .filter((l) => l.unitId === unit.id)
                .map((lesson) => {
                  const st = lessons[lesson.id];
                  const due = !!st?.nextReviewAt && st.nextReviewAt.slice(0, 10) <= today;
                  const status = due ? "Review due" : st?.done ? "Done" : lesson.id === nextUp ? "Next up" : `${lesson.minutes} min`;
                  const tone = due ? colors.warning : st?.done ? colors.success : lesson.id === nextUp ? colors.accent : colors.textMuted;
                  return (
                    <Pressable
                      key={lesson.id}
                      onPress={() => navigation.navigate("Lesson", { lessonId: lesson.id })}
                      style={({ pressed }) => [styles.lessonRow, pressed && styles.pressed]}
                      accessibilityRole="button"
                      accessibilityLabel={`${lesson.title}, ${status}`}
                    >
                      <Ionicons
                        name={st?.done ? "checkmark-circle" : lesson.id === nextUp ? "play-circle" : "ellipse-outline"}
                        size={22}
                        color={tone}
                      />
                      <Txt variant="callout" style={styles.flex}>
                        {lesson.title}
                      </Txt>
                      <Txt variant="footnote" weight="600" color={tone}>
                        {status}
                      </Txt>
                    </Pressable>
                  );
                })}
            </Card>
          </View>
        ))}

        <Card style={styles.more}>
          <ListRow icon="book-outline" title="Frameworks reference" subtitle="PREP, story spine, the five vocal levers…" chevron onPress={() => navigation.navigate("Frameworks")} />
        </Card>
      </ScrollView>
    </ScreenContainer>
  );
}

const useStyles = makeStyles((t) => ({
  container: { gap: t.space.md, paddingBottom: 0 },
  scroll: { gap: t.space.lg },
  skillCard: { flexDirection: "row", gap: t.space.md, alignItems: "center" },
  flex: { flex: 1 },
  unit: { gap: t.space.xs },
  lessonList: { paddingVertical: t.space.xs, paddingHorizontal: t.space.md, marginTop: t.space.xs },
  lessonRow: { flexDirection: "row", alignItems: "center", gap: t.space.md, paddingVertical: t.space.sm + 2, minHeight: 44 },
  pressed: { opacity: 0.6 },
  more: { paddingVertical: t.space.sm },
}));
