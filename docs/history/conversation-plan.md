# Conversation skill — implementation plan

Written 2026-10-07 against `feature/improvement` at `43fa072`. **Implemented 2026-10-08** on `feature/conversation-skill`, then merged into `feature/improvement`. The status section below records what was built and how it differs from the plan. The rest of the document is the original plan, kept as the design record.

## Status (2026-10-08)

**Built:** slices 0–4, except the Apple-model partner lines.
- **Skill:** the fifth skill (`conversation`, sky color, contrast-tested).
- **Lessons:** 4 units / 22 lessons and 12 guided exercises.
- **Drills:** 12 drill types on `ConversationRunnerScreen`.
- **Real-life loop:** Prime, Debrief and missions on Today, with migration v16 adding `social_events`, `blank_moments` and `mission_log`. Moments you blanked are replayed as practice and can be removed.
- **Progress:** self-focus ratings before and after drills, and a Conversation section showing predicted vs actual, attention and time to reply.
- **Coaching:** rambling metrics, and felt-vs-observed on Result.
- **Tests:** 197 jest tests pass, `tsc` is clean, and `expo export --platform ios` passes.

**Differences from the plan:**
- **Separate drill types for the variants.** Held, outsider, beat and replay are their own `DrillType`s, not params, so each gets its own staircase. Lesson ids were renumbered (`conv_13_group` was added to Moves).
- **Rep coach.** Rambling cues are *tips only*, tagged `impromptu`, not `conversation` observations. Monologue reps therefore don't move Conversation mastery, and rep scoring is unchanged.
- **Silence.** A drill where nothing was recognized is not recorded, so a blank never changes difficulty. The self-focus ratings from that attempt are dropped too.
- **Live transcript hidden.** Your words are not shown while you reply, because watching yourself is what the skill trains away from. The transcript appears on the result card.
- **Conversation days.** They end on the lesson's own drill (or a partner drill) and skip the video review step.
- **Drill scores.** The weekly "Average drill score" excludes conversation scores, and Progress shows conversation drill levels with no % chart.
- **Guided exercises.** They can now credit a skill other than Confidence (`GuidedExercise.skill`, `recordDrillOutcome({ skill })`).

**Verified on the Android emulator:**
- Today card and mission tap/undo.
- Prime → Debrief, with predicted vs actual on Progress.
- Replay: partner speech → listening → the kind "no reply" result, and removing a moment.
- Learn track, a guided lesson, the 2-turn group scene, and five rings in dark mode.

**Not verified (needs the iPhone):**
- Real reply latency and the question/thread heuristics on real speech.
- That the recognizer doesn't pick up the partner's own voice (300 ms mic delay).
- Voice selection, and silent-mode behavior.
- Light mode on these screens.

**Not built:** Apple Foundation Models partner lines / alternative replies (slice 4, optional), and a debrief reminder notification.

### iPhone checklist for this feature
1. A thread drill: ask about the partner's word → "Picked up …" and "Asked a question".
2. A reply right after the partner stops shows a sensible latency of 0.5–2 s, and the partner's tail isn't transcribed as your reply.
3. Group scene: two distinct voices; turn 2 plays after your reply ends on a pause.
4. Land the plane: a point-first answer that stops cleanly passes. "So yeah, I don't know" shows "Trailed off".
5. Squeeze: all three takes run, and the result shows a kept-words percentage.
6. Silent mode on: the partner's text still shows and the drill still works.
7. Prime → Debrief → Progress shows predicted vs actual. A blank moment replays and can be removed.
8. Light mode: the Conversation screens, rings and charts are readable.

Related files outside the repo:
- Roadmap (Phases 0–5, all implemented): `C:\Users\acgra\.claude\plans\pasted-content-id-0d6b-we-re-mainly-recursive-prism.md`. Add a "Conversation skill" section there when work starts, and keep its status list current.
- The repo's `plan.md` is a stale draft. Ignore it.

---

## 0. Before you touch anything

1. **Read `AGENTS.md`.** It says Expo has changed and you must read the versioned docs at https://docs.expo.dev/versions/v57.0.0/ before writing code. For this feature, read at least the `expo-speech`, `expo-sqlite` (transactions) and, if you add reminders, `expo-notifications` pages. Check the exact URL paths.
2. **Check `git status` first.** Another agent was working in the same tree when this plan was written. Uncommitted changes then: `eas.json`, `src/navigation/index.tsx`, `src/screens/SettingsScreen.tsx`, untracked `src/config/` and `test.md`. Do not edit those files until that work is committed. Prefer a new branch off `feature/improvement` once it is clean.
3. **Environment:**
   - Windows dev machine, no Mac.
   - The user's device is an iPhone 15 Pro-class phone on iOS 26 with Apple Intelligence on.
   - Native changes need an EAS dev build. JS-only changes hot-reload.
   - The Android emulator is for UI checks only. It cannot inject speech, and its mic records AMR-NB, which the audio decoder here can't handle. So real speech behaviour can only be verified on the iPhone, and **pure-function unit tests must carry most of the verification.**
