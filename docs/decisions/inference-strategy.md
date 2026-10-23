# Inference strategy and business model

Status: **proposed, for your decision** · Written 2026-10-22 (session 04) · Blocks sessions 07, 08, 10, 11 and 12

## The recommendation

**Go hybrid, and draw the line here: the phone measures, the server judges.** Everything that captures a signal stays on the phone and stays free: recording, transcription (whisper.rn turbo), pitch, volume, pauses, face and gaze, plus the measured facts and the rule-based next step built from them. Make **Tono AI**, on the Supabase backend already built on `feature/tono-ai`, the single judge of record for paying users. It runs **Gemini 3.5 Flash-Lite** with the prompts held on the server, and it handles scores, coaching, Rewind and Word Chain judging, mark-up, insights and the conversation partner. **Remove bring-your-own-key, and stop using Apple Intelligence or any local LLM for judging.** **Don't ship an on-device LLM now.** Qwen3.5-4B and Gemma 4 E2B did better than I expected on narrow, tightly defined text tasks: with a structured prompt both got your Rewind transcript right every time. But they were unreliable at the task that matters most (turning measurements into the right coaching), they can't hear the voice, and they would add a 1.5 to 3 GB download, an iPhone 15 Pro minimum and roughly 10 to 30 s per call. **Replace the 5 free reviews with a 14-day free trial**, run as an App Store introductory offer through RevenueCat. Keep $49.99 a year, raise monthly to $6.99 (or keep $4.99), and keep the $2.50 per-subscriber monthly cost cap. A typical subscriber costs about **$0.77 a month** in AI. For Conversation, build the listen-and-reply loop for Plus as a cascade: speech recognition on the phone, a Flash-Lite partner, and Gemini 3.8 Flash-Lite TTS, at about 0.6¢ a minute. Free users get lesson audio pre-rendered in the same voices. One new option is worth a spike but not a commitment: Apple's free Private Cloud Compute model (iOS 27).

One finding changes session 10 whatever you decide: **the Rewind miss came mostly from the prompt and Apple's older on-device model, not from "small models can't do this".** A prompt that defines morning, midday and evening, and asks for a verbatim evidence quote for each, gave Gemma 4 E2B and Qwen3.5-4B the right answer on every run, across all five test transcripts. Even with the app's current prompt, none of the four local models I tried repeated the "only the morning" mistake on your transcript. The 1 to 2B models still made errors on the other transcripts.

## What runs where

| Capability | Free (no account) | Plus and the trial (Tono AI) |
|---|---|---|
| Recording, transcription, fillers | Phone (whisper.rn turbo) | Phone, plus Gemini's own transcript from the audio for the review |
| Pitch, volume, pauses, pace, face, gaze, head pose | Phone | Phone (sent to the server as measurements) |
| What the numbers mean ("187 wpm is fast; aim for 140 to 160") | Phone, rule-based | Phone, rule-based |
| Measured delivery score (a formula over the measurements, the same for everyone) | Yes | Yes |
| **Judged** score (content, structure, tone, presence) and coaching | No (shown as a locked layer) | Server: Gemini 3.5 Flash-Lite hears the audio, sees the video, and gets the measurements |
| Rewind notes, Word Chain and Bridge Chain judging, Say it short, Mark it up | Measured counts only (words, links counted, time) | Server text call |
| Progress report, Then vs now | No | Server |
| Conversation lessons | Lesson content with pre-rendered example audio | Live partner: phone STT, server LLM, server TTS |
| Curriculum, drills, streaks, Library, playback | Yes | Yes |

## Why not all on-device (the honest version)

Your stage 2 idea is buildable: react-native-executorch 0.10 can run an LLM, Whisper and Kokoro TTS in an Expo SDK 57 app, and a no-backend app can still sell subscriptions (StoreKit verifies on the phone) and back up through iCloud. What decides it is **quality on the one task that matters most**, plus **what the user has to put up with**, not the infrastructure.

**LLM on the phone.** What I found:
- **Runtimes.** react-native-executorch **0.10.7** (2026-10-21; a ground-up rewrite in 0.10.0 on 2026-09-08 added Core ML, MLX and Vulkan) ships Gemma 4 E2B, Qwen 3 (0.6B, 1.7B, 4B), LFM 2.5, Llama 3.2, Phi-4 mini and SmolLM2. It needs iOS 17 and Android 13 (per the gallery app, which targets Expo SDK 57 and RN 0.86); 0.10.6 added SDK 58. **llama.rn 0.13.0-rc.8** (2026-10-22) runs any llama.cpp GGUF, including Qwen3.5 and Gemma 4, on Metal. Apple's Foundation Models framework adds no download but works only on Apple Intelligence iPhones (15 Pro and later), with a 4,096-token context on iOS 26 and 8,192 on iOS 27 on newer devices.
- **Speed: there are no published LLM numbers for iPhone through react-native-executorch.** Its September 2026 benchmarks measure LLMs only on a Galaxy S26 Ultra on CPU, where Qwen3-4B decodes at 7.4 tokens/s and Gemma 4 E2B at 4.5. Google's LiteRT-LM reports Gemma 4 E2B at 56 tokens/s decode and 2,878 prefill on an **iPhone 17 Pro GPU** (E4B: 25 and 1,189). An iPhone 15 Pro (A17 Pro) is two generations older.
- **What that means per call.** My estimate (not measured): a Rewind judgement is about 300 output tokens on 500 to 800 prompt tokens (measured on the desktop). That is roughly **8 to 12 s for Gemma 4 E2B on the GPU, 20 s or more for Qwen3.5-4B on Metal, and 40 to 70 s on CPU**, before the 2 to 5 s model load.
- **Memory.** An iPhone app gets about 6 GB even on 8 GB and 12 GB phones (Apple developer forums, with the increased-memory-limit entitlement). A 4B model at 4 bits peaks at 2.5 to 3.5 GB (react-native-executorch benchmarks), on top of the camera, MediaPipe and the 574 MB Whisper model. It fits only if nothing else is loaded.
- **Heat and battery.** A March 2026 study ran Qwen2.5-1.5B on an iPhone 16 Pro: throughput fell from 40 to 24 tokens/s within two runs from thermal throttling, and the battery dropped about 5% over 20 runs. A 2-minute analysis burst is fine. Several calls in a row slow each other down.
- **Downloads.** 1.3 to 3 GB on top of Whisper's 574 MB, which already has to be a required download in onboarding.
- **Device floor.** iPhone 15 Pro and later, or Android phones with 8 GB or more and a good GPU. Below that, only 1 to 2B models fit, and they failed my eval (below). Every older phone would need the rules fallback anyway, so the app still needs a good non-LLM path.
- **It can't hear.** The delivery judgement that users value ("your voice stayed flat for a rallying speech") comes from a model that hears the audio. Gemma 4 E2B and E4B accept audio in Google's own runtime, but no React Native runtime exposes that today, and I didn't test their audio judgement.
- **Comparability.** Scores would come from different models on different phones, and every model update means a re-download.

