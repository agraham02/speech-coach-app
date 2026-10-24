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

These produce the data that tunes the new pitch/volume/pause code in session 06. About 15 minutes. Once session 06 (section F) is on the phone, the Voice Lab runs only the new tracker: do the Voice Lab item in F instead of the one here; the gain-control and Face Lab items still apply.

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

## Session 07: score layers and the AnalysisService

**Needs build:** no. Everything is JavaScript, so an over-the-air update onto a 1.5.0 build works. The Tono AI items need sign-in working (section E and `supabase/README.md`). No server change is needed: the app still sends its prompts through `ai-generate`.

- [ ] **A take judged from the words (the new default).** Signed in to Tono AI, Deep review on, record a 60 to 90 s impromptu take. Pass: the Result fills in with a judged score; Dev → Logs has no `[gemini] uploading` line for it; Dev → Pipeline → the take → artifacts shows `analysis` with `take_review` done and provenance `input: "text"` with a model name, and `cloud_usage` with input "measurements".
  Data to send back: Dev → Pipeline → the take → Copy analysis as JSON, into `analysis_samples/`.
  Notes:
- [ ] **The same take judged from the video.** Dev → App tools → "Judge from" → Video. Record a second take of the same prompt. Pass: the upload starts when you save (Logs: `[gemini] early upload … ready`), provenance says `input: "video"`, and Tone fit appears in Cadence marked "not in the total".
  Data to send back: the export, as above.
  Notes:
- [ ] **Text versus video, judged on the same takes** (decides decision 1 in `docs/decisions/scoring-taxonomy.md`). On 4 takes that still have their video (short, long, plenty of ums, a flat voice): Dev → Pipeline → the take → Re-run Deep review, once with "Judge from: Words and measurements" and once with "Video". Pass: the category scores land within about 1 point of each other, and the text one's notes aren't obviously worse. Say which notes you'd rather read.
  Data to send back: both exports per take.
  Notes:
- [ ] **The breakdown reads as one system.** Open a judged take's Overview. Pass:
  - the rows are Cadence, Impromptu and Confidence;
  - tapping one shows sub-scores, each labelled "Tono AI" or "measured on the phone";
  - the hero number sits between the lowest and the highest row;
  - the footnote gives the measured-only score.
  (The Scores tab now reads the same score sheets: section H.)
  Notes:
- [ ] **An unjudged take.** Turn Deep review off on the save screen, then record. Pass:
  - the hero score is the measured one, and the footnote says "Measured on this phone";
  - on a scripted reading's Result, "vs last session" compares only with earlier unjudged takes;
  - the coach card's caption reads "From measurements made on this phone."
  Notes:
- [ ] **Mastery moves with the score.** After a judged take, open Progress → a skill → Recent changes. Pass: the change for this take matches the direction of that skill's category score on the Result (a low Cadence doesn't raise Cadence).
  Notes:
- [ ] **Rewind notes on request.** Record a Rewind of a minute or more. Pass: no notes appear by themselves (Apple Intelligence no longer writes them); "Get notes from Tono AI" asks for consent once, then shows notes captioned "Written by Tono AI from your transcript, with every quote checked against your words. Not a score." (section G has the full Rewind checks)
  Notes:
- [ ] **Say it short and Mark it up.** Do one Say it short drill and mark one sentence in Mark it up. Pass: the summary card says "From your AI coach (Tono AI)"; the mark-up toast says "Marked by Tono AI"; with Tono AI signed out, Mark it up still marks (by the rules) and Say it short still scores.
  Notes:
- [ ] **A long take fits a text review.** Record a 3-minute take, judged from the words. Pass: the review finishes (no "MAX_TOKENS" or "missing parts" error in the step), in under about 30 s after the on-device steps.
  Data to send back: the step durations from Dev → Pipeline.
  Notes:
- [ ] **Offline.** Airplane mode on, record with Deep review on. Pass: the review step fails with a connection message, not a crash; turn the connection back on and it runs (the existing retry), and the score switches to judged.
  Notes:

---

## Delete means delete (session 13)

**Needs build:** a normal build; no native changes. Use made-up or throwaway takes. For the "gone from storage" checks, open Dev -> Tools (storage breakdown) before and after.

- [ ] **Delete a take, with undo.** Record a short spontaneous take and let it finish. In the Library, long-press it, choose "Delete take". Pass: the dialog says the video, audio, transcript, scores and notes are erased for good and your streak keeps the day. After confirming, a "Deleted / Undo" toast stays about 8 seconds. Tap Undo: the take comes back with its video, transcript and score. Delete it again and let the 8 seconds pass: it is gone from the Library.
  Notes:
- [ ] **Undo too late.** Delete a take, wait for the toast to go, and look for any way to bring it back. Pass: there is none. (Tapping Undo at the very last moment either restores it or says "Too late to undo that", never a half-state.)
  Notes:
