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
