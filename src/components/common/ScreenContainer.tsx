import { View, type ViewProps } from "react-native";
import { SafeAreaView, type Edge } from "react-native-safe-area-context";
import { makeStyles } from "../../theme/ThemeProvider";

interface ScreenContainerProps extends ViewProps {
  // Defaults to all four edges for stack-pushed screens. Screens inside the
  // bottom tab navigator should omit "bottom" — the tab bar already reserves
  // that inset.
  edges?: Edge[];
}

const DEFAULT_EDGES: Edge[] = ["top", "bottom", "left", "right"];

// The plain screen frame: safe area, background and the side gutter. Most
// scrolling screens use Screen (Screen.tsx) instead, which adds the
// collapsing title and a pinned footer.
export function ScreenContainer({ style, children, edges = DEFAULT_EDGES, ...props }: ScreenContainerProps) {
  const styles = useStyles();
  return (
    <SafeAreaView style={styles.safeArea} edges={edges}>
      <View style={[styles.container, style]} {...props}>
        {children}
      </View>
    </SafeAreaView>
  );
}

const useStyles = makeStyles((t) => ({
  safeArea: { flex: 1, backgroundColor: t.colors.background },
  container: { flex: 1, paddingHorizontal: t.layout.gutter, paddingTop: t.space.sm, paddingBottom: t.space.md },
}));
