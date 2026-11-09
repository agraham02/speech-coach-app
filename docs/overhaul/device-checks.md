# iPhone checks

Only the owner can run these. A phase stays open until its checks here have results. Tick each one and write what you saw.

The first three sections are carried over from the hotfix round (the old `hotfix-round-1.md`). They cover things the overhaul doesn't change, so they stay valid. The hotfix checks for screens the overhaul replaces (the Scores tab charts, Play from here, the Overview settling, the Path finale) were dropped, and their lasting parts are in the Phase 6 section.

## The one build (do this first, once)

This is the only build the rest of the overhaul needs (`DECISIONS.md`, D20). After it, every phase comes as an update.

- [x] **Make the build.** On this branch (`staging`, version 2.1.0), make the same kind of iPhone build you made last time. It has to be one that carries the Dev tab, so the `testflight` profile: `eas build --platform ios --profile testflight`, then submit it to TestFlight the way you did before. The first build after a native change is also the first time the new Swift file is compiled. If it fails, send me the error: it will be in `TonoLanguageModule.swift`.
- [x] **Install it and open Dev, then Native check.** It should say "This build has everything", with a tick on every row, including "Meaning check gives sensible answers" (dog closer to puppy than to thunder). Send me a screenshot or tell me which rows are red.
- [x] **Then send the code.** From now on: `npm run update:testflight -- --message "..."`. I'll tell you when there's something to send. Open the app twice to get it (it applies on the next cold start).
- [x] **If I ever say a change needs another build,** that's the `npm run check:native` guard firing. I'll say so before writing it.

## Before any phone testing: server setup (once)

- [x] Run `supabase/migrations/20261025000000_dev_override.sql` in the SQL editor.
- [x] Add the function secret `DEV_OVERRIDE_PASSWORD` (a long password only you know).
- [x] Supabase → Authentication → Sign In / Providers: turn **Allow anonymous sign-ins OFF**.
- [x] Deploy: `npx supabase functions deploy --use-api` (new: `dev-override`; changed: `ai-converse`, `ai-generate`, `me`, and everything that uses `requireUser`).
- [x] A new build (the app changed: new SignIn screen, birthday step).
- [ ] Republish the privacy and terms pages (`docs/privacy.md`, `docs/terms.md`): sign-in is now needed for Tono AI and Plus, and the privacy text no longer mentions anonymous accounts or an age range.

## Sign-in, birthday and Tono AI

- [ ] **Signed out, ask for Tono AI.** On a take's save screen turn on "Have Tono AI judge this take" (or tap "Get notes" on a Result): the sign-in sheet opens. With no birthday it asks for one first, then shows Apple/Google. After both, the sheet closes and the consent alert follows.
- [ ] **Under 18.** Enter a birthday under 18: the sheet says Tono AI is for 18 and over, shows no sign-in buttons, and Settings → Tono AI shows the under-18 note. Changing the birthday in Settings → Account & Plus re-opens it.
- [x] **No "anonymous" error any more.** Signed out, nothing tries to make an anonymous account. An old anonymous session on the phone is dropped at launch (you see "Not signed in").
- [ ] **A previous video.** Signed in, open an older take and run "Tono AI review" from its steps. It either completes or shows a specific reason. If it fails, copy the line from Dev → Logs (tag `[result]`/`[analysis]`) and send it: the error now carries Google's own message.
- [ ] **Plus.** Tap "See Tono Plus" → subscribe while signed out: the sign-in sheet opens first; closing it cancels quietly with no charge.
- [ ] **Live conversation** signed out: Start opens the sign-in sheet; after signing in the conversation starts (or says why not).
- [ ] **Free allowance follows the account.** Delete and reinstall, sign in again: the free judged take for the month is still used, not new.

## Developer password and the limits override

