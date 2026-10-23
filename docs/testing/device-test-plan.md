# Device test plan (the one place to look)

Everything that needs a real phone, in one list. Sessions add items here as they build; Ahmad ticks them and writes what happened.

## How this works

- **Ahmad:** tick a box when you've done it. Under an item, write what you saw on the `Notes:` line, especially when it's wrong. Paste exported data into `analysis_samples/` (that folder is gitignored, so personal recordings and transcripts never reach the public repo) and tell Claude the filename.
- **Sessions (Claude):** add an item under the feature's section when you build something that only a phone can confirm. Give a concrete action, the pass condition, and the data you want back. Don't tick boxes for Ahmad. When you fix something from a note, add "re-test" to the item.
- **Status tags:** `[ ]` not done, `[x]` done and fine, `[!]` done and something's wrong (say what in Notes).
- The old early-build checklist is in git history: `git show e248300:test.md`.

## Before any testing: make the builds

Not scheduled yet. When you're ready:

1. **iOS and Android build of 1.5.0** (`eas build`). Over-the-air updates can't carry these native changes: Dev → Metrics module (1.4.0), sign-in with Apple/Google and Plus purchases (1.5.0), and later the speech models.
2. Sections marked **needs build** below only work on that build.
3. The Tono AI parts also need the store and backend setup that's still open (Paid Apps Agreement, RevenueCat webhook, function secrets, the launch switch). Steps are in `supabase/README.md`.

---

## A. Recording audio and the prep timer (PR #12)

**Needs build:** no for the audio fixes (an over-the-air update onto a 1.3.0+ build works); yes for the Dynamic Island on a fresh install.

- [ ] **Speaker, not earpiece.** Line of the Day: record and play back 5 or more times in a row. Pass: every playback comes out of the loudspeaker, never the earpiece. Repeat in Move It and in a Rewind playback.
  Notes:
- [ ] **Recording sounds full, not phone-like.** Record a Line of the Day and listen back. Pass: no thin "phone call" sound.
  Notes:
