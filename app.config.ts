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
        // Only used here for offline decodeAudioData() on an already-recorded
        // local file (both the on-device ASR waveform and the DSP pitch/volume
        // pipeline need it) — not live background audio recording/playback, so
        // the foreground-service machinery this plugin adds by default is
        // unneeded surface area (extra permissions, an Android manifest
        // <service> entry) and explicitly turned off.
        [
            "react-native-audio-api",
            {
                iosBackgroundMode: false,
                androidForegroundService: false,
                androidPermissions: [],
            },
        ],
        // Live on-device STT for the Tongue-Twister Drill mode (Phase 3) —
        // separate from react-native-audio-api's offline file decode above.
        // NOTE: this package's versioning now tracks Expo SDK numbers
        // directly (56.x.x = SDK 56); no 57.x.x release exists yet even
        // though this project is on SDK 57 (installed 56.0.1 anyway, since
        // its peerDependency is unconstrained). Native build compatibility
        // with SDK 57/RN 0.86 is unverified — flag this first if a native
        // Android/iOS rebuild ever fails on this dependency.
        [
            "expo-speech-recognition",
            {
                microphonePermission: "Speech Coach needs microphone access for live tongue-twister drills.",
                speechRecognitionPermission: "Speech Coach uses speech recognition to score your tongue-twister drills.",
                androidSpeechServicePackages: ["com.google.android.googlequicksearchbox"],
            },
        ],
    ],
});
