# Automated Android emulator test plan

A plan for an AI agent (with the `android-emulator` MCP tools) to run against Tono on the Pixel_10a emulator. It covers everything the emulator can check. What it cannot check is listed in section 9 and lives in `device-test-plan.md`, the human phone checklist.

Written 2026-10-24 against `staging` after PRs #21 to #23 (sessions 07, 09, 11, 13 and 08 merged). Session 12 (live conversation, branch `feature/conversation-voice`) is not merged: its tests are in section 8.

## Contents

1. [Purpose, how to use it, what to report, rules](#1-purpose-how-to-use-it-what-to-report-rules)
2. [Environment setup (Windows, exact commands)](#2-environment-setup-windows-exact-commands)
3. [Tool habits and emulator gotchas](#3-tool-habits-and-emulator-gotchas)
4. [What the emulator can and cannot test](#4-what-the-emulator-can-and-cannot-test)
5. [Suggested prerequisites (not built)](#5-suggested-prerequisites-not-built)
6. [Smoke test (10 minutes, run first)](#6-smoke-test-10-minutes-run-first)
7. [Test cases by area](#7-test-cases-by-area)
8. [Add after session 12 merges](#8-add-after-session-12-merges)
9. [Not testable here](#9-not-testable-here)
10. [Maintenance](#10-maintenance)
11. [Appendix: templates, label cheat sheet, expected emulator results](#11-appendix)

---

## 1. Purpose, how to use it, what to report, rules

**Purpose.** Find crashes, dead ends, wrong wording, broken layouts and offline failures in the free path and in every screen that does not need a live microphone, the paid server or an iPhone. You run the steps, read the screen, and report.

**How to use it.**

1. Do section 2 (setup) once. Then run section 6 (smoke). If any smoke test fails, stop and report; do not run the rest on a broken build.
2. Run the suites in section 7 in this order of value: ONB, FREE, NAV, SET, TODAY, REC, PRV, RES, LIB, DEL, STR, INPUT, PRAC, TRD, DEV, THEME, FONT, NET, LIFE, DSN, PAY. IDs are stable; run any one alone if its precondition state (below) is met.
3. Each test has a precondition state:

| State | Meaning | How to get it |
|---|---|---|
| S0 | Fresh install, Welcome intro showing | `clear_app_data`, re-grant permissions, relaunch (2.7) |
| S1 | Onboarded with the standard answers, tips off, on Today | ONB-1 (the recipe is in 11.1) |
| S2 | S1 plus one recorded 10 s take saved (it will show Failed on this AVD; that is expected, see 4) | S1, then REC-4 and PRV-4 |

4. Tests marked **[server-touching]** would send something to the real Tono backend or create an account. They are on the stop list in the rules. Do not run them unless the human who started you says so in writing.
5. A test is **blocked** when its precondition cannot be reached on this emulator (for example a Result screen with scores). Mark it blocked, say why in one line, move on. Section 5 says what would unblock them.

**What to report** (write it as your final message; no file needed unless asked).

1. A results table, one row per test run:

| ID | Result | Evidence | Note |
|---|---|---|---|
| ONB-3 | pass / fail / blocked / skipped | what you saw: quoted strings from `get_all_text`, or a one-line screenshot description | only when not a plain pass |

2. A bug list. Each bug: ID, title, severity (crash, wrong, ugly, nit), the test it came from, numbered repro steps from a fresh state, expected, actual, evidence, and whether it happened again on a second try.
3. A short summary: counts of pass, fail, blocked, skipped; the three worst bugs; anything you could not verify; the emulator, build and branch you ran against (`git rev-parse --short HEAD` in the checkout, the app version on Dev -> App tools, the Android version from `device_info`).

**Rules.**

- **Never read or print `.env` or `.expo/dev/logs/start.log` unfiltered.** Both can contain API keys. If you need Metro output, redirect it to a file in your temp folder and grep it for specific words (`error`, `Bundled`, `[tag]`), never `cat` it.
- **No API keys, ever.** Do not type, paste or look for any key. Do not set `GEMINI`, `OPENAI` or other variables. The app has no key fields any more; if you see one, that is a bug.
- **Do not mark anything pass without evidence** from `get_all_text` (quote the strings), `assert_screen_contains`, or a screenshot you looked at. A screenshot can lag one action behind: after any action run `wait_for_ui_stable`, then capture. "I tapped and nothing crashed" is not a pass for an expected-result test.
- **Stop and report after 3 failed attempts at the same action** (tap that does nothing, element not found, wrong screen). Record the test as fail or blocked with the three attempts described. Do not keep trying variations.
- **Stop list** (never do these; each reaches the real server or an external site): tap **Allow** or **Allow Tono AI** (onboarding, Settings -> Tono AI, the consent alert); turn on the save-screen switch **Have Tono AI judge this take** while online; tap **Get notes from Tono AI**, **Get** or **Run again** on the Tono AI step; tap **Continue with Google**; tap **Restore purchases**; tap **Delete account** or **Sign out**; open Dev -> Pipeline -> take -> Re-run Deep review. **Not now** and **Cancel** are always safe. The switch and the consent alert can be tested safely only with airplane mode on (tests AIOFF-1 and NET-2): the app then fails before anything is sent.
- Do not edit source files. Source edits hot-reload and reset navigation; this plan is read-only against the code.
- Do not leave the emulator in a changed state: restore font scale, display size, dark mode, airplane mode and Metro (section 2.8) when you finish or abort.
- Keep Bash commands plain ASCII. The Bash tool rejects apostrophes and middle dots in commands; put anything with those in a file written with the Write tool.

---

## 2. Environment setup (Windows, exact commands)

Use Git Bash for the commands below (the Bash tool). `adb` is on PATH (`%LOCALAPPDATA%\Android\Sdk\platform-tools`). Package: `com.ahmadgraham.tono`. App version 1.5.0 (`app.config.ts`).

Two Git Bash habits that matter:

- `export MSYS_NO_PATHCONV=1` first, or paths like `/sdcard/...` get rewritten to `C:/Program Files/Git/...` and `adb` fails confusingly.
- Do not use PowerShell redirection (`>`) for binary data; use Git Bash.

### 2.1 Which checkout, which branch

Metro must run from a checkout that has `node_modules` and the project's `.env` (the main checkout, for example `C:\dev\speech-coach-app`; a bare worktree has neither). Check the branch and that the tree is clean, but do not edit anything:

```bash
cd /c/dev/speech-coach-app
git branch --show-current
git status --short
git rev-parse --short HEAD
```

Test the branch you were asked to test (default `staging`). Write the commit in your report.

### 2.2 Is the dev client installed?

```bash
adb start-server
adb devices
adb shell pm list packages | grep com.ahmadgraham.tono
```

If the package is missing the run is **blocked**: the dev client needs a native build (`npx expo run:android`, 10 minutes or more, needs the JDK and Android SDK). Report it and stop unless the human tells you to build. The installed build's runtime version must equal the app version (1.5.0), or the bundle will refuse to load.

### 2.3 Boot the AVD

```bash
export MSYS_NO_PATHCONV=1
"$LOCALAPPDATA/Android/Sdk/emulator/emulator.exe" -avd Pixel_10a -no-snapshot-save > "$TEMP/emulator.out" 2>&1 &
```

Run it as a background command. Then poll until boot finishes (use a background loop or a Monitor if a foreground `sleep` is blocked):

```bash
adb wait-for-device
until [ "$(adb shell getprop sys.boot_completed | tr -d '\r')" = "1" ]; do sleep 3; done
adb shell getprop ro.build.version.release
```

After a snapshot restore the app can sit on "Reloading..." against an old Metro. This plan boots with `-no-snapshot-save`, but if you see it: `force_stop`, then reopen the URL (2.5). If the AVD was already running, skip this step; `adb devices` must show exactly one `emulator-5554` as `device`.

Useful once: `adb shell input keyevent KEYCODE_WAKEUP` and swipe up if the lock screen is showing; `adb shell settings put global stay_on_while_plugged_in 3` keeps the screen on.

### 2.4 Start Metro WITHOUT `CI=1`

CI mode disables reloads. Do not set `CI`. Run in the background, from the checkout in 2.1:

```bash
cd /c/dev/speech-coach-app
npx expo start --dev-client --port 8081 < /dev/null > "$TEMP/metro.out" 2>&1 &
```

Check it is up (not by reading the log):

```bash
curl -s http://127.0.0.1:8081/status
```

Expected: `packager-status:running`. If port 8081 is already taken by a stale Metro, find and stop it: `netstat -ano | findstr :8081` (PowerShell or cmd), then `taskkill /PID <pid> /F`, then start again. After `expo prebuild --clean` Metro can hang on `/status`: kill the process on 8081 and restart.

If you must look at Metro output, filter it: `grep -iE "error|Bundled|Logs for your project" "$TEMP/metro.out" | tail -20`.

### 2.5 Reverse the port and open the dev client

```bash
adb reverse tcp:8081 tcp:8081
adb shell am start -a android.intent.action.VIEW -d "exp+speech-coach-app://expo-development-client/?url=http%3A%2F%2F127.0.0.1%3A8081"
```

(The dev-client URL scheme is `exp+speech-coach-app`, from the project slug. The app's own scheme `tono` has no routes.) The first bundle takes 1 to 3 minutes. Use `wait_for_ui_stable`, then `get_all_text`. On a freshly cleared app the dev client may first show its own "developer menu" intro sheet: tap **Continue** (verify the label) to dismiss it. `adb reverse` goes through adb, not the network, so Metro keeps working with airplane mode on.

### 2.6 Grant runtime permissions (so system dialogs do not get in the way)

```bash
adb shell pm grant com.ahmadgraham.tono android.permission.CAMERA
adb shell pm grant com.ahmadgraham.tono android.permission.RECORD_AUDIO
adb shell pm grant com.ahmadgraham.tono android.permission.POST_NOTIFICATIONS
```

Granting while the app runs is fine. Revoking kills the process, which is what the permission tests (SET-9, REC-9) want: `adb shell pm revoke com.ahmadgraham.tono android.permission.CAMERA`. Permission state: `adb shell dumpsys package com.ahmadgraham.tono | grep -E "CAMERA|RECORD_AUDIO|POST_NOTIFICATIONS"`.

### 2.7 Reset the app between tests

Use the `clear_app_data` tool (or `adb shell pm clear com.ahmadgraham.tono`). It also resets runtime permissions, so after every clear: re-grant (2.6), then reopen the dev-client URL (2.5). The dev client forgets its server on a clear, so the URL is needed every time. The result is S0 (the Welcome intro).

A cheaper reset that keeps permissions and the dev-client server: Settings -> Help & data -> **Reset app** (alert "Reset the app?" with Cancel, Export first, Reset). It erases the app's data and lands on onboarding. It does not clear MMKV flags that live outside the app's own reset list (verify), so use `clear_app_data` when a test says S0.

Optional baseline snapshot (verify): after reaching S1 you can save the app's files so the next reset takes seconds instead of a 3-minute onboarding:

```bash
adb exec-out run-as com.ahmadgraham.tono tar -cf - files databases > "$TEMP/tono-s1.tar"
```

and restore with `force_stop`, `clear_app_data`'s equivalent (`adb shell pm clear`), then `adb shell "run-as com.ahmadgraham.tono tar -xf -" < "$TEMP/tono-s1.tar"`, re-grant, relaunch. Try it once; if the app shows onboarding or errors afterwards, drop the idea and use ONB-1 each time.

### 2.8 Switches used by tests (and how to put them back)

| What | Set | Restore |
|---|---|---|
| Dark mode | `adb shell cmd uimode night yes` | `adb shell cmd uimode night no` (or `auto`) |
| Large font | `adb shell settings put system font_scale 1.5` (also 2.0 for FONT-2) | `adb shell settings put system font_scale 1.0` |
| Small screen | `adb shell wm size 720x1280` and `adb shell wm density 320` (smaller still: `480x854`, `240`) | `adb shell wm size reset` and `adb shell wm density reset` |
| Airplane mode | `adb shell cmd connectivity airplane-mode enable` | `adb shell cmd connectivity airplane-mode disable` |
| Rotation | `rotate_device` tool | rotate back; `adb shell settings put system accelerometer_rotation 0` keeps it locked |
| Crash check | `adb logcat -d -b crash \| tail -30` | `adb logcat -c` clears it before a run |
| App log lines | `adb logcat -d -s ReactNativeJS:V \| grep -E "\[(pipeline\|transcribe\|account\|delete\|rewind\|models\|video\|onDeviceAsr)\]" \| tail -40` | |
| Files the app holds | `adb shell run-as com.ahmadgraham.tono ls -la files/sessions` | |

After toggling dark mode the app reloads itself to follow it. If the colours do not follow, the bundle is stale: `force_stop` and reopen (2.5).

Airplane mode on the emulator: confirm it worked before trusting an offline test: `adb shell settings get global airplane_mode_on` must print 1 and `adb shell ping -c 1 -W 2 8.8.8.8` must fail. If Wi-Fi stays up, also run `adb shell svc wifi disable` and `adb shell svc data disable` (re-enable both afterwards). Metro still works because of `adb reverse`.

Dismiss the Expo dev-menu gear: the floating gear (top right) overlaps the app's top-right controls. Drag it down and out of the way once per launch:

```bash
adb shell input swipe 972 252 972 1500 600
```

(coordinates for a 1080 px wide screen; use `get_screen_size` and scale.)

### 2.9 Finish

Restore everything in 2.8, `adb shell cmd uimode night no`, leave Metro stopped (`taskkill` the node process on 8081) unless the human wants it running.

---

## 3. Tool habits and emulator gotchas

| Gotcha | What to do |
|---|---|
| Screenshots lag one action behind. | After every tap: `wait_for_ui_stable`, then screenshot or `get_all_text`. If a screenshot looks like nothing happened, capture again before concluding. |
| `tap_text` matches substrings, including body copy and off-screen duplicates ("Try again" in a sentence vs the button; "Start" in "Start recording"; "Scores" in "Your scores"). | Prefer `get_clickable_elements` or `get_ui_tree` to get exact bounds, then `tap` the coordinates. Use `tap_text` only for unique words. |
| Taps at the very edge (tab bar chips) are flaky. | Tap the tab label text in the middle of its slot; confirm with `get_all_text`. |
| Hot reload resets navigation to Today. | Do not edit files during a run. If the app suddenly shows Today mid-test, check whether Metro reloaded (a source file changed) before calling it a bug. |
| Gboard "Try out your stylus" tutorial can pop up on the first text field and swallow typed text (strings get saved truncated). | Tap **Cancel** on the tutorial and retype. After every `set_text` or `type_text`, read the field back with `get_all_text` or `get_focused_input_value` before trusting it. |
| Keyboard covers buttons. | `is_keyboard_visible`, then `press_key` BACK once to hide it (a second BACK navigates away). |
| The Expo dev-menu gear covers the top-right of the app. | Drag it away (2.8) after each launch. |
| First-visit tips (`GuideTip` cards and multi-step tours) appear on most screens once, and swallow taps. | Dismiss with **Got it**, **Next**, or **Skip** (accessibility label "Skip the tour"). **Turn off tips** stops them for good (the S1 recipe does this). Re-enable with Settings -> Help & data -> **Show tips again**. |
| Toasts sit at the top of the screen and vanish (2.8 s; the delete toast 8 s). | Read them with `get_all_text` straight after the action, not in the next step. |
| The mic is silent and records AMR-NB audio (see section 4). | Never expect words, scores or transcripts from a recording made on this AVD. |
| `Alert` dialogs are native: their buttons are in the UI tree under the system dialog. | `get_all_text` shows them; tap by text (button labels are unique inside the dialog). |
| App is portrait-locked (`orientation: portrait`). | `rotate_device` should change nothing visible (LIFE-5). |
| Pressing HOME sends the app to the background, which finishes any pending delete at once (`purgeWhenBackgrounded`). | Keep that in mind in DEL tests. |
| UI text is Sentence case. `get_all_text` strings that are all capitals (more than 3 letters, not an acronym) break the design language (DSN-2). | Check with a quick scan of every screen's text. |
| Source files use CRLF; irrelevant to you since you edit nothing. | |

Reading text: `get_all_text` is the primary assertion tool (exact strings below were taken from the code). `assert_screen_contains` for one string. `get_ui_tree` when you need bounds, enabled state or content descriptions (the app sets accessibility labels such as "Start recording", "Stop recording", "Restart take", "Delete session", "Filters", "Search recordings", "Add an event", "Copy status").

---

## 4. What the emulator can and cannot test

### 4.1 Why recording is limited here

- The AVD's mic path is silent, and `adb emu avd hostmicon` cannot route speech into it (the PC mic does not hear its own speakers). **Live speech recognition and real voice input cannot be tested.**
- This AVD (Pixel_10a, API 37.1, `google_apis_playstore_ps16k`, x86_64) records video with **AMR-NB** audio. `react-native-audio-api`'s decoder has no AMR support, so `decodeAudioData` fails on every take. The take saves, but its Transcript step fails with "Couldn't read this recording's audio on the device. Retry, or have Tono AI judge it from the video." (or, if decode ever worked, "The transcription model isn't on this phone yet..."). The take's status becomes **Failed** in the Library. **That is expected on this AVD, not a bug.** Try a second AVD only if the human asks (a non-`ps16k` google_apis image may record AAC; unverified).
- A Failed take has no score sheet, so the Result screen shows no Scores tab, no hero score and no charts. Everything that needs a scored take is **blocked** until a seeding prerequisite exists (section 5).
- The app has **no seeding, import or injection path**: nothing in the Dev tab, the ASR Lab or App tools can create a take, import audio, inject a transcript or fake a signal. (The ASR Lab and Voice Lab only analyse takes that already exist. `insertSession` is called only by the recording pipeline.) Checked in the code for this plan.
- The paid pieces are iPhone-only or server-only: `purchasesConfigurable()` is `Platform.OS === "ios"`, so on Android Tono Plus is never for sale. Tono AI needs the real Supabase backend, and merely asking for it (the switch, **Allow**) creates an anonymous account there.

### 4.2 Decision table

**Yes** = test fully. **Partly** = test what is listed, mark the rest blocked. **No** = do not test; see section 9.

| Area | Verdict | What you can check, and the workaround |
|---|---|---|
| Navigation, every tab and screen, empty states, labels, copy | Yes | Everything reachable by tapping. |
| Onboarding, all 22 questions, the age question, the Tono AI step with **Not now**, setup check, skill-check "Tomorrow" | Yes | Mic step: the app reports it cannot hear; skip it. Face check: camera shows the emulator's virtual scene, no face; use **Skip for now**. |
| Permissions (camera, mic, notifications) | Yes | `pm grant` / `pm revoke`, and the system dialogs. Settings -> Permissions rows. |
| Settings: all seven sections, reminders picker, practice days, daily goal, tips, storage rows, reset | Yes | Apple sign-in does not exist on Android (only **Continue with Google**, which is on the stop list). |
| Recording flow: camera preview, prep, warm-up, timer, stop, restart, discard, retake, save | Yes | Virtual camera. Audio and face detection are meaningless. Short-take behaviour is observed, not specified (REC-8). |
| Preview/save screen wording, the per-take switch (off state), one-count wording | Yes | Switch **on** is airplane-only (AIOFF-1). |
| The analysis pipeline running and failing gracefully | Yes | This is the main thing a recorded take gives you: failure messages, "Try again", Library "Failed", resume after kill. |
| Result screen: failure/waiting states, tabs present (Overview, Transcript), header actions, delete from Result | Partly | No scores, so Scores tab, layer switch, charts, transcript marks, hero ring, coach card are **blocked**. |
| Library: list, search, filters sheet, long-press delete, undo, free up space | Yes | With Failed takes. Score-dependent parts (score on row, "Judged by Tono AI", month averages) blocked. |
| Delete flow, 8-second undo, files really removed | Yes | `run-as ls files/sessions` and Settings -> Help & data -> Storage show the Videos size drop. |
| Streak and daily goal | Partly | Drills and Guided exercises count (any drill attempt counts as practice). A Failed take does not count, so "streak keeps the day after deleting a done take" is blocked. |
| Trends, Progress charts, Skill detail "Recent changes" | Partly | Empty states and layout yes; real lines/charts blocked. |
| Typed-input features: Mark it up (own text), Phrasebook, Three things, Talk back, Prompts, Plan your point, Events, Prime, Debrief | Yes | Fully testable with `set_text`. These are the best mic-free coverage. |
| Guided exercises, warm-ups, daily plan steps that need no speech | Yes | Warm-up and Guided exercise complete and record a drill attempt. |
| Speech-driven drills (Word Chain, Bridge Chain, Category sprint, Twisters, Move It, Mark it up reads, Shadowing, conversation drills, Rewind) | Partly | Intro, Start, timer, Finish, the "Didn't catch anything." state, Try again, Done. Scoring and "Link by link" lists are blocked. |
| Rewind | Partly | Intro, 3-2-1, waveform screen, **Keep going** countdown to 1:00, then End; result shows "No words came through" or a failed state. A full Rewind with words is blocked. |
| Transcription model download (574 MB) | Partly | Start, Pause, Resume, failure when offline. A full download is optional and slow; the model has never been run on this AVD (verify). |
| Dev tab: hub, Logs, Pipeline, App tools (tours, previews, scheduled list, storage), Metrics, Face Lab, ASR Lab, Voice Lab | Yes / Partly | Screens load and navigate. Metrics values and Face Lab readings are meaningless on an emulator. Dev tab hidden-in-production rule: DEV-9 (verify). |
| Notifications | Partly | Scheduling visible in Dev -> App tools "scheduled" list; "Send a test in 5 seconds" posts a real notification you can read in the shade. Timing/behaviour of reminders: No. |
| Dark and light mode, font scale, small screen, rotation, display cutouts | Yes | System switches in 2.8. |
| Offline / airplane behaviour | Yes | Includes the safe way to exercise the Tono AI switch and consent alert. |
| Kill and relaunch, background and return, resume of analysis | Yes | `force_stop`, HOME. |
| Share sheets (export, diagnostics, logs) | Partly | The Android share sheet opens; press BACK. Content of the file: not checked. |
| Speech recognition accuracy, fillers, pitch, pauses on real speech | No | Section 9 (device plan sections D, F, G). |
| Real transcription (Whisper) | No | AMR plus model. Optional model download only. |
| Face tracking quality, gaze, expression | No | Device plan sections D and F. |
| Sign in with Apple, purchases, trial, Restore, paywall with real prices | No | iOS only. The Paywall route is unreachable on Android (PAY-1 checks that). Device plan section J. |
| Google sign-in | No | Opens a browser to the real backend. Stop list. |
| Tono AI judging, exercise notes, allowances, quotas, consent after account | No | Needs the paid server. Device plan sections E, G, I, J. |
| Dynamic Island, Live Activity, Lock Screen timer | No | iOS. Device plan A. |
| Speaker routing, earpiece, AirPods, volume drills | No | Device plan A. |
| Haptics, VoiceOver | No | |
| Real on-device performance (heat, memory, battery) | No | Device plan C and F. |

### 4.3 Things that look broken on Android but are expected

Do not file these: Tono Plus rows absent in Settings and a Paywall that says "Tono Plus isn't available yet."; no Apple button; face check finding no face; Metrics showing zeros or odd numbers; the transcript step failing on every take; "Live speech recognition isn't available here" in the setup check; no Dynamic Island. If they are *wrong in some other way* (crash, overlap, wrong words), file those.

---

## 5. Suggested prerequisites (not built)

None of these exist. If they did, most of the blocked tests would run. Listed by value. Do not build them as part of a test run; hand the list to the human.

| # | Small dev-only addition | Where it would go | What it unlocks |
|---|---|---|---|
| P1 | **Seed demo data**: a row in Dev -> App tools ("Add demo takes" and "Clear demo takes") that writes through the real repos: a measured take, a judged take, a take with ums and a "like", a short take, a Rewind with words, a streak of several days (`practice_days`), drill attempts and `skill_events`. Use the helpers and fixtures the existing real-SQLite tests already build (`src/services/db/__tests__/sqliteTestDb.ts`, `deleteTake.test.ts`, `waitingOnAnalysis.test.ts`, and the score-sheet fixtures under `src/domain/__tests__`), writing `sessions`, `session_steps`, `session_artifacts` kinds `session_score`, `signals`, `coach`, `judged_review`, plus `sessions.wpm_curve_json` and `transcript_words`. Gate on `SHOW_DEV_TOOLS`. | `src/services/dev/seedDemo.ts` and one `ListRow` in `ToolsScreen.tsx` | The whole Result screen (Overview vs Scores agreement, layer switch, charts and their gestures, transcript marks, locked line), Library scores and "Judged by Tono AI", month averages, Trends lines, Progress charts, Skill detail, "Gone everywhere" after delete, streak keeps the day after delete, Dev Pipeline details. By far the biggest unlock. |
| P2 | **Mock account state**: a Dev sheet that sets the account snapshot (`status`, `tier`, `plan`, allowance numbers, `plusPurchasable`, `minorsMayUseAi`, `killSwitch`, `mode`) without a server, via `accountStore`'s `commit`. | `src/services/account/accountStore.ts` (a dev-only exported setter) and a row in App tools | Account & Plus rows for free, trial, plus and beta; Tono AI allowance lines; the save-screen switch wording ("Uses your free judged take for this month.", "You've used this month's free judged take. The next one comes on 1 ..."); the Result locked footnote; under-18 gating with `minorsMayUseAi` on and off; every denial message. All server states in device plan J without a server. |
| P3 | **Force the paywall on Android**: a Dev row "Preview the paywall" that renders `PaywallScreen` with a mock `PlusOffer` (annual with trial, monthly without, failed load, paying, minor) and `purchasesEnabled()` forced true in dev. | `PaywallScreen.tsx` accepts a dev `offer` param; `ToolsScreen` row | Paywall display states, notice text, Restore/Terms/Privacy buttons. Today the route is unreachable on Android. |
| P4 | **Fake microphone**: a dev flag that swaps `liveSpeechSession` for a stub driven by a text box ("Say this: ...") that emits words with timings and volume samples. | `src/services/speech/liveSpeechSession.ts` (implementation choice by `devStore` flag); a "Fake mic" switch in App tools | Word Chain and Bridge Chain scoring ("N words in a row (target T) · counted, not checked"), Category sprint, Move It, LineRep, conversation drills, setup-check mic step, skill check, Rewind live text. Everything speech-driven that is now only reachable to its "Didn't catch anything." state. |
| P5 | **Import a take from a file**: a Dev row that picks an AAC-in-mp4 clip (a short CC0 speech sample committed under `assets/dev/`, or a file pushed with `adb push` into `files/import/`) and calls `createSessionFromTake` with it. | `ToolsScreen.tsx`, `src/services/dev/importTake.ts` | The real pipeline on real speech with working decode: voice analysis, pitch and loudness charts, (with a model) transcript. Works around the AMR problem without a second AVD. |
| P6 | **Skip-onboarding and state presets**: a Dev row or an intent extra (`adb shell am start ... --es preset s1`) that completes onboarding with the standard answers, turns tips off, and optionally sets age range, dark mode, reminder prefs. | `OnboardingScreen.tsx`/`prefsStore.ts` dev hook; or a `tono://dev/preset?name=s1` link | Saves 3 minutes per reset (S1 in seconds), removes the biggest source of flaky taps. |
| P7 | **Route links**: dev-only `tono://dev/route?name=Result&sessionId=...` handling through `navigationRef`. | `src/navigation/index.tsx` linking config under `SHOW_DEV_TOOLS` | Jump to any screen after a hot reload; deterministic screenshots. |
| P8 | **Small whisper model switch**: a dev toggle to use a tiny GGML model (about 75 MB) for transcription. | `src/services/asr/whisperModels.ts` | A transcript on the emulator within seconds once P5 exists; makes the transcript tab and fillers testable on x86_64. |
| P9 | **Stable test labels** (`accessibilityLabel`/`testID`) on `SegmentedControl` options, chips and settings switches. | `src/components/common/SegmentedControl.tsx`, `Chip.tsx`, `SwitchRow` | Removes `tap_text` substring collisions ("Scores", "Start"). |

---

## 6. Smoke test (10 minutes, run first)

Preconditions: setup in section 2 done; Metro running; permissions granted; start from S0 (`clear_app_data`, grant, open URL). Clear the crash buffer first: `adb logcat -c`.

| ID | Steps | Pass when | Evidence |
|---|---|---|---|
| SM-1 | Open the dev-client URL; `wait_for_ui_stable` (allow up to 3 minutes for the first bundle); drag the dev gear away; `get_all_text`. | No red error screen. The Welcome intro shows (text includes "Tono" and a **Skip** control) | Quote 2 strings |
| SM-2 | Tap **Skip** (label "Skip the introduction"), then **Let's start**. | The first question "What should we call you?" shows with **Skip** and **Continue** | Quote the title |
| SM-3 | Run the onboarding recipe (11.1) to the end of the questions. | Reaches "Camera and mic" setup check without a crash | Last screen text |
| SM-4 | Setup check: **Allow access** or **Next**, camera step **Skip for now**, mic step **Skip**, then **Tomorrow**. | Lands on **Today** (title "Today", button "Start session", greeting line). Dismiss first-tip with **Turn off tips** | Quote "Today", "Start session" |
| SM-5 | Tap each tab: Learn, Library, You, Dev, Today. | Learn shows "Your path" and "All skills"; Library shows "No recordings yet"; You shows "day streak" and "Rewind"; Dev shows "Developer tools"; all five tab labels in the bar | Quote one string per tab |
| SM-6 | Today -> **Practice something else** -> **Start Recording**. Handle warm-up/prep (**Skip warm-up**, **No prep** or **Start now**), tap **Start recording**, wait 6 s, tap **Stop recording**. | "Review your take" with **Use this take**, **Retake**, **Discard** | Quote them |
| SM-7 | Tap **Use this take**. `wait_for_ui_stable`, wait 20 s, `get_all_text`. | Result opens with tabs **Overview** and **Transcript**; a status card or step rows show a message for the failed Transcript step; no crash; app responsive | Quote the failure sentence |
| SM-8 | Tap **Done**. Library tab. Long-press the take. | Library lists one take with "Failed"; alert "Delete this take?" has **Cancel**, **Delete take**, **Free up space, keep the transcript and scores** | Quote the alert |
| SM-9 | Tap **Delete take**; immediately `get_all_text`. Tap **Undo**. | Toast "Deleted" with "Undo" appears; after Undo the toast "Restored" and the take is back | Quote both toasts |
| SM-10 | You tab -> open each of the seven Settings sections (Practice, Goal & reminders, Coaching & AI, Account & Plus, Tono AI, Permissions, Help & data); BACK after each. | Each shows its title and content, none empty or crashing | Section titles seen |
| SM-11 | `adb shell cmd uimode night yes`; screenshot Today; `... night no`. | Dark theme (near-black background) then light (paper background); text readable in both | Screenshot description |
| SM-12 | Airplane mode on (2.8). Open Settings -> Tono AI and Account & Plus. Airplane off. | Both open and show content; no crash; "Sign in (optional)" visible | Quote it |
| SM-13 | `force_stop`; reopen the URL; `get_all_text`. | Lands on Today (not onboarding); the take is still in Library | Quote |
| SM-14 | `adb logcat -d -b crash \| tail -30`. | No `FATAL EXCEPTION` for `com.ahmadgraham.tono` | Output or "empty" |

If SM-6 or SM-7 cannot run (no camera device), note it, run the rest, and mark the REC/PRV/RES/DEL families blocked.

---

## 7. Test cases by area

Format: **ID - title.** Pre: state. Steps (numbered). **Expect:** result. **Evidence:** what to capture. Labels are the strings in the code; `(verify)` marks something the plan author could not confirm from the code.

### 7.1 ONB - Fresh-install onboarding

**ONB-1 - The standard recipe (builds S1).** Pre: S0.
1. Welcome intro: swipe or tap **Next** through the pages (Tono; A short plan, made for you; Feedback you can act on; Practice the hard parts; Watch yourself improve), or tap **Skip**. Last page button: **Let's start**.
2. Then "Tell us about you" is skipped in the full flow; the questions start. Answer per 11.1.
3. Finish with **Done** on the last question; setup check; **Tomorrow** (skill check deferred).
**Expect:** every step advances; the progress bar grows; chapter label reads "About you · 1 of 3", then "How you speak · 2 of 3", then "Your practice · 3 of 3"; Today opens with a skill-check card for tomorrow (verify) and no errors.
**Evidence:** chapter labels seen; final Today text.

**ONB-2 - Welcome intro pages and skip.** Pre: S0.
1. Swipe left through the pages with `swipe`; watch the page art play.
2. Restart (S0). Tap **Skip** on page 1.
**Expect:** pages in order; **Skip** jumps to the last page ("Let's start" visible, **Skip** gone on the last page); no overlap with the dev gear.
**Evidence:** titles of 3 pages.

**ONB-3 - Back and forward keeps answers.** Pre: S0, at question 3.
1. Pick two chips on "Where do you most want to speak better?"; tap **Continue**; tap the back chevron (label "Back").
**Expect:** the chips are still selected; Back at the first question returns to the Welcome intro (or the "Tell us about you" card) without crashing.

**ONB-4 - Required questions block Continue.** Pre: S0.
1. At "Where do you most want to speak better?" check **Continue** (use `get_ui_tree`: enabled false). Pick a chip; check enabled true.
2. Repeat at "What gets in your way?", "How do you feel about speaking in front of people right now?" (needs a slider answer), "How do you feel about seeing yourself on video?", "Have you done speaking training before?", "When will you practice?", "Where will you usually practice?", "How long should full videos be kept?".
**Expect:** Continue disabled until answered; optional questions (name, age, event, English, speech, voice note, inner critic, Tono AI, why) show **Skip** (the Tono AI step shows **Not now**).
**Evidence:** list of required vs optional seen.

**ONB-5 - Age question: adult.** Pre: S0.
1. Reach "How old are you?" ("A range is enough."). Read all options.
2. Choose **25 to 34**; Continue.
3. Later, at "Meet Tono AI, your coach", read the screen.
**Expect:** options exactly: Under 13, 13 to 17, 18 to 24, 25 to 34, 35 to 49, 50 or over, Prefer not to say. The AI step shows three points (judges like a coach; phone still measures free; one judged take a month free), the "what is sent" paragraph, buttons **Not now** and **Allow Tono AI**.
**Evidence:** option list; AI step text.

**ONB-6 - Age question: under 18.** Pre: S0.
1. Choose **13 to 17**; continue to the Tono AI step.
**Expect:** the step says "Everything stays on your phone" and "Tono AI is for people 18 and over..."; only **Continue** (no **Not now**, no **Allow Tono AI**). Afterwards: no Tono AI switch on the save screen (PRV-3), Settings -> Tono AI explains it is for 18 and over (SET-6), the Result has no locked footnote. This assumes the server's `minorsMayUseAi` is false (the default); if the app cannot reach the server it is false too.
**Evidence:** step text; follow-ups.

**ONB-7 - Age question: Prefer not to say, and skipping.** Pre: S0, twice.
1. First run: choose **Prefer not to say**. Second run: tap **Skip** on the age question.
**Expect:** both reach the adult Tono AI step with **Not now** and **Allow Tono AI** (an unanswered question never blocks).

**ONB-8 - Tono AI step: Not now.** Pre: S0, adult age.
1. At "Meet Tono AI, your coach" tap **Not now**.
**Expect:** advances to "How long should full videos be kept?". Nothing is sent. Afterwards Settings -> Tono AI shows **Allow Tono AI** (not "Stop sending to Tono AI") and the save-screen switch is off. Do not tap **Allow Tono AI** (stop list).
**Evidence:** next question title; Settings button label.

**ONB-9 - Transcription step.** Pre: S0.
1. At "Get the transcription model" read the screen. **Continue** should be disabled.
2. Tap the download button (label like "Download 574 MB"). Then tap **Pause**.
**Expect:** with status "missing", Continue is disabled; after starting, a "Downloading N%" row with **Pause** appears and Continue enables; after Pause the row reads "Download paused at N%" with **Resume**; Continue stays enabled. This is how the recipe gets through without downloading 574 MB. If the network is off, starting shows "The download stopped" with **Try again**.
**Evidence:** the three row states.

**ONB-10 - Reminders step.** Pre: S0.
1. At "Want a reminder?" pick **Yes, remind me**; observe the picker; set the time (see SET-8 for rules); pick **No reminders**.
**Expect:** the picker (Time row with two dropdowns, hour and AM/PM) appears only for yes; picking yes may show the Android notification permission dialog if not granted (allow it).

**ONB-11 - Permissions in the setup check.** Pre: S0 with all permissions revoked (`pm revoke` all three).
1. Reach "Camera and mic". Read the rows (Camera, Microphone, Speech recognition, Notifications) and their state words.
2. Tap **Allow access**; on each system dialog choose **While using the app** / **Allow**; repeat once denying the camera.
**Expect:** rows show "Not asked yet" before and "On" after; a denied permission shows "Off" and the warning "Recording needs the camera and mic. Tap a row that says Off to turn it on in your phone's Settings, or carry on and do it later."; **Next** always available.
**Evidence:** row states before and after.

**ONB-12 - Camera step.** Pre: ONB-11 with camera granted, video comfort answered "It's fine".
1. **Next** to "See what Tono sees". Read the note. Tap **Skip for now**.
**Expect:** the camera preview shows the virtual scene; the note reads "Can't find your face — face a window or a lamp, and hold the phone at eye level." (no face on the emulator); **Skip for now** moves to "Check your mic". With video comfort "I'd rather not" the camera step is skipped entirely (audio first).

**ONB-13 - Mic step.** Pre: ONB-12.
1. At "Check your mic" read "Say: “Hi, I'm ___, and I'm here to practice.”". Tap **Start**; wait 8 s; tap **Skip**.
**Expect:** it says "Listening…"/"Quiet — move a little closer, or speak up a bit." or "The mic didn't start. Try again — if it still won't, skip this; drills ask again when they need it."; and may show "Live speech recognition isn't available here, so word-following drills will use a self-rating instead." Never claims "Tono heard you." (the mic is silent). **Skip** works. No crash.
**Evidence:** the status line shown.

**ONB-14 - Skill check: Tomorrow and Skip.** Pre: ONB-13 done.
1. At "All set" ("You're set up.") tap **Tomorrow**. (Separate run: tap **Now**, read the four pieces — "Read a short passage", "Name as many animals as you can", "Reply to one line", "Talk about a topic" — then **Skip the check for now**.)
**Expect:** both exits land on Today; Tomorrow leaves a skill-check card on Today (verify label); no data loss.

**ONB-15 - Resume after kill mid-onboarding.** Pre: S0, at question 5.
1. `force_stop`; reopen.
**Expect:** the Onboarding screen resumes on the saved step (answers are saved as you go), not the Welcome intro and not a "Start fresh?" question.

**ONB-16 - Back out of the final steps.** Pre: S0.
1. During the setup check press BACK.
**Expect:** the setup check and onboarding have gestures disabled (`gestureEnabled: false`); BACK does not exit to a half-state. Report what happens (verify).

### 7.2 FREE - The free path with no account

Pre for all: S1 (Tono AI skipped with **Not now**), airplane mode off unless stated.

**FREE-1 - Nothing asks for sign-in.** Walk Today, Learn, Library, You, Practice, a Guided exercise, Mark it up, Phrasebook, Settings (all sections).
**Expect:** no sign-in prompt, no consent alert, no "account required" anywhere. Settings -> Account & Plus shows "Sign in (optional)" and "You don't need an account to use Tono..." with only **Continue with Google** (no Apple on Android); no account line, no **Delete account**, no **Sign out**. Do not tap **Continue with Google**.
**Evidence:** quote the Account & Plus text.

**FREE-2 - No account is created.** After FREE-1 and a recorded take (REC-4/PRV-4) run `adb shell run-as com.ahmadgraham.tono ls files` and `adb logcat -d -s ReactNativeJS:V | grep -E "\[account\]" | tail`.
**Expect:** log lines at most about the app config being read or unreachable; no "signed in" or "anonymous" line. (The launch reads the public `app-config` function with no account; that is allowed.)
**Evidence:** the filtered lines or "none".

**FREE-3 - No dead ends or broken-looking locked UI.** Visit these on the free path and look for blank cards, spinners that never end, buttons that do nothing, or text like "undefined"/"null": Settings -> Tono AI; the Preview screen switch; the Result Overview (failed take); Rewind result (RewindResult, if one exists); Word Chain intro; Mark it up -> Mine -> **Mark it**.
**Expect:** every locked/unavailable thing is a calm sentence with a way forward or nothing. No alert on screen entry. Plus is not mentioned with a button anywhere (it is not on sale on Android): search every screen's text for "Tono Plus": it may appear in plain sentences ("It comes with Tono Plus...") but there must be no **See Tono Plus** button.
**Evidence:** list of screens checked and one quote from the Settings -> Tono AI intro.

**FREE-4 - Measured-only wording.** On a take Result (blocked unless P1): "Measured on this phone" hero label and the quiet line "Measured on this phone. Tono AI would judge what you said and how it came across: you get one judged take free each month." Mark blocked on this AVD; on a Failed take check that none of these appear as errors.

**FREE-5 - Exercises without Plus.** Pre: S1. Do a Rewind (7.14) and a Word Chain (7.13) to their result screens.
**Expect:** counts and a calm card, no error, no spinner that never ends: Rewind result "Notes" card with "Notes on what you said come with Tono Plus" (verify exact text) and no **See Tono Plus** button on Android; Word Chain result says "counted, not checked"-style text (blocked unless P4).

### 7.3 NAV - Navigation of every tab and main screen

Pre: S1. After each screen, `get_all_text` for the title, then BACK and confirm the previous screen.

**NAV-1 - Tabs.** Today, Learn, Library, You, Dev in order, then reverse. **Expect:** each shows its large title ("Today", "Learn", "Library", "You", "Dev"); the active tab label is bolder; the tab bar stays visible; switching tabs keeps each tab's scroll position (verify); no tab is blank.

**NAV-2 - Today targets.** From Today: the "Level N" pill -> "Your level"; a skill ring -> skill name (Skill detail, eyebrow "Skill") with "How this number works", "What feeds it", "What moves it"; "Progress" action in "Your skills" -> Progress ("This week", "Skill mastery", "By skill"); **Practice something else** -> "Free practice"; **Your events** -> "Your events" ("Nothing coming up"); the path card -> Lesson or Learn; **Start session** -> "Today · N min" session screen. **Expect:** all open, all BACK correctly.

**NAV-3 - Learn.** Toggle **Your path** / **All skills**; in All skills tap each of the five skill tabs (Articulation, Cadence, Impromptu, Confidence, Conversation); open a lesson (for example Cadence -> "Find your pace" unit -> a lesson) -> lesson screen shows "Why it matters", "Practice", **Start**; **Frameworks** row -> "Frameworks" with **See all sources** -> "Sources". **Expect:** each loads; lesson titles match (for example "Keep the thread" under Impromptu); the Conversation tab ends with the footnote "These lessons are practice, not treatment...".

**NAV-4 - Library.** Collections row: **Free practice**, **Prompts**, **Mark it up**, **Twisters**, **Frameworks** each open ("Free practice", "Prompts", "Mark it up", "Drills", "Frameworks"). Empty state "No recordings yet. Your takes will show up here, grouped by month, with their scores." on S1. **Expect:** all open and return.

**NAV-5 - You.** Rows: Speaker level, **Rewind**, **Three things**, **Talk back**, **Phrasebook**, Settings group (seven sections). **See all progress**. **Expect:** each opens its screen; Settings rows pass `section` and open the right body.

**NAV-6 - Progress and Trends.** Progress -> **Score trends** -> "Score trends" screen; Progress -> **Your level**. **Expect:** open; empty-state text instead of blank charts.

**NAV-7 - Practice screen.** "Free practice": dice (label "Get a different prompt"), level chip ("... prompts", opens "Practice difficulty"), "Concise · 30s" chip (toggle), **Session options** (sheet), **Or free record, no prompt**, shelf cards **Mark it up**, **Prompt Library**, **Tongue-Twister Drills**. **Expect:** each works; the dice changes the prompt text; toggling Concise changes the button to "Start Recording · Concise 30s".

**NAV-8 - Android BACK everywhere.** On at least 10 different screens press BACK once. **Expect:** returns one level; never closes the app unless on a tab root; on a tab root BACK leaves the app to the launcher (standard).

**NAV-9 - Deep stacks.** Today -> Practice -> Prompts -> Add a prompt -> BACK x3. **Expect:** back to Today without orphan screens.

### 7.4 SET - Settings

Pre: S1. Open via You -> Settings rows.

**SET-1 - Settings list.** You -> every row in "Settings". **Expect:** seven rows, titles and subtitles exactly: Practice ("Your profile, level and Plan your point"), Goal & reminders ("Sessions a day, practice days and nudges"), Coaching & AI ("What runs on your phone"), Account & Plus ("Optional sign-in, Tono Plus and the trial"), Tono AI ("Judged takes, and what is sent"), Permissions ("Camera, microphone and notifications"), Help & data ("Tips, diagnostics, export and reset"). The older all-sections list (`Settings` with no section) also exists via code only.

**SET-2 - Practice section.** Rows: "Your profile and goals" (opens the questions again with the Close button, "profile" mode, no WelcomeIntro), "Your events", "Practice difficulty", switch "Plan your point". **Expect:** toggling Plan your point on makes Free practice -> **Start Recording** go through "Plan your point" (fields "What's the main point?", "Why does it matter?", "What's a specific example?", button **Start Recording**); off restores direct recording.

**SET-3 - Account & Plus.** Read. **Expect:** FREE-1 text; no "Tono Plus" row and no **Restore purchases** (Android: `purchasesEnabled()` false). A "Tono AI is free while Tono is in beta..." note appears only in beta mode (needs the server; not expected).

**SET-4 - Tono AI section (adult, not allowed).** **Expect:** heading "Tono AI", intro "Your phone measures pace, pauses, fillers, pitch and eye contact on every take, free...", card "Tono AI" with the what-is-sent paragraph, button **Allow Tono AI** (do not tap), switches "Have Tono AI judge every take" (subtitle "On once Tono AI is allowed above. Until then, everything stays on this phone.") and "Tell Tono AI about you" (turn on: shows a preview of the facts shared, or "Nothing to share yet..."; turn off), and a "Usage" card ("No judged takes yet. Each one shows here, in tokens...").
**Evidence:** quote the button and both switch titles.

**SET-5 - Tono AI consent alert, safe path.** Pre: S1, **airplane mode off**. Tap **Allow Tono AI**. **Expect:** alert "Let Tono AI judge your takes?" with **Not now** and **Allow**. Tap **Not now**. Nothing changes. (Never tap **Allow**.) The alert text names what is sent: transcript and measurements as text, video and audio stay on the phone.

**SET-6 - Tono AI section, under 18.** Pre: S1 built with age **13 to 17**. **Expect:** the section shows only the card "Tono AI is for people 18 and over, so nothing you record leaves this phone... If you gave the wrong age, change it in Settings → Practice." No buttons, no switches. Settings -> Practice -> "Your profile and goals" lets you change the age (then the section changes).

**SET-7 - Goal & reminders section.** "Daily goal" with segmented **1x / day**, **2x / day**, **3x / day**; "Practice days" with seven day chips (accessibility labels Sunday ... Saturday) and the line "A day you leave off never breaks your streak."; switch "Reminders" (subtitle changes with goal: "A nudge to practice, once a day." vs "A nudge for each session — skipped once it's done."); "Your habit" chips (None + habit options); switch "Rewind reminder" ("An evening nudge to tell your day, out loud."). **Expect:** changing goal to 3x makes the reminder picker show three rows "Session 1", "Session 2", "Session 3"; unchecking all but one day is allowed, unchecking the last day is not (it stays on); Today shows "N of 3 today" pill after the change.

**SET-8 - Reminder picker rules.** Pre: SET-7 with Reminders on and goal 3x/day.
1. Open the hour dropdown on Session 1 (accessibility label "Session 1 hour, N"): read the options. Open the AM/PM dropdown ("Session 1, AM").
2. Pick a late hour on Session 1 (for example 9 PM).
3. Open Session 2's and Session 3's menus.
**Expect:** the hour menu is a small anchored dropdown under its pill (not a full-screen modal), whole hours **1 to 12 only** (12 listed last), no minutes anywhere, no sliders, no grid; the AM/PM menu has AM and PM; sessions are strictly increasing: hours at or before the previous session are disabled (greyed) with the hint "Must be after session 1" (Session 1 hint: "Leaves no room for the later sessions"); picking a late Session 1 moves later sessions after it or disables impossible choices; the trigger shows an open chevron while open. A dropdown closes on outside tap.
**Evidence:** quote the options list of one hour menu and a disabled-hint string.

**SET-9 - Permissions section.** Rows Camera ("Video takes, and the face check for eye contact and expression"), Microphone ("Every recording and drill"), Speech recognition ("Follows your words live in drills"), Notifications ("Practice reminders and event check-ins") with values On / Not asked yet / Off. Revoke Camera (`pm revoke`) and return. **Expect:** state words update after returning (the list refreshes when you come back); footnote switches between "Everything is on. To turn one off, use your phone's Settings." and "Recording needs the camera and microphone. Anything that's off can be turned on in your phone's Settings, and this list updates when you come back."; tapping an Off row opens Android system settings (press BACK to return).

**SET-10 - Coaching & AI section.** Status lines "Coaching: Built-in rules" and "Live recognition: ..."; "Transcription: Whisper large-v3-turbo · N MB" rows; with the model missing a row "Download the transcription model" ("... 574 MB, best over Wi-Fi."). **Expect:** content readable; starting the download shows "Downloading the transcription model" with percent; pause shows "Download paused at N%".

**SET-11 - Help & data: Show tips again.** Pre: S1 (tips off). Tap **Show tips again**. **Expect:** toast "Tips will show again as you go."; the next visit to Today shows the first tip card with **Turn off tips** and **Got it**; a multi-step tour (Today has 4 steps) offers **Next**, ends with **Got it**, and has **Skip** (label "Skip the tour").

**SET-12 - Help & data: the rest.** Rows: "Send feedback" (only if a feedback URL is configured), "Share diagnostics" (opens the Android share sheet: BACK to close), Storage rows (Videos, Rewind recordings, Transcription model, Practice data, Temporary files with sizes), **Free up space from old videos** (alert "Free up space from videos older than N days?" text explains transcripts and scores stay; **Cancel**), **Clear temporary files** (only when temp bytes > 0; toast "Temporary files cleared."), **Export practice data** (share sheet), "Keep Rewind audio for" segmented (30 days, 90 days, 1 year, Forever), **Reset app** (alert "Reset the app?"). No "Back up videos and recordings" switch on Android (iOS only). **Expect:** all present as listed; **Cancel** everywhere except where a step says otherwise.

**SET-13 - Reset app.** Pre: S2. Help & data -> **Reset app** -> **Reset**. **Expect:** a "Resetting…" overlay, then onboarding (Welcome intro); Library empty, storage near zero (check after re-onboarding via S1: Videos 0 B), streak 0. After this the state is S0-like (tips and permissions may persist; verify).

**SET-14 - Legal links and footer.** Settings (list) footer shows version and legal links (`LegalLinks`, `AppFooter`). Only check they render; do not open external links (verify they exist).

### 7.5 PAY - Paywall display states (Android: Plus not on sale)

**PAY-1 - The paywall is unreachable and honest on Android.** Pre: S1.
1. Search for any **See Tono Plus** button on: Settings -> Tono AI, Settings -> Account & Plus, Result Overview, Rewind result, the Preview/save alert path (only reachable online; do not trigger).
2. Settings -> Account & Plus: look for a "Tono Plus" row and **Restore purchases**.
**Expect:** none exist (the code hides them when `purchasesEnabled()` is false: iOS-only). With the server unreachable (airplane on, cold launch) nothing changes. No screen mentions a price.
**Evidence:** statement of each place checked.

**PAY-2 - The PaywallScreen "not available" state.** Needs P3 or a route link (P7) to open the route; blocked otherwise. If available: expect title "Tono Plus" and the single sentence "Tono Plus isn't available yet." (or the minor sentence "Tono Plus is Tono AI, which is for people 18 and over..." when age-gated), a working back button, nothing else. Blocked here.

**PAY-3 - Plus states (trial, paying, price failed to load, loading prices).** Blocked without P3/P2. Reference strings for later: "Try it free" eyebrow, "What Plus adds" group with "60 judged takes a month", "Your drills, checked", "Mark it up with Tono AI", "Your recordings stay on your phone"; buttons "Start 14-day free trial"/"Subscribe for ..."; "Couldn't load the prices from the App Store. Check your connection and try again." with **Try again**; footer **Restore purchases**, **Terms**, **Privacy**; line "No account needed. To keep Plus on another phone, you can sign in with Apple or Google later in Settings." Device plan section J has the real-store checks.

### 7.6 TODAY - The Today screen and "Your takes"

Pre: S1 unless stated.

**TODAY-1 - Layout and content.** Greeting eyebrow ("Good morning/afternoon/evening" plus name if given), "Today", date line, pills (Level, streak when above 0, "N of M today" when goal above 1), plan hero (skill badge, 5/8/12 min segmented control, lesson title, step timeline, **Start session**), path card, skill rings ("Your skills"), the Conversations card ("Conversations" / "Today's missions", **Heading out?** "Prime it — about a minute", **Debrief a conversation**, **Conversation log**), Rewind card (from about 6 PM; see note), Feeling of the Week card (verify), the two list rows. **Expect:** a skeleton while loading, then content; no overlapping; scrolls to the bottom without clipping under the tab bar.

**TODAY-2 - Plan length.** Tap **8 min**, then **12 min**, **5 min**. **Expect:** the step list changes; selection stays after leaving and returning.

**TODAY-3 - Start session and a speech-free step.** **Start session**. The first step is usually a warm-up (Guided). Tap the step **Start** -> warm-up screen "Warm-up" with **Start**, per-step instructions, **Skip** and finally **Done**. **Expect:** after finishing, the session screen marks it done (check mark/"1 of N done") and **Continue** appears on Today.

**TODAY-4 - Daily goal and top-ups.** SET-7 goal 2x/day; finish the plan's steps that need no speech (or just check the card). **Expect:** a "Top-up · session 2 of 2 · N min" card appears only after the main plan is complete (blocked here unless every step can be finished; steps needing speech cannot be completed without P4), with **Start top-up**; until then no top-up card. Mark partial.

**TODAY-5 - "Your takes" list (after a take).** Pre: S2 with the take's analysis having failed (or a take still running). Return to Today right after **Use this take**. **Expect:** a "Your takes" group with a row: while running an hourglass row with a spinner and the headline "Step N of M: ..." or "Waiting for its turn"; when stuck: an alert-circle row whose subtitle ends "Tap to try again." (for example "One part didn't finish. Tap to try again."); tapping opens that take's Result. A "Ready. Tap to see what stood out." row is only for a take that finished OK (blocked here). The row disappears after the take is deleted.
**Evidence:** quote the row subtitle.

**TODAY-6 - Two takes at once.** Record and save a second take within a few seconds of the first. **Expect:** two rows, each with its own state, neither stuck on a spinner forever (within 60 s each shows its failure).

**TODAY-7 - Transcription banner.** With the model missing, Today shows a card "Download the transcription model" ("Your recordings can't be turned into text until it's on this phone. It's a one-time download of about 574 MB, best over Wi-Fi.") with **Download**. Start it: card becomes "Downloading the transcription model: N%" with **Pause**; pause: "Download paused at N%" with **Resume**. Offline start: "The model download stopped" with **Try again**. The same banner shows on the Preview screen.

**TODAY-8 - Events card.** Add an event (7.10, INPUT-5). **Expect:** Today shows the event card with a countdown (verify text); deleting the event removes it.

**TODAY-9 - Rewind card timing.** The card appears from 6 PM local time only. The emulator clock is the host's. If it is before 6 PM, note "not testable now"; reach Rewind via You instead.

### 7.7 REC - The recording flow (up to what the emulator allows)

Pre: S1, camera and mic granted.

**REC-1 - Entry points.** Start a recording from: Today -> Practice something else -> **Start Recording**; **Or free record, no prompt**; a lesson "rep" step; Library -> **Free practice**. **Expect:** each opens the Recording screen (dark, the camera preview) in the right stage.

**REC-2 - Stages: warm-up, prep, idle.** Depending on settings the screen starts at the warm-up ("Step N of M · ...", **Next**/**Finish**, **Skip warm-up**, **Close**), or prep ("Get ready", a countdown number, **+30 s**, **Research**, **No prep**, **Start now**), or idle. To see the warm-up: Practice -> **Session options** -> turn warm-up on. **Expect:** **Skip warm-up** goes to prep or idle; **No prep** returns to idle; **Start now** starts recording; the prompt text is shown; no stuck countdown at 0.

**REC-3 - Idle controls.** Idle shows the prompt banner (with task label), the framing oval with a hint (the emulator has no face, so "Can't find your face" style hint, verify), the toggle for preview hiding, "Prepare first" chips (labels "Prepare for 30 s", "1 min", "2 min", "5 min"; with a new-topic prompt "New topic? Prepare first"), **Close**, and the red **Start recording** button with hint "Tap to start" (or "One point. 30s." in Concise mode). **Expect:** all present; **Close** returns to the previous screen.

**REC-4 - Record, timer, stop.** Tap **Start recording**; wait 10 s; `get_all_text` twice 3 s apart; tap **Stop recording**.
**Expect:** while recording the hint reads "M:SS left · tap to stop" and counts down (or "Tap to stop" when the preview is hidden); the countdown ring is visible unless "blind"; a **Restart** button and the eye icon ("Hide preview"/"Show preview") are present; Stop shows "Saving…" then the Preview screen "Review your take". No crash.
**Evidence:** two timer readings.

**REC-5 - Restart.** During a take tap **Restart** (label "Restart take"). **Expect:** returns to idle ("Tap to start"), no Preview, no error alert; a new take can start; no leftover files (`ls files/sessions` shows no `preview-*.mp4` for the discarded one, verify).

**REC-6 - Hide the preview.** Tap the eye ("Hide preview") while recording. **Expect:** the blind overlay shows the prompt and the time left; tapping the eye again ("Show preview") brings the camera back.

**REC-7 - Auto-stop at the target length.** Concise mode (30 s): toggle "Concise · 30s" on Practice, start, wait. **Expect:** recording stops itself at 30 s and goes to Preview. (Takes 30 s of waiting.)

**REC-8 - Very short take.** Start and stop within 1 second. **Expect (observed, not specified):** either the Preview opens for a near-zero-length take, or an alert "Recording error" appears; no crash, no stuck "Saving…". Report exactly what happened and the duration shown. There is no explicit minimum-length rule in the code (verify).

**REC-9 - Permission handling.** Revoke CAMERA (`pm revoke ... CAMERA`), open Recording. **Expect:** the permission screen: "Camera & microphone access" and either "Tono needs both to record your practice sessions. Nothing is uploaded until you finish recording." with **Grant Camera Access**, or (after the system marks it blocked) "The camera is turned off for Tono. Turn it on in your phone's Settings to record." with **Open Settings**; **Close** works. Grant via the button and the system dialog; the camera appears. Repeat with RECORD_AUDIO: the button reads **Grant Microphone Access**.
**Evidence:** both permission texts.

**REC-10 - Leaving mid-take.** While recording press HOME, wait 5 s, return. **Expect:** no crash; the camera reopens (a beat after returning); the take either continues or ends cleanly. Report what happened (verify).

**REC-11 - Research prep (optional, network).** Prepare chip "1 min" (research mode): notes field, **Search the web**, **+30 s**, **Show my notes while I record**, **I'm ready — record**. **Expect:** UI as listed; clock counts down; "Time is up" accessibility label and the **Start recording** button at zero. Do not tap **Search the web** unless the human allows an external browser. The Dynamic Island parts are iOS (section 9).

**REC-12 - Low storage toast.** Not testable without filling the disk; skip unless `adb shell` can create a big file (skip).

### 7.8 PRV - Preview/save screen

Pre: a recording just finished (REC-4).

**PRV-1 - Layout.** Title "Review your take"; the video player (a playback surface; press play, verify), the transcription banner when the model is missing, a card with "Your transcript, pace, pauses and voice analysis run on this phone either way.", the switch row, and **Use this take**, **Retake**, **Discard**. **Expect:** all present; buttons are not under the system navigation bar.

**PRV-2 - The per-take switch (adult, Tono AI not allowed).** Row title "Have Tono AI judge this take", switch off, subtitle "Tono AI judges what you said and how it came across, from your words and the phone's measurements; the video stays here. Uses 1 judged take. Everyone gets one free a month." (one-count wording: "Uses 1 judged take"), hint "Off keeps this take private to your phone. You can have it judged later from the session." **Expect:** exactly this. Do **not** switch it on while online (stop list); AIOFF-1 does it safely. There must be no per-token or "review" wording; the count wording is the same on a first take and later ones.
**Evidence:** quote the subtitle.

**PRV-3 - Under 18: no switch.** Pre: age 13 to 17. **Expect:** no Tono AI row or hint at all; only the "run on this phone either way" note.

**PRV-4 - Use this take.** Tap **Use this take**. **Expect:** a loading state on the button, then Result opens (replace). The Preview screen is gone (BACK from Result does not return to Preview). The take appears in Library.

**PRV-5 - Retake.** **Retake** returns to a fresh Recording screen with the same prompt (the preview file is deleted). **Expect:** no Preview left in the stack.

**PRV-6 - Discard.** **Discard** shows "Discard this recording?" / "It won't be saved anywhere." with **Cancel** and **Discard**. **Cancel** stays; **Discard** pops to the root. **Expect:** no take in Library.

**PRV-7 - BACK from Preview.** Press BACK. **Expect:** alert "Discard this take?" / "It hasn't been saved." with **Keep reviewing** and **Discard**. After **Discard** the screen leaves; no take saved.

**PRV-8 - Feeling rep.** (If a Feeling of the Week rep is reachable, verify.) The hint reads "This is a private feeling rep: Tono AI stays off unless you turn it on. You can still have it judged later."

### 7.9 RES - Result screen

**What exists on this AVD:** Overview and Transcript tabs only (no Scores tab: the take has no score sheet). Tests for scores, the layer switch, charts and marks are listed at the end as blocked with their pass conditions, ready for when P1 exists.

**RES-1 - A take that cannot be read (expected failure).** Pre: S2 (just saved). `wait_for_ui_stable`; `get_all_text` at 5 s and 40 s.
**Expect:** header shows the type line and the prompt title; two tabs **Overview** and **Transcript** (no **Scores**); top card with a headline such as "One part didn't finish"/"Some parts didn't finish", a bar, per-step problem lines under "Transcript" with the message "Couldn't read this recording's audio on the device. Retry, or have Tono AI judge it from the video." (or the model-missing sentence) in red, a **Try again** button per problem, and the reassurance "Nothing is lost. Try again when you're ready."; the "Analysis" card lists Transcript, Voice analysis, Video analysis (omitted when skipped), Coaching, Tono AI with detail text and action buttons **Retry**/**Run**/**Get**; the skeleton hero "Listening back and measuring, on this phone…" may show first. No score ring. The video player shows the recorded video (play it). Buttons **Practice this prompt again** and **Done**.
**Evidence:** the problem line and the button list.

**RES-2 - Try again.** Tap **Try again** on the Transcript problem. **Expect:** the step goes to "Working…"/"Waiting…" and fails again with the same message within about a minute; no crash; the button returns. Report if it spins for more than 2 minutes.

**RES-3 - The Tono AI step is gated.** In the "Analysis" card the **Tono AI** row: its action button for an adult not allowed. Do not tap **Get**. **Expect:** description "Tono AI judges it from your words and the phone's measurements. Uses 1 judged take." (one-count); for an under-18 take: "Tono AI is for people 18 and over, so this take stays on your phone." and the button disabled; with no transcript: "Tono AI needs the transcript or the video, and this take has neither." (a failed take with video shows the first form).

**RES-4 - Tabs.** Tap **Transcript**. **Expect:** "Your response" with the duration; a card with the transcript area (empty or a placeholder for a failed take, not a crash); toggle row "Show cleaned-up response"/"Hide cleaned-up response". Back to **Overview** keeps the scroll.

**RES-5 - Header actions.** The bookmark (label "Keep as a progress video" / "Remove from progress videos") toggles with a toast "Kept as a progress video — clearing old videos won't remove it" / "No longer a progress video". The trash (label "Delete session") opens the delete alert (7.11).

**RES-6 - Done and BACK.** **Done** returns to the screen below (Today/Library) or the root; BACK does the same. **Expect:** no Preview in the stack.

**RES-7 - Open from Today and from Library.** Tap the take's Today row, then via Library. **Expect:** same screen, and the "ready" marker (if any) clears.

**RES-8 - Kill while processing.** Save a take and `force_stop` within 3 seconds; reopen; open the take. **Expect:** the pipeline resumes (the Transcript step shows working or failed, not stuck "interrupted" without a button); after the third kill on the same take it stops resuming by itself and shows **Try again** (from device plan I). Report the step states.

**Blocked until P1 (scored takes); conditions to check then:**

- RES-B1 Overview and Scores agree: the Overview's "Your scores" card lists Cadence, Impromptu, Confidence with sub-scores ("Pace 7 · Pauses 5.5 ..."); **See every score** opens the Scores tab; every Overview number appears with the same name and value on Scores; the hero number is between the lowest and highest skill; hero says "Judged by Tono AI" or "Measured on this phone", no archetype.
- RES-B2 Layer switch: on a take with both layers the Scores header shows a switch **Tono AI** / **This phone**; each layer's overall and skill scores change; the other layer's score is shown small under the skill name; sub-scores say who gave them.
- RES-B3 Charts: pace, pitch and loudness charts each show the whole take with no sideways scrolling, aligned time axes (0:00, 0:30 ...), labelled y axes with units in the title; flat voice shows within about 2 semitones; gaps are gaps; a coverage line ("Pitch read for N% of your speaking (N s)"); "not enough clear voice" under 3 voiced seconds.
- RES-B4 Chart gestures (drag one finger, double tap, pinch with `pinch_zoom`, the minus, plus and "whole take" buttons, vertical scroll over a chart still scrolls; cursor line on all three charts; readout; **Play from here** opens the Overview player).
- RES-B5 Transcript marks: um/uh and like/you know/actually in two colours with counts matching; no AI highlights until the switch "Tono AI's notes" (judged takes only); tapping a mark shows a note headed "Structure · Tono AI".
- RES-B6 Locked footnote on a free measured take: "Measured on this phone. Tono AI would judge what you said and how it came across: you get one judged take free each month." and no **See Tono Plus** on Android.

### 7.10 INPUT - Typed-input features (no microphone needed)

Pre: S1. These are fully testable; read every field back after typing.

**INPUT-1 - Mark it up with your own text.** Library -> **Mark it up** -> chip **Mine** -> **From your own text**.
1. Field placeholder "Paste or scan your text here…": `set_text` two or three sentences, for example: "The meeting starts at nine. Please bring your notes. We will decide before lunch."
2. Tap **Next · 3 sentences**; tap one sentence, then a neighbour (max two in a row); tap a non-neighbour (resets to it).
3. Tap **Mark it**.
**Expect:** the "Pick a sentence or two" screen reads "One or two sentences in a row — short is the point. Tap a neighbour to add it."; **Mark it** is disabled until a pick; a toast "Marked — check it over and change anything." (rules marking; the Tono AI toast "Marked by Tono AI..." must NOT appear on the free path); the "Edit the marks" screen shows the words with pause/stress/inflection marks, a key, **Re-mark with the rules**, **Clear**, **Practice it**, Undo; **Mine** shows the item with "N pauses · N rises/falls · N stressed · auto-marked". **Clear** then **Practice it** is disabled.
**Evidence:** the toast and the summary line.

**INPUT-2 - Delete a marked text.** Mine -> trash (label "Delete") -> alert "Delete this text?" **Cancel**/**Delete**. **Expect:** deleted from the list; the empty state "Nothing here yet. Lines you mark yourself show up here."

**INPUT-3 - Phrasebook.** You -> **Phrasebook**. Enter a phrase ("A phrase you like") and a note; **Add to phrasebook**. **Expect:** it appears in the list; with 4 or more phrases (verify count) a search field "Search your phrases" and **Say N aloud** appear; delete works (verify gesture).

**INPUT-4 - Three things.** You -> **Three things**. Pick a prompt chip, type "I'm patient" in the field ("I'm…"), **Add**. Add the same text again. **Expect:** first add shows in the list ("Day 1 of 30 · done today" in the screen eyebrow); the duplicate shows a warning with **Find a new angle** and **It's different** (no repeats); **Your list** row shows "N things so far"; **Say it to yourself** buttons exist (needs a mic; do not run).

**INPUT-5 - Events.** Today -> **Your events** (or Settings -> Practice -> "Your events") -> **Add an event** (or the + button). Choose a kind chip (Interview), **Tomorrow**, name "Quarterly review" (field "Call it something (optional)"), **Save**. **Expect:** "Coming up" group with the event and a countdown subtitle; **Save** is disabled until kind and date are set; **Pick a date** opens the date picker titled "When is it?"; the event edit screen has **Delete event** ("Tap again to delete" confirmation); Today shows the event card.

**INPUT-6 - Prime.** Today -> Conversations -> **Heading out?** -> "Prime": fill "What's coming up?", three topics, two questions, pick a goal chip, set the awkwardness; **I'm ready**. **Expect:** saved; "How did it go?" replaces "Heading out?" on the Conversations card ("Debrief · <label>"); **Conversation log** lists it.

**INPUT-7 - Debrief.** From the Conversations card **How did it go?** (or **Debrief a conversation**): "Debrief" with "What went okay?", "One thing to try next time", "One sign someone enjoyed it", awkwardness, optional "A moment you blanked"; **Save**. **Expect:** saved; the log shows it; a blank moment adds **Replay a moment you blanked** ("N saved") to the card.

**INPUT-8 - Conversation missions.** Tap a mission row on the Conversations card (check mark appears, "n/N" for multi-count missions); long-press to undo. **Expect:** immediate tick, persists after leaving and returning.

**INPUT-9 - Prompts.** Library -> **Prompts**: search field "Search prompts"; the + button (label "Add a prompt") -> "Add a prompt": fields "Prompt text" and "Prompt category", **Save Prompt** (disabled until text). **Expect:** the new prompt appears in the list and can be started from Free practice (dice may pick it; not guaranteed).

**INPUT-10 - Plan your point.** SET-2 turned on, then Free practice -> **Start Recording**. Fill the three fields; **Start Recording**. **Expect:** goes to Recording with the prompt; fields keep text if you go back (verify).

**INPUT-11 - Talk back.** You -> **Talk back**: preset thoughts and "Or in your own words — what does it say?" -> **Add**; open one thought ("ThoughtChallenge"); answer the prompts. **Expect:** saved; "N worries to look at fairly" on the You row.

**INPUT-12 - Name on Today.** Settings -> Practice -> "Your profile and goals" -> name field. **Expect:** Today's eyebrow becomes "Good <time>, <name>".

### 7.11 LIB - Library and search (Failed takes)

Pre: S2 plus two more recorded takes (so three Failed takes; record with different prompts).

**LIB-1 - List.** Library header "Library", "Your recordings" with count "3 takes", search box "Search what you said, prompts, dates", filter button (label "Filters"), month group header ("October 2026" style) with count, rows with title, date · duration · category, and a "Failed" marker. Rows read as accessibility label "<title>, Failed, recorded <date>". **Expect:** newest first; tapping a row opens its Result.

**LIB-2 - Search.** Type the first word of a prompt; type "monday" or today's weekday; type "zzzz". **Expect:** matches filter live; weekday/date queries match recordings from that day; no match shows "Nothing matches. Try a different search or filter."; the clear button empties it. The search matches *what you said* only when a transcript exists (blocked for failed takes).

**LIB-3 - Filters sheet.** Open **Filters**. Chip groups: "Show ..." (type), "Recorded Any time / Past 7 days / Past 30 days / Past 3 months", "Show All / Progress videos / Done / Processing / Failed", "Filter by ..." category chips ("All Topics" first), "Filter by All / Under 2 min / 2-4 min / Over 4 min", **Reset**. Select **Failed**, then **Done**. **Expect:** Failed shows the takes, Done shows "Nothing matches"; a dot appears on the Filters button when a filter is active; **Reset** clears; all months open while filtered.

**LIB-4 - Month grouping.** With takes in one month only, one group. (Older months need backdated data: blocked.) The two newest months open by default; tap a month header to collapse/expand.

**LIB-5 - Long-press menu.** Long-press a row. **Expect:** the delete alert of 7.12.

**LIB-6 - Pull to refresh.** `swipe` down on the list top. **Expect:** spinner, list stays, no duplicates.

**LIB-7 - Progress videos strip.** With a keepsake (RES-5 bookmark on): the strip above the list shows it; filter "Progress videos" lists it; empty filter shows "No progress videos yet" and the explanation "Pin a take from its results, or clear old videos in Settings — the best and the toughest take from each month are kept."

### 7.12 DEL - The delete flow

Pre: S2 plus extra Failed takes as needed. For file checks note `adb shell run-as com.ahmadgraham.tono ls -la files/sessions` and Settings -> Help & data Storage "Videos" before each.

**DEL-1 - The two choices.** Long-press a take in Library (or the trash on Result). **Expect:** alert "Delete this take?" with body "The video, audio, transcript, scores and notes are erased from your phone for good, and it no longer counts toward anything. Your streak keeps the day. You can undo for a few seconds." and buttons **Cancel**, **Delete take**, **Free up space, keep the transcript and scores**. Tap the third: second alert "Free up space?" with "This deletes only the video and its audio. The transcript, scores and progress stay. Tono AI can still judge it from your words." and **Cancel**/**Free up space**.
**Evidence:** quote both alerts.

**DEL-2 - Delete take with undo.** Tap **Delete take**. Immediately `get_all_text`; tap **Undo** within the window. **Expect:** the row vanishes at once; a toast "Deleted" with "Undo" stays about 8 seconds; **Undo** gives the toast "Restored" and the row returns with the same title and status; its file is still in `files/sessions`.

**DEL-3 - Let the window pass.** Delete again; wait 10 s (do not tap Undo; do not press HOME). **Expect:** the toast disappears; the row is gone after a refresh; the file is gone from `files/sessions`; Storage "Videos" drops by roughly the take's size.
**Evidence:** `ls` before and after; sizes.

**DEL-4 - Undo too late.** Delete, wait 9 s, check for any way to restore. **Expect:** no Undo anywhere; if you can tap the toast at the last instant the toast says "Restored" or "Too late to undo that" (never a half state).

**DEL-5 - Free up space keeps the take.** On a take with a video choose the third button, then **Free up space**. **Expect:** toast "Video deleted. Transcript and scores kept"; the row stays; the Result shows "Video removed to save space" instead of the player; the file is gone; Storage Videos drops. Reopen the delete alert on it: only **Cancel** and **Delete take** (no third button). The Tono AI row text on Result no longer says it needs the video (it says "...needs the transcript or the video, and this take has neither." when no transcript).

**DEL-6 - Delete from Result.** Open a take, tap the trash ("Delete session"). **Expect:** same alert; after **Delete take** the app pops to the root and shows the "Deleted"/"Undo" toast on whatever screen is there; **Undo** restores.

**DEL-7 - Killed during the window.** Delete a take, then within 2 seconds `force_stop`. Reopen, open Library. **Expect:** the take is gone (erased at launch), not restored; file gone.

**DEL-8 - Background during the window.** Delete a take, immediately press HOME, wait 3 s, reopen the app. **Expect:** gone (erased on background), toast gone.

**DEL-9 - Delete while it is still analysing.** Save a take and delete it from Library within 3 seconds. **Expect:** disappears; no later "score ready" toast or notification for it; after 60 s and a relaunch it has not come back; Today's "Your takes" row is gone.

**DEL-10 - Gone everywhere (partial).** After DEL-3: Library, Library search for its prompt, filters, Today "Your takes", Dev -> Pipeline list, Dev -> Pipeline problems filter, Result via a stale route (not reachable). **Expect:** absent in all reachable places. (Trends, Progress, skill lists: blocked until P1.)

**DEL-11 - Many deletes.** Delete three takes quickly one after another. **Expect:** only the latest undo toast is shown (the toast is exclusive); the earlier ones are erased after their windows; no crash. (verify what the earlier takes do.)

**DEL-12 - Files really removed.** Record two takes (about 20 s each). Note Videos size. Delete both and wait 10 s each. **Expect:** the Videos size returns to its starting value (tolerance a few KB) in Settings -> Help & data and in Dev -> App tools -> Storage. Relaunch: unchanged.

**DEL-13 - Free up old videos.** Settings -> Help & data -> **Free up space from old videos** -> the alert states the retention days; **Free up space**. With only new takes: result alert "Done" "Deleted 0 videos; their transcripts and scores stay. N progress videos kept." (the cutoff is days old; new takes are not old). **Expect:** no takes lost.

**DEL-14 - Delete a Rewind.** (After RW-4.) Long-press a Rewind in the Library, or the **Delete or free up space** row on the Rewind result. **Expect:** same two choices with Rewind wording ("Rewind deleted" toast, **Undo**); the choice "Free up space, keep the words and notes" removes the audio only.

**DEL-15 - Reset app erases everything.** SET-13. **Expect:** covered there.

**DEL-B - Streak keeps the day (blocked).** Needs a done take on a streak day (P1). Condition: after deleting the only done take of a day the streak number and "You've practiced today" do not drop.

### 7.13 STR - Streak and the daily goal

**STR-1 - A drill makes a streak.** Pre: S1, streak 0 ("You" hero shows 0 "day streak"). Learn -> All skills -> a Cadence lesson with a **Guided** exercise (or the Today warm-up) -> complete it and rate it (**Done** enabled after a rating). **Expect:** within a few seconds Today shows the pill "1-day streak"; You shows 1 "day streak" and "This week 1 day"; Progress shows the streak card. (Any drill attempt counts; a Failed take does not.)

**STR-2 - A Failed take does not count.** Pre: S1 streak 0. Record and save a take (Failed). **Expect:** streak stays 0. Deleting it changes nothing. (Documents the behaviour so it is not mistaken for a bug; the human may want an error take to count, report as a question.)

**STR-3 - Daily goal pill.** SET-7 goal 3x/day. **Expect:** Today pill "0 of 3 today" with three dots; completing the warm-up alone does not complete a session.

**STR-4 - Freeze display.** Not reachable (needs seven practice days).

### 7.14 TRD - Trends, Progress, skill pages

Pre: S1 and S2.

**TRD-1 - Empty states.** Progress -> every section; Score trends. **Expect:** text such as "Do a few drills in this track to see a trend." and empty charts, never blank or "NaN"/"undefined" text. Scan with `get_all_text`.

**TRD-2 - Skill detail.** Today skill ring -> Skill detail; Progress "Skill mastery" -> tap a skill. **Expect:** titles "How this number works", "What feeds it", "What moves it", "Recent changes" ("Each one: how you did, against what your rating predicted.") with an empty-state sentence.

**TRD-3 - Level and stages.** Level screen: "Your skills" ("Each one climbs five stages..."), "The stages", "Practice difficulty" row (opens "Practice difficulty": pin a level; alert on change).

**TRD-4 - By skill chips.** Progress -> "By skill" chips for the five skills switch the charts ("Drill scores" with "Do a few drills in this track to see a trend.").

**TRD-B - Score trends with data (blocked, P1).** "Score trends" draws judged and measured lines separately; gaps, not zeros; month averages "· Tono AI" only when they average judged takes; Library "Judged by Tono AI".

### 7.15 PRAC - Drills and exercises (as far as the mic allows)

All speech drills share the same shape here: the screen works up to listening; nothing is heard.

**PRAC-1 - Word Chain.** Learn -> All skills -> Impromptu -> lesson "Keep the thread" (Start on its first step, title "Word chain"). **Expect:** the screen header "Word chain · level N" with the title; the intro explains: "Start from "<word>". Say a word that goes with it, then a word that goes with that one, and keep going fast: ... No reasons needed, just speed. Target: 8 good links in 30 seconds. Go quiet for 3 seconds and a fresh word appears; just pick up from there." plus a "how it's scored" line; button **Start**. Tap **Start**: timer counting down ("N seconds left"), stat tiles "of 8 links" and "fresh words" (a fresh word appears after about 3 s of silence and "fresh words" increases), button **Finish · Ns**. Wait out the timer or tap Finish: **Expect:** the "Didn't catch anything." state (or a result of 0) with **Try again** and **Done**; no crash; no "Link by link" list and no sign-in or consent prompt. Compare the intro to the description in `docs/decisions/exercise-judging.md`. Scoring text is blocked (P4).
**Evidence:** the intro paragraph (quote) and the end state.

**PRAC-2 - Bridge Chain.** Same lesson, step 2 ("Bridge chain"). **Expect:** intro starts "Word Chain is about speed. This one is about the reason." and gives the example "ink, because a pen writes with ink." and "Target: 3 explained links in 45 seconds. Go quiet for 4 seconds and a fresh word appears". Start/Finish behave as PRAC-1.

**PRAC-3 - The two intros differ.** Read both intros in a row. **Expect:** one sentence each of how they differ (speed vs reason) is possible from the text alone.

**PRAC-4 - Move It.** Learn -> Cadence -> lesson "Move it to mean it" -> its Move It step. **Expect:** header "Move it · level N", intro with take list (ghost take marker), **I'm ready**; take screen (title "<kind> take"); results "Your takes" with **Again** and **Done**, and with no sound "Couldn't hear enough to compare." Recording a take calls the live recorder: if the mic is unavailable a toast "Microphone permission is needed to record." or "Recording isn't available on this phone." may appear. Report which.

**PRAC-5 - Mark it up reads.** Library -> Mark it up -> Lines -> **Start a rep** (or tap a line). **Expect:** stage titles per read (the line with its marks), key (MarkKey legend, tap marks to hide), buttons **Record this read** (label changes to **Stop recording** while recording and **Re-record this read** after), **Play it back**, **Next read**; the rating question "How close did your reads sound to the marks?"; **Done** needs a rating. Recording works against a silent mic; playback plays silence or a toast "Couldn't play that take back." Report.

**PRAC-6 - Tongue twisters.** Library -> **Twisters** -> list with difficulty badges; open one; **Start**. **Expect:** listening state "Stop · Ns"; "Resume listening" may appear if recognition stops; **Scoring…** then a result with **Try again**/**Done** (score 0 or "didn't hear" text); no crash.

**PRAC-7 - Category sprint / Letter sprint / Sixty seconds.** From their lessons ("Word retrieval" step 1/2; "No-hesitation minute"). **Expect:** same shape as PRAC-1 (intro, Start, timer, Finish, "Didn't catch anything.").

**PRAC-8 - Guided exercises and warm-ups.** Warm-up: "Warm-up" eyebrow, **Start**, steps with **Skip**, then **Done**. Guided exercise (Confidence lessons, for example "Work with the nerves"): "Guided exercise" eyebrow, steps with **Back**/**Next**/**I've done it**, a rating, **Done** disabled until rated. **Expect:** complete without a mic; the drill is recorded (feeds STR-1).

**PRAC-9 - Summary and conversation drills (shape only).** Lessons "Sum it up" (Summary drills) and Conversation lessons (for example "Moves"). **Expect:** intro and **Start**, listening state, **Done**, the end "Didn't catch a reply." and **Again**/**Done**; the self-rating question "Right now, how much of your attention is on yourself?" (slider "Slide to choose") before and after a conversation drill is testable: drag the slider (tap the track) and check the number and "out of 10".

**PRAC-10 - Rewind.** You -> **Rewind**. 
1. Screen "Rewind" ("Tell your day"): "Say your whole day out loud", **Start**, the "To remember more" tips ("Say everything, however small" ...), and "Your days" list when any exists.
2. **Start**: 3-second get-ready text, then the recording stage with a large waveform (the waveform stays flat on a silent mic), elapsed time, an **End** button reading "Keep going · 0:NN" and disabled until 1:00, and no pause control. Close (X) within 5 seconds discards ("Discard this take?"/"Nothing is saved if you leave now." may show on later closes).
3. Wait to 1:00; **End** enables; tap it.
**Expect:** the result screen opens within a second or two (RewindResult) with the processing card "Step N of 3: ..." (or the take row says "Still listening back…"), then likely "No words came through" or a failed state; the "Counted" group (Length, Concrete details, Longest pause), a Notes card that is calm and has no error: the free-path card without a sign-in; **Write it out again** and **Delete or free up space**. Auto-stop at 2:00 (optional, 2 minutes).
**Evidence:** the end state and the Notes card text.

**PRAC-11 - Kill during Rewind processing.** After End, `force_stop` at once; reopen; You -> Rewind. **Expect:** the take is processed again (not stuck "Still listening back…" forever); after two kills it shows as failed with what was heard.

**PRAC-12 - Skill check pieces (optional).** Pre: S0 with **Now**. Read, Category, Reply, Talk pieces each have **Start**; the Talk piece needs a topic; **Skip the check for now** appears while nothing is done. **Expect:** layout and navigation only.

**PRAC-13 - Feeling of the Week (verify).** If the Today card shows, open it; the rep is "private by default" and has no score. Report what the screen offers.

### 7.16 DEV - The Dev tab

**DEV-1 - Visible in the dev client.** Tab bar has five tabs including **Dev** (bug icon). Header "Developer tools" eyebrow, title "Dev", copy icon (label "Copy status"), a status card with Build ("Dev · v1.5.0"), Device, Database ("v N"; no "(expected v N)" warning), Transcriber, Apple Intelligence ("Off"), counters "Errors in 24 h" and "Problem steps", groups Inspect (Pipeline, Logs, Metrics), Labs (Face Lab, ASR Lab), Tools (App tools), footnote "These tools exist only in development and preview builds." **Expect:** all present; "Problem steps" is above 0 after Failed takes (tap it -> Pipeline filtered to Problems).

**DEV-2 - Logs.** Dev -> Logs: filter by level and tag chips, search "Search", **Clear filters**, share (label "Share logs"), clear (label "Clear logs" -> alert "Clear all logs?"), "Jump to newest". After a failed take expect `[pipeline]` and `[transcribe]` error lines. **Expect:** filters narrow the list; tapping a tag chip filters. Do not share.

**DEV-3 - Pipeline.** Dev -> Pipeline: segmented "Last 30" / "Problems N", the dots legend ("Dots: transcript, voice, video, coaching, deep review. Filled is done; hollow is skipped."), a row per take ("Take from <date>"), type · seconds · id. Open a take -> "Take" screen: copyable ID, Steps with per-step re-run icons ("Re-run Transcript" etc.), Export ("Copy analysis as JSON", "Share analysis as a file"), Labs -> Voice Lab, "Stored results" list (artifact kinds), the open-result icon. Voice Lab: **Run the analysis** on a take (the audio cannot be decoded on this AVD, so it should report an error alert "Voice Lab" with a message, not crash). **Do not** use Re-run on the Tono AI row (stop list: it asks "Have Tono AI judge it again?").

**DEV-4 - App tools.** Rows: "Judge from" (toggles Words and measurements / Video: toggle and back), "Over-the-air updates" (Channel/Runtime/Running: "A development build: JS comes from Metro, not from updates"), "Tours" (one row per tour id with seen/new; tap a seen one to show it again; **Show every tour again**), "Previews" (live waveform with chips for reading rates; welcome intro; progress moment with chips Stage earned / Personal best / Off day and **Replay**/**Close**; stage celebration; unit celebration; path finale), "Notifications" (**Send a test in 5 seconds**), the scheduled list ("N scheduled" with times), "Storage" rows. **Expect:** each preview opens and closes; confetti/celebrations render and can be closed; the path finale preview shows its screen and its close button works and does not mark itself seen.

**DEV-5 - Test notification.** Tap **Send a test in 5 seconds** (allow the notification permission if asked), toast "Sending in 5 seconds. Lock the phone or leave the app.", press HOME, wait 7 s, pull down the shade (`adb shell cmd statusbar expand-notifications`), `get_all_text`. **Expect:** a notification "Tono" "Test notification from the Dev tab." Collapse it (`adb shell cmd statusbar collapse`).

**DEV-6 - Metrics.** Dev -> Metrics: facts, "Thermal", **Start recording**/**Stop recording**, switch "Overlay on every screen" (turn on: a small overlay shows on every screen without blocking taps; turn off), "Recorded runs" list, **Copy JSON**, **Clear** (alert "Clear recorded runs?"). **Expect:** screen loads; values may be zero or nonsense on an emulator (do not file). Overlay must not cover the tab bar or buttons.

**DEV-7 - Face Lab.** Dev -> Face Lab: camera preview (permission granted), meters (Head turn, Head up/down, Eyes side, Smile ...), **Start** calibration, thresholds, **Reset**, **Share as code**. **Expect:** loads and shows a preview; readings sit at their idle values with no face. Do not rely on detection.

**DEV-8 - ASR Lab.** Dev -> Labs -> ASR Lab: "Models" list with the 574 MB model and its download button, take chips, **Run N engines**, "Engines" list, Export (do not share). **Expect:** loads; with no model "Download the model first".

**DEV-9 - Hidden in production (verify).** Stop Metro. Start it with dev tools off and a production-like bundle:

```bash
cd /c/dev/speech-coach-app
EXPO_PUBLIC_DEV_TOOLS=0 npx expo start --dev-client --port 8081 --no-dev --minify --clear < /dev/null > "$TEMP/metro.out" 2>&1 &
```

Reopen the dev client URL (2.5). **Expect:** the tab bar has four tabs (Today, Learn, Library, You), no Dev tab; no way to reach Logs, Pipeline or App tools; the Metrics overlay absent. If the Dev tab still shows, the project's own env sets the flag (cannot tell without reading `.env`: say so, and do not read it). Restart Metro normally afterwards (2.4).

### 7.17 THEME - Dark and light mode

**THEME-1 - Key screens in both.** Run for each of Today, Learn, Library (with a take), You, Settings -> Goal & reminders (picker open), Free practice, Recording (always dark), Preview, Result (failed take), Rewind, Mark it up, an alert dialog, a toast, a tour tip.
1. `cmd uimode night no`; screenshot; `night yes`; screenshot.
**Expect:** backgrounds are warm paper in light and near-black in dark; text is readable (no dark text on dark, no white text on white); the ink accent is near-black in light and near-white in dark; button text uses the on-accent colour (never white on a light button in dark mode); switches show a visible thumb; the Android status and navigation bars match; no screen stays in the old theme after toggling.
**Evidence:** one screenshot description per screen per mode.

**THEME-2 - Toggle while on a screen.** On Settings and on Result toggle the mode. **Expect:** the app follows without a crash; navigation and form values survive (the app may reload itself; if it loses place, note it).

**THEME-3 - Splash.** `force_stop`, reopen in each mode. **Expect:** splash background matches the mode (paper `#F6F5F1` / ink `#0E0E0C`), no white flash in dark (screenshot as early as possible).

### 7.18 FONT - Large font, small screen, rotation

**FONT-1 - Font scale 1.5.** `settings put system font_scale 1.5`; revisit Today, Settings -> Goal & reminders (picker), Library, Result, Preview, Recording idle, onboarding questions (long chips), alert dialogs, the tab bar. **Expect:** all text scales (the app does not cap scaling); nothing is clipped to the point of being unreadable; primary buttons are reachable (scroll if needed); no overlapping text on cards or rows; the tab labels stay one line or wrap gracefully; the Recording idle controls and the record button remain on screen.
**Evidence:** screenshot descriptions; list any overflow.

**FONT-2 - Font scale 2.0.** Repeat on 5 screens. **Expect:** same, with more scrolling; no crash.

**FONT-3 - Small screen.** `wm size 720x1280`, `wm density 320`; then `480x854`, `240`. Visit the same screens. **Expect:** no horizontal scroll, buttons visible, the Recording screen's bottom bar (Prepare chips, blind toggle, record button) fits; the dev gear may overlap (ignore). Restore with `wm size reset`/`wm density reset`.

**FONT-4 - Rotation.** `rotate_device` to landscape on Today, Recording, Result, Settings. **Expect:** the app stays portrait (config `orientation: portrait`); the layout does not break; no crash. If it does rotate, that is a bug (record).

**FONT-5 - Display cutout / gesture nav.** The AVD uses gesture navigation (verify). Controls near the bottom (Done, Use this take, Start recording) are not hidden under the gesture bar.

### 7.19 NET - Offline and airplane behaviour

**NET-1 - Cold start offline.** Airplane on (2.8, verify), `force_stop`, reopen. **Expect:** the app opens (Metro via adb reverse); no crash; Today loads; Settings -> Account & Plus still shows "Sign in (optional)"; the logs may say `[account] could not read the app config` (fine).

**NET-2 - The Tono AI switch and consent, safely offline.** Airplane on. Record a take (or have one at Preview). On the Preview screen turn on **Have Tono AI judge this take**. **Expect:** an alert "Couldn't reach Tono AI" with "Check your connection and try again. Your phone's measurements and tips work offline."; the switch stays off; **Use this take** still works and saves unjudged. Nothing is sent (airplane). Also Settings -> Tono AI -> **Allow Tono AI** offline shows the "Let Tono AI judge your takes?" alert; choose **Not now**. (Never **Allow**.) This is test AIOFF-1; run it only after confirming airplane mode with the ping check.
**Evidence:** quote the alert.

**NET-3 - Model download offline.** Airplane on; Today banner -> **Download**. **Expect:** it ends in "The model download stopped" with a reason and **Try again**; no crash; Continue is not blocked in onboarding after the stop (status failed counts as started).

**NET-4 - Offline recording and analysis.** Airplane on; record and save a take. **Expect:** same as online (failed Transcript step on this AVD); no network-specific error and no hung spinner; the Tono AI step is not attempted (no review wanted).

**NET-5 - Go back online.** Airplane off; bring the app to the front; wait 30 s. **Expect:** nothing is sent by itself (no Tono AI consent, no review wanted); no crash; the logs show at most the app config read.

**NET-6 - Links that need a network.** Do not tap. Note they exist (Terms, Privacy, Send feedback).

### 7.20 LIFE - Kill, relaunch, background, resume

**LIFE-1 - Relaunch keeps state.** From S1 with a take: `force_stop`, reopen. **Expect:** lands on Today (not onboarding), the take is in Library, settings unchanged (for example daily goal 3x).

**LIFE-2 - Kill during recording.** Start a recording, wait 5 s, `force_stop`, reopen. **Expect:** no crash; no half-saved take in Library; the leftover temp file is cleaned (`ls files/sessions` has no stray `preview-*` older than a day, cleaned at launch, verify); Today normal.

**LIFE-3 - Background and return on each key screen.** HOME for 10 s then return on: Today, Result, Preview (the preview file remains and the screen still works), Settings picker with a menu open, an open alert. **Expect:** same screen, no blank, no crash.

**LIFE-4 - Task switch.** `press_key` APP_SWITCH / recents (verify key), return. **Expect:** same as LIFE-3.

**LIFE-5 - Rotation lock.** See FONT-4.

**LIFE-6 - Low-memory proxy.** `adb shell am kill com.ahmadgraham.tono` (process death while backgrounded: HOME first), reopen from the launcher icon. **Expect:** the dev client may show its launcher; reopen the URL; the app restores to Today with data intact.

**LIFE-7 - Hot reload hazard.** Not a test; remember it (section 3).

### 7.21 DSN - Design language (Quiet Studio)

Run alongside other suites: every screenshot is also a DSN check. Reference: the design memory and `docs/history/design-refresh-plan.md`.

**DSN-1 - One sans typeface, no serif.** On 10 screens (Today, Learn, Library, You, Settings, Practice, Recording prompt, Result, Rewind, a Lesson, the onboarding question) look at headings, prompts, numbers and the spoken-word text. **Expect:** the same geometric sans (Instrument Sans) everywhere; no serif letterforms anywhere, including prompt text and large numbers; no faux-bold look. Report any serif as a bug.

**DSN-2 - No all-caps labels.** Run `get_all_text` on each screen and look for runs of capitals longer than 3 letters that are not acronyms. Allowed: AM, PM, AI, ID, CSV, JSON, ASR, MB, GB, ms, wpm. **Expect:** none. Eyebrow labels ("Developer tools", "Cadence", "Skill check · about 5 min", "Today · 8 min") are sentence case. (The Move It results label uses `uppercase`, which renders sentence case; verify.)

**DSN-3 - No borders on cards, no card in a card.** Look at Cards, list groups, chips, text fields. **Expect:** surfaces are separated by tone, not outlines; light mode cards have a soft shadow; no nested card. Allowed: hairline separators between list rows, the hairline above the tab bar, the camera screen overlays, the day-of-week chips. Report any visible 1 px outlined card as a nit.

**DSN-4 - Shared chrome.** Most screens use `Screen` (large collapsing title, back chevron, pinned footer) or `ScreenContainer` plus `Header`. Known hand-built screens: Library, Practice ("Free practice"), Preview, Result, Recording, Rewind recording, Onboarding. **Expect:** back chevrons in the same place (top left) with the same size on the others; titles at the same size on sibling screens; large titles collapse on scroll for `Screen` screens; footers pinned. Report visible inconsistencies between sibling screens.

**DSN-5 - One ink primary action per screen.** On each screen count filled (ink) buttons. **Expect:** at most one primary; others secondary (tinted) or ghost. Note exceptions (for example Lesson cards where every step has a **Start**; that is by design: only the next step is primary).

**DSN-6 - Colour means something.** Skill colours appear only on skill-related UI (badges, rings, lesson heads); red only for recording and destructive/error; success green for status and switch tracks (switch tracks are green so the thumb is visible). **Expect:** no random accent colours; switches on show a coloured track with a visible white thumb in both modes.

**DSN-7 - Motion.** Tab pill springs to the active tab; screens fade/slide in; toasts slide down from the top. Observe, no pass/fail beyond "no jank, no stuck animation".

---

## 8. Add after session 12 merges

Session 12 (live conversation with a voice, branch `feature/conversation-voice`) is being built in parallel and is **not merged**. Do not run this section until it is in the branch under test.

First, **read the device test plan's section K** (`docs/testing/device-test-plan.md`, "K. Live conversation with a voice (session 12)", added by that branch) and the design doc `docs/decisions/conversation-voice.md`. Then fill in the placeholders below from the merged code. The live conversation, its streaming partner voice and the Partner voices lab are server- and audio-bound: most of section K stays on the human list.

Placeholders (verify every label after the merge):

| ID | Intent | Likely emulator-testable part |
|---|---|---|
| CONV-1 | Conversation lesson shows the card "Try it in a live conversation" with a "Tono Plus" badge and **See what it is** for a free user | The card and the locked screen: one calm Plus card, no alert, no sign-in, no account made. On Android Plus is not on sale, so check there is no buy button. |
| CONV-2 | The locked/sample screen explains the feature without a dead end | Text and BACK only. |
| CONV-3 | Starting a live conversation offline shows "Live conversation needs a connection" | Airplane mode on, open a Conversation lesson, try to start: safe, nothing is sent. |
| CONV-4 | Conversation drills still behave as before | PRAC-9 again. |
| CONV-5 | Dev -> Labs -> **Partner voices** exists and loads (only after P1/P2-style gating decided) | Screen loads; the play buttons call the server (stop list). |
| CONV-6 | The minutes display in Account & Plus / Tono AI for conversation (30 in the trial, 120 for Plus) | Needs P2 (mock account). Blocked now. |
| CONV-7 | Pause on leaving the app, "Carry on" | Needs a started conversation: server. Blocked. |

Update 7.1 to 7.21 where the merge changes labels (Dev hub rows, lesson steps, Today card), and update section 9 with what stays on the human list.

---

## 9. Not testable here

Everything below stays on the human list in `docs/testing/device-test-plan.md` (section names as in that file). Do not mark them pass or fail; report them as "not testable on the emulator".

| Not testable | Why | Where |
|---|---|---|
| Playback out of the speaker, never the earpiece; full-quality recording; AirPods and wired headphones; impromptu clean audio after playback; spoken prompts; volume drills | No real audio path | Section A |
| Research timer in the Dynamic Island and on the Lock Screen; the "away" notification timing; kill mid-research; Android ongoing notification wording | iOS Live Activity; real timing | Section A |
| Rewind player: scrubbing, speeds, pitch, tap-a-word, auto-scroll feel, fades, VoiceOver and Reduce Motion, old vs new Rewinds | Needs real Rewind audio and transcript (and a screen reader) | Section B |
| Library behaviour with scored takes (long-press delete of Rewinds with words, search for a spoken word) | Needs transcripts | Section B |
| Dev metrics on a real build: memory, CPU, thermal, battery current | Emulator numbers are meaningless | Section C |
| Path finale on a real last unit; notification copy on the lock screen; evening reminder logic | Needs real progress and real delivery | Section C |
| Voice Lab on three takes, gain-control test, Face Lab frame rate | Real mic and camera | Section D |
| Hosted comparison, deep review model pick, token counts, voice ear test, conversation latency, echo cancellation, sandbox purchase, on-device LLM | Paid server, real audio, Apple | Section E |
| Judged-from-words scores, judged vs video, breakdown reads as one system, mastery moves with the score, Rewind notes on request, Say it short and Mark it up with Tono AI, long take fits a text review, offline review (with the server) | Server and scored takes | Section "Session 07" |
| Delete means delete with scored takes: streak keeps the day, gone from Trends/Progress, no rewriting of past progress, uploaded video at Google, exports, backup | Needs scored takes and the server | Section "Delete means delete (session 13)" (the file-removal, undo, two-choices, kill-during-window and reset items run here as DEL-1 to DEL-14) |
| Pitch, loudness, pauses, fillers, pace, face: tracker accuracy, personal pitch band, breath handling, expression scale, nods, look up/down, head pose sign, storage shrink to 720p, smaller upload, Rewind AAC | Real speech and face | Section F |
| Word Chain, Bridge Chain and Rewind judging by Tono AI; allowance; offline and signed-out wording of judged results; own key message | Server and speech | Section G |
| Waiting-on-analysis timings, background and kill survival with a working pipeline, airplane-mode review that sends itself, failed review (not network), the initial assessment wait screen with a review | Needs a pipeline that succeeds, and the server | Section I |
| Impromptu results screens: overview vs scores, layer switch, charts and gestures, pitch honesty, Play from here, no-voice charts, transcript marks, Library/Trends with judged layers, dark mode/large text on the Scores tab | Needs scored takes (P1) | Section H (run as RES-B1 to RES-B6 once P1 exists) |
| Tiers, trial and account: free judged take, used-up state, server-set count, one-take-one-count, paywall with real prices, trial start/renew/no second trial, reinstall and restore, Apple/Google linking, account deletion, age question server switch, key removal | iOS purchases, sign-in, the server | Section J (the age question UI and free-path UI run here as ONB-5 to ONB-8, FREE-1 to FREE-5) |
| Live conversation with a voice | Server, real audio | Section K (after session 12 merges; see section 8) |
| Haptics, accessibility screen readers, real Android devices' vendor quirks, AAC recording on a real Android phone | No hardware | Various |

---

## 10. Maintenance

Update this plan when:

- a screen, route, button label or alert text changes (labels are quoted from the code on the date above; a label test failing after a copy change is a plan bug, fix the plan);
- a session adds a feature: add a test group in section 7 and, if the feature is phone-only, add the item to `device-test-plan.md` and a line in section 9;
- session 12 merges: fill section 8, then move its rows into 7.x and delete section 8's placeholders;
- any item in section 5 is built: delete the matching "blocked" notes, turn the `RES-B*`, `DEL-B`, `TRD-B` and `PAY-2/3` items into full tests, and rewrite section 4;
- the AVD changes (a new system image that records AAC would unblock real transcription: rewrite 4.1);
- the onboarding questions change (update 11.1 and ONB-4);
- the Dev tab rows change (7.16);
- an expected-failure message (RES-1) is reworded.

Keep tests small and independent, with a precondition state. Keep the stop list current: any new button that reaches the server belongs there. Do not add a test whose pass condition needs real speech.

---

## 11. Appendix

### 11.1 The standard onboarding recipe (S1)

From S0 (Welcome intro showing). Use `get_clickable_elements` to find buttons; the question title is in `get_all_text`. Dismiss tips on the way.

| # | Screen title | Do |
|---|---|---|
| 1 | Welcome intro | **Skip** then **Let's start** |
| 2 | What should we call you? | **Skip** (or `set_text` a name for INPUT-12) |
| 3 | How old are you? | pick **25 to 34** (change per ONB-5/6/7), **Continue** |
| 4 | Where do you most want to speak better? | **Work meetings**, **Continue** |
| 5 | What gets in your way? | **Filler words** (do not pick Nerves: it turns the recording warm-up on), **Continue** |
| 6 | Is anything coming up? | **Skip** |
| 7 | How do you feel about speaking in front of people right now? | tap the slider track at about 60 percent (reads "3 out of 5" or "4 out of 5"), **Continue** |
| 8 | How do you feel about seeing yourself on video? | **It's fine**, **Continue** |
| 9 | Have you done speaking training before? | **None**, **Continue** |
| 10 | Is English your first language? | **Skip** |
| 11 | Do you stutter, or have another speech difference...? | **Skip** |
| 12 | Anything about your voice we should know? | **Skip** |
| 13 | What does your inner critic say when you speak? | **Skip** |
| 14 | How many times a day do you want to practice? | **Once a day**, **Continue** |
| 15 | How long is a session? | **5 minutes**, **Continue** |
| 16 | Which days? | **Continue** (every day) |
| 17 | When will you practice? | **After work**, **Continue** |
| 18 | Where will you usually practice? | **A room to myself**, **Continue** |
| 19 | Want a reminder? | **No reminders**, **Continue** (choose Yes for ONB-10) |
| 20 | Get the transcription model | download button then **Pause**, **Continue** |
| 21 | Meet Tono AI, your coach | **Not now** (never **Allow Tono AI**) |
| 22 | How long should full videos be kept? | **30 days, plus two keepsakes each month**, **Continue** |
| 23 | What will be different when this works? | **Skip**... the last question's primary button reads **Done**; tap **Done** |
| 24 | Camera and mic | **Allow access** (or **Next**), camera step **Skip for now**, mic step **Skip** |
| 25 | All set | **Tomorrow** |
| 26 | Today | tap **Turn off tips** on the first tip card |

Count: the questions list in `src/content/onboarding.ts` has 22 entries (name, age, contexts, obstacles, event, comfort, video, experience, english, speech, voiceNote, innerCritic, goal, minutes, days, anchor, place, reminders, transcription, cloud, retention, why). Steps 2 to 23 above are those 22.

### 11.2 Result row template

```
| ID | Result | Evidence | Note |
|----|--------|----------|------|
| SM-1 | pass | get_all_text: "Tono", "Skip" | |
| REC-8 | fail | tapped Stop at 0.8 s; alert "Recording error" ... | see BUG-3 |
| RES-B1 | blocked | needs a scored take (P1) | |
```

### 11.3 Bug template

```
BUG-n  <short title>   severity: crash | wrong | ugly | nit
From: <test ID>   Build: <commit> / Android <version> / <light|dark>, font <scale>
Repro (from S0 or S1):
 1. ...
 2. ...
Expected: ...
Actual: ... (quote get_all_text strings; attach screenshot description)
Repeats: yes / no (tried twice)
Logs: <filtered logcat lines, no keys>
```

### 11.4 Label cheat sheet

| Where | Labels |
|---|---|
| Tab bar (Android) | Today, Learn, Library, You, Dev |
| Today | Start session, Continue, Done for today, 5 min / 8 min / 12 min, Practice something else, Your events, Your skills (Progress), Conversations, Your takes, Heading out?, Debrief a conversation, Conversation log |
| Learn | Your path, All skills, Frameworks; skills Articulation, Cadence, Impromptu, Confidence, Conversation |
| Library | collections Free practice, Prompts, Mark it up, Twisters, Frameworks; Your recordings; Search recordings; Filters |
| You | Speaker level N, Rewind, Three things, Talk back, Phrasebook, See all progress, Settings sections |
| Practice ("Free practice") | Start Recording / Practice Again, Or free record, no prompt, Get a different prompt, Session options, Concise · 30s, Mark it up, Prompt Library, Tongue-Twister Drills |
| Recording | Start recording / Stop recording, Restart take, Hide preview / Show preview, Close, Prepare for 30 s / 1 min / 2 min / 5 min, Skip warm-up, Get ready, +30 s, Research, No prep, Start now, Search the web, I'm ready — record, Grant Camera Access, Grant Microphone Access, Open Settings |
| Preview | Review your take, Have Tono AI judge this take, Use this take, Retake, Discard, Keep reviewing |
| Result | Overview, Scores, Transcript, Try again, Retry, Run, Get, Run again, Practice this prompt again, Done, Delete session, Keep as a progress video |
| Delete | Delete this take?, Delete take, Free up space, keep the transcript and scores, Free up space?, Deleted / Undo, Restored, Too late to undo that |
| Settings sections | Practice, Goal & reminders, Coaching & AI, Account & Plus, Tono AI, Permissions, Help & data |
| Help & data | Show tips again, Share diagnostics, Free up space from old videos, Clear temporary files, Export practice data, Keep Rewind audio for, Reset app |
| Dev | Pipeline, Logs, Metrics, Face Lab, ASR Lab, App tools, Copy status |

### 11.5 Expected on this emulator (do not file)

- The Transcript step of every recorded take fails ("Couldn't read this recording's audio on the device...") and the take is "Failed".
- No Scores tab, no hero ring, no charts, no coach card on any take.
- No Tono Plus row, no Restore, no Apple button, an unreachable Paywall.
- The setup check cannot hear the mic.
- Face detection finds no face.
- The Dev -> Metrics numbers are not real.