4. **Per-change checks** (from the roadmap): `npx tsc --noEmit`, `npm test`, `npx expo export --platform ios`, `npx expo install --check`.
5. **Conventions:**
   - Conventional commits, e.g. `feat(conversation): …`.
   - Do not push.
   - Match the surrounding code's comment density. Comments here explain *why*.
   - Pure logic goes in `src/domain/**` with a test in a `__tests__` folder beside it. Screens only measure and display.

---

## 1. Why this exists (read this twice)

The user's own words, paraphrased. These are the product requirements.

- **Rambling.** In everyday conversation they start talking with no clear goal or destination, or the journey is drawn out and convoluted, "even though in my head I think a lot more clearly."
- **Blanking.** They often don't know what to say in the gap after someone speaks. Examples: responding to a comment, a well-timed joke, a flirty reply. At their brother's coworkers' gathering they were mostly quiet. It wasn't shyness. They couldn't think of anything in the gap, even about everyday topics and even in their own field.
- **Losing the planned thing.** They sometimes think of a question while the other person is talking and have forgotten it when their turn comes.
- **Social anxiety.** They say they definitely have social anxiety. They critique themselves instead of attending to the present moment or the other person. They feel pressure to perform and do well in whatever moment they're in. They said the whole app exists to help with that.
- **Decision already made:** Conversation is a **separate, fifth skill**, not a part of Impromptu.
- They like Vanessa Van Edwards's material (Science of People).

The app today is **monologue-only**: impromptu reps, drills, frameworks. It has no turn-taking, no partner, no response-latency measurement and no rambling metrics. That is the gap.

---

## 2. Research summary

Evidence quality is labelled. Do not present practitioner advice as proven science in the app's copy.

