import { StyleSheet, View, type ViewProps } from "react-native";
import { SafeAreaView, type Edge } from "react-native-safe-area-context";
import { colors, spacing } from "../../theme/theme";

interface ScreenContainerProps extends ViewProps {
  // Defaults to all four edges for stack-pushed screens (no tab bar below
  // them, so they own the full bottom safe-area inset themselves). Screens
  // hosted inside the bottom tab navigator should pass edges without
  // "bottom" — the tab bar already reserves that inset for itself, so also
  // reserving it here would double it up as a blank gap above the tab bar.
  edges?: Edge[];
}

const DEFAULT_EDGES: Edge[] = ["top", "bottom", "left", "right"];

export function ScreenContainer({ style, children, edges = DEFAULT_EDGES, ...props }: ScreenContainerProps) {
  return (
    <SafeAreaView style={styles.safeArea} edges={edges}>
      <View style={[styles.container, style]} {...props}>
        {children}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  container: { flex: 1, padding: spacing.lg },
});
