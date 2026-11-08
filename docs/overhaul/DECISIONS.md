# Changes to the overhaul plan

Every change to `PLAN.md` after it was agreed: what changed, why, and the owner's OK. Nothing in the plan changes silently.

## D1. Merge each feature into `staging` (2026-11-06)

**Was:** phase branches off an `overhaul` integration branch, a pull request per phase, and the owner merges.

**Now:** one feature at a time on its own branch off `staging`, validated and checked against the plan, then merged into `staging` by Claude. There is no `overhaul` branch. Claude never merges to `main`. Claude stops at sensible points instead of running through every task.

**Why:** the owner's instruction when starting the work: "implement as features at a time, validating and verifying each one as you go... then merging to a staging branch, then continue to the next feature/task."

**Owner's OK:** that instruction.

## D2. `buffer` stays (2026-11-06)

**Was:** remove `buffer` once confirmed nothing needs it (step −1).

**Now:** kept. `whisper.rn` imports it through `safe-buffer`, and removing it broke the iOS bundle.

**Why:** the plan's condition wasn't met, so this follows the plan rather than changing it. It's logged so nobody tries again.

## D3. Privacy policy corrected during step −1 (2026-11-06)

**Was:** step −1 listed only the README as describing anonymous accounts.

**Now:** the privacy policy, launch checklist and test plans were corrected too, since they had the same stale text. The privacy policy also still said Tono asks for an age range.

**Owner's OK:** needed for one thing: `docs/privacy.md` is published, so the owner has to republish it.

## D4. Pull requests into `staging`, merged by Claude (2026-11-06)

**Was:** D1 had Claude merge each feature into `staging` locally.

**Now:** each feature branch is pushed and opened as a pull request into `staging`, and Claude merges it (a merge commit, branch deleted) once the type-check, tests and both bundles pass. A pull request into `main`, or any push to `main`, happens only when the owner asks. Claude never force-pushes.

**Why:** the owner asked for Claude to be able to open and merge pull requests on this repo.

**Guards:** `.claude/settings.local.json` (not committed) allows `gh pr create/merge/view/list/checks/diff` and `git push origin`, and denies force pushes and pushes to `main`. GitHub itself doesn't protect `main` or `staging`, so those rules are the only guard.

**Owner's OK:** the request above.

## D5. The first skill check's samples are placement samples (2026-11-06)

**Was:** the plan said only that the skill check seeds starting levels (task 0.5). The seed skips any skill that already has attempts, and the check's own drills and talk counted as attempts, so most skills were skipped.

**Now:** the first check's drills, reply and talk are recorded but are not practice: they don't move a rating, count an attempt or earn a stage (`PracticeContext.placement`, saved with the take as `subjectExtras.placement`). The seed then places every skill the check measured. A retake's samples are practice, as before. Real practice before the check still wins over the sample.

**Why:** a five-minute sample shouldn't also count as practice on top of placing you, and it was the simplest change that makes the seed work as designed.

**Owner's OK:** not asked; it's inside task 0.5. Say so if you'd rather the check count as practice too.

## D6. Face Lab and ASR Lab stay as their own Dev rows (2026-11-06)

**Was:** task 1.1 said Signal Lab "folds in Voice, Face and ASR Labs".

**Now:** Signal Lab has its own home, tests and results. Face Lab and ASR Lab are still separate screens with their own Dev rows, and Signal Lab links to them; Voice Lab stays reachable from a take. Their tools (live face values, the engine comparison) don't fit a scripted pass or fail test, and removing them would lose features for no gain.

**Why:** the tests needed the same capture and formulas as real features, which Signal Lab does itself. Nothing the old labs measured is missing from it.

**Owner's OK:** not asked; say so if you want the old rows removed.

## D7. What Signal Lab's first iPhone run changed (2026-11-06)

**Found:** three of the failures were bugs in how the numbers were made, not limits of the phone.
- A held sound was measured against itself. The noise floor is the take's 10th percentile, which in a 10 s "ahhh" is the voice, so the pitch tracker skipped nearly every frame (0.2 s found). Reproduced in a test; fixed for takes with no quiet in them, and other takes are unchanged.
- Whisper puts the first word at the top of the clip, whatever is there. In the older exports the first word starts at about 0 ms and the voice 650 to 730 ms later in two of the three; the pace test's 7% is a 3 s lead-in, and in the word stress test the strongest word was later than the target in all six misses. `dsp/wordAlign.ts` now lines the words up with the voice.
- The stand-out score used each take's own z scores, which rescale every take to the same spread, so it couldn't see a take reaching further. It now measures in real units (2 semitones, 3 dB and 100 ms are one step).

**Changed in real takes, not only in the lab:** pace, pauses and prosody read the lined-up words, so a take's words a minute rises a little wherever there was a lead-in. Speaking rate already counted, and it was reading low. The stored transcript keeps Whisper's times.

