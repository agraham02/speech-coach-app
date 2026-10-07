import { Pressable, View } from "react-native";
import { makeStyles } from "../../theme/ThemeProvider";
import { Txt } from "./Txt";

export function SectionHeader({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  const styles = useStyles();
  return (
    <View style={styles.row}>
      <Txt variant="caption2" tone="muted" uppercase>
        {title}
      </Txt>
      {action && onAction ? (
        <Pressable onPress={onAction} hitSlop={8} accessibilityRole="button">
          <Txt variant="footnote" tone="accent" weight="600">
            {action}
          </Txt>
        </Pressable>
      ) : null}
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: t.space.sm },
}));
