# Scoring taxonomy, the two result layers, and the AnalysisService

Session 07, 2026-10-23. Branch `feature/analysis-service`.

Status: **built, with the open choices listed at the end for Ahmad.** Sessions 08 to 11 read this first. The code that holds it:

- the taxonomy: `src/domain/scoring/taxonomy.ts`
- the measurement bands: `src/domain/scoring/bands.ts`
- the two score sheets: `src/domain/scoring/takeScore.ts`
- the AnalysisService: `src/domain/analysis/` and `src/services/analysis/`

## Contents

1. [Summary](#1-summary)
2. [Audit: what the app shows and stores today](#2-audit-what-the-app-shows-and-stores-today)
3. [Audit: every inconsistency](#3-audit-every-inconsistency)
4. [What "face-voice match" is, and why it goes](#4-what-face-voice-match-is-and-why-it-goes)
5. [The taxonomy](#5-the-taxonomy)
6. [How the taxonomy meets the curriculum](#6-how-the-taxonomy-meets-the-curriculum)
7. [Two layers: measured and judged](#7-two-layers-measured-and-judged)
8. [The new signals from sessions 05 and 06](#8-the-new-signals-from-sessions-05-and-06)
9. [AI as ground truth, and opting a take in or out](#9-ai-as-ground-truth-and-opting-a-take-in-or-out)
10. [The AnalysisService](#10-the-analysisservice)
11. [What was migrated, and what was deleted](#11-what-was-migrated-and-what-was-deleted)
12. [What later sessions do with this](#12-what-later-sessions-do-with-this)
13. [Where your intent and the code disagreed](#13-where-your-intent-and-the-code-disagreed)
14. [Decisions for you](#14-decisions-for-you)

---

## 1. Summary

**The audit.** The app had three scoring systems that didn't know about each other, plus two dead ones:

- **The take score** (`sessionScore.ts`): 5 categories, each a blend of phone and AI numbers by "trust weights".
- **The AI rubric** (the Gemini review): a different set of 5 groups, shown raw on the Scores tab and on Trends.
- **The mastery evidence** (`repEvidence.ts`): yet another grouping, by curriculum skill, with its own blend.
- **The dead ones**: the old curriculum engine's composite scores, and the "rich delivery" score.

That is why the Impromptu Overview and Scores tabs disagree: they are different systems with different names, groupings and numbers (section 3, item 1). Around them, the same measurement had up to five different "good" bands, fillers were counted twice, and several numbers were noise that scored full marks on every take.

**The taxonomy.** One structure, used everywhere:

- **Main categories are the five curriculum skills**: Articulation, Cadence, Impromptu, Confidence, Conversation. Only Cadence, Impromptu and Confidence are scored on a recorded take; the other two are drill skills.
- Each skill has **subcategories**: Cadence is Pace, Pauses, Pitch variety, Emphasis, plus Tone fit (shown, not totalled). Impromptu is Structure, On the point, Clarity and Fluency. Confidence is Eye contact, Expression and Conviction, plus Body language (shown, not totalled).
- Each subcategory is fed by named **metrics**.
- A take's category score **is** its skill score, and it is what moves mastery, so a take, its breakdown and your skills all use one vocabulary.
- **Cut**: face-voice match, the archetype, the judge's own "overall", the head-level score, tension, and the old volume variation.

**Two layers.**

- **Measured**: every take, the same formula for everyone, from the phone.
- **Judged**: Tono AI, the ground truth on the takes that have it. The judge gets the phone's measurements and scores from them.
- The take's score is the judged one when there is one. Scores are only ever compared within a layer.

**The AnalysisService.**

- One typed result per kind of analysis: take review, coaching, Rewind notes, summary notes, mark-up.
- Providers sit behind it: Tono AI, the rules, and your own key until session 08 removes it.
- Routing is one pure function. Every result carries its provenance, and degradation is explicit.
- **The Tono AI take review now judges from the transcript and the measurements by default**, a text-only call, with the video as a setting.
- All five consumers were migrated. Apple Intelligence judging is deleted.

---

## 2. Audit: what the app shows and stores today

Audited on `staging` at 1501617, before this branch changed anything.

### 2.1 The take score (Result → Overview, "How this score is built")

Computed in `src/domain/sessionScore.ts` (`computeSessionScore`), stored as the `session_score` artifact and `sessions.session_score`. 0 to 10.

| Category (shown name) | Weight | Phone part | AI part | How they combined |
|---|---|---|---|---|
| Voice & pace | 25% | mean of Pace (full marks 130 to 160 wpm), Pauses at full stops (full at 60%), Pitch range (full at 110 Hz) | mean of the rubric's rate, volume, pitch and melody, tonality, pausing | AI share 70% (video judge) or 50% (text judge) |
| Fluency | 15% | mean of Filler words (2 a minute free, then 0.8 each) and Stalls (2 a minute each) | none | phone only. The filler rate came from the AI's transcript when a video review existed. |
| Structure & content | 30% | Shape (8 if the keyword rules found a framework, 4 if not), capped at 5 when the rep's target framework was missed, ±1 for the ending, up to −2 for hedges | mean of structure, relevance, coherence | 85% / 75% |
| Presence | 20% | 0.6 eye contact (full at 75%) + 0.3 expression (full at 30/100) + 0.1 head level | mean of eye contact, facial expressiveness | 75% / 40% |
| Face-voice match | 10% | none | face_voice_congruence_score | AI only |
| **Overall** | | weighted mean of the categories | plus **the AI's own overall_score at 25% (video) or 15% (text)** | |

Where the overall shows:
- Result: the hero ring and "vs last session".
- Library: the score ring on each take, the month average, and the progress video strip.
- Trends: "Overall" and its chart.
- Progress moments: the score beat, and "your best".

### 2.2 The AI rubric (Result → Scores, and Trends)

Written by the Gemini review prompt (`src/services/gemini/schema.ts`), stored in the `scores` table, and shown raw:

- **Scores tab** radar, 5 axes:
  - Structure.
  - Content: the mean of relevance and coherence.
  - Delivery: the mean of rate, volume, pitch and melody, tonality and pausing.
  - Presence: the mean of eye contact and facial expressiveness.
  - Congruence.
- **Scores tab** accordions:
  - Structure (with `structure_used`).
  - Content: "Relevance to prompt", "Coherence & storytelling".
  - Delivery: "Rate" (with wpm), "Volume", "Pitch & Melody", "Tonality", "Pausing", plus the pace sparkline and the pitch and volume chart.
  - Presence: "Eye Contact", "Facial Expressiveness", plus the body-language note.
  - Face-Voice Congruence.
  - Cue Compliance (marked scripts only).
- **Hero:** the archetype (Motivator, Educator, Coach, Friend) and "archetype fit".
- **Coaching card:** summary, strength, focus, next drill.
- **Transcript annotations:** structure, delivery, presence, content, restated point.
- **Trends ("Deep review trends")**, reviewed takes only: Overall, Structure, Delivery (the mean of the 5 vocal scores), Coherence, Repeated ideas a minute, and the top archetype.

### 2.3 The coach card (Result → Overview)

`src/domain/coach/ruleCoach.ts`. It gives:
- one strength, one tip, a focus skill and a follow-up question;
- **observations**, each with a verdict dot (good, ok, work):
  - Cadence: Pace, Pauses at full stops, Pitch range.
  - Impromptu: Fillers, Structure.
  - Confidence: Eye contact (or "Facing the lens"), Head level, Face in frame.

Hedges, the ending, stalls, a slow start and rambling cues only ever became tips. Where it came from:
- written by the rules;
- reworded by Apple Intelligence on iPhones that have it;
- or replaced by Tono AI's `quick_coach`.

### 2.4 Other places a take is measured or scored

| Where | What | Computed in |
|---|---|---|
| Result → "Since your last take of this prompt" | Pace (target 145 wpm), Fillers, Eye contact, better or worse | `ComparisonCard.tsx`, `statsRepo.getPromptComparison` |
| Result → "Your numbers" (only when there's no coach card) | wpm, fillers a minute, pitch range in Hz | `ResultScreen.tsx` |
| Result → Transcript | filler highlights, repeated words, the AI's annotations | `transcriptAnnotations.ts` |
| Progress → Your recordings | Pace, Filler words, Eye contact over the last 30 takes | `statsRepo.getSessionMetricSeries` |
| Felt vs observed | 1 to 5 before and after watching | `FeltObservedCard.tsx` |
| Onboarding skill check | 0 to 10 per skill with its own formulas, a rating seed of 15 to 45, "observed" 1 to 5 | `skillCheck.ts` |
| Path reasons | "your pitch stayed narrow" (under 50 Hz), "about N words a minute" (over 175) and others | `content/pathTargets.ts` `CHECK_SIGNALS` |

### 2.5 Skills, levels and progress

| Number | Scale | Where |
|---|---|---|
| Skill rating | 0 to 100 (Elo-like) | `mastery.ts`; Skill detail ring, Progress mastery rings |
| Stage | Foundations, Building, Steady, Strong, Polished | `levels.ts`; Level, Skill detail, celebrations |
| Speaker level | 1 to 21 (sum of stages minus 4) | `levels.ts`; Level screen |
| Drill level | 1 to 10 per drill type (staircase) | `mastery.ts`; Progress → Drill levels |
| Drill score | 0 to 1, shown as % | `drillSpecs.ts`; Progress → Drill scores |
| Practice difficulty ("step") | 1 to 5 | `curriculum.ts` and `curriculumRepo.ts`; Home chip, Trends, Level and difficulty |

**What moved a skill after a take** (`repEvidence.ts`):

1. The coach's verdicts as 0.9 / 0.6 / 0.3 per skill.
2. Blended with the rubric at 70% (video) or 50% (text), regrouped differently again:
   - Cadence = rate, pitch, pausing, tonality.
   - Impromptu = structure, relevance, coherence.
   - Confidence = eye contact, face, **volume**.

### 2.6 Dead code

`evaluateCurriculum`, `computeSpontaneousComposite`, `computeDrillComposite`, `computeOverallComposite` and `computeRichDeliveryScore` in `src/domain/curriculum.ts` had no callers since the path engine. Yet `recomputeCurriculumLevel` still ran the composite query and the "rich delivery" maths on every Home, Trends and Curriculum focus, then threw the result away.

---

## 3. Audit: every inconsistency

**Scores that disagree**

1. **Overview versus Scores, the case you noticed.** They are two different systems:

   | | Overview | Scores tab |
   |---|---|---|
   | Categories | Voice & pace, Fluency, Structure & content, Presence, Face-voice match | Structure, Content, Delivery, Presence, Congruence |
   | Numbers | phone and AI blended, with trust weights | the AI's raw rubric |
   | Fluency | its own category | missing |
   | Structure | inside "Structure & content" | its own category |

   Presence also means a different mix on each tab (2.1 versus 2.2). The overview's "Voice & pace 6.8" and the Scores tab's "Delivery 5.4" can be the same take.
2. **The hero number wasn't a summary of anything shown.** It was 75% the category mean and 25% the AI's own "overall" (which the prompt asks it to weigh "as equal pillars", including congruence). So the overall could sit outside the range of every category on screen.
3. **The same take's fluency changed when it was reviewed.** The filler rate switched from the phone's count to the AI transcript's count once a video review landed.
4. **Mastery didn't move by the score.** A take could score 8 in "Voice & pace" and still move Cadence on a "work" verdict, because mastery used verdict buckets and a different grouping (2.5).
5. **Comparisons mixed kinds of score**:
   - "Vs last session" set a blended (AI-reviewed) score against a phone-only one.
   - So did the progress moment's "your best" and the Library month average.
   - Trends' Overall used `COALESCE(session_score, model overall)`.

**The same thing with different names**

6. Different names for one subcategory:
   - **Pace**: "Pace" (coach, comparison, Progress), "Rate" (Scores tab), "rate" (rubric).
   - **Pitch**: "Pitch range" (Overview, coach), "Pitch & Melody" (Scores tab), "pitch_melody" (rubric).
   - **Clarity**: "Coherence" (Trends), "Coherence & storytelling" (Scores tab).
   - **Eye contact**: "Eye contact" or "Facing the lens" (coach), "Eye Contact" (Scores tab).
   - **Face-voice match**: "Face-voice match", "Face-Voice Congruence", "Congruence" (radar).
7. One feature, four names: **"deep review", "AI review", "AI coach", "Tono AI"**, sometimes on the same screen ("Your AI coach" in the breakdown, "Deep review" on the steps card).

**Different things with the same name**

8. "Delivery" on the Scores tab and Trends is the 5 AI vocal scores. On the Overview the closest thing is "Voice & pace", a phone and AI blend.
9. "Presence":
   - phone: eye contact 60%, expression 30%, head level 10%;
   - AI: the mean of eye contact and expression;
   - mastery: eye contact, expression and **volume**.
10. "Structure":
    - phone: a keyword heuristic over named frameworks (PREP, STAR, story and others);
    - AI: Abrahams' framework with a different list (what/why/how, story arc, other).

    Both show as "Structure".
11. "Content" includes structure on the Overview, but excludes it on the Scores tab.

**Bands that disagree** (what counts as good)

12. **Pace**:
    - score: full marks at 130 to 160;
    - coach: good at 125 to 165, ok at 105 to 185, a tip above 175;
    - comparison card: aims at 145;
    - skill check: good at 125 to 165;
    - path reason: above 175;
    - drills: their own targets.
13. **Fillers**:
    - score: 2 a minute free;
    - coach: good up to 3, work above 6;
    - skill check: good up to 3, work above 6;
    - AI prompt: "5 a minute is barely noticeable".
14. **Eye contact**:
    - score: full marks at 75%;
    - coach: good from 70%, work below 50%;
    - skill check: full marks at 70%, good from 65%;
    - path reason: below 40%.
15. **Expression**: full marks at 30 in the score, 60 in the skill check; the coach's "your face stayed still" fires below 12.
16. **Pitch**: full marks at 110 Hz in the score; the coach says work below 60; the skill check and the path say narrow below 50.

**Counted twice, or in the wrong place**

17. **Fillers counted twice.** The AI prompt told the judge to lower **rate** for fillers, and the phone also scored them under Fluency. "Kind of" and "sort of" are on both the filler list (Fluency) and the hedge list (Structure & content).
18. **Volume** went to Delivery in the score but to Confidence in mastery.
19. **Hedges and the ending** went to Content in the score, but to Confidence in the coach card and in the path ("con_authority": "hedges softened your points / the ending trailed off").

**Metrics that are noise, or that nobody can act on**

20. **Head level**: 0% tilted on every take with the phone on a stand, so 10% of Presence was free marks.
21. **Expression** includes jaw movement, which moves with every syllable: 37 to 46 on the samples against a full-marks bar of 30, so always full marks (session 05).
22. **Tension**: 0% on every sample.
23. **Smile %**: 0 to 2% at a 0.5 cut-off.
24. **Blinks**: undercounted at 10 Hz or less. Shown, never actionable.
25. **Pitch range in Hz**: from 6 to 9% of the voice, and biased against low voices (session 05, section 2).
26. **Volume variation**: the SD of dBFS including silence, so it measured how much you paused. It fed the reviewer prompt and the dead "rich delivery".
27. **Face-voice match**: see section 4.
28. **Archetype**: a label that changed take to take, tied to no drill.
29. **The judge's own overall**: see item 2.
30. **Phone Presence** scored 9.2 to 10 on takes the video reviewer gave 4.5 to 6.5 (items 20 and 21, plus untuned eye contact).
31. **The text-only judge** (your own OpenAI or Claude key) was asked to score "presence" and "congruence" from the phone's numbers, so it restated the measurements as judgements.
32. **Scripted readings**: the rubric scores structure and content at a flat 7 "not applicable", and those 7s fed the radar and averages like real scores.

**Other things**

33. **Two coaching blocks on one screen**: the coach card (tip, focus skill) and the Coaching card (summary, strength, focus area, drill). With Tono AI both come from the same call but different fields, and can name different focuses.
34. **Many scales**: take 0 to 10, drill %, rating 0 to 100, drill level 1 to 10, step 1 to 5, five stages, speaker level 1 to 21, felt and observed 1 to 5. Each has a reason, but section 6 says which ones a person should see.

---

## 4. What "face-voice match" is, and why it goes

It is `face_voice_congruence_score`: Gemini's 1 to 10 for "do facial expression and vocal tone actually match, or does one contradict the other". It came from Vinh Giang's teaching. It was 10% of the overall, with no phone part, so it only existed on video-reviewed takes.

**Recommendation: cut it (done).**

- **Gemini can't measure it.** It samples the video at about 1 frame a second (session 05), so it can't line a facial expression up with the syllable it went with. It can only give a general impression.
- **It duplicates two things the taxonomy keeps.** "Does your tone suit what you're saying" is **Tone fit** (Cadence), and "does your face move with your words" is **Expression** (Confidence).
- **Nobody can act on it.** "Make your face match your voice" isn't a drill. A flat face or a flat voice is, and those are already scored.
- **It made text-judged takes incomparable.** A judge that only reads the transcript can't see a face, so the category existed on some takes and not others.

What's kept of the idea:
- The judge's Tone fit note can still say "your voice was bright but your face stayed still".
- Session 06's expression metric without the jaw makes the face side measurable on the phone.

---

## 5. The taxonomy

Source of truth: `src/domain/scoring/taxonomy.ts` (`SKILL_DEFS`, `SUBCATEGORIES`, `METRICS`, `CUT_FROM_SCORES`). Screens take their names from there.

### 5.1 Skills, subcategories, metrics

**Measured** means the phone has a formula (`bands.ts`). **Judged** says what a judge needs to score it: "text" (the transcript and measurements are enough) or "media" (it has to hear or see the take). **In total** means it counts toward the skill and overall scores.

| Skill (share of a take) | Subcategory | Means | Measured | Judged | In total | Metrics (scored ones in bold) |
|---|---|---|---|---|---|---|
| **Cadence** (30%) | Pace | how fast you talk while talking, and whether it suits the moment | yes | text | yes | **speaking rate**; articulation rate*; pace changes* |
| | Pauses | pausing where a thought ends, not inside one | yes | text | yes | **pauses at full stops**; mid-phrase pauses; pauses a minute; longest pause; breaths* |
| | Pitch variety | how much your voice rises and falls | yes | text | yes | **pitch range (semitones*)**; pitch variety (SD)*; voice heard* |
| | Emphasis | leaning on the words that matter | yes* | text | yes | **emphasis (syllable peaks)***; loudness range* |
| | Tone fit | whether the tone suits the words | no | media | **no** | (judged only) |
| | Following the marks | marked scripts only | no | text | yes (scripts) | (judged only) |
| **Impromptu** (45%) | Structure | a point up front, support, a clear finish | rules | text | yes | **shape**; point up front |
| | On the point | answered this prompt, specifically | no | text | yes | |
| | Clarity | clear sentences that move forward, no circling back | no | text | yes | repeated ideas (from the judge) |
| | Fluency | words that keep coming | yes | (measured only) | yes | **ums and uhs**; **like, actually…*** (half weight); **stalls**; repeated words; time to first word |
| **Confidence** (25%) | Eye contact | on the lens, as if it were someone's eyes | yes | text | yes | **on the lens**; looking down; looking up*; longest look away |
| | Expression | a face that moves with the words | yes | text | yes | **expression** (without the jaw from 06); smiling; eyebrow lifts |
| | Conviction | few hedges, an ending that lands | rules | (measured only) | yes | **hedges**; **ending** |
| | Body language | posture, gestures, energy | no | media | **no** | head movement, head tilt, blinks, in frame (facts, never scored) |
| **Articulation** (drills) | Clear words | words come through as said | yes | no | drills | read accuracy |
| **Conversation** (drills) | Replies | reply start, keeping it going (process only) | yes | no | drills | reply start; asked back |

\* From session 06's signal work. The slot exists and the score uses it when the data is there (`MeasuredFacts.pitchRangeSemitones`, `emphasisPeakSdDb`, `fillers.contextualPerMinute`). Until then: pitch scores from the old Hz range, emphasis isn't scored, and every filler counts as an "um".

**Weights inside a skill** are equal, except eye contact 1.2 and conviction 0.8. They are judgment calls, written in `SUBCATEGORIES`. **Category score** = the weighted mean of its subcategories that count. **Overall** = the weighted mean of the categories present, by the skill shares above. The overall is always a summary of what's on screen.

### 5.2 Why the skills are the main categories

You named them as the main categories, and the curriculum already teaches them. The old "Voice & pace / Fluency / Structure & content / Presence / Face-voice match" was a sixth vocabulary.

With skills as categories, three things line up:
- "Your Cadence on this take was 6.2" is what moves your Cadence rating.
- The coach's focus skill is the same word.
- The path's units are already filed under these skills.

Fluency became a subcategory of Impromptu. That is where the coach, the skill check and the path already put fillers and stalls ("blanking", "words came slowly").

### 5.3 What moved where (the old names, mapped)

| Old | New |
|---|---|
| Voice & pace / Delivery: rate, pausing, pitch and melody | Cadence: Pace, Pauses, Pitch variety |
| volume | Cadence: Emphasis (it was Delivery in the score, Confidence in mastery) |
| tonality | Cadence: Tone fit (shown, not in the total) |
| Fluency: fillers, stalls | Impromptu: Fluency |
| Structure & content / Structure, Content: relevance, coherence | Impromptu: Structure, On the point, Clarity |
| hedges, ending | Confidence: Conviction (it was Content in the score, Confidence everywhere else) |
| Presence: eye contact, expression | Confidence: Eye contact, Expression |
| Presence: head level | fact only (body language metrics) |
| body language notes | Confidence: Body language (shown, not in the total) |
| Face-voice match, archetype, the judge's overall | cut |
| Cue compliance | Cadence: Following the marks (scripts) |

### 5.4 Bands, in one place

`src/domain/scoring/bands.ts`. The measured score, the coach card's verdict dots (`verdictFor`: good from 8, ok from 6) and the skill check all read the same functions now:
- pace: 130 to 160 full, a point per 7 wpm outside;
- pauses: full at 60%;
- pitch: full at 5.5 semitones, or 110 Hz until 06;
- emphasis: full at 3 dB;
- fillers: 2 a minute free, 0.8 each after, contextual at half;
- stalls: 2 points per stall a minute;
- eye contact: full at 75% (90% head-only);
- expression: full at 30;
- conviction: 8, +1 for a clear ending, −2 for trailing off, −0.5 a hedge after two (up to −3);
- structure: 8 or 4, capped at 5 on a missed target.

The coach's tip triggers (175 wpm and others) still differ slightly from the verdict bands: a tip is about what's worth fixing first. Still left over: the comparison card's 145 wpm target, the path's `CHECK_SIGNALS` and the drills' own pace targets. Those belong to sessions 11 and 06; see section 12.

---

## 6. How the taxonomy meets the curriculum

```
take -> score sheet (measured, judged) -> category score per skill (0-10)
     -> mastery evidence (0-1, the headline sheet's category / 10)
     -> skill rating (0-100, Elo-like, mastery.ts) -> stage -> speaker level
     -> progress moment beats (rating moves, stage earned, the take's score vs earlier takes in the same layer)
drills -> drill score (0-1) -> drill level (staircase) and the drill's skill rating
"rep" staircase -> practice step 1-5 -> prompt tier, take length, prep, warm-up
```

- **Skills and stages are unchanged.** What changed is the evidence a take gives (`domain/repEvidence.ts`). It is now the take's own category scores, judged when judged, so the number on the Result screen is the number that moved the skill.
- **Articulation and Conversation** are only moved by their drills. A take never moves them, and it never did in a meaningful way: the coach had no articulation observation.
- **What a person should see** (recommendation for 11):
  - take and category scores on 0 to 10;
  - skills as stages, with a progress bar to the next;
  - drills as their result line.

  Hide the raw 0 to 100 rating, the drill level and the practice step behind "how this works". The Skill detail ring currently shows the raw rating.
- **Progress moments** compare a take's score only with earlier takes scored in the same layer (`scoresRepo.getScoreHistoryBefore(recordedAt, layer)`).

**The old curriculum engine is deleted.** `evaluateCurriculum` and the composites, `computeRichDeliveryScore`, and the per-focus composite query in `curriculumRepo.ts` are gone. The step still follows the rep staircase, as it has since curriculum v2. The two always-null `spontaneous_composite` and `drill_composite` columns of `curriculum_state` were dropped in migration v34.

---

## 7. Two layers: measured and judged

### 7.1 What each is

| | Measured layer | Judged layer |
|---|---|---|
| Who | the phone: the measurements plus the bands and the phone's rules (shape, hedges, ending) | Tono AI (and, until 08, an own key) |
| Which takes | every take | takes opted in and judged |
| Formula | the same for everyone, deterministic | the judge's sub-scores; the overall worked out on the phone |
| Can it be wrong about a fact? | it *is* the facts | it may never contradict a measured number (the prompt says so; the phone keeps the facts) |
| Stored | `session_score` artifact `.measured` | `scores` row (rubric) → `session_score` artifact `.judged` |

`TakeScores` = `{ measured, judged, headline, judgedBy }`. `headline` is "judged" whenever the judged sheet exists. `sessions.session_score` holds the headline overall.

**The judged sheet fills from the measured one.** The judge scores what it can. Fluency and Conviction aren't in today's rubric, so they come from the measured sheet and are labelled "measured on the phone". The judged overall is therefore the judge's sub-scores plus the measured ones it didn't cover, rolled up with the same weights. The judge's own "overall" and congruence are ignored.

### 7.2 Free versus Plus

| | Free (no account) | Plus and the trial | A free user's one judged take a month |
|---|---|---|---|
| Facts and graphs | yes | yes | yes |
| Measured score, per skill and overall | yes, the headline | yes, shown second ("Measured on the phone alone, this take scores 7.4") | yes, second |
| Rule coach card (strength, tip, focus, follow-up) | yes | replaced by Tono AI's words | replaced |
| Judged sub-scores, notes, the judged headline | locked (`whatCanShow` = "locked") | yes | yes, that take only |
| Exercise notes (Rewind, Say it short), AI mark-up | rules or counts only | yes | per 08's allowance |

The taxonomy needs nothing special for the free judged take. The take simply has both sheets, like a Plus take.

### 7.3 Keeping the two comparable

- **Never on one line.** Trends draw the measured overall for every take, and the judged overall for judged takes, as separate lines. A take without a judgement is never a zero or a gap in the judged line.
- **Deltas and bests stay within a layer.** "Vs last session" and the progress moment's history only look at takes with the same headline layer (`getPreviousOverallScore(recordedAt, layer)` reads `json_extract(session_score.headline)`).
- **Judged with judged, from the same judge.** Provenance records the model and the prompt version. A chart should mark a change of either.
- **Text-judged and video-judged takes stay comparable.** The only subcategories a text judge can't score (Tone fit, Body language) are shown but kept out of the totals.
- **Mastery uses whichever sheet is the headline.** A Plus user's judged takes and a free user's measured takes move the same skill ratings. A judged take will often come out lower than its measured sheet: the measured Presence was generous, and the judge is told to be demanding. How much lower is unmeasured; the test plan asks for the pairs.

  Later, every judged take is a labelled pair (measurements → judged sub-scores), which is exactly what's needed to recalibrate the measured bands. Session 05 described this "teacher" approach.
- **The library list** shows each take's headline. Recommendation for 11: a small "Tono AI" mark on judged ones, and the month average computed per layer.

---

## 8. The new signals from sessions 05 and 06

Treated as input (session 06 is building them in parallel). Where each lands:

| Signal | Lands in | Scored? |
|---|---|---|
| Pitch in semitones (p10 to p90 range, SD, voiced share) | Cadence → Pitch variety | the range, full at 5.5 st until 06 calibrates it and adds the personal baseline after 5 takes; scored from 8 voiced seconds (and a voice 12 dB over the noise), flagged low confidence under 20; below 8, "not enough voice" instead of a score |
| Speech-only loudness relative to your median, spread, syllable-peak SD | Cadence → Emphasis | the syllable-peak SD (full at 3 dB, uncalibrated); the spread is a fact |
| Pauses with breath tags (hysteresis, Silero later) | Cadence → Pauses | pauses at full stops, as now; breaths stop splitting pauses, so the counts get honest |
| Speaking rate over the speaking span; articulation rate | Cadence → Pace | the speaking rate; articulation rate and pace changes are facts the judge reads |
| **Typed fillers**: hesitation (um, uh, er) versus contextual (like, actually, you know, basically) | Impromptu → Fluency | both, **shown separately**; contextual ones count at **half weight** because the context rule is conservative and some aren't fillers |
| Expression without the jaw; "looking up" | Confidence → Expression, Eye contact | expression yes; looking up is a fact |
| Head movement and nods, blinks | Confidence → Body language | facts only, never scored |
| Shaky voice (jitter, shimmer, tremor) | **dropped**, per your decision | no |

The hook is `measuredFacts()` in `src/services/sessions/sessionScoreService.ts`, which flattens a take's artifacts into `MeasuredFacts`. When 06's `signals` artifact lands, that function reads its summary, and nothing else in scoring changes.

**One overlap left for 06 or 11:** "kind of" and "sort of" are hedges and are on the old filler list. In the typed list they should be contextual fillers or hedges, not both. Recommendation: hedges, since they soften a claim.

---

## 9. AI as ground truth, and opting a take in or out

### 9.1 How scoring works now

You asked for this: "we give the stats and numbers collected on the phone to Tono AI, let it score from them, and use its assessment as the ground truth."

- **Before:** each category blended phone and AI by trust weights, plus 25% of the AI's own overall.
- **Now:** the judge gets the phone's measurements and scores from them. Its sub-scores are the take's scores, with no blending. The phone's facts stay facts: the judge may cite them, and must never contradict them.
- **The video prompt changed.** It used to say "these numbers must not move any score". It now says "these are facts, measured more precisely than you can from the video: use them as evidence for your scores … never contradict a measured number" (`hostedReviewSection` in `schema.ts`).
- **The text prompt changed.** It already said "treat the measurements as ground truth" (`measuredReview.ts`).
- **Rate is pace only in both prompts.** They no longer tell the judge to lower rate for fillers, because Fluency scores fillers.

### 9.2 The text-only judge is the default (built)

You asked to design for a text-only model, with video only where it adds something the phone can't measure. Session 05 found that Gemini samples video at about 1 frame a second and audio at about 1 kb/s, so it is not the ground truth for blinks, quick glances or fine pitch.

| | The phone measures it better | Only a judge can do it | Needs the audio or video |
|---|---|---|---|
| Pace, pauses, pitch range, emphasis, fillers, stalls | yes | whether a pace or a pause suited the moment | no (numbers plus timed transcript) |
| Eye contact, expression, blinks, head | yes | | no (numbers) |
| Structure, on the point, clarity, conviction | | yes | no (the words) |
| **Tone fit** (does the voice suit the words) | | yes | **audio** |
| **Body language** (posture, gestures) | | yes | **video** |

So the default Tono AI take review is now **one text call**:
- **Sent:** the phone's Whisper transcript, the timed transcript, the measurements, the prompt and its task, and the speaker context.
- **Back:** the rubric and the coach card (`quick_coach`) in the same call.

The video review stays as a setting (Dev → App tools → "Judge from", `prefsStore.getJudgeInput`). It is also the automatic fallback for a take with no transcript. Tone fit and Body language exist only on video-judged takes and stay out of the totals (section 7.3), so the two kinds of judged take compare.

- **Cost:** session 04's model puts a text judgement at about 0.35¢ against 1.34¢ for a 90-second video review. That is roughly a quarter of the review cost, and no upload.
- **Quality:** unverified. The hosted eval (test plan E) and the new item in section 07 of the test plan compare the two on your takes.

### 9.3 Does this change the rule in the Tono AI plan?

The rule was: the video review gets the phone's measurements for its notes only, never the phone transcript or filler counts, and never into scoring.

| Part of the rule | Now | Why |
|---|---|---|
| "Measurements never into scoring" | **Changed**: they are the judge's evidence for its scores | your decision; the phone measures delivery better than a 1-frame-a-second model |
| "Never the phone transcript" (video review) | **Kept for the video review**: Gemini transcribes the audio itself | it copied the phone transcript before, when that transcript had no ums |
| The phone transcript in the **text** review | **Sent**: it's the input | a text judge has nothing else; the copying problem only arises when a model also has the audio |
| "The filler count from the AI transcript" | **Changed**: Fluency always uses the phone's count (measured layer); the judge doesn't score fillers | whisper.rn turbo with the filler prompt kept 10 of 10 fillers in the ASR Lab, so the phone's count is now trustworthy; one source makes Fluency stable when a review lands (item 3 of the audit) |

A further saving for 08: the video review still asks the judge for both transcripts (most of its ~2,000 output tokens). Sending the phone transcript and dropping that request would cut its cost a lot. That reverses the kept part above, so it's listed as a decision.

### 9.4 Opting a take in or out (recommendation; the switch exists)

- **The switch:** the save screen's "Deep review" switch is the per-take opt-in. A take is judged only if it's on, or if "Judge this take" is pressed later on the Result screen, which re-queues the step. It defaults to the Settings switch "Review every take". Feeling reps default off. In code it is `AnalysisContext.takeOptIn`; routing returns `opted_out` without it.
- **Rename it "Have Tono AI judge this take"** (08 or 11), and add a "Private take" shortcut that turns it off.
- **What a take without a judgement shows:**
  - the facts;
  - the measured score as the headline, labelled "Measured on this phone";
  - the rule coach card;
  - for a free user, a quiet locked line where the judged layer would be ("Tono AI would judge content and delivery here");
  - for an opted-out Plus take, nothing locked: it was a choice.
- **In progress and the curriculum,** a take without a judgement moves skills by its measured sheet. It appears in the measured trend line, not the judged one, and in "vs last" only against other measured takes.
- **Allowance:** an opted-out take uses nothing.

---

## 10. The AnalysisService

### 10.1 The shape

`src/domain/analysis/types.ts`, `routing.ts`, `provenance.ts` (pure) and `src/services/analysis/` (the service, providers, prompts, gate, store).

```ts
type AnalysisKind = "take_review" | "coaching" | "rewind_notes" | "summary_notes" | "mark_up";
// later: "word_chain", "bridge_chain" (10), "conversation_turn", "conversation_debrief", "tts" (12), "insight"

type Producer = "tono_ai" | "own_key" | "rules";   // own_key until 08; room for "on_device_llm", "apple_pcc"

interface Provenance { producer; provider?; model?; promptVersion; judged; input?: "text" | "video"; at }

type AnalysisResult<T> =
  | { status: "done"; value: T; provenance: Provenance }
  | { status: "pending"; step?: string }
  | { status: "unavailable"; reason: Unavailable; message?: string; fallback?: { value: T; provenance: Provenance } };

interface AnalysisService {
  request<K>(kind: K, input: InputFor<K>, ctx: AnalysisContext, opts?: { takeId?: string }): Promise<AnalysisResult<OutputFor<K>>>;
  observe(takeId, cb): () => void;          // pending -> done, across screens
  whatCanShow(kind, ctx): "judged" | "facts" | "locked";
}
```

- **Typed inputs and outputs** (`services/analysis/kinds.ts`):

  | Kind | Input | Output |
  |---|---|---|
  | take_review | the session, the grading context, pauses, presence, stutter mode | the rubric, the coach card, `heardAudio`, usage, the provider id |
  | coaching | `CoachInput` | `CoachOutput`, which carries `provenance` instead of the old `source` |
  | rewind_notes | the transcript | `RewindReview` |
  | summary_notes | setup and transcripts | `SummaryReview` |
  | mark_up | the text | `MarkedText` |

- **Routing** is one pure function, `routeAnalysis(kind, ctx)`, which returns the ordered producers, why the judge was left out, and what Tono AI would be sent. It replaces `domain/aiRouting.ts`:
  - Tono AI first, when it's the chosen provider, you're signed in, you've consented and it's allowed. Allowed means **text** calls for a text review, **review** calls for a video one.
  - Then your own key, only where it can work (Gemini needs the video; the others the transcript).
  - Then the rules, where the kind has rules: coaching, mark-up.
  - `forceProducer` is the dev or environment flag.
- **The facts** (`services/cloud/routing.ts` `analysisContext`) come from the account, consent, keys and prefs. It asks the server once when the cached allowance says no.
- **Provenance on every result.** The UI labels from it with `provenanceLabel()` / `producerName()`, for example "Judged by Tono AI (gemini-3.5-flash-lite) from your words and your phone's measurements", or "From measurements made on this phone".
- **Degradation.** A judge that throws or refuses hands over to the next producer. The error is classified into a reason (quota, cost cap, offline, signed out, kill switch and so on). If only the rules answer after a judge failed, the result is `unavailable` with the rules' version as `fallback`, so a screen can say what happened and still show something.
- **Persistence.** Each take keeps an `analysis` artifact: per kind, the status, provenance and reason (`services/analysis/store.ts`). A judged result survives a relaunch, and a model or prompt change is traceable. `observe` hears every change.
- **Consent and sign-in asks** live in one place, `services/analysis/gate.ts` `prepareFor(kind, openSettings)`. The service itself never shows anything.
- **Prompts** are built in one place, `services/analysis/prompts.ts` (plus the video prompt in `gemini/transcribeSession.ts`), from the typed inputs. No screen, component or step builds a prompt. Each result records a `promptVersion` (`PROMPT_VERSIONS`).

### 10.2 What "a local 1B model later" would take

Add `"on_device_llm"` to `Producer` and a provider that implements `supports` and `run`, then put it in `SUPPORTED` and the route order. No screen changes, because screens only see `AnalysisResult` and `Provenance`. Session 04's eval says not to do this for coaching from measurements. It is plausible for narrow, checkable text kinds (Rewind coverage, Word Chain links).

---

## 11. What was migrated, and what was deleted

All screens look the same apart from the provenance labels and the score breakdown's names.

| Consumer | Before | Now |
|---|---|---|
| Deep review step (`pipeline/steps/cloudReviewStep.ts`) | picked a provider, uploaded, built prompts, called Gemini or a text provider | asks for `take_review`, stores what comes back (scores row, transcript copy, usage, coach card, score sheets) |
| Early upload (`pipeline/earlyUpload.ts`) | uploaded for any Tono review | uploads only when the route will watch the video |
| Coach step (`pipeline/steps/coachStep.ts`) | rules, then Apple Intelligence | `coaching` from the rules; Tono AI's card from the review laid over it |
| Rewind notes (`rewind/rewindReview.ts`, `RewindResultScreen`) | Apple Intelligence automatically, own-key or Tono on request, provider logic in the service | `rewind_notes` on request, through `prepareFor`; labelled from provenance |
| Rewind processing (`rewind/rewindProcessor.ts`) | ran Apple Intelligence notes | counts only |
| Say it short (`summary/summaryReview.ts`, `SummaryRunnerScreen`) | cloud, then Apple Intelligence | `summary_notes`; label from provenance |
| Mark it up (`cadence/autoMarkText.ts`, moved from `onDeviceLlm/`) | Tono, then Apple Intelligence, then rules | `mark_up`: Tono AI, then rules |
| Save screen (`PreviewScreen`) | `providerFor("video_review")` | `showLevelFor("take_review") === "judged"` |
| Score (`sessions/sessionScoreService.ts`, `ScoreBreakdownCard`, `ResultScreen`) | trust-weighted blend | two sheets; breakdown rows are the skills, each sub-score says Tono AI or measured |
| Mastery (`repEvidence.ts`, `repProgress.ts`) | verdict buckets blended with regrouped rubric scores | the headline sheet's skill scores |
| Skill check (`skillCheck.ts`, `StartingPointScreen`) | its own bands; review blended by share | shared bands; the judged sheet's skill score stands |
| Coach card verdict dots | own bands | `verdictFor` on the shared bands; head level dropped |

**Deleted:**
- `domain/sessionScore.ts` (replaced by `domain/scoring/`)
- `domain/aiRouting.ts` (replaced by `domain/analysis/routing.ts`)
- `services/onDeviceLlm/onDeviceCoach.ts` and `domain/coach/appleCoachPrompt.ts` (Apple Intelligence judging)
- `coachTaskNote`
- `tonoAvailability`
- the Apple `autoMarkSchema`
- the old curriculum engine

`getAppleProvider` moved to `services/asr/appleProvider.ts`: the ASR Lab still uses Apple's transcriber. The `ai` and `@react-native-ai/apple` packages stay for that.

**Tests**: 1,224 passing (1,213 before; old score and routing tests replaced). New suites:
- `scoringTaxonomy.test.ts`
- `analysisRouting.test.ts`
- `services/analysis/__tests__/service.test.ts` and `providers.test.ts`
- the rewritten `routing.test.ts` and `autoMarkText.test.ts`

---

## 12. What later sessions do with this

- **08 (tiers, BYOK, prompts to the server)**
  - Delete the `own_key` producer, `ownKey` in the context, and `providers/ownKey.ts`.
  - Move `services/analysis/prompts.ts` and the video prompt to the server. The Tono provider then sends `{kind, inputs, schemaVersion}`, and the server returns its `promptVersion`.
  - Replace the rubric with a taxonomy-native schema: sub-scores by `SubcategoryId`, each with an evidence quote or a cited measurement. That drops congruence, archetype and the overall, and Fluency and Conviction can be judged too.
  - Decide how a text-judged take counts against the allowance (today it's a text call). Fix the save screen's "Counts toward your Tono AI reviews" line.
  - Wire `not_entitled` (the free tier) into `analysisContext`, so `whatCanShow` returns "locked" for free users.
  - Rewrite the consent and privacy text for the text default; `whatGetsSent` is already updated.
- **09 (waiting UX):** use `analysis.observe(takeId)` and the `analysis` artifact's pending, done and unavailable states. The take review is still a pipeline step, not a server job.
- **10 (exercise judging):** add `word_chain` and `bridge_chain` kinds (input, output, a Tono provider case, `SUPPORTED`), and rework `rewind_notes` with the evidence-quoting prompt.
- **11 (results screens):**
  - Feed the Overview and the Scores tab from `TakeScores` only. The Scores tab still renders the raw rubric and the radar from the old grouping.
  - Drop the archetype from the hero.
  - Use the names in `taxonomy.ts`.
  - Draw measured and judged trends as separate lines.
  - Library: mark judged takes and compute the month average per layer.
  - Merge the two coaching blocks.
  - Align the comparison card's pace target (145 wpm) with the 130 to 160 band.
- **06 (signals):**
  - Fill `MeasuredFacts` from the `signals` artifact: semitones, emphasis, typed fillers.
  - Calibrate `PITCH_FULL_SEMITONES`, `emphasisScore` and `EXPRESSION_FULL` in `bands.ts`.
  - Update `CHECK_SIGNALS` in `pathTargets.ts` to the same bands.
  - **Merge note:** this branch deleted `domain/sessionScore.ts` and the "rich delivery" function in `curriculum.ts`. If 06 edited either, move the change into `domain/scoring/bands.ts` when rebasing.

---

## 13. Where your intent and the code disagreed

1. **"Shaky voice is dropped"**: the scores never had it; nothing to remove here.
2. **"Prompts live on the server"** (the decision) **versus the code**: every Tono AI call still sends a prompt built on the phone. This session moved prompt building out of screens and services into one module, which is session 08's lift.
3. **"Apple Intelligence isn't used for judging"**: it was still writing the coach card, Rewind notes, Say it short notes and mark-ups on Apple Intelligence iPhones. It's deleted.
4. **"The AI review leads"** (the feedback round): built as trust weights, so it never fully led. It now does.
5. **"A measured delivery score"** (inference strategy): the measured sheet also includes the phone's rule-based Structure and Conviction. Without them a free take would have no Impromptu or Conviction score at all. They are labelled as the phone's rules.
6. **The free judged take**: the decision says it costs about 1.3¢, the price of a video review. With the text default it's about 0.35¢.
7. **Consent copy**: it said Tono AI never receives the transcript. That is false under the text default, so `whatGetsSent` now says what's sent in each mode. The privacy page and onboarding copy are 08's.

---

## 14. Decisions for you

Each is built as recommended and easy to reverse.

1. **Tono AI judges from the transcript and measurements by default** (text-only); the video is a setting (Dev → App tools for now).
   - Cheaper, and the phone measures delivery better.
   - The loss is Tone fit and Body language, which are kept out of totals anyway.
   - Reverse: set `getJudgeInput()` to default "video".
   - Confirm after the comparison in the test plan.
2. **The five skills are the main categories**: Cadence 30%, Impromptu 45%, Confidence 25% of a take.
3. **Cut** face-voice match, the archetype, the judge's own overall, the head-level score, tension and the dBFS volume variation from scores. The archetype is still printed on the hero until 11.
4. **Contextual fillers** (like, actually) count at half weight, shown separately.
5. **Tone fit and Body language** are shown but not totalled, so text- and video-judged takes compare.
6. **Fluency always uses the phone's filler count**, even on video-reviewed takes.
7. **Mastery follows the headline sheet.** Judged takes may move skills a little less than measured ones until the bands are recalibrated from judged pairs.
8. **For 08: send the phone transcript to the video review too**, and stop asking the judge for transcripts. This is a big output-token saving. It reverses "the phone transcript isn't sent with a video review", which existed because the old transcript had no ums.
9. **The old curriculum engine is deleted**; the composite columns in `curriculum_state` are left in place (always null).
