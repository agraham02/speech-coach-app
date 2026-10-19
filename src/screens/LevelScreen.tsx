import { useCallback, useState } from "react";
import { View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../navigation";
import { Screen } from "../components/common/Screen";
import { Card } from "../components/common/Card";
import { HeroCard } from "../components/common/HeroCard";
import { SectionHeader } from "../components/common/SectionHeader";
import { SkeletonRows } from "../components/common/Skeleton";
import { ListGroup, ListRow } from "../components/common/ListRow";
import { Txt } from "../components/common/Txt";
import { StageRow } from "../components/levels/StageRow";
import { getSkillStates, speakerLevelOf, type SkillState } from "../services/db/progressRepo";
import { MAX_SPEAKER_LEVEL, MAX_STAGE, nextStageHint, pointsToNextStage, STAGE_MEANING, STAGE_NAMES, type Stage } from "../domain/levels";
import { SKILLS } from "../domain/mastery";
import { SKILL_LABELS, type SkillId } from "../theme/tokens";
import { makeStyles } from "../theme/ThemeProvider";

type Props = NativeStackScreenProps<RootStackParamList, "Level">;

// Your speaker level and the stage of each skill under it: where you are,
// what the next step is, and what each stage means. The level is built
// from the stages, so it only ever goes up.
export function LevelScreen({ navigation }: Props) {
  const styles = useStyles();
  const [skills, setSkills] = useState<Record<SkillId, SkillState> | null>(null);

  useFocusEffect(
    useCallback(() => {
      getSkillStates().then(setSkills);
    }, []),
  );

  const level = skills ? speakerLevelOf(skills) : null;
  const closest = skills ? closestStage(skills) : null;

  return (
    <Screen title="Your level" onBack={() => navigation.goBack()}>
      <HeroCard contentStyle={styles.hero}>
        <Txt variant="footnote" weight="500" tone="secondary">
          Speaker level
        </Txt>
        <View style={styles.levelRow}>
          <Txt variant="display" tabular style={styles.number}>
            {level ?? "–"}
          </Txt>
          <Txt variant="subhead" tone="muted">
            of {MAX_SPEAKER_LEVEL}
          </Txt>
        </View>
        <Txt variant="callout" tone="secondary">
          Every stage you earn in any skill raises it by one. It never goes down.
        </Txt>
        {closest ? (
          <Txt variant="footnote" tone="muted">
            Closest to the next level: {SKILL_LABELS[closest.skill]}, {closest.hint.charAt(0).toLowerCase() + closest.hint.slice(1)}.
          </Txt>
        ) : null}
      </HeroCard>

      <View style={styles.section}>
        <SectionHeader title="Your skills" subtitle="Each one climbs five stages as your rating rises and the practice adds up." />
        {!skills ? (
          <SkeletonRows count={5} />
        ) : (
          <Card style={styles.list}>
            {SKILLS.map((skill, i) => (
              <StageRow
                key={skill}
                skill={skill}
                rating={skills[skill].rating}
                attempts={skills[skill].attempts}
                stage={skills[skill].stage}
                delay={i * 80}
                onPress={() => navigation.navigate("SkillDetail", { skill })}
              />
            ))}
          </Card>
        )}
      </View>

      <View style={styles.section}>
        <SectionHeader title="The stages" />
        <Card style={styles.stages}>
          {([1, 2, 3, 4, 5] as Stage[]).map((stage) => (
            <View key={stage} style={styles.stage}>
              <Txt variant="subhead" weight="600" tabular style={styles.stageNumber}>
                {stage}
              </Txt>
              <View style={styles.flex}>
                <Txt variant="subhead" weight="600">
                  {STAGE_NAMES[stage]}
                </Txt>
                <Txt variant="footnote" tone="secondary">
                  {STAGE_MEANING[stage]}
                </Txt>
              </View>
            </View>
          ))}
        </Card>
      </View>

      <ListGroup>
        <ListRow
          icon="speedometer-outline"
          title="Practice difficulty"
          subtitle="Pin the level free practice and drills start at"
          chevron
          onPress={() => navigation.navigate("Curriculum")}
        />
      </ListGroup>
    </Screen>
  );
}

// The skill with the fewest rating points to its next stage.
function closestStage(skills: Record<SkillId, SkillState>): { skill: SkillId; hint: string } | null {
  let best: { skill: SkillId; points: number } | null = null;
  for (const skill of SKILLS) {
    const s = skills[skill];
    if (s.stage >= MAX_STAGE) continue;
    const points = pointsToNextStage(s.rating, s.stage);
    if (!best || points < best.points) best = { skill, points };
  }
  if (!best) return null;
  const s = skills[best.skill];
  return { skill: best.skill, hint: nextStageHint(s.rating, s.attempts, s.stage) };
}

const useStyles = makeStyles((t) => ({
  hero: { gap: t.space.sm, paddingVertical: t.space.lg },
  levelRow: { flexDirection: "row", alignItems: "baseline", gap: t.space.sm },
  number: { fontSize: 56, lineHeight: 62 },
  section: { gap: t.space.sm + 4 },
  list: { paddingVertical: t.space.xs },
  stages: { gap: t.space.md },
  stage: { flexDirection: "row", gap: t.space.md, alignItems: "flex-start" },
  stageNumber: { width: 16, marginTop: 0 },
  flex: { flex: 1 },
}));