| Topic | What it says | Evidence |
|---|---|---|
| Self-focused attention | Monitoring your own performance during a conversation raises anxiety, makes you look more anxious, and makes you a worse conversation partner than focusing on the other person. Self-focus lowers your ability to take in what is said and to come up with contributions, and makes mental blanks more likely on your turn. | Experimental studies and a standard clinical model (Clark & Wells). Strong for social anxiety. |
| Safety behaviours | Things like silently scripting or rehearsing a line maintain social anxiety. | Same sources. |
| Standard treatment components | Outward attention training, dropping safety behaviours, behavioural experiments, video feedback. CBT also reduces pre- and post-event rumination. | Reasonably strong. **This app is practice, not treatment.** Mention once, calmly, that CBT for social anxiety works well. |
| Worry and working memory | Worry uses working-memory capacity, leaving less for the task. This explains "forgot my question". | Attentional control theory (Eysenck), widely cited. |
| Turn-taking timing | The typical gap between turns is about 200 ms across languages. Retrieving one word takes about 600 ms, and a short clause about 1.5 s, so people plan their reply while the other person is still talking. | Stivers et al. 2009 (PNAS). Strong. |
| Question asking | People who ask more questions, especially follow-up questions, are better liked. The effect runs through perceived responsiveness. People don't expect this. | Huang et al. 2017 (JPSP). Strong. |
| Liking gap | After conversations, people systematically underestimate how much their partner liked them. Observers watching the same conversation judged the liking accurately. | Boothby et al. 2018 (Psych Science). Strong, replicated. The basis of the "predicted vs actual" feature. |
| Topic preparation | Roughly 30 s of topic prep reduces anxiety. Brooks's TALK framework: Topics, Asking, Levity, Kindness. | Secondhand summaries of Brooks's work. Plausible. |
| Rambling | A structure problem. Fix by stating the point first, adding one reason or example, then stopping. Time limits force this. | Practitioner consensus, no trials found. Cluttering (a fluency disorder, with low awareness of the problem) is worth a one-time check by a speech-language pathologist if drills don't help. |
| Structured spontaneity | A few memorised frameworks reduce thinking load. The app already teaches PREP, What/So what/Now what, etc. | Abrahams, practitioner. |
| Humor | Humor production improves with training, but studies are small. Improv reduces social stress in the studies found, with thin evidence. | Weak to moderate. **Do not auto-score humor. Self-rating only.** |
| Flirting | Styles vary widely (Hall's five: physical, traditional, sincere, polite, playful). People are poor at detecting flirting. No single script works. | Moderate. Do not build a pickup-line generator. Teach curiosity, warmth, playful reaction and callbacks. |
| Vanessa Van Edwards | "Conversation sparks": open questions that draw out stories (e.g. "What's the best thing that happened today?", "What's the most surprising thing that's happened to you at work?"), ask for the story behind the fact, "me-too" moments, availability/approach cues, "signal amplification bias" (signals land less than you think). | Popularized science. Only the site pages and podcast description could be read. Her new book *Conversation* could **not** be read, so don't claim to know its frameworks. Some of her cue claims (microexpressions) are contested, so don't import them. |
| Pratfall effect | Competent people who slip become more likable, but average people become less so. | Mixed. **Do not use in copy.** |

Not verified: the research was read via search summaries, not full papers. Do not add statistics to in-app copy without checking the primary source.

---

## 3. Design principles (non-negotiable)

1. **No quality score on conversation reps.** The user's problem is performance pressure. Scoring "how good was your reply" feeds it. Score **process** only: response latency, whether a follow-up question was asked, whether the reply referred to what was said, reply length.
2. **Track where attention went.** Before and after each conversation rep, ask "How much of your attention was on yourself? 0–10." Chart it on Progress. It is the metric the user is really trying to move.
3. **Predicted vs actual.** For real events, record a prediction ("how awkward will it go, 0–10"), then rate it afterwards. Chart the gap. It is a personal liking-gap experiment.
4. **"Good enough" is the target.** The staircase may still aim for about 82% success, but never display misses in red or with failure wording. See the tone guide in section 9.
5. **Carry one word, not a sentence.** For the forgotten-question problem, the app's advice and drills are: ask about what they said *last* (so nothing needs remembering), or hold a single keyword. If you lose it, saying "I lost my thought, go on" is fine.
6. **Text-to-speech and listening run in sequence, never together.** The existing shadowing drill already does `Speech.speak(..., { onDone: beginListening })` (`src/screens/DrillRunnerScreen.tsx`, near line 118). Follow that. Simultaneous audio is the unresolved iOS concurrency spike from the roadmap.
7. **Heuristics are soft cues.** Speech recognition here uses `addsPunctuation: false`, so "was that a question?" is a guess from words. Show such results as gentle observations, never as a hard pass/fail the user can't contest.
8. **No cloud dependency.** Everything works on-device. Apple Foundation Models text is an optional enhancement only, and falls back to rules.

---

## 4. Product scope

### 4.1 The Conversation skill (SkillId `"conversation"`, label "Conversation")

Four units. **Ship units 1 and 2 first.**

**Unit 1 — Outward attention** (`con_attention`)

| Lesson id | Title | Core idea (teach card `why` ≤ ~60 words, `how` = 3 moves) |
|---|---|---|
| `conv_1_check` | Where's my attention? | Self-focus is a habit you can notice. Rate 0–10 before and after a rep. "Noticing it is the first win." Moves: name it ("I'm watching myself"), point attention at one outside detail, rate again. |
| `conv_2_spark` | Listen for the spark | Your job is not to be impressive, it's to find the most interesting thing they said and be curious about it. Moves: catch one word that lights up, pick it as your thread, ask about it. |
| `conv_3_safety` | Set down the rehearsal | Silently scripting your line keeps your attention on you. Moves: notice scripting, drop it, listen to the end of their sentence. |
| `conv_4_gap` | People like you more than you think | The liking gap. Moves: predict, have the conversation, rate afterwards and compare. |
| `conv_5_enough` | Good enough is the goal | One honest, small sentence beats a perfect line you never say. Moves: aim for "a real reply", not "a great reply". |

**Unit 2 — Moves** (`con_moves`)

| Lesson id | Title | Idea |
|---|---|---|
| `conv_6_echo` | Echo – Ask – Add | Repeat their key phrase, ask one thing about it, add one sentence of your own. |
| `conv_7_thread` | Ask about the last thing | Pick the last thing they said and ask about it. Nothing to remember, nothing to plan. |
| `conv_8_story` | Questions that bring out a story | "What was the best part?" beats "Did you like it?". Ask for the story behind the fact. (Van Edwards sparks.) |
| `conv_9_metoo` | The one-sentence "me too" | Relate in one sentence, then hand it back with a question. |
| `conv_10_hold` | Hold one word | If a question pops up while they talk, keep one keyword, not the sentence, then go back to listening. |
| `conv_11_recover` | When you blank | Buy time: "Good question, give me a second." Lost it: "I lost my thought — go on." Practice saying it plainly. |
| `conv_12_outsider` | The curious outsider | In a field you don't know, questions are your strength. Ask how, what, why. |

**Unit 3 — Say it straight** (`con_straight`): `conv_13_headline` headline first; `conv_14_land` land the plane (clean ending, then stop); `conv_15_squeeze` 60→30→15 retell; `conv_16_detours` notice and cut detours; `conv_17_offer` "want the longer version?" instead of adding more.

**Unit 4 — Wit and warmth** (`con_wit`): `conv_18_react` reactions and laughing; `conv_19_callback` notice and call back; `conv_20_exaggerate` playful exaggeration; `conv_21_tease` kind teasing and sincere curiosity (flirting without scripts). **Self-rated only.**

Write real teach-card copy in the existing `TeachCard` shape (`why`, `how[3]`, `source`) and put sources from section 10 in `source`. Keep it calm and non-judgmental.

### 4.2 New drills

Keep the number of new `DrillType`s small by using parameters for variants. Proposed types and how they are measured:

| DrillType | Skill | What happens | Measured (process only) |
|---|---|---|---|
| `conv_reply` | conversation | Partner line is spoken, then the mic opens. The user replies. | Latency from end of partner audio to first heard word (subtract `FIRST_RESULT_LATENCY_MS`). Reply length. **Never penalise a fast reply.** Success = replied with ≥3 words within a level-dependent window (about 6 s at level 1 down to 2.5 s at level 10). |
| `conv_beat` (variant param of `conv_reply`) | conversation | "Take a breath first." | Success if first word falls in 1.0–2.5 s. Trains a pause over start-and-search. |
| `conv_thread` | conversation | Partner says 12–25 words. The user asks about it. Variants via params: immediate, **held** (mic opens 4–10 s later, to train carrying one keyword), **outsider** (jargon-heavy statement). | Score = 0.5·questionLike + 0.5·threadMatch, where threadMatch = reply contains ≥1 of the item's annotated `threads` words (use `src/domain/speech/normalize.ts` and the equivalence helpers). Success = both. |
| `conv_echo` | conversation | Echo – Ask – Add. | Heuristic: echo (≥2 content words from the partner's last phrase within the first 8 words), ask (question-like), add (≥5 further words that aren't the partner's). Success: 2 of 3 at low levels, 3 of 3 at high. |
| `conv_group` | conversation | Two or more partner voices (different `expo-speech` voices or pitches) take turns, with a join-in cue. | Latency and reply presence per turn. |
| `land_plane` | conversation | Everyday question ("what do you do?", "what's your take on…?") with a time budget. | New pure module `ramblingMetrics` (section 6). Success = point in the first sentence **and** within budget **and** no trailing-off ending. |
| `squeeze` | conversation | Tell one story at 60 s, then 30 s, then 15 s. | Duration obeyed; content-word retention of the 15 s take vs the 60 s take (≥40%); no restart markers. |
| `callback` | conversation | A 4-turn scripted exchange where turn 1 plants a distinctive detail. | The final reply contains that detail. |
| `conv_react` | conversation | Partner says something mildly odd or funny. User practises a reaction. | **Self-rating only** (1–5). |

All write to `drill_attempts` with `skill = 'conversation'` and results in `metrics_json`.

Staircase: each type has its own level 1–10 through `drill_difficulty` (the existing weighted staircase in `src/domain/mastery.ts`). Add `paramsFor` cases in `src/domain/drills/drillSpecs.ts` and scoring functions in the same style as `scorePace` / `scoreCount`.

### 4.3 Content (static TS, `src/content/`)

- **Partner scripts**, about 60 items across six scenario sets: work chat, party small talk, a field you don't know, friend banter, a light dating setting, and a group of three.
- Item shape (suggested):

```ts
interface PartnerItem {
  id: string;
  scenario: "work" | "party" | "outsider" | "friends" | "date" | "group";
  level: 1 | 2 | 3;
  lines: { voice: "a" | "b" | "c"; text: string }[];
  threads: string[]; // content words a good follow-up could pick up
}
```

- Example (work, level 1): partner "I just got back from a week in Portugal. The food was unreal." `threads: ["portugal", "food"]`.
- Example (outsider): partner "We're moving the whole fleet to a new dispatch system, and the routing algorithm keeps choking on rural addresses." `threads: ["dispatch", "routing", "rural", "fleet"]`.
- Write dating-scenario lines warmly and respectfully; no pressure tactics and no pickup lines.
- Everyday questions for `land_plane` (about 30), time budgets 20–60 s.
- Jargon-light and jargon-heavy outsider topics (dentistry, logistics, wine, aviation, accounting, and so on).
- Mission list (4.4).

### 4.4 The real-life loop (this is what makes practice transfer)

Practice in an app does not by itself change real conversations. This loop is the bridge.

1. **Prime card** (before an event). Pick 3 topics, 2 story questions and 1 outward goal ("learn one surprising thing about someone"). Also record the prediction (awkward 0–10). Should take under 60 s.
2. **Missions** (daily, one tap, no recording). Examples: "Ask two follow-up questions today", "Answer one question in under 20 seconds", "Take one breath before you reply", "Listen for one spark". Keep to one or two per day.
3. **Debrief** (after an event, about 3 minutes). Prompts: what went okay, one thing to try next time, one sign someone enjoyed it. Then rate "how awkward was it, 0–10" against the prediction. Optionally add **"a moment I blanked"** (what the other person said). Each of those becomes a **replay rep**: the typed line is spoken back by text-to-speech and the user practises replying.
4. **Felt vs observed** on video reps. After a take, the user rates how it felt, then watches the replay (the three-pass player exists) and rates again. This is the video-feedback step from CBT for social anxiety.

Defaults, since the user hadn't answered:
- Put the Prime card, missions and debrief on **Today**.
- The debrief starts only when the user chooses it. A later optional reminder is a possible enhancement.

---

## 5. Codebase map (verified by reading, at `43fa072`)

Adding a fifth skill touches these. Search for the literal `"confidence"` after the change (`grep -rn '"confidence"' src`) to catch anything missed.

| File | What to change |
|---|---|
| `src/theme/tokens.ts` | `SkillId` union (line 8). Add `conversation` to `darkPalette.skill` and `lightPalette.skill` (each `{fg, bg}`) and to `SKILL_LABELS` (line 117). Existing hues: teal, violet, amber, pink. Accent is blue and success is green. Suggested: sky/cyan (`#38BDF8` dark, `#0369A1` light) but **check contrast** (light-mode fg ≥ 4.5:1 on surface and background) and pick whatever works. |
| `src/domain/mastery.ts` | `SKILLS` array (line 61). `getSkillStates` in `src/services/db/progressRepo.ts` loops `SKILLS`, so a new skill gets the default rating automatically. No schema change: `skill_mastery.skill` is `TEXT` with no CHECK. |
| `src/domain/dailyPlan.ts` | `WARMUP_FOR` is a `Record<SkillId, string>`, so add an entry (warm-up ids seen: `wu_articulators`, `wu_resonance`, `wu_breath`). `chooseFocusSkill` iterates `SKILLS`. **Gotcha:** step 3 always pushes an impromptu rep, falling back to a monologue framework rep when the lesson has none. For conversation focus, push a conversation drill instead. Check `DEFAULT_FRAMEWORKS`. The weights are 0.5 weakness + 0.3 days-since + 0.2 due-review, and a skill is blocked after 2 days in a row. With 5 skills, re-check that every skill is reached weekly. `src/domain/__tests__/dailyPlan.test.ts` exists and will need updating. |
| `src/content/lessons.ts` | `UNITS`, `LESSONS`, `lessonsForSkill`. `LessonStep` kinds are `warmup | drill | guided | rep`. Conversation lessons use `kind: "drill"` with the new `DrillType`s. The `drill` field is typed `Exclude<DrillType, "rep" | "guided" | "warmup">`, so the union flows through automatically. Guided exercises are defined near the bottom of the file (ids like `gd_reappraisal`). **I did not read that part.** Read it before adding guided items such as the self-focus check. |
| `src/domain/drills/drillSpecs.ts` | `DrillType` union, `DRILL_SKILL` and `DRILL_TITLES` (both `Record<DrillType, …>`, so TypeScript will force you to fill them), `paramsFor`, scoring functions, `SUCCESS = 0.8`. |
| `src/domain/drills/prepareDrill.ts` | `DrillSetup` and `LiveMode` (`follow|count|story|free|volume`). Add a conversation mode or a separate runner. |
| `src/screens/DrillRunnerScreen.tsx` | Stage machine `intro|model|prep|listening|finalizing|result`, uses `useLiveSpeech`, `Speech.speak` with `onDone`, `FIRST_RESULT_LATENCY_MS = 400`, `recordDrillOutcome`, `completePracticeStep`. Decide whether conversation drills extend this screen or get a sibling `ConversationRunnerScreen` (recommended, because a multi-turn partner flow doesn't fit the single-listen model). Navigation param types are in `src/navigation/index.tsx` (`RootStackParamList`, `Drill: { drill; contentId?; practice? }`). |
| `src/services/speech/liveSpeechSession.ts` | `LiveSpeechSnapshot.audioStartedAtMs` gives the mic start time. Keep-alive restarts when the user is silent, and **the engine never ends on silence by itself**, so a "user never replied" outcome must be decided by the drill's own timer. |
| `src/screens/LearnScreen.tsx` | `SKILL_ORDER` (line 21), `SKILL_BLURB: Record<SkillId, string>` (line 23). |
| `src/screens/ProgressScreen.tsx` | Hard-coded 4-key records at lines 23, 39 and 50. Replace with `SKILLS` from `mastery.ts`. |
| `src/components/common/SkillRings.tsx` | `ORDER` (line 7). Check that 5 rings fit the layout. |
| `src/screens/TodayScreen.tsx` | Skill rings and the plan card live here. Prime card, mission strip and debrief prompt go here. |
| `src/domain/coach/ruleCoach.ts` | `CoachInput`, `Observation { skill, label, value, verdict }`, `findings` with `severity`, `wins`. Observations are tagged by `SkillId`, so conversation observations drop in. It already reports `speechStartMs` > 5 s. |
| `src/domain/coach/structureHeuristics.ts` | `FrameworkId`, `FRAMEWORK_LABELS`, `CUES`, `guessStructure` (returns `pointUpFront`), `findHedges`, `hasStrongEnding`. |
| `src/services/db/migrations.ts` | Latest block is **v15** (line 436). Pattern: `if (currentVersion < N) { await db.withTransactionAsync(...); currentVersion = await commitVersion(db, N); }`. Use `addColumnIfMissing` and `CREATE TABLE IF NOT EXISTS`. `drill_attempts` already has `skill`, `lesson_id`, `drill_level`, `score`, `success`, `metrics_json`. |
| `src/services/db/progressRepo.ts` | `getSkillStates`, `recordDrillOutcome`, `getDrillLevel`, and the recent-attempt queries Progress uses. |

**Not yet read — read these before designing details:**
- `DailySessionScreen.tsx`
- `LessonScreen.tsx` and the lesson runner
- `src/services/practice/practiceEvents.ts` and `launchStep.ts`
- `src/domain/drills/evaluateDrill.ts`
- `src/hooks/useLiveSpeech.ts`
- `CoachCard.tsx` and the Result screen layout
- the guided-exercise section of `lessons.ts`
- `src/domain/coach/appleCoachPrompt.ts` and any zod schema for `FrameworkId`
- `src/services/notifications/reminderScheduler.ts` (if adding the debrief reminder)
- `src/services/prefs/prefsStore.ts`

---

## 6. Rambling metrics (pure module)

New file `src/domain/coach/ramblingMetrics.ts`. Input: transcript, duration, optional word timings (check what ASR timings exist on sessions; if none, use word and sentence counts). Output:

- `sentencesBeforePoint` / `timeToPointSec`. Use `guessStructure(...).pointUpFront` plus a first-claim heuristic.
- `trailingOff`: ending phrases such as "so yeah", "I don't know", "or whatever", "anyway", "I guess" in the last sentence.
- `tangentMarkers`: count of "by the way", "speaking of", "oh and", "that reminds me", "anyway", "not to go off on a tangent".
- `restarts`: "let me start over", "I mean", repeated openers.
- `lengthVsBudget`: duration ÷ time budget, when a budget exists.

Wire into `ruleCoach` as observations (`skill: "conversation"`) and calm tips, e.g. "Your point arrived in the third sentence. Try saying it first, then explain." Add unit tests with short transcripts on both sides of every threshold. Consider a new `FrameworkId` `"HeadlineFirst"` (Answer – Because – Stop). `FrameworkId` is used in `structureHeuristics.ts` (`CUES` is `Record<Exclude<FrameworkId,"None">, RegExp[]>`), `lessons.ts`, `dailyPlan.ts` and probably the Apple coach schema, so grep every use.

Question detection (pure, tested): a reply is question-like if its first 3 tokens of any sentence start with a wh-word or auxiliary ("what, how, why, where, who, when, which, did, do, does, are, is, was, were, can, could, would, have, has, tell me"), or the transcript contains "?" when punctuation exists. Keep the word list in one place.

---

## 7. Data model (migration v16)

Follow the v15 block's pattern. Use the existing `commitVersion`/`addColumnIfMissing` helpers (read lines 505–530 for how `commitVersion` behaves).

```sql
CREATE TABLE IF NOT EXISTS social_events (
  id TEXT PRIMARY KEY NOT NULL,
  created_at TEXT NOT NULL,
  label TEXT,
  topics_json TEXT,            -- ["...", "...", "..."]
  questions_json TEXT,         -- two story questions
  outward_goal TEXT,
  predicted_awkward INTEGER,   -- 0-10, before
  happened_at TEXT,
  debrief_json TEXT,           -- {wentOkay, tryNext, positiveSign}
  actual_awkward INTEGER,      -- 0-10, after
  completed_at TEXT
);
CREATE TABLE IF NOT EXISTS blank_moments (
  id TEXT PRIMARY KEY NOT NULL,
  event_id TEXT,
  text TEXT NOT NULL,          -- what the other person said
  created_at TEXT NOT NULL,
  practiced_count INTEGER NOT NULL DEFAULT 0,
  last_practiced_at TEXT
);
CREATE TABLE IF NOT EXISTS mission_log (
  date TEXT NOT NULL,
  mission_id TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  completed_at TEXT,
  PRIMARY KEY (date, mission_id)
);
```

- Self-focus before/after ratings go in `drill_attempts.metrics_json` for drills, and in `session_artifacts` (kind `self_focus`) for video reps. No new table.
- Soft-deleted sessions are excluded from stats elsewhere (`AND deleted_at IS NULL`). Mirror that if you query sessions.
- The data export feature (Phase 5) shares the DB, so new tables are included automatically. Check that the export screen text doesn't enumerate tables.
- Write repos in `src/services/db/` (`socialEventsRepo.ts`, `missionsRepo.ts`) in the style of `drillsRepo.ts` and `progressRepo.ts`.

---

## 8. Build order

Each slice should end with `tsc`, `jest` and an `expo export`, and be committed separately.

**Slice 0 — content only (no code risk)**
- Teach cards for units 1–2, then 3–4.
- About 60 partner items, 30 everyday questions, missions, Prime and debrief copy.
- Review all copy against the tone guide.

**Slice 1 — fifth skill and the safe parts (JS only)**
- `SkillId` plumbing (section 5), colors with contrast check, label, Learn/Progress/Rings/daily plan updates, updated tests.
- Unit 1 lessons using the existing guided-exercise mechanism.
- Self-focus rating before/after on drills and reps.
- Migration v16 and the repos.
- Prime card, missions, debrief, predicted-vs-actual chart on Progress.
- `ramblingMetrics` and the `ruleCoach` integration.
- *Acceptance:* a fresh install shows five rings. The daily plan rotates all five skills over a week in the simulation test. A debrief saves and the chart shows the gap. Existing tests still pass.

**Slice 2 — Conversation Reps (needs the iPhone)**
- `ConversationRunnerScreen` (or the extended runner): partner TTS → mic → result.
- Drills: `conv_reply`, `conv_beat`, `conv_thread` (immediate, held, outsider), `conv_echo`.
- Unit 2 lessons. Pure scoring in `src/domain/conversation/*` with tests.
- *First task: a short device spike.* Confirm that sequential TTS-then-listen works repeatedly on the iPhone without the recognizer picking up the app's own speech. Mic echo is the likely failure. Mitigations: wait for `onDone` plus ~300 ms, use on-device recognition, keep volume moderate.
- *Acceptance:* latency is measured within about ±300 ms of a stopwatch on the device. A silent attempt ends cleanly with "no reply" and no crash.

**Slice 3 — Say it straight**
- `land_plane`, `squeeze`, `conv_group` and Unit 3 lessons, `HeadlineFirst` framework.

**Slice 4 — Wit and warmth, and the coach**
- `callback`, `conv_react`, Unit 4 lessons.
- Replay reps from `blank_moments`.
- Optional Apple Foundation Models for partner lines, alternative replies and richer coach prose. Must fall back to rules. It is a small model, so use structured output and keep humor out of its job.

**Tests to write (pure functions, no device):** question detection, thread matching with homophones and number words, echo/ask/add detection, latency scoring windows, rambling metrics thresholds, mission rollover by date, predicted-vs-actual gap math, the daily-plan five-skill rotation, partner-item schema validation (every item has threads, valid voices, non-empty lines).

**Manual iPhone checks to add** (the user keeps a `test.md` checklist; coordinate before editing it): latency accuracy; held-question wait; silence handling; TTS voices distinguishable; airplane mode still works; five rings readable in light and dark; Dynamic Type; VoiceOver labels on new cards.

---

## 9. Tone guide for all new copy

- Never "you failed", "wrong" or "bad". Use "not this time", "next rep", "that was a real reply".
- Praise process: "You waited a beat." "You asked about what they said."
- Normalise: "Nearly everyone blanks sometimes."
- Do not diagnose. Do not claim the app treats anxiety. One gentle line in Settings or Learn: "If worry about conversations is taking over your days, CBT for social anxiety has strong evidence and is worth looking into."
- No pressure mechanics for this skill: no streak shaming, no red misses, no countdown that feels like an exam. Timers in conversation reps should be quiet.
- Dating and flirting content: warm, consent-aware, no tactics to manipulate.

---

## 10. Open questions and defaults

| Question | Default if the user doesn't answer |
|---|---|
| Where do Prime, missions and debrief live? | On the Today tab. |
| Debrief only on demand, or also a reminder? | On demand first. A reminder can come later via the existing notification scheduler. |
| Partner voices | `expo-speech` voices and pitches. Quality is limited, so pick the clearest iOS voices and keep lines short. |
| Does Conversation need its own warm-up? | Reuse `wu_breath`. |
| Should the self-focus rating be mandatory? | No, skippable, and remembered per drill. |
| Apple model for partner lines in slice 4 | Optional, behind availability. |

---

## 11. Sources

**Social anxiety, attention, memory**
- Clark & Wells cognitive model (PMC): https://pmc.ncbi.nlm.nih.gov/articles/PMC2151931/
- Self-focused attention and safety behaviours, experimental study (PLOS ONE): https://journals.plos.org/plosone/article/file?type=printable&id=10.1371/journal.pone.0247703
- Same study in PMC: https://www.ncbi.nlm.nih.gov/pmc/articles/PMC7909699/
- Safety behaviours and self-focus in children (ScienceDirect): https://www.sciencedirect.com/science/article/abs/pii/S0005791611000796
- Attentional control theory (Southampton): https://eprints.soton.ac.uk/351254/
- Post-event processing in social anxiety: https://pubmed.ncbi.nlm.nih.gov/17112463/
- Interventions for pre- and post-event rumination: https://www.simplypsychology.org/?p=65529
- Attention training experiment (worksheet): https://www.psychologytools.com/resource/attention-training-experiment

**Conversation science**
- Stivers et al. 2009, universals in turn-taking (PNAS): https://mdsoar.org/items/e7ae8103-de28-4689-92a6-55de329e5d5d
- Huang et al. 2017, "It doesn't hurt to ask": https://www.hks.harvard.edu/centers/cpl/publications/it-doesnt-hurt-ask-question-asking-increases-liking
- Boothby et al. 2018, the liking gap: https://journals.sagepub.com/doi/abs/10.1177/0956797618783714 and https://www.psychologicalscience.org/?p=148177
- Brooks, TALK framework (secondhand): https://www.cambridgeday.com/2025/01/12/desperate-for-better-dialogue-author-behind-science-of-conversation-talks-us-through-it/
- Hall on flirting styles (KU): https://news.ku.edu/news/article/2015/02/12/just-time-valentines-day-research-defines-more-behaviors-reveal-romantic-attraction

**Rambling, structure, spontaneity**
- Moxie Institute on rambling: https://www.moxieinstitute.com/how-to-stop-rambling-when-speaking/
- Abrahams on speaking on the spot (Roland Berger): https://www.rolandberger.com/en/Insights/Publications/Matt-Abrahams-on-speaking-well-when-on-the-spot.html
- Cluttering overview: https://connectedspeechpathology.com/blog/cluttering-speech-disorder-symptoms-causes-and-therapy

**Humor and improv**
- Humor training pilot (PMC): https://www.ncbi.nlm.nih.gov/pmc/articles/PMC5928396/
- Humor training RCT, older adults: https://www.sciencedirect.com/org/science/article/pii/S187435012000036X
- Improv and social stress (Trier test): https://link.springer.com/article/10.1007/s40750-020-00145-1

**Vanessa Van Edwards / Science of People**
- Open-ended questions: https://www.scienceofpeople.com/open-ended-questions/
- Conversation starters: https://www.scienceofpeople.com/conversation-starters-topics/
- Small talk tips: https://www.scienceofpeople.com/small-talk-tips/
- Jay Shetty podcast page (description only): https://www.jayshetty.me/podcast/vanessa-van-edwards-stop-overthinking-every-social-interaction-use-these-cues-to-be-liked-respected-and-build-confidence
- Book *Conversation* (listing only): https://www.penguinrandomhouse.com/books/796462/conversation-by-vanessa-van-edwards/
- *Captivate* overview: https://www.scienceofpeople.com/captivate-summary/

**Existing roadmap pedagogy** (already in the app): the 85% rule (Wilson 2019), reappraisal (Brooks 2014), Kaernbach's weighted staircase, Abrahams' structured spontaneity.
