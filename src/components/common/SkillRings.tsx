import { View } from "react-native";
import { makeStyles, useTheme } from "../../theme/ThemeProvider";
import { SKILL_LABELS, type SkillId } from "../../theme/tokens";
import { SKILLS } from "../../domain/mastery";
import { ProgressRing } from "./ProgressRing";
import { Txt } from "./Txt";

// The skill-mastery rings shown on Today and Progress. `mastery` is 0-100
// per skill; `focus` highlights today's focus skill. Five rings share one
// row, so they're sized to fit a phone and labels shrink rather than wrap.
export function SkillRings({
  mastery,
  focus,
  size = 54,
}: {
  mastery: Record<SkillId, number>;
  focus?: SkillId | null;
  size?: number;
}) {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <View style={styles.row}>
      {SKILLS.map((skill) => {
        const value = Math.round(mastery[skill] ?? 0);
        const c = colors.skill[skill];
        const isFocus = focus === skill;
        return (
          <View key={skill} style={styles.item} accessibilityLabel={`${SKILL_LABELS[skill]} ${value} out of 100`}>
            <ProgressRing size={size} strokeWidth={isFocus ? 5 : 4} progress={value / 100} color={c.fg} trackColor={c.bg}>
              <Txt variant="headline" tabular>
                {value}
              </Txt>
            </ProgressRing>
            <Txt variant="caption1" tone={isFocus ? "primary" : "muted"} weight={isFocus ? "600" : "500"} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>
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
  item: { alignItems: "center", gap: t.space.sm - 2, flex: 1, minWidth: 0, paddingHorizontal: 2 },
}));
