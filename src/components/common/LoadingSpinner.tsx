import { ActivityIndicator, Text, View } from "react-native";
import { spacing, typography } from "../../theme/theme";
import { makeStyles, useTheme } from "../../theme/ThemeProvider";

export function LoadingSpinner({ label }: { label?: string }) {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color={colors.accent} />
      {label ? <Text style={styles.label}>{label}</Text> : null}
    </View>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  container: { alignItems: "center", justifyContent: "center", gap: spacing.md },
  label: { color: colors.textPrimary, fontSize: typography.body },
}));
