import "dotenv/config";
import type { ExpoConfig } from "expo/config";

// iOS permission prompts. Apple rejects vague purpose strings (Guideline
// 5.1.1), so each says what the access is for and where the data goes. The
// microphone string is set by two plugins (VisionCamera and
// expo-speech-recognition); both get this one so they can't disagree.
const CAMERA_PERMISSION =
    "Tono records video of your practice so you can watch yourself back and see how often you look at the camera. Videos stay on this iPhone unless you send one for an AI deep review.";
const MICROPHONE_PERMISSION =
    "Tono records your voice while you practice to measure pace, pauses, filler words and pitch. Recordings stay on this iPhone unless you send one for an AI deep review.";
const SPEECH_RECOGNITION_PERMISSION =
    "Tono uses speech recognition to follow along as you speak in drills, rehearsals and conversation practice, so it can keep your place, count your words and score reps. It runs on your iPhone when it can; otherwise Apple processes the audio.";

export default (): ExpoConfig => ({
    // Shown under the icon and in the app. The App Store listing is
    // "Tono: Speaking Coach" (set in App Store Connect).
    name: "Tono",
    // The EAS project's slug — internal, and renaming it would unlink the
    // project, so it keeps the old name.
    slug: "speech-coach-app",
    version: "1.0.0",
    scheme: "tono",
    orientation: "portrait",
    // Follows the system light/dark setting (needs expo-system-ui on
    // Android). The JS ThemeProvider decides what the app actually renders.
    userInterfaceStyle: "automatic",
    // Rendered from assets/brand (python assets/brand/render.py).
    icon: "./assets/icon.png",
    ios: {
        bundleIdentifier: "com.ahmadgraham.tono",
        supportsTablet: false,
        infoPlist: {
            ITSAppUsesNonExemptEncryption: false,
        },
    },
    android: {
        package: "com.ahmadgraham.tono",
        adaptiveIcon: {
            backgroundColor: "#0E0E0C",
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
        // The mark on the theme's background — paper in light mode, ink in
        // dark — so launch flows straight into the first screen. App.tsx
        // holds it until fonts are loaded and navigation is ready.
        [
            "expo-splash-screen",
            {
                image: "./assets/splash-icon.png",
                imageWidth: 124,
                resizeMode: "contain",
                backgroundColor: "#F6F5F1",
                dark: {
                    image: "./assets/splash-icon-dark.png",
                    backgroundColor: "#0E0E0C",
                },
            },
        ],
        "expo-video",
        "expo-font",
        "expo-notifications",
        // Keys never ask for Face ID (no requireAuthentication), so drop the
        // plugin's generic Face ID prompt rather than declare an unused
        // permission. `false` deletes the key (config-plugins applyPermissions).
        ["expo-secure-store", { faceIDPermission: false }],
        "react-native-bottom-tabs",
        // MediaPipe + ExecuTorch both set a conditional linker flag that
        // CocoaPods can't merge (it drops both); see the plugin for details.
        "./plugins/withMediaPipeLinkerFlags",
        [
            "react-native-vision-camera",
            {
                cameraPermissionText: CAMERA_PERMISSION,
                enableMicrophonePermission: true,
                microphonePermissionText: MICROPHONE_PERMISSION,
                enableCodeScanner: false,
                enableFrameProcessors: true,
            },
        ],
        [
            "expo-build-properties",
            {
                // 17.0, not 16.4 — react-native-executorch's podspec pins
                // `s.platforms = { :ios => '17.0' }` (needed for on-device
                // Whisper ASR, Phase 2/3), the highest floor among this
                // project's native deps. Confirmed via EAS build failure:
                // "Specs satisfying the react-native-executorch dependency
                // were found, but they required a higher minimum deployment
                // target." Every other native dep here (VisionCamera 12.4,
                // face-detector 15.5, Skia 14.0, audio-api 14.0) is well
                // under this, so 17.0 is the actual constraint, not a guess.
                ios: { deploymentTarget: "17.0" },
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
        // Live STT for drills, rehearse, conversation practice and the setup
        // check — separate from react-native-audio-api's offline file decode
        // above.
        // NOTE: this package's versioning now tracks Expo SDK numbers
        // directly (56.x.x = SDK 56); no 57.x.x release exists yet even
        // though this project is on SDK 57 (installed 56.0.1 anyway, since
        // its peerDependency is unconstrained). Native build compatibility
        // with SDK 57/RN 0.86 is unverified — flag this first if a native
        // Android/iOS rebuild ever fails on this dependency.
        [
            "expo-speech-recognition",
            {
                microphonePermission: MICROPHONE_PERMISSION,
                speechRecognitionPermission: SPEECH_RECOGNITION_PERMISSION,
                androidSpeechServicePackages: ["com.google.android.googlequicksearchbox"],
            },
        ],
    ],
});
