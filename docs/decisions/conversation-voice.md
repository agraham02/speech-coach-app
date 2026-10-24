# Live conversation with a real voice

Session 12, 2026-10-24. Branch `feature/conversation-voice`.

Status: **built, not yet run on a phone or against Google.** No API key was used and no paid call was made, so every latency and voice-quality number below is an estimate or a measurement of the code, not of Google. Test plan section K collects the real ones. Read with `inference-strategy.md` (the stack this builds on), `tiers-and-trial.md` (the tiers it plugs into) and `scoring-taxonomy.md`.

## Contents

1. [The answer](#1-the-answer)
2. [The Conversation skill today](#2-the-conversation-skill-today)
3. [The loop](#3-the-loop)
4. [Latency: the budget and how it's hidden](#4-latency-the-budget-and-how-its-hidden)
5. [Interruptions, the audio session and headphones](#5-interruptions-the-audio-session-and-headphones)
6. [Offline, failures and recovery](#6-offline-failures-and-recovery)
7. [Safety and content limits](#7-safety-and-content-limits)
8. [Scoring and the debrief](#8-scoring-and-the-debrief)
9. [Free users and the upgrade moment](#9-free-users-and-the-upgrade-moment)
10. [Voices and speed](#10-voices-and-speed)
11. [Cost, and the conversation minutes](#11-cost-and-the-conversation-minutes)
12. [Where this differs from session 04](#12-where-this-differs-from-session-04)
13. [What was built](#13-what-was-built)
14. [What was measured](#14-what-was-measured)
15. [Decisions for Ahmad](#15-decisions-for-ahmad)

---

## 1. The answer

**Yes, it's worth it, for Plus.** Replying in the moment is the skill behind your own goals (blanking in the gap after someone speaks, rambling once you start), and a partner who only opens the conversation can't train it. A partner who answers what you actually said, in a voice you'd happily listen to, can.

What's built:

- **A live conversation** for Plus and the trial (and testers in beta): a partner with a name, a role and a setting opens with one of the drill lines, you reply, the phone decides when you've finished, the partner answers in character, for 4 to 6 replies; then a short debrief of the moves you made.
- **The cascade from session 04:** the phone listens and transcribes (the live recognizer the drills already use), the server writes the partner's line (Gemini 3.5 Flash-Lite, thinking off) and speaks it (Gemini 3.8 Flash-Lite TTS), streamed back as it's made, in one request per turn.
- **The skill's rules are kept:** process-only scoring, the live transcript hidden while you reply, blanks never scored, the mic closed while the partner speaks.
- **Free users** keep every lesson and every scripted drill; a lesson shows one card that says what the live version is, with a sample, and one quiet line about Plus.
- **A Dev tab lab** ("Partner voices") to hear the candidate voices on your phone, time them, rate them, and time whole partner turns.
- **The 120-minute cap is enforced,** measured by the server, never by the phone.

## 2. The Conversation skill today

Audited on `staging` at 84c6d5b.

**Content.** Five units, 24 lessons (`src/content/lessons.ts`): Outward attention, Moves, Starting and leaving, Say it straight, Wit and warmth. Each lesson is a teach card (why, three how-tos, a source) and one or two practice steps.

**The drills** (`src/domain/drills/drillSpecs.ts`, run by `ConversationRunnerScreen.tsx`): twelve scripted drills (reply window, take a beat, ask about it, hold one word, curious outsider, echo-ask-add, join the group, replay a blank, land the plane, squeeze it, call it back, react). Each is one or a few fixed partner lines from `conversationContent.ts` (about 140 lines in all).

**How they run:**

- The partner's line is spoken by **expo-speech** (iOS AVSpeech) with whatever English voice the phone has, ranked by `domain/conversation/voices.ts`, and shown as text (silent mode mutes AVSpeech).
- Then, 300 ms after the last word, the live recognizer (`expo-speech-recognition`, on-device, `services/speech/liveSpeechSession.ts`) listens. The reply ends on 2.2 to 3.5 s of silence after words, on a long wait with none, or at a cap.
- **One partner line, one reply.** The multi-turn drills (group, callback, squeeze) play the next scripted line whatever you said. Nothing ever answers you. That's the "it only starts the conversation" problem.
- The voice is the other problem: AVSpeech's default voices are the flat, robotic ones unless the person has downloaded Enhanced or Premium voices in iOS Settings, which almost nobody has.

**What's scored** (`evaluateConversation.ts`): did you reply (3+ words), how soon, did you ask (`questions.ts`, from words since live recognition has no punctuation), did you use their words (`threads`), echo-ask-add beats, point first and a clean ending (land the plane), staying in time, the callback. Never quality. No percentage chart, no red misses, kept out of the weekly drill average (the `skill != 'conversation'` filter in `statsRepo.ts`). A drill where nothing was recognized isn't recorded. Before and after, "how much of your attention is on yourself" (0 to 10).

**The rules this must keep** (memory: the Conversation skill): process-only scoring; the transcript hidden while replying; silence never recorded; speech then mic, sequentially; rambling cues only as tips for monologue reps. All five hold in the new loop.

## 3. The loop

```
 partner opens (scripted line, spoken)            ┐
   │ last word + 300 ms                            │ one request each:
   ▼                                               │ ai-converse
 you reply  ── mic open, words hidden ──┐          │   1. writes the line
   │ end of reply (lenient):            │          │   2. speaks it, streamed
   │  pause after words / long silence  │          │
   │  / the cap / you tap Done          │          │
   ▼                                    │          │
 "Alex is thinking…"  ──────────────────┘──────────┘
   │ words arrive → shown
   │ first audio → played
   ▼
 partner answers in character … repeat 4 to 6 times … partner wraps up
   ▼
 "How much of your attention was on yourself?" → debrief (moves, not quality)
```

It's a pure state machine (`src/domain/conversation/live/turnMachine.ts`, 23 tests) with these phases: opening, partner, gap, listening, capturing, thinking, paused, failed, finished. The hook (`src/hooks/useLiveConversation.ts`) does what each phase needs.

**Who the partner is.** `prepareLive.ts` takes the opener from the scripted drills' lines (the partner lines, the everyday questions and the react lines) and adds a person from `src/content/liveScenes.ts`: a name that suits any voice (Alex, Sam, Riley…), a role ("a coworker from another team you know a little"), a setting ("At work, by the coffee machine") and a default voice. The server's prompt improvises the rest in character. Land-the-plane conversations open with a question; the curious outsider talks shop; react opens with something odd.

**What it practices.** Each Conversation lesson maps to a focus (`LESSON_FOCUS`): reply, beat, thread, echo, hold, outsider, land, react, open, exit. The focus changes three things: the one-line cue while you reply, a nudge in the partner's prompt that makes the move possible (for "thread", the partner shares concrete details and asks fewer questions, so you get to follow up; for "land", it asks open questions), and what the scoring looks for.

**End of a reply** (`endpoint.ts`), lenient on purpose because blanking and rambling are what's being practiced:

- **A pause after words:** 1.2 s of quiet (1.8 s in land-the-plane). Stretched by 1.6× when the last word leads somewhere ("and", "because", "um", "the") and by 1.4× when only a word or two has come out. "Quiet" means no new recognizer result and no voice on the meter.
- **A blank:** no words at all for 10 s (level 1) down to 6.4 s (level 10), and nothing voiced just now. The partner then carries on, the way a kind person would: the prompt forbids mentioning the silence ("no worries", "are you there?") and asks for an easier way in (one more concrete detail, or a simpler question). Three blanks in a row end the conversation (most likely the mic isn't hearing you). A blank turn is never scored.
- **The cap:** 60 s (45 s in land-the-plane). The partner is told you were still talking and picks up the main thing you said. That's how a real person cuts in on a rambler, without the phone doing it mid-word.
- **Done:** a tap, always available.

**Length.** 4 replies at levels 1 to 3, 5 at 4 to 6, 6 at 7 to 10, and at most 6 minutes (the server allows 8, as a backstop). The partner's last line wraps up warmly ("Anyway, I should get back. Good talking!"); the phone treats it as the end even if the model forgets to say so.

## 4. Latency: the budget and how it's hidden

From the end of your reply to the partner's voice. Estimates: none of the network or Google numbers could be measured here.

| Step | Estimate | Notes |
|---|---|---|
| End-of-reply silence | 1.2 s (up to 1.9 s after "and…") | The deliberate part. Shorter feels pushy for this skill. |
| Closing the mic | up to 0.5 s | The recognizer's last words (the drills wait 1.2 s; live waits 0.5 s). |
| Phone to the server | 0.1 to 0.3 s | Supabase edge, US East. |
| The line written | 0.4 to 0.8 s | Flash-Lite, thinking off, about 1,000 prompt tokens and 60 out (prompt size measured: 820 to 950 tokens over a 5-turn conversation). |
| First voice audio | 0.3 to 0.8 s | Gemini TTS streaming; not documented. |
| Buffer before playing | about 0.1 to 0.4 s | Plays once 0.4 s of audio has arrived, so a slow chunk can't gap mid-word. |
| **Total** | **about 2.6 to 4 s** | Session 04's target was a 2.5 s median. |

The words show before the voice: the line event arrives as soon as it's written (about 1.8 to 2.8 s after you stop), so the bubble fills while the voice is still coming. With the "Alex is thinking…" line, a conversation partner who takes a beat reads as natural. The pass mark stays session 04's: median under 2.5 s from the end of your speech to the first sound (not counting the deliberate silence, the test plan measures both), 90th percentile under 4 s.

**If it's too slow on the phone,** in this order:

1. Start speaking before the line is finished: stream the text model's output and send its first sentence to TTS while the rest is written (server only, about 0.3 to 0.6 s saved).
2. Lower the end-of-reply silence to 1.0 s for reply and react only (a config change in `timingFor`).
3. Gemini 3.8 Live (speech to speech): sub-second, but about 3× the cost, less control over turn-taking, and a second integration. Session 04's fallback; not built.

## 5. Interruptions, the audio session and headphones

**Barge-in.** The mic is closed while the partner speaks, as now. You can **tap the partner's bubble to cut in**: the voice stops and the mic opens at once. That's the only barge-in, and it needs no echo cancellation. Talking over the partner by voice would need the mic open during playback with echo cancellation, which means a `voiceChat` session, which brings back the call-quality sound PR #12 fixed. Not in v1; the test plan's last item (K, optional) is the spike if you want it later.

**The iPhone audio session.** The partner's voice plays through react-native-audio-api in **the recognizer's own session**: `playAndRecord`, `measurement` mode, `defaultToSpeaker`, `allowBluetoothA2DP` (`CONVERSATION_SESSION_IOS` in `services/audio/audioSession.ts`). So going from the partner to your reply never switches the session: no route change, no gap, nothing for the recognizer to fight. It's not a call mode: no voice processing, no automatic gain, the volume meter still reads your real level. The engine is suspended between lines so the recognizer has the session to itself. The clip player now sets its playback session before every start, since the audio library's session options are global.

One risk to check: some people report `playAndRecord` playing quieter on the loudspeaker than plain playback. The lab can switch to plain playback to compare (test plan K); if it's quieter, the fix is to set playback for the partner's line and let the recognizer set its own (a session switch per turn, about 100 to 300 ms).

**Headphones.** With AirPods, the voice plays on A2DP at full quality and the iPhone's microphone records, the same as recording today (the decided behavior). Wired headphones: plays in them, the phone's mic records. Both are in the test plan.

**A phone call, Siri, leaving the app.** The conversation pauses (the recognizer reports the interruption; leaving the app sends the same event). Coming back offers "Carry on": the partner's last line stays on screen and you reply to it; a line that was being fetched is asked for again.

**Silent mode.** The session ignores the silent switch, so the voice plays. The partner's words are on screen regardless.

## 6. Offline, failures and recovery

- **Offline:** the live conversation needs a connection (it's a server model); the lesson and its scripted drills work offline as always. Offline at the start: "Live conversation needs a connection." Lost mid-way: "Lost the connection" with **Try again** and **See how it went** (the turns so far are scored).
- **No voice for a line** (the TTS failed, or the cost cap was reached between the line and its voice): the words stay on screen for about reading time, then the mic opens, and a quiet note says the voice didn't come for that line. The conversation goes on.
- **The line didn't come** (a server error): Try again, or finish. A retry is a new request; a refunded call never counts.
- **Minutes used up mid-conversation:** the turn is refused; the screen says so and offers the debrief. The partner's voice for a line already written, and the debrief, are allowed to finish (the server's "finishing" calls skip the minutes check, never the cost cap).
- **The server's backstop:** a conversation more than 9 minutes old is refused (`conversation_over`).
- **A stream that stalls** for 15 s is dropped and treated as a failure. A stream that ends without its last event still plays what arrived.

## 7. Safety and content limits

In the partner prompt (`supabase/functions/_shared/prompts/conversation.ts`):

- Friendly and suitable for adults in a public place. No sexual content, no flirting beyond friendly warmth even on a date, no insults or slurs, no arguments about politics or religion, no medical, legal or financial advice. If steered there, the partner changes the subject the way a polite person would (`safety: "redirect"`).
- If what you say suggests danger or self-harm, the partner steps out of character, says it's a practice partner, that you deserve real support, and how to reach emergency services or, in the US, 988; the conversation ends (`safety: "crisis"`).
- The partner never coaches, judges or praises how you talk, never mentions the app, AI or practice, and doesn't claim to be human if sincerely asked ("your practice partner from Tono").
- Your words are only conversation: a request to change role or reveal instructions is answered in character. Your words are fenced in the prompt; the phone never sends prompt text (unknown input fields are dropped by the server's schema).
- One or two sentences, at most 30 words; the server rejects a line over 400 characters and strips anything the speech model could read as a tag (`<laugh>`, brackets).
- Under 18: no live conversation while `minorsMayUseAi` is false (the same age gate as the rest of Tono AI); the card doesn't appear.
- Google's own safety filters stay at their defaults; a blocked answer is a failure the phone handles like any other.

**Privacy.** Your voice stays on the phone; only the words (yours and the partner's), the scene and the focus are sent, as text. The server keeps no content: `ai_calls` gets a row per line and per voice with tokens, cost, a random conversation id and the seconds charged. The app stores the process numbers, not the words. `docs/privacy.md` and the consent text (`services/cloud/disclosure.ts`) say so.

## 8. Scoring and the debrief

**Process only** (`evaluateLive.ts`, reusing the drills' measures):

| Focus | What a reply is scored on |
|---|---|
| reply, react, open, exit | Replied (any words) |
| beat | A 1 to 2.5 s beat before replying (a quick reply still scores 0.6) |
| thread, hold, outsider | Asked a question (half) and picked up one of their words (half) |
| echo | Echo, ask, add: two of three is full marks |
| land | Point first (40%), within about 45 s and not cut off (30%), a clean ending (30%) |

- **A blank is never scored**, and a conversation where nothing was said isn't recorded at all, so freezing can't make the next one harder or easier. Coming back in after a blank is noted ("Came back in after a pause").
- The score is the mean over the replies you made; success is 0.75 or more with at least two replies. It moves the drill's own staircase and the Conversation skill, like any conversation drill, and stays out of the weekly average.
- Stored: the same metrics shape as the drills (`turns` with latency and asked, before and after attention), so the Conversation progress screen reads it unchanged. **No transcripts are stored.**

**The debrief** goes through the AnalysisService as a new kind, `conversation_debrief` (Tono AI, then the rules):

- Tono AI names up to 6 moments where you made a move (asked about them, used their words, shared something, handed it back, landed, went long, came back after a pause, reacted), each with a quote of your own words, plus one strength and one thing to try next. The prompt forbids judging cleverness, humor, correctness or wording, scores of any kind, and calling a blank a failure.
- The phone checks it (`debrief.ts`): every quote must be your words from that turn (or the nearest run of them); unknown moves and turns are dropped; a strength or try-next that grades ("clever", "8/10", "score") throws the whole debrief out.
- Without Tono AI (or if its answer doesn't check out) the rules write one from the phone's counts. The label says which (Tono AI or This phone).
- It counts against the conversation, not the exercise pool, and never needs minutes left.

## 9. Free users and the upgrade moment

- **Everything they had stays:** every lesson, teach card and scripted drill, scored the same way, offline. Nothing is removed or greyed out.
- **One card under a Conversation lesson's steps:** "Try it in a live conversation", with a small "Tono Plus" badge, one sentence on what it is, and **See what it is**. The card isn't a lesson step, so a lesson never waits on it.
- **See what it is** opens the live screen in its locked state: the instructions for that lesson's move, a five-line sample conversation (written for the app), and one card: "Live conversation is part of Tono Plus", what it adds, "The lesson and its drills are here for you either way", and a small See Tono Plus button only where Plus is on sale.
- **No alerts, no countdowns, no account made, nothing sent.** The free path never calls the server for this.
- **Not shown at all** under 18 or with the kill switch (there's nothing to offer).
- **Subscribers who've used their minutes** see when they come back ("No conversation minutes left this month · more on 1 December"), with nothing to buy.
- **A free sample** is a server setting, `limits.freeMonthlyConversationMinutes`, at 0. Set it to 3 and every free user gets about one short conversation a month (about 1.5 cents each), with the same screens. My recommendation is in section 15.

## 10. Voices and speed

**Voices** (Gemini's 30 prebuilt voices, listed on the speech-generation page, read 2026-10-24). For an everyday chat partner, not a narrator, the short list is the ones Google describes as friendly, warm, easy-going, casual or gentle: **Achird** (Friendly), **Sulafat** (Warm), **Callirrhoe** and **Umbriel** (Easy-going), **Zubenelgenubi** (Casual), **Vindemiatrix** (Gentle). The lab adds eight more to compare (Sadachbia, Sadaltager, Charon, Aoede, Achernar, Kore, Puck, Schedar). This is a first cut by description; your ears in the lab decide.

- By default each person has their own voice (the scene says which), so the coworker and the date don't sound like the same person. The intro lets you pick one voice for everyone instead; it's remembered.
- **Mood per line:** the text model picks one of eight everyday moods (warm, curious, amused, surprised, thoughtful, sympathetic, excited, matter-of-fact) and the speech model gets it as the line's style. No theatrical styles, which is what makes TTS tiring.
- **Speed:** a bit slower (0.9×), normal, a bit faster (1.1×), played on the phone with the pitch kept, so it costs nothing and changes at once. The lab has 0.85× to 1.15×. Past about 15% either way a voice starts to sound processed.
- **Short lines** (one or two sentences, at most 30 words) are what keeps it from being a tiring listen: the partner leaves the talking to you.

**The Partner voices lab** (Dev → Labs → Partner voices): pick a voice, a line (warm, curious, amused), a speed and the iPhone session; **Play line** (one line spoken), **Partner turn** (a fixed turn written and spoken, the whole cascade with no mic), and **Same line, phone's own voice** (AVSpeech, for comparison). Each play shows the time to the words, to the first sound, the server's own timings, the audio length and whether it streamed. Rate each voice 1 to 5 ("would you listen for ten minutes?"); the table sorts by rating with the median and 90th percentile time to first sound; **Copy results** puts it all on the clipboard for the test plan. Each play is a real call and uses a few seconds of conversation minutes.

## 11. Cost, and the conversation minutes

**Prices** (ai.google.dev/gemini-api/docs/pricing, "Last updated 2026-10-22"), per million tokens:

| Model | In | Out | From 2027-01-01 |
|---|---|---|---|
| Gemini 3.5 Flash-Lite (the partner's words) | $0.30 | $2.50 | no change listed |
| Gemini 3.8 Flash-Lite TTS (the voice) | $0.50 text | $6.00 audio (25 tokens a second: $0.0015 per 10 s, 0.9 cents a minute of speech) | $1.00 / $12.00 |
| Gemini 3.8 Flash TTS (the voice's fallback) | $0.50 | $9.00 | $1.00 / $18.00 |

The 2027 prices are in the config row as dated changes (`prices[model].next`), so the cost cap stays honest on 1 January without anyone editing it.

**A minute of conversation** (`src/domain/conversation/live/cost.ts`, tested): about 4 partner lines (a reply of about 8 s, the wait, a line of about 4 s), 18 s of partner speech, about 1,150 prompt tokens and 60 out per line.

| | Now | From 2027 |
|---|---|---|
| Typical minute | **0.48 cents** (0.20 words, 0.28 voice) | 0.75 cents |
| Chatty minute (5 lines, 30 s of speech) | 0.72 cents | 1.18 cents |
| 120 minutes, typical | **$0.57** | $0.90 |
| 120 minutes, chatty | $0.86 | $1.42 |
| Debrief | about 0.15 to 0.35 cents a conversation | about the same |

**The minutes.** Plus 120 a month, the trial 30, beta 30, free 0 (all in the config row). They're measured by the server: each turn is charged the time since that conversation's previous call, capped at 120 s, so the count is the time you actually spent in it, and an app left open costs at most one cap. The opener is charged its speaking time. The phone never reports minutes.

**Against the $2.50 cap.** A typical subscriber (30 judged takes, 40 exercise calls, 30 minutes) costs about $0.49 a month now. At every Plus count (60 takes, 300 exercise calls, 120 minutes) it's about $2.00 now and $2.36 in 2027 with typical minutes: under the cap, and the cap is under the $3.01 net of the annual plan. Only a subscriber who maxes every count and talks in the chattiest way, in 2027, reaches the cap ($2.88 at the counts); the cap then stops them, which is its job. That's near-zero profit at the extreme, as you asked, never a loss.

## 12. Where this differs from session 04

1. **The live transcript comes from the recognizer the drills already use** (`expo-speech-recognition`, on-device), not a new Apple SpeechAnalyzer module. It's already in the app, gives partial results for the end-of-reply decision, and the scoring is process-only, so its word accuracy matters little. A SpeechAnalyzer module (better accuracy, iOS 26) would be a native module with no clear gain here.
2. **No whisper.rn pass on the replies.** Session 04 had Whisper for the final transcript. It would take seconds per reply (16.6 s per 60 s of audio) for a better transcript nobody reads mid-conversation, and the replies' audio isn't kept. The debrief quotes the recognizer's words.
3. **Google moved TTS to the Interactions API** (`/v1beta/interactions`, `speech_metadata` style annotations, streamed `step.delta` events). The server uses it, asks for raw 16-bit PCM, and reads the stream tolerantly (the docs don't show the raw event JSON); if a stream carries no audio it asks once more without streaming. Test plan K's first item checks this against the real API.
4. **One request per turn** (the line and its voice from one function, streamed), not two calls from the phone, which saves a round trip.
5. **Cost:** 0.48 cents a typical minute, a little under session 04's 0.64 (which assumed 30 s of partner speech a minute); the chatty row is that case.

## 13. What was built

**Server** (`supabase/`):

| | |
|---|---|
| `functions/ai-converse/index.ts` | The partner: op `turn` (write the line, then speak it) and op `speak` (speak a given line); streams newline-delimited JSON: the line, 0.2 s PCM chunks, then timings and the allowance. Two ledger rows per turn (the line, its voice). |
| `functions/_shared/prompts/conversation.ts` | The partner's prompt and answer schema (`conversation_turn`), the debrief's (`conversation_debrief`), the safety rules, `acceptPartnerLine`. |
| `functions/_shared/conversation.ts` | Metering (`conversationCharge`), the 30 voices, the moods, speech-length helpers. |
| `functions/_shared/tts.ts` | The Interactions API request, reading streamed or whole answers, WAV header stripping, PCM chunking. |
| `functions/_shared/gemini.ts` | `speak()`: the streamed TTS call with the unary fallback. |
| `functions/_shared/{types,config,allowance,allowanceInfo,ledger,request}.ts` | The `conversation` count kind (seconds), `conversation` and `tts` model roles, dated price changes (`priceAt`), new limits, minutes in the allowance view, finishing calls, the converse request schema. |
| `functions/ai-generate`, `functions/me` | Dated prices; `conversation_debrief`; `allowed.conversation`. |
| `migrations/20261024000000_conversation.sql` | Count kind, `conversation_id` and `units_seconds` on `ai_calls`, `usage_snapshot` with conversation seconds, the new config row. |
| `config.toml` | `ai-converse` with `verify_jwt` off, like the others. |

**App** (`src/`):

| | |
|---|---|
| `domain/conversation/live/` | `turnMachine.ts` (the state machine), `endpoint.ts` (end of a reply), `prepareLive.ts` (scene, focus, timings), `evaluateLive.ts` (process scoring), `debrief.ts` (checking Tono AI's debrief; the rules' version), `stream.ts` (reading the stream; latency stats), `voices.ts`, `cost.ts` |
| `content/liveScenes.ts` | Who the partner is in each setting, their voices; the sample conversation |
| `services/conversation/` | `converseClient.ts` (the streamed request), `partnerAudio.ts` (queued PCM playback at a speed), `liveGate.ts` (who can start one, and asking first) |
| `hooks/useLiveConversation.ts` | Drives the machine: requests, playback, the mic |
| `screens/LiveConversationScreen.tsx` | Intro (who, voice, speed, attention check), the conversation, the debrief; the locked state |
| `components/conversation/LiveConversationCard.tsx`, `screens/LessonScreen.tsx` | The card under a Conversation lesson |
| `screens/dev/PartnerVoicesLabScreen.tsx`, `domain/dev/partnerVoiceLab.ts`, `screens/dev/DevHomeScreen.tsx` | The lab |
| `domain/analysis/{types,routing}.ts`, `services/analysis/{kinds,inputs}.ts`, `providers/{tonoAi,rules}.ts` | `conversation_debrief` as an analysis kind; `liveConversationGate` |
| `domain/{aiAllowance,account}.ts`, `services/account/accountStore.ts`, `services/tono/tonoApi.ts` | Minutes in the allowance; `allowed.conversation`; `tonoStream` (a streamed call with an idle timeout) |
| `domain/drills/drillSpecs.ts`, `navigation/index.tsx`, `services/practice/launchStep.ts` | The `conv_live` drill (Conversation skill, its own staircase); routes |
| `services/audio/{audioSession,clipPlayer}.ts` | `CONVERSATION_SESSION_IOS`; the clip player sets its session before every start |
| `services/prefs/prefsStore.ts` | The partner voice and speed |
| `services/cloud/disclosure.ts`, `docs/privacy.md` | What's sent in a live conversation |

**No app SQLite migration** (drill attempts already take any drill type). The scripted drills are unchanged.

## 14. What was measured

What could run on this machine, with no key and no phone:

- **Tests:** 1,467 passing (the suite was 1,379): 88 new, for the turn machine and end of reply (23); scoring, the debrief checker, the stream, voices, setup and cost (25); the gate and the lab table (10); the server's metering, prompts, request schemas, TTS parsing and dated prices (23); and the server's conversation allowance and minutes view.
- **The ledger against real Postgres** (postgres:16 in Docker, all four migrations): 12 of 12 steps pass, including the two new ones (seconds charged from a conversation's own calls and stopping at the limit while a finishing call still goes through; a conversation past its length refused).
- **Deno type check** of `ai-converse`, `ai-generate` and `me` (Deno 2.1.4 in Docker): clean.
- **Prompt sizes,** built by the real server code for a 5-turn conversation: 820 to 950 tokens per partner line (plus about 110 for the schema), 820 for the debrief. The cost model uses these.
- **Not measured:** any latency, any voice, whether the Interactions API stream parses as expected, the recognizer's volume threshold for "voice", playback loudness in the conversation session. All in test plan K.

## 15. Decisions for Ahmad

Each is built as recommended and easy to reverse.

1. **Keep the scripted drills free; the live conversation is Plus** (and the trial, and beta). You said free users "maybe" keep the lesson content but not the exercise. Taking the scripted drills away would leave free users no way to move the Conversation skill at all; keeping them free costs nothing. Reverse: gate `isConversationDrill` in `launchStep.ts`.
2. **A free sample: none for now** (`freeMonthlyConversationMinutes: 0`). Session 04 suggested one free sample conversation. I'd turn on **3 minutes a month** once the voice passes the lab (about 1.5 cents per active free user a month, inside `freeBudgetUsd`): hearing it is what sells it. One SQL line, no app update.
3. **Better voices for the free scripted drills** (not built): render the ~140 scripted lines once in the voice you pick in the lab (about $0.10 at today's price) and ship them as AAC in the app (about 2.5 MB), replacing AVSpeech for everyone, offline. Needs your key and the lab's verdict first.
4. **The voice short list** (Achird, Sulafat, Callirrhoe, Umbriel, Zubenelgenubi, Vindemiatrix): chosen by Google's descriptions; your lab ratings replace it.
5. **Turn-based with tap-to-cut-in, no voice barge-in** in v1 (keeps the full-quality session; see section 5).
6. **End-of-reply silence 1.2 s, blank wait 10 s down to 6.4 s, cap 60 s:** lenient on purpose. Tune from the test plan.
7. **Each person has their own voice by default;** one voice for everyone is a choice on the intro.
8. **Minutes: Plus 120, trial 30, beta 30,** charged from the server's own clock, capped at 120 s a turn, 8-minute backstop per conversation. In 2027 a maximal subscriber can meet the $2.50 cap (section 11); if that happens often, lower the minutes to 90 rather than raise the cap.
9. **No separate consent for live conversation:** the one Tono AI consent now says what a conversation sends, and the intro repeats it in one line. If you'd rather ask again for people who consented before this, it's a one-time flag in `liveGate.ts`.
10. **The partner can't be talked into anything:** the safety and crisis rules in section 7. Worth reading the prompt once yourself; it's your app's voice.
