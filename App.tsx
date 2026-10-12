import { useEffect } from "react";
import { StatusBar } from "expo-status-bar";
import * as SplashScreen from "expo-splash-screen";
import { View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { useFonts } from "expo-font";
import { initExecutorch } from "react-native-executorch";
import { ExpoResourceFetcher } from "react-native-executorch-expo-resource-fetcher";
import { AppNavigator } from "./src/navigation";
import { ToastProvider } from "./src/components/common/ToastProvider";
import { ThemeProvider, useTheme } from "./src/theme/ThemeProvider";

// Must run before anything touches react-native-executorch — the on-device
// ASR pipeline (onDeviceAsrClient.ts) loads its model from a background
// task, not a mounted component, so there's no hook/component lifecycle to
// hang this off of. Module-scope, at the app's entry point, is the one spot
// guaranteed to run before that background work can ever kick off. Without
// this, every SpeechToTextModule.fromModelName() call fails with
// "ResourceFetcher adapter is not initialized."
initExecutorch({ resourceFetcher: ExpoResourceFetcher });

// The splash (app.config.ts) stays up until the first screen can draw in the
// right typeface, then fades — no blank frame or spinner in between.
SplashScreen.preventAutoHideAsync().catch(() => undefined);
SplashScreen.setOptions({ duration: 300, fade: true });

// Never leave someone staring at the splash if something upstream stalls.
const SPLASH_TIMEOUT_MS = 5000;

export default function App() {
  // Instrument Sans — the app's one typeface (see design-refresh-plan.md).
  // One family per weight; keys match the fonts' PostScript names.
  const [fontsLoaded, fontError] = useFonts({
    "InstrumentSans-Regular": require("./assets/fonts/InstrumentSans-Regular.ttf"),
    "InstrumentSans-Medium": require("./assets/fonts/InstrumentSans-Medium.ttf"),
    "InstrumentSans-SemiBold": require("./assets/fonts/InstrumentSans-SemiBold.ttf"),
    "InstrumentSans-Bold": require("./assets/fonts/InstrumentSans-Bold.ttf"),
  });

  useEffect(() => {
    const timer = setTimeout(() => SplashScreen.hide(), SPLASH_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, []);

  return (
    <SafeAreaProvider>
      <ThemeProvider>
        {fontsLoaded || fontError ? (
          <ToastProvider>
            <AppNavigator onReady={() => SplashScreen.hide()} />
          </ToastProvider>
        ) : (
          <Backdrop />
        )}
        <ThemedStatusBar />
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

// Behind the splash while fonts load: the theme's background, so its fade
// never reveals a different color.
function Backdrop() {
  const { colors } = useTheme();
  return <View style={{ flex: 1, backgroundColor: colors.background }} />;
}

function ThemedStatusBar() {
  const { scheme } = useTheme();
  return <StatusBar style={scheme === "dark" ? "light" : "dark"} />;
}
