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
      <Ionicons name={icon} size={40} color={colors.textMuted} />
      <Txt variant="headline" align="center">
        {title}
      </Txt>
      {body ? (
        <Txt variant="subhead" tone="secondary" align="center">
          {body}
        </Txt>
      ) : null}
      {actionLabel && onAction ? <PrimaryButton label={actionLabel} onPress={onAction} style={styles.button} /> : null}
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  wrap: { alignItems: "center", justifyContent: "center", gap: t.space.sm, padding: t.space.xl },
  button: { alignSelf: "stretch", marginTop: t.space.md },
}));
