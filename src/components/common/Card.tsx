import { View, type ViewProps } from "react-native";
import { makeStyles } from "../../theme/ThemeProvider";

export function Card({ style, children, ...props }: ViewProps) {
  const styles = useStyles();
  return (
    <View style={[styles.card, style]} {...props}>
      {children}
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  card: {
    backgroundColor: t.colors.surface,
    borderRadius: t.radius.lg,
    borderWidth: 1,
    borderColor: t.colors.border,
    padding: t.space.lg,
  },
}));
