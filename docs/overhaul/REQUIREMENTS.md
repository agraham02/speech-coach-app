# Everything the owner asked for

From Appendix B of `PLAN.md`. A phase can't close while one of its IDs is open. `done` needs evidence, and `npm run check:overhaul` enforces that.

| ID | What you asked for | Section | How we'll check | Phase | Status | Evidence |
|---|---|---|---|---|---|---|
| R1 | Home screen uncluttered and guided | 8 | Emulator: session card first, one primary button | 4 | todo |  |
| R2 | Keyboard never covers text boxes | 14 (phase 0) | Emulator and iPhone: every input screen | 0 | iphone | Android emulator: event check-ins, Add a prompt, onboarding name (PR #32). iPhone check pending |
| R3 | After-event asks how you think you did | 11 | Emulator: question appears and saves | 0 | done | PR #34. Emulator: the question appears with the saved focus; migration and save tested |
| R4 | A clear "what next", fewer places to go | 4, 8 | Walkthrough: four tabs, one main action | 5 | todo |  |
| R5 | Prompt and Done don't stay pinned | 10 | Emulator: nothing pinned while scrolling | 6 | todo |  |
| R6 | No skeletons; prepare, then land at the top | 10 | iPhone: results open at the top in one piece | 6 | todo |  |
| R7 | Transcript clean, filler words in yellow | 10 | Screenshots in both themes | 6 | doing | Yellow fillers done (PR #33, emulator screenshots in both themes). The clean transcript, legend and "More marks" fold are phase 6 |
| R8 | Scores not overloaded; only useful graphs | 6.5, 10 | Details opens on 4 rows; by-phrase strip replaces 3 charts | 6 | todo |  |
| R9 | Overview order: score, rewatch, coaching | 10 | Screen test | 6 | todo |  |
| R10 | Felt vs observed as a track, not a button row | 6.5, 10 | Screen test; same track shows all three markers | 6 | todo |  |
| R11 | Analysis in an accordion | 10 | Screen test | 6 | todo |  |
| R12 | One scoring logic across the whole app | 6 | Grid coverage test | 3a | done | Every attempt goes through the grid onto leaves (`scoring/leafEvidence.ts`, `db/leafRepo.ts`); `skillGrid.test.ts` for coverage |
| R13 | Everything earns a score, including Rewind | 7 | Grid coverage test | 3a | todo |  |
| R14 | One curriculum, like Duolingo | 5 | Plan, Path and Practice read the same catalogue | 2 | todo |  |
| R15 | Rewind, Feeling, Conversations in the daily session | 5.3 | Session builder tests | 4 | todo |  |
| R16 | Check-offs sync both ways | 5.2 | Tests and emulator | 2 | todo |  |
| R17 | Clear which are lessons, drills, repeatable or one-off | 5.1 | Catalogue test; labels on screen | 2 | todo |  |
| R18 | One central place to start any drill | 4, 5.3 | Emulator: Practice lists every drill | 5 | todo |  |
| R19 | Keep the name Tono | 3 | No rename | Plan | done | Name unchanged |
| R20 | Clean, modern design in light and dark | 15 | Screenshots of every new screen in both themes | 8 | todo |  |
| R21 | Decisions on UI components | 15 | Component table followed | 8 | todo |  |
| R22 | Rewatch during the wait, no round trip | 10 | iPhone: passes tick the step, no return to Today | 6 | todo |  |
| R23 | Tabs: Today, Path, Practice, You | 4 | Emulator | 5 | todo |  |
| R24 | Today shows relevant cards by time and events | 8 | Card rule tests with a changed clock | 4 | todo |  |
| R25 | Onboarding flow | 12 | iPhone walkthrough | 7 | todo |  |
| R26 | You and Settings redesigned | 13 | Emulator walkthrough | 5 | todo |  |
| R27 | Libraries and animation researched and used | 15 | Library table followed; animation list checked | 8 | todo |  |
| R28 | Session length flexible day by day | 9 | Budget tests; a day's change doesn't alter your usual | 4 | todo |  |
| R29 | Content judged; nonsense can't score well | 6.4, 7 | Validity tests for every gate | 3b | todo |  |
| R30 | Better pitch and volume, fixed graphs | 6.5 | Signal Lab results on iPhone | 1 | doing | PRs #38 to #46. Pitch agrees with Praat about 99% on real takes, and pitch and volume count in scores. The graphs are phase 6 |
| R31 | Playback is always the 3 passes | 10 | iPhone walkthrough | 6 | todo |  |
| R32 | Rewatch is a collapsible accordion | 10 | Screen test: open if skipped, closed if done | 6 | todo |  |
| R33 | Mermaid skill tree | 6.2 | Diagrams in the plan | 3a | done | Diagrams in PLAN.md section 6.2 |
| R34 | Overall, pillars, secondary skills, leaves | 6.2 | `check:overhaul`: tree matches the plan, weights add up | 3a | done | `domain/scoring/skillTree.ts`, compared with Appendix C in `overhaulPlan.test.ts` |
| R35 | See how each skill contributes upward | 6.3 | The trail on every result | 3a | todo |  |
| R36 | Grid for every drill and lesson, and how much | 7, Appendix A | Grid coverage test | 3a | done | `content/skillGrid.ts`; `skillGrid.test.ts` for coverage, `overhaulPlan.test.ts` against section 7 and Appendix A |
| R37 | Quantifiable judging of everything | 7 | Grid coverage test: every activity has a number | 3a | done | `skillGrid.test.ts`: every catalogue activity has a row with a number |
| R38 | Rewind works for morning users | 5.3 | Rewind timing tests | 4 | todo |  |
| R39 | A reasoned rubric scale | 6.6 | 0–5 in prompts; checked against hand-rated takes | 3b | todo |  |
| R40 | Testing suite in Dev | 6.5 | Signal Lab runs every test on iPhone | 1 | done | PRs #36 to #46. Signal Lab ran on the iPhone: 18 of 21 tests, the other 3 are the content tests, blocked until phase 3b. Results in D7 to D11 |
| R41 | Research into better capture | 6.5 | Better-ways table tried and results logged | 1 | done | PRs #39 to #46. Better-ways table tried on real recordings and logged in D7 to D9. SwiftF0 tested and not needed; the audio-session experiment and Silero not needed |
| R42 | Better face and eye math, tracking kept | 6.2, 6.5 | Presence tests in Signal Lab | 1 | done | PRs #39, #43 to #45. Eye contact and face movement reworked and passing on the iPhone, tracking untouched. Eye contact counts; face movement waits for 3a to read it |
| R43 | Final levels and ranges | 6.3 | Tests on every threshold | 3a | done | `domain/levels.ts`; `levels.test.ts` on every threshold, `overhaulPlan.test.ts` against Appendix C |
| R44 | Difficulty fits scoring and keeps challenging | 6.7 | Difficulty tests, simulated user | 3d | todo |  |
| R45 | No backwards compatibility | 14 | No migration code; legacy code gone | All | todo |  |
| R46 | First take doesn't use the on-device recognizer | 12 | iPhone walkthrough; code uses Whisper | 7 | todo |  |
| R47 | Later content overhaul noted | 18 | In the plan | Plan | done | PLAN.md section 18 |
| R48 | Plan saved in the repo; ways to stick to it | 17 | Files exist; `check:overhaul` runs | Setup | done | `docs/overhaul/`, `overhaulPlan.test.ts` |
| R49 | Fix the bugs found (toast, seed, warm-up copy) | 1, 14 | Tests | 0 | done | PRs #29, #30, #31, each with tests |
| R50 | Small content checks free for signed-in adults | 6.6 | Allowance tests; real cost in the ledger | 3b | todo |  |
| R51 | One "minutes a day" number replaces two settings | 9 | Old settings gone; budget tests | 4 | todo |  |
| R52 | Feature branches merged into `staging` (DECISIONS D1), session-start hook | 17 | Hook prints the next task | Setup | done | `.claude/settings.json`, `scripts/overhaul-status.mjs` |
| R53 | Clean the repo on `staging` first, then branch off | 14 | `docs/decisions/cleanup-2026-11.md` exists; all checks pass | −1 | done | `docs/decisions/cleanup-2026-11.md`; C.5 still open for the owner's answers |
