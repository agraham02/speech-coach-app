# Overhaul progress

Read `PLAN.md` first. Work on the first task below that isn't `done`. Anything not in the plan goes on the "Later" list at the bottom.

**Status values:** `todo`, `doing`, `done`, `iphone` (the code is finished and it's waiting on the owner's phone test). A `done` or `iphone` row must say what proved it.

## Where we left off

2026-11-06: step −1 and setup are done and on `staging`, except C.5, which waits on the owner's answers. Phase 0 is next.

**Running the emulator:** another project's Metro may be on 8081, so use `--port 8082` and open the dev client with that port. Rebuild the dev client with `bash scripts/build-android-dev.sh` (only when native code changes). It builds in a worktree at `C:/dev/tb`, because the repo's path is too long for the native build tools.

## Step −1: clean the repo

| ID | Task | Status | Evidence |
|---|---|---|---|
| C.1 | Merge the hotfix round and dev helpers into `staging` | done | Commit 6999783; 120 suites pass |
| C.2 | Commit the plan as `docs/overhaul/PLAN.md` | done | Commit 49944a5 |
| C.3 | Find and remove what's stale | done | `docs/decisions/cleanup-2026-11.md` |
| C.4 | Verify: type-check, tests, iOS and Android bundles, emulator smoke test | done | 2026-11-06: tsc clean, 1,537 tests pass (16 removed with dead code, 7 added), both bundles build; new dev client on the emulator opens Today and switches tabs, 3 cold starts with no errors |
| C.5 | Owner's answers: hotfix checks, `secretsStore.ts`, remote branches | todo | |

## Setup

| ID | Task | Status | Evidence |
|---|---|---|---|
| S.1 | Tracking files: progress, requirements, decisions, device checks | done | `docs/overhaul/` |
| S.2 | `npm run check:overhaul`, run with the tests | done | `src/domain/__tests__/overhaulPlan.test.ts`; 7 tests pass |
| S.3 | Session-start hook, `AGENTS.md` pointer, memory note | done | `.claude/settings.json`, tested by hand; `scripts/overhaul-status.mjs` |
| S.4 | Bump to 2.0.0 | done | `app.config.ts`, `package.json` |

## Phase 0: bug fixes

| ID | Task | Status | Evidence |
|---|---|---|---|
| 0.1 | Keyboard never covers a field, app-wide (`react-native-keyboard-controller`, new build) | todo | |
| 0.2 | After-event check-in asks how it went and whether you did your focus | todo | |
| 0.3 | Filler words read as yellow, on a new `highlight` token, in both themes | todo | |
| 0.4 | Fix the "overall 0/10" toast (`sessionPipeline.ts:234`) | todo | |
| 0.5 | Skill check seeds starting levels (`progressRepo.ts:95`) | todo | |
| 0.6 | Skill guide and warm-up copy stop claiming things that aren't true | todo | |

## Phase 1: prove the readings

| ID | Task | Status | Evidence |
|---|---|---|---|
| 1.1 | Signal Lab home: list of tests, status, last result, export as JSON, folds in Voice, Face and ASR Labs | todo | |
| 1.2 | Voice tests: pitch variety, glide, endings, gain, distance, emphasis, word stress, pauses, pace | todo | |
| 1.3 | Clarity tests: fillers, recognizer vs Whisper, Whisper speed | todo | |
| 1.4 | Presence tests: looking, glances, preview, expression, face events | todo | |
| 1.5 | Content tests: word links, on topic, judge | todo | |
| 1.6 | Better formulas from 6.5C: within-phrase pitch variation, pitch cleanup, multi-cue emphasis, Whisper-gap pauses, look grouping, face events against rest | todo | |
| 1.7 | Trust status for each reading, in code, that scoring obeys; preview switch in Dev | todo | |
| 1.8 | Owner runs Signal Lab on iPhone; statuses set from results | todo | |
| 1.9 | Run the hosted judge eval | todo | |

## Phase 2: log and sync

| ID | Task | Status | Evidence |
|---|---|---|---|
| 2.1 | New schema, wiping old data on first launch | todo | |
| 2.2 | `activity_log`, written by every runner through `completePracticeStep` | todo | |
| 2.3 | `src/content/activities.ts` catalogue | todo | |
| 2.4 | Check-offs as queries, syncing both ways | todo | |
| 2.5 | Lesson steps persist across days; lessons use real average scores | todo | |
| 2.6 | Seeded demo takes still work on the new schema | todo | |

## Phase 3a: tree and grid