- [ ] **AirPods.** Playback is full quality in the AirPods; recording still works (it uses the iPhone's mic). Also try wired headphones: recognition still works.
  Notes:
- [ ] **Impromptu after playback.** Play back a Line of the Day, then record an impromptu video. Pass: its audio is clean.
  Notes:
- [ ] **Spoken prompts** in drills and conversation still come out of the speaker.
  Notes:
- [ ] **Volume drills** (projection, pause) feel the same as before: the meter thresholds didn't shift.
  Notes:
- [ ] **Research timer.** Research a prompt, tap "Search the web". Pass: the Dynamic Island shows the countdown in Safari, and on the Lock Screen. Add time: the end moves. If nothing shows: Dev → Logs, look for `[prep]` lines, and check Settings → Tono → Live Activities.
  Notes:
- [ ] **Come back early.** No notification arrives while you're in the app at the deadline, and Notification Center is empty. Leave again: the alert still fires while you're away.
  Notes:
- [ ] **Stay away past the deadline.** The alert fires and the timer greys out. Coming back shows "Time's up", the timer is gone, the notification is cleared.
  Notes:
- [ ] **Kill the app mid-research**, then relaunch. Pass: no leftover timer.
  Notes:
- [ ] **Plain prep** of a minute or more shows a "Preparing" timer.
  Notes:
- [ ] **Android:** during research the ongoing notification shows "back by …" and no minute count.
  Notes:

## B. Playback and Library (PR #11)

- [ ] **Rewind player.** Play, pause, scrub while playing and while paused, back 10 s, and each speed (0.75×, 1×, 1.25×, 1.5×). Pass: no clicks when you jump, pitch stays natural at other speeds.
  Notes:
- [ ] **Tap a word.** Playback starts just before it and the highlight lands on it.
  Notes:
- [ ] **Auto-scroll feel.** It follows smoothly; scrolling by hand stops it; "Back to now" resumes it. Say how it feels.
  Notes:
- [ ] **Fades** at the top and bottom of the transcript look right in light and dark mode.
  Notes:
- [ ] **Scrubber smoothness.** It updates about ten times a second. Does it look steppy?
  Notes:
- [ ] **Impromptu Listen pass.** The new panel fits. On Android, no black video shows through.
  Notes:
- [ ] **VoiceOver and Reduce Motion.** The transcript reads as one block, the scrubber adjusts by 10 s with swipes, and with Reduce Motion the transcript jumps instead of scrolling smoothly.
  Notes:
- [ ] **Old vs new Rewinds.** A new Rewind follows along. An old one shows "Write it out again"; after that it follows along.
  Notes:
- [ ] **Library.** Rewind rows appear and open; long-press deletes. Try the Type and When filters. Search for a word you said, and for "monday".
  Notes:

## C. Dev metrics, path finale, notifications (PR #14)

**Needs build** for metrics (native module, never compiled on a real toolchain yet, so the first build is the real test).

- [ ] **Both builds compile** with the device-metrics module; Dev → Metrics shows non-zero memory and CPU.
  Notes:
- [ ] **Memory is right.** iPhone: compare the memory figure with Xcode's memory gauge. Android: compare with Android Studio's profiler.
  Notes:
- [ ] **Runs are recorded.** Run an ASR Lab engine and save a take. Pass: pipeline runs and their steps appear with sensible peaks; with the phone warm, thermal goes above nominal.
  Notes:
- [ ] **Overlay.** Turn it on: it sits under the Dynamic Island, blocks no taps, doesn't show over modal screens.
  Notes:
- [ ] **Android:** battery current reads non-zero (note which sign your phone uses); thermal headroom shows on Android 11+.
  Notes:
- [ ] **Path finale preview.** Dev → App tools → Preview the path finale. Pass: confetti plays (and doesn't under Reduce Motion), links open the browser, close works.
  Notes:
- [ ] **Real finale.** Finish a real last unit (or fake it with a test database). The unit card shows first, then the finale; Today's card changes to "Every lesson, done".
  Notes:
- [ ] **Notification copy.** Dev → "Send a test" still works. Look at the scheduled list for the new wording. Check: an evening reminder with a streak and nothing done yet, a reminder after 3+ days away, an event countdown, and a take finishing while the app is in the background (no score on the lock screen).
  Notes:
  Data to send back: screenshots of the lock screen for each notification, and anything that reads robotic, pushy or wrong.

## D. Signal capture: Voice Lab and tracker numbers (PR #15)

These produce the data that tunes the new pitch/volume/pause code in session 06. About 15 minutes.

- [ ] **Three takes.** Record three 45 to 60 second impromptu takes: one normal, one deliberately flat (monotone), one deliberately lively.
  Notes:
- [ ] **Voice Lab on each.** Dev → Pipeline → the take → Labs → Voice Lab. Tap Copy result and paste it into a file in `analysis_samples/`. Note the audio sample rate and channels shown in the file, and how long each tracker took.
  Data to send back: three result files, plus the timings.
  Notes:
- [ ] **Gain-control test.** One take: 5 seconds at normal level, 5 seconds as quiet as you can, 5 seconds loud, phone not moved. Export the JSON. Pass: a difference of 15 dB or more between the sections means no automatic gain.
  Data to send back: that JSON.
  Notes:
- [ ] **Face Lab frame rate.** Note the frame rate the Face Lab shows. (Decides whether 15 Hz or more blink detection is possible.)
  Notes:

## E. Tono AI: hosted comparison and costs (PR #13)

**Needs:** your own paid Gemini key for the comparison (use it only on your machine; never paste it into a chat or a file in the repo).

- [ ] **Hosted comparison (about 15 minutes).** Run the eval in `spikes/inference-eval/` against Gemini Flash-Lite and Flash. Pass bars: your Rewind transcript judged right every run (morning, midday and evening all covered); Word Chain links 90% or better with every broken link caught; coaching right on 4 of 5 takes.
  Data to send back: the results folder.
  Notes:
- [ ] **Deep review model pick.** Re-run Deep review on 4 or 5 takes with Flash-Lite versus Flash and compare.
  Notes:
- [ ] **Real token counts.** After a week of takes, check real usage against the 1.3 cents per 90-second review assumption.
  Notes:
- [ ] **Voice ear test.** Gemini text-to-speech voices versus the current system voice (optionally Kokoro). Pass: first audio in under 1 second, and a voice you'd tolerate for 5 minutes.
  Notes:
- [ ] **Conversation turn latency** over 20 turns. Pass: median under 2.5 seconds; otherwise try the Live API.
  Notes:
- [ ] **Turn-based playback** in the existing recording session, then the echo-cancellation spike (does the partner's voice leak into the recording?).
  Notes:
- [ ] **Sandbox purchase** of the 14-day trial. Pass: the server sees it as a trial and applies the trial limits. **Needs build** and the store setup above.
  Notes:
- [ ] *(Optional)* On-device LLM benchmark with llama.rn: load time, tokens per second, peak memory, heat over five calls, battery.
  Notes:
- [ ] *(Later, needs iOS 27)* Apple Private Cloud Compute model spike.
  Notes:

---

## Sections to be added by later sessions

Each new build session adds its own section here: 06 (signal capture), 07 (scoring and AnalysisService), 08 (trial, tiers, age range), 09 (waiting on analysis), 10 (exercise judging), 11 (impromptu results), 12 (conversation voice).
