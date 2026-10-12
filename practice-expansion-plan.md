# Practice expansion: implementation plan

## Status (2026-10-11)

**All seven features are built** on branch `feature/practice-expansion` (not committed yet). Typecheck is clean and 450 tests pass, up from 220. Migrations are v18–v21. Every phase was exercised on the Android emulator, which can't produce speech. The iPhone checklist below covers what only a real device can confirm.

### Where the build differs from the plan
- **A, bridge mode** is its own drill (`chain_bridge`) with its own difficulty level, rather than taking over Word Chain above level 6. Both stay available, and the `imp_chain` lesson uses both. Word Chain notices a blank from recognized words only. The volume meter was dropped because background noise kept it above "silent".
- **C, the speeches** were re-marked from scratch, not converted. The marks are written in a compact notation (`domain/cadence/notation.ts`) in `content/speeches.ts`, and a test checks the words still match `scripts.json` exactly. The old `cues` were removed from `scripts.json`; their tone directions survive as notes. The quick fixes in C1 were folded into the rebuild. The plan's Passages shelf was dropped, since lines are capped at two sentences.
- **C, Perform**: the teleprompter has **speed control and hold-to-pause instead of following your voice**. Running live recognition alongside the camera recording is untested on iOS (the same open concern as the Conversation skill's audio). Voice-follow is in **Rehearse**, which has no camera. Recordings have no hard stop: there's a soft cap at 2× the target.
- **C, auto-marking with the on-device model** asks the model to rewrite the text in the notation, then accepts it only if the words come back unchanged. Otherwise the rules do the marking.
- **D, pitch** comes from each take's saved WAV (`expo-speech-recognition` `persistAudio`), falling back to loudness range. A take counts only if words were recognized, so noise alone can't move the level.
- **E** stores the emotion and angle in `subjectExtras` (no new columns). Its session type is `feeling`. The rotation starts on **Joy in your first week**, instead of following the calendar.
- **F**: top-ups live in a new `daily_topups` table, and the main plan stays in `daily_plans`, so no table copy was needed. Streaks now **count local dates** (they used to slice UTC timestamps) and **skip rest days**.
- **G**: the profile is stored in MMKV (synchronous reads in the recording, drill and preview screens), not a SQLite table. The skill check runs through the existing drill, conversation and recording screens. Context prompts are ad-hoc prompts in `data/contextPrompts.ts`. Video retention now drives an automatic daily cleanup on launch, at the number of days you chose (none for "keep everything").

### iPhone checklist
1. Word Chain and Bridge chain with real speech: a fresh word appears after a blank, and the "because" connectors are counted.
2. The line rep's "Record this read", then "Play it back". Is the playback audible at full volume after recognition stops (iOS audio session)?
3. Move It: pitch range from the saved takes (16 kHz int16 WAV on iOS). Does the still-take comparison read sensibly?
4. Rehearse: follow-my-voice through long deliberate pauses. It must not skip ahead.
5. Perform: hold-to-pause and Slower/Faster on the teleprompter. Readability over the camera.
6. "From your own text" with Scan Text, and the on-device model's marks (Apple Intelligence on).
7. Skill check end to end with real on-device analysis. Do the starting point and first-week preview make sense?
8. Reminders at 2–3 a day: each slot fires, and is skipped once done.
9. Feeling of the Week: deep review stays off by default, and the take never shows up as a keepsake.

This doc covers seven additions:

| # | Feature | Size | Depends on |
|---|---|---|---|
| A | **Word Chain** drill (association chain) | S | none |
| B | **Cadence track rebuild**: pace, pause, pitch, rhythm, emphasis | M | C, D for its drills |
| C | **Mark It Up**: annotate any text, then read it aloud. Also **replaces the Script Practice reading UI** (13 issues, §4.1) | L | none |
| D | **Move It**: say a line with a physical movement to wake up the voice | M | none |
| E | **Feeling of the Week**: emotion-wheel reps on camera | M | none |
| F | **Daily goal**: 1–3 sessions a day | M | none |
| G | **Onboarding**: 6 chapters (about you, how you speak, your practice, setup check, skill check, your plan), plus a 30-day retake | L | F (the frequency question needs F to mean something) |

The build order is in §9. The open decisions and their defaults are in §10.

Inspiration: two short videos by progress.playground (Instagram/TikTok), covering association chains, "you're not monotone, you're vocally lazy", annotated reading, and the emotion wheel. Everything below is adapted to how this app already works. Where outside research supports a technique, §11 lists it.

---

## 0. Before you touch anything

- Read the Expo SDK 57 docs, as `AGENTS.md` says.
- Don't break the Conversation skill's design rules (see `conversation-plan.md` §3): Conversation drills score process only, the live transcript stays hidden while you reply, and blanks never move difficulty. Feature E borrows the same philosophy.
- The DB is at **migration v17**. New tables start at **v18**.
- `lesson_progress` is keyed by `lesson_id`. **Never rename an existing lesson id.** New lessons can be inserted anywhere in a track, and `chooseLesson` will route to them because they're not done.

---

## 1. Design principles

1. **Lower the pressure, don't raise it.** The app exists because of social anxiety and self-critique mid-speech. New features must not add grades where a grade isn't useful. A number on a vulnerable story (E) or on a first-ever recording (G) is out.
2. **Measure what we can measure honestly; self-rate the rest.** Mark It Up (C) needs no analysis. Move It (D) only shows *contrast* between takes, never a "good voice" score.
3. **Practice transfers only if you end without the crutch.** Movement drills end with a "ghost take" with no movement. Annotated reading ends with an unmarked read.
4. **Reuse before building.** The Script Practice cue system, the drill staircase, the daily plan builder, the recording pipeline and the keepsake videos all already exist.

---

## 2. Feature A: Word Chain

### What it is
A random seed word appears. You say a word related to it, then a word related to *that* one, and so on: `pen → ink → octopus → aquarium`. It's timed. The chain builds on screen as chips while you talk.

### Why it's here
The existing **Category sprint** and **Letter sprint** (`category_fluency`, `letter_fluency`) are the classic semantic and phonemic verbal-fluency tasks: retrieval inside a fixed box. In a chain the box moves with every word. That's closer to real conversation, where every reply has to connect to what was just said, so it trains the "blank after someone speaks" problem directly.

### Mechanics
- New `DrillType`: `"word_chain"`, skill `impromptu`, `LiveMode` `"chain"` (or reuse `"count"` with a chain flag).
- Seed word: `RANDOM_WORDS` in `src/content/drillContent.ts`.
- **Reset on a blank:** after about 3 s of silence, show a fresh seed word and keep going. Resets are counted and cost very little. This practices *recovering* from a blank rather than punishing it.
- **Relatedness:** honor system. Category sprint already doesn't check membership. Optional later: an on-device model pass afterwards that labels the "leaps" as a fun extra, never a penalty.

### Knobs (`paramsFor`, level 1–10)
| Level | Seconds | Target links | Stall before reset |
|---|---|---|---|
| 1–3 | 30 | 8–12 | 3.0 s |
| 4–6 | 45 | 13–18 | 2.5 s |
| 7–10 | 60 | 19–25 | 1.5–2.0 s |

### Scoring
`scoreChain(links, target, resets)`: links ÷ target, minus 0.05 per reset beyond the first, with a success threshold of 0.8 (the same 85%-rule staircase as every other drill). Unique content words only, through the existing `uniqueContentWords` helper.

### Phase 2: Bridge mode (level 6+)
Say *why* each word links: "ink — because pens need ink." This trains putting connections into words, which is exactly what rambling breaks. It's harder to score, so it ships after the base drill. Plan: count connector phrases ("because", "like", "which", "that's") per link, and offer a self-rating fallback.

### Lessons
- Add `word_chain` to `imp_1_retrieval`.
- New lesson `imp_chain` ("Keep the thread"): Word Chain, then a rep with the focus "every sentence connects to the last one."

---

## 3. Feature B: Cadence track rebuild

### Goal
Cadence should explicitly cover **all five elements: pause, pace, pitch, rhythm, emphasis**. It should also show up *every day*, not only when `chooseFocusSkill` happens to pick it.

### Current state (`src/content/lessons.ts`)
| Unit | Lessons | Covers |
|---|---|---|
| `cad_pace` | `cad_1_pace`, `cad_2_slow` | pace ✅ |
| `cad_pause` | `cad_3_pause`, `cad_4_power_pause` | pause ✅ |
| `cad_melody` | `cad_5_emphasis`, `cad_6_shadow` | emphasis ✅, pitch partly |
| none | none | **pitch inflection ❌, rhythm ❌** |

Pitch endings show up only in `con_5_endings` (confidence track).

### New track layout (existing ids kept and reordered; new ones marked ★)
1. **Pace**: `cad_1_pace`, `cad_2_slow`
2. **Pause**: `cad_3_pause`, `cad_4_power_pause`
3. **Pitch** ★ unit `cad_pitch`
   - ★ `cad_7_inflection` "Up or down?": falling at full stops sounds certain, rising invites a reply, and upspeak turns statements into questions. Steps: guided "statement vs question" (the same line read ↘ then ↗), then Mark It Up with only ↗ ↘ marks.
   - ★ `cad_8_range` "Use your whole range": "you're not monotone, you're vocally lazy." Steps: **Move It** (D), then a rep.
4. **Rhythm** ★ unit `cad_rhythm`
   - ★ `cad_9_rhythm` "Vary the beat": mix short punchy sentences with long flowing ones, use the rule of three, and contrast staccato with legato. Steps: guided `gd_rhythm` (the same paragraph read choppy, then flowing, then mixed), then shadowing.
5. **Emphasis**: `cad_5_emphasis`, `cad_6_shadow`, ★ `cad_10_move` "Move it to mean it" (Move It with emphasis lines).
6. **Put it together** ★ unit `cad_score`
   - ★ `cad_11_markup` "Score your own text": Mark It Up on a text you choose, all five marks.

Update `UNITS` and the Learn screen grouping to match. `chooseLesson` walks the track in array order, so put new lessons where they belong pedagogically.

### Line of the day: cadence touches every plan
Add one **60-second "Line of the day"** step to *every* daily plan, right after the warm-up: one pre-marked line of 1–2 sentences, read twice with the marks and once without (a one-line Mark It Up rep, §4.2). It's cheap, varied, and makes cadence a daily habit without stealing focus days from other skills.
- `buildDailyPlan`: new `PlanStepKind` `"line"`, chosen deterministically by `hashString(date)` from a pool of about 60 pre-marked lines, rotating which of the five elements each line stresses.
- 5-minute plans: the line *replaces* the warm-up on days where the lesson has no warm-up of its own, so the plan stays at 5 minutes.

---

## 4. Feature C: Mark It Up (annotated reading, and a rebuild of Script Practice)

### What it is
Pick **a sentence or two** from a book, an article, or anything else. The app (or you) marks it with **emphasis, ↗ rising inflection, ↘ falling inflection, | short pause, ‖ long pause**, and **slow / louder / softer** spans. Then you read it aloud a few times. **No analysis is required.**

**The unit of practice is a line: one or two sentences, never a whole script.** A short line can carry dense, meaningful marks, fits on one screen with no scrolling, and can be repeated several times in a minute. Repetition is the point. A Mark It Up rep is about 3–5 lines.

Mark It Up also **replaces the Script Practice reading UI.** The 12 built-in speeches stay available as a separate, secondary "Speeches" shelf for full read-throughs. They are **not** part of the cadence staircase or the daily plan.

### 4.1 What's wrong with Script Practice today
Reviewed on the Android emulator on 2026-10-11 ("The Sixty-Second Fix"). **[seen]** means seen on screen; **[code]** means read in the code.

| # | Problem | Evidence |
|---|---|---|
| 1 | **The scroll runs on a clock, not your voice.** The "you are here" highlight reached *business* about 13 s in while nothing was being said. Scroll speed comes from `targetDurationSeconds` (about 130 wpm). If you honor a pause or slow-down cue, the text runs away from you. That's backwards for a cadence tool. | [seen] + [code] `ScriptTeleprompterOverlay` `withTiming(…, script.targetDurationSeconds)` |
| 2 | **The recording hard-stops at the target length.** Reading slower, with the pauses the cues ask for, gets you cut off before the end. | [code] `RecordingScreen` auto-stop when `remainingRecordingSeconds === 0` |
| 3 | **You can't study the marks before reading.** A card shows a 2-line excerpt, and tapping it goes straight to Start. The 60 s prep countdown hides the script entirely and shows only the title, in white over the camera, which is close to unreadable on a bright background. The exercise is mark → rehearse → read, and we skip the first two. | [seen] |
| 4 | **Cue meanings are hidden.** ↑ ↓ ▲ ▼ ⏸ ❗ ⏳ have no legend. ↑ (pitch up) and ▲ (louder) look alike, and ⏳ reads as "wait" but means "slow down". The explanation lives in a tap tooltip, and you can't tap mid-read. | [seen] |
| 5 | **Cues are points, but most instructions are spans or edges.** A glyph sits *before* one word and highlights only that word. "▼ That's": softer from where to where? "↓ My": a falling pitch belongs on the *end* of the previous sentence ("waste it ↘"), not the start of the next one. Slow-down has no end. | [seen] |
| 6 | **One cue per word.** `Map<wordIndex, cue>`, so emphasis plus a pause after the same word is impossible. | [code] |
| 7 | **Visual noise fights reading.** Amber word highlights, a blue current word, a **red** ❗ (red reads as an error), amber glyphs, all over a live camera feed. The text also runs underneath Restart and the record button. | [seen] |
| 8 | **Only long speeches (1:00–5:00) with placeholders** like [Name] and [Groom]. No short lines for focused reps, no way to add your own text, no editing. | [seen] |
| 9 | **The "PITCH" category badge** means a sales pitch, which collides with pitch the cadence element. | [seen] |
| 10 | **Cues are all-or-nothing** (one switch). There's no in-between step to wean off the marks, which is the step that makes it transfer to real speech. | [seen] |
| 11 | **Pauses are under-marked:** 2–5 per script against 6–16 emphasis cues, and **s01 has none**. In annotated reading, pauses are the most important mark. | [code] `scripts.json` |
| 12 | **The marks are really sentence-level stage directions.** Nearly every cue sits on the *first word of a sentence*, and its label is a tone note that often contradicts the symbol: `↓ pitch down` on "My name is…" says *"Grounded intro, steady, not salesy"*; `↑ pitch up` on "Think about…" says *"warmer, a little slower"*; `❗ emphasis` on "Thirty seconds" says *"Cold open, punchy and confident"*. | [code] s01, s02 rendered with cues inline |
| 13 | **Nothing marks the inside or the end of a sentence:** about 1 mark per sentence and no inflection at sentence ends. A reader learns nothing about *where* in the sentence to pause, stress or turn the pitch. | [code] |

### 4.2 The line rep (the main loop)
A rep is 3–5 lines. For each line, the whole line sits large and centered on one screen. There's no scrolling and no timer.

1. **Mark it.** Depending on level (§4.10), you see the coach's marks, add some yourself, or mark it all. Then **Compare** shows your marks and the coach's side by side. A difference isn't "wrong", just another way to read the line, and you pick which version to read.
2. **Read it with the marks, twice.** The first time slow and exaggerated, hitting every mark. The second time at natural speed. Each read can optionally be recorded and played straight back (local audio only, not a session).
3. **Read it with the marks hidden, once.** The marks fade out and only the words stay. Keep the same music. This is the transfer step.
4. **Remix** (optional, on by default in emphasis lessons): the app moves the emphasis to a different word. Read it again and notice how the meaning changes ("*I* never said she stole it" vs "I never said she *stole* it").

Reads advance by tap. Voice-detected advance is optional: end of speech followed by about 1.5 s of silence counts as one read. A 1–5 self-rating at the end of the rep feeds the staircase.

### 4.3 Speeches: Study → Rehearse → Perform
This is for the secondary Speeches shelf only: full read-throughs of the 12 existing scripts. One screen per stage. The first time with a speech you land on **Study**.

**Study (the marked text, no timer)**
- **Phrase-per-line layout:** the text is broken into breath groups, one per line, split at pause marks. This is how speech teleprompter copy is formatted, and it makes pauses visible as white space.
- **Typographic notation instead of emoji glyphs:**

| Mark | Looks like |
|---|---|
| Emphasis | **bold + underline** on the word |
| Rising / falling inflection | small ↗ / ↘ *after* the last word of the phrase |
| Short / long pause | a thin `\|` / `‖` in the gap between words |
| Slow / fast | a wavy / dotted underline across the span |
| Louder / softer | a bracket in the left margin with a small *f* / *p* (music dynamics) |
| Director's note (e.g. "Cold open, punchy") | a muted italic line *above* the phrase, never a tooltip |

- **A legend row** at the top: one chip per mark type, showing a count. Tapping a chip shows or hides that type, so you can practice one element at a time ("pauses only").
- **Buttons:** Edit marks · Rehearse · Perform.

**Rehearse (no recording, no pressure)**
- Big type, one phrase at a time: the current phrase is bright, the next phrase is dim, and the previous one fades.
- **Advances with your voice:** live speech recognition follows the words, reusing the `follow`-mode alignment the pace and minimal-pair drills already use (`speechAlignment.ts`). If recognition isn't available, it falls back to tapping anywhere to advance.
- Optional **record and listen back** locally. It isn't a session and doesn't touch the pipeline.
- **Three passes**, shown as steps: (1) slowly, hitting every mark; (2) at natural speed; (3) **marks hidden**, keeping the music.

**Perform (optional camera recording, saved as a session like Script Practice is today)**
- **The teleprompter follows your voice**, not a clock. Fallbacks: a speed slider, and press-and-hold to pause the scroll.
- **No hard stop at the target.** The target becomes information ("about 1:00 at a relaxed pace"), with a soft cap at 2× the target.
- **Mark level:** Full · Light (pauses and emphasis only) · None. This replaces the on/off switch.
- **Legible text:** the camera is dimmed to about 85% behind the text, or there's an option for a small picture-in-picture preview at the top. Text never scrolls into the controls zone.
- **Prep shows the marked text** (Study view), not just the title.

The Study notation table and legend row above are shared: the line rep (§4.2) renders lines with the same notation.

### 4.4 Library
- **Lines are the main shelf:** 1–2 sentences, pre-marked to the guide in §4.6. This is also the Line of the day pool from §3. Launch with about 150, all original or public domain, grouped by what they practice:
  - **Everyday**: "I really need you to hear what I'm saying."
  - **Contrast**: "It's not what you said, it's how you said it."
  - **Questions**: yes/no (rise) vs wh- (fall)
  - **Lists of three**: rise, rise, fall
  - **Story beats**: "And then the lights went out."
  - **Work**: "Here's what I'd do differently next time."
  - **Feelings**: short lines for Feeling of the Week (§6)
  - **Public-domain quotes**: Shakespeare, Lincoln, Austen, Twain
- **From your own text:** paste a paragraph or scan a page (§4.8). It's split into sentences, and you **pick one or two in a row** to work on. Picked lines are saved to Mine.
- **Speeches** (secondary): the existing 12 scripts, re-marked (§4.5), read with Study → Rehearse → Perform (§4.3).
- **Cards:** the line itself rendered in the notation, so you see exactly what you're getting.
- Tapping a line starts a line rep with it first. Tapping a speech opens **Study**, not the recorder.
- Rename the "PITCH" category to **"Sales pitch"**.
- Placeholders like [Name] get filled from the profile name (§8, question 1.1) or shown as a highlighted "say your name" chip.

### 4.5 Mark model (replaces `ScriptCue`)
```ts
type Mark =
  | { kind: "emphasis"; word: number }
  | { kind: "rise" | "fall"; word: number }                 // on the END of this word
  | { kind: "pause" | "long_pause"; afterWord: number }     // in the gap after this word
  | { kind: "slow" | "fast" | "louder" | "softer"; from: number; to: number }
  | { kind: "note"; word: number; text: string };           // director's note above this word's phrase
```
- Word indices stay defined by `tokenizeScript` (whitespace tokens), so the Gemini grading prompt and the reader never drift apart.
- Multiple marks per word are allowed by construction.
- **The existing `scripts.json` cues are not converted.** Problems 11–13 show they're stage directions, not marks. All 12 speeches get **re-marked from scratch** to the guide below, starting from the rule auto-marker's output and corrected by hand. Old labels that are good tone direction (e.g. "Sincere turn, warmer and quieter") are kept as `note` marks. The rest are dropped.

### 4.6 Marking guide (for built-in content and the auto-marker)
Rules every built-in line and speech must pass. The auto-marker targets them too, and `autoMark.test.ts` checks them.

1. **Every phrase boundary gets a pause.** Commas, dashes and colons get `|`. Sentence ends get `‖`. Add a `|` *before* a key word or reveal ("That's ‖ her."). This is the densest mark. Expect one every 4–8 words.
2. **Every sentence end gets an inflection.** Statements fall ↘. Yes/no questions rise ↗. Wh-questions fall ↘. List items before the last rise ↗, and the last one falls ↘. A clause that continues the thought (before a comma) usually rises slightly ↗.
3. **At most one emphasis per phrase,** on the word that carries the new information or the contrast. That's not the first word unless it really is the news. A deliberate echo ("…eleven hours a week. **Eleven** hours.") is stressed again on the repeat, because the echo is the point.
4. **Spans are rare and always have an end.** Slow is for a proof point or the line that matters, and softer is for a sincere turn. No more than one span per two sentences.
5. **Notes are tone direction only,** at most one per paragraph, and never stand in for a mark.

**Worked example** (s01's opening, re-marked; **bold** = emphasis):
> **Thirty** seconds ↘ ‖ That's about how long I have | before you check your **phone** ↗ | so let's not **waste** it ↘ ‖
> My name is [Name] ↗ | and I build software | that gives small business owners | back their **evenings** ↘ ‖
> The average shop owner spends **eleven** hours a week | on scheduling ↗ | invoicing ↗ | and chasing no-shows ↘ ‖
> **Eleven** hours ↘ ‖ That's almost a full extra workday | **gone** ↘ | every single week ↘ ‖

That's 16 pauses, 11 inflections and 7 emphases across these 6 sentences. The current script has 6 cues on the same sentences: one per sentence, nearly all on its first word, and no pauses.

### 4.7 Editor
- **Toolbar:** Emphasis · ↗ · ↘ · | · ‖ · Slow · Louder · Softer · Note · Eraser · Undo. Pick a tool, then tap.
  - Point marks: tap a word.
  - Pauses: tap the gap after a word (the gaps get large invisible hit areas in edit mode).
  - Spans: tap the first word, then the last word.
- **Auto-mark** (below) fills a fresh text. **Clear** removes everything. Edits save as you go.
- Edit mode uses the same Study layout, so what you mark is what you'll read.
- Built-in texts are read-only. Editing one makes a copy in Mine.

### 4.8 Getting text in
- Paste. On iOS the keyboard's **Scan Text** (Live Text) turns a camera photo of a book page into text for free, so OCR needs no code.
- Built-in Lines (and the Speeches shelf for full read-throughs).
- Later: a share-sheet extension ("Share → Speech Coach" from Safari or Books).

### 4.9 Auto-marking
1. **On-device model** (`src/services/onDeviceLlm/onDeviceCoach.ts`, `getAppleProvider()`): prompt it for `Mark[]` JSON given the tokenized text. Validate the indices and kinds and drop anything invalid.
2. **Rule fallback** (Android, or when there's no model), pure `src/domain/cadence/autoMark.ts`:
   - `,` `;` `:` → pause; `.` `!` `?` → long pause
   - `.` → ↘ on the last word; `?` → ↗ for yes/no questions, ↘ for wh-questions
   - list items before "and" → ↗; the final item → ↘
   - emphasis: per clause, the single highest-information word (negations like *not/never*, numbers, superlatives, the contrast word after *but*, otherwise the longest content word). At most one per clause, so emphasis never stops meaning something.
   - unit-tested like the other `domain/` modules.

### 4.10 Staircase
New `DrillType` `"marked_reading"` (skill `cadence`). The 1–5 self-rating at the end of a line rep feeds the staircase like `guided` does (`scoreSelfRating`). **Text never grows past two sentences.** Speeches are outside the staircase. The level changes how much of the work is yours:

| Level | Line | Marking |
|---|---|---|
| 1–3 | 1 short sentence | coach's marks shown, you just read |
| 4–6 | 1–2 sentences | coach's emphasis shown; **you add the pauses and inflections**, then Compare |
| 7–10 | 2 sentences | **you mark everything**, then Compare. Remix is on. |

### 4.11 Data (migration v18)
```sql
CREATE TABLE marked_texts (
  id TEXT PRIMARY KEY NOT NULL,
  title TEXT NOT NULL,
  shelf TEXT NOT NULL,           -- 'line' | 'speech' | 'mine'
  source_id TEXT,                -- builtin id this was copied from, if any
  text TEXT NOT NULL,
  marks_json TEXT NOT NULL,      -- Mark[]
  auto_marked INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  last_practiced_at TEXT
);
```
Built-ins stay as static content: `scripts.json`, re-marked to `Mark[]` (§4.5), and a new `src/content/lines.ts`. Only Mine and edited copies live in the table.

### 4.12 Verify on the iPhone
Emulator speech can't be injected, so voice-follow scrolling (Rehearse and Perform) has to be checked on the iPhone, including how it behaves during deliberate long pauses. Recognition must not "skip ahead" to the next phrase when you go silent.

---

## 5. Feature D: Move It (physical voice)

### What it is
"Your voice isn't monotone, you're vocally lazy." You say the same line several times, each time with a big physical action, then once more standing still while keeping the energy.

Example line: *"I really need you to hear what I'm saying."*
1. **Neutral**: just say it. (This is the baseline take.)
2. **Punch**: punch the air on the key word.
3. **Wring**: wring out an imaginary wet towel through the whole line.
4. **Point**: exaggerated pointing on each stressed word.
5. **Ghost take**: no movement, same energy. *This is the take that matters.*

### Why it works
Punch and wring are two of the **Laban effort actions** (punch, wring, press, slash, flick, dab, glide, float) that actor voice training uses to link body and voice. Research on gesture and speech finds that arm movement physically pushes pitch and loudness peaks (Pouw et al.), and that beat gestures make spoken emphasis more prominent (Krahmer & Swerts).

### Movement library (`src/content/movementContent.ts`)
Each movement has a name, a one-line cue and an icon: Punch, Wring, Point, Press (push a wall), Slash, Throw (throw a ball on the key word), Float (open, light arms), Pull (rope).

Lines come in three types:
- **emphasis** ("I really need you to hear what I'm saying.")
- **contrast** ("It's not what you said, it's how you said it.")
- **story** (two sentences)

### Feedback: contrast, not a grade
For each take, measure **loudness range** (the live meter's `VolumeReading`s, already captured) and, if feasible, **pitch range** (`analyzePitchVolume` in `src/domain/audioAnalysis.ts`, which needs each take's audio. **Check this first:** does the drill runner keep the PCM/audio file per take? If not, v1 uses loudness only and adds pitch once the takes' audio is kept).

The result is a small bar chart per take (Neutral, Punch, Wring, Point, Ghost) with the line "Your ghost take had 1.8× the range of your neutral take." The take with the most range is called out descriptively. There's no "good voice" score.

### Staircase
Success = the ghost take's range is at least X% above the neutral take's, with X growing with level. As the level rises: fewer movement takes before the ghost take; longer lines (sentence → story); finally **"Move it in a real rep"**, a 60-second rep where you gesture freely, followed by a ghost rep.

### Practical
- Hands must be free, so the screen shows "prop your phone up first". It's audio-only (no camera needed), and the takes advance by voice activity or a big tap target.
- New `DrillType` `"move_it"` (skill `cadence`).

---

## 6. Feature E: Feeling of the Week

### What it is
One emotion per week from the wheel (**joy, love, surprise, sadness, fear, anger**, Parrott's six primaries). Think of a real time you felt it, then talk about it on camera for 1–2 minutes with as much detail as you can. **The rules on screen:** be honest, be vulnerable, be real.

### Why
Putting feelings into words ("affect labeling") reduces their intensity (Lieberman et al.). People who describe emotions in finer-grained words handle them better (emotional granularity: Barrett; Kashdan et al.). Talking through emotional experiences is the spoken cousin of Pennebaker's expressive writing. It also trains the exact skill of "I know what I mean but it comes out convoluted."

### Mechanics
- **Weekly rotation:** a 6-week cycle that starts Monday in local time (see the `recorded_at`-is-UTC rule: compare local dates). The user can swap this week's emotion.
- **A vocabulary ladder** shown during prep: the core word → secondary → tertiary feeling words from the wheel (e.g. *fear → nervousness → anxious, uneasy, dread*). The aim is to reach for a more precise word than the core one.
- **Detail prompts** shown during a 30 s prep, then hidden: where were you · who was there · what you saw or heard · what it felt like in your body · the thought in your head · the moment it peaked · what changed after.
- **A different angle each rep** if they do more than one that week: "a time you felt it" → "a small everyday moment of it" → "how it shows on you (body, voice)" → "what you wish you'd said then."
- **A gentle guardrail line:** "Pick a memory you can talk about without being swept back into it. It doesn't have to be the biggest one." Swap and skip are always available.

### What's measured (process only, as in the Conversation skill)
- Spoke for at least 45 s.
- **Feeling words you used**, matched against the wheel lexicon and shown as chips ("you used: *dread, relief, embarrassed*"). This is a celebration, not a grade.
- No overall score, no radar chart, no cloud content scoring. **Kept out of** the curriculum composite, skill mastery, and weekly drill averages.

### Privacy defaults (important)
- Cloud review **off**, forced at the Preview step, with a one-line note if you turn it on. (The Notion journal this also covered was removed from the app on 2026-10-12.)
- **Never picked as a monthly keepsake video.** Exclude it in `videoKeepsakes.ts`'s `rank`, the same way `script_practice` is ranked down.
- A new `SessionType` `"feeling"` keeps it filterable in History.

### Where it lives
A **weekly ritual card** on Today ("This week: Joy · 0 of 1") outside the 5-skill rotation. `chooseFocusSkill` never picks it. It's also available from Learn.

### Data (v18)
```sql
CREATE TABLE feeling_weeks (
  week_start TEXT PRIMARY KEY NOT NULL,  -- local YYYY-MM-DD (Monday)
  emotion TEXT NOT NULL,
  swapped INTEGER NOT NULL DEFAULT 0
);
-- sessions gain: feeling_emotion TEXT, feeling_angle TEXT (nullable)
```

---

## 7. Feature F: Daily goal (1–3 sessions a day)

### Current state
- There's one plan per day (the `daily_plans` primary key is `date`), with plan length set to 5, 8 or 12 minutes (`getPlanMinutes`).
- A streak counts any day with at least one session (`src/domain/streaks.ts`).
- There's one reminder at one hour (`ReminderSettings.hour`).

### Design
- **Session 1 is the full daily plan**, unchanged except for the Line of the day (B).
- **Sessions 2 and 3 are short top-ups of 3–5 minutes**, each on a *different* skill from the sessions already done today (`chooseFocusSkill` with the day's earlier focus skills blocked). Spaced short sessions beat one long one (the spacing effect). Top-ups lean on quick drills (Word Chain, Move It, Mark It Up, a micro-rep).
- **Today screen:** a goal row `●●○ 2 of 3`. After session 1, the hero card becomes "Top-up · 4 min · Cadence".
- **Spacing:** suggested, not locked: "Best after 2 pm". (Decision §10.2.)
- **Reminders:** `ReminderSettings.hour` → `hours: number[]` (one per session goal; migrate the old `hour` to `[hour]`). Each is a one-time alarm that's skipped when that session is done, the same pattern as `computeNextReminderDate`.
- **Streak unchanged:** one session keeps the streak alive. Missing the 2nd or 3rd *never* breaks it. A separate "Goal met 5 of 7 days this week" stat goes on Progress.

### Data (v18)
```sql
CREATE TABLE daily_sessions (
  date TEXT NOT NULL,
  slot INTEGER NOT NULL,           -- 0 = main plan, 1..2 = top-ups
  plan_json TEXT NOT NULL,
  completed_steps_json TEXT NOT NULL DEFAULT '[]',
  completed_at TEXT,
  PRIMARY KEY (date, slot)
);
-- copy daily_plans rows in as slot 0; keep daily_plans read-only until removed
```
Pref: `dailySessionGoal: 1 | 2 | 3` (default 1).

---

## 8. Feature G: Onboarding and baseline

### Principles
1. **Every question must change something.** If an answer doesn't set a default, pick content, shape the plan, or change the copy, cut the question. The tables below map each question to what it changes.
2. **Short chapters, one question per screen, a visible progress bar.** Most answers are a single tap. Free text is always optional.
3. **Resumable.** Quitting mid-way keeps the answers. Chapters 1–3 take about 3 minutes. Chapter 4 (the skill check) can be done right away or become **Day 1's session**.
4. **Warm, never clinical.** The person installing this is likely anxious about speaking. Nothing is graded during onboarding, and the word "test" never appears.
5. **Everything is editable later** in Settings → "Your profile and goals".

### Chapter 1: About you (about 90 s)
| # | Question | Answer type | What it changes |
|---|---|---|---|
| 1.1 | What should we call you? | text, optional | Copy ("Nice work, Ahmad"). Never spoken by TTS. |
| 1.2 | Where do you most want to speak better? | multi: work meetings · presentations · job interviews · dating and social · everyday conversation · on camera / content · leading a team · school | Topic and prompt mix (prompts gain `contexts[]` tags), Conversation partner scenarios, and which frameworks reps use (interviews → STAR, PREP; presentations → PREP, What/So What/Now What; social → conversation drills). |
| 1.3 | What gets in your way? | multi: I ramble · I blank / don't know what to say · filler words · nerves · flat or monotone voice · I talk too fast · I mumble / unclear words · quiet voice · I sound unsure (hedging) · eye contact · putting feelings into words | The **priority boost** per skill and lesson (see Personalization) and which features get featured (feelings → Feeling of the Week; monotone → Move It). |
| 1.4 | Is anything coming up? | none · a date + what it is (interview, talk, wedding toast, pitch…) | **Event mode:** the plan ramps toward the date, topics shift toward the event in the final two weeks, and Today shows a countdown. A rehearsal reminder goes out 2 days before. |
| 1.5 | How do you feel about speaking in front of people right now? | 1–5 slider, from "I avoid it" to "I enjoy it" | Starting tone. At 1–2: gentler copy, **Record blind on by default**, longer prep, the Feeling of the Week guardrail line, and Conversation drills start generous. It's also the first point on the "felt" confidence trend, repeated monthly. |
| 1.6 | How do you feel about seeing yourself on video? | fine · a bit awkward · I'd rather not | Record-blind default; whether the Result screen opens on the video or on the audio and transcript; whether the three-pass review starts with "listen only". |
| 1.7 | Have you done speaking training before? | none · a little (videos, books) · a course or Toastmasters · lots | Lesson **teach** text: skip the beginner explainers the first time through for "lots". It does **not** change the starting level (§10.1). |

### Chapter 2: About how you speak (about 60 s, all optional)
| # | Question | What it changes |
|---|---|---|
| 2.1 | Is English your first language? (yes · no · prefer not to say) | Sets an expectation in the copy: "we coach clarity, not accent", and accent never counts against you. Minimal-pair sets are then picked from which pairs you actually miss, not assumed from your language. Live speech recognition may be less accurate, so word-following drills relax their accuracy target by one notch. |
| 2.2 | Do you stutter or have another speech difference you'd like us to know about? (no · yes, stuttering · yes, something else · prefer not to say) | **Stuttering mode:** hesitations, repetitions and blocks are never counted as fillers or slips. Just a Minute and Word Chain stall penalties are off, the reset-on-blank still works, and copy avoids "fluency" framing. This app is not therapy, and the screen says so with a pointer to a speech-language pathologist. |
| 2.3 | Anything about your voice we should know? (free text, optional) | Stored only. Shown back on the profile screen so the user can see it was heard. Not parsed. |

### Chapter 3: Your practice (about 60 s)
| # | Question | What it changes |
|---|---|---|
| 3.1 | How many times a day do you want to practice? (1 · 2 · 3) | `dailySessionGoal` (Feature F). |
| 3.2 | How long is a session? (5 · 8 · 12 min) | `getPlanMinutes` default. |
| 3.3 | Which days? (every day · weekdays · pick days) | Reminders only fire on chosen days, and **a day you didn't plan to practice never breaks the streak** (this resolves §10.3). |
| 3.4 | **When will you practice?** Anchor it to something you already do: after my morning coffee · on my commute · lunch break · after work · before bed · custom | Builds an "After I ___, I'll practice" **if-then plan** (implementation intention; Gollwitzer), shown on Today and in the reminder copy ("Coffee's done? 5 minutes."). The anchor sets the suggested reminder time. |
| 3.5 | Where will you usually practice? (private room · car (parked) · office / shared space · walking outside) | Shared space or walking: no Projection or Move It in top-ups, offer **quiet variants**, default to audio-only. Car: audio-only, no camera framing. Private room: everything. |
| 3.6 | Reminder time(s) | Pre-filled from 3.4. Notification permission is asked *here*, in context, after the user has picked a time. |
| 3.7 | How much help from the cloud? Phone only (default) · deep review with Gemini | Sets the `wantsCloudReview` default, with one plain sentence on what leaves the phone. (A Notion journal option was removed with the feature on 2026-10-12.) |
| 3.8 | How long should videos be kept? (30 days + monthly keepsakes (current default) · 7 days · forever) | Video cleanup cutoff. |
| 3.9 | What will be different when this works? (free text, optional) | Your "why". Shown back on low-streak days and on the 30-day retake screen. |

### Chapter 4: Setup check (about 60 s)
1. **Camera and mic permissions** (reuse `useCameraPermissions`).
2. **Framing:** the `FramingGuideOverlay` live check ("face centered, eyes near the top third"). Skipped when 3.5 or 1.6 chose audio-only.
3. **Lighting:** the face landmarker must find a face for 2 s. If it can't, a one-line tip ("face a window or lamp").
4. **Mic level:** say "Hello, my name is ___". A live meter shows the level, with "move closer" if it's too quiet. This also tells us whether live speech recognition works on this phone; if it doesn't, word-following drills fall back to self-rating.

### Chapter 5: Skill check (about 5 min, or tomorrow as Day 1)
Short pieces, each skippable, so the **baseline covers all five skills** instead of only three:
| Piece | Time | Measures | Skill |
|---|---|---|---|
| **Read aloud**: a short passage | 30 s | word accuracy via the existing alignment (articulation), words per minute (pace) | articulation, cadence |
| **Name as many animals as you can** (Category sprint) | 30 s | retrieval speed | impromptu |
| **One partner line, then your reply** (`conv_reply` at level 1) | 20 s | reply latency, whether you asked something back (process only) | conversation |
| **Talk about a random topic**, up to 2:00, 30 s prep, one free re-roll | ≤ 2.5 min | pace, pauses, pitch range, fillers, hesitations, structure and rambling metrics, hedges, ending, gaze, expressiveness | impromptu, cadence, confidence |

Copy before the topic: "Stopping early is fine, that's useful information too." Minimum about 45 s to analyze. On-device analysis only (cloud only if 3.7 opted in). **Felt vs observed:** before seeing results, "How do you think that went?" (1–5), using the existing `FeltObservedCard` pattern. It's the most honest early signal of how harsh this person is on themselves.

### Chapter 6: Your starting point and plan
- **2 strengths first, then 2 focus areas,** each in plain words with the measurement behind it ("You paused at most full stops, that's rare"). **No overall number** and no radar chart.
- If **felt** was much lower than **observed**: "You came across better than you thought." This is one of the most useful things the app can say to an anxious speaker.
- **Your first week:** the next 7 days of plans, the if-then plan from 3.4, and the event countdown from 1.4.
- **Expectation setting:** "Levels move slowly on purpose. Expect to notice a difference in about 3–4 weeks, and we'll retake this check at day 30 so you can see it."

### What the skill check can tell us
| Skill | Signal |
|---|---|
| Articulation | ✅ word accuracy on the read-aloud (alignment), plus recognition confidence |
| Cadence | ✅ pace on the read-aloud and the topic, pauses, pitch range |
| Impromptu | ✅ Category sprint count, fillers, hesitations, structure and rambling metrics |
| Confidence | ✅ gaze and expressiveness (MediaPipe), volume, hedges, ending |
| Conversation | ⚠️ one reply's latency and whether you asked back. Thin, so blended 50/50 with the self-report from 1.3 |

Skipped pieces leave that skill "not measured yet". It's picked in week 1 anyway, because `chooseFocusSkill` gives unpracticed skills extra weight.

### Personalization
- **Seed `skill_mastery` ratings** at 15–45 from the skill check, instead of a flat 25 (`INITIAL_RATING`). `chooseFocusSkill` already weights lower ratings more, so this does most of the work.
- **A goal priority boost:** new `PlanInput.priority: Record<SkillId, number>` added to the focus weight, **fading over about 4 weeks** as real data builds. Event mode (1.4) holds the boost for the event's skills until the date.

| "What gets in your way" (1.3) | Skills boosted | Lessons and features moved up |
|---|---|---|
| I ramble | conversation, impromptu | `conv_straight`, `imp_structure`, Word Chain bridge mode |
| I blank | impromptu, conversation | Word Chain, `imp_1_retrieval`, `conv_moves` |
| Filler words | cadence, impromptu | pause unit, Just a Minute |
| Nerves | confidence | `con_nerves`, warm-up on by default |
| Flat or monotone voice | cadence | Move It, pitch unit, Line of the day stresses pitch |
| Too fast | cadence | pace unit, Mark It Up with slow spans |
| Mumble / unclear | articulation | articulation track, minimal pairs |
| Quiet voice | confidence | Projection (not in a shared space, 3.5) |
| Sound unsure | confidence | `con_4_hedges`, `con_5_endings`, pitch unit (falling endings) |
| Eye contact | confidence | `con_presence` |
| Feelings | (no skill) | Feeling of the Week featured on Today |

- **Contexts (1.2)** tag prompts and partner scenarios. New prompts are needed for interviews, meetings, dating and social, and leadership. `topics.ts` currently has generic categories (Opinion, Personal, Explain, Story…).
- **Curriculum level stays at 1** (decision §10.1).

### Existing installs
If any session exists, skip the full flow and mark onboarding complete. Then show **"Set up your profile"** (chapters 1–3 only, pre-filled where we can infer answers, e.g. reminder time) and **"Take a skill check"** (chapter 5) cards on Progress.

### Monthly check-in and 30-day retake (phase G2)
- **Day 30:** retake the skill check with the **same topic and passage**. A side-by-side video comparison, per-skill changes, the 1.5 slider again, and your "why" from 3.9 shown back.
- **Monthly after that:** only the 1.5 slider and a one-tap "still the right goals?", which feed the felt-confidence trend on Progress.
- **Skill-check videos are always keepsakes** (`keepsake = 1`) so cleanup never deletes them.

### Data (v18 or v19)
```sql
CREATE TABLE user_profile (            -- single row, id = 1
  id INTEGER PRIMARY KEY CHECK (id = 1),
  display_name TEXT,
  contexts_json TEXT NOT NULL DEFAULT '[]',
  obstacles_json TEXT NOT NULL DEFAULT '[]',
  event_json TEXT,                     -- {date, kind, note}
  experience TEXT,
  english_first TEXT,                  -- 'yes' | 'no' | 'unsaid'
  speech_difference TEXT,              -- 'none' | 'stutter' | 'other' | 'unsaid'
  voice_note TEXT,
  practice_days_json TEXT NOT NULL DEFAULT '[0,1,2,3,4,5,6]',
  anchor TEXT,
  practice_place TEXT,
  why TEXT,
  onboarding_chapter INTEGER NOT NULL DEFAULT 0,   -- resume point
  onboarding_completed_at TEXT,
  updated_at TEXT NOT NULL
);
CREATE TABLE confidence_checkins (     -- 1.5, repeated monthly
  date TEXT PRIMARY KEY NOT NULL,
  rating INTEGER NOT NULL
);
CREATE TABLE skill_checks (
  id TEXT PRIMARY KEY NOT NULL,
  taken_at TEXT NOT NULL,
  session_id TEXT,                     -- the topic recording
  results_json TEXT NOT NULL,          -- per-piece measurements + derived ratings
  felt INTEGER
);
-- sessions gain: is_skill_check INTEGER NOT NULL DEFAULT 0
```
Prefs stay in MMKV for synchronous reads: `dailySessionGoal`, `recordBlind`, the cloud defaults, the video retention cutoff.

### Screens
`OnboardingNavigator` (its own stack, shown before `Tabs` when `onboarding_completed_at` is null): `Welcome`, `QuestionScreen` (one generic, data-driven screen rendering single, multi, slider, text and date question types from a `ONBOARDING_QUESTIONS` table in `src/content/onboarding.ts`), `SetupCheck`, `SkillCheck` (a runner that reuses the drill and recording screens with a `practice` context), and `StartingPoint`.

---

## 9. Build order

Each phase is shippable alone, with tests in `src/domain/__tests__/` for every pure module.

1. **A: Word Chain.** Small, standalone, and immediately usable.
2. **C: Mark It Up**, in four slices:
   - **C1, quick fixes to today's Script Practice:** no hard stop at the target, the marked text visible during prep, text kept out of the controls zone, a legend, and the "Sales pitch" rename. Small, and it fixes the worst of §4.1 right away.
   - **C2:** the `Mark` model, the marking guide and rule auto-marker (with tests), about 150 built-in Lines, and the **line rep** (§4.2) with tap-to-advance. This is the core of the feature and the first thing worth using daily.
   - **C3:** the editor and Compare, "From your own text" (paste or scan, then pick 1–2 sentences), `marked_texts`, the on-device model auto-mark, and Remix.
   - **C4:** the Speeches shelf: re-marking all 12 scripts to the guide, then Study → Rehearse → Perform with voice-follow (an iPhone check is required).
3. **D: Move It.** Loudness contrast first. Pitch contrast once per-take audio is confirmed.
4. **B: Cadence track rebuild and Line of the day.** Content and plan builder changes that wire C and D into lessons.
5. **E: Feeling of the Week**, privacy defaults included.
6. **F: Daily goal**: `daily_sessions` migration, Today goal row, multi-reminders.
7. **G: Onboarding and baseline**, then **G2: 30-day retake.**

---

## 10. Open decisions (defaults in bold)

1. **Starting level from the baseline:** **stay at Level 1** and only personalize focus. The alternative is letting a strong baseline place at Level 2–3. One 2-minute sample is noisy, and the curriculum comments deliberately start everyone at the bottom.
2. **Spacing between daily sessions:** **suggest, don't lock.**
3. **Days per week:** **now resolved** by onboarding question 3.3. Unplanned days never break the streak.
4. **Word Chain bridge mode:** **phase 2 of A.**
5. **Move It camera:** **audio-only.** The alternative is optional video so you can see your own gestures.
6. **Feeling of the Week placement:** **weekly ritual card outside the skill rotation.** The alternative is making it part of the confidence or conversation track.
7. **Line of the day in 5-minute plans:** **replaces the generic warm-up.**
8. **Script Practice:** **folded into Mark It Up** as the Speeches shelf, with one reader for everything. The alternative is keeping it as a separate screen and only applying the C1 fixes.
9. **Speech-difference question (onboarding 2.2):** **include it, optional, with "prefer not to say".** It's the only way to stop the app from counting stuttering as fillers or slips.
10. **Event mode (onboarding 1.4):** **include it in G.** The alternative is deferring it to G2. It's the strongest motivator a new user can bring, and it's cheap: a date, a priority boost, and topic tags.
11. **Skill check timing:** **offer "now" or "tomorrow as Day 1"**, with "now" pre-selected.

---

## 11. Sources

- progress.playground (Instagram/TikTok): association chains; "not monotone, vocally lazy" with punch, wring and pointing; annotated reading; the emotion wheel.
- Verbal fluency (semantic and phonemic) tasks: standard neuropsychology. The chain is a continuous free-association variant.
- Krahmer & Swerts (2007), *The effects of visual beats on prosodic prominence*: gestures strengthen spoken emphasis.
- Pouw, Harrison & Dixon (2020), *Gesture–speech physics*: upper-limb movement shapes pitch and loudness peaks.
- Laban effort actions (punch, wring, press, slash, flick, dab, glide, float), as used in actor voice and movement training.
- Parrott (2001) emotion tree; Willcox (1982) Feelings Wheel.
- Lieberman et al. (2007), *Putting feelings into words* (affect labeling).
- Kashdan, Barrett & McKnight (2015), emotion differentiation and granularity.
- Pennebaker: expressive writing.
- Cepeda et al. (2006): distributed practice (spacing effect) meta-analysis.
- Gollwitzer (1999); Gollwitzer & Sheeran (2006): implementation intentions ("After I ___, I'll ___") and their effect on following through. Basis for onboarding 3.4.
- Vinh Giang: rate, pause, pitch and emphasis (already cited across the cadence lessons).
