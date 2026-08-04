import { StatusBar } from "expo-status-bar";
import { StyleSheet, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { useFonts } from "expo-font";
import { AppNavigator } from "./src/navigation";
import { ToastProvider } from "./src/components/common/ToastProvider";
import { LoadingSpinner } from "./src/components/common/LoadingSpinner";
import { colors, spacing } from "./src/theme/theme";

export default function App() {
  const [fontsLoaded] = useFonts({
    "Sora-Regular": require("./assets/fonts/Sora-Regular.ttf"),
    "Sora-Bold": require("./assets/fonts/Sora-Bold.ttf"),
  });

  if (!fontsLoaded) {
    return (
      <SafeAreaProvider>
        <View style={styles.loading}>
          <LoadingSpinner />
        </View>
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <ToastProvider>
        <AppNavigator />
        <StatusBar style="light" />
      </ToastProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xl,
  },
});
