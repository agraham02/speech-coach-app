import { View } from "react-native";
import { makeStyles } from "../../theme/ThemeProvider";
import { Txt } from "./Txt";

// A number over its label ("148 / words per min"). Tiles in a row sit on one
// quiet fill each; `plain` drops the fill when the row is already on a card.
export function StatTile({ value, label, color, plain }: { value: string; label: string; color?: string; plain?: boolean }) {
  const styles = useStyles();
  return (
    <View style={[styles.tile, plain && styles.plain]}>
      <Txt variant="title1" color={color} style={styles.value} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Txt>
      <Txt variant="caption1" tone="muted" align="center" numberOfLines={2}>
        {label}
      </Txt>
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  tile: {
    flex: 1,
    alignItems: "center",
    gap: 2,
    paddingVertical: t.space.md - 2,
    paddingHorizontal: t.space.sm,
    borderRadius: t.radius.md,
    backgroundColor: t.colors.surfaceRaised,
  },
  plain: { backgroundColor: "transparent", paddingVertical: t.space.xs },
  value: { fontSize: 28, lineHeight: 34, letterSpacing: -0.8 },
}));
