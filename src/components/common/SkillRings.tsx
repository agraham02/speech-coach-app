import { View } from "react-native";
import { makeStyles, useTheme } from "../../theme/ThemeProvider";
import { SKILL_LABELS, type SkillId } from "../../theme/tokens";
import { ProgressRing } from "./ProgressRing";
import { Txt } from "./Txt";

const ORDER: SkillId[] = ["articulation", "cadence", "impromptu", "confidence"];

// The four skill-mastery rings shown on Today and Progress. `mastery` is
// 0-100 per skill; `focus` highlights today's focus skill.
export function SkillRings({
  mastery,
  focus,
  size = 64,
}: {
  mastery: Record<SkillId, number>;
  focus?: SkillId | null;
  size?: number;
}) {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <View style={styles.row}>
      {ORDER.map((skill) => {
        const value = Math.round(mastery[skill] ?? 0);
        const c = colors.skill[skill];
        return (
          <View key={skill} style={styles.item} accessibilityLabel={`${SKILL_LABELS[skill]} ${value} out of 100`}>
            <ProgressRing size={size} strokeWidth={6} progress={value / 100} color={c.fg} trackColor={c.bg}>
              <Txt variant="headline" color={c.fg}>
                {value}
              </Txt>
            </ProgressRing>
            <Txt variant="caption1" tone={focus === skill ? "primary" : "muted"} weight={focus === skill ? "700" : "400"}>
              {SKILL_LABELS[skill]}
            </Txt>
          </View>
        );
      })}
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  row: { flexDirection: "row", justifyContent: "space-between" },
  item: { alignItems: "center", gap: t.space.xs, flex: 1 },
}));
