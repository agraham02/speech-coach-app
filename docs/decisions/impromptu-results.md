# Impromptu results screens (session 11)

Session 11, 2026-10-23, branch `feature/impromptu-results`. Built on the score sheets from session 07 (`docs/decisions/scoring-taxonomy.md`) and the signal data from session 06 (`docs/research/signal-capture.md`). Phone checks are in `docs/testing/device-test-plan.md`, section H. Nothing here has been run on a phone or an emulator; the logic is unit-tested and the screens type-check.

## 1. Old screens versus new

**Overview, before:** the hero ring with the archetype and "archetype fit" under the score; a "How this score is built" card (Cadence, Impromptu, Confidence rows that expand); the coach card (strength, tip, six verdict dots); the comparison card; the prompt; the player; the steps; and, separately, a second "Coaching" card (summary, strength, focus, next drill) from the review.

**Scores tab, before:** only there if the Gemini rubric row existed. A five-axis radar (Structure, Content, Delivery, Presence, Congruence) and accordions in the old rubric grouping, with the pace sparkline and one pitch and volume chart at the bottom of Delivery. A free user, or anyone whose review hadn't run, had no Scores tab at all.

**Overview, now:**
- The hero says "Judged by Tono AI" or "Measured on this phone" where the archetype was.
- "Your scores" (`ScoreSummaryCard`): one row per skill with its score and bar, the sub-scores listed under it with the same names and numbers as the Scores tab, its share of the total, and a "See every score" button. It is a summary and explains nothing.
- One coaching card (`CoachCard`): the reviewer's summary (judged takes only), the strength, the tip with the focus skill, the reviewer's next drill (judged only), the follow-up question, and who wrote it. The verdict dots are gone: they repeated the scores.
- Everything else that was there is still there, in the same place.

**Scores tab, now** (`ScoresTab`): there for every scored take.
- A header with the overall and, when a take has both layers, a switch between "Tono AI" and "This phone".
- A card per skill. Under it, each sub-score with its bar, who gave it (Tono AI or "measured on the phone"), the judge's note, and a "How it's measured" fold-out with the measured numbers and the rule behind them.
- Tone fit and Body language are shown and labelled "not in the total", as the taxonomy says.
- Each graph sits directly under the sub-score it explains: Pace over time under Pace, Pitch over time under Pitch variety, Loudness over time under Emphasis.

**Transcript tab:** the phone's fillers in two colours, repeated words, and an optional layer of Tono AI's notes (section 4).

**Other places that now agree:** the Library marks judged takes and averages each month within one layer; Progress → Score trends (was "Deep review trends") draws the judged and measured lines separately; the "Since your last take" card judges pace against the same 130 to 160 band as the score.

## 2. Where the data comes from

| Shown | From |
|---|---|
| Overview rows, Scores tab scores, sub-score notes, measured numbers | the `session_score` artifact (`TakeScores`, `measured` and `judged` sheets) |
| Judge's summary, next drill, body-language note | the `scores` row (the review's rubric) |
| Strength, tip, focus, follow-up | the `coach` artifact (Tono AI's words on a judged take, the rules' otherwise) |
| Pace chart | `sessions.wpm_curve_json`: words a minute in 5 second windows |
| Pitch and loudness charts | the `signals` artifact's packed 10 ms audio track, through `voiceChartData()` (`services/signals/voiceCharts.ts`). No longer the 200 ms `pitch_contour_json` and `volume_envelope_json` columns |
| Pitch coverage line | the `signals` summary (`voicedShare`, `voicedSeconds`) |
| Library layer mark and month averages | the `headline` in the `session_score` artifact, read in the same query as the score |
| Trends lines | the two sheets in each take's `session_score` artifact |

No migration was needed.

## 3. The graphs

### What was wrong with the old charts (from the code)