**Speech-to-text on the phone: yes, keep it.** whisper.rn with large-v3-turbo and the filler prompt already won your ASR Lab: 0.8% WER, 10 of 10 fillers kept, 16.6 s per 60 s of audio. For live turn-taking in Conversation, use Apple's SpeechAnalyzer (2.3% WER, about 0.03x real time, no download) for the running transcript and end-of-turn detection, and Whisper for the final transcript.

**Text-to-speech on the phone: viable, but you don't need it.** Kokoro-82M (Apache 2.0) through react-native-executorch Core ML is about a 350 MB download. It synthesises a two-sentence paragraph in about 1.6 s on an iPhone 17 and 1.3 to 2.0 s on an iPhone SE 3, peaking around 600 MB. That is good enough for a conversation partner. But Plus conversation is online anyway (it needs the server LLM), Gemini's TTS is more expressive and can be styled per character, and free users' lesson audio can be generated once and shipped as audio files. A model download buys nothing here. Re-check this if you later want conversation to work offline.

## The four architectures

| | All on-device | **Hybrid (recommended)** | Own backend, open models | Hosted frontier only |
|---|---|---|---|---|
| What it is | Whisper, a 2 to 4B LLM and Kokoro on the phone; no server | Phone measures, transcribes and states facts; Tono AI (Gemini Flash-Lite) judges for Plus | Phone as in hybrid; server calls Gemma 4 or Qwen3.5 through a serverless open-model API, or our own GPUs | Everything AI, including transcription and coaching for free users, goes to Gemini |
| Judgement quality | Fine on narrow text tasks (Rewind coverage, Word Chain links); poor on coaching from stats; can't hear the voice | Best available; hears and sees the take | Good for text (26B and up); no hosted open model takes video and audio in one call, so the voice review still needs Gemini | Best |
| Cost to you per typical subscriber per month | $0 | about $0.77 (Flash-Lite) | Text about 85% cheaper, but text is only about $0.14 of the $0.77; own GPUs cost $500+/month idle | about $0.77 for Plus, plus every free user's usage |
| Privacy | Nothing leaves the phone | Free: nothing leaves. Plus: video, audio and text go to our server and to Google (paid tier, not used for training) | A second processor | Everyone's data leaves |
| Offline | Yes | Free yes; Plus judgement queues until online | Same as hybrid | No |
| Device support | iPhone 15 Pro and later for the LLM; rules below that | Every device the app runs on | Every device | Every device |
| Build effort from here | High: new runtime, model manager, prompts per model, tuning per device, Android Vulkan | Low to medium: mostly built; prompts move server-side, trial, BYOK removal | Medium: second vendor, price rows, evals per model | Low |
| Main risk | Bad advice on most phones; downloads hurt onboarding; heat | Google pricing (Flash doubles on 2027-01-01; Flash-Lite doesn't); the Gemini 18+ clause | Two vendors; still needs Gemini for video | Free-tier cost grows with users |

**Apple Private Cloud Compute: a variant worth a spike.** At WWDC26 (June 2026) Apple opened its server model, AFM 3 Cloud, to third-party apps through the Foundation Models framework. It offers a 32K context and light, moderate or deep reasoning. Developers in the App Store Small Business Program with fewer than 2 million first-time downloads pay nothing, after requesting an entitlement. Limits are per user per day and tied to iCloud (iCloud+ raises them); Apple publishes no numbers. It needs an Apple Intelligence device on iOS 27, takes text and images but not audio, and Apple says expanded access will cost a fee later. If you pass 2 million downloads you get 6 months to migrate. It could later take over some text calls at zero cost, or give free users on new iPhones a taste of judgement. It can't be the judge of record: it can't hear, it isn't on Android or older iPhones, and the undisclosed quota makes scores come from different models for different users. Your take exports show iOS 26.6, so testing it means updating the phone to iOS 27.

## Model shortlist

Checked 2026-10-22. Prices are per million tokens.

| Role | Pick | Alternatives | Facts and sources |
|---|---|---|---|
| Judge of record (video and audio, text) | **Gemini 3.5 Flash-Lite** (`gemini-3.5-flash-lite`; listed on OpenRouter 2026-07-21) | Fallback: Gemini 3.8 Flash (2026-09-02) | Flash-Lite: $0.30 input (text, video and audio), $2.50 output, batch half; Google lists no 2027 change. 3.8 Flash: $0.75 / $3.75 until 2026-12-31, then **$1.50 / $7.50**. Source: ai.google.dev/gemini-api/docs/pricing (updated 2026-10-22) |
| Cheap text fallback (later, optional) | Gemma 4 26B A4B (Apache 2.0, April 2026) | Qwen3.5-35B-A3B (Apache 2.0, Feb 2026); Gemma 4 31B | OpenRouter 2026-10-22: Gemma 4 26B A4B $0.076 / $0.255; 31B $0.20 / $0.40; Qwen3.5-35B-A3B $0.14 / $1.00. Gemma isn't sold on the paid Gemini API (free tier only) |
| Free private text model (spike) | Apple AFM 3 Cloud on Private Cloud Compute | Apple on-device AFM 3 Core (3B) | WWDC26 session 319; developer.apple.com/private-cloud-compute; machinelearning.apple.com (AFM 3, 2026-06-08) |
| On-device LLM (not now; re-test mid-2027) | Qwen3.5-4B (Apache 2.0, 2026-03-02, 2.7 GB at Q4_K_M) | Gemma 4 E2B (Apache 2.0, about 2.6 to 3.1 GB) | Runtimes: llama.rn 0.13 rc (GGUF), react-native-executorch 0.10.7 (Gemma 4 E2B MLX int4 2.9 GB; no Qwen3.5 export yet) |
| Speech-to-text | **whisper.rn 0.7.4 + whisper large-v3-turbo** (MIT, 574 MB) | Apple SpeechAnalyzer (iOS 26) for live turns; Parakeet TDT 0.6B v3 (CC-BY-4.0; no RN path checked) | Your ASR Lab, 2026-10-16 |
| Conversation partner voice | **Gemini 3.8 Flash-Lite TTS** (`gemini-3.8-flash-lite-tts`) | Gemini 3.8 Flash TTS; on-device Kokoro-82M (Apache 2.0) through react-native-executorch | Flash-Lite TTS: $0.50 text in, $6.00 audio out; Google gives $0.0015 per 10 s (**$0.009 a minute**), doubling on 2027-01-01. 30 voices, streaming PCM, style through the prompt. Others: OpenAI gpt-4o-mini-tts $12 per M audio tokens (about $0.015 a minute), ElevenLabs Flash v2.5 about $0.05 a minute (secondary sources) |
| Speech-to-speech (fallback for Conversation) | Gemini 3.8 Live | OpenAI gpt-realtime-2.1-mini ($10 / $20 per M audio tokens) | Live: audio in $0.005 a minute, audio out $0.018 a minute |

## The evaluation

### How I ran it

- **Script.** `spikes/inference-eval/eval.py`, standard-library Python, sends the same prompts to llama.cpp's server (local) or to Gemini (hosted, for you to run). Cases are in `cases_synthetic.json`. Your three iPhone take exports and the real Rewind transcript (quoted in the session 10 prompt) are read from your files at run time and never copied into the repo, which is public.
- **Tasks.**
  - Rewind notes: 5 transcripts (your real one, plus morning-only, thin, rich, and afternoon-and-evening). Two prompts: the app's current one, and a structured one that defines the parts of the day and asks for a status and a verbatim evidence quote per part.
  - Word Chain: 4 chains, 38 links, including puns and deliberate breaks.
  - Coaching from measurements: 2 synthetic takes plus your 3 real exports, using the same measurement lines the app sends.
  - Mark it up: 3 texts.
- **Models.** Gemma 4 E2B, Qwen3.5-4B, Qwen3.5-2B and LFM2.5-1.2B, all Q4_K_M GGUF, on llama.cpp b11829 (Vulkan) on an RTX 4070.
  - Settings: temperature 0.3, thinking off, 2 runs each, JSON constrained by grammar (as llama.rn and Apple's guided generation can do). Also one unconstrained run (as react-native-executorch, which has no grammar support), and one run with thinking on.
  - **This is a quality proxy.** The weights are the ones a phone would run, but phone runtimes quantize differently, and desktop timings say nothing about phone speed.
- **Reference.** No hosted model was called (no keys, no paid APIs). I wrote the gold labels myself by reading the transcripts; they are in the case file for you to check. Where the app already had a hosted Gemini Flash video review of the same take (two of your exports), I used its focus area as a second reference. The hosted comparison is a 15-minute run for you; see the checklist.

### Results

Measured on this machine.

| | Gemma 4 E2B | Qwen3.5-4B | Qwen3.5-2B | LFM2.5-1.2B |
|---|---|---|---|---|
| **Rewind, structured prompt:** parts of the day right (missing vs present) | **30/30** | **30/30** | 22/30 | 24/30 |
| Your real transcript, all three parts right | **2/2** | **2/2** | 0/2 | 2/2 |
| Evidence quotes verbatim | 30/30 | 30/30 | 26/30 | 22/30 |
| "Most vivid" quoted verbatim | 10/10 | 10/10 | 8/10 | 2/10 |
| **Rewind, the app's current prompt:** coverage note right on your transcript (my reading) | 2/2 | 2/2 | 2/2 (calls the evening brief) | 2/2 |
| Same prompt: "most vivid" verbatim | about half (paraphrases) | most | about half | 0/10 |
| **Word Chain:** links judged right | 66/76 (87%) | **68/76 (89%)** | 52/76 | 60/76 |
| Broken links caught | 7/8 | **8/8** | 4/8 | 0/8 |
| Good links wrongly rejected | 0 | 2 | 14 | 0 |
| **Coaching:** tip addresses the main issue (my grading, 5 takes) | 2 right, 2 partly, 1 wrong | 2 right, 1 partly, 2 wrong | 0 right, 1 partly, 4 wrong | 1 right, 1 partly, 3 wrong |
| Numbers in the tip all appear in the measurements | 10/10 | 8/10 | 10/10 | 10/10 |
| **Mark it up:** words come back exactly | 4/6 | 6/6 | 6/6 | 6/6 |
| JSON valid without grammar constraints | 100% | 100% | 100% | 100% |
| Median desktop time per call (RTX 4070, not a phone) | 4.3 s | 2.8 s | 1.5 s | 0.5 s |

**Thinking doesn't help on a phone budget:**
- **Qwen3.5-4B with thinking on** reasoned past a 6,000-token cap on 4 of 5 coaching cases and on every Rewind and Word Chain case, so it returned no answer. Its median call took 51 s even on the desktop GPU; on a phone that would be minutes.
- **Gemma 4 E2B with thinking requested** gave the same results and token counts as without it. The thinking flag in its chat template may not have taken effect, so treat that run as unconfirmed.

**Unconstrained JSON** (single run, prompt-only, as react-native-executorch would need): every model still returned valid JSON. Quality was in line with the constrained runs, except that Qwen3.5-4B's mark-ups then changed the words in 3 of 3 texts.

What the coaching failures looked like:
- **Take C** (41 s, 187 wpm, 2.9 fillers a minute): Gemma told you to cut fillers. Qwen3.5-4B told you to cut a repeated phrase, which was a fair content point but missed the pace. The app's own rule coach got it right ("You averaged 187 words a minute: aim for 140 to 160").
- **Take A** (eye contact 65%): Qwen3.5-4B wrote "Look directly at the camera lens 65% of the time", which turns the measurement into the target.
- **Take B** (128 wpm): Qwen3.5-4B said slow down. Gemini Flash's video review of the same take said the problems were vocal projection and looking away. Neither local model heard the quiet, flat voice that review picked up.

### What the results mean

1. **Prompt design matters more than model size for exercise judging.** Defining the categories and making the model quote its evidence is what fixed Rewind. Session 10 should use that prompt shape on any provider, and check every quote against the transcript in code.
2. **A 4B local model is credible for narrow, checkable text judgement.** That covers Rewind coverage, Word Chain links and mark-up. It is not reliable for coaching from measurements, which is the core of the product and where your complaints started. Deterministic rules beat it there, because they read the numbers correctly every time.
3. **1 to 2B models are not usable as judges.** They hallucinate parts of the day and reject good Word Chain links. That rules out on-device judgement on 6 GB phones.
4. **Small sample.** These are 17 cases. The point is the pattern, not the percentages. The hosted run you do next settles the comparison.

## Hosted options and the cost model

**Assumptions** (all in `spikes/inference-eval/cost_model.py`, so you can change them):
- **Video review, real token counts.** Your two hosted reviews used 91 video and audio tokens a second at default media resolution (5,005 tokens for 55 s, 8,094 for 89 s), about 2,000 prompt tokens, and 1,931 to 2,112 output tokens plus 1,269 to 1,959 thinking tokens on Flash. They took 36 s and 71 s.
- **Video review, new design.** I assume 3,000 prompt tokens (the measurements and coaching fields add some) and 2,500 output plus 1,500 thinking tokens, capped.
- **Text call** (Rewind, Word Chain, coaching, mark-up): 1,800 tokens in, 1,200 out including thinking.
- **Insight:** 6,000 in, 2,500 out.
- **Conversation minute** (cascaded): 3 partner turns on Flash-Lite, plus 30 s of partner speech through 3.8 Flash-Lite TTS.
- **Revenue:** Apple takes 15% (Small Business Program), and I take another 15% off for tax-inclusive prices outside the US.

**Per call, Gemini 3.5 Flash-Lite:**

| Call | Cost |
|---|---|
| 90 s take review | 1.34¢ |
| 3 min take review | 1.66¢ |
| Text judgement | 0.35¢ |
| Insight | 0.80¢ |
| Conversation minute | 0.64¢ (the Live API would be about 2¢) |

On 3.8 Flash the same review is 2.3¢ now and **4.7¢ from 2027-01-01**. A text judgement on Gemma 4 26B A4B through OpenRouter is 0.04¢.

**Per Plus subscriber per month:**

| Profile | Usage | Flash-Lite | With Live voice | All on 3.8 Flash (2027) |
|---|---|---|---|---|
| Light | 12 takes, 15 text calls, 2 insights, 10 conversation minutes | $0.29 | $0.43 | $0.97 |
| **Typical** | 30 takes, 40 text calls, 4 insights, 30 minutes | **$0.77** | $1.17 | $2.51 |
| Heavy | 60 three-minute takes, 100 text calls, 12 insights, 120 minutes | $2.22 | $3.84 | $7.29 |
| 14-day trial at typical use | | **$0.36** | | |

**Net revenue per subscriber per month:** $3.61 on $4.99 monthly, $3.01 on $49.99 annual. Margins at a typical profile are $2.84 and $2.24; even the heavy profile stays positive on Flash-Lite.

**What this means for pricing:**
- **Keep the $2.50 monthly cost cap.** It sits under the annual plan's $3.01 net whatever model runs, and it is what makes a model switch, or Google's January price change on Flash, safe.
- **Add a conversation cap** of 120 minutes a month.
- **Keep the 60-reviews-a-month count**, which users see. Keep the text calls pooled behind fair use.
- **Price.**
  - Competitors charge more: Orai about $9.99 a month or $39.99 a year, Speeko $19.99 to $29.99 a month (secondary sources, 2026).
  - $4.99 a month is cheap for what Plus now includes. $6.99 a month with $49.99 a year makes the annual plan the obvious choice (about 40% off) and adds about $1.70 of net per monthly subscriber.
  - The products are still at "Prepare for Submission", so changing the price costs nothing now.
- **The free tier costs you nothing in AI.** That removes the free-budget mechanism, the starter-pack tombstones and the "a third of users are new each month" risk from the old plan.

**Own backend with open models: not now.**
- Serverless open-model APIs are 5 to 8 times cheaper for text, but text is only about 20% of the bill.
- None of them takes video and audio together, so the review stays on Gemini either way.
- Renting your own GPU (an L4 or similar at about $0.70 an hour) costs $500 a month idle, which is more than the whole AI bill below a few thousand subscribers.
- Keep it as insurance instead. The server's model table can route the `text` role to any OpenAI-compatible endpoint with a price row, if Google's prices move.

## Does it need a backend?

**With hybrid, yes, and it's already built.** What the backend does that the phone can't:
- holds the Gemini key;
- enforces quotas and the cost cap, and verifies the subscription before spending money;
- pins the model and prompt version, so scores stay comparable;
- changes models and prompts without an app update;
- lets you turn spending off with the kill switch.

**If you went all on-device, you could drop the backend.** StoreKit 2 verifies purchases on the phone, iCloud (CloudKit) could do backup, model files can be downloaded from Hugging Face or a CDN, and remote config can be a static JSON file. You would lose server-side abuse limits (not needed, since nothing costs money), cross-platform accounts, analytics (you have none today) and the ability to fix a bad prompt quickly (it ships with the app).

**From `feature/tono-ai`, under the recommendation:**

| Keep as built | Change | Throw away |
|---|---|---|
| Supabase project, Auth (Apple, Google), RLS schema | **Sign-in becomes optional.** Use Supabase anonymous sign-in behind the scenes and link it to RevenueCat, so a trial or purchase needs no visible account. App Review rejects apps that force registration before a purchase that isn't account-based (guideline 5.1.1(v)). Apple or Google sign-in is offered for restore and other devices. | Bring-your-own-key: `textProviders.ts`, the own-key provider entries in `providers.ts`, the key storage in `secretsStore.ts`, the paste-a-key UI in `AiCoachSetup.tsx` and `DeepReviewSettings.tsx`, the per-provider consent, and the legal and lesson copy about keys |
| `ai-upload-start`, `ai-file`, `ai-generate`, `me`, `delete-account`, `apple-token`, `revenuecat-webhook` | `ai-generate` takes `{kind, inputs, schemaVersion}`; **prompts and schemas move to the server**, and the phone validates the reply. | Starter-pack allowance (`starterReviews`, `starterTextCalls`, the "5 free" copy); `starter_tombstones` unless you keep a free taste |
| Ledger, `reserve_ai_call` logic, config table, pinned models, price rows, staged rollout, kill switch | Add **async jobs**: the server owns a review job and the phone polls or gets a push, so leaving the app doesn't lose it (session 09). Add `kind: tts` and `kind: conversation_turn`. | Apple Intelligence judging: `onDeviceCoach.ts`, `appleCoachPrompt.ts`, `reviewOnDevice` in Rewind, the on-device path in `autoMarkText.ts` |
| `PaywallScreen.tsx`, `purchases.ts`, `plus.ts`, entitlement sync | Trial copy, trial caps and RevenueCat's `period_type: TRIAL` | |
| `aiRouting.ts`, `routing.ts`, `cloudCoach.ts`, `quick_coach` in the schema | The routes become Tono AI, then rules (no own key, no Apple) | |

**What it costs to keep:**
- Supabase: $0 during the beta (the free plan pauses after a week without traffic), then $25 a month for Pro at launch.
- RevenueCat: free until $2,500 a month in revenue, then 1%.
- Google: billed as used.

## Free, trial and Plus

**Does free with no account, plus a trial, plus Plus make sense? Yes.** It's the standard shape for a habit app, and it fits Tono: nothing about practising needs an account, and only judgement costs money.

**Free forever, no account:**
- Everything you record, the transcript, filler highlighting, every measurement and graph, and the measured delivery score.
- A rule-based "what this means and what to try" line per measurement.
- The full curriculum, drills, streaks, Library, playback and Rewind recording, with the counts only.
- Conversation lessons as content, with pre-rendered audio.

**Challenge to "facts only":**
- A screen of bare numbers with no next step reads as broken or paywalled, and that is where one-star reviews come from.
- The rule coach is accurate because it is deterministic. It correctly told you to slow down from 187 wpm when the 4B models didn't.
- So **keep the rule-based next step free**, and gate what genuinely needs judgement: what your words did, how your voice came across, whether your story or links worked, and personal coaching.
- Free users then get an app that works and feel the line clearly: Plus knows what you said and how it sounded.

**Plus** (and the trial):
- Judged scores and coaching on every take you allow (60 a month, 6 a day).
- Exercise judging: Rewind, Word Chain, Bridge Chain, Say it short.
- AI mark-ups; progress report and Then vs now; the live conversation partner (120 minutes a month); backup.

**Trial: 14 days, not 7.**
- **Conversion.** RevenueCat's 2026 report shows longer trials convert better. Trials of 17 to 32 days convert at a 42.5% median, against 25.5% for trials under 4 days. For monthly plans, 10 to 16-day trials reach 30.6% paying and renewing, against 18.5% for trials of 4 days or less. Short trials also get more cancellations on day 0.
- **Habit.** Two weeks covers two weekly cycles, which matters for a practice habit.
- **Cost.** It costs about $0.36 per trialist at typical use.
- **How it works:**
  - Set it as an **introductory offer** (free, 2 weeks) on both products in the "Tono Plus" subscription group. Apple allows each Apple ID one introductory offer per subscription group, and applies it automatically at purchase. RevenueCat shows whether the user is eligible and reports the trial as an entitlement with `period_type` TRIAL.
  - The trial needs a payment method and converts automatically unless cancelled. That's what stops abuse: new Tono accounts don't get new trials, because eligibility is tied to the Apple ID.
  - The server treats a trial like Plus, with trial caps: 20 reviews, 30 text calls and 30 conversation minutes, under the same $2.50 cap.
  - Lapsed users who already used a trial can still subscribe, but don't get a second trial.

**Bring-your-own-key: remove it.**
- It splits the product: two consent flows, four providers, and a result quality you can't vouch for.
- It moves prompts to the phone, where you can't fix them.
- It's the friction that started the hosted work.
- Next to in-app purchase it's also an App Review 3.1.1 grey area.

**People already on it** (TestFlight testers only; the app isn't launched):
- On update, delete the stored keys from the keychain.
- Show one notice: "Reviews now run on Tono AI. Your key has been removed from this phone."
- Give testers the beta allowance (or a sandbox Plus).
- Their past reviews stay, with a provenance label naming the provider that made them.

## Opting a take in or out

**Default:**
- Plus users give one consent (onboarding or the first review), and every take is judged unless they say otherwise.
- The save and preview screen keeps the per-take switch, worded "Have Tono AI judge this take".
- A "Private take" shortcut turns it off for that take.
- Settings keeps the global default. Feeling reps stay off by default.

**Offline:**
- The take is saved with the facts.
- The judgement is queued ("Will be judged when you're online") and uploads when back online, if the video is still on the phone.

**Later:** any take whose video is still on the phone can be sent from the Library ("Judge this take").

**Consequences for scores:**
- **Two layers.** The **measured** layer exists for every take: the facts and the measured delivery score, the same formula for everyone. It drives streaks, curriculum evidence that comes from measurements, and the continuous trend lines. The **judged** layer exists only for judged takes and is the headline score for Plus.
- **The AI is ground truth for judgement; the measurements stay ground truth for facts.** The server gets the measurements as evidence and must cite them. It never overrides a measured number, for example by claiming a different wpm.
- **Comparability.** Judged scores are only compared with judged scores, from the same pinned model and prompt version. Charts mark a model change. Unjudged takes appear in trends through the measured layer only, never as zeros or gaps in the judged line.
- **Allowance.** An opted-out take uses none of the 60 a month.
- **This changes one rule** from the backend plan, "measurements go into the notes only, never into scoring". Measurements now inform the judged scores. Two parts of the rule stay: the phone transcript isn't sent with a video review (Gemini makes its own from the audio), and the filler count still comes from the AI's transcript.

## Conversation with a real voice

**Is it worth revamping? Yes, for Plus.** Replying in real time is the skill behind your own goals (blanking and rambling), and a partner that only opens the conversation can't train it. It's also the most distinctive thing Plus could sell.

**The loop (cascaded):**
1. The partner's line is spoken by Gemini 3.8 Flash-Lite TTS, streamed, with a style per character.
2. The user replies. The phone listens with VAD and SpeechAnalyzer's live transcript, and measures reply latency, speaking time and stops on the phone, keeping the process-only scoring.
3. When the turn ends (silence of about 1.2 s, or a tap; lenient on purpose, because blanking is what's being practised), the transcript goes to the server.
4. Flash-Lite with thinking off writes the partner's next line in character.
5. Repeat. A short debrief is judged at the end.

**Latency budget.** About 1.8 to 2.5 s from end of speech to partner audio: 1.2 s endpoint plus about 0.5 s LLM plus about 0.5 s to the first TTS audio. That's an estimate to check on the phone. A visible "listening, thinking" state and short partner lines hide most of it.

**Cost.** About 0.6¢ a minute, so the 120-minute cap costs at most about $0.77 a month.

**Why not the Live API:**
- It's faster (sub-second) and handles interruptions.
- But it costs about 3 times more, gives less control over turn-taking (the lenient endpointing this skill needs), and is a second integration.
- Keep it as the fallback if the cascade feels too slow on the phone.

**Barge-in and audio session.** Barge-in needs recording and playback at the same time with echo cancellation. That's the iOS spike still open in your notes, so v1 stays turn-based: the partner finishes, then the mic opens.

The session that PR #12 added (`src/services/audio/audioSession.ts`) records conversation in `measurement` mode, deliberately without voice processing, so the volume meters stay true. Turn-based playback works in that session as it is, because `defaultToSpeaker` and A2DP keep the sound full quality. Echo cancellation would need a separate conversation session (`voiceChat` mode), which brings back the call-quality sound that PR fixed. That's another reason not to attempt barge-in in v1.

**Free users** see the lesson content with pre-rendered example audio in the same voices: one-off generation cost under $1, shipped as files. The interactive exercise is gated, with one plain upgrade line. Recommend a single free sample conversation so people know what they'd pay for.

## The AnalysisService session 07 should build

Build this shape, layered on `src/domain/aiRouting.ts` and `src/services/cloud/routing.ts`, not alongside them:

```ts
type AnalysisKind =
  | "take_review"          // judged scores + coaching for a take (video/audio)
  | "coaching"             // coaching for a take without a video review
  | "rewind_notes" | "word_chain" | "bridge_chain" | "summary_notes"
  | "mark_up" | "insight" | "conversation_turn" | "conversation_debrief" | "tts";

type Producer = "tono_ai" | "rules" | "measured";        // room for "on_device_llm" | "apple_pcc" later

interface Provenance {
  producer: Producer;
  model?: string;            // as reported by the server, e.g. "gemini-3.5-flash-lite"
  promptVersion: string;     // server prompt template version
  judged: boolean;           // true only for AI judgement
  at: string;                // ISO time
}

type Unavailable = "not_entitled" | "opted_out" | "offline_queued" | "quota" | "cost_cap"
                 | "budget_paused" | "kill_switch" | "age_gate" | "too_short" | "error";

type AnalysisResult<T> =
  | { status: "done"; value: T; provenance: Provenance }
  | { status: "pending"; jobId: string; step?: string; etaSeconds?: number }
  | { status: "unavailable"; reason: Unavailable; fallback?: { value: T; provenance: Provenance } };

interface AnalysisContext {
  tier: "free" | "trial" | "plus";
  consent: boolean;          // the one Tono AI consent
  takeOptIn: boolean;        // per-take switch (default from Settings)
  online: boolean;
  isAdult: boolean | null;   // see Privacy
  flags: { forceProvider?: Producer }; // env/dev flag for testing
}

interface AnalysisProvider {
  id: Producer;
  supports(kind: AnalysisKind): boolean;
  run<K extends AnalysisKind>(kind: K, input: InputFor<K>, ctx: AnalysisContext): Promise<AnalysisResult<OutputFor<K>>>;
}

interface AnalysisService {
  request<K extends AnalysisKind>(kind: K, input: InputFor<K>, opts?: { takeId?: string }): Promise<AnalysisResult<OutputFor<K>>>;
  observe(takeId: string, cb: (r: AnalysisResult<unknown>) => void): () => void;   // pending → done across relaunch
  whatCanShow(kind: AnalysisKind, ctx: AnalysisContext): "judged" | "facts" | "locked";  // drives the UI
}
```

Rules for it:
- **Routing** is one pure function: `(kind, ctx) → ordered providers`. Plus with consent, opt-in and a connection gives `tono_ai`, then `rules`. Everyone else gets `rules` and `measured`.
- **The UI only knows `OutputFor<K>` and `Provenance`.** It labels results honestly from provenance, for example "Judged by Tono AI (Gemini 3.5 Flash-Lite)" or "From your measurements".
- **The client sends structured inputs, never prompts.** That means transcript, measurements, task metadata and the schema version.
- **The phone validates every reply.**
  - Use zod schemas.
  - Quotes must appear in the transcript and numbers must come from the measurements; otherwise fall back.
  - A cloud `focusSkill` outside `SkillId` falls back to the rules' pick.
- **Results persist per take** as artifacts with provenance, so a judged result survives relaunch and model changes are traceable.
- **No on-device LLM provider now.** The `Producer` union leaves room to add one later without touching screens.

## Privacy and the App Store

**What leaves the phone:**
- **Free: nothing.** If you add no analytics SDK, the App Privacy label for the free path can be "Data Not Collected". Apple's definition counts only data sent off the phone and kept beyond servicing the request.
- **Plus:**
  - the take's video and audio, the transcript and measurements, and exercise text, sent to Tono's server and Google's Gemini API (paid tier);
  - an anonymous user ID; email only if the user signs in with Apple or Google; purchase status through RevenueCat.

**Retention:**
- Google: paid-tier prompts and responses are not used to improve Google's products. They are logged "for a limited period" for abuse detection. Grounding is not used.
- The server deletes uploaded files after each review and logs token counts and cost, never content.
- Backup is opt-in.

**App Privacy labels for Plus:**
- Audio Data, Photos or Videos, and Other User Content (App Functionality, linked to the user). Google keeps logs, so these count as collected.
- User ID; Email Address if the user signs in; Purchases.
- No tracking.

**Consent text** (one screen, before the first judged take):

> "Tono AI judges your takes. To do that, the video, audio and words of each take you choose are sent to Tono's server and to Google Gemini, used only to make your review, and deleted after it. Google keeps a short-lived log for abuse checks and doesn't use it to train its models. You can turn this off for any take."

**The 18+ clause (an open item):**
- Gemini API's terms require users to be 18 or older, and forbid API clients "directed towards or likely to be accessed by" under-18s.
- A speaking coach will attract students.
- Options:
  1. an age question before Tono AI, with on-device only under 18;
  2. move to Vertex AI if its terms differ (I couldn't confirm);
  3. take legal advice.
- I recommend (1) now and (3) before launch. Apple's Private Cloud Compute has no such clause that I found.

## Validation plan: the smallest experiments, in order

Steps 1 to 3 decide the model and the prompts. Steps 4 to 6 decide the voice design. Step 7 is only needed if you want to revisit on-device LLMs.

1. **Hosted eval.** About 15 minutes and under 50¢, on a laptop, no phone needed.
   - Run `spikes/inference-eval/eval.py` with a paid Gemini key against `gemini-3.5-flash-lite` and `gemini-3.8-flash` (commands in the spike README), then `--score`.
   - **Pass:** your real Rewind transcript gets all three parts right every run; Word Chain links 90% or more, with every broken link caught; coaching gets the main issue right on 4 of 5 takes (read them); mark-up words exact on 3 of 3.
   - If Flash-Lite fails where Flash passes, use Flash for text roles and recheck the cost cap.
2. **Video review, Flash-Lite vs Flash** (the backend plan's Phase 0 spike).
   - On the iPhone, Dev → Pipeline → Re-run Deep review on 4 or 5 takes: short, long, plenty of ums, scripted, quiet voice.
   - Check: the JSON validates; fillers match what you hear; the notes are specific; tone and eye-contact judgements fall in the same range.
   - This picks the default `review_video` model.
3. **Real token counts.** For a week of your own takes, read `cloudUsage` in the exports or the `ai_calls` table. The model assumes about 1.3¢ per 90 s review; if it's off by more than 50%, rerun `cost_model.py` with the real numbers.
4. **Voice ear test** (needs a small Dev tab Voice Lab, which session 12 builds first).
   - Play the same three partner lines from Gemini 3.8 Flash-Lite TTS (3 or 4 voices) and from AVSpeech.
   - Optionally add Kokoro through react-native-executorch, if you want to keep the offline option open.
   - Listen on the speaker and on AirPods. Note time to first audio on Wi-Fi and on cellular.
   - **Pass:** a voice you'd happily listen to for 10 minutes, and first audio under 1 s.
5. **Turn-taking latency.**
   - Prototype the cascade with a fixed character prompt.
   - Measure end of speech to partner audio over 20 turns on Wi-Fi and on 5G.
   - **Pass:** median under 2.5 s, 90th percentile under 4 s. Otherwise spike the Live API.
6. **Record and play together** (the open audio-session spike).
   - First check the turn-based path in the existing `RECORDING_SESSION_IOS` (measurement mode): partner audio from the speaker and AirPods at full quality, then the mic opens cleanly.
   - Then, with echo cancellation on (a `voiceChat`-mode session), play partner audio while the mic runs.
   - Check that the partner doesn't hear itself, and that the volume isn't stuck at call quality (the issue PR #12 fixed).
   - If this fails, v1 stays strictly turn-based, which is fine.
7. **Optional: an on-device LLM benchmark**, only if you want to revisit local judging.
   - In a dev build with llama.rn, load Qwen3.5-4B Q4_K_M and Gemma 4 E2B.
   - Run the Rewind and Word Chain prompts 5 times in a row.
   - Record: load time; tokens a second (prefill and decode); peak memory (session 02's dev metrics, or `os_proc_available_memory`); time per call; whether call 5 is slower than call 1; battery % over 10 minutes; whether the app is killed with the camera screen open.
   - **Pass:** under 10 s per call, under 3 GB, no jetsam kills. Even a pass doesn't change the recommendation for coaching, only for exercise judging.
8. **Optional: an Apple Private Cloud Compute spike.**
   - Update the iPhone to iOS 27, request the entitlement, and write a 50-line Swift module.
   - Run the same eval prompts and note quality, latency, and when the quota warnings appear.
9. **Sandbox purchase.**
   - In TestFlight, start the 2-week trial. Sandbox renewals run on a compressed clock.
   - Check that the webhook writes `period_type` TRIAL and the server applies the trial caps.
   - Cancel, and check that access ends at expiry and a second trial isn't offered.

## What the other sessions should assume

- **07: scoring taxonomy and AnalysisService.**
  - Build the interface above with `tono_ai`, `rules` and `measured` producers; no on-device LLM.
  - Two score layers: measured (everyone, comparable) and judged (Plus, pinned model, AI as ground truth for judgement, citing the measurements).
  - Move prompts and schemas to the server.
  - Delete the Apple Intelligence judging paths.
  - Keep "the phone transcript isn't sent with a video review".
- **08: accounts, trial, BYOK.**
  - "Hosted Tono AI stays; free is on-device facts and rules with no account; a 14-day introductory-offer trial on both plans; Plus $6.99/mo (or $4.99) and $49.99/yr; $2.50 cost cap; trial caps 20/30/30."
  - Use anonymous Supabase sign-in linked to RevenueCat, with Apple or Google sign-in optional.
  - Remove BYOK and migrate testers as described.
  - Add the age question before Tono AI.
  - Retire the starter pack and the free budget.
- **09: waiting UX.**
  - Hosted judgement takes 35 to 70 s after upload, and local steps about 10 s; measured from your exports, 2026-10-17 and 2026-10-20.
  - Plan for a server-owned job, so leaving or killing the app never loses it.
  - Facts show immediately; the judged layer fills in when it's ready.
  - Free users never wait on AI.
- **10: exercise judging.**
  - Judge through `AnalysisService` (`tono_ai`) with the structured, evidence-quoting prompt shape from this eval.
  - Validate the quotes in code.
  - Word Chain is judged once, at the end of an attempt (0.35¢), so the drill stays fast. Offline, show the counts and queue the judgement.
  - The Rewind regression case already passes with that prompt on local models; it must pass on Flash-Lite too.
- **11: impromptu results.**
  - Filler highlighting stays on the phone for everyone.
  - AI mark-ups only through `AnalysisService`, for Plus, accepted only when the words match exactly (as now). Option (c) in that prompt.
- **12: conversation voice.**
  - "Assumes: cascaded loop: Apple SpeechAnalyzer live transcript and VAD on the phone (whisper.rn for the final transcript), Tono AI text LLM (Flash-Lite, thinking off) for the partner, Gemini 3.8 Flash-Lite TTS streamed through the server; Plus only; free users get pre-rendered lesson audio; 120 min a month."
  - The Live API is the fallback if checklist step 5 fails.

## Open decisions for you

1. **Hybrid as described** (hosted judge for Plus, on-device facts and rules for free, no on-device LLM): yes or no.
2. **Price:** $6.99 or $4.99 a month (annual stays $49.99).
3. **Trial length:** 14 days (recommended) or 7, and whether it goes on both plans or only the annual.
4. **Free taste:** none, or one judged take a month for free users (about 1.3¢ each), or one free sample conversation.
5. **Under-18 handling:** the age question now (recommended), plus legal advice before launch.
6. **Apple Private Cloud Compute spike:** worth a day after launch? It needs iOS 27 on your phone and an entitlement request.
7. **Removing BYOK:** confirm. It deletes testers' stored keys on update.

## Sources

Read 2026-10-22 unless noted.

- **react-native-executorch:**
  - releases (v0.10.0 2026-09-08; v0.10.6 2026-10-19; v0.10.7 2026-10-21): https://github.com/software-mansion/react-native-executorch/releases
  - benchmarks (September 2026): repo file `docs/docs/04-benchmarks/imported.json`
  - LLM model list: `docs/docs/02-extensions/natural-language/02-llm-chat-and-generation.md`
  - gallery (Expo SDK 57, iOS 17, Android 13): https://github.com/software-mansion-labs/react-native-executorch-gallery
- **npm registry** (llama.rn 0.13.0-rc.8, whisper.rn 0.7.4, @react-native-ai/apple 0.12.0): https://registry.npmjs.org
- **Gemma 4:**
  - LiteRT-LM benchmarks and sizes: https://developers.google.com/edge/litert-lm/models/gemma-4
  - model card (Apache 2.0): https://ai.google.dev/gemma/docs/core/model_card_4
- **Qwen3.5 small models** (2026-03-02, Apache 2.0): https://huggingface.co/Qwen/Qwen3.5-4B
- **LFM2.5** (LFM Open License 1.0): https://huggingface.co/LiquidAI/LFM2.5-1.2B-Instruct
- **Gemini:**
  - API pricing (page updated 2026-10-22): https://ai.google.dev/gemini-api/docs/pricing
  - TTS: https://ai.google.dev/gemini-api/docs/speech-generation
  - terms: https://ai.google.dev/gemini-api/terms
- **OpenRouter model prices:** https://openrouter.ai/api/v1/models
- **OpenAI audio prices:** https://developers.openai.com/api/docs/pricing
- **Apple:**
  - Private Cloud Compute for developers: https://developer.apple.com/private-cloud-compute/
  - WWDC26 session 319: https://developer.apple.com/videos/play/wwdc2026/319/
  - AFM 3: https://machinelearning.apple.com/research/introducing-third-generation-of-apple-foundation-models
  - WWDC26 iOS guide: https://developer.apple.com/wwdc26/guides/ios/
  - App privacy details: https://developer.apple.com/app-store/app-privacy-details/
  - introductory offers: https://developer.apple.com/documentation/storekit/implementing-introductory-offers-in-your-app
  - registration before purchase (App Review notices quoted in developer forums): https://developer.apple.com/forums/thread/731471
- **iPhone app memory ceiling:** https://developer.apple.com/forums/thread/834805
- **Thermal throttling** (iPhone 16 Pro, Qwen2.5-1.5B): https://arxiv.org/abs/2603.23640
- **RevenueCat:**
  - State of Subscription Apps 2026 (trial length): https://www.revenuecat.com/state-of-subscription-apps
  - subscription offers: https://www.revenuecat.com/docs/subscription-guidance/subscription-offers
- **Competitor prices** (secondary): https://beginnersinai.org/orai-explained/ and https://speeko.co/subscriptions
- **Your data:** `analysis_samples/run1-3.json` (iPhone, iOS 26.6, 2026-10-17 and 2026-10-20); ASR Lab results (memory note, 2026-10-16); the backend plan (`i-had-a-friend-warm-valley.md`).
