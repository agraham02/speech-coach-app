# iPhone test checklist (temporary)

Build: `eas build --profile preview --platform ios`. Tick a box when you've tested it. Under each item, write what you saw if it's wrong — "Notes:" lines are for me to read and fix.

This build has a **Dev** tab (bug icon). If anything fails or looks odd: Dev → **Share logs** and send them to me, together with your note.

---

## 0. First launch
- [ ] App opens to **Today** with 4 tabs + Dev (Today, Learn, Library, You, Dev)
  Notes:
- [ ] Mic, speech recognition and camera permission prompts appear when first needed and the app works after you tap Allow (no "denied" state right after granting)
  Notes:
- [ ] Settings → **On-device AI** shows the Apple on-device model as available (Apple Intelligence is on)
  Notes:

## 1. Tongue twisters (original bug #1)
Open Learn → Articulation → a lesson with a twister, or Practice something else → Tongue-Twister Drills.
- [ ] Tap Start: it starts listening right away, no "manual timing" fallback
  Notes:
- [ ] Say a twister correctly: every word highlights as you say it, and the result scores high
  Notes:
- [ ] Say "bed" instead of "bread" in "Fred fed Ted bread": highlighting keeps moving after the miss, and the result says what the mic heard instead
  Notes:
- [ ] Stay silent ~5 s mid-attempt, then continue: it keeps listening and still follows you
  Notes:
- [ ] Multi-rep twister: take breaths between reps; the "Rep 2 of 3" counter advances
  Notes:
- [ ] Stop right after the last word: that last word counts
  Notes:
- [ ] Double-tap Finish: you get one result, not two
  Notes:
- [ ] Airplane mode on: drill still works
  Notes:

## 2. Other drills (Learn → any lesson → Start on the drill row)
- [ ] **Pace reading**: the words/min tile updates live while you read, and the target band feels right for you
  Notes:
- [ ] **Minimal pairs** (S and SH, R and L, TH): scoring reflects what you actually said
  Notes:
- [ ] **Category / letter sprint, Just a Minute, Random-word story**: each starts, counts, and shows a result
  Notes:
- [ ] **Shadowing**: the line plays, you repeat it, you get a score
  Notes:
- [ ] A drill where the mic hears nothing says "Didn't catch anything" instead of showing 0%
  Notes:
- [ ] Difficulty feels about right after a few tries (should succeed ~4 of 5). Which drill feels too easy / too hard?
  Notes:

## 3. Warm-ups and guided exercises
- [ ] **Calming sigh**: 5 rounds (about 50 s), "Round 1 of 5" label, circle grows on "Breathe in", tops up on "Sip in more" and shrinks on "Long breath out", a light tap at each phase
  Notes:
- [ ] Calming sigh: Skip works, and ✕ exits without saving
  Notes:
- [ ] **Other warm-ups** (Wake up the articulators, Hum and siren): timed steps run and finish
  Notes:
- [ ] **Guided exercise** (e.g. Reframe it): one step at a time with a progress bar, Back / Next work, "I've done it" leads to the 1–5 rating, Done is disabled until you rate
  Notes:
- [ ] The step text is easy to read and the buttons are easy to reach with one thumb
  Notes:

## 4. Daily plan (Today tab)
- [ ] The plan card shows a lesson with its steps and total minutes; **Continue** starts the next undone step
  Notes:
- [ ] Finishing a step returns to the plan with that step ticked
  Notes:
- [ ] The whole plan fits your 5–10 minutes
  Notes:
- [ ] Skill rings and the streak update after you practice
  Notes:

## 5. Recording an impromptu rep
- [ ] Front camera preview works; warm-up/prep appear when expected, and are skipped when launched from a lesson
  Notes:
- [ ] **Restart** button while recording discards the take and resets cleanly
  Notes:
- [ ] After stopping: Preview offers **Retake** (same prompt comes back) and **Save**
  Notes:
- [ ] Swiping back from Preview asks before discarding
  Notes:
- [ ] Save goes straight to Result with progress shown
  Notes:

## 6. Result screen (after saving a take)
- [ ] The analysis steps list shows each step moving to done: transcript, audio metrics, presence, coach
  Notes:
- [ ] **Transcript** is readable; "um"/"uh" fillers are counted (note if you said some and it shows none)
  Notes:
- [ ] **Pace, pauses, pitch/volume** look believable for what you did
  Notes:
- [ ] **Eye contact %** is sensible (look at the lens vs look away); with your face out of frame it shows the "Face in frame" tip, not "0% eye contact"
  Notes:
- [ ] **Coach card**: a structured tip and a follow-up question. **Answer it** starts a new rep with that question
  Notes:
