import { Pressable, View } from "react-native";
import { makeStyles } from "../../theme/ThemeProvider";
import { Txt } from "./Txt";

// A section's title, with an optional action on the right ("See all").
export function SectionHeader({ title, action, onAction, subtitle }: { title: string; action?: string; onAction?: () => void; subtitle?: string }) {
  const styles = useStyles();
  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        <Txt variant="title3" style={styles.title}>
          {title}
        </Txt>
        {action && onAction ? (
          <Pressable onPress={onAction} hitSlop={10} accessibilityRole="button">
            <Txt variant="subhead" tone="secondary" weight="500">
              {action}
            </Txt>
          </Pressable>
        ) : null}
      </View>
      {subtitle ? (
        <Txt variant="subhead" tone="secondary">
          {subtitle}
        </Txt>
      ) : null}
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  wrap: { gap: 2, marginTop: t.space.sm, paddingHorizontal: 2 },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", gap: t.space.md },
  title: { flex: 1 },
}));