- [ ] **Gone everywhere.** After deleting a take, check each place. Pass: it is absent from Library (also search by a word from its transcript, and the filters), Trends (session count, weekly averages, score chart), Progress (the skill's "what moved this number" list, the charts), the Result screen if opened from a notification, and the Dev tab's take list. Take a deep-reviewed take if you can.
  Notes:
- [ ] **Files really removed.** Note the Videos size in Dev -> Tools storage breakdown (and Settings -> Your data -> Storage). Delete a take of about a minute, wait 10 seconds, reopen the screen. Pass: the video size dropped by about that take's size. Do the same for a Rewind (the Rewind audio size). Then force-quit the app and relaunch: sizes unchanged, nothing reappears.
  Notes:
- [ ] **Delete one of each type.** Delete a spontaneous take, a Free recording, a script reading, a Feeling of the Week rep, a take done as part of the onboarding skill check, a take with a deep review, and a Rewind. Pass: each is gone and each deletion is undoable inside the window.
  Notes:
- [ ] **Streak keeps the day.** On a day where your only take is the one you will delete (use a day with a streak of 2 or more), delete it. Pass: the streak number does not drop, Home still says you've practiced today, and the daily goal does not go back to 0 of the day's practice. Nothing about the take shows anywhere (no score, no entry), only the day counts.
  Notes:
- [ ] **Killed during the undo window.** Delete a take and immediately force-quit the app (swipe it away) within 2 seconds. Relaunch. Pass: the take is gone (finished at launch), not restored. Repeat with putting the app in the background instead of killing it: gone when you come back.
  Notes:
- [ ] **Delete while it is still analysing.** Record a take and delete it from the Library while its steps are still running. Pass: it disappears; after a minute and a relaunch it has not come back, no toast announces a score for it, and the skill levels didn't move because of it.
  Notes:
- [ ] **No rewriting of past progress.** Note your skill levels, stages and speaker level. Delete a take that had moved a skill. Pass: the levels and stages stay exactly as they were. Do one more rep afterwards: the new movement starts from the same rating, and the deleted take does not appear in "what moved this number".
  Notes:
- [ ] **Two clear choices.** Open the delete choice on a take that still has its video. Pass: "Delete take" and "Free up space, keep the transcript and scores" are both there, and each confirmation says exactly what goes and what stays. Choose Free up space: the video is gone and the storage size drops, but the transcript, score, charts and Library entry remain, and the streak and totals still count it. Deep review is no longer offered. On a take whose video is already freed, only "Delete take" is offered. Same on a Rewind: "Free up space, keep the words and notes" removes the recording only.
  Notes:
- [ ] **Old-video cleanup stays the space-saving kind.** Settings -> Your data -> "Free up space from old videos" (set a short period first). Pass: old videos go, their takes stay with transcript and score, and each month's best and toughest take keep their video.
  Notes:
- [ ] **Exports don't outlive a take.** Export practice data (Settings -> Your data) and save/share the file, then delete a take. Pass: nothing to check inside the app, but note that the file you saved is a copy the app cannot reach: it still holds the take. (The app's own temporary copy is removed on delete.)
  Notes:
- [ ] **Uploaded video at Google.** Needs the Tono AI backend. Start a deep review and delete the take right away (while it uploads or after a failed review). Pass: in the Supabase dashboard, `public.uploads` has no row for it afterwards, and the Gemini file is gone (or expires within 48 hours). Send back the `ai_calls` row for that call: it should hold counts and cost only, no text.
  Notes:
- [ ] **Reset the app.** Settings -> Your data -> Reset app. Pass: Library, Trends and the streak are empty, storage sizes are near zero, onboarding starts.
  Notes:
- [ ] *(When a Plus backup exists)* Delete a take, then check the backed-up copy. Pass: it is gone from the backup too. Not testable yet: no backup is built (the server only has an empty `backups` table), and `takeDeletion.ts` carries a note to add this.
  Notes:

**Send back:** the storage sizes before and after (Dev -> Tools), and anything that reappeared after a relaunch.

## F. Signal capture: new pitch, loudness, pauses, face, storage (session 06)

**Needs build:** no. Everything here is JavaScript on native modules the app already has (react-native-worklets, react-native-compressor, MediaPipe), so an over-the-air update onto a 1.5.0 build is enough. The database moves to v33 on first launch; earlier takes lose their old pitch and volume numbers (expected, not converted). No ONNX models were added (the iOS link spike failed; see `docs/research/signal-capture.md`, section 16), so there's nothing native to check here.

Voice:

- [ ] **Analysis stays off the main thread.** Record a 60 s impromptu take and scroll the Result screen while it says it's measuring. Pass: scrolling stays smooth, and Dev → Logs has a `[dsp] features on the worklet runtime in … ms` line. If it says `on the JS thread`, the worklet runtime failed: send the `[dsp]` lines.
  Data to send back: the `[dsp]` line (time for the take's length).
  Notes:
- [ ] **Voice Lab on three takes** (replaces the old tracker comparison in D). Record 45 to 60 s takes: normal, deliberately flat, deliberately lively. Dev → Pipeline → the take → Labs → Voice Lab → Run, then Copy into a file in `analysis_samples/`. Pass: flat reads under 2.5 st (p10–p90), lively over 4.5 st, and the chart line follows what you did with gaps in the pauses. "Analysis, background runtime" should say how long it took off the main thread.
  Data to send back: the three result files. These set the pitch-range band (1 st = 0, 5 st = full marks for now).
  Notes:
- [ ] **A higher or lower voice.** If you can, have someone with a clearly higher (or lower) voice record one normal take and run the Voice Lab. Pass: their median is right (roughly 160 to 250 Hz for most women, 85 to 150 Hz for most men) and their range reads in the same 2 to 6 st span as yours for similar liveliness.
  Notes:
- [ ] **Personal pitch band.** After 5 or more takes with a pitch range, open a new take's Scores (Cadence → Pitch variety). Pass: the rule text says "a little over your usual …" with your typical range.
  Notes:
- [ ] **Pauses and breaths.** Read a paragraph aloud, pausing about a second at each full stop and taking an audible breath in some of the pauses. Export the take (Dev → Pipeline → Copy analysis as JSON). Pass: `pauses.pauses` has one entry per full stop you paused at (a breath doesn't split one in two), `pauses.breaths` counts roughly the breaths you took, and "Pauses at full stops" reads high.
  Data to send back: the export.
  Notes:
- [ ] **Loudness reads the voice, not the pausing.** Same paragraph twice: once flat and even, once stressing key words. Pass: `voice.loudness.syllablePeakSdDb` is clearly higher for the stressed read (about 1 dB or more apart).
  Notes:
- [ ] **Pace over the speaking span.** Take a 60 s take where you wait 5 s before starting. Pass: the wpm shown is your speaking pace, not pulled down by the silent start.
  Notes:

Fillers:

- [ ] **Two kinds, counted apart.** Record this as a take, naturally: "Um, so I was, like, thinking about it. I like this plan, and it looks like it could work. It was actually really hard, uh, but I actually disagree with them. You know, it's kind of a big deal. What kind of plan is that? I mean, we'll see." Pass: the transcript card's second line reads 2 um or uh, and 4 like, you know, actually (the filler "like", "actually really", "You know,", "I mean,"). Comparison "like", the verb "like" and the contrast "actually" are not highlighted, and "kind of" is counted as a hedge, not a filler. Whisper may drop or add commas, which changes the context fillers: note what it wrote.
  Data to send back: the transcript as Whisper wrote it, and the two counts.
  Notes:
- [ ] **Stutter mode unchanged.** With the speech difference set to stutter in your profile, a take with repeated words and ums. Pass: fluency isn't scored against you and the reviewer prompt has no filler or repeated-word lines (Dev → Logs), as before.
  Notes:

Face:

- [ ] **Detection rate while recording.** Record a 60 s take with the Dev → Metrics overlay on. Export it. Pass: `presence.detectionRateHz` is 15 or more and the recording itself stays at 30 fps (no stutter in playback). Also note how warm the phone gets and the thermal state in Dev → Metrics.
  Data to send back: the rate, thermal state, and whether a 3-minute take got hot.
  Notes:
- [ ] **Looking up, down and at the lens.** A 45 s take: talk to the lens, glance at the ceiling 5 times (about 1 s each), look down at the floor 5 times. Export it with Copy analysis as JSON (the export now has `presenceTimeline` as columns, one entry per detection). Pass: `presence.lookingUpPercent` and `lookingDownPercent` are both above 0, and eye contact roughly matches the time you were on the lens.
  Data to send back: the export. This is the data to tune the gaze cut-offs (`lookingUp` 0.25, `lookingDown` -0.35, `gazeMaxOffset` 0.35).
  Notes:
- [ ] **Head pitch and yaw signs.** Face Lab, Live: tip your chin down, then up; turn your head to your right, then left. Pass: write down which sign pitch and yaw take each way (needed before head direction can mean "looking down at notes").
  Notes:
- [ ] **Nods.** Nod clearly 5 times during a 30 s take. Pass: `presence.nodsPerMinute` is around 10, and a take with a still head reads near 0.
  Notes:
- [ ] **Expression without the jaw.** Two 30 s takes: one with a still face (talk normally, no smiling or brow movement), one animated (smile, raise your brows on key words). Pass: the still face reads under 15 expressiveness, the animated one over 30. If both are far lower or higher, send both numbers: the scale (`EXPRESSION_SCALE` 600) is a first setting.
  Data to send back: both expressiveness numbers.
  Notes:

Storage:

- [ ] **Analysed videos shrink to 720p.** Record a take, wait for analysis, then relaunch the app 10 minutes later (or leave it open for 10+ minutes). Pass: Dev → Logs has `[video] compressed X MB → Y MB` (roughly 115 MB → 15 MB a minute), the video still plays with sound, and Dev → Pipeline → Re-run voice analysis on that take gives about the same numbers as before.
  Data to send back: the sizes, and the numbers before and after the re-run.
  Notes:
- [ ] **Smaller deep-review upload.** Ask for a deep review on a new take. Pass: Dev → Logs has `[video] review copy X MB → Y MB in Z s` and the review arrives as usual. Note how long the copy took and whether the whole review felt faster.
  Data to send back: the log lines.
  Notes:
- [ ] **Rewind audio as AAC.** Record a Rewind. Pass: it plays back normally, tapping a word starts at that word (no lag of a tenth of a second or so), and "Write it out again" still works. Dev → Logs has `[rewind] audio kept as AAC` (not "kept as WAV"): about 0.25 MB a minute instead of 1.9. Try on Android too if you can (the encoder there is untested; if it fails the WAV is simply kept).
  Notes:

---

## G. Exercise judging: Word Chain, Bridge Chain, Rewind (session 10)

**Needs build:** a normal build, no native changes. Needs Tono AI signed in and allowed (items 1 to 9); items 10 to 13 are the signed-out and offline cases. The judge's accuracy is not measured yet: item 14 is the laptop run that measures it. Details of what is judged and how: `docs/decisions/exercise-judging.md`.

Word Chain and Bridge Chain (Practice, or Learn, Impromptu, "Keep the thread"):

- [ ] **Word Chain, sensible links.** Level 1, say 8 or more words that each follow from the one before (pen, ink, octopus, aquarium ...). Pass: a short "Checking your links..." (note the seconds, expected under 8), then a "Link by link" list with a green tick and a short reason on each link, a summary like "8 clear (target 8)", and "Checked by Tono AI from the words you said."
  Data to send back: seconds spent on "Checking your links...", a screenshot of the list.
  Notes:
- [ ] **Word Chain, deliberate nonsense.** Same, but put three unrelated words in the middle (for example "ink, octopus, carburetor, banana, salsa"). Pass: the unrelated ones are marked with a red cross and "didn't connect" in the summary, the sensible ones are not, and the score is lower than item 1's.
  Notes:
- [ ] **Word Chain, a stretch.** Say a link you could only explain with a story. Pass: it shows an amber minus and "a stretch", counted as half.
  Notes:
- [ ] **A fresh word.** Go quiet until the fresh word appears, then carry on. Pass: the first word after it is judged against the fresh word (the list shows it as the "from" word), and the summary says "1 fresh start".
  Notes:
- [ ] **Misheard words.** Speak quickly or with your natural accent and look at the list. Pass: the words in the list are what the phone heard; count how many red crosses come from a misheard word rather than a bad link.
  Data to send back: the list of links with the misheard ones marked.
  Notes:
- [ ] **The timer ending vs the Finish button.** Do one attempt where a fresh word appears and let the clock run out, and one where you press Finish. Pass: both show "You blanked once ... that recovery is the skill", and the fresh word itself is not counted as a link (this was a bug before).
  Notes:
- [ ] **Bridge Chain, real reasons.** Level 1: "ink, because a pen writes with ink. Octopus, because octopuses squirt ink. Aquarium, because octopuses live in aquariums." Pass: 3 green ticks showing your reason in quotes, "3 explained (target 3)".
  Notes:
- [ ] **Bridge Chain, empty "because".** Say "ink because, octopus because, river because, banana because" with nothing after each. Pass: red crosses marked "no reason", score 0%. Then "ink because they go together, octopus because it's related": amber, "vague", counted half.
  Notes:
- [ ] **Read both intros as someone new.** Open Word Chain's intro, then Bridge Chain's, without help. Pass: you can say in one sentence how they differ and how each is scored. If not, say which sentence lost you.
  Data to send back: your one-sentence answer.
  Notes:
- [ ] **Allowance.** After a day of drills, check how many Tono AI calls the chains used (Dev, Logs, lines starting `[analysis]`; Settings, account). Pass: one call per attempt (two only when the first answer failed the phone's checks).
  Data to send back: number of attempts and calls.
  Notes:
- [ ] **Offline.** Airplane mode, do a Word Chain. Pass: after the attempt ends it finishes within about 15 s, the result says "N words in a row (target T) · counted, not checked" and "Couldn't reach Tono AI, so your words were just counted.", no list, no crash, and the drill is still recorded.
  Notes:
- [ ] **Signed out.** Sign out, do a Bridge Chain. Pass: no sign-in or consent prompt appears during the drill; the result says "counted, not checked" and that Tono AI can check each link.
  Notes:
- [ ] **Own key (until session 08).** With an own-key provider chosen, tap "Get notes" on a Rewind. Pass: it says this one is Tono AI only and offers Settings; nothing is sent.
  Notes:

Rewind (End-of-day recall, then the result screen):

- [ ] **A full day.** Tell a real day with a morning, a working or busy middle, and an evening (a minute or more). Pass before asking for notes: "The day you covered" shows all three ticked (the phone's keywords). Then "Get notes from Tono AI": the hero adds "Read by Tono AI"; the Coverage note says all three parts came up; "Most vivid" is a moment you really said, in your words; the caption reads "Written by Tono AI from your transcript, with every quote checked against your words. Not a score."
  Data to send back: the transcript (paste into `analysis_samples/`), the notes shown, how many seconds the notes took.
  Notes:
- [ ] **Only the morning.** Record just your morning. Pass: Coverage says the midday and evening didn't come up; the hero shows one tick; no part is invented.
  Notes:
- [ ] **A thin Rewind.** Say a short, vague day ("I got up, went to work, came home"). Pass: Coverage says the parts only came up in passing, notes name something specific to add, and "Most vivid" is either a real line of yours or absent.
  Notes:
- [ ] **Checks that bite.** If notes ever show "didn't check out against what you said" instead of notes, that is the phone refusing an answer twice. Pass: this should be rare (under 1 in 10). If it happens, note it.
  Data to send back: the transcript and Dev, Logs lines for `[analysis]` around it.
  Notes:
- [ ] **The regression.** Rewind with the exact day from the session 10 prompt (read it aloud; your own transcript text will vary a little). Pass: Coverage says all three parts, hero all ticked, and "Most vivid" is a whole moment you said.
  Notes:

On the laptop (no phone):

- [ ] **Hosted eval of the new prompts** (about 15 minutes, under 50 cents, billed to your key; commands in `docs/decisions/exercise-judging.md` section 5). Pass: Rewind parts of the day right on all 6 cases including yours, every run; evidence quotes verbatim 95% or more; Word Chain links 90% or more with every broken link caught; Bridge Chain steps right 80% or more, `bridge_credit_vs_gold` not more than 10% above gold, and the "because" gaming case at 0 credit.
  Data to send back: the `--score` summary.
  Notes:

## I. Waiting on analysis (session 09)

**Needs build:** a normal build with the v35 migration (no native changes). Items marked (Plus) need Tono AI signed in and allowed. What was built and why: `docs/decisions/waiting-on-analysis.md`. Timings matter more than pass/fail here: the time estimates in the app are guesses for the text review until you send these back.

Take analysis (record any impromptu take, 1 to 2 minutes):

- [ ] **The status card.** Save a take and watch the top of the Result screen. Pass: a card reads "Step N of M: ..." with a bar of segments that fill in, and it disappears when everything is done; the numbers and coaching appear underneath as each step finishes.
  Data to send back: seconds from "Use this take" to the measured score, and (Plus) to the judged score; the take's length. Dev, Logs lines `[pipeline] ... done in`.
  Notes:
- [ ] **The time sentence is honest.** Pass: it never shows a countdown; it says "A few seconds", "Usually under half a minute" or similar; if a step runs well past it, it says "Taking longer than usual".
  Notes:
- [ ] **Leave while it works.** Save a take, then go back to Today at once. Pass: Today shows a "Your takes" row with the step it is on; it moves on by itself; when done it turns into "Ready. Tap to see what stood out." (and a toast); opening the result removes the row.
  Notes:
- [ ] **Two takes at once.** Save a take, leave, record and save another straight away. Pass: two rows on Today, each with its own step; neither stalls; both finish.
  Data to send back: time for each.
  Notes:
- [ ] **Background the app mid-analysis.** Save a take, then switch to another app for 10 seconds, then 60 seconds, then 3 minutes (separate takes). Pass: coming back, the take finishes (or shows a plain "didn't finish" with Try again) and nothing is stuck on a spinner. Note how far it got while away.
  Data to send back: which step it was on when you left, how far it got after 10 s, 60 s and 3 min, and whether a notification arrived.
  Notes:
- [ ] **Kill the app mid-analysis.** Save a take, swipe the app away while a step runs, reopen. Pass: it picks up (the card shows a running step again, or "didn't finish" with Try again if it was older than a day), and the take ends up fully analysed. Kill it three times in a row on the same take: after the third it should stop resuming by itself and show Try again.
  Notes:
- [ ] **Airplane mode, review (Plus).** Turn on airplane mode, save a take with the review on. Pass: the phone's numbers and coaching appear; the card says "No connection, so the review is waiting. It sends itself when you're back online." (no Try again button). Turn airplane mode off and bring the app to the front. Pass: within about 20 seconds the review is sent and lands, with the "ready" toast; it is not sent twice.
  Data to send back: seconds from reconnecting to the review landing.
  Notes:
- [ ] **A failed review that is not the network.** (Plus) Use up the allowance or sign out, save a take. Pass: the card shows the reason in a sentence and "Try again"; it does not retry by itself.
  Notes:
- [ ] **Airplane mode, everything else.** With airplane mode on, record and save a take without the review. Pass: all steps finish; no error.
  Notes:

Initial assessment (use Settings, Reset the app, then onboard; this erases the app's data):

- [ ] **The wait screen.** Finish the skill check's talk and "See your starting point". Pass: instead of a bare spinner, a card shows steps and a time sentence, with a line on what the numbers are; with the AI coach on, once the phone's steps are done a button "Continue without the AI coach" appears.
  Data to send back: seconds on the wait screen with and without the review; whether the review beat the 90 or 240 second limits.
  Notes:
- [ ] **Continue without it.** Tap "Continue without the AI coach". Pass: the starting point appears at once from the phone's measurements; later the AI read is on the talk in Library.
  Notes:
- [ ] **Kill during the wait.** Reset the app, get to the wait screen, swipe the app away, reopen. Pass: it goes straight back to the starting point (no "Start fresh?" question), the analysis finishes, and "Let's go" completes onboarding.
  Notes:
- [ ] **Backgrounding during the wait.** Switch away for a minute and come back. Pass: it carries on and finishes.
  Notes:

Rewind:

- [ ] **No wait after telling.** Tell a 2-minute Rewind and tap End. Pass: the result screen opens within a second or two, showing "Step 1 of 3 ... Step 3 of 3" while it works, then fills in.
  Data to send back: seconds from End to the transcript (about 35 expected).
  Notes:
- [ ] **Kill during "listening back".** Tell a Rewind, tap End, swipe the app away at once, reopen. Pass: the Rewind is processed again and ends up with its transcript and counts (not stuck on "listening back" for ever). If the audio could not be recovered it says so plainly and keeps what the phone heard live.
  Data to send back: what you saw and how long it took.
  Notes:
- [ ] **Notes carry on.** (Plus) Tap "Get notes", then go back to the Rewind list and return. Pass: still "Writing your notes" or the notes are there; no second request. Check Dev, Logs for a single `[analysis] rewind_notes`.
  Data to send back: seconds the notes took (and whether a second draft was needed).
  Notes:
- [ ] **Notes refused.** If notes ever show "didn't check out against what you said", pass if the message stays on the card with "Try again" (not only a toast that disappears).
  Notes:
- [ ] **Notes offline.** Airplane mode, "Get notes". Pass: a plain reason on the card and "Try again"; turning airplane mode off and tapping works.
  Notes:

Word and Bridge Chain:

- [ ] **Skip the check.** (Plus) Finish a chain attempt and watch the bottom. Pass: it says Tono AI is reading your links; if it takes 5 seconds or more, "Count them without the check" appears; tapping it ends the wait at once with "counted, not checked".
  Data to send back: how often you saw the button (normal checks should end in under 5 seconds).
  Notes:

---

## H. Impromptu results screens (session 11)

**Needs build:** no. JavaScript only, so an over-the-air update works. Use takes recorded after session 06 (they have the packed feature track); an older take's pitch and loudness charts say the voice analysis isn't available.

- [ ] **Overview and Scores agree.** Open a judged take, then an unjudged one (Deep review off). Pass: the Overview's "Your scores" card lists Cadence, Impromptu and Confidence with the sub-scores underneath ("Pace 7 · Pauses 5.5 ..."); "See every score" opens the Scores tab; every number on the Overview appears, with the same name and value, on the Scores tab; the hero number sits between the lowest and highest skill. The hero says "Judged by Tono AI" or "Measured on this phone", with no archetype.
  Data to send back: a screenshot of each tab for one judged and one unjudged take.
  Notes:
- [ ] **The layer switch.** On the judged take's Scores tab, switch between "Tono AI" and "This phone". Pass: each layer's overall and skill scores change, sub-scores say who gave them, and the other layer's skill score is shown small under the skill name.
  Notes:
- [ ] **Charts fit and line up.** On a 1 to 2 minute take, open the Scores tab. Pass: the pace chart (under Pace), the pitch chart (under Pitch variety) and the loudness chart (under Emphasis) each show the whole take with no sideways scrolling; their time axes (0:00, 0:30 ...) line up; every y-axis has labelled numbers and its unit is in the chart title.
  Data to send back: a screenshot with the three charts.
  Notes:
- [ ] **Pitch honesty.** Record one take speaking deliberately flat (monotone) and one lively. Pass: the flat take's line stays within about 2 semitones of the 0 line; the lively one reaches into the shaded band and beyond; gaps are real gaps (the line breaks), never a drop to the floor; the line under the chart says how much of your speaking had a readable pitch. If the lively take still looks flat, send both takes' exports: that is the tracker, not the chart.
  Data to send back: Dev → Pipeline → the take → export (the `signals` artifact), and screenshots.
  Notes:
- [ ] **Zoom and scrub.** On a chart: drag one finger sideways; double tap; pinch; drag with two fingers when zoomed; tap the minus, plus and "whole take" buttons. Pass: a vertical line marks the same moment on all three charts and the readout shows the time and value (for pitch, semitones and Hz); zooming one chart zooms all three; at the closest zoom about 8 seconds fill the width and the detail gets finer; scrolling the screen up and down with a finger over a chart still scrolls; nothing jumps or lags noticeably.
  Data to send back: a short screen recording and which gesture misbehaved, on which phone.
  Notes:
- [ ] **Play from here.** With the cursor on a chart, press "Play from here". Pass: the Overview opens, the video plays with sound within about a second of that moment.
  Notes:
- [ ] **No voice, no chart line.** Record 2 seconds of mostly silence. Pass: the pitch chart says there isn't enough clear voice instead of drawing a line.
  Notes:
- [ ] **Transcript marks.** Open the Transcript tab of a take with ums and a "like". Pass: um/uh and like/you know/actually are highlighted in two colours and the counts match what you hear; there are no other highlights until you turn on "Tono AI's notes" (shown only on a judged take that has some). With it on, every highlighted phrase is something you actually said, the label (Structure, On the point, Repeated idea) fits it, and tapping shows the note headed with who wrote it.
  Data to send back: for 3 judged takes, how many AI notes appeared (0 to 6) and how many made sense.
  Notes:
- [ ] **Library and Trends.** Pass: judged takes in the Library say "Judged by Tono AI" on their row; a month's average says "· Tono AI" when it averages judged takes; Progress → Score trends draws the judged and measured lines separately, with a gap (not a zero) in the judged line for unjudged takes.
  Notes:
- [ ] **Dark mode, large text, a small phone.** Open the Scores tab in dark mode, at the largest text size, on the smallest phone you have. Pass: chart labels are readable, nothing overlaps, the zoom buttons are easy to hit.
  Notes:

---

## J. Tiers, the trial, the optional account and the age question (session 08)

**Needs build** (a new version: the sign-in and purchase native code), plus the backend steps in `supabase/README.md`: migration `20261023000000_tiers_and_trial.sql`, functions deployed, **anonymous sign-ins and manual linking turned on** in Supabase, the free introductory offer (2 weeks) on both products in App Store Connect, and `plusPurchasable` on while you test purchases. Use a fresh install, or Settings → Your data → Reset app, before each part. For the sandbox parts, sign in to a Sandbox Apple Account on the iPhone (Settings → Developer, or the App Store's sandbox sign-in).

The free path (no account, nothing bought):

- [ ] **Onboarding to a first take with Tono AI skipped.** Answer the age question with an adult range, tap **Not now** on "Meet Tono AI, your coach", finish, record a 30 s take, save it with the switch off.
  Pass: no sign-in screen anywhere; the save screen switch reads "Have Tono AI judge this take" and is off; the result shows the measured score, the breakdown, the coach card and one quiet line "Measured on this phone. Tono AI would judge..." with at most a small "See Tono Plus" button (only when Plus is on sale). Nothing looks broken or empty.
  Data to send back: screenshots of the save screen and the result, and whether anything read as a dead end or nagging.
  Notes:
- [ ] **No account is made by the free path.** After the take above, open Settings → Account & Plus.
  Pass: "Sign in (optional)" with Apple and Google, no account line, no Delete account. In Supabase, Authentication → Users has no new user from this phone.
  Data to send back: the Users count before and after.
  Notes:
- [ ] **Exercises without Plus.** Do a Rewind and a Word Chain.
  Pass: the Rewind result shows the counts and a calm "Notes on what you said come with Tono Plus" card (no error, no spinner); Word Chain shows the counted result with "With Tono Plus, Tono AI checks that each link makes sense"; Mark it up still marks a text (the rules).
  Notes:

The free judged take (one a month):

- [ ] **Allow Tono AI and use the free judged take.** In Settings → Tono AI tap **Allow Tono AI** (or allow it on a save screen), then record and save a take with the switch on.
  Pass: the save screen says "Uses your free judged take for this month."; the take is judged (the Scores tab fills, the label says Tono AI from your words and your phone's measurements); Supabase now has one anonymous user, and `ai_calls` has one row with kind `take` and tier `free` (or `beta` in beta mode).
  Data to send back: the `ai_calls` row (kind, tier, model, input/output tokens, cost_usd) and the time from save to judged.
  Notes:
- [ ] **When it's used up.** Record a second take in the same month (launch mode, so the free tier applies).
  Pass: the save screen switch is off and says "You've used this month's free judged take. The next one comes on 1 <next month>." Turning it on shows one alert with "See Tono Plus" (or just the explanation when Plus isn't on sale). The take is measured as normal.
  Notes:
- [ ] **The monthly count is a server setting.** In the SQL editor set `limits.freeMonthlyJudgedTakes` to 2, wait 30 s, reopen the app.
  Pass: the second take can now be judged, with no app update. Set it back to 1.
  Notes:
- [ ] **One take, one count with the video setting.** Dev → App tools → Judge from → Video. Judge one take.
  Pass: it counts as one judged take (one `ai_calls` row, kind `take`), the request carries the phone transcript (the judged notes quote the on-device words, including any "um"), and the output tokens are well under the old video reviews (about 2,000 to 3,500 before).
  Data to send back: that row's tokens and cost, next to a text-judged take's.
  Notes:

The trial and Plus (sandbox):

- [ ] **Paywall without signing in.** Settings → Account & Plus → Tono Plus.
  Pass: both plans show "14 days free, then $49.99 a year" / "14 days free, then $4.99 a month", the button reads "Start 14-day free trial", the notice under it names the trial length, the price after it and when the first charge is, and Restore, Terms and Privacy are there. No sign-in prompt.
  Data to send back: a screenshot (it doubles as the App Store review screenshot).
  Notes:
- [ ] **Start the trial on the yearly plan.** Buy with the sandbox account.
  Pass: "Your free trial has started."; the consent alert follows if Tono AI wasn't allowed; Account & Plus shows "20 of 20 judged takes left in your trial · free until <date>". In Supabase: `entitlements.plan` = `trial`, `environment` = `sandbox`, `period_started_at` set; the RevenueCat customer id is the anonymous user's id.
  Data to send back: the `entitlements` row and the RevenueCat customer page (id, period type).
  Notes:
- [ ] **The trial ends and renews.** Sandbox shortens 2 weeks to a few minutes. Wait for the renewal, then reopen the app.
  Pass: `entitlements.plan` turns to `plus`, Account & Plus shows "60 of 60 judged takes left this month" (judged takes from the trial don't carry over), and the RevenueCat webhook delivered events with 200.
  Notes:
- [ ] **No second trial.** Cancel in iOS Settings → Subscriptions (sandbox), let it lapse, then open the paywall again.
  Pass: no trial line; the buttons read "Subscribe for $49.99 / year" and "$4.99 a month"; the monthly plan doesn't offer a trial either (one trial per subscription group).
  Notes:
- [ ] **Reinstall and restore.** With an active sandbox subscription, delete the app, reinstall, skip onboarding questions quickly, and tap Restore purchases.
  Pass: Plus comes back on a new anonymous account (RevenueCat transfers it); the old anonymous account has no entitlement afterwards. No new trial is offered.
  Data to send back: what Restore said, and the two users' `entitlements` rows.
  Notes:
- [ ] **Exercise judging with the trial.** During a trial, ask for Rewind notes and judge a Word Chain.
  Pass: both are judged; `ai_calls` rows have kind `text` (they don't use judged takes).
  Notes:

The optional account:

- [ ] **Link Apple to the anonymous account.** After the free judged take (so an anonymous account exists), Settings → Account & Plus → Sign in with Apple.
  Pass: the account line shows your Apple email or "Signed in with Apple"; Supabase shows the same user id now with an Apple identity (not a second user); the allowance didn't reset.
  Notes:
- [ ] **Apple ID already used on another phone.** On a second phone (or after Reset app), make an anonymous account (allow Tono AI and judge a take), then sign in with the same Apple ID.
  Pass: the phone switches to the existing account (its plan and allowance show) rather than failing.
  Notes:
- [ ] **Google linking** the same way (browser sheet).
  Notes:
- [ ] **Delete account** from an anonymous account and from a linked one.
  Pass: both delete (Supabase user gone, RevenueCat customer gone), the phone keeps its takes, and Tono AI asks for consent again next time.
  Notes:

Bring-your-own-key is gone:

- [ ] **A tester phone that had a key.** Update a phone that had a Gemini or other key saved.
  Pass: no key fields anywhere in Settings or onboarding; the key is gone from the keychain (Dev export or a debugger shows no `geminiApiKey`/`openaiApiKey`); no message about it.
  Notes:

The age question:

- [ ] **Under 18.** Reset app, answer "13 to 17".
  Pass: the Tono AI onboarding step says "Everything stays on your phone" with only Continue; the save screen has no Tono AI switch; Settings → Tono AI explains it is for 18 and over; the paywall says Plus is Tono AI, 18 and over; Rewind and Word Chain show their counts with no upsell; nothing is sent (no Supabase user is made).
  Notes:
- [ ] **Prefer not to say, and skipping.** Reset app, skip the age question once and choose "Prefer not to say" once.
  Pass: Tono AI is offered as for an adult (an unanswered question never blocks).
  Notes:
- [ ] **The server switch for minors.** With "13 to 17" set, flip `minorsMayUseAi` to true in the config row, wait 30 s and reopen.
  Pass: Tono AI is offered again with no app update. Set it back.
  Notes:

On the laptop:

- [ ] **Text-model candidate.** After the hosted eval, if Gemini 3.1 Flash-Lite judges as well, set `models.text.candidate.rolloutPercent` to 10 and compare a week of `ai_calls` cost and the judged notes.
  Data to send back: average cost per `take` and per `text` call, by model.
  Notes:

---

## Sections to be added by later sessions

Each new build session adds its own section here: 12 (conversation voice). Session 08 is section J, session 09 section I, session 11 section H.
