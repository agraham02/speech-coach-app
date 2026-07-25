# Speech Coach App

Personal, unpublished daily speaking-practice app. Full product spec, phase-by-phase status, and changelog are in [plan.md](./plan.md). Phases 1, 3, 4, 5, plus unplanned Phases 6 (UI/UX pass), 7 (daily reminder), and 8 (Free Record + preview/discard + per-session opt-in grading/Notion sync) are built; Phase 2 (on-device transcription toggle) is deferred.

## Setup

1. `npm install`
2. Copy `.env.example` to `.env` and fill in real values:
   - `GEMINI_API_KEY` — from Google AI Studio.
   - `NOTION_TOKEN` — a Notion integration token.
   - `NOTION_PAGE_ID` — the journal page's ID. **You must also share that page with your Notion integration in Notion's UI** (Share → invite the integration by name), or every Notion API call 404s regardless of a correct token/page ID.
3. Since this app uses custom native modules (`react-native-vision-camera`, face detection, `expo-sqlite`, `react-native-mmkv`), it needs a custom **development build** — plain Expo Go won't work.
   - `npx eas login`
   - `eas build:configure` (populates `extra.eas.projectId` in your EAS project)
   - **Register your env vars with EAS** — a gitignored local `.env` never reaches EAS's cloud build servers. Run `eas env:create` for each of `GEMINI_API_KEY`, `NOTION_TOKEN`, `NOTION_PAGE_ID` (scope: project), or the build will embed empty placeholder values.
   - `eas build --profile development --platform ios`
   - Install the resulting build on your iPhone, then `npx expo start --dev-client` to load JS.

## What's checkable without a device build (this repo was developed on Windows, no local Mac)

- `npx tsc --noEmit` — full type-check.
- `npx expo export --platform ios` — bundles the JS, catches import/babel errors.
- `npx expo prebuild --platform android --no-install` — cheap pre-flight for config-plugin misconfiguration (iOS native project generation itself requires macOS/Linux).

None of the above exercise the actual native camera, face detection, haptics, or a real Gemini/Notion round-trip — that only happens on the physical iPhone via an EAS development build.

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
- `src/services/notion/` — hand-rolled `fetch`-based Notion client. Date headings are created as **toggleable `heading_2` blocks** (plain headings can't visually contain children); transcripts are appended as paragraph children of that block, so a second same-day session just adds another paragraph. Note: toggle headings render **collapsed by default** in Notion's UI — if a page looks empty after a successful sync, click the arrow next to the date heading (or check via the API directly) before assuming something's wrong.
- `src/services/db/` — `expo-sqlite`, with `mappers.ts` kept pure (row↔object) and separate from native calls so it's unit-testable in plain Jest. `scores` is a separate table joined to `sessions`; `statsRepo.ts` joins them for Trends.
- `src/services/pipeline/` — `sessionProcessor.ts` runs the whole save→transcribe(/grade)→(optionally) Notion pipeline independently of any mounted screen (fire-and-forget from `PreviewScreen`, after the user chooses "Save"), driven by two explicit per-session booleans (`wantsGrading`, `wantsNotionSync`) resolved from prompted-vs-free-record defaults before the pipeline ever sees them — the pipeline itself doesn't need to know which kind of session it's processing. Also exports `syncSessionToNotion` and `gradeExistingSession` as standalone, independently-triggerable actions for any session missing one or the other (used by Result screen's "Sync to Notion" switch and "Grade with Gemini" button). `processingEvents.ts` is a small pub-sub (with last-known-status caching) that screens subscribe to for live status instead of driving the pipeline themselves.
- `src/screens/PreviewScreen.tsx` — sits between Recording and Processing. Nothing is written to the DB or uploaded anywhere until the user chooses "Save" here (vs. "Discard", which just deletes the temp video file) — recording no longer auto-saves/auto-processes the instant it stops.
- `src/components/common/ToastProvider.tsx` — a small Reanimated-based toast, plus a module-level `showGlobalToast()` escape hatch so non-component code (the background pipeline) can surface feedback (e.g. "session graded", streak milestones) regardless of which screen is open.
- Secrets are embedded in the built app via `app.config.ts`'s `extra` block — acceptable for a personal, unpublished app (see `plan.md` §12), but technically extractable if the app is ever decompiled.

## Native dependencies requiring an EAS rebuild

Beyond the original camera/face-detection stack: `expo-video` (Result screen video playback), `react-native-gifted-charts` + `react-native-svg` (Trends chart, Phase 6), `expo-notifications` (daily reminder, Phase 7). None of these need extra config beyond what's already in `app.config.ts`'s `plugins` array. As always on this Windows-only dev setup, a JS-only change just needs a dev-client reload; anything that adds/updates a native module needs `eas build --profile development --platform ios` first.
