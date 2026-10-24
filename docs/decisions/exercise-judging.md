# Exercise judging: Word Chain, Bridge Chain and Rewind

Session 10, 2026-10-23. Branch `feature/exercise-judging`. Builds on `scoring-taxonomy.md` (the AnalysisService) and `inference-strategy.md` (the evidence-quoting prompt shape).

The idea in one line: **the phone hears and counts, Tono AI says whether it made sense, and the phone refuses any answer it can't check against what was really said.** Free users keep the exercises with counted facts only.

## Contents

1. [What changed](#1-what-changed)
2. [Word Chain: what "makes sense" means](#2-word-chain-what-makes-sense-means)
3. [Bridge Chain: is it a different exercise?](#3-bridge-chain-is-it-a-different-exercise)
4. [Rewind: what was wrong and what is checked now](#4-rewind-what-was-wrong-and-what-is-checked-now)
5. [Evaluation: what was run, and what was not](#5-evaluation-what-was-run-and-what-was-not)
6. [Cost, allowance and privacy](#6-cost-allowance-and-privacy)
7. [Decisions for you](#7-decisions-for-you)
8. [Notes for sessions 08 and 09](#8-notes-for-sessions-08-and-09)

---

## 1. What changed

| | Before | Now |
|---|---|---|
| Word Chain | any new content word was a "link", so nine unrelated words passed | each link judged strong, loose (a stretch) or none, once, when the attempt ends; the score follows |
| Bridge Chain | counted the word "because" (and "since", "cuz" ...), so "ink because octopus because river because" scored 4 links | each step judged explained, vague or unexplained, with the reason quoted back |
| Rewind notes | free-text "coverage" note written by the model; "most vivid" and the day parts unchecked | structured coverage with a verbatim quote per part; the coverage sentence is written by the phone from the checked statuses; every quote checked; contradictions refused |
| Rewind "The day you covered" | phone keywords only; **showed 1 of 3 on the full-day transcript** | wider keywords (office, meetings, drove home, in bed, nap ...) and, once notes exist, the judge's checked read |
| Intro text of both chains | one paragraph each, no mention of how they differ or how they are scored | rewritten (section 3), plus a "how it's scored" line |

New analysis kinds `word_chain` and `bridge_chain`; `rewind_notes` reworked. All three are **Tono AI only** (`SUPPORTED` in `domain/analysis/routing.ts`): judging them is part of Plus and was never built for an own key. The prompts are on the server, in `supabase/functions/_shared/prompts/exercises.ts` (moved there by session 08).

No migration was needed.

## 2. Word Chain: what "makes sense" means

**The rule.** Each word only has to connect to the word right before it, never to the start. After a long silence the app shows a fresh start word, and the next word links to that one (so a stall never causes a false "no link").

**A link is judged:**

- **strong** (counts 1): an ordinary listener sees the connection within a couple of seconds. These kinds all count: same group (dog, cat), part and whole (wheel, car), used with or made from (pen, ink), where it lives or happens (octopus, aquarium), cause and effect or what comes next (rain, umbrella), opposites (hot, cold), a common phrase or compound (fire, truck), a well-known saying, title, character or song (moon, cheese), a word with two meanings that bridges (bank, river).
- **loose** (counts 0.5): a real connection that takes a stretch or a personal story to see.
- **none** (counts 0): no sensible connection. Sounding alike, rhyming or the same first letter do not count by themselves; repeating a word or a form of it is not a new link.

Surprising or silly links are fine if the connection can be named. Because words come from live speech recognition, the judge is told to give the benefit of the doubt to a word that looks like a mis-hearing of one that would connect, and to say so.

**Score.** `(strong + 0.5 * loose) / target`, capped at 1, minus the existing small cost for each fresh start after the first (never for people who stutter). Pass at 0.8 as before. Example, target 8: 4 clear, 2 a stretch, 3 that didn't connect = 5 / 8 = 63%, not passed. The weights are constants in `domain/drills/chainJudging.ts` (`LINK_CREDIT`).

**When.** Once, at the end of the attempt, while the button reads "Checking your links..." (a short text call, 15 s limit). Judging as it goes would cost a call per word and make the drill laggy. The attempt is recorded after the judgement, because a drill result moves skill ratings and can't be amended afterwards.

**What is shown.** A "Link by link" list: a green tick for strong, an amber minus and "a stretch" for loose, a red cross for none, each with the judge's reason (at most 10 words), then "Checked by Tono AI from the words you said" and a line that a misheard word can look like a broken link.

**Offline, signed out or over the allowance.** The attempt is scored the old way (words counted) and the summary says "counted, not checked", with one line on why ("Couldn't reach Tono AI ...", "Tono AI can check that each link makes sense ..."). Nothing is queued: a drill result can't be re-scored after it has moved a rating (see decision 4). Nothing asks for sign-in or consent in the middle of a drill.

**What is sent.** Only the numbered word pairs of the attempt. No audio, no transcript beyond those words, no measurements.

**Validation.** The answer must contain exactly one verdict for every pair (by number); the words shown are the phone's own, never the model's wording. A missing or invalid answer is sent back once with the problem named; a second failure falls back to counting.

**A fix found on the way.** The timer that ends a timed attempt ran from an older render and saw only the first start word, so a timed-out attempt reported 0 fresh starts and counted the fresh words as links. The screen now keeps the start words and run boundaries in refs.

## 3. Bridge Chain: is it a different exercise?

**Read as a first-time user,** the old intro for Bridge Chain was: "Start from X. Say the next word and why it connects ... Target: N links with a reason." What was unclear:

- It never said Word Chain is the other one, or how this differs. Both start from a word, both reset on a fresh word, both show the same screen. Only the invisible rule differed.
- "Why it connects" was unexplained: say it in the same breath? As a sentence? What counts as a reason?
- Scoring was invisible, and wrong: it counted occurrences of "because", "since", "cuz", "reminds me of" and similar. Saying "because" with nothing after it scored.
- Word Chain's intro said "a word it makes you think of", which sounds like private association, so there seemed no reason to ever explain.

**What each trains, honestly.**

- **Word Chain** trains *retrieval speed and recovery from a blank*: the next word keeps coming, and when it doesn't you take the fresh word and carry on. It sits under Impromptu - Fluency ("words that keep coming"). Explaining is not part of it. With the old counting it didn't even train association quality.
- **Bridge Chain** is meant to train *saying why one idea leads to the next*: the transition skill under Impromptu - Clarity ("sentences that move forward") and the conversation skill of staying on the thread. That is a real, different skill, and the lesson `imp_chain` ("Keep the thread") already presents it as the second step after Word Chain.

**Are they too similar?** As built, yes, in everything the user sees: same input (words from a start word), same stall mechanic, same screen. The skill difference is real but was not visible or measured. My recommendation is **keep both, but make the difference loud and measured**, rather than merge or remove:

1. Say it in the first line of each intro: Word Chain is about speed ("no reasons needed, just speed"); Bridge Chain is about the reason ("Word Chain is about speed. This one is about the reason").
2. Judge what each is about: Word Chain judges whether the *links* make sense, Bridge Chain judges whether the *reasons* are real.
3. Keep Bridge Chain slower and shorter (targets 3 to 8 links, 45 to 60 s, a longer grace) so it can't be mistaken for a speed drill.

**New intro text** (`domain/drills/prepareDrill.ts`):

- Word Chain: "Start from "pen". Say a word that goes with it, then a word that goes with that one, and keep going fast: pen, ink, octopus, aquarium. Each word only has to make sense next to the word right before it, so wander wherever you like. No reasons needed, just speed. Target: 8 good links in 30 seconds. Go quiet for 3 seconds and a fresh word appears; just pick up from there."
- Bridge Chain: "Word Chain is about speed. This one is about the reason. Start from "pen". Say a word that goes with it, then say why: "ink, because a pen writes with ink." Then do the same from your new word: "octopus, because octopuses squirt ink." Fewer links than Word Chain, but every one needs a real reason. Target: 3 explained links in 45 seconds. Go quiet for 4 seconds and a fresh word appears; just pick up from there."
- How it's scored, under each: what Tono AI checks, the weights, and that without Tono AI the phone only counts.
- The lesson "Keep the thread" no longer says "weird ones count" (it contradicted judging); it says surprising links are fine "if you could explain them", and explains what the bridge chain adds.

**How Bridge Chain is judged.** The judge gets what was said after each start word (speech-recognition text, no punctuation), splits it into steps and returns for each: the word moved to, the reason **copied word for word**, a verdict and a short note.

- **explained** (1): a specific connection that is true or reasonable and really links these two words.
- **vague** (0.5, shown as "thin" internally): a reason was given but it is circular or too general ("because they go together", "because it's related") or barely links the pair.
- **unexplained** (0): no reason, or the reason is about something else or plainly wrong.
- "because" alone is not a reason. A far-fetched link is fine if the reason explains it clearly.

The phone drops a step whose word was never said, and downgrades a step whose quoted reason is not in what was said to at most half credit. The score is `(explained + 0.5 * vague) / target`. "ink because octopus because river because banana because" now scores 0.

**Where the right call is to change the exercise, not just the judge.** One idea, not built: make Bridge Chain a genuine *bridge* by giving two distant words ("pen" to "ocean") and asking for the shortest explained path. It would be visibly different from Word Chain, the name would finally mean something, and "reached the end word" is an easy extra check. It needs new content (word pairs with a good short path) and a design pass, so it is a decision for you, not part of this PR.

## 4. Rewind: what was wrong and what is checked now

**Where reviews are produced.** `services/rewind/rewindReview.ts` asks the AnalysisService for `rewind_notes`; the Tono AI provider (`services/analysis/providers/tonoAi.ts`) names the task and sends the transcript; the server writes the prompt (`supabase/functions/_shared/prompts/exercises.ts`); the result is stored by `RewindResultScreen` in `day_recalls.review_json`.

**What went wrong on your transcript.** Two things, not one:

1. **The hero card was wrong, and that is not AI.** "The day you covered" is computed from keywords (`domain/rewind/stats.ts` `dayCoverage`). On your transcript it returned morning only: no "lunch", "afternoon" or "evening" appears, "the office" and "meetings" weren't keywords, and "9:19" has no am or pm. So the card said 1 of 3 parts of the day came up. That is almost certainly the "only the morning" you saw.
2. **The notes' coverage line was a free-text sentence from a prompt that never defined the parts of the day** ("a focus on the morning and afternoon"), and nothing checked it. The "most vivid" quote was not checked to be a quote either.

**Now:**

- **Keywords** widened: midday gets office, meeting(s), at work, left work, class, errands; evening gets drove/came/headed home, in bed, to bed, nap. Your transcript now reads morning, midday, evening.
- **The prompt** (evidence-quoting shape from session 04) defines morning (waking to about noon), midday (noon to about 5 pm, including the working day and "left work at 4") and evening (about 5 pm to bed, including a nap after work and telling the story at night), and gives three statuses: covered, brief, missing. It requires a word-for-word evidence quote per non-missing part, and one whole moment (5 to 40 words) copied exactly as "most vivid". The model no longer writes the coverage line.
- **The phone checks** (`domain/rewind/reviewPrompt.ts` `checkRewindReview`), and asks the judge once more, naming the problem, if any of these fail:
  - the shape is right, every note says something, none is a score;
  - every evidence quote is in the transcript word for word (a near-miss is snapped to the transcript's own words);
  - no note contradicts the statuses ("you only covered the morning" when three parts are covered);
  - a part called missing isn't one the phone's keywords plainly find (on the second try the judge is trusted, since "last night" can fool the keywords);
  - the "most vivid" line is the transcript's own words and a real moment (on the second try a bad one is left out rather than shown).
  If the second answer still fails, **no notes are shown** (the error says they didn't check out against what you said) and the hero keeps the phone's keyword read. Nothing unchecked is displayed.
- **The coverage sentence** is written by the phone from the checked statuses, so it can't disagree with them: "All three parts of your day came up with real detail: the morning, midday and evening." or "You told the morning part with real detail. The midday and evening didn't come up."
- **The hero** uses the checked statuses when notes exist and says "Read by Tono AI"; the notes caption now reads "Written by Tono AI from your transcript, with every quote checked against your words. Not a score."
- Unchanged rules: no pause, content only, no score. Notes still only on request (consent shown first), words only sent.

## 5. Evaluation: what was run, and what was not

**No model was called.** There is no API key in this environment, no llama.cpp build and no GGUF models on this machine (the session 04 folder, `C:\dev\tono-models`, doesn't exist), and the rules forbid paid calls. So the accuracy of the *judge* on these prompts is **unmeasured**. What is measured is everything the phone does around the judge, with scripted model answers:

| Check | Result |
|---|---|
| Phone keywords on your real transcript (read from the session 10 prompt file, never committed) | before: morning only. now: morning, midday, evening |
| The old failure ("evening: missing" on your transcript) as a model answer | refused, with "You marked the evening as missing ..." sent back for one retry |
| A good three-part answer on your real transcript, with your own "I was extremely tired ... nap" line as most vivid | accepted; coverage "All three parts ..."; the vivid line is verbatim |
| Notes that say "you only covered the morning" while three parts are covered | refused as contradictory |
| Morning-only transcript, scripted correct answer | kept; "The midday and evening didn't come up." |
| Thin transcript (all brief), rich transcript (all covered) | kept as scripted; a 3-word "most vivid" is refused, then left out |
| Made-up evidence quote | refused twice, so no notes are shown |
| Near-miss quote | snapped to the transcript's own words |
| Word Chain: nine unrelated words | old: passes (nine "links"). now with an all-none judgement: 0%, not passed |
| Bridge Chain: "ink because octopus because river because banana because" | old: passes; now with an all-unexplained judgement: 0 |
| A judge that skips a link, or invents a verdict, or steps for words nobody said | refused (retry once) or dropped |

Test files: `src/domain/__tests__/rewindJudging.test.ts` (20 tests, 2 of them reading the real transcript when `TONO_REAL_REWIND_PROMPT` points at the prompt file), `chainJudging.test.ts`, the new cases in `services/analysis/__tests__/providers.test.ts`, and the routing tests.

**Test transcripts** are in `spikes/inference-eval/cases_synthetic.json`: morning-only, thin, rich and afternoon-and-evening from session 04, plus `rewind_day_with_nap` (a made-up lookalike of your transcript with the same shape), and four Bridge Chain cases with gold verdicts (all explained, no reasons, mixed, "because" gaming).

**The hosted run you do next** measures the judge itself. The eval now sends the app's real prompts (`spikes/inference-eval/app_prompts.json`, generated from the server prompts and kept equal by `services/analysis/__tests__/evalPrompts.test.ts`; after changing a prompt run `UPDATE_EVAL_PROMPTS=1 npx jest evalPrompts`):

```bash
export GEMINI_API_KEY=...   # your paid key; never commit it
python -I eval.py --backend gemini --model gemini-3.5-flash-lite --label flash-lite \
  --rewind-prompt ~/.claude/plans/tono-session-prompts/10-exercise-judging.md \
  --out C:/dev/tono-models/eval-results --thinking-budget 512 --only rewind,word_chain,bridge_chain
python -I eval.py --score C:/dev/tono-models/eval-results
```

**Pass bars** (device test plan, section G): Rewind parts of the day right on all 6 cases including your real one, on every run; evidence quotes verbatim 95% or more; Word Chain links 90% or more with every broken link caught; Bridge Chain steps right 80% or more, credit never more than 10% above gold, and the "because" gaming case at 0 credit.

**Prior evidence** (session 04, structured prompt, local models): Gemma 4 E2B and Qwen3.5-4B got all parts of the day right on all 5 transcripts and 66 to 68 of 76 Word Chain links; 1 to 2B models failed. The prompts here are the same shape with the extra definitions above, so the hosted run is expected to pass, but that is an expectation, not a result.

## 6. Cost, allowance and privacy

- A Word Chain or Bridge Chain judgement is one short text call, about 0.35 cents on Flash-Lite (session 04's text-call estimate). A Rewind judgement is the same. A retry (only when the first answer fails the phone's checks) is a second call.
- **Allowance:** these calls come out of the Plus text-call allowance. The server default is `plusMonthlyTextCalls: 100` (`supabase/functions/_shared/config.ts`), and text-judged takes, Say it short, Mark it up and Rewind notes draw on the same 100. Someone who does a few chains a day would run through it. That setting is session 08's; the number needs raising or the exercise judges need their own allowance (decision 5).
- **Privacy:** Word Chain sends the numbered word pairs; Bridge Chain sends the words said after each start word; Rewind sends the transcript (as before). No audio, video or measurements. The consent copy (session 08) should say so.

## 7. Decisions for you

Each is built as recommended and reversible.

1. **Keep both chain drills; reframe, don't merge.** Word Chain is speed and recovery; Bridge Chain is giving the reason. Built: new intros, judged separately. The alternative that would make Bridge Chain truly different is the two-word "pen to ocean" bridge (section 3); say if you want it designed.
2. **A stretch counts half, a link that doesn't connect counts nothing.** If you'd rather be generous (a stretch counts in full) or strict, it's `LINK_CREDIT` in `domain/drills/chainJudging.ts`. Vague Bridge Chain reasons also count half (`BRIDGE_CREDIT`).
3. **The exercise judges are Tono AI only**, not own key, per the plan. Until session 08 removes own-key, someone with an own key gets a "This one is Tono AI only" prompt from the Rewind button; their Rewind notes no longer come from their own key.
4. **No queued judgement.** If Tono AI isn't reachable when a chain attempt ends, the attempt is scored by counting and says so; it is not re-scored later. A chain result moves skill ratings and the drill level at once, and can't be unwound, so queueing would mean holding the result back. Recommended: accept the offline gap for now. Alternative: hold the result until online (worse for a drill you do on a train).
5. **The 100-a-month text allowance is too small once drills are judged.** Recommend session 08 either raises it (100 more calls cost about 35 cents) or gives the exercise judges their own pool. I did not touch the server config.
6. **A failed Rewind check shows nothing rather than something unchecked.** After two failed answers the notes aren't shown (and the hero keeps the phone's keywords). If you'd rather show the notes minus the failing parts, say so.
7. **The real transcript isn't committed** (the repo is public). The regression runs on a made-up lookalike in the repo and on your real one when you set `TONO_REAL_REWIND_PROMPT`.
8. **The phone's Rewind keywords were widened** (office, meetings, drove home, nap ...), so free users no longer see "1 of 3" on an ordinary workday. They can still over-read ("last night", "in bed" in the morning).

## 8. Notes for sessions 08 and 09

- **AnalysisService public shape:** unchanged apart from two new members of the `AnalysisKind` union (`word_chain`, `bridge_chain`), their entries in `InputMap` / `OutputMap` / `PROMPT_VERSIONS` and `SUPPORTED`. `RewindReview`'s stored shape changed (new `parts`, `coverage` written by the phone, optional `vividDetail`); nothing reads old rows except one `?.` in the result screen so a leftover row can't crash it.
- **08:** `prompts.ts` now also holds the Rewind system prompt (it used to be in `domain/rewind/reviewPrompt.ts`) and the Word Chain / Bridge Chain prompts. `providers/ownKey.ts` lost its Rewind branch (small edit; delete the file as planned). `gate.ts` `prepareFor` has a small `TONO_ONLY` guard that can go with own-key. The retry loop (`askChecked` in `providers/tonoAi.ts`) is the pattern for any judge whose answer the phone can check; on the server it becomes a loop around the same validators, which stay in `domain/`.
- **09:** `RewindResultScreen` changes are three small edits: the hero reads `coverage` (checked statuses if present, else the keywords), "Most vivid" is conditional, and the caption text. The notes can take twice as long when a retry happens.
