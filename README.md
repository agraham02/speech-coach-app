# Tono

Personal, unpublished daily speaking-practice app. Full product spec, phase-by-phase status, and changelog are in [plan.md](./plan.md). Phases 1, 3, 4, 5, plus unplanned Phases 6 (UI/UX pass), 7 (daily reminder), and 8 (Free Record + preview/discard + per-session opt-in grading) are built; Phase 2 (on-device transcription toggle) is deferred.

## Setup

1. `npm install`
2. Since this app uses custom native modules (`react-native-vision-camera`, face detection, `expo-sqlite`, `react-native-mmkv`, `expo-secure-store`), it needs a custom **development build** — plain Expo Go won't work.
   - `npx eas login`
   - `eas build:configure` (populates `extra.eas.projectId` in your EAS project)
   - `eas build --profile development --platform ios`
   - Install the resulting build on your iPhone, then `npx expo start --dev-client` to load JS.
3. Optional: deep reviews are bring-your-own-key, so the app stays free. In **Settings → Deep reviews**, pick a provider — Google Gemini (watches the video), OpenAI, Anthropic Claude or OpenRouter (these read the on-device transcript and the phone's measurements) — paste your key, and optionally a model ID. "Check key" confirms it works. Before the first review with a provider, the app asks permission to send to that company.

   Keys are stored via `expo-secure-store` (Keychain/Keystore) on-device only — never baked into the build. Everything else runs on the phone; nothing is gated on a key.

To start over (old data from an earlier version, or a clean test run): **Settings → Your data → Reset app** deletes every recording, video, score and bit of progress, clears your profile and settings, and starts onboarding again. API keys are kept.

## What's checkable without a device build (this repo was developed on Windows, no local Mac)

- `npx tsc --noEmit` — full type-check.
- `npx expo export --platform ios` — bundles the JS, catches import/babel errors.
- `npx expo prebuild --platform android --no-install` — cheap pre-flight for config-plugin misconfiguration (iOS native project generation itself requires macOS/Linux).

None of the above exercise the actual native camera, face detection, haptics, or a real Gemini round-trip — that only happens on the physical iPhone via an EAS development build.

## Known risk: camera/face-detection package versions

`react-native-vision-camera` recently shipped a v5 rewrite on a brand-new "Nitro" architecture (`useFrameOutput`, `useVideoOutput`, output-based Camera composition), and its matching face-detector fork followed with a v2 rewrite weeks later. Both are too new and thinly documented to build against reliably with no device to test on — even the official docs are incomplete right now.

This project deliberately pins the **older, well-documented, battle-tested pair** instead:
- `react-native-vision-camera@4.7.3`
- `react-native-vision-camera-face-detector@1.10.2`
- `react-native-worklets-core` (required by the pair above for frame processors)
- `react-native-reanimated@4` + its `react-native-worklets` dependency (Expo SDK 57's expected pairing; `react-native-reanimated/plugin` just re-exports `react-native-worklets/plugin`)

Both worklets packages (`-core` and the new one) end up installed side by side. There's a documented Android-only build issue when both are present (duplicate type imports) — not a concern here since the only build target is iOS (per `plan.md`, the device is an iPhone 15 Pro). If you ever do need Android, that's the first thing to check.

If a future need arises to move to the v5 Nitro pair, re-check `visioncamera.margelo.com` docs for `useVideoOutput`/recording APIs first — they were still being fleshed out as of this writing.

## Architecture notes

- `src/services/gemini/` — hand-rolled `fetch`-based Gemini client (Files API resumable upload + `generateContent` with a `responseSchema`), not the `@google/genai` SDK, which has reported RN/Hermes friction. The rubric schema now covers transcripts + structure + delivery + presence + combined + coaching (Phases 1/3/4) in one call.
- `src/services/db/` — `expo-sqlite`, with `mappers.ts` kept pure (row↔object) and separate from native calls so it's unit-testable in plain Jest. `scores` is a separate table joined to `sessions`; `statsRepo.ts` joins them for Trends.
- `src/services/pipeline/` — `sessionPipeline.ts` runs each saved take's analysis as independent, resumable steps (transcribe → voice analysis → video analysis → coaching → optional deep review) without any mounted screen; each step can be retried on its own from the Result screen. `processingEvents.ts` is a small pub-sub that screens subscribe to for live status instead of driving the pipeline themselves.
- `src/screens/PreviewScreen.tsx` — sits between Recording and Processing. Nothing is written to the DB or uploaded anywhere until the user chooses "Save" here (vs. "Discard", which just deletes the temp video file) — recording no longer auto-saves/auto-processes the instant it stops.
- `src/components/common/ToastProvider.tsx` — a small Reanimated-based toast, plus a module-level `showGlobalToast()` escape hatch so non-component code (the background pipeline) can surface feedback (e.g. "session graded", streak milestones) regardless of which screen is open.
- `src/services/secrets/secretsStore.ts` — one key per deep-review provider, entered via Settings and stored with `expo-secure-store` (Keychain/Keystore), never embedded in the build (see `plan.md` §12).
- `src/services/cloud/` — bring-your-own-key deep reviews. `providers.ts` lists the providers and their defaults; `measuredReview.ts` builds the review for providers that can't take video (the verbatim transcript, a timed transcript with pauses in brackets, and the phone's voice and face measurements) and validates the reply against the same rubric as Gemini's; `textProviders.ts` calls OpenAI (Responses API), Anthropic (Messages API) and OpenRouter (chat completions) with strict JSON-schema output; `consent.ts` asks once per provider before anything is sent (App Review 5.1.2(i)); `cloudErrors.ts` turns failures into fixable messages.
- `src/services/data/resetApp.ts` — Settings' "Reset app": drops every table and reruns the migrations (like a fresh install), deletes every video, clears preferences and logs, cancels reminders, and sends you back to onboarding. API keys survive.

## Native dependencies requiring an EAS rebuild

Beyond the original camera/face-detection stack: `expo-video` (Result screen video playback), `react-native-gifted-charts` + `react-native-svg` (Trends chart, Phase 6), `expo-notifications` (daily reminder, Phase 7), `expo-secure-store` (on-device API keys, Settings). None of these need extra config beyond what's already in `app.config.ts`'s `plugins` array. As always on this Windows-only dev setup, a JS-only change just needs a dev-client reload; anything that adds/updates a native module needs `eas build --profile development --platform ios` first.
