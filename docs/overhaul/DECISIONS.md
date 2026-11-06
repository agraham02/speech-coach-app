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