**Changed in the tests:**
- Endings: right means statements not rising and questions rising, which is what the plan's leaf measures ("statements not rising at the end"). An ending with no pitch to read is left out. **This makes the test easier to pass:** round 1 would have scored 8 of 9 instead of 7 of 10. The bar stays 80%.
- Pauses: decided on the energy gate plus Whisper's gaps, the plan's listed fallback.
- Expression: decided on brow lifts and smiles a minute, the plan's formula and its listed fallback. The take-only range needed to count a movement went from 0.1 to 0.2, since a still face read 51 brow lifts a minute.
- Presence tests now use the face check when there is one, as real takes do. They didn't, so round 1's Looking numbers may not match what a real take would score.
- Long look-aways also wait for Looking: a look down at notes that reads as looking is never counted.

**Statuses:** Volume carry is promoted: 19.7 dB from quiet to loud, and 6 dB coming closer with 0.2 dB left after the face-size correction. So gain control isn't flattening it, and the take audio-session experiment isn't needed. It is one run on one phone; the plan's second-device check still stands. Nothing else moves until round 2, because the code changed under it.

**Not changed, waiting on round 2's recordings:** the pitch variety bars. Today's SD can't separate flat from lively (3.39, 3.3, 3.43), apparently because a few far-out frames inflate it, while the range does (3.7, 6.8, 8.9). The flat bar (under 2.5 semitones) and pitch found (60%) also missed. Whether that is the tracker or the bars needs a reference tool on the real audio, so the recommendation comes after that. SwiftF0 stays unbuilt until then. The eye contact cut-offs wait too: notes read as looking 99% of the time and the ceiling 40%, and the run kept no gaze values to tune from.

**Added:** Signal Lab now keeps each test's latest audio and tracks and can share them as one file, so tuning doesn't need more recording.

**Owner's OK:** asked with the round 1 report. The endings change is the one to look at.

## D8. What the raw recordings showed (2026-11-06)

**Corrects D7.** Stretching Whisper's word times to fit the voice (`wordAlign.ts`) was wrong. Round 2 lost half the marked pauses and every rising question to it: mid-take, Whisper's ends were already within about 100 ms of the real pauses. It is gone. `dsp/wordTrim.ts` only moves a word edge that sits in silence, which keeps the real finding: the first word "starts" at 50 ms when the voice starts at 1,676 ms. Real takes use the trim for pace, pauses and prosody. Whisper's "9% word errors" was also wrong: it wrote "9:00" for "nine", which no longer counts.

**How this was checked:** `replay.local.test.ts` runs the real tests on the phone's recordings and reproduced the phone's numbers, and Praat (and SwiftF0 for pitch) gave a reference on the same audio. Everything below is tuned on one run of one low voice, which is why round 3 has to be a fresh recording.

**Fixed:**
- Pitch: folding every far frame back an octave halved real high notes, and consonants the tracker found a period in (15 to 23 semitones out, up to 170 ms) inflated the SD. Far frames are now judged a run at a time. Agreement with Praat went from 95 to 97% to about 99%, and the SD now separates the reads: 1.23, 2.71, 3.65 (it was 4.79, 3.72, 3.85). The glide passes, with a 24.5 semitone rise.
- Pitch voicing: `maxAperiodicity` 0.35 to 0.5, which finds 47, 63, 62% of speech frames (36, 55, 53% at 0.35) and matches Praat on normal and lively.
- Endings: the end runs on to the close of the voice, over 500 ms, with a line-fit a stray frame can't turn around. 8 of 9.
- Pauses: 10 of 10 with none false, on the energy gate alone. Whisper's gaps added nothing.
- Eye contact: people look at notes and ceilings with the head, not the eyes (notes: 16 degrees down, eyes barely moved). There is now a head limit, 10 degrees down and 6 up. Fixed limits don't work, because looking at the lens read 3, 8, 10 and 17 degrees in takes minutes apart, and a two-week-old face check had the eyes a quarter of the scale off. So each take is measured from its own middle. Lens 99%, notes 100%, ceiling 87%, side 99%, and your preview still counts as the lens. **Limit:** a take read entirely off notes held low can still pass as eye contact.
- Face movement: a face check that saw a smaller lift than the take no longer sets the bar. Uncued events went from 8 to 3.

**Word stress stays Beta.** This is the plan's listed outcome for a failure. No take score reads it.

**Open: the Pitch variety bars.** The flat read is 3.0 semitones against "under 2.5", and pitch is found in 47% of its speech frames against 60%. Praat and SwiftF0 measure the same read at 3.3 and 3.0, and find 56% and 59%, so neither bar would pass with SwiftF0 either. Recommended: under 4 semitones and 45%. Waiting on the owner.

**Owner's OK:** asked with this report.

## D9. What the fresh run showed (2026-11-06)

**Round 3 was a new recording, on code tuned on round 2.** Pitch glide, Emphasis, Pauses, Glances, Your preview and Face events held up. The tracker agreed with Praat 98.8 to 99.7% on the new audio. Three tests narrowly missed, which is what a fresh run is for:
- **Looking:** notes read 83% against 85%. The notes were closer this time, 9 degrees down rather than 16. The head-down limit goes from 10 degrees to 7; your preview stays under 4.
- **Expression:** a still face read 9.6 movements a minute against 8. The brows drifted to 0.48, against about 0.9 for a real lift. A movement now has to rise 0.2 from where the face was in the second before.
- **Endings:** 7 of 9. Whisper's sentence ends were up to 1.6 s out, so the end is now found from the nearest pause. The tracker was also reading a room hum at the noise floor as pitch, about 300 ms after sentences ended, so pitch 25 dB under the voice's own level is now dropped. The window can reach back 600 ms for an ending that fades. 8 of 9 on both recordings. The one miss on round 3, "library.", really did rise; Praat agrees.

**D8's recommendation for the bars was wrong.** The flat read came in at 4.7 semitones (Praat: 5.0), over the "under 4" I recommended. The same read has measured 3.0 and 4.7 on the same tracker, so an absolute bar mostly tests how flat the person read. New recommendation: the flat read under 60% of the lively one (31% and 50% so far), and pitch found in at least 45% of speech frames (47 to 63% so far; Praat 56 to 62%). The order check stays. These numbers were chosen after seeing the data, and it is the owner's call.

**Tuned twice now.** The three fixes above were made on round 3, so they get one more short fresh run. A worklet must be defined before it is used, or it fails at runtime; a test caught it.

**Owner's OK:** asked with this report.

## D10. New Pitch variety bars (2026-11-06)

**Was (plan 6.5):** flat under 2.5 semitones of range; pitch found for 60% or more of speech frames.

**Now:** flat under 60% of the same person's lively range; pitch found for 45% or more. Lively over 4.5 semitones and the flat, normal, lively order stay as they were.

**Why:** the reasons are in D9. On the app's own numbers both recent runs pass (flat 31% and 50% of lively; pitch found 47 to 63%). Both bars were picked after seeing this data, so the order check is what stops a broken tracker passing. SwiftF0 isn't needed for these bars and stays on the Later list.

**Owner's OK:** yes, "go with whatever you recommend", 2026-11-06.

## D11. Which readings count, and the new score bands (2026-11-06)

**Round 4** was a fresh recording on the final code: Looking passed (notes 92%), Expression passed (still face 0 a minute, animated 80), Endings failed (6 of 10).

**Count now:** pauses at sentence ends, deliberate pauses, pitch variety, stand-out stress, eye contact, long look-aways, and volume carry from before. **Stay Beta:**
- Endings. It failed on fresh audio in every round, so the leaf stays display-only, as the plan says. Praat read the same way got 8 and 9 of 10, so it looks fixable; I stopped tuning because four rounds hadn't held and no score reads it yet.
- Stress on the right words. Whisper's word times are too coarse. Display-only, as the plan says.
- Range across feelings. No test of its own yet, and no score reads it.
- Face movement. It passed, but today's score reads the old expressiveness number, so counting it would count the wrong formula. It moves when 3a reads brow lifts and smiles a minute.

**The bands had to move first.** They were set from a simulation and read the old tracker, and on them the flat read scored about 9 out of 10 on pitch. From the iPhone numbers: pitch 2 to 8 semitones (was 1 to 5), personal full marks between 6 and 9 (was 4 to 6), "flat" for the coach under 5 (was 2.5), and emphasis 2.5 to 6 dB (was 1 to 3). A flat read now scores about 2 to 4.5, a normal one 8.5 to 9.5, a lively one 10. Sheet version 7, so takes rescore when opened.

**What changes for real takes:** Cadence now includes pauses and melody and may read lower than it did; Confidence includes eye contact, and script takes have that category back. Melody reads the overall range and Emphasis the peak spread, both tested, until 3a moves them to the plan's leaves.

**Evidence and its limits:** pauses, emphasis, glances, preview and pitch held on round 3's fresh audio, looking on round 4's. It's one low voice on one phone, and the pitch bars and bands were set after seeing that data. The plan's second-device check stands, and the Later list adds a higher voice.

**Owner's OK:** promotion follows the plan: "I set what counts from your results." The owner was told this list before round 4, except the band changes, which are in this report.

## D12. Combine signals, and a research list for the readings not yet trusted (2026-11-06)

**Added to the plan:** rule 10 in section 6.4 (a metric built on more than one signal is computed from them together and tested as the combination) and section 6.5F (what is still Beta or thin, with research to try for each). Task 3a.3 now says leaves combine their signals.

**Why:** the owner asked for both. They also match what Signal Lab found: eye contact needed head angle and eyes together, pauses needed the voice gate and Whisper's gaps, and emphasis needed pitch, loudness and length.

**Owner's OK:** asked for by the owner, 2026-11-06.

## D13. How the 2.0.0 schema and clean start work (2026-11-06)

**Was:** the plan says one new schema, no migrations from old tables, and old test data wiped on first launch (sections 5.2 and 14). It doesn't say how.

**Now:**
- `src/services/db/schema.ts` replaces the 36 migrations. It holds the final schema as plain SQL (the same 31 tables and 10 indexes, proved identical by a test run against the old migrations before they were deleted) and starts at `user_version` 37. A database at 36 or below is dropped and rebuilt in one transaction; one at 37 is left alone; a newer one is left alone with a warning.
- Changes after this, such as the `activity_log` table in 2.2, are small additive steps on top of the baseline, so the owner's test data isn't wiped again. The plan's "no migrations" means none from before 2.0.0.
- The wipe also clears what the old rows pointed at: videos, Rewind audio, temp files, preferences, logs, the Dev tab's data and reminders, the same as Reset app, keeping the Tono account and downloaded models. So the first launch starts at onboarding. The first screen waits for this to finish (`App.tsx`).

**Why:** wiping only the tables would leave orphaned video files and settings pointing at deleted data, and the plan's "clean start" reads as the whole app.

**Owner's OK:** not asked; it is inside task 2.1 and the "no backwards compatibility" rule. Say so if you'd rather keep preferences (for example the onboarding profile) across the wipe.

## D14. How the activity log and the check-offs work (2026-11-06)

**Was:** plan 5.1 and 5.2 say there is one catalogue, one `activity_log` written by every runner through `completePracticeStep`, and that every check mark is a query over it. They don't say how an activity is identified, which entries count for which step, or what happens to the old stored flags.

**Now:**
- **Ids.** `src/content/activities.ts` gives every activity an id: `drill:twister`, `conversation:conv_reply`, `guided:<id>`, `warmup:<id>`, `lesson:<id>`, `speak:impromptu`, `reflect:rewind`, `moment:debrief`, `check:skill`. The content (which twister, which line) isn't part of the id. A rep step that names a structure (PREP) is met only by a rep in that structure; a rep step with none is met by any rep.
- **A plan step** is done when its activity was logged that day from anywhere, or it was done from that very step, or it was skipped. An entry from a Practice screen ticks only one step, the daily plan first, then the top-ups, so two rep steps need two reps and a top-up's rep is not also the daily plan's. A skip is logged as a skip and ticks nothing else.
- **A lesson step** is done when an entry names the lesson and the step's position. Plan steps built from the lesson carry their position. A step done from Practice counts for the first open matching step of a lesson that is current on the path at that moment, which is written down then, so it can't be claimed later. A plan step that didn't come from the lesson (the line of the day, more of the same skill) never ticks a lesson step.
- **A lesson completes** when every step is done in the current go at it, and its score is the average of the scored steps (none scored counts as passed). A completed lesson starts over for its spaced review. The old rule, where finishing the daily plan completed its lesson with a score of 0.8, is gone.
- **Plans bring the lesson's undone steps first,** so a 5- or 8-minute plan, which holds only some of a lesson, still finishes it over a few days instead of repeating the first step (`PLAN_VERSION` 6).
- **Storage.** The plan tables no longer keep `completed_steps_json`; only `completed_at` is kept, because streaks read it. Schema version 38.
- **Deleting a take** clears the session id on its log entry and keeps the entry, like the bare date: the step it ticked stays ticked, with no link to the take.
- **Every lesson can be finished from Today alone.** If none of a lesson's open steps is in the plan (a conversation day has no rep; one lesson has two reps), the first open step is added, trimming extras to stay in the minutes. A test runs all 71 lessons at 5, 8 and 12 minutes.
- **One step, once.** The same step reported twice within two seconds (a double tap on Done) is logged once, and reports are handled one at a time, so a lesson can't be completed twice.
- **Changing the plan's minutes** still rebuilds it after a drill from Practice; only work done from the plan itself (or a skip) keeps it, as before.
- **A step finished after midnight** still counts for the plan it was started from.
- **Not wired yet:** the catalogue's `gate` and `number` fields (3a.2 and 3b.1 fill them, keyed by these ids). Three things (a day's three) and Talk back (a finished challenge) now log; what counts as done for them is refined with their gates in 3b. MarkItUp, PlanYourPoint and Speech study have no activity yet.

**Why:** a check mark anywhere had to be the same fact everywhere, and the smallest model that gives that is rows in a log plus a few rules for who they count for.

