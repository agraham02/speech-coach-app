import { View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { makeStyles, useTheme } from "../../theme/ThemeProvider";
import { Txt } from "./Txt";
import { PrimaryButton } from "./PrimaryButton";

export function EmptyState({
  icon,
  title,
  body,
  actionLabel,
  onAction,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  body?: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <View style={styles.wrap}>
      <View style={styles.iconCircle}>
        <Ionicons name={icon} size={28} color={colors.textSecondary} />
      </View>
      <Txt variant="title1" align="center">
        {title}
      </Txt>
      {body ? (
        <Txt variant="callout" tone="secondary" align="center" style={styles.body}>
          {body}
        </Txt>
      ) : null}
      {actionLabel && onAction ? <PrimaryButton label={actionLabel} onPress={onAction} style={styles.button} /> : null}
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  wrap: { alignItems: "center", justifyContent: "center", gap: t.space.sm + 2, padding: t.space.xl },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: t.colors.surfaceRaised,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: t.space.sm,
  },
  body: { maxWidth: 320 },
  button: { alignSelf: "stretch", marginTop: t.space.md },
}));
