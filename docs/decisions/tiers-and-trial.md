# Tiers, the trial, the optional account, and Tono AI's prompts on the server

Session 08, 2026-10-23/24. Branch `feature/trial-and-tiers`.

Status: **built, with the open choices listed at the end for Ahmad.** Read with `decisions-log.md`, `inference-strategy.md` and `scoring-taxonomy.md`.

## Contents

1. [What was built](#1-what-was-built)
2. [Where the prompt and the code disagreed](#2-where-the-prompt-and-the-code-disagreed)
3. [The tiers](#3-the-tiers)
4. [The 14-day trial](#4-the-14-day-trial)
5. [Accounts: anonymous by default, sign-in optional](#5-accounts-anonymous-by-default-sign-in-optional)
6. [Minors and the Gemini API terms](#6-minors-and-the-gemini-api-terms)
7. [Prompts on the server, in the taxonomy's terms](#7-prompts-on-the-server-in-the-taxonomys-terms)
8. [Cost, re-done for text judging](#8-cost-re-done-for-text-judging)
9. [Bring-your-own-key, removed](#9-bring-your-own-key-removed)
10. [Notes for other sessions](#10-notes-for-other-sessions)
11. [Decisions for Ahmad](#11-decisions-for-ahmad)

---

## 1. What was built

- **Free, no account:** everything the phone measures, the measured score, the rule-based tips, the curriculum and the drills. Nothing leaves the phone.
- **One free judged take a month** for everyone not paying (a server setting, `limits.freeMonthlyJudgedTakes`, default 1).
- **Tono Plus** ($4.99 a month, $49.99 a year, unchanged) with a **14-day free trial on both plans**, as an App Store introductory offer read through RevenueCat. Plus and the trial judge takes (60 a month; 20 in the trial), judge the exercises (Rewind, Word Chain, Bridge Chain, Say it short) and write AI mark-ups.
- **No sign-in, ever required.** An anonymous Supabase account is made behind the scenes the first time Tono AI or a purchase needs one, and it is the RevenueCat app user id. Sign in with Apple or Google links that same account.
- **The age range** is asked in onboarding. Under 18, Tono AI is off while the server's `minorsMayUseAi` is false (the default).
- **Bring-your-own-key is gone**, with testers' keys deleted from the keychain at launch.
- **The prompts are on the server.** The phone sends a task name and structured inputs; the server writes the prompt and the answer schema. The take review answers in the scoring taxonomy's terms. A video review gets the phone's transcript instead of transcribing.
- **The judged layer is gated:** routing returns `not_entitled` (exercises) and `quota` (the free take used), and `whatCanShow` returns "locked" for a free user, so screens show one quiet line instead of a judgement.

Where it lives:

| | Files |
|---|---|
| Tier rules (server, the authority) | `supabase/functions/_shared/allowance.ts`, `allowanceInfo.ts`, `config.ts`, `types.ts` |
| The trial from RevenueCat | `supabase/functions/_shared/entitlement.ts`, `revenuecat.ts` |
| Prompts and answer schemas | `supabase/functions/_shared/prompts/` (`takeReview.ts`, `exercises.ts`, `measurements.ts`, `common.ts`, `index.ts`) |
| The one generate endpoint | `supabase/functions/ai-generate/index.ts`, `_shared/request.ts` |
| Schema change | `supabase/migrations/20261023000000_tiers_and_trial.sql` (no app SQLite migration) |
| Routing and the gate (app) | `src/domain/analysis/routing.ts`, `src/services/cloud/routing.ts`, `src/services/cloud/consent.ts`, `src/services/analysis/gate.ts` |
| What the phone sends, and checks | `src/services/analysis/inputs.ts`, `src/domain/analysis/judgedReview.ts`, `src/services/analysis/providers/tonoAi.ts` |
| Allowance wording | `src/domain/aiAllowance.ts` |
| Account | `src/domain/account.ts`, `src/services/account/accountStore.ts` (`ensureAccount`), `signIn.ts` (linking) |
| Plus and the trial (app) | `src/domain/plus.ts`, `src/services/purchases/purchases.ts`, `src/screens/PaywallScreen.tsx` |
| Age | `src/domain/profile.ts` (`AgeRange`, `isAdultFromAge`), `src/content/onboarding.ts`, `src/screens/OnboardingScreen.tsx` |
| Screens | `PreviewScreen` (the switch), `ResultScreen` (the locked line), `RewindResultScreen`, `components/settings/AccountSettings.tsx`, `DeepReviewSettings.tsx` (now "Tono AI"), `components/onboarding/AiCoachSetup.tsx` |

## 2. Where the prompt and the code disagreed

1. **"An AI-judged take counts as exactly one judged take."** The code counted a text-judged take against the *text* pool and a video one against *reviews*. Now there is one `take` count on the server, whatever the judge was sent, and exercise calls are `text`. The save screen line says exactly that ("Uses your free judged take for this month." / "Counts as 1 of the 49 judged takes left this month.").
2. **The free tier had a starter pack** (5 reviews once, then nothing) and identity tombstones to stop it being reclaimed. Both are gone: a monthly taste resets by itself, so there's nothing lifetime to protect. `freeBudgetUsd` (one monthly spend ceiling for everyone not paying) stays as the safety net.
3. **Sign-in was required for Tono AI** (and for buying). Now never.
4. **`domain/aiRouting.ts`** named in the prompt was already deleted by session 07 (replaced by `domain/analysis/routing.ts`); its tests were rewritten.
5. **The text-call pool was shared** by text-judged takes and all exercises (100 a month for Plus). Session 10 found it too small once drills are judged. With judged takes counted separately, the exercise pool is raised: **Plus 300 a month, trial 60, beta 100** (see section 8 for the cost).
6. **Lock-screen hiding of custom prompt text** was in the decisions log as "next session that touches notifications". Ahmad dropped it; it's recorded as dropped there (staging) and nothing was built.
7. **The privacy page** said "no account", described own keys, and said Tono AI never gets the transcript. Rewritten to the new truth: the transcript and measurements are sent as text for judging; the video stays on the phone.

## 3. The tiers

| | Free (launch) | Beta (TestFlight, not paying) | Trial (14 days) | Plus |
|---|---|---|---|---|
| Measured layer, tips, curriculum, drills | yes | yes | yes | yes |
| Judged takes | 1 a month | 15 a month | 20 over the trial | 60 a month |
| Exercise judging and mark-ups | no (rules and counts) | 100 a month | 60 over the trial | 300 a month |
| Insights | no | 4 | 4 | 12 |
| Spend limit | shared `freeBudgetUsd` ($50) | shared | $2.50 over the trial | $2.50 a month |
| Judged takes a day (all tiers) | 6 | 6 | 6 | 6 |

All numbers are in the server's config row and change without an app update. Conversation minutes (30 in the trial, 120 a month for Plus) are in the config but not enforced: session 12 adds the conversation kind and its count.

**What a free user sees.** Before the free take: the save screen switch "Have Tono AI judge this take" with "Uses your free judged take for this month." After it: the switch is off and reads "You've used this month's free judged take. The next one comes on 1 December. Your phone's measurements and tips are here as always." The result shows one footnote under the breakdown and, only where Plus is on sale, a small "See Tono Plus". Rewind shows its counts and a calm notes card. No alerts unless the person turns the switch on.

**Subscribers who use up their count** see the facts and when it refills, with nothing to buy.

## 4. The 14-day trial

- **Both plans.** Ahmad confirmed it. There is no reason not to: Apple allows one introductory offer per Apple ID per subscription group, so someone can't take a trial on monthly and then another on yearly.
- **How the app knows.** RevenueCat's `checkTrialOrIntroductoryPriceEligibility` per product; a free intro price's length gives "14 days". An unknown answer is treated as no, as RevenueCat advises, so the paywall never promises a trial the store won't give. The button reads "Start 14-day free trial", and the notice under it gives the trial length, the price after it, when the first charge is, and how to cancel (Guideline 3.1.2).
- **How the server knows.** `GET /v1/subscribers` gives `subscriptions[product].period_type` = `trial` and `purchase_date`. The entitlement row gets `plan = 'trial'` and `period_started_at`. The trial's counts run from that start, so a trial that crosses a month boundary doesn't get two months of allowance (tested against Postgres).
- **Abuse.**
  - New Tono accounts or reinstalls don't bring new trials: eligibility is Apple's, per Apple ID.
  - The trial needs a payment method and converts unless cancelled.
  - The trial's own counts (20 judged takes, 60 exercise calls) and the $2.50 cost cap bound what a trial can cost: at most about 35 cents at the expected prices (section 8).
  - Reinstalling to get more *free* judged takes works (each reinstall is a new anonymous account), but it's worth less than a cent each time, and `freeBudgetUsd` caps the total across everyone. If it ever shows up in `ai_calls`, the fixes are Apple's DeviceCheck (two bits per device that survive reinstall) or CAPTCHA on anonymous sign-ins; neither is built.
- **A cancelled trial** ends at its expiry; RevenueCat's webhook (or the hourly re-check) removes the entitlement, and the person is back on the free tier.

## 5. Accounts: anonymous by default, sign-in optional

- `ensureAccount()` calls Supabase `signInAnonymously()` once, only when the person asks for Tono AI (allows it, turns the save-screen switch on, taps "Get notes"), a Tono AI call is made, or a purchase or restore starts. The free path never makes an account, and an under-18 never gets one.
- The anonymous user id is the RevenueCat app user id (`purchases.ts` logs RevenueCat in as it), so a purchase belongs to it and App Review sees no registration before purchase (5.1.1(v)).
- **Linking.** Sign in with Apple (native) or Google (browser sheet) calls `linkIdentity` on the anonymous user, so the allowance, plan and history stay. If that Apple or Google identity already belongs to another Tono account (made on another phone), the phone signs in to that account instead.
- **Before any account,** the app still needs the server's switches (is Plus on sale, the minors policy). A new public function, `app-config`, returns them with no sign-in and nothing about the person, so the free path can show Tono Plus without making an account.
- **Delete account** works for both kinds (App Review 5.1.1(v): any app that creates accounts must offer deletion).
- **Supabase settings Ahmad must turn on:** "Allow anonymous sign-ins" and "Allow manual linking". Without them Tono AI and purchases fail for everyone who hasn't signed in.
- Anonymous users count toward Supabase's monthly active users like any other; at the free and Pro plan sizes that's not a constraint.

## 6. Minors and the Gemini API terms

**What the current terms say, word for word.** Gemini API Additional Terms of Service (<https://ai.google.dev/gemini-api/terms>, "Last updated 2026-04-28 UTC"), section "Age Requirements":

> "You must be 18 years of age or older to use the APIs. You also will not use the Services as part of a website, application, or other service (collectively, "API Clients") that is directed towards or is likely to be accessed by individuals under the age of 18."

**Vertex AI is no way out.** Google Cloud Service Specific Terms (<https://cloud.google.com/terms/service-terms>, last modified October 12, 2026), Generative AI Services, "d. Age Restrictions":

> "Customer will not, and will not allow End Users to, use a Generative AI Service as part of a website, Customer Application, or other online service that is directed towards or is likely to be accessed by individuals under the age of 18."

**Why both views were partly right.** Google does offer Gemini to students, but through the consumer Gemini app and Gemini for Education (Google Workspace), which have their own terms and safeguards. Those terms don't cover an app built on the API. For an API client, the text is unambiguous, and it has two parts: the user must be 18 or older, and the *app* must not be directed at, or likely to be used by, under-18s.

**What the app does now (built, reversible):**

- Onboarding asks an age range (Under 13, 13 to 17, 18 to 24, 25 to 34, 35 to 49, 50 or over, Prefer not to say). It's optional and stays on the phone; it's never sent.
- Under 18 and `minorsMayUseAi = false` (the default): Tono AI isn't offered anywhere (onboarding, the save screen, Settings, the paywall, exercise notes), nothing is sent, and no account is made. Everything else is the same app.
- "Prefer not to say" or skipping never blocks anything (Ahmad's rule: don't block anyone on a claim).
- One SQL line flips the policy (`minorsMayUseAi`), with no app update.

**What I propose, and why the gate alone may not be enough.** The age gate covers the first sentence (no under-18 *uses* the API through Tono). The second ("likely to be accessed by individuals under the age of 18") is about the app itself. A speaking coach will attract students, so:

1. Keep the gate on (built).
2. Don't market to students or schools, and keep store copy aimed at adults (interviews, meetings, talks).
3. Take legal advice before launch on the "likely to be accessed" clause. If the advice is that the app as a whole must not be likely to be used by minors, the App Store age rating would have to be 18+, which blocks teenagers from the whole app, including the free path. That is a real cost, so it's left as Ahmad's choice, not built.
4. Longer term, if teenagers are wanted: a judge that isn't under these terms for minors (Apple's Private Cloud Compute, from the inference strategy's spike list) could serve the under-18 path.

## 7. Prompts on the server, in the taxonomy's terms

- **The request** is `{task, schemaVersion, inputs, media?, idempotencyKey}`. Tasks: `take_review`, `rewind_notes`, `word_chain`, `bridge_chain`, `summary_notes`, `mark_up`. Each has an inputs schema on the server (zod), a builder, a count kind, and a model role. A request with an answer format the server doesn't write is refused (`unsupported_schema`, and the app asks for an update).
- **What the phone sends for a take:** the take kind, the prompt (or the script and its marks in the app's notation), the task context and plan, the phone's transcript and word timings, the measurements as numbers, the speaker facts (only if allowed) and the stutter flag. `src/services/analysis/inputs.ts`.
- **The answer** (schema version 3): `subscores` keyed by `SubcategoryId` (each `{score, notes, evidence}`), `structure_used`, `transcript_clean`, `annotations` (by subcategory), `coaching`, `quick_coach`, and `transcript_verbatim` only when there was no phone transcript. Fluency is never judged (the phone counts fillers); **conviction is now judged** from the text (`taxonomy.ts` `conviction.judged = "text"`). Cut from the answer: face-voice match, the archetype, the judge's own overall, and per-dimension rubric groups.
- **The phone checks it** (`acceptJudgedReview`): only judged subcategories that apply to the take, scores held to 1 to 10, notes required, annotations kept only if their quote is in the transcript, and at least 3 sub-scores or it's refused. The judged sheet is read from the stored `judged_review` artifact. The old `scores` row is still written, mapped from it, because the Scores tab reads it until session 11's tab replaces it; subcategories not judged are 0 there and the tab hides them.
- **Annotations trimmed** (session 11's note): the transcript only shows structure, content and restated points, so the judge is asked for up to 5 moments for Structure, On the point, Clarity and Conviction, plus restated-point pairs, and nothing for delivery or presence.
- **Video judging** (Dev → App tools → Judge from → Video) sends the video *and* the phone transcript; the judge doesn't transcribe, which removes most of the old output tokens and makes both kinds of judged take read the same words.
- **The exercise prompts** (Rewind's evidence-quoting prompt, Word Chain, Bridge Chain, from PR #20) moved unchanged to `prompts/exercises.ts`; the phone's checked retry sends the problems found as `inputs.problems`. `spikes/inference-eval/app_prompts.json` is now generated from the server file.
- **A guard test** keeps the server's list of judged subcategories and labels equal to `src/domain/scoring/taxonomy.ts`.

## 8. Cost, re-done for text judging

Gemini prices checked 2026-10-23 (<https://ai.google.dev/gemini-api/docs/pricing>, page updated 2026-10-22), per million tokens: **3.5 Flash-Lite** $0.30 in (text, image, video, audio) / $2.50 out; **3.1 Flash-Lite** $0.25 in ($0.50 audio) / $1.50 out, shutting down 2027-05-07 (deprecations page); 3.8 Flash $0.75 / $3.75 until 2026-12-31, then $1.50 / $7.50.

**Cheaper text-only models.** Within Gemini, 3.1 Flash-Lite is 40% cheaper on output, which is most of a text judgement's cost. It's in the config as a **0% candidate** on the `text` role, ready to roll out to a share of people with one SQL line once the hosted eval shows it judges as well. Outside Gemini, open models through OpenRouter (Gemma 4 26B, about 0.04 cents a text call, per the inference strategy) would be a second data processor and a second set of prompt tuning; not worth it while text is a few dollars a month in total.

**Per call (my estimates from the prompt sizes, not measured; test plan J collects the real numbers):**

| Call | Tokens in / out | 3.5 Flash-Lite | 3.1 Flash-Lite |
|---|---|---|---|
| Take judged from words (90 s take) | about 3,400 / 2,300 incl. thinking | **0.68 cents** | 0.43 cents |
| Take judged from video, with the phone transcript | about 11,600 / 2,500 | 0.98 cents (was 1.34 to 1.66) | |
| Exercise call (Rewind, chain, Say it short, mark-up) | about 1,800 / 1,200 | 0.35 cents (0.7 with the checked retry) | 0.21 cents |

Session 07's 0.35 cents for a text-judged take was the exercise-call estimate; a full take review has a longer prompt and ten scored notes, so 0.6 to 0.7 cents is the honest figure. The free taste is therefore about **0.7 cents per active free user a month**.

**Per subscriber per month:**

| Profile | Usage | Built today | With insights and conversation later |
|---|---|---|---|
| Typical | 30 judged takes, 40 exercise calls (+4 insights, 30 conversation minutes) | **$0.34** | $0.57 |
| Heavy, at every Plus count | 60 judged takes, 300 exercise calls (+12 insights, 120 minutes) | $1.46 | $2.32 |
| 14-day trial, typical | 15 judged takes, 20 exercise calls | $0.17 | |
| 14-day trial, at its counts | 20 judged takes, 60 exercise calls | $0.35 | |

Net revenue per subscriber is $3.61 a month on monthly and $3.01 on annual (15% Apple, 15% for tax-inclusive prices, from the inference strategy). So:

- **Keep $4.99 and $49.99.** Even the heavy profile with every future feature stays under the $2.50 cap, and the cap is under the annual net.
- **Keep the $2.50 cap** (`paidCostCapUsd`, now also over the trial).
- **The exercise pool goes from 100 to 300 a month** for Plus: 200 more calls is about 70 cents in the worst case, still under the cap. Giving the exercise judges their own pool (this branch: judged takes are counted separately) is what stops drills from eating judged takes.
- **The conversation cap of 120 minutes a month** is in the config for session 12 (about 77 cents at the cap).
- **`freeBudgetUsd` ($50)** covers about 7,000 free judged takes a month. Raise it at launch in line with the free user count.

## 9. Bring-your-own-key, removed

Deleted: `services/cloud/providers.ts`, `textProviders.ts`, `measuredReview.ts`, `speakerContext.ts`, `jsonSchema.ts`, `services/analysis/providers/ownKey.ts`, `videoReview.ts`, `services/analysis/prompts.ts`, the whole `services/gemini/` client (direct calls, prompts, schemas, transcript-only mode), the key fields in onboarding and Settings, the per-provider consents, the Dev tab's daily own-key count, and the copy about keys. The `own_key` producer is gone from the AnalysisService. Video uploads for the Dev video setting moved to `services/tono/upload.ts` (through the server, as before).

On update, `deleteRemovedSecrets()` deletes `geminiApiKey`, `openaiApiKey`, `anthropicApiKey` and `openrouterApiKey` from the keychain at every launch, and `removeObsoletePrefs()` drops the provider, model, consent and call-count prefs. No message, no migration (Ahmad's rule).

## 10. Notes for other sessions

- **AnalysisService public shape.** `requestAnalysis`, `showLevelFor`, `analysis.observe`, `prepareFor(kind, openSettings?)` keep their signatures (`openSettings` is now unused). Changed: `AnalysisContext` (no `wantsTono`, `ownKey`, `tono.signedIn`; new `tier`, `isAdult`, `minorsMayUseAi`; `allowed.review` is now `allowed.take`), `Producer` (no `own_key`), `TakeReviewOutput` (`review: JudgedReview` instead of `analysis`, no `providerId`), and `PROMPT_VERSIONS` is gone (provenance carries the server's version). Adding a kind now also means adding a server task in `supabase/functions/_shared/prompts/`.
- **Session 11 (results):** the judged sheet comes from the `judged_review` artifact, not the `scores` row; the row is a display copy with 0 for unjudged subcategories. `whatCanShow` now returns "locked" for free users, which is what the Scores tab's locked state should read. `ResultScreen` got small edits (archetype and congruence hidden when absent, a locked footnote); keep `groundAiMarks` as the verifier.
- **Session 09 (waiting):** a free user's one judged take a month goes through the same pipeline step.
- **Session 12 (conversation):** add a `conversation_turn` task and a minutes count; the limits are already in the config.
- **No app migration.** This branch needs no SQLite migration (the age range is in the profile prefs, consent in MMKV).

## 11. Decisions for Ahmad

Each is built as recommended and easy to reverse.

1. **Minors:** Tono AI off under 18 by default (`minorsMayUseAi: false`), the age question optional and never blocking. Separately: whether to take legal advice on "likely to be accessed by individuals under the age of 18", and whether that leads to an 18+ App Store rating (not built).
2. **Free taste: 1 judged take a month**, as decided; text exercises and mark-ups stay Plus-only for free users. Reverse: `freeMonthlyJudgedTakes`.
3. **Exercise pool raised and separated:** Plus 300 exercise calls a month (was 100 text calls shared with judged takes), trial 60, beta 100.
4. **Trial counts:** 20 judged takes and 60 exercise calls over the trial, under the same $2.50 cap.
5. **Conviction is judged** by Tono AI from the text (it was measured only). Reverse: `conviction.judged = null` in `taxonomy.ts` and the server list.
6. **Gemini 3.1 Flash-Lite** as a 0% text candidate, to roll out after the hosted eval.
7. **Anonymous sign-in and manual linking** in Supabase (needed for no-sign-in purchases).
8. **The video setting stays Dev-only**, so the production privacy answers don't include audio or video.
9. **`freeBudgetUsd`** stays $50 for the beta; raise it at launch.
