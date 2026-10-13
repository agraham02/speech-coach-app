import type { ReactNode } from "react";
import { View } from "react-native";
import { makeStyles } from "../../theme/ThemeProvider";
import { IconButton } from "./IconButton";
import { Txt } from "./Txt";

interface HeaderProps {
  title?: string;
  eyebrow?: string;
  onBack?: () => void;
  backIcon?: "chevron-back" | "close";
  right?: ReactNode;
  large?: boolean;
}

// One consistent screen header: optional back/close button, a quiet eyebrow,
// the title (large for tab roots), and optional right-side actions.
export function Header({ title, eyebrow, onBack, backIcon = "chevron-back", right, large }: HeaderProps) {
  const styles = useStyles();
  if (large) {
    return (
      <View style={styles.large}>
        <View style={styles.text}>
          {eyebrow ? (
            <Txt variant="footnote" weight="500" tone="secondary">
              {eyebrow}
            </Txt>
          ) : null}
          {title ? <Txt variant="largeTitle">{title}</Txt> : null}
        </View>
        {right ? <View style={styles.rightLarge}>{right}</View> : null}
      </View>
    );
  }
  return (
    <View style={styles.wrap}>
      {onBack || right ? (
        <View style={styles.bar}>
          {onBack ? (
            <IconButton icon={backIcon} onPress={onBack} accessibilityLabel={backIcon === "close" ? "Close" : "Back"} size={38} />
          ) : (
            <View />
          )}
          {right ? <View style={styles.right}>{right}</View> : null}
        </View>
      ) : null}
      {eyebrow || title ? (
        <View style={styles.textStacked}>
          {eyebrow ? (
            <Txt variant="footnote" weight="500" tone="secondary">
              {eyebrow}
            </Txt>
          ) : null}
          {title ? (
            <Txt variant="title1" numberOfLines={3}>
              {title}
            </Txt>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  wrap: { gap: t.space.md },
  bar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: 40 },
  large: { flexDirection: "row", alignItems: "flex-end", gap: t.space.sm, paddingTop: t.space.sm },
  text: { flex: 1, gap: 2 },
  // Under the bar the block sizes to its content (flex: 1 in an auto-height
  // column would collapse it to nothing).
  textStacked: { gap: 2 },
  right: { flexDirection: "row", alignItems: "center", gap: t.space.sm },
  rightLarge: { flexDirection: "row", alignItems: "center", gap: t.space.sm, paddingBottom: 6 },
}));
