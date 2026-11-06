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
