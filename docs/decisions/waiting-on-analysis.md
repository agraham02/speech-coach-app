# Waiting on analysis: where people wait, and the pattern that replaces the spinners

Session 09, 2026-10-24. Branch `feature/background-analysis-ux`. Builds on the AnalysisService (`scoring-taxonomy.md`), the exercise judges (`exercise-judging.md`) and `inference-strategy.md`.

The idea in one line: **a take's analysis is work the app does for you, not a place you stand.** One shared state (`domain/analysis/progress.ts`) says which step it is on, how far along, what is left, and what to do if it didn't finish. The Result screen, Today, the starting point and the Rewind result all read it. You can leave any of them.

## Contents

1. [What was already right](#1-what-was-already-right)
2. [Inventory: every place a person waits](#2-inventory-every-place-a-person-waits)
3. [The pattern](#3-the-pattern)
4. [Feasibility: what survives, and what it would take to do more](#4-feasibility-what-survives-and-what-it-would-take-to-do-more)
5. [What was built](#5-what-was-built)
6. [Still to convert](#6-still-to-convert)
7. [Decisions for you](#7-decisions-for-you)

---

## 1. What was already right

Most of the plumbing existed, so this session did not rebuild it:

- Every analysis step of a take is its own row (`session_steps`: pending, running, done, failed, interrupted, skipped), written before anyone is told, so any screen opened later reads the truth from the database.
- The Result screen already filled in live (skeleton hero, "Listening back and measuring, on this phone...", a step list at the bottom) and the take was never a blocking screen: `PreviewScreen` goes straight to Result.
- Killed mid-run: `reconcile.ts` marks running steps interrupted at the next launch and resumes recent ones (under 24 hours old, under 3 attempts).
- Done while elsewhere in the app: a toast with a tap-through; backgrounded: a local notification (`sessionCompleteNotifier.ts`). Library shows a "Processing" icon on the take.
- The transcription model download is already a non-blocking banner with percent, pause and resume, and runs in an iOS background session.

What was wrong was narrower: three places still blocked or were silent, and nothing said *why* or *how long*.

## 2. Inventory: every place a person waits

Times are from the three real iPhone takes in `analysis_samples/` (41, 55 and 89 seconds of talk, logged as `[pipeline] <take> <step>: done in N s`). The phone's steps took 9, 11 and 21 seconds, about 0.2 to 0.25 times the length of the talk, split roughly 60% transcript (Whisper), 30% voice analysis, 8% coaching. The old video-review path took 36 to 71 seconds of model time plus 100 to 170 MB of upload: 92 seconds for one take, 4 minutes with a retry for another, and one failed after 78 seconds (server error). **The default is now a text-only call to Tono AI, which has not been timed on a phone**: the 4 to 25 second range in the code is an estimate, and the device test plan asks for the real numbers.

| Where | What it showed | Real time | Leave the screen | Background the app | Kill the app | No network |
|---|---|---|---|---|---|---|
| **Take analysis** (Preview, then Result) | Skeleton hero with one line; step list far down the page | Phone steps about 0.25 x the talk; review: text call seconds (estimate), video path 1.5 to 4 min | Carries on (module-level queue) | JS is suspended after a short grace period, so Whisper, DSP and the network call pause; they resume when the app returns. A call cut off mid-flight fails as "offline" | Steps resume at next launch (recent, under 3 attempts) | Phone steps are fine. The review failed and waited for a manual Retry |
| **Initial assessment** (Skill check, then Starting point) | Full-screen spinner: "Your AI coach is watching your talk, usually a minute or two." No steps, no way out, up to 90 s (phone only) or 240 s (review coming) | Same as above plus the evaluation | The wait *was* the screen | Same | **Relaunch asked "Start fresh?" and offered to delete the practice**, because onboarding was unfinished and the talk counted as old practice | Review failed, then it went on with phone numbers after the wait |
| **Rewind, end of the telling** | Recording screen stuck on "Listening back..." while the audio is joined and Whisper runs | About 0.3 x the telling (Whisper 16.6 s per 60 s), so 35 s for two minutes | Could not leave | Same | The row stayed "processing" forever | Not needed (on the phone) |
| **Rewind result: notes from Tono AI** | The button spun | Text call, up to 70 s per try and one retry if the first answer fails the phone's checks | The request continued, but a failure showed only a toast | Request may fail | Lost; the button is there again | Toast with the reason |
| **Word Chain / Bridge Chain** | Button "Checking your links..." | Up to 15 s, then counted | Not leavable mid-drill | n/a | n/a | Counted, with a reason |
| **Spoken summary** (Practice, Summarise) | Button "Saving..." while the review runs | Up to 25 s | Not leavable | n/a | n/a | Scored on the phone's measurements |
| **Mark it up (auto)** | Button spinner | Up to 25 s | n/a | n/a | n/a | Rules mark it |
| **Transcription model download** | Banner with percent, speed, pause | 574 MB; minutes | Yes | Native background session (survives suspension) | Resumes from the saved state | Banner shows the failure, "Try again" |
| **Early video upload, shrink to 720p, re-measure** | Nothing (silent background work) | Seconds to minutes | Yes | Pauses | Resumes at launch | Upload skipped |

## 3. The pattern

**1. Never a screen you can't leave.** The Result and Rewind screens are the take's home, and they open at once. Their top card says what is happening; the rest fills in underneath, as it already did.

**2. Real steps, honest time.** "Step 2 of 5: Measuring pace, pauses and pitch", a bar with one segment per step, and one sentence about time that is a ceiling or a range, never a made-up countdown ("Usually under half a minute."). Past the top of the range it says "Taking longer than usual. You can leave; it keeps going." The ranges are constants (`REVIEW_SECONDS`, `rewindSeconds`) to be updated from device data. Where only "it's working" is known, that is what it says.

**3. Say what happens if you leave.** "You can leave this screen. If you close the app, it picks up where it left off next time you open it." This is true for the take (steps resume) and for the Rewind (now resumes, see below); for the notes request it is not (the request is lost, and the button comes back), and the card says so.

**4. A pending state that lives in the app.** Today lists the takes being worked on, the ones that didn't finish, and the ones that finished while you were elsewhere and are not opened yet ("Ready. Tap to see what stood out."), with a marker that survives the app closing and clears when the result is opened. Two takes at once are two rows with their own steps; the heavy work (Whisper, decode) is already one at a time (`runHeavy`).

**5. Facts first, judgement when it lands.** The Result screen already shows the measured score and the phone's coaching the moment they exist, and the judged layer replaces or sharpens it ("Deep review on the way. This score will sharpen."). The starting point now follows the same rule: it says plainly that the numbers are from the recording and the AI coach's read is added when it's in, and the person can continue without waiting for it.

**6. Failure says what to do, never just fails.** A step that didn't finish shows its sentence and a "Try again" button at the top of the Result. A review that failed only because there was no connection says "No connection, so the review is waiting. It sends itself when you're back online." and *does* send itself: when the app opens and every time it comes back to the front, for a day, up to five tries (`retryOfflineReviews.ts`). Any other failure (over the allowance, signed out, a server error) is not retried behind the person's back: it waits for the button, with the reason.

**7. Notifications.** Unchanged and in the existing voice (`notificationCopy.ts`: `sessionReadyText`, `stepFailedText`; session 02 owns that copy). A local notification is only for the app being backgrounded and alive; see feasibility. All new in-app wording is in `domain/analysis/workCopy.ts` so there is one file to read for the voice. Prompt text on lock-screen notifications is not hidden (decided).

**The state machine** (`summarizeWork`): `idle` (nothing to do), `queued` (steps waiting, none started), `running` (one running; a cut-off step behind it is just waiting its turn), `attention` (nothing running and something failed or was cut off), `done`. The judged review is its own line (`none`, `queued`, `running`, `done`, `failed`, plus "failed because offline", which needs no button). After a relaunch: running steps become `interrupted`, `resumeDecision` says whether launch picks them up (recent, under 3 attempts) or leaves them for the button, and the pipeline starts the first one, so the summary goes `attention` to `running`.

## 4. Feasibility: what survives, and what it would take to do more

**iOS.** A suspended app runs no JavaScript. The app gets a short grace period after leaving the front (the notifier's own comment says roughly iOS's default; unconfirmed here, it is in the test plan). After that the Whisper run, the DSP and any in-flight request pause, and a request cut off fails with a network error. Real background time on iOS comes from: a background `URLSession` (uploads and downloads that the OS carries on after suspension: `expo-file-system`'s `sessionType: 'background'`, which the model download already uses; the JS promise is not restored after a kill), `BGProcessingTask` (the OS decides when, typically overnight and charging; `expo-background-task`'s own docs say it won't run right after backgrounding and the system can interrupt it), or a short `beginBackgroundTask` extension (about 30 seconds, native code). None of these can run Whisper-turbo and the face/pitch work on demand while you look at another app. On-device analysis therefore needs the app in the front, or a very short grace period, and that is a hard platform limit rather than something to engineer around.

**Android.** The process can be kept alive longer but is not guaranteed; reliable long work needs a foreground service (a persistent notification) or WorkManager (`expo-background-task` uses it: minimum 15 minutes, runs only with battery and network, not immediately). Same conclusion.

**Does hosted analysis change this?** Yes, and it is the real lever. With the default text-only review, the phone measures in the foreground (about 10 to 25 seconds) and then sends a small text request that takes seconds. The only long-lived piece is that one request, so the exposure is small: if the app is suspended mid-request the request fails and is sent again on return (built). The video-review path (a 100+ MB upload and a 40 to 180 second model call) is where background transfer matters; it is a Dev setting, so no work is spent there. **If the review ever becomes minutes long or stays video-based, the answer is a server job**: submit the work, return a job id (the `pending` shape with `jobId` already exists in `AnalysisResult`), let the server finish whether or not the phone is awake, and deliver "ready" by push notification (APNs through a push service, needing a token and a server sender) instead of a local one. That is real backend work (a jobs table, a worker, push), not worth building while the call is seconds long. Recommendation: do not build it now; revisit if the measured review time on real takes is over about 30 seconds.

**Offline.** The phone's steps need no network. The judged part waits and is sent again by itself (built).

## 5. What was built

State model and copy (pure, tested):
- `src/domain/analysis/progress.ts`: `summarizeWork`, time ranges (`stepSeconds`, `remainingSeconds`, `etaSentence`, `rewindSeconds`), `resumeDecision` (taken out of `reconcile.ts`), `offlineRetryDue`.
- `src/domain/analysis/workCopy.ts`: every waiting-state sentence in one place.
- Tests: `src/domain/__tests__/analysisProgress.test.ts` (queued, running, step progress, done, failed, waiting for a connection, resumed after relaunch, two takes, the time ranges against the three real takes, resume and retry limits) and `src/services/db/__tests__/waitingOnAnalysis.test.ts` (real SQLite with the real migrations: Today's list, ready marker cleared on open, deleted and old takes left out, offline review retried only for "offline", a Rewind kept and resumed after a kill, capped at two resumes).

Take analysis:
- `components/work/WorkStatusCard.tsx` (+ `WorkBar.tsx`): the shared card, shown at the top of the Result overview only while there is something to say (`ResultScreen.tsx`, one element and one hook). Retry reuses the screen's existing handler.
- `hooks/useTakeWork.ts`, `hooks/useElapsed.ts`.
- `services/pipeline/activeTakes.ts`, `hooks/useActiveTakes.ts`, `components/work/ActiveTakesCard.tsx`: Today's "Your takes" list. The ready marker is a `ready_unseen` artifact (no migration), set in `announceCompletion` when the result is not on screen and cleared when the Result screen opens.
- `services/pipeline/retryOfflineReviews.ts`, started from `App.tsx`.

Initial assessment (`StartingPointScreen.tsx`):
- The spinner is now the shared card (steps, bar, time), a line on what the numbers are, and, once only the AI coach's read is outstanding, a button "Continue without the AI coach".
- If the app is closed during the wait, the next launch goes back to the starting point instead of asking about "old practice" (`OnboardingGateScreen.tsx`, `getFirstSkillCheckId`).

Rewind:
- The recording screen no longer waits for Whisper: `startRewind` saves the take and returns at once; the result screen opens and shows "Step 2 of 3: Writing out your words" (`RewindWorkCard.tsx`) until it is done.
- Migration **v35** adds `day_recalls.pending_json` (the recognizer's audio files, its live text, the volume readings, a resume count). A take cut off by the app closing is processed again at launch, at most twice, then kept as "failed" with what the recognizer heard (`resumeRewinds`). Session 08 should use v36 or higher.
- Notes: the request lives in `services/rewind/rewindNotes.ts`, not in the screen, so it carries on if you leave, shows "Writing your notes" with an honest time and the retry caveat, and a failure (including the phone refusing two drafts) stays on the card with the reason and "Try again" instead of vanishing as a toast.

Exercise judging: while a Word or Bridge Chain is being checked the screen says what Tono AI is doing; after 5 seconds a "Count them without the check" button scores by counting at once.

## 6. Still to convert

- **Spoken summary** ("Saving..." while the review runs, up to 25 s) and **Mark it up (auto)**: the same pattern as the chains (say what is happening, offer to continue without the AI). Not done because the summary result is recorded after the review, the same constraint as chains.
- **Conversation debrief and Say it short** wait on the same take pipeline and already benefit from the Result changes; the Conversation runner's own "Saving..." is on-device and short.
- **A Library badge or tab badge** for unopened results. The native iOS tab bar's badge support wasn't checked; Today's list does the job for now.
- **Rewind in Today's list.** Rewinds are separate from takes, so Today doesn't list one that is still being processed (its own screen does, and Library shows "Processing").
- **A "ready" local notification for a Rewind** (it is the take pipeline's `announceCompletion` only).
- **Dev tab:** the Pipeline screen could use `summarizeWork` instead of its own reading of steps.

## 7. Decisions for you

Each is built as recommended and reversible.

1. **The starting point can be continued without the AI coach's read, and is not updated when it lands.** The read stays on the talk in Library. Alternative: re-score the starting point, the ratings seed and the path when the read arrives (the seed ratings only apply while a skill has no attempts, and the path would shift under the person). Recommend leaving it: a starting point that changes after you read it is worse than one that is slightly less sharp.
2. **A review that failed for lack of a connection is sent again by itself.** It is the only automatic retry; every other failure waits for the button. The retry is free if it fails again offline (no request reaches the server). If you'd rather every send be a tap, delete the `watchForOfflineReviews` line in `App.tsx`.
3. **"Ready" rows on Today, until opened.** One extra block on the home screen after each take. If it feels like clutter, the `ActiveTakesCard` line in `TodayScreen.tsx` is the whole feature.
4. **No server job and no push yet** (section 4). Revisit if the real review time on a phone is over about 30 seconds.
5. **A killed Rewind is processed again at launch** (twice at most) instead of staying "processing" for ever. It costs a migration (v35).
6. **The time estimates for the text review (4 to 25 s) and the notes (5 to 40 s) are guesses** until the device test plan returns real timings; the phone-step ranges come from three real takes.
7. **Chains: a person may skip the check after 5 seconds.** The request still runs to its end and counts against the allowance; its answer is dropped.