1. **Null drawn as 0.** Gaps went to the floor, so a take with 6 to 9% of the voice found was a line on the floor with spikes.
2. **A 0 Hz baseline.** The axis ran from 0 to about 250 Hz. A 5 semitone spread of a 120 Hz voice (40 Hz) used about 16% of the height. This is the "mostly flat" look, and it would have looked flat with perfect data.
3. **A fixed 50 px per point** (the library's default) at 5 points a second, so a 55 second take was about 13,750 px wide. That is why scrolling a 1 to 2 minute take took forever.
4. **Different scales on each chart.** The volume chart had y numbers in dBFS with no x labels, so it could not be lined up with the pitch chart above it.
5. **A smoothed curve** through those points, which draws values that were never measured.
6. The graphs were at the bottom of Delivery, away from the scores they explain.

### Is the data poor? What I can and can't say

- **Old tracker:** yes, and badly. It found a pitch in 6 to 9% of buckets (`docs/research/signal-capture.md` section 2). The flat look was mostly this plus items 1 and 2 above.
- **New tracker (session 06):** found about 90% of the voiced frames (0.92 on synthetic voices and 0.89 on real read speech, both through the simulated phone chain), in the offline spike. I have not seen a real take from Ahmad's phone, so **I can't say whether the line now looks right on real takes.** The test plan has a flat-versus-lively pair for exactly this.
- **What the chart does to stay honest:**
  - a fixed axis in semitones from your median, never narrower than 6 either way, so a flat voice looks flat;
  - straight lines between measurements, no curve;
  - gaps left as gaps;
  - a line under the chart saying how much of your speaking could be read ("Pitch read for 71% of your speaking (24 s)"), with a plain warning when it is under 40%;
  - "not enough clear voice" instead of a line when there are under 3 voiced seconds.
- **Waiting on session 06 and the phone:**
  - real-take validation of the dense YIN tracker (Voice Lab and section F of the test plan);
  - calibration of the 5.5 semitone full-marks band, which is only drawn here as a shaded reference;
  - the personal baseline after 5 takes;
  - breath and pause markers (the hysteresis gate), uptalk and "possible missed filler" spots, which the feature track has but no chart draws yet.

### The approach, and why

Options I weighed:

| Option | Verdict |
|---|---|
| Keep scrolling, shrink the spacing | Rejected: either too wide or too small to read. |
| Fit to width, nothing else | The default. A whole take is visible at once, but 5 point detail is lost on long takes. |
| Minimap (a strip with a draggable window) | Rejected for now: a fourth thing on screen, and two fingers do the same job. |
| Scrub synced with the recording | The right idea, but the player lives on the Overview tab. Putting a second player on the Scores tab doubles the video memory and desyncs. |
| **Chosen: fit to width + a shared time axis + scrub + pinch zoom + a hand-off to the player** | Below. |

What is built:
- All three charts share one viewport and one cursor (`TimelineProvider`). They show the whole take by default.
- Drag one finger sideways, or tap, to point at a moment: every chart draws the cursor and the chart you are on reads out the time and value (for pitch, semitones and the Hz that means for your voice).
- Pinch or double tap to zoom (down to about 8 seconds across), two fingers to move along, plus minus and "whole take" buttons for anyone who can't pinch. Zooming switches to finer buckets (about 75 ms against 300 ms) so detail comes back.
- "Play from here" on the readout opens the Overview's player at that moment with sound.
- Every chart has the same plot area, tick marks and mm:ss labels, and the unit in its title. Pace has the 130 to 160 band shaded, pitch the full-marks semitone band, loudness is dB from your usual speaking level.
- It is built on the responder system (like the existing `Scrubber`), not a gesture library, because the app has no `GestureHandlerRootView`. A sideways drag or a second finger takes the touch; a vertical drag still scrolls the screen. **This is the part most likely to need a fix on a phone.**

## 4. The transcript mark-ups

### What the marks were, and why they felt senseless

There were three kinds: fillers and repeated words (on the phone, exact), and up to 8 "annotations" from the review, painted onto the transcript in five colours. The review's ones were the problem:

1. **They quoted the wrong transcript.** A video review transcribes the audio itself, so its quotes came from its own words, and the screen showed that transcript instead of the phone's. A quote the phone didn't have simply vanished.
2. **They were found by the first matching text.** A generic phrase, or a quote that is a part of a longer word, marked the wrong spot.
3. **Two of the five categories can't be seen in words.** "Presence" (eye contact) and "delivery" (how it sounded) were highlighted on text, which reads as a random phrase.
4. **The categories were the old rubric's** (structure, delivery, presence, content), not the taxonomy's, and had no link to any score you can see.
5. **No attribution.** Nothing said an AI had chosen them.

### The decision: (c), with the AI layer off until asked for

- The phone's marks are always on, as before, with one change: um/uh and like/you know/actually are two colours, because the second kind are fillers only some of the time.
- Tono AI's marks are now an optional layer, **off by default**, with a switch that appears only when some marks hold up. A mark is shown only if it is about the words (structure, the point, a repeated idea), its quote is found, whole words, ignoring case and punctuation, in exactly one place in the **phone's** transcript, it doesn't overlap another, and there are at most 6 (`domain/results/aiMarks.ts`). Labels use the taxonomy's names; the tap note is headed "Structure · Tono AI".
- Everything else is dropped, never guessed at. Presence and delivery notes are still on the Scores tab, next to their scores.
- I did not route this through the AnalysisService `mark_up` kind: that kind (and `autoMarkText.ts`, the Mark it up drill) marks pauses and emphasis for reading a script aloud, a different feature. The transcript notes come with the take review, which already carries its provenance.

**For session 08:** the review prompts (`measuredReview.ts`, the video prompt in `schema.ts`) still ask for 4 to 8 annotations in all five categories; only structure, content and restated_point are ever shown, so the rest costs output tokens for nothing. When 08 moves to the taxonomy-native schema with evidence quotes, keep `groundAiMarks` as the verifier.

## 5. Decisions for you

Each is built as stated and is easy to reverse.

1. **Transcript marks: option (c), AI layer off by default.** To turn it on by default, change `useState(false)` for `showAi` in `AnnotatedTranscript.tsx`. To drop the AI layer, delete the `aiMarks` prop.
2. **The Scores tab exists for every scored take**, not only reviewed ones. A free take shows the measured sheet with its charts.
3. **The five-axis radar is gone.** With three skills it would be a triangle, and the Overview's skill rows say the same thing.
4. **The coach card lost its verdict-dot rows**, since they restated the scores. The data is still in the `coach` artifact if you want them back.
5. **One coaching card.** On a judged take it carries the reviewer's summary and next drill. The rubric's own "strength" and "focus area" are no longer shown: Tono AI's coach strength and tip (from the same call) say the same thing and can't contradict them.
6. **Library months average one layer.** If a month has any judged takes, its average is of those only and says "Tono AI"; otherwise of the measured ones. A month's change is shown only against an earlier month of the same layer.
7. **Score trends** (was "Deep review trends"): a two-line chart (judged, measured) and a week card per layer, by skill. Dropped: the archetype badge, "Repeated ideas a minute", and the Structure, Delivery and Coherence rows (they were the old rubric's names). Script readings are left out (their categories differ).
8. **Play from here goes to the Overview player** rather than a player on the Scores tab. A second video player on the same screen would double the memory and drift out of sync.
9. **Pitch band on the chart** is the scoring band's full-marks width (5.5 semitones, or your own after 5 takes), centred on your median. It is a reference, not a target; the score still uses the p10 to p90 spread.
10. **Not done, on purpose:** the "locked" line for free users where a judged layer would be (`whatCanShow` is never "locked" until session 08 wires the free tier); a pause or eye-contact timeline chart (the data is in the feature track); a tap-to-seek transcript.
