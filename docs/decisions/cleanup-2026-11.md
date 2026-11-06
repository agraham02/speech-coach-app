# Codebase cleanup, 2026-11-06

Step −1 of [the overhaul plan](../overhaul/PLAN.md), done on `staging`. Code the overhaul replaces was left for its own phase to delete, so the app keeps running throughout.

## Merged first

- `fix/hotfix-round-1` (15 commits), as a fast-forward.
- `feature/dev-test-helpers` (7 commits). Conflicts were in `accountStore.ts` and `purchases.ts`, because the hotfix round removed anonymous accounts. The dev presets moved from `ageRange` to `birthDate`, and the mock account's "Anonymous" option became "Apple".

## Removed

- **Files:** `src/components/common/TextField.tsx`, `src/domain/conversation/live/cost.ts`, `src/screens/ProcessingScreen.tsx` and its route.
- **`docs/history/`:** the four finished plans. Its marking guide is still in use, so it moved to [marking-guide.md](./marking-guide.md). The other plans are in git history.
- **Exports nothing used:** `DEFAULT_PARTNER_VOICE`, `taskSection`, `filledShare`, `getRecentDrillCompletions`, `rowToDrillCompletion`, `DrillCompletionRow`, `DspStatus` (the copy in `audioAnalysis.ts`), `PassageKey`, `RewindModelOutput`, `modeLabel`, `RoleModelConfig`, `ConverseRequest`.
- **Exports only tests used, with their 16 test cases:** `nextSteps`, `usageFromOpenAI`, `usageFromAnthropic`, `speedLabel`, `detectPauses`, `planPriceLine`, `needsPersonToAct`, and the cost-per-minute model. `isDenyCode` stays as a private helper, because `describeTonoError` calls it.
- **Unused locals:** in `ThreePassPlayer.tsx`, `WorkBar.tsx` and `StatePresetsScreen.tsx`.
- **`react-dom` dependency:** an optional peer for web only.
- **`src/services/secrets/secretsStore.ts`:** the launch-time deletion of keys testers pasted when Tono had bring-your-own-key. The owner confirmed it isn't needed.
- **`docs/testing/hotfix-round-1.md`:** its checks that still apply after the overhaul moved to [device-checks.md](../overhaul/device-checks.md). The ones for screens the overhaul replaces were dropped.
- **Remote branches:** `feature/conversation-voice`, `feature/tono-ai`, `fix/prep-timer-and-audio-session` and `feature/dev-test-helpers`, after checking each was fully inside `origin/staging`.
- **Local output:** `dist/` and `modules/*/android/.gradle`, which are now ignored.
- **Branches and worktree:** local `feature/tono-ai`, `fix/hotfix-round-1`, `feature/dev-test-helpers`, and the worktree at `C:/dev/tono-devseed`.

## Corrected

The README, privacy policy, launch checklist and both test plans still described anonymous accounts or an age-range question. **`docs/privacy.md` is a published page, so it needs republishing.**

Still out of date: the emulator plan's onboarding age steps (ONB-5 to ONB-7) and the device plan's age section. Phase 7 rewrites onboarding, so they get rewritten with it.

## Deliberately kept

- **`buffer`:** nothing imports it directly, but `whisper.rn` needs it through `safe-buffer`. Removing it broke the iOS bundle, which settles the question left open in the last cleanup.
- **`expo-dev-client`, `expo-system-ui`, `react-native-gesture-handler`, `react-native-screens`:** the build or other libraries need them.
- **Constants and helpers tests use to keep rules in sync:** `isDemoId`, `NO_FILTER`, `TRIAL_JUDGED_TAKES`, `PLUS_ENTITLEMENT_ID`, `PROMPT_TASKS`.
- **About 100 exports used only inside their own file:** harmless.
- **Code the overhaul replaces:** `taxonomy.ts`, `curriculum.ts`, `curriculumRepo.ts` and similar. Their phases delete them.

## How to re-run the checks

```
npx knip --no-progress --reporter compact
npx knip --production --no-progress --reporter compact
npx tsc --noEmit --noUnusedLocals --noUnusedParameters
```

Knip reports `supabase/functions` (Deno entry points) as unused files; they are used.
