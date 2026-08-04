import "dotenv/config";
import type { ExpoConfig } from "expo/config";

export default (): ExpoConfig => ({
    name: "Speech Coach",
    slug: "speech-coach-app",
    version: "1.0.0",
    scheme: "speechcoach",
    orientation: "portrait",
    icon: "./assets/icon.png",
    ios: {
        bundleIdentifier: "com.ahmadgraham.speechcoach",
        supportsTablet: false,
        infoPlist: {
            ITSAppUsesNonExemptEncryption: false,
        },
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
        eas: {
            // Not a secret — this is the public project identifier EAS
            // Update/Build use to find the right project, the same thing
            // `eas init` writes directly into app.json for every other Expo
            // project. Routing it through a .env-only var was unreliable:
            // EAS Build's own config-resolution step doesn't consistently
            // pick up .env-sourced values for this specific field (see
            // github.com/expo/eas-cli/issues/2084), producing "extra.eas.
            // projectId is missing" even though it resolved fine locally.
            // Hardcoding it removes that whole class of failure.
            projectId: "c1cc07c1-f38e-4358-a7b5-e28a6caae79e",
        },
    },
    plugins: [
        "expo-sqlite",
        "expo-video",
        "expo-font",
        "expo-notifications",
        "expo-secure-store",
        "react-native-bottom-tabs",
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
                android: { minSdkVersion: 26 },
            },
        ],
    ],
});
