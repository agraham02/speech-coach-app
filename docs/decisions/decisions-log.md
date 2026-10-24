# Decisions log

What Ahmad decided, with the reason, so later sessions don't re-open it. Newest first. The research behind these is in `inference-strategy.md` and `../research/signal-capture.md`.

## 2026-10-24: answers after sessions 06, 07 and 13 merged

### What the AI judges from

- **Tono AI judges from the phone's transcript and measurements by default.** One text call, about 0.35 cents a take, instead of sending the video. Video judging stays as a Dev setting. Quality of the two is compared later on real takes (device test plan), not argued now.
- **Privacy rule change.** Measurements (pitch, loudness, pauses, face) feed the scores, and the phone's transcript is sent to the AI for text judging. For video reviews too: stop asking the cloud model to transcribe, because the on-device whisper.rn transcript is good now. Session 08 does this; it also saves output tokens.
- **An AI-judged take counts as one of the monthly judged takes** (one take, one count). Session 08 fixes the wording on the save screen.

### Scoring

- **Skill weights: Cadence 30, Impromptu 45, Confidence 25.**
- **Contextual fillers (like, actually) count at half weight** and are shown separately from um and uh. "Kind of" and "sort of" are hedges only, not fillers.
- **Tone fit and Body language are shown but not totalled** into the skill scores.
- **Fluency uses the phone's filler count**, not the AI's.
- **Pitch range is scored from 8 voiced seconds and flagged low confidence under 20.** Under 8 there is no score. Face thresholds (expressiveness scale 600, looking-up cutoff 0.25) are first guesses, to be tuned from the Face Lab checks.

### Models and deferred signals

- **Native pitch and voice models (Silero, SwiftF0): wait.** ONNX Runtime and MediaPipe clash on iOS (824 shared symbols). Wait for the Voice Lab data, then convert to Core ML if a model is still needed.
- **Deferred for now:** vocal fry, blink rate at the new detection rate, posture, gestures and sound events.

### Storage and delete

- **Analysed takes shrink to 720p ten minutes after analysis.** Quiet re-measuring runs at launch, 3 takes per launch.
- **`deleted_at` stays as the pending-erase flag.** A deleted Rewind does not block tonight's Rewind prompt, but a deleted take still counts as practiced today. Remote delete is best effort, with no retry.

### Business and housekeeping

- **The free trial applies to both plans** (settles the open point under the 14-day trial below).
- **Minors and Gemini terms:** session 08 reads the current terms text and proposes what to do. Unchanged from before.
- **`react-native-gesture-handler` is kept.** The `tono-models` folder was deleted by Ahmad.

## 2026-10-23: after the first round of research (sessions 01 to 05)

### Architecture and business

- **Hybrid: the phone measures, the server judges.** Recording, transcription (whisper.rn), pitch, volume, pauses and face tracking stay on the phone and stay free, no account. Plus users get Tono AI judging on the Supabase backend (scores, coaching, Rewind and Word Chain judging, mark-up, insights, conversation partner), with prompts held on the server. No on-device LLM judge for now; Apple Intelligence is no longer used for judging.
- **Price: keep $4.99 a month and $49.99 a year.** The goal is to run as close to zero profit as possible, leaving room for inflation and future price increases. Do not raise to $6.99. Because the phone now produces better measurements, the server may not need to analyse the video at all: look for cheaper text-only models, and re-cost the plan on that basis.
- **Free trial: 14 days** (replaces the 5 free reviews). Assumed to apply to both plans; confirm in session 08.
- **Remove bring-your-own-key** entirely. Testers' stored keys get deleted on update. Only Tono AI.
- **Sign-in stays optional.** Free use needs no account. An anonymous Supabase account linked to RevenueCat behind the scenes, so purchases work without forced registration.
- **Age:** ask the user's age range in onboarding. Ahmad's understanding is that people under 18 can use Gemini (Google promotes it to students). Session 04 read the Gemini *API* terms as requiring 18 or older for apps built on it. Session 08 must check the current terms text and decide what to do with minors; don't block anyone on the strength of either claim until that's read.
- **Free taste of AI: one judged take a month** for free users outside the trial (decided 2026-10-23). Costs about 1.3 cents per take. Session 08 builds it as a server setting so the count can change without an app update.