- [ ] Turn Apple Intelligence off in iOS Settings, redo: the coach falls back to the simple rule-based one without errors
  Notes:
- [ ] **Practice this prompt again** works, and the second result shows the **"Since your last take"** comparison card
  Notes:
- [ ] Force-quit the app during analysis, reopen: it resumes, or shows "Interrupted" with Retry
  Notes:
- [ ] Retry on a failed step works and the error text is readable
  Notes:

## 7. Three-pass review
- [ ] Pass 1 plays the video muted, pass 2 audio only (with live transcript), pass 3 both
  Notes:
- [ ] Speed buttons (1× / 1.25× / 1.5×) work
  Notes:
- [ ] Completed passes are remembered after leaving the screen and coming back
  Notes:

## 8. Deep review (optional cloud, Gemini)
- [ ] Settings → Cloud: paste your Gemini key; it stays saved after you leave and return
  Notes:
- [ ] On a saved take: **Get deep review** works, scores appear, and pace/pitch/words from the on-device analysis are unchanged
  Notes:
- [ ] Without a key, nothing tries to call Gemini and the take still completes
  Notes:

## 9. Library, You (Progress and Settings)
- [ ] **Library**: recordings open to Result, script titles show (not "Unknown prompt"), video thumbnails/playback work
  Notes:
- [ ] **You → See all progress**: skill mastery, streak calendar (frozen days marked), charts, and "This week vs last week" render sensibly; the back button returns to You
  Notes:
- [ ] **You → Settings**: each row (Practice, Goal & reminders, Coaching & AI, Deep reviews, Help & data) opens its section; the hour dropdowns float without moving rows and keep session 2 after session 1
  Notes:
- [ ] **Settings → Help & data**: Export opens the iOS share sheet with a `.db` file you can save to Files
  Notes:
- [ ] Settings → Help & data: video storage size shown; "Delete videos older than 30 days" asks to confirm
  Notes:
- [ ] Old videos from earlier builds still play (only if you had sessions before)
  Notes:

## 10. Appearance
- [ ] Light mode: all screens readable, nothing white-on-white or black-on-black
  Notes:
- [ ] Dark mode: same
  Notes:
- [ ] Camera/recording screens stay dark in both modes
  Notes:
- [ ] Switch system light/dark from Control Center **while the app is open**: every screen should change colour immediately, in place (no reload, you stay on the same screen). Check Today, Learn, Library, You, Progress, a Result, Settings, a running drill, and the tab bar
  Notes:
- [ ] Switch it while a **modal** (Settings) or an **alert** is open, and again while a drill is listening: nothing should crash or lose state
  Notes:
- [ ] Alerts, keyboard and navigation bars match the app's theme
  Notes:

## 11. Dev tools (this build only)
- [ ] Dev tab opens; **Share logs** produces a text file
  Notes:
- [ ] Dev → **ASR Lab**: run it on a clip containing a few "um"s. Write down the result per engine (time, words, fillers kept)
  Notes:

## 11b. You tab: Rewind, Three things, Talk back, Phrasebook, streak freezes (iPhone)
- [ ] **Rewind**: tell a real day for 1-2 minutes. The waveform follows your voice smoothly and is big and centered; End unlocks at 1:00; it stops itself at 2:00
  Notes:
- [ ] Rewind result: parts of the day, details counted, transcript and **Listen back** match what you said (check a take where the recognizer restarted: no gap in the transcript or the audio)
  Notes:
- [ ] Rewind notes: on an iPhone with Apple Intelligence, notes appear (specificity, storytelling, flow, coverage, a quoted detail, one thing to try) and there is no score anywhere
  Notes:
- [ ] The 9 PM Rewind reminder arrives, and tapping it opens Rewind, also when the app was closed. After telling your day it doesn't fire again that night
  Notes:
- [ ] **Three things**: add one; a close repeat shows the warning; "Say it to yourself" ticks off by itself when you read the sentence aloud
  Notes:
- [ ] **Talk back**: pick a worry from onboarding (You, Settings, Practice, profile), then run the 6 steps; the "doesn't fit" step shows your own practice
  Notes:
- [ ] **Phrasebook**: add, remove with undo, and "Say N aloud" reads the phrase in Line Rep
  Notes:
- [ ] **Streak freeze**: skip a day after 7 practice days; the streak survives and a message says a freeze was used
  Notes:
- [ ] iOS native tab bar shows Today, Learn, Library, You, Dev, with the right icons
  Notes:

## 12. General feel
- [ ] Anything that felt slow, confusing, ugly, or too wordy?
  Notes:
- [ ] Anything you expected to find and couldn't?
  Notes:
- [ ] Any crash? (Share logs right after)
  Notes:
