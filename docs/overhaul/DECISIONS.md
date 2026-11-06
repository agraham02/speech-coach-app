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