### Signals (from the signal-capture research)

- **New pitch tracker now** (dense YIN in pure TypeScript), and **also build the small native model component now**: Silero VAD for pauses and SwiftF0 for pitch, through an ONNX runtime. Spike the iOS link first (MediaPipe linker history says expect trouble), and ship the model only where the Voice Lab comparison shows a clear win.
- **Pitch range scoring:** fixed band in semitones at first, personal baseline after 5 or more takes. Must be implemented properly: tests, calibration against the Voice Lab data, and a version bump on the score breakdown.
- **Video:** shrink stored video to 720p once a take has been analysed, and upload a smaller copy for deep reviews. Both yes.
- **Face detection at 15 frames a second or more**, battery cost accepted.
- **Shaky voice is dropped as a goal** (jitter, shimmer, tremor, and the held-vowel check).
- **"Like" and "actually" count as fillers, but as a different kind of filler** from the traditional ones (um, uh), because they depend on context. Show them separately.
- **Deleting a recording deletes everything about it** (decided 2026-10-23): video, audio, transcript, numbers, and its rating history. Nothing is kept. Already-computed curriculum state is not recalculated, but a deleted take must not count in anything computed afterwards. Built in session 13: a delete hides the take at once (`deleted_at` is now only the undo-window mark), and the erase (rows, `skill_events`, the video file, the uploaded copy at Google) runs when the 8 seconds pass, when the app goes to the background, or at launch (`src/services/data/takeDeletion.ts`). The 30-day purge is gone. The bare date marker is the `practice_days` table.
- **Two delete choices** (decided 2026-10-23): delete the whole take (everything goes), or delete just the video/audio to free up space (transcript and numbers stay). Plain Delete always means the whole take; the space-saving one is named so it can't be mistaken for it.
- **Hard delete with an 8-second undo, and the streak keeps a bare date marker** (decided 2026-10-23). A delete is not a soft delete: the row and everything in it go, after a short undo window (finished at next launch if the app is killed during it). Soft delete bought nothing here (no restore path exists, no sync) and caused the `skill_events` leak. Because the streak measures showing up, deleting a take never breaks it: one marker per practiced day, the local date only, with no link to the take.
- **No backwards compatibility** (decided 2026-10-23). The app isn't released, so don't convert old data, label old numbers, offer re-runs for old takes, or message testers about changes. Change formats and schemas directly; my own test data can be wiped.
- **No audio-only copy of deleted takes** (decided 2026-10-23). Deleting a video deletes its audio with it, by hand or by the retention cleanup. The app already keeps each month's best and toughest take as keepsakes (`src/domain/videoKeepsakes.ts`); those keep their video and audio and are the takes that can be re-analysed when the algorithms improve. Every other take keeps its transcript, its numbers and the small feature track.

### Small decisions, accepted as built

- The prep Dynamic Island timer keeps running when you come back; only the notification is cancelled.
- AirPods: recording uses the iPhone's mic, playback is full quality.
- Recording keeps its no-auto-gain "measurement" mode.
- Prep notifications do **not** hide the prompt text on the lock screen (decided 2026-10-24, reversing the earlier plan). Custom prompt text is treated as normal in notifications; no extra work.
- Path finale: Seneca quote kept; it doesn't replay if an update adds units.
- Library: edge fade instead of a real blur; no skill filter; search runs in memory.
- Rewind's saved audio is 16 kHz (checked in `rewindProcessor.ts`: `WAV_SAMPLE_RATE` is 16,000). Only the recognizer's in-between pieces are 48 kHz. The signal-capture research doc says Rewind is saved at 48 kHz; that is wrong. Moving Rewind to a compressed format is already in its storage plan (10.6).
