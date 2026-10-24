import { useEffect } from "react";
import { AppErrorBoundary, installGlobalErrorLogging } from "./src/components/common/AppErrorBoundary";
import { StatusBar } from "expo-status-bar";
import * as SplashScreen from "expo-splash-screen";
import { View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { useFonts } from "expo-font";
import { AppNavigator } from "./src/navigation";
import { isModelDownloaded, DEFAULT_ASR_MODEL, tidyModelsFolder, subscribeModelReady } from "./src/services/asr/whisperModels";
import { retryWaitingTakes } from "./src/services/pipeline/retryWaitingTakes";
import { watchForOfflineReviews } from "./src/services/pipeline/retryOfflineReviews";
import { initAccount } from "./src/services/account/accountStore";
import { initPurchases } from "./src/services/purchases/purchases";
import { logger } from "./src/utils/logger";
import { clearPrepAlert } from "./src/services/recording/prepAlert";
import { ToastProvider } from "./src/components/common/ToastProvider";
import { CelebrationHost } from "./src/components/celebrate/CelebrationHost";
import { GuideProvider } from "./src/components/common/GuideTip";
import { MetricsOverlay } from "./src/components/dev/MetricsOverlay";
import { MockAccountBanner } from "./src/components/dev/MockAccountBanner";
import { SHOW_DEV_TOOLS } from "./src/config/devTools";
import { ThemeProvider, useTheme } from "./src/theme/ThemeProvider";

// The splash (app.config.ts) stays up until the first screen can draw in the
// right typeface, then fades — no blank frame or spinner in between.
installGlobalErrorLogging();

SplashScreen.preventAutoHideAsync().catch(() => undefined);
SplashScreen.setOptions({ duration: 300, fade: true });

// Never leave someone staring at the splash if something upstream stalls.
const SPLASH_TIMEOUT_MS = 5000;

export default function App() {
  // Instrument Sans — the app's one typeface (see docs/history/design-refresh-plan.md).
  // One family per weight; keys match the fonts' PostScript names.
  const [fontsLoaded, fontError] = useFonts({
    "InstrumentSans-Regular": require("./assets/fonts/InstrumentSans-Regular.ttf"),
    "InstrumentSans-Medium": require("./assets/fonts/InstrumentSans-Medium.ttf"),
    "InstrumentSans-SemiBold": require("./assets/fonts/InstrumentSans-SemiBold.ttf"),
    "InstrumentSans-Bold": require("./assets/fonts/InstrumentSans-Bold.ttf"),
  });

  // Old model files and abandoned partial downloads go (whisperModels.ts).
  useEffect(() => tidyModelsFolder(), []);

  // A prep timer or alert left by an app that was closed mid-research: the
  // countdown it belonged to is gone, so the timer ends and the alert goes.
  useEffect(() => void clearPrepAlert(), []);

  // Takes saved while the transcription model was missing are transcribed
  // when it arrives (and on launch, if it arrived while the app was closed).
  useEffect(() => {
    if (isModelDownloaded(DEFAULT_ASR_MODEL)) retryWaitingTakes().catch(() => undefined);
    return subscribeModelReady(() => retryWaitingTakes().catch(() => undefined));
  }, []);

  // Reviews that couldn't go for lack of a connection are sent again by
  // themselves, when the app opens and each time it comes back to the front.
  useEffect(() => watchForOfflineReviews(), []);

  // The sign-in session and what Tono AI has left. Never blocks the app: a
  // failure just leaves the person signed out, and the phone-only features work.
  useEffect(() => {
    initAccount()
      .catch((error) => logger.warn(`[account] startup failed — ${(error as Error).message}`))
      .finally(initPurchases);
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => SplashScreen.hide(), SPLASH_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, []);

  return (
    <SafeAreaProvider>
      <ThemeProvider>
        {fontsLoaded || fontError ? (
          <AppErrorBoundary>
            <ToastProvider>
              <GuideProvider>
                <CelebrationHost>
                  <AppNavigator onReady={() => SplashScreen.hide()} />
                </CelebrationHost>
                {/* Dev builds: the Metrics overlay, when turned on in Dev → Metrics. */}
                {SHOW_DEV_TOOLS ? <MetricsOverlay /> : null}
                {/* Dev builds: a label while the mock account (Dev, App tools) is set. */}
                {SHOW_DEV_TOOLS ? <MockAccountBanner /> : null}
              </GuideProvider>
            </ToastProvider>
          </AppErrorBoundary>
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
