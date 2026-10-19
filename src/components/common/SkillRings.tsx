import { View } from "react-native";
import { makeStyles, useTheme } from "../../theme/ThemeProvider";
import { SKILL_LABELS, type SkillId } from "../../theme/tokens";
import { SKILLS } from "../../domain/mastery";
import { stageName, type Stage } from "../../domain/levels";
import { PressableScale } from "./PressableScale";
import { ProgressRing } from "./ProgressRing";
import { Txt } from "./Txt";

// The skill-mastery rings shown on Today and Progress. `mastery` is 0-100
// per skill; `focus` highlights today's focus skill. Five rings share one
// row, so they're sized to fit a phone and labels shrink rather than wrap.
// With `onPressSkill`, each ring opens that skill's detail: what the number
// means and what moved it.
export function SkillRings({
  mastery,
  stages,
  focus,
  size = 54,
  onPressSkill,
}: {
  mastery: Record<SkillId, number>;
  // Each skill's earned stage, named under its label.
  stages?: Record<SkillId, Stage>;
  focus?: SkillId | null;
  size?: number;
  onPressSkill?: (skill: SkillId) => void;
}) {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <View style={styles.row}>
      {SKILLS.map((skill) => {
        const value = Math.round(mastery[skill] ?? 0);
        const c = colors.skill[skill];
        const isFocus = focus === skill;
        const label = `${SKILL_LABELS[skill]} ${value} out of 100${stages ? `, ${stageName(stages[skill])}` : ""}`;
        const ring = (
          <>
            <ProgressRing size={size} strokeWidth={isFocus ? 5 : 4} progress={value / 100} color={c.fg} trackColor={c.bg}>
              <Txt variant="headline" tabular>
                {value}
              </Txt>
            </ProgressRing>
            <Txt variant="caption1" tone={isFocus ? "primary" : "muted"} weight={isFocus ? "600" : "500"} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>
              {SKILL_LABELS[skill]}
            </Txt>
            {stages ? (
              <Txt variant="caption2" color={c.fg} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75} style={styles.stage}>
                {stageName(stages[skill])}
              </Txt>
            ) : null}
          </>
        );
        return onPressSkill ? (
          <PressableScale
            key={skill}
            style={styles.item}
            onPress={() => onPressSkill(skill)}
            accessibilityRole="button"
            accessibilityLabel={label}
            accessibilityHint="Shows what this rating means and what moved it"
          >
            {ring}
          </PressableScale>
        ) : (
          <View key={skill} style={styles.item} accessibilityLabel={label}>
            {ring}
          </View>
        );
      })}
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  row: { flexDirection: "row", justifyContent: "space-between" },
  item: { alignItems: "center", gap: t.space.sm - 2, flex: 1, minWidth: 0, paddingHorizontal: 2 },
  stage: { marginTop: -4 },
}));
