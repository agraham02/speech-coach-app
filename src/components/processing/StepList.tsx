import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Animated, { ZoomIn } from "react-native-reanimated";
import { colors, spacing, typography } from "../../theme/theme";

export interface Step {
  key: string;
  label: string;
}

export function StepList({ steps, currentIndex }: { steps: Step[]; currentIndex: number }) {
  return (
    <View style={styles.container}>
      {steps.map((step, index) => {
        const status = index < currentIndex ? "done" : index === currentIndex ? "active" : "pending";
        return (
          <View key={step.key} style={styles.row}>
            <View style={styles.iconSlot}>
              {status === "done" && (
                <Animated.View entering={ZoomIn.duration(280)}>
                  <Ionicons name="checkmark-circle" size={22} color={colors.success} />
                </Animated.View>
              )}
              {status === "active" && <ActivityIndicator size="small" color={colors.accent} />}
              {status === "pending" && <Ionicons name="ellipse-outline" size={20} color={colors.textMuted} />}
            </View>
            <Text style={[styles.label, status === "pending" && styles.labelPending, status === "active" && styles.labelActive]}>
              {step.label}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.md },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  iconSlot: { width: 22, alignItems: "center", justifyContent: "center" },
  label: { color: colors.textPrimary, fontSize: typography.body },
  labelActive: { fontWeight: "700" },
  labelPending: { color: colors.textMuted },
});
