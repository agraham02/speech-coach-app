import { StatusBar } from "expo-status-bar";
import { StyleSheet, Text, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AppNavigator } from "./src/navigation";
import { getMissingEnvKeys } from "./src/config/env";
import { colors, spacing, typography } from "./src/theme/theme";

export default function App() {
  const missingKeys = getMissingEnvKeys();

  if (missingKeys.length > 0) {
    return (
      <SafeAreaProvider>
        <View style={styles.configWarning}>
          <Text style={styles.configWarningTitle}>Configuration needed</Text>
          <Text style={styles.configWarningText}>
            Missing/placeholder values for: {missingKeys.join(", ")}.{"\n\n"}
            Fill in real values in .env (see .env.example), then rebuild.
          </Text>
          <StatusBar style="light" />
        </View>
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <AppNavigator />
      <StatusBar style="light" />
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  configWarning: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xl,
    gap: spacing.md,
  },
  configWarningTitle: { color: colors.textPrimary, fontSize: typography.title, fontWeight: "700" },
  configWarningText: { color: colors.textSecondary, fontSize: typography.body, textAlign: "center", lineHeight: 20 },
});
