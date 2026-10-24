# Tono

Tono is a speaking-practice app for iPhone: record a take, and your phone measures pace, pauses, fillers, pitch, loudness and eye contact, turns them into scores and a next step, and runs a curriculum of lessons and drills around them. All of that is free, runs on the phone, and needs no account.

**Tono AI** (optional) judges a take the way a coach would, from the phone's transcript and measurements, through a small Supabase backend that holds the Gemini key, writes the prompts and counts the allowance. Everyone gets one judged take a month free; **Tono Plus** ($4.99 a month or $49.99 a year, with a 14-day free trial on both) gives 60 a month, plus notes on drills and AI mark-ups. Purchases go through the App Store and RevenueCat, against an anonymous account made behind the scenes, so nobody has to sign in; Sign in with Apple or Google is optional and only links that account.

Status: in TestFlight, not yet on the App Store. Decisions are in [docs/decisions](./docs/decisions/) (start with `decisions-log.md` and `tiers-and-trial.md`), the backend in [supabase/README.md](./supabase/README.md), the launch steps in [app-store-launch-checklist.md](./app-store-launch-checklist.md), and the history in [docs/history](./docs/history/).

## Setup

1. `npm install`
2. Since this app uses custom native modules (`react-native-vision-camera`, face detection, `expo-sqlite`, `react-native-mmkv`, `expo-secure-store`), it needs a custom **development build** — plain Expo Go won't work.
   - `npx eas login`
   - `eas build:configure` (populates `extra.eas.projectId` in your EAS project)
   - `eas build --profile development --platform ios`
   - Install the resulting build on your iPhone, then `npx expo start --dev-client` to load JS.
3. Tono AI needs nothing set up in the app: the backend's public URL and publishable key are in `src/config/backend.ts`. The backend itself (secrets, migrations, functions, the launch switch) is described in `supabase/README.md`. There are no API keys in the app, and nothing to paste.

To start over (old data from an earlier version, or a clean test run): **Settings → Your data → Reset app** deletes every recording, video, score and bit of progress, clears your profile and settings, and starts onboarding again. The Tono account on the phone is kept.

## What's checkable without a device build (this repo was developed on Windows, no local Mac)

- `npx tsc --noEmit` — full type-check.
- `npx expo export --platform ios` — bundles the JS, catches import/babel errors.
- `npx expo prebuild --platform android --no-install` — cheap pre-flight for config-plugin misconfiguration (iOS native project generation itself requires macOS/Linux).

None of the above exercise the actual native camera, face detection, haptics, or a real Tono AI round-trip — that only happens on the physical iPhone via an EAS development build. `npx jest` runs the unit tests, including the server's pure rules (`supabase/functions/_shared`).

## Known risk: camera/face-detection package versions

`react-native-vision-camera` recently shipped a v5 rewrite on a brand-new "Nitro" architecture (`useFrameOutput`, `useVideoOutput`, output-based Camera composition), and its matching face-detector fork followed with a v2 rewrite weeks later. Both are too new and thinly documented to build against reliably with no device to test on — even the official docs are incomplete right now.