**Owner's OK:** not asked; it is inside tasks 2.2 to 2.5. The one visible change is that a lesson now needs all its steps, not the plan's subset, so it can take a few days on a short plan.

## D15. What the tree and grid had to decide (2026-11-07)

**Was:** section 7 and Appendix C give the tree, the grid's rows and the lessons' targets, and those are copied exactly (a test compares them with the plan's own tables). A few things they leave open.

**Now:**
- **Which leaves a take moves.** The plan says "every Voice, Clarity and Presence leaf a take can measure" and "Message leaves". I read that as:
  - Voice: Speaking rate, Rhythm, At sentence ends, Pitch variety, Endings that fall, Stand-out stress, Stress on the right words, Volume carry. Not Deliberate pauses, Pace control, Breath length or Knowing where to stress: a take has no marks, target speed or breath exercise.
  - Clarity: Ums and uhs, Like actually, Stalls, Restarts and repeats. Not Clear words, as Appendix A says.
  - Presence: On the lens, Long look-aways, Hedges, Clear endings, Face movement. Not Range across feelings, which needs four reads of a line.
  - Message: Answers the question, Point first, Has a shape, Hits the beats, Ideas connect, Plain words, No detours, Specifics, and Starting fast when there was no prep. The rest need a drill or a set limit.
- **A script take's Presence.** The plan says Presence ●●. I left out Hedges and Clear endings: they read the words, and a script's words were given, so it's the eyes and the face. This is the one place the grid says less than the plan's words.
- **Phone estimates.** Rule 5 ("a content leaf moves ● from a phone estimate") is one rule in `effectiveWeight`, not a second weight on each row. So Point first on a Concise take or Land the plane is ●●● with a judge and ● on a phone estimate, even though section 7 lists ●●●.
- **A unit's target leaf,** for checkpoints. The plan doesn't list them, so it's the commonest target among the unit's lessons, the earliest lesson's on a tie.
- **Felt vs measured** is the Quick review's row, since the prediction happens there, and it's display only.
- **Gates and numbers live in the grid,** not on the catalogue entries as 5.1 and D14 say, so there is one place for them. `getGridRow(activity.id)` finds them. The gate text is a description until 3b.1 enforces it.
- **New catalogue ids,** because section 7 has rows for them: Speech study, Rehearse, Plan your point, Missions, Monthly comfort check-in, Attention rating, Checkpoint. They don't write to the activity log yet (see the Later list).
- **What counts.** Appendix C's trust column is the design, so "At sentence ends" stays `probation` in the tree, as the plan has it. What counts today is `readingTrust.ts`, as D11 set it, and `leafCounts` follows that.

**Nothing reads the grid to move a score yet.** Scoring doesn't change until 3a.3.

**Owner's OK:** not asked; these fill gaps in tasks 3a.1 and 3a.2. The script-take reading is the one to look at.

## D16. How leaf ratings, stages and the level work (2026-11-07)

**Was:** plan 6.3 gives the update, the roll-up, the levels and the stages. It doesn't say how they're stored, or how the screens that still show five skills keep working until phase 5.

**Now:**
- **Stored:** a rating per leaf, every move a leaf made (with its attempt, score and difficulty), each attempt's before and after at every node that changed, the stage earned at each node, and the level. Schema version 39. Nothing above a leaf is stored; it is worked out each time.
- **The five old skills are gone from the database.** `skill_mastery` and `skill_events` are dropped, with no dual writes. `getSkillStates` now reads each old skill as its pillar's score, by the plan's mapping (Articulation is Clarity, Cadence is Voice, Impromptu is Message, Confidence is Presence, Conversation is Connection). Screens that show skills keep working until phases 5 and 6 replace them. **So those numbers move more slowly than they did,** because a pillar is an average of many leaves. That's what the plan intends. Composure has no old skill, so it shows only on the trail until the You tab.
- **A leaf that doesn't count doesn't move.** The plan says it has weight 0; I also don't move it, so a reading that isn't proven can't build up a number that suddenly counts when it passes.
- **An attempt counts once** for a stage's attempts and proof at any node, however many leaves below it moved. Otherwise one take, which moves about 20 leaves, would count as 8 attempts of Voice. A leaf's own attempt count, which shrinks its update, goes up by one whatever the weight.
- **A good attempt at a node** is any leaf below it scoring 70 or more at that difficulty.
- **Stage celebrations are for pillars only,** the five with an old skill, since those are the ones the celebration screens can show. Leaves and secondary skills earn stages quietly. Reaching a level on its own isn't celebrated yet: it shows on Today and in Your level.
- **Self-ratings stop moving performance leaves now, not in 3c** (rule 6). Today's guided exercises rate themselves, so until 3c.1 gives them a mic, they move only inner leaves such as Settling and Outward focus. Line reps move only Knowing where to stress, from your marks against the coach's. React drops its self-rating, as section 7 says.
- **Who checked a drill:** Category sprint, Word chain, Bridge chain, Random-word story, Sum it up, Rolling summary, Explain it simply, Land the plane and Squeeze it are phone estimates unless Tono AI checked that attempt, so their content leaves move ● (rule 5). The gates come in 3b.1, and until then a nonsense attempt can still move those leaves that lightly.
- **Every kind of take now moves the tree:** free record and script takes moved nothing before. Feeling of the week moves Feeling words only: different feeling words ÷ 5, a count and not a grade.
- **The skill check** sets starting values on the leaves it touched: its read-aloud, its category sprint, its partner line and the take leaves of its talk. Other leaves stay at 25.
- **New score bands, from the iPhone's recordings** (replayed from the Signal Lab export): Pitch variety reads the within-phrase SD, 1 semitone scores 0 and 3 full marks (flat 1.56 to 1.75, plain reading 2.06 to 2.68, normal 2.82, lively 3.34), personal after 5 takes between 2.4 and 3.4. Stand-out stress is 0.7 steps to 2.2 (flat 1.01 to 1.21, plain reading 1.52, normal and lively 2.02 to 2.14, stressed 2.88). One low voice on one phone, as before.
- **Formulas the plan marks "Tune",** first guesses until real takes say otherwise: Rhythm (spread free to 1 syllable a second, then -40 per syllable; speed-up free to 10%, then -2 per point), Restarts (1 a minute free, -10 each), No detours (-25 each a minute), Specifics (6 a minute = 100), Starting fast (1.5 s free, -20 a second), Plain words (20 words a sentence and 15% long words free), Face movement (12 a minute = 100).
- **Two leaves read what a take can show, not all of the plan's wording.** Volume carry reads "last word within 6 dB", since a take has no volume target. It compares you with yourself, so the face-size correction isn't needed. Clear endings has no separate signal for "neutral" in the words, so it combines them with the voice: clean words with your voice dropping away at most sentence ends is neutral, 60 (rule 10).
- **Bouncing back ● also moves on Word chain,** as the grid says, so a real Word chain's Overall is a little above the plan's example, which follows one leaf.

**Not wired yet, by plan:** the personal rows (Three things, Talk back, Prime, Debrief, Moments, Rewind, Missions, check-ins) have grid rows but move nothing until 3c.4 gives them their numbers.

**Why:** the plan says no dual writes and no shims, so the old skills had to become a view of the tree rather than a second store.

**Owner's OK:** not asked; these are inside tasks 3a.3 and 3a.4. The one you'd notice: guided exercises and line reps stop moving your skills until they get a mic in 3c. That's the plan's rule, sooner.

## D17. A take on the tree, and the trail (2026-11-07)

**Was:** plan 6.3 says a take uses the same tree, 0 to 100, says Delivery without a content check, and shows a trail. Phases 5 and 6 replace the screens that show it.

**Now:**
- **One sheet, version 8.** The measured and judged sheets are deleted, along with `repEvidence.ts` and the switch on the Scores tab. Old takes rescore when opened or at launch. A take's number is a whole number out of 100.
- **Delivery is Voice, Clarity and Presence,** equal shares. **Overall needs a content check,** which today means a Tono AI review: Message 40, the rest 20 each. So a judged take's Delivery is the same as it would have been unjudged. **A judged take's Message includes the phone's estimates** of the leaves the judge doesn't own (Point first, Hits the beats, Specifics and so on), since they're about the same thing, and they stay marked "phone estimate".
- **The judge is read only where it owns the leaf,** ahead of 3b.2: its old Relevance becomes Answers the question, Structure becomes Has a shape, Clarity becomes Ideas connect, each ×10. What it says about pace, pitch and eye contact no longer counts. A free record with no topic ignores Answers the question.
- **Face movement counts now.** D11 held it back only because the score read the old expressiveness number, and takes now read brow lifts and smiles a minute. **The bar of 12 a minute is my first guess:** the cued test ran at 15 a minute and an animated face at 80, and no normal take has been measured yet. Worth checking on the iPhone.
- **Every leaf reads Signal Lab's formulas now:** within-phrase pitch, three-cue stand-out stress, looks over speaking time with glances forgiven, brow lifts and smiles. Those were beside the score until now. On the Later list, this closes the notes about promoted readings reading older formulas.
- **The screens are stopgaps for phases 5 and 6.** Result's ring says "out of 100" with the attempt's word (Great, Solid and so on) and Overall or Delivery; the summary and Scores tab list the tree for this take; Trends draws Delivery and Message lines.
- **Old skill names on screen are now the pillars' names** (Clarity, Voice, Message, Presence, Connection), one line in `tokens.ts`. Otherwise a drill's card said "Cadence" above a trail ending in "Voice" for the same number. This is ahead of phase 5, but it's cheap and it avoids a contradiction on screen.
- **The trail:** on a take's Result as a beat after the score, then the pillars it moved; under a drill's result on the drill, twister, conversation, live conversation and summary screens; and as a toast on guided exercises, line reps and Move it, which go back straight after saving. An attempt that moved nothing says "Counted as practice. This one doesn't move a score yet: nothing can check it for now." (rule 2).

- **Within limits on a Concise take** reads its limit: inside is 100, and going over costs its share of the limit. D15 said Within limits needs "a drill or a set limit", and Concise has one, so the leaf the grid asks for now moves. The fresh review caught this.

**Why:** the plan's "no more two-layer switch" means one sheet, and a contradiction between old and new names would be worse than renaming early.

**Owner's OK:** not asked; these are inside tasks 3a.5 and 3a.6, except the rename. Say if you'd rather keep the old names until phase 5.

## D18. How the gates work (2026-11-07)

**Was:** section 7 lists a gate for each activity, and rule 2 says a failed gate keeps your minutes and check-off, moves no score, and says why kindly. Several gates need checks that later tasks build.

**Now:**
- **`domain/gates.ts` holds them all.** A failed attempt is kept with no score, moves no leaf, doesn't step the difficulty, and still ticks its plan and lesson step, with no score towards the lesson's average. Its result says "Not scored" and why, or "Not checked" when nothing could check it (rule 8).
- **Built now:** Pace and Pause reading need 70% of the words. Twister, Minimal pairs and Shadowing need 40%, since their number is already accuracy; the plan just says "Accuracy", so that floor is mine. Non-native speakers get 10 points off each, the same relief the script gate has. Random-word story needs a required word. Sixty seconds rejects heavy repetition, and never for someone who stutters. Projection needs words. Conversation drills need a reply of 3+ words. Rolling summary needs a key word or a judge. Explain it simply needs the key term or a judge. A take needs 20 words, and a script take 80% of its script (70% for a non-native speaker). Move it's "line heard" and One-breath's silence gap were already there.
- **Word chain and Bridge chain with no judge aren't scored.** Rule 8 and section 16 say nonsense scores nothing, and today the phone can't tell a link from a random word. **So until the phone's meaning check arrives in 3b.4, these two only score with Tono AI.** That's a change people without it will notice.
- **The numbers the plan changes:** Pace reading is in band × accuracy, Sum it up is limits × content, and Explain it simply is plainness × accuracy, so wrong words or a missed point can't score on the easy part.
- **A take that fails its gate** has no number at all, and its Result says "We couldn't score this one".

**Not built here, because they need a later task:**
- 3b.2: the judge saying "not scorable".
- 3b.3: Pause reading's pauses at the marks, since that needs Whisper's word times. Until then it still counts pauses anywhere, capped at the number of marks.
- 3b.4: Category sprint's checked words, the on-topic and coherence checks on takes, Sixty seconds and Random-word story, and Word chain's phone check.
- 3c.1 and 3c.3: Guided exercises and Line reps, which have no mic yet.

Section 16's validity tests for "table" and for pauses away from marks go in with 3b.4 and 3b.3.

**Why:** a gate that's honest about what it can check today beats one that pretends, and each missing piece is already a task.

**Owner's OK:** not asked; this is task 3b.1. The two to look at: chains needing Tono AI until 3b.4, and the 40% floor.

## D19. The judge, narrowed to Message on 0 to 5 (2026-11-07)

**Was:** the judge scored 14 subcategories on 1 to 10, delivery included, and quoted evidence only loosely. Plan 6.4 and 6.6 say it owns content only, on written levels 0 to 5 with a required quote the phone verifies.

**Now:**
- **It scores six leaves:** Answers the question, Point first, Has a shape, Hits the beats, Ideas connect and Specifics, each with six levels written for that leaf. These are the Message leaves a take can show that are about meaning. Plain words, No detours and Starting fast stay measured.
- **A level needs a quote that's really in the transcript.** Case and punctuation don't matter. A level whose quote isn't found doesn't count, and the phone's estimate of that leaf stands, if it has one. Level 0 needs no quote, since there's nothing to show. Under 3 levels that hold up, the review is refused.
- **It can say a take can't be scored,** with a reason, and the take then says "We couldn't score this one".
- **A script take is coached, not scored,** since its words were given. "Following the marks" goes with it, because it's delivery; Line rep's marks measure it from 3c.3.
- **It no longer gets word timings,** which only served pauses, so a call costs a little less. It still gets the phone's measurements, for its coaching's words.
- **Deleted:** `domain/scoring/taxonomy.ts`, tone fit and body language. The video setting in Dev stays, for the coaching only.
- **The `scores` table stays** for the coaching and annotations the Result screen reads, with its delivery columns empty, until phase 6.
- **Takes judged before this** keep their coaching and their score becomes Delivery, since their old answer has no levels.

**Not validated.** The six rubrics are my wording, and nothing has measured them. 1.9's eval and your 30 hand-rated takes are what will say whether they hold up, and its `spikes/inference-eval/app_prompts.json` needs regenerating first.

**Needs a deploy, which I did not do:** the answer format went from 3 to 4, and the server refuses a version it doesn't know. **Until you run `npx supabase functions deploy --use-api`, Tono AI reviews of takes fail on this code.** Everything else works. There's one format on purpose, as the plan has no backwards compatibility.

**Owner's OK:** not asked for the wording; it's inside task 3b.2. Please read the levels in `supabase/functions/_shared/prompts/takeReview.ts`, since you know how you'd rate a take.

## D20. One native build, then updates only (2026-11-08)

**Was:** the plan marks some tasks "new build" (the keyboard in phase 0, the phone meaning check in 3b.4) and puts them wherever they fall in the order. The owner has a limited number of iPhone builds.

**Now:** every native piece the rest of the plan needs goes into one build, made once, and every later phase ships as an over-the-air update. The task order changes so the work that uses the new native code comes first.

**What the rest of the plan needs, and where it comes from:**
- **Already in the build, or already installed:** the keyboard library (phase 0), Whisper with word times, live speech recognition that saves its audio (so drills can be scored from the clip, and warm-ups, hisses and sirens can be measured), audio decoding, Apple's contextual embeddings, Apple speech transcription, notifications, video, haptics, Skia, Reanimated, Gesture Handler, the native tabs and `@expo/ui`.
- **Added now:** `expo-network` (autolinks, no plugin, no permission), because phase 7 downloads the Whisper model on Wi-Fi and asks first on cellular, and nothing installed could tell the two apart. A fresh review found this gap.
- **Also added now:** `modules/tono-language`, about 20 lines of Swift around Apple's `NLEmbedding`: a vector for a word or a sentence, offline, with no download. The plan's phone meaning check (6.6) names exactly this. Apple's contextual embeddings were already in the build, but they need a download and are weaker on single words, so the "table isn't an animal" check wants this one. Both are in the build now, so 3b.4 can test both on the iPhone and keep whichever holds up, with no further build.
- **Version 2.1.0.** An update only reaches builds with the same version, and the iPhone's last build is older than the keyboard library, so publishing an update under 2.0.0 could have reached a build that lacks it. 2.1.0 closes that gap.
- **Not needed, and why:** FlashList and the confetti library contain no native code (checked from the published packages), so they arrive by update when phases 5 and 8 need them. Lottie and Rive are not used. SwiftF0 and Silero (Core ML) are in the plan only "if the tests fail": pitch variety and pauses passed, and the one leaf they might help, Endings that fall, stays Beta and moves no score. Whisper's DTW word times aren't exposed by the Whisper library. Apple's transcription is in the build but its wrapper returns phrase-level times only, dropping the per-word ones, so better word times would need a Swift change and so a build. That only feeds "Stress on the right words", which is Beta and moves no score, so I haven't added it. (An earlier draft of this record said Apple's transcription was the way to test better word times; that was wrong.) The audio-session experiment was only for volume, which passed. If one of these is ever wanted, that is a build.

**New safety checks:**
- **Dev, Native check** lists every native piece and whether this build has it, and asks the meaning check for a real answer ("dog" closer to "puppy" than to "thunder"). After the build, it should say "This build has everything".
- **`npm run check:native`** (also part of the tests) fingerprints everything compiled in: native dependencies, local modules, config plugins, patches, the native parts of the app config, and the icon and splash images. It fails if any of it changes without a version bump, and says what changed. `npm run native:accept` records a new fingerprint after the bump. It ignores line endings, so Windows and Mac agree.

**For 3c.2, in JS:** warm-ups with no words (a hiss, a hum, a siren) should record with `react-native-audio-api`'s `AudioRecorder` (file output, start and stop, already in the build with the microphone permission), not the speech recognizer, which restarts on silence and could leave gaps in the saved audio.

**Risk, plainly:** I can't compile Swift on this Windows machine. The module is deliberately tiny and copies the structure of the working BackupExclusion module, and the build tooling's autolinking finds it, but a typo would only show when the build runs. If the build fails, it will fail in `TonoLanguageModule.swift`, and the fix is a few characters.

**Order, now:** the native build, then 3b.4 (phone content checks, which uses the new module and unblocks the gates left waiting in D18), then 3b.3 (Whisper scoring drills), then 3b.5, 3b.6, and the rest as before. Nothing after the build should need another one. If something does, I'll say so before writing it.

**What an update can't change:** the version, the icon, the permission texts, the entitlements and any native module. Those need a build.

**Owner's OK:** asked for by the owner, 2026-11-08.