| ID | Task | Status | Evidence |
|---|---|---|---|
| 3a.1 | `skillTree.ts`, matching Appendix C, with conformance test | todo | |
| 3a.2 | `skillGrid.ts`, with coverage test for every activity, lesson step and leaf | todo | |
| 3a.3 | Leaf ratings and roll-up, with the worked example as a test | todo | |
| 3a.4 | Final levels and stages, thresholds tested | todo | |
| 3a.5 | Take scored on the tree, 0–100; old two-layer scores deleted | todo | |
| 3a.6 | The trail on every result | todo | |

## Phase 3b: gates and content checks

| ID | Task | Status | Evidence |
|---|---|---|---|
| 3b.1 | A gate for every activity in section 7, with validity tests | todo | |
| 3b.2 | Phone owns delivery; the judge narrowed to Message on 0–5, with verified quotes | todo | |
| 3b.3 | Whisper scores drills; the live recognizer is display only | todo | |
| 3b.4 | Phone content checks with `NLEmbedding` (new build) | todo | |
| 3b.5 | Small content check: server pool, routing, consent, privacy and terms | todo | |
| 3b.6 | Checkpoints | todo | |

## Phase 3c: measure everything

| ID | Task | Status | Evidence |
|---|---|---|---|
| 3c.1 | Mic and a number on all 26 guided exercises | todo | |
| 3c.2 | Warm-ups measured and recorded | todo | |
| 3c.3 | Line of the day records; self-ratings stop moving performance leaves | todo | |
| 3c.4 | Voice analysis on Rewind; inner-voice numbers | todo | |

## Phase 3d: difficulty

| ID | Task | Status | Evidence |
|---|---|---|---|
| 3d.1 | One 1–10 scale; the practice step and `curriculum.ts` removed | todo | |
| 3d.2 | Seed from skill, pull back on drift, rising floors | todo | |
| 3d.3 | Stage proof at difficulty, unlocks by stage, reviews at current difficulty | todo | |
| 3d.4 | Stretch rep and the challenge setting | todo | |
| 3d.5 | New knobs for guided exercises, warm-ups, Rewind, Moments | todo | |

## Phase 4: session and Today logic

| ID | Task | Status | Evidence |
|---|---|---|---|
| 4.1 | Minutes a day replaces both settings, with blocks and budgets | todo | |
| 4.2 | `buildDailyPlan` rebuilt around five slots | todo | |
| 4.3 | Rewind at any hour, with habit detection | todo | |
| 4.4 | Day override that leaves your usual alone | todo | |
| 4.5 | `domain/today/cards.ts`, tested at different hours and event distances | todo | |
| 4.6 | Streak repair, reminders updated | todo | |

## Phase 5: new structure

| ID | Task | Status | Evidence |
|---|---|---|---|
| 5.1 | Four tabs: Today, Path, Practice, You | todo | |
| 5.2 | Practice tab lists every repeatable thing, with search and filters | todo | |
| 5.3 | Path shows lessons; path rules remapped | todo | |
| 5.4 | You tab with the tree as a screen | todo | |
| 5.5 | Settings down to 5 sections | todo | |
| 5.6 | Moments merge Events with Prime and Debrief | todo | |

## Phase 6: results flow

| ID | Task | Status | Evidence |
|---|---|---|---|
| 6.1 | Review screen: predict, 3 passes, skip | todo | |
| 6.2 | Results open at the top, in one piece; nothing pinned | todo | |
| 6.3 | Overview order and accordions | todo | |
| 6.4 | Details as the tree, with the by-phrase strip | todo | |
| 6.5 | Clean transcript with a legend | todo | |

## Phase 7: onboarding

| ID | Task | Status | Evidence |
|---|---|---|---|
| 7.1 | Speak-first flow, using Whisper | todo | |
| 7.2 | Questions moved to their new homes | todo | |
| 7.3 | Skill check as the first session | todo | |
| 7.4 | Test plans' onboarding sections rewritten | todo | |

## Phase 8: look and feel

| ID | Task | Status | Evidence |
|---|---|---|---|
| 8.1 | One type scale; legacy uses and raw `<Text>` migrated | todo | |
| 8.2 | Components per section 15 | todo | |
| 8.3 | Animation moments per section 15; Reduce Motion respected | todo | |
| 8.4 | Appearance setting | todo | |

## Later

Things that came up and aren't in this plan.

- `docs/testing/hotfix-round-1.md`: the owner decides which checks still matter (C.5).
- One uncaught SQLite error on the first launch after installing the new dev client (`NativeDatabase.prepareAsync`: "Cannot use shared object that was already released"). It didn't come back in 3 cold starts. Watch for it; phase 2's new schema touches this code.
