import { View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { PressableScale } from "../common/PressableScale";
import { Txt } from "../common/Txt";
import { DeltaBar } from "../celebrate/DeltaBar";
import { isRusty, nextStageHint, stageName, stageProgress, type Stage } from "../../domain/levels";
import { SKILL_LABELS, type SkillId } from "../../theme/tokens";
import { makeStyles, useTheme } from "../../theme/ThemeProvider";

interface StageRowProps {
  skill: SkillId;
  rating: number;
  attempts: number;
  stage: Stage;
  // Highlights the skill the app is working on now.
  focus?: boolean;
  onPress?: () => void;
  delay?: number;
}

// One skill's stage: its name, how far to the next one, and what's between
// you and it. A dip below the earned stage reads "a bit rusty", never a
// demotion.
export function StageRow({ skill, rating, attempts, stage, focus, onPress, delay }: StageRowProps) {
  const styles = useStyles();
  const { colors } = useTheme();
  const c = colors.skill[skill];
  const rusty = isRusty(rating, stage);
  const label = `${SKILL_LABELS[skill]}: ${stageName(stage)}. ${nextStageHint(rating, attempts, stage)}.`;
  const body = (
    <>
      <View style={styles.top}>
        <View style={styles.name}>
          <View style={[styles.dot, { backgroundColor: c.fg }]} />
          <Txt variant="headline" numberOfLines={1}>
            {SKILL_LABELS[skill]}
          </Txt>
          {focus ? (
            <Txt variant="caption1" tone="muted">
              · working on it
            </Txt>
          ) : null}
        </View>
        <Txt variant="subhead" weight="600" color={c.fg}>
          {stageName(stage)}
        </Txt>
      </View>
      <DeltaBar value={stageProgress(rating, stage)} color={c.fg} trackColor={c.bg} delay={delay} growIn />
      <View style={styles.bottom}>
        <Txt variant="footnote" tone="secondary" style={styles.flex}>
          {rusty ? "A bit rusty. A few sessions brings it back." : nextStageHint(rating, attempts, stage)}
        </Txt>
        {onPress ? <Ionicons name="chevron-forward" size={16} color={colors.textMuted} /> : null}
      </View>
    </>
  );
  return onPress ? (
    <PressableScale style={styles.row} onPress={onPress} accessibilityRole="button" accessibilityLabel={label}>
      {body}
    </PressableScale>
  ) : (
    <View style={styles.row} accessibilityLabel={label}>
      {body}
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  row: { gap: t.space.sm, paddingVertical: t.space.sm + 2 },
  top: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: t.space.sm },
  name: { flexDirection: "row", alignItems: "center", gap: t.space.sm, flexShrink: 1 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  bottom: { flexDirection: "row", alignItems: "center", gap: t.space.sm },
  flex: { flex: 1 },
}));
