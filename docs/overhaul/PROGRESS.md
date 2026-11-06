# Overhaul progress

Read `PLAN.md` first. Work on the first task below that isn't `done`. Anything not in the plan goes on the "Later" list at the bottom.

**Status values:** `todo`, `doing`, `done`, `iphone` (the code is finished and it's waiting on the owner's phone test). A `done` or `iphone` row must say what proved it.

## Where we left off

2026-11-06: step −1, setup, Phase 0 (PRs #29 to #35) and the build of Phase 1 (PRs #36 to #42) are merged into `staging`. The owner ran Signal Lab on the iPhone twice and sent the raw recordings. Replaying them against Praat and SwiftF0 found the rest of the bugs (`DECISIONS.md` D7, D8), and on those recordings every test now passes except Word stress (stays Beta) and Pitch variety's two bars, which wait on the owner's decision. Round 3 was that fresh run (`DECISIONS.md` D9): six tests held, three narrowly missed and were fixed on the recordings. Round 4 is next: a short fresh run of those three (`device-checks.md`, Phase 1). The owner also has to decide the Pitch variety bars. Then I set the statuses, wire scoring and close Phase 1. To replay recordings against the code: unpack the tar and run `LAB_RAW_DIR=path LAB_OUT=out.json npx jest replay.local`. The hosted judge eval (1.9) also needs the server, so it is the owner's or a later session's.

**Running the emulator:** another project's Metro may be on 8081, so use `--port 8082` and open the dev client with that port. Rebuild the dev client with `bash scripts/build-android-dev.sh [git ref]` (only when native code changes). It builds in a worktree at `C:/dev/tb`, because the repo's path is too long for the native build tools; stop leftover Gradle and Kotlin daemons first if it fails with EBUSY or out-of-memory. To see the soft keyboard, see section 2.5b of the emulator plan. If a Metro hangs, kill it by its process id: stopping the background shell doesn't always end it.

## Step −1: clean the repo

| ID | Task | Status | Evidence |
|---|---|---|---|
| C.1 | Merge the hotfix round and dev helpers into `staging` | done | Commit 6999783; 120 suites pass |
| C.2 | Commit the plan as `docs/overhaul/PLAN.md` | done | Commit 49944a5 |
| C.3 | Find and remove what's stale | done | `docs/decisions/cleanup-2026-11.md` |
| C.4 | Verify: type-check, tests, iOS and Android bundles, emulator smoke test | done | 2026-11-06: tsc clean, 1,537 tests pass (16 removed with dead code, 7 added), both bundles build; new dev client on the emulator opens Today and switches tabs, 3 cold starts with no errors |
| C.5 | Owner's answers: hotfix checks, `secretsStore.ts`, remote branches | done | Hotfix checks folded into `device-checks.md`; `secretsStore.ts` removed; four remote branches deleted after confirming they were in `origin/staging` |

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
| 0.1 | Keyboard never covers a field, app-wide (`react-native-keyboard-controller`, new build) | iphone | PR #32. Android emulator: event check-ins (long page with a pinned Save), Add a prompt, onboarding name question. Needs a new iPhone build and the checks in `device-checks.md` |
| 0.2 | After-event check-in asks how it went and whether you did your focus | done | PR #34. Emulator: both questions show from the Today card; migration v36 ran on a real database; 13 new tests |
| 0.3 | Filler words read as yellow, on a new `highlight` token, in both themes | done | PR #33. Emulator screenshots in light and dark; contrast 14.2:1 and 5.3:1, tested |
| 0.4 | Fix the "overall 0/10" toast (`sessionPipeline.ts:234`) | done | PR #29. `judgedToastText` tested; the toast now reads `sessions.session_score` |
| 0.5 | Skill check seeds starting levels (`progressRepo.ts:95`) | done | PR #30. Tests on a real SQLite database; the first check's samples are placement samples (`DECISIONS.md` D5) |
| 0.6 | Skill guide and warm-up copy stop claiming things that aren't true | done | PR #31. Confidence no longer lists warm-ups; a test guards it |

## Phase 1: prove the readings

| ID | Task | Status | Evidence |
|---|---|---|---|
| 1.1 | Signal Lab home: list of tests, status, last result, export as JSON, folds in Voice, Face and ASR Labs | done | PRs #36, #37. Dev, Labs, Signal Lab: home (21 tests by group, Beta readings with preview switches, JSON export), test screen, runner; the capture check runs end to end on the Android emulator. Voice Lab stays reachable from a take; Face Lab and ASR Lab are linked from the home and keep their Dev rows |
| 1.2 | Voice tests: pitch variety, glide, endings, gain, distance, emphasis, word stress, pauses, pace | iphone | PR #40. Nine voice tests with evaluators and 88 tests on made-up signals. Needs the iPhone run |
| 1.3 | Clarity tests: fillers, recognizer vs Whisper, Whisper speed | iphone | PR #41. Three clarity tests, evaluators tested. Needs the iPhone run and the Whisper model |
| 1.4 | Presence tests: looking, glances, preview, expression, face events | iphone | PR #39. Five presence tests, evaluators tested on made-up timelines. Needs the iPhone run |
| 1.5 | Content tests: word links, on topic, judge | doing | PR #41. The three content tests are listed and blocked: the phone meaning check is phase 3b, the judge needs the hosted eval and about 30 hand-rated takes |
| 1.6 | Better formulas from 6.5C: within-phrase pitch variation, pitch cleanup, multi-cue emphasis, Whisper-gap pauses, look grouping, face events against rest | doing | PRs #39, #40. The candidate formulas exist beside today's (phrase pitch variation, pitch cleanup, multi-cue stress, Whisper-gap pauses, ending slope, look grouping, face movement against your own rest); the tests compare them. Nothing is promoted into scoring until the iPhone results are in. Not built: the take-audio-session experiment (native), SwiftF0, Silero |
| 1.7 | Trust status for each reading, in code, that scoring obeys; preview switch in Dev | done | PRs #36, #38. `readingTrust.ts` registry; scoring leaves unproven readings out (both sheets, sheet version 6) and labels them Beta; Dev preview switch and a Rescore button. Emulator: a Scores tab shows Pauses with the Beta caption |
| 1.8 | Owner runs Signal Lab on iPhone; statuses set from results | doing | Round 1 run on an iPhone (iOS 26.6). Volume carry promoted; everything else needs round 2 (`DECISIONS.md` D7, `device-checks.md`, Phase 1) |
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

- Volume carry counts now, but no take score reads it yet (the leaf arrives in 3a). When it does, it must use the face-size correction the distance test proved.
- Apple SpeechAnalyzer matched Whisper on one passage (no real word errors for either; Whisper's 9% was writing "9:00" for "nine"), and kept 10 of 10 fillers, about three times faster with no 574 MB download. iOS 26 only. It could be the engine there if it gives word times; better word times could also fix Word stress.
- Word stress (Stress on the right words) stays Beta: the stress shows clearly in the audio, but Whisper's word times are too coarse in a short sentence to say which word it landed on. No take score reads it. Better word times would be the fix (Apple's, or Whisper's DTW timestamps, a native change).
- Endings find a sentence's end from the pause nearest Whisper's end, because Whisper's was up to 1.6 s out. In talk with no pause at a sentence's end, that can read an earlier phrase's ending. The leaf isn't in a score until 3a; check it on real takes then.
- Eye contact is measured from each take's own middle, so a take read entirely off notes held low can still pass as eye contact. The eyelids may be a way to catch it: they drop when you look down (about 0.65 open at notes, 0.81 to 0.87 elsewhere).
- SwiftF0 tested on the recordings and not built: see D8. Worth another look if a higher voice or an echoey room fails the pitch tests.
- Everything is proven on one person's low voice (about 80 to 120 Hz) on one phone. Run the voice tests with a higher voice before launch, along with the plan's second-device check.
- Face Lab's live readout applies the new head limits without a take's centre, so it can say "head away" for a phone held low.
- Promoted readings read today's take formulas until 3a: Melody reads the overall range, Emphasis the peak spread. Face movement can't be promoted until the sheet reads brow lifts and smiles a minute instead of today's expressiveness.
- The Android emulator can't decode its own recordings (FFmpeg: decoder not found), so Signal Lab's numbers only mean something on the iPhone; the runner reports it instead of failing.
- Not built from plan 6.5C: the take audio-session experiment (needs a native change and a new build, worth doing if the volume tests fail), SwiftF0 and Silero (only if the pitch and pause tests fail).
- `skillCheck.ts` and `ruleCoach.ts` still call the scorers directly, so they still use unproven readings; they move when the skill tree lands (3a, 7).
- Script takes have no Confidence category while eye contact and expression are unproven (their only measured parts), so a script take's score is now cadence and clarity only.
- The Path finale ("Your journey") reads the old skill and stage data. Re-check it after phases 3a and 5, and add its device checks then.
- `KeyboardForm` serves the older `ScreenContainer` screens; fold those into `Screen` when they move in phases 5 and 8, and drop it.
- The dark-mode filler highlight is a deep gold (`#7A6200`); revisit its look in phase 8 if you'd like it brighter.
- `KeyboardProvider` preloads the keyboard at start, which can flash it on iOS launch. If you see that on the iPhone, set `preload={false}` in `App.tsx`.
- One uncaught SQLite error on the first launch after installing the new dev client (`NativeDatabase.prepareAsync`: "Cannot use shared object that was already released"). It didn't come back in 3 cold starts. Watch for it; phase 2's new schema touches this code.
