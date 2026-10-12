import { View } from "react-native";
import { makeStyles, useTheme } from "../../theme/ThemeProvider";
import { Txt } from "./Txt";

interface BadgeProps {
  label: string;
  // Defaults to a neutral treatment — pass colorForCategory(...) (see
  // domain/categoryColor.ts) or a skill color to color-code instead.
  fg?: string;
  bg?: string;
  // A leading dot in `fg` (skills, status).
  dot?: boolean;
}

// A small sentence-case pill.
export function Badge({ label, fg, bg, dot }: BadgeProps) {
  const styles = useStyles();
  const { colors } = useTheme();
  const color = fg ?? colors.textSecondary;
  return (
    <View style={[styles.badge, { backgroundColor: bg ?? colors.surfaceRaised }]}>
      {dot ? <View style={[styles.dot, { backgroundColor: color }]} /> : null}
      <Txt variant="caption1" weight="600" color={color} numberOfLines={1}>
        {label}
      </Txt>
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  badge: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: t.radius.pill,
  },
  dot: { width: 6, height: 6, borderRadius: 3 },
}));
