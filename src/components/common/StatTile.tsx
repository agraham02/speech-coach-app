import { View } from "react-native";
import { makeStyles } from "../../theme/ThemeProvider";
import { fontDisplay } from "../../theme/theme";
import { Txt } from "./Txt";

// A compact number + label tile ("148 / words per min").
export function StatTile({ value, label, color }: { value: string; label: string; color?: string }) {
  const styles = useStyles();
  return (
    <View style={styles.tile}>
      <Txt variant="title2" color={color} style={styles.value}>
        {value}
      </Txt>
      <Txt variant="caption1" tone="muted" align="center">
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
    paddingVertical: t.space.sm + 2,
    paddingHorizontal: t.space.xs,
    borderRadius: t.radius.md,
    backgroundColor: t.colors.surfaceRaised,
  },
  value: { fontFamily: fontDisplay.bold },
}));
