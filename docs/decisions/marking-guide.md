# Marking guide (for built-in content and the auto-marker)

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

That's 16 pauses, 11 inflections and 7 emphases across these 6 sentences.
