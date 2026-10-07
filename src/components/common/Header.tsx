import type { ReactNode } from "react";
import { Pressable, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { makeStyles, useTheme } from "../../theme/ThemeProvider";
import { Txt } from "./Txt";

interface HeaderProps {
  title?: string;
  eyebrow?: string;
  onBack?: () => void;
  backIcon?: "chevron-back" | "close";
  right?: ReactNode;
  large?: boolean;
}

// One consistent screen header: optional back/close button, eyebrow label,
// title (large for tab roots), and an optional right-side action.
export function Header({ title, eyebrow, onBack, backIcon = "chevron-back", right, large }: HeaderProps) {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <View style={styles.row}>
      {onBack ? (
        <Pressable
          onPress={onBack}
          hitSlop={12}
          style={styles.back}
          accessibilityRole="button"
          accessibilityLabel={backIcon === "close" ? "Close" : "Back"}
        >
          <Ionicons name={backIcon} size={26} color={colors.textPrimary} />
        </Pressable>
      ) : null}
      <View style={styles.text}>
        {eyebrow ? (
          <Txt variant="caption2" tone="muted" uppercase>
            {eyebrow}
          </Txt>
        ) : null}
        {title ? (
          <Txt variant={large ? "largeTitle" : "title3"} numberOfLines={2}>
            {title}
          </Txt>
        ) : null}
      </View>
      {right ? <View style={styles.right}>{right}</View> : null}
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  row: { flexDirection: "row", alignItems: "center", gap: t.space.sm, minHeight: 44 },
  back: { marginLeft: -6 },
  text: { flex: 1, gap: 2 },
  right: { flexDirection: "row", alignItems: "center", gap: t.space.md },
}));
