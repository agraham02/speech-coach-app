# Decisions log

What Ahmad decided, with the reason, so later sessions don't re-open it. Newest first. The research behind these is in `inference-strategy.md` and `../research/signal-capture.md`.

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
- **No audio-only copy of deleted takes** (decided 2026-10-23). Deleting a video deletes its audio with it, by hand or by the retention cleanup. The app already keeps each month's best and toughest take as keepsakes (`src/domain/videoKeepsakes.ts`); those keep their video and audio and are the takes that can be re-analysed when the algorithms improve. Every other take keeps its transcript, its numbers and the small versioned feature track, and older numbers are labelled as measured with the older method.

### Small decisions, accepted as built

- The prep Dynamic Island timer keeps running when you come back; only the notification is cancelled.
- AirPods: recording uses the iPhone's mic, playback is full quality.
- Recording keeps its no-auto-gain "measurement" mode.
- Prep notifications should hide the prompt text on the lock screen for custom prompts. **Not built yet**: do it in the next session that touches notifications.
- Path finale: Seneca quote kept; it doesn't replay if an update adds units.
- Library: edge fade instead of a real blur; no skill filter; search runs in memory.
- Rewind's saved audio is 16 kHz (checked in `rewindProcessor.ts`: `WAV_SAMPLE_RATE` is 16,000). Only the recognizer's in-between pieces are 48 kHz. The signal-capture research doc says Rewind is saved at 48 kHz; that is wrong. Moving Rewind to a compressed format is already in its storage plan (10.6).
