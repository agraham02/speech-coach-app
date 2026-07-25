import "dotenv/config";
import type { ExpoConfig } from "expo/config";

export default (): ExpoConfig => ({
  name: "speech-coach-app",
  slug: "speech-coach-app",
  version: "1.0.0",
  scheme: "speechcoach",
  orientation: "portrait",
  icon: "./assets/icon.png",
  ios: {
    bundleIdentifier: "com.ahmadgraham.speechcoach",
    supportsTablet: false,
  },
  android: {
    package: "com.ahmadgraham.speechcoach",
    adaptiveIcon: {
      backgroundColor: "#E6F4FE",
      foregroundImage: "./assets/android-icon-foreground.png",
      backgroundImage: "./assets/android-icon-background.png",
      monochromeImage: "./assets/android-icon-monochrome.png",
    },
    predictiveBackGestureEnabled: false,
  },
  web: {
    favicon: "./assets/favicon.png",
  },
  extra: {
    geminiApiKey: process.env.GEMINI_API_KEY ?? "",
    notionToken: process.env.NOTION_TOKEN ?? "",
    notionPageId: process.env.NOTION_PAGE_ID ?? "",
    eas: {
      projectId: process.env.EAS_PROJECT_ID ?? "",
    },
  },
  plugins: [
    "expo-sqlite",
    [
      "react-native-vision-camera",
      {
        cameraPermissionText:
          "Speech Coach needs camera access to record your practice sessions.",
        enableMicrophonePermission: true,
        microphonePermissionText:
          "Speech Coach needs microphone access to record your voice.",
        enableCodeScanner: false,
        enableFrameProcessors: true,
      },
    ],
    [
      "expo-build-properties",
      {
        ios: { deploymentTarget: "16.4" },
      },
    ],
  ],
});
