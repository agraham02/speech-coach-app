# Overhaul progress

Read `PLAN.md` first. Work on the first task below that isn't `done`. Anything not in the plan goes on the "Later" list at the bottom.

**Status values:** `todo`, `doing`, `done`, `iphone` (the code is finished and it's waiting on the owner's phone test), `blocked` (can't start until something outside the code happens; the row says what). A `done` or `iphone` row must say what proved it.

## Where we left off

2026-11-07: Phase 3a's tasks are all done (D15 to D17). A fresh review of the whole phase found four real problems, all fixed: the Library's ring read 0 to 10, the Path finale compared the check's number with the pillar's, Concise never moved Within limits, and Move it hid the trail on a level-up. 3b.1 (gates, D18) is done and 3b.2 (the judge, D19) is built. The owner deployed the server on 2026-11-08, so 3b.2 is waiting only on an iPhone test. D20 puts every native piece the rest of the plan needs into one build: **the owner makes it (`device-checks.md`, "The one build"), then everything else ships as updates.** Next is 3b.4, the phone's meaning checks, because the native module it needs is now in the one build (D20), then 3b.3. The owner's iPhone checks for phases 0, 2 and 3a are in `device-checks.md`. Still open from before: 1.5 and 1.9 (blocked), and republishing `docs/privacy.md` and `docs/terms.md`. To replay recordings against the code: unpack the tar and run `LAB_RAW_DIR=path LAB_OUT=out.json npx jest replay.local`.

**Running the emulator:** another project's Metro may be on 8081, and a stale Metro of this repo can be left on 8082 or elsewhere without showing in `netstat` or `Get-NetTCPConnection`, so the emulator loads old code from it. Check with `curl 127.0.0.1:PORT/status`, find leftovers with `Get-CimInstance Win32_Process` for node processes started from this repo, kill them by id, and use a port that refuses connections (8083 worked). Check the installed app too: `adb shell dumpsys package com.ahmadgraham.tono | grep versionName` must say 2.0.0, and the dev client needs a build that has `react-native-keyboard-controller`; a stale APK fails with "doesn't seem to be linked". `adb install -r -d C:/dev/tb/android/app/build/outputs/apk/debug/app-debug.apk` fixed it without a rebuild. Otherwise use `--port 8082` and open the dev client with that port. Rebuild the dev client with `bash scripts/build-android-dev.sh [git ref]` (only when native code changes). It builds in a worktree at `C:/dev/tb`, because the repo's path is too long for the native build tools; stop leftover Gradle and Kotlin daemons first if it fails with EBUSY or out-of-memory. To see the soft keyboard, see section 2.5b of the emulator plan. If a Metro hangs, kill it by its process id: stopping the background shell doesn't always end it.

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
| 1.1 | Signal Lab home: list of tests, status, last result, export as JSON, folds in Voice, Face and ASR Labs | done | PRs #36, #37, #43. Home, runner, results, JSON export and raw recordings export. Run on an iPhone (iOS 26.6) in four rounds. Voice Lab stays reachable from a take; Face Lab and ASR Lab are linked (D6) |
| 1.2 | Voice tests: pitch variety, glide, endings, gain, distance, emphasis, word stress, pauses, pace | done | PRs #40, #43 to #46. Run on the iPhone. Passed: pitch variety, glide, gain, distance, emphasis, pauses, pace. Failed, so those leaves stay display-only as the plan says: endings, word stress (D11) |
| 1.3 | Clarity tests: fillers, recognizer vs Whisper, Whisper speed | done | PRs #41, #44. Run on the iPhone: Whisper kept 10 of 10 fillers, reads 30 s in 3.4 s, no real word errors. The rule stands: scores read Whisper, because the system recognizer dropped every filler |
| 1.4 | Presence tests: looking, glances, preview, expression, face events | done | PRs #39, #43 to #45. Run on the iPhone, all pass: looking, glances, preview, expression, face events |
| 1.5 | Content tests: word links, on topic, judge | blocked | PR #41. The three content tests are listed and blocked: the phone meaning check is phase 3b, the judge needs the hosted eval and about 30 hand-rated takes |
| 1.6 | Better formulas from 6.5C: within-phrase pitch variation, pitch cleanup, multi-cue emphasis, Whisper-gap pauses, look grouping, face events against rest | done | PRs #39, #40, #43 to #45. Tried on real recordings against Praat and SwiftF0, logged in D7 to D9. Real takes use: far pitch frames judged a run at a time, the level gate, the silence trim, the head limits from each take's centre. Beside the score until 3a reads them: within-phrase pitch, stand-out, brow lifts and smiles. Not built, because no test needs them: the take audio-session experiment, SwiftF0, Silero |
| 1.7 | Trust status for each reading, in code, that scoring obeys; preview switch in Dev | done | PRs #36, #38, #48. `readingTrust.ts` decides what counts, and scoring obeys it |
| 1.8 | Owner runs Signal Lab on iPhone; statuses set from results | done | Four rounds on an iPhone. Counts now: pauses at sentence ends, deliberate pauses, pitch variety, stand-out stress, volume carry, eye contact, long look-aways. Stay Beta: endings, stress on the right words, range across feelings, face movement (D11) |
| 1.9 | Run the hosted judge eval | blocked | Needs the server set up and about 30 takes the owner rates by hand (`spikes/inference-eval`) |

## Phase 2: log and sync

| ID | Task | Status | Evidence |
|---|---|---|---|
| 2.1 | New schema, wiping old data on first launch | done | `db/schema.ts` replaces the 36 migrations; a test proved it identical to them (31 tables, columns, keys, 10 indexes, seeds). 1,820 tests pass, `tsc` clean, both bundles build. Android emulator, real expo-sqlite: a version 27 database became 37, the `sessions` folder and preferences were cleared, onboarding showed, a second launch left it alone (`DECISIONS.md` D13) |
| 2.2 | `activity_log`, written by every runner through `completePracticeStep` | done | Schema step 38; every runner that called it now reports its activity, and so do takes (all kinds), Rewind, Prime, Debrief, event check-ins and the skill check. Three things and Talk back log too; MarkItUp, PlanYourPoint and Speech study have no activity yet (D14). Tests on real SQLite in `activitySync.test.ts`; `schema.test.ts` for 37 to 38 |
| 2.3 | `src/content/activities.ts` catalogue | done | Every drill, guided exercise, warm-up, lesson, speak, reflect, moment and check has an id; a test checks all 26 guided, 71 lessons and every lesson step are found. `gate` and `number` fields stay empty until 3b.1 and 3a.2 (D14) |
| 2.4 | Check-offs as queries, syncing both ways | done | `domain/activityLog.ts`, tested for anywhere-today, from-the-plan, skips, two reps, top-ups, structures; real-database tests for Practice to plan, plan to lesson, Practice to lesson |
| 2.5 | Lesson steps persist across days; lessons use real average scores | done | Tested across days, a review starting over, an unscored lesson, a failing average; the "made-up 0.8" is gone; short plans bring undone steps first, and a test runs all 71 lessons at 5, 8 and 12 minutes to show each finishes from Today alone. A fresh reviewer's findings were fixed (D14) |
| 2.6 | Seeded demo takes still work on the new schema | done | `seedDemo.test.ts` (real SQLite, new schema through step 38) passes after 2.2 to 2.5, so demo takes are stored and scored as before. Not opened on the emulator this session |

## Phase 3a: tree and grid

| ID | Task | Status | Evidence |
|---|---|---|---|
| 3a.1 | `skillTree.ts`, matching Appendix C, with conformance test | done | `domain/scoring/skillTree.ts`; `overhaulPlan.test.ts` compares every pillar, skill, leaf, weight and trust, plus the scale, starting value, seed range and take weights, with Appendix C. Every Signal Lab reading is tied to one leaf, and `leafCounts` follows `readingTrust.ts` (D15). Deliberately wrong weights and trust values were caught |
| 3a.2 | `skillGrid.ts`, with coverage test for every activity, lesson step and leaf | done | `content/skillGrid.ts`. Coverage: every catalogue activity, drill, guided exercise, warm-up, lesson step and leaf. Conformance: the rows' numbers and moves are compared with section 7's tables, and targets and steps with Appendix A's 71 lessons. Deliberately wrong dots, leaves, numbers and targets were caught. Nothing reads it to move a score until 3a.3 (D15) |
| 3a.3 | Leaf ratings and roll-up, with the worked example as a test. A leaf built from several signals combines them (plan 6.4, rule 10) | done | `scoring/rollup.ts`, `leafEvidence.ts`, `takeLeaves.ts`, `takeFacts.ts`, `db/leafRepo.ts`; schema 39 drops the five skill ratings (D16). The worked example is a test, pure and on real SQLite; weight sharing, Composure never falling, self-ratings, phone estimates and every leaf formula are tested. 19 deliberate breaks were all caught. Takes and drills move the tree; the personal rows wait for 3c.4 |
| 3a.4 | Final levels and stages, thresholds tested | done | `domain/levels.ts`: level 1 to 25 from Overall, a high-water mark; every stage's score, attempts and proof at difficulty tested, and compared with Appendix C in `overhaulPlan.test.ts`; attempt labels; earned stages never drop |
| 3a.5 | Take scored on the tree, 0–100; old two-layer scores deleted | done | `scoring/takeScore.ts` rewritten, `repEvidence.ts` and the two sheets deleted (D17). Tested: Delivery vs Overall, Delivery unchanged by a judge, weights, Beta leaves shown and left out, script and stutter takes. Emulator, real expo-sqlite: 13 demo takes scored and listed out of 100, a judged Result and its Scores tab read correctly |
| 3a.6 | The trail on every result | done | On a take's Result, under each drill result, a toast where there's no result screen, and a kind line when nothing moved. Emulator: a demo take's Result showed "Ums and uhs +10.3 · Fillers +8.1 · Clarity +3.6 · Overall +1.30". Not run on the emulator: a live drill's card and the toast, since it has no usable mic; tested by `tsc` and the unit tests |

## One native build (D20)

| ID | Task | Status | Evidence |
|---|---|---|---|
| N.1 | Every native piece (including `expo-network`, found by the fresh review) the rest of the plan needs, a Native check screen, and a guard against needing another build | done | `modules/tono-language` (Swift, autolinking finds it); version 2.1.0; Dev, Native check; `npm run check:native` fails on a native change without a version bump and was shown to. Not compiled: Swift can't be built on this machine |
| N.2 | Owner makes the one build and opens Dev, Native check | iphone | Needs `eas build`, then "This build has everything" on the Native check screen. Steps in `device-checks.md` |

## Phase 3b: gates and content checks

| ID | Task | Status | Evidence |
|---|---|---|---|
| 3b.1 | A gate for every activity in section 7, with validity tests | done | `domain/gates.ts`, `gates.test.ts`: every gate the phone can check today, and a real-database test that a failed gate moves nothing and keeps the attempt. The gates that need a later task are named in D18 and on those rows. Emulator, real expo-sqlite: rescoring at launch left the two demo takes with too few words unscored, and a Result says "We couldn't score this one". Not run on the emulator: a live drill's gate, since it has no usable mic |
| 3b.2 | Phone owns delivery; the judge narrowed to Message on 0–5, with verified quotes | iphone | Six leaves on written levels, a quote the phone verifies, and "not scorable" (D19). `judgedReview.test.ts`, `prompts.test.ts`; demo reviews pass the real checks. **Needs the server deployed** and a real review on the iPhone; no live call has been made. The rubrics are unvalidated until 1.9 |
| 3b.4 | Phone content checks with `NLEmbedding` | iphone | D21. The phone runs a gold set on itself and each check (word links, words in a category, on-topic and coherence) turns on only if it passes there. Word chain falls back to the phone when Tono AI isn't available; Category sprint drops words outside the category; takes and Sixty seconds/Random-word story fail on nonsense. Signal Lab's Word links and On topic tests now run. Tested with a pretend phone (plumbing and safety), `tsc` clean. **Apple's real vectors are untested:** needs Signal Lab, Content on the iPhone. I used `NLEmbedding` only: the contextual embeddings weren't tried, since one that passes is enough |
| 3b.3 | Whisper scores drills; the live recognizer is display only | iphone | D22. Drills record their clip and Whisper reads it; the score uses its transcript and word times; a Quick check (counts light) when the model is missing. Pause reading counts pauses at the marks only; Word chain cuts runs by time. New tests, including section 16's pauses-away-from-marks, `tsc` clean. Not run on a phone: needs the iPhone checks |
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

Things that came up and aren't in this plan. The readings still on Beta, and what to research for each, are in plan section 6.5F.

- Speech study, Rehearse, Plan your point, Missions, the monthly comfort check-in and the attention rating have catalogue ids and grid rows, but don't write to the activity log yet. MarkItUp has no id of its own: its reps run through Line rep, which logs. Wire these when their rows start moving scores (3c).
- Reaching a new level on its own has no celebration yet, only a stage does (D16). Section 15 covers it in phase 8.
- **Check in 3d: takes at the rep's low difficulty.** A take's difficulty starts at 1 and rises at most 0.18 per good take. A leaf settles where the formula expects your score, 10 × difficulty + 15 × ln(score ÷ (1 − score)), so at difficulty 1 a steady 60 settles near 16, 80 near 31 and 95 near 54. That's the plan's formula, but it means an honest 60 lowers a leaf from its starting 25, and takes can't count as proof for Steady (difficulty 3) until about a dozen good ones in. 3d.1 and 3d.2 should fix this by working out a take's difficulty from its prompt, prep and length. Run a simulated user and check the plan's half a point to a point a day before trusting that pace.
- 3c.2: record warm-ups with `react-native-audio-api`'s `AudioRecorder`, not the speech recognizer (D20): a hiss has no words, so the recognizer restarts and leaves gaps.
- Face movement's bar of 12 brow lifts and smiles a minute is a first guess, and Rhythm, Restarts, No detours, Specifics and Starting fast are the plan's "Tune" numbers (D16, D17). Set them from real takes.
- The coach (`ruleCoach.ts`) and its observations still read the old 0-10 bands. It doesn't affect scores, but what it calls good may not match a leaf's number. Worth lining up when the coach moves onto the tree.
- Volume carry on a take reads the last word against the rest of the sentence, which doesn't depend on distance (D16). A level target for takes would need the face-size correction the distance test proved.
- Apple SpeechAnalyzer matched Whisper on one passage (no real word errors for either; Whisper's 9% was writing "9:00" for "nine"), and kept 10 of 10 fillers, about three times faster with no 574 MB download. iOS 26 only. It could be the engine there if it gives word times; better word times could also fix Word stress.
- Word stress (Stress on the right words) stays Beta: the stress shows clearly in the audio, but Whisper's word times are too coarse in a short sentence to say which word it landed on. No take score reads it. Better word times would be the fix (Apple's, or Whisper's DTW timestamps, a native change).
- Endings failed on fresh audio in every round (6 of 10 in the last), though Praat read the same way got 8 and 9 of 10. App misses include stray frames at the very end of a statement. Worth one more try when 3a wires the leaf; until then it stays Beta.
- The score bands for pitch and emphasis are set from one low voice on one phone. Check them with other voices before launch.
- Endings find a sentence's end from the pause nearest Whisper's end, because Whisper's was up to 1.6 s out. In talk with no pause at a sentence's end, that can read an earlier phrase's ending. The leaf isn't in a score until 3a; check it on real takes then.
- Eye contact is measured from each take's own middle, so a take read entirely off notes held low can still pass as eye contact. The eyelids may be a way to catch it: they drop when you look down (about 0.65 open at notes, 0.81 to 0.87 elsewhere).
- SwiftF0 tested on the recordings and not built: see D8. Worth another look if a higher voice or an echoey room fails the pitch tests.
- Everything is proven on one person's low voice (about 80 to 120 Hz) on one phone. Run the voice tests with a higher voice before launch, along with the plan's second-device check.
- Face Lab's live readout applies the new head limits without a take's centre, so it can say "head away" for a phone held low.
- The Android emulator can't decode its own recordings (FFmpeg: decoder not found), so Signal Lab's numbers only mean something on the iPhone; the runner reports it instead of failing.
- Not built from plan 6.5C: the take audio-session experiment (needs a native change and a new build, worth doing if the volume tests fail), SwiftF0 and Silero (only if the pitch and pause tests fail).
- `skillCheck.ts` and `ruleCoach.ts` still call the scorers directly, so they still use unproven readings; they move with phase 7 and when the coach is rewritten.
- The Path finale ("Your journey") reads the old skill and stage data. Re-check it after phases 3a and 5, and add its device checks then.
- `KeyboardForm` serves the older `ScreenContainer` screens; fold those into `Screen` when they move in phases 5 and 8, and drop it.
- The dark-mode filler highlight is a deep gold (`#7A6200`); revisit its look in phase 8 if you'd like it brighter.
- `KeyboardProvider` preloads the keyboard at start, which can flash it on iOS launch. If you see that on the iPhone, set `preload={false}` in `App.tsx`.
- One "database is locked" warning from the launch's purge step after a dev reload, on the emulator (2026-11-07). It didn't recur on the next launch, and a reload can leave the old JS holding the database. Watch for it on a cold start.
- One uncaught SQLite error on the first launch after installing the new dev client (`NativeDatabase.prepareAsync`: "Cannot use shared object that was already released"). It didn't come back in 3 cold starts, nor in the 2 launches that tested 2.1's new schema code. Watch for it.
- The clean start runs after the database is wiped. If the app is killed between the two, the old videos and settings stay until Reset app. They are test data, so it isn't worth a marker yet.
- Videos already uploaded for a deep review aren't deleted from Google by the clean start (Reset app does it, from the sessions table, before the wipe). Google drops them after 48 hours anyway.