This project deliberately pins the **older, well-documented, battle-tested pair** instead:
- `react-native-vision-camera@4.7.3`
- `react-native-vision-camera-face-detector@1.10.2`
- `react-native-worklets-core` (required by the pair above for frame processors)
- `react-native-reanimated@4` + its `react-native-worklets` dependency (Expo SDK 57's expected pairing; `react-native-reanimated/plugin` just re-exports `react-native-worklets/plugin`)

Both worklets packages (`-core` and the new one) end up installed side by side. There's a documented Android-only build issue when both are present (duplicate type imports) — not a concern here since the only build target is iOS (per `docs/history/plan.md`, the device is an iPhone 15 Pro). If you ever do need Android, that's the first thing to check.

If a future need arises to move to the v5 Nitro pair, re-check `visioncamera.margelo.com` docs for `useVideoOutput`/recording APIs first — they were still being fleshed out as of this writing.

## Architecture notes

- `src/services/analysis/` — the AnalysisService: one door for every kind of AI analysis (take review, coaching, Rewind notes, Word Chain and Bridge Chain judging, Say it short, mark-up). Routing (`src/domain/analysis/routing.ts`) is one pure function over the tier, the consent, the age answer and the allowance; `inputs.ts` builds the structured inputs the phone sends; the phone checks every answer (`src/domain/analysis/judgedReview.ts` and the exercise checks) before anything is stored.
- `supabase/functions/` — the Tono AI backend. `_shared/prompts/` writes every prompt and answer schema (the take review answers in the scoring taxonomy's terms); `_shared/allowance.ts` holds the tier rules (free, beta, trial, Plus); `ai-generate` runs a task. See `supabase/README.md`.
- `src/services/db/` — `expo-sqlite`, with `mappers.ts` kept pure (row↔object) and separate from native calls so it's unit-testable in plain Jest. `scores` is a separate table joined to `sessions`; `statsRepo.ts` joins them for Trends.
- `src/services/pipeline/` — `sessionPipeline.ts` runs each saved take's analysis as independent, resumable steps (transcribe → voice analysis → video analysis → coaching → optional deep review) without any mounted screen; each step can be retried on its own from the Result screen. `processingEvents.ts` is a small pub-sub that screens subscribe to for live status instead of driving the pipeline themselves.
- `src/screens/PreviewScreen.tsx` — sits between Recording and Processing. Nothing is written to the DB or uploaded anywhere until the user chooses "Save" here (vs. "Discard", which just deletes the temp video file) — recording no longer auto-saves/auto-processes the instant it stops.
- `src/components/common/ToastProvider.tsx` — a small Reanimated-based toast, plus a module-level `showGlobalToast()` escape hatch so non-component code (the background pipeline) can surface feedback (e.g. "session graded", streak milestones) regardless of which screen is open.
- `src/services/account/`, `src/services/purchases/` — the optional account (anonymous by default, linked to Apple or Google on request) and Tono Plus through RevenueCat, with the trial read from the App Store's introductory offer.
- `src/services/secrets/secretsStore.ts` — deletes keychain items for removed features at launch, including the API keys testers pasted when Tono had bring-your-own-key.
- `src/services/data/resetApp.ts` — Settings' "Reset app": drops every table and reruns the migrations (like a fresh install), deletes every video, clears preferences and logs, cancels reminders, and sends you back to onboarding. The Tono account survives.

## Native dependencies requiring an EAS rebuild

Beyond the original camera/face-detection stack: `expo-video` (Result screen video playback), `react-native-gifted-charts` + `react-native-svg` (Trends chart, Phase 6), `expo-notifications` (daily reminder, Phase 7), `expo-secure-store` (the key to the encrypted sign-in session), `react-native-purchases` (Tono Plus), `expo-apple-authentication` and `expo-web-browser` (optional sign-in). None of these need extra config beyond what's already in `app.config.ts`'s `plugins` array. As always on this Windows-only dev setup, a JS-only change just needs a dev-client reload; anything that adds/updates a native module needs `eas build --profile development --platform ios` first.


## Versions, builds and over-the-air updates

Three different numbers get called "the version". They live in different places and change for different reasons.

| What | Where it lives | Who changes it |
| --- | --- | --- |
| **Version** (`1.0.0`) | `version` in `app.config.ts`. It's the number in Settings and on the App Store, and it is also the **runtime version**: the key that decides which over-the-air updates a build may receive. | You, by hand. |
| **Build number** (iOS build `5` at the time of writing) | Stored on EAS (`appVersionSource: "remote"`). `autoIncrement` is on for the `production` and `testflight` profiles. | EAS, on every build. Never edit it. Check it with `eas build:version:get -p ios --profile testflight`. |
| **Update ID** | One per `eas update`. Shown in Dev → App tools → Over-the-air updates. | EAS, on every update. |

### What ships how

| The change | What to do |
| --- | --- |
| JavaScript only: lessons and other content, copy, screens, logic, new database migrations, the built-in topic list | Nothing to bump. Publish an update: `npm run update:testflight -- --message "..."` or `npm run update:production -- --message "..."`. It reaches phones on their next cold start: the first launch downloads it, the second runs it. |
| Anything native: a new or upgraded native library, a config plugin or permission change, the icon or splash screen, an Expo or React Native upgrade, the face model | **Bump `version`**, then build and submit. It can't be an update. |

To check whether a change is native since your last build, compare against the commit you built:

```
git diff <last-build-tag> -- package.json app.config.ts plugins modules assets
```

If that shows a dependency, a plugin, a permission or an image, it needs a build and a new `version`.

### How to number the version

Plain `MAJOR.MINOR.PATCH`:

- **Minor** (`1.0.0` → `1.1.0`) for every build that changes native code. This is the common case.
- **Patch** (`1.1.0` → `1.1.1`) for a small native-only fix that you want a separate store release for.
- **Major** (`1.x` → `2.0.0`) for a big relaunch or redesign.
- **No change** for a TestFlight rebuild with nothing native in it. The build number still goes up on its own.

The App Store wants each version submitted for review to be higher than the last one released. TestFlight accepts several builds of the same version.

Tag the commit you build from (`git tag v1.1.0`). The tag is what you diff against next time, and what you check out to publish an update for an older version (below).

### Can the version be changed over the air?

No, it needs a build. Two reasons:

1. The version is written into the app itself (iOS `Info.plist`, Android manifest) when it's built. An update replaces the JavaScript, not the app.
2. With `runtimeVersion: { policy: "appVersion" }` the version is how updates are matched to builds. If you change `version` in `app.config.ts` and publish an update, that update gets the new runtime version, and no installed build has it, so nobody receives it.

### After you bump the version

- Updates only reach builds with the **same** version. Builds of the old version stay on the last update they got.
- To send a fix to an old version, check out its tag, publish from there (`git switch --detach v1.0.0`, then `npm run update:production -- --message "..."`), and come back.
- If you forget to bump after a native change, an update made afterwards can reach an older build that is missing the native part it needs. `expo-updates` has crash recovery that falls back to the build's own bundle when an update crashes on launch, but it can't catch JavaScript that fails later. This is the reason for the rule above.

### Why not the "fingerprint" policy

It would pick the runtime version automatically from the native code. It was tried and removed: EAS Build recomputes the fingerprint on its own machines after its iOS prebuild, and from Windows it never matched, which failed the iOS build at "Configure expo-updates" (build `b68591c4`). `appVersion` is a plain string that can't mismatch, at the cost of the bump being manual.
