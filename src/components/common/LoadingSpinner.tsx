import { ActivityIndicator, View } from "react-native";
import { makeStyles, useTheme } from "../../theme/ThemeProvider";
import { Txt } from "./Txt";

export function LoadingSpinner({ label }: { label?: string }) {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <View style={styles.container}>
      <ActivityIndicator size="small" color={colors.textSecondary} />
      {label ? (
        <Txt variant="subhead" tone="secondary" align="center">
          {label}
        </Txt>
      ) : null}
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  container: { alignItems: "center", justifyContent: "center", gap: t.space.md },
}));