- [x] In a preview/TestFlight build, the Dev tab shows only a password box. A wrong password says "That's not the password." (after a 1.5 s wait). [I saw the that's not the password, but it still took me to the dev page]
- [x] The right password (signed in) opens the Dev tab. The "Tono AI limits" card says "Override on". Judged takes, text calls and conversation minutes now ignore their counts; Settings shows 999.
- [x] "Back to normal limits" returns the real counts and locks the Dev tab again. It also switches itself off after 6 hours.
- [ ] A phone with another account never sees the override.
- [x] Signed out, the Dev tab's Unlock opens the sign-in sheet first.

## Partner voices lab

- [ ] Dev → Partner voices → Play line. "Last play" shows `pieces N` (audio pieces that reached the phone). If you hear nothing:
  - `pieces 0` and an error line: send the error (it carries Google's message: a wrong model name, a refused setting, a quota).
  - `pieces N` but no sound: it is the phone's audio session. Switch "iPhone audio session" to "Playback only" and play again, and check the ringer switch and volume. Tell me which worked.
- [ ] Partner turn: a failure shows Google's reason. The conversation line also retries on the other model by itself, and a refused thinking setting is dropped and retried.

## Phase 0: bug fixes

Needs a new iPhone build (the keyboard library is native). Use a fresh install, or Settings, Reset app, for the first three.

- [ ] **The keyboard never covers a field (R2).** On each screen below, tap the lowest field. It must end up above the keyboard, with its button (Save, Continue, Start recording) above the keyboard too, and nothing jumping or flashing. The keyboard shouldn't flash on launch (if it does, set `preload={false}` on `KeyboardProvider` in `App.tsx`).
  - Onboarding: the name question, and the questions with text.
  - An event's before and after check-in (Today, "Your talk"): the long after page, down to "One thing to try next time".
  - Plan your point (Settings, Practice, then record a prompt).
  - Add a prompt (Library, Prompts, the plus button).
  - Debrief and Prime (from the event card).
  - Add your own text and Edit the marks (Library, Mark it up).
  - Phrasebook, Talk back and Three things.
  - The prep research box while recording with research on.
  Notes:
- [ ] **After-event check-in (R3).** After an event's date, the check-in asks "How did it go?" (five stops, Rough to Great) and, if you saved a focus, "Did you do your focus?". Save it; the Events list then shows a line like "Good · Did your focus".
  Notes:
- [x] **Filler words are yellow (R7).** Open a take's Transcript, in light and in dark appearance. Um and uh read as a highlighter yellow and the text on top is easy to read.
  Notes:
- [ ] **The skill check places your levels (0.5).** On a fresh install, do the whole skill check. On the Starting point screen, and then in You, Skill detail, all five skills show a starting level from the check (not the same default for each).
  Notes:
- [ ] **The judged-take toast (0.4).** Judge a take with Tono AI while on another screen: the toast reads "Judged by Tono AI, overall 7.4/10" with the real score, never 0.
  Notes:
- [ ] **Skill guide (0.6).** You, Skill detail, Confidence: "What feeds it" no longer lists warm-ups, and says they aren't scored.
  Notes:

## Phase 1: Signal Lab

Needs a **new iPhone build** (it has the keyboard library, version 2.0.0) with the Whisper model downloaded (the app's transcription model). It must be a dev build. Do these in a quiet room, with the phone held the way you hold it for a take.

1. Open **Dev, Labs, Signal Lab**. It should say "0 of 21 tests passed".
2. Run **Capture check** first (1 minute). It tells us the recording path works on your phone. If it fails, stop and send me what it says.
3. Run the **Voice** tests, then **Clarity**, then **Presence**. Each test shows its script and cues and counts you in. Read as written and don't skip steps; a test that goes wrong can just be run again. About 25 minutes in all, and you can do it over several sittings.
   - Voice: Pitch variety, Pitch glide, Endings, Volume gain, Volume and distance, Emphasis, Word stress, Pauses, Pace. For Volume and distance, keep the phone still and use arm's length, then half that.
   - Clarity: Fillers (say every um and uh aloud), Recognizer vs Whisper, Whisper speed.
   - Presence: Looking, Glances, Your preview, Expression, Face events. Look where each cue says.
4. The three **Content** tests are listed but blocked; they come with later phases.
5. When you're done, tap **Copy results as JSON** on the Signal Lab home and paste it to me in the chat. If a test felt wrong (you misread, the room was noisy), add a note on its result first.
6. Don't change anything under "Reading previews" yet; that is for after I've set the statuses.

What I do with it: set each reading's status, tune the formulas the data shows to be off, and close Phase 1.

Also, separately: the hosted judge eval (task 1.9) needs the server set up first (see the server setup section above).

**Done:** rounds 1 to 4 ran on an iPhone (iOS 26.6) on 2026-11-06. The results are in `DECISIONS.md` D7 to D11. A test's stored run can still show "Failed" on the phone if it ran on older code; the reading's status comes from `readingTrust.ts`, not from that. Rounds 2 to 4 below are kept as a record.

### Round 2

Round 1 is done. These re-run the tests whose code changed, and this time the raw recordings come too, so I can do the rest of the tuning on the computer. About 25 minutes, and you can split it up.

1. Get the new code onto the phone: `npx eas update --channel preview --message "Signal Lab round 2"`, then fully close and reopen the app twice. Or make a new preview build.
2. Dev, Labs, Signal Lab: turn **all the preview switches off**. They were all on in round 1. They don't affect the tests, but they count unproven readings in this phone's scores.
3. Do the **face check** if you haven't: real takes are scored through it, so the presence tests are now too.
4. Run: **Capture check**, **Pitch variety**, **Pitch glide**, **Endings**, **Emphasis**, **Word stress**, **Pauses**, **Pace**, **Recognizer vs Whisper**, **Looking**, **Your preview**, **Expression**, **Face events**. Skip Volume gain, Volume and distance, Fillers, Whisper speed and Glances.
   - Pitch glide: start the "ahhh" as soon as recording starts and hold it the whole time.
   - Pace: tap Start just as you begin reading, and Stop as you finish.
   - Looking: use real notes for the notes step, held where you would hold them for a talk.
5. **Copy results as JSON** and paste it to me.
6. **Share raw recordings** makes one file of about 30 MB. Get it onto the computer however is easiest (AirDrop isn't an option on Windows, so iCloud Drive, or Files and a cloud folder) and save it as `analysis_samples/tono-signal-lab-raw.tar`. It's your voice and face data, and that folder isn't committed.

### Round 3

Round 2 is done. This is a fresh recording of the tests whose formulas changed, because a formula tuned on a recording shouldn't be judged on it. About 17 minutes. Don't clear anything.

1. Get the new code onto the phone: `npx eas update --channel preview --message "Signal Lab round 3"`, then fully close and reopen the app twice.
2. **Redo the face check** (Settings, Coaching & AI, Face calibration). The saved one is from Oct 24 and saw much smaller eyebrow lifts than you make now. Hold the phone the way you hold it for a talk.
3. Run: **Pitch variety**, **Pitch glide**, **Endings**, **Emphasis**, **Pauses**, **Looking**, **Your preview**, **Glances**, **Expression**, **Face events**. Skip the rest.
   - Looking: use real notes again, and for the ceiling step, keep looking up for the whole step.
4. **Copy results as JSON** and paste it to me. Then **Share raw recordings** and replace `analysis_samples/tono-signal-lab-raw.tar`. Share only once every test is done.

### Round 4

A short fresh run of the three tests fixed after round 3. About 5 minutes. Don't clear anything, and don't redo the face check.

1. Get the new code onto the phone: `npx eas update --channel preview --message "Signal Lab round 4"`, then fully close and reopen the app twice.
2. Run: **Endings**, **Looking**, **Expression**. Skip the rest.
3. **Share raw recordings** and replace `analysis_samples/tono-signal-lab-raw.tar`. That's all I need; the JSON no longer has to be pasted, because the recordings rebuild it.

## Phase 2: log and sync

These need the microphone or camera, which the emulator doesn't have. Update the app first (`npx eas update --channel preview`, then close and reopen it twice). The first launch of 2.0.0 wipes your old data and starts at onboarding; copy anything you want first.

- [x] **First launch.** After the update, the app opens at onboarding, with no old recordings or lessons. Settings, Reset app still works.
- [x] **A drill from Practice ticks Today.** Open Today and note an unticked drill step. Go to Practice (or Library) and do that same drill. Back on Today, that step is ticked.
- [x] **A step from Today ticks the lesson.** Do the plan's first drill from Today. Open that lesson from Learn: the same step is ticked. Close the app, reopen, and it's still ticked.
- [ ] **A lesson finishes only when all its steps are done.** Finish every step of one lesson (from the lesson, the plan or Practice, over more than one day if you like). Only after the last step does the lesson show "Completed" and the path move on. Its score on the card is the average of the steps you actually scored.
- [ ] **A short plan still gets there.** On a 5-minute plan, do the plan on two days in a row. Day two shows a different practice step from day one, not the same one again.
- [ ] **Skip.** Skip a step on Today. It ticks, the lesson step does not.
- [ ] **A rep ticks once.** Record an impromptu rep from Practice. Today's rep step ticks; a second rep step (12-minute plan) stays open until you record a second one.
- [ ] **Delete a take.** Delete the rep you recorded. The step stays ticked, and the take is gone from the library.

## Phase 3a: scores on the tree

A new JS bundle is enough; no new build. Do a few real takes first, since the numbers below need your voice.

- [ ] **A take scores out of 100.** Record an impromptu take without Tono AI. The ring says out of 100, a word (Great, Solid, Getting there, Keep going) and "Delivery, measured on this phone". Message says "Not checked".
- [ ] **Do the numbers feel right?** On the Scores tab, tap down to the leaves. Each shows a raw number ("2.1 ums a minute"). Say which ones look wrong for how the take went. These are first guesses: Rhythm, Restarts, No detours, Specifics, Starting fast, Face movement.
- [ ] **Face movement.** It counts now. Do one take with a still face and one animated: do the scores differ the way you'd expect? Its bar of 12 brow lifts and smiles a minute is my guess.
- [ ] **Flat vs lively.** Do one flat take and one lively take. Pitch variety and Stand-out stress should clearly differ. The bars come from your Signal Lab recordings, so a real take is the fresh test.
- [ ] **A judged take.** With Tono AI, the ring says Overall, and Delivery stays the same as without a review. Only Answers the question, Has a shape and Ideas connect say Tono AI.
- [ ] **The trail.** Under the score, a line like "Ums and uhs +3.2 · Fillers +2.5 · Clarity +1.1 · Overall +0.4". Do a drill too: the same line sits on its result card.
- [ ] **Self-ratings.** Finish a guided exercise about delivery (Rate contrast): the toast says it doesn't move a score yet. Finish one about the inner game (Reset before you speak): the toast shows a trail.
- [ ] **New names.** Skills read Clarity, Voice, Message, Presence, Connection everywhere. Tell me if a screen still says Cadence or Articulation.

## Phase 3b: gates and the judge

**Server deploy:** done by the owner on 2026-11-08 (`npx supabase functions deploy --use-api`). Redo it after any change under `supabase/functions`.

- [ ] **A judged take.** Ask Tono AI to review a take. It comes back with Answers the question, Point first, Has a shape, Hits the beats, Ideas connect and Specifics, each with a level of 0 to 5 and a note. Nothing about pace, pitch or eye contact says Tono AI.
- [ ] **Do the levels ring true?** Compare them with how you'd rate the take. The wording of each level is mine (`supabase/functions/_shared/prompts/takeReview.ts`). Tell me where it's off.
- [ ] **Off-topic.** Answer a different question fluently. Answers the question should be low. If you recite something unrelated, it may say "We couldn't score this one".
- [ ] **A script take with a review.** You get coaching, and no Message score.
- [ ] **Wrong words.** On Pace reading, read something else: it says "Not scored" and why, the drill's difficulty stays put, and the step still ticks.
- [ ] **Babble.** On Sixty seconds, say "blah" for a while: "Not scored".
- [ ] **Chains.** With Tono AI on, a Word chain scores as usual. With it off or signed out, your phone checks each link ("Your phone checked each link") if Dev, Signal Lab, Content, Word links passed; if it didn't pass, the chain says "Not checked".
- [ ] **A very short take.** Record a few words and stop: "We couldn't score this one", no number, and the take is still in your Library.
- [ ] **A wrong script.** On a script take, read something else: the same message. Read the script: it scores.
- [ ] **Fair enough?** Tell me if a real attempt ever gets rejected. The 40% floor on Twister, Minimal pairs and Shadowing is my number, and the live recognizer is rough until 3b.3.

### Onboarding notes (D27)

- [ ] **Welcome:** the "Practice the hard parts" chips fade up, no bounce.
- [ ] **Video question** has two answers. Pick "Hide my face while I record", then start a take: the preview is hidden, and the eye button shows it again (and remembers).
- [ ] **No practice-place question.**
- [ ] **Transcription and Tono AI steps** read short; "See exactly what's sent" opens the full list.
- [ ] **Reminders:** "Yes, remind me", a time, Continue: iOS asks for notifications before the next step. (If you said no to notifications before, iOS won't ask again; it's in iPhone Settings.)

### Guided exercises with a mic (3c.1)

- [ ] **Do two or three**, for example Practice the blank, Catch the um and Rate contrast (Learn, a lesson, or Practice). Each speaking step has a Record button; at the end there is a short "Checking…" and a percentage with a line for each try ("Said it", "3 of 3 things named").
- [ ] **Does the number match what you did?** Say the lines wrongly or not at all and it should score low or say "Not scored". Do it well and it should be high. Tell me which exercises feel wrong; the cut-offs are first guesses.
- [ ] **The three that are still a rating** (Emphasis shift, Statement or question?, Same line, different feeling) say they stay a rating.

### Checkpoints (3b.6)

- [ ] **Finish a unit.** Learn, Your path: when every lesson of a unit is done, a "Checkpoints" section appears with that unit, "Take it" and "Skip for now". (Dev can mark lessons done faster than doing them all.)
- [ ] **Take one.** It starts a drill (or a one-minute talk). When you finish a drill and tap Done, a toast says "Checkpoint passed" or how far off you were. A miss keeps it open with "best 62 of 70 needed".
- [ ] **Skip for now** moves it to "Checkpoint skipped for now" and it is still there to take later. A passed one shows "Checkpoint passed · 81" under the unit and never reopens.
- [ ] **Does it feel fair?** Tell me if the rep chosen for a unit isn't the right test of what the unit taught.

### The small content check (3b.5)

- [ ] **Deploy it first.** Apply `supabase/migrations/20261109000000_small_checks.sql` in the Supabase SQL editor, then `npx supabase functions deploy --use-api`. Republish `docs/privacy.md` and `docs/terms.md` where they are hosted.
- [ ] **Word chain, signed in with no Plus.** Do a Word chain with Tono AI allowed. It says "Link by link" and Tono AI checked it (not "Your phone checked each link"). Settings, Account should show a check count if the screen has one; tell me if it doesn't.
- [ ] **Off-topic take on a phone that can't check.** If Signal Lab, Content, On topic did not pass on your phone, record an off-topic take: it should be called off-topic by the small check ("We couldn't score this one"). If it passed, the phone does it and the server is never asked.
- [ ] **Out of checks.** (Optional.) In Dev, set the limits override off and use the checks up: the next says you've used this month's checks and the drill still scores by counting.

### Drills read by Whisper (3b.3)

- [ ] **A drill, with the model on the phone.** Do Pace reading, Twister or Category sprint. After you finish there is a short "Checking…" (a few seconds), then the result. Tell me how long it felt.
- [ ] **Fillers.** On Sixty seconds say a few "um"s. They should show in the result's filler count (the old live recognizer dropped them).
- [ ] **Pause reading.** Hold a real pause at each mark: it counts them. Then read straight through and pause at other places: it should count none.
- [ ] **No model.** In Settings, Coaching & AI delete the transcription model, do a drill: it still scores, with "Quick check" on the result. Download the model again afterwards.
- [ ] **Word chain** still cuts into runs at each fresh word, and the links shown are your words.

### Meaning checks on the phone (3b.4)

- [ ] **Signal Lab, Content, Word links.** Run it (it takes a second). Tell me the result: how many broken links it caught, how many real ones it failed, and the cut it used. This decides whether Word chain can be checked without Tono AI.
- [ ] **Signal Lab, Content, On topic.** Same: send the result.
- [ ] **Category sprint.** On "animals", say a few animals and "table", "chair". The result should say "2 didn't fit" and not count them. Say real animals only: nothing is dropped.
- [ ] **Off-topic take.** Record a take whose prompt asks one thing and talk about something else for 30 seconds, with no Tono AI review. It should say "We couldn't score this one" and why. A real answer should always score.
- [ ] **Fair enough?** Tell me if a real answer is ever rejected as off-topic or a real link shown as "no clear connection".
