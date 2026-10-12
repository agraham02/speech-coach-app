import { StatusBar } from "expo-status-bar";
import { StyleSheet, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { useFonts } from "expo-font";
import { initExecutorch } from "react-native-executorch";
import { ExpoResourceFetcher } from "react-native-executorch-expo-resource-fetcher";
import { AppNavigator } from "./src/navigation";
import { ToastProvider } from "./src/components/common/ToastProvider";
import { LoadingSpinner } from "./src/components/common/LoadingSpinner";
import { spacing } from "./src/theme/theme";
import { ThemeProvider, useTheme } from "./src/theme/ThemeProvider";

// Must run before anything touches react-native-executorch — the on-device
// ASR pipeline (onDeviceAsrClient.ts) loads its model from a background
// task, not a mounted component, so there's no hook/component lifecycle to
// hang this off of. Module-scope, at the app's entry point, is the one spot
// guaranteed to run before that background work can ever kick off. Without
// this, every SpeechToTextModule.fromModelName() call fails with
// "ResourceFetcher adapter is not initialized."
initExecutorch({ resourceFetcher: ExpoResourceFetcher });

export default function App() {
  // Instrument Sans — the app's one typeface (see design-refresh-plan.md).
  // One family per weight; keys match the fonts' PostScript names.
  const [fontsLoaded, fontError] = useFonts({
    "InstrumentSans-Regular": require("./assets/fonts/InstrumentSans-Regular.ttf"),
    "InstrumentSans-Medium": require("./assets/fonts/InstrumentSans-Medium.ttf"),
    "InstrumentSans-SemiBold": require("./assets/fonts/InstrumentSans-SemiBold.ttf"),
    "InstrumentSans-Bold": require("./assets/fonts/InstrumentSans-Bold.ttf"),
  });

  return (
    <SafeAreaProvider>
      <ThemeProvider>
        {fontsLoaded || fontError ? (
          <ToastProvider>
            <AppNavigator />
          </ToastProvider>
        ) : (
          <LoadingScreen />
        )}
        <ThemedStatusBar />
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

function LoadingScreen() {
  const { colors } = useTheme();
  return (
    <View style={[styles.loading, { backgroundColor: colors.background }]}>
      <LoadingSpinner />
    </View>
  );
}

function ThemedStatusBar() {
  const { scheme } = useTheme();
  return <StatusBar style={scheme === "dark" ? "light" : "dark"} />;
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xl,
  },
});
