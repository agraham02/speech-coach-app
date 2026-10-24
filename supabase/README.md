# Tono AI backend

Supabase project `tono` (ref `dtqbsdhjwmftwozstpwk`). The app talks to it only
through the edge functions below; the database is closed to direct access
(row level security on every table, no table grants to `anon` or
`authenticated`).

## Layout

| Path | What it is |
|---|---|
| `migrations/` | The schema, in order. `20261019000000_tono_ai.sql` and the `entitlement_synced_at` column from `20261020000000_plus_sync.sql` are on the live project. **Run `20261023000000_tiers_and_trial.sql` in the SQL editor before deploying this branch's functions** (tiers, the trial, the retired starter pack, a new config row). Then **`20261024000000_conversation.sql`** before deploying `ai-converse` (the conversation count kind, its seconds column, the voice models and their prices; it rewrites the config row, so check `mode` and `plusPurchasable` afterwards). |
| `functions/_shared/` | Rules and helpers. The pure ones (allowance, pricing, config, request checks, prompts) are tested with jest; the Deno-only ones (ledger, gemini, secrets, apple, http, auth) with `deno test`. |
| `functions/_shared/prompts/` | **Every prompt Tono AI uses, and the JSON schema of each answer.** The phone names a task (`take_review`, `rewind_notes`, `word_chain`, `bridge_chain`, `summary_notes`, `mark_up`, `conversation_turn`, `conversation_debrief`) and sends structured inputs; it never sends prompt text. Change a prompt here and redeploy: no app update. A change to an answer's *shape* needs a new `schemaVersion` and an app update, since the phone checks every answer. |
| `functions/ai-upload-start` | Asks Google for an upload URL (key stays server-side) and returns only the URL. |
| `functions/ai-file` | Poll a file's state; proves the file belongs to the caller. |
| `functions/ai-generate` | The one place a model runs: check the task's inputs, write the prompt, reserve, call Gemini, record real cost, refund on failure, return the answer as JSON. |
| `functions/ai-converse` | The live conversation partner: writes the partner's next line (`conversation_turn`, thinking off) and speaks it with Gemini TTS, streaming newline-delimited JSON (the words, then 0.2 s PCM chunks, then timings). Also speaks a given line (the opener, the Dev voice lab). Meters conversation seconds itself from the time between a conversation's calls (`_shared/conversation.ts`). See `docs/decisions/conversation-voice.md`. |
| `functions/me` | The caller's plan (free, trial or Plus), what they have left, which kinds of call would be accepted, and the switches the app follows (kill switch, Plus on sale, minors policy). |
| `functions/app-config` | The switches the app needs before there is any account (Plus on sale, minors policy, mode, kill switch). No sign-in; nothing about the person. |
| `functions/apple-token` | Trades a Sign in with Apple code for a refresh token, kept encrypted so it can be revoked. |
| `functions/delete-account` | Revokes the Apple grant, removes the person from RevenueCat, deletes the account. Works for an anonymous account too. |
| `functions/revenuecat-webhook` | RevenueCat calls this when a subscription changes. It only learns who changed, then asks RevenueCat for the truth and writes `entitlements`. |

## Function secrets (Dashboard -> Edge Functions -> Secrets)

| Name | Value |
|---|---|
| `GEMINI_API_KEY` | The `tono-server` key from the `tono-ai` Google Cloud project (paid tier). |
| `TONO_SECRET` | 32 random bytes, base64. Make one with `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`. Encrypts the Apple token. Losing it means stored Apple tokens cannot be revoked. |
| `APPLE_PRIVATE_KEY` | The text of the `AuthKey_MFDU2QKLAT.p8` file (key id `MFDU2QKLAT`, team `23NQ9ZTT2W`). |
| `REVENUECAT_SECRET_KEY` | RevenueCat → Project settings → API keys → a **secret** v1 key (starts `sk_`). Lets the server read and delete subscribers. Never goes in the app. |
| `REVENUECAT_WEBHOOK_SECRET` | Any long random string. Enter the same value as the Authorization header in RevenueCat's webhook settings. |

`SUPABASE_URL`, `SUPABASE_DB_URL` and the service key are provided by the platform.

## Deploy

```
npx supabase login
npx supabase link --project-ref dtqbsdhjwmftwozstpwk
npx supabase functions deploy --use-api
```

`--use-api` deploys without Docker. `config.toml` turns `verify_jwt` off because
each function checks the caller itself (`auth.getUser`).

## Changing things without an app update

Everything lives in one row, `public.config`: mode (`beta` or `launch`), the
kill switch, the launch switch, the minors policy, every limit, the model for
each role, and the token prices. Edit it in the SQL editor, for example:

```sql
-- stop all hosted AI spend at once
update public.config set value = jsonb_set(value, '{killSwitch}', 'true') where id = 1;

-- switch the video review model (the new model must have a price row)
update public.config set value = jsonb_set(value, '{models,review_video,primary}', '"gemini-3.8-flash"') where id = 1;

-- go from beta to launch rules
update public.config set value = jsonb_set(value, '{mode}', '"launch"') where id = 1;

-- the free taste: judged takes a month for someone with no trial and no Plus
update public.config set value = jsonb_set(value, '{limits,freeMonthlyJudgedTakes}', '2') where id = 1;

-- try the cheaper text model on 10% of people (judged takes and exercises)
update public.config set value = jsonb_set(value, '{models,text,candidate,rolloutPercent}', '10') where id = 1;

-- let people who said they are under 18 use Tono AI (see docs/decisions/tiers-and-trial.md first)
update public.config set value = jsonb_set(value, '{minorsMayUseAi}', 'true') where id = 1;
```

### The tiers (`_shared/allowance.ts`)

| | Judged takes | Exercise notes, mark-ups | Insights | Window | Spend limit |
|---|---|---|---|---|---|
| free (launch mode) | `freeMonthlyJudgedTakes` (1) | none (Plus) | none | UTC month | shared `freeBudgetUsd` |
| beta (beta mode, not paying) | `betaMonthlyJudgedTakes` (15) | `betaMonthlyTextCalls` (100) | 4 | UTC month | shared `freeBudgetUsd` |
| trial | `trialJudgedTakes` (20) | `trialTextCalls` (60) | 4 | the trial (from its start) | `paidCostCapUsd` |
| plus | `plusMonthlyJudgedTakes` (60) | `plusMonthlyTextCalls` (300) | 12 | UTC month | `paidCostCapUsd` ($2.50) |

A judged take is one count whatever the judge was sent (words, or the video
too). Every judged take also has a daily ceiling (`dailyJudgedTakes`). The
conversation-minute limits (`trialConversationMinutes`, `plusMonthlyConversationMinutes`)
are set but not enforced yet: the live conversation partner (session 12) adds
its own count.

A change reaches every running function within 30 seconds. A model with no
price row is refused, so spend stays accurate.

## Tests

```
npx jest supabase                       # pure logic, config, migration seed
```

The Deno tests need Docker. From the repo root:

```
docker run --rm -v "$PWD:/app" -w /app denoland/deno:2.1.4 deno check --config supabase/functions/deno.json supabase/functions/*/index.ts
docker run --rm -v "$PWD:/app" -w /app denoland/deno:2.1.4 deno test --config supabase/functions/deno.json --allow-env --allow-net --no-check supabase/functions/_shared/helpers_deno_test.ts
```

The ledger test needs a Postgres with stand-ins for Supabase's `auth` and
`storage` schemas, then the migration, then:

```
docker run --rm --network <net> -e SUPABASE_DB_URL=postgres://postgres:test@<pg>:5432/postgres \
  -v "$PWD:/app" -w /app denoland/deno:2.1.4 deno test --config supabase/functions/deno.json \
  --allow-env --allow-net --no-check supabase/functions/_shared/ledger_deno_test.ts
```

It checks the reservation under concurrency (five calls at once with one judged
take left: exactly one wins), refunds, idempotency, the free monthly take, the
trial window across a month boundary, the cost cap, the shared free budget and
the daily ceiling. Last run 2026-10-23 against postgres:16 with all three
migrations: 10 of 10 steps pass. Re-run 2026-10-24 with the conversation
migration as well: 12 of 12 (the two new steps: seconds charged from a
conversation's own calls and stopping at the limit while a finishing call still
goes through; a conversation past its length refused). The stand-in schemas are just
`auth.users (id uuid default gen_random_uuid(), email)`, `auth.uid()`,
`storage.buckets (id, name, public)` and the `anon` and `authenticated` roles.

## Sign-in setup (already done in the dashboards)

- Apple: provider enabled, client ID `com.ahmadgraham.tono` (native sign-in needs no secret there).
- Google: web client `928705319351-pblphc4tr60qdnpcis4r3bhlgjnc6hjh.apps.googleusercontent.com`,
  used by Supabase's browser-based flow (full nonce checks, no "skip nonce" setting).
  The provider also needs that client's secret, entered by hand.
- Email provider is off.
- **Anonymous sign-ins: turn ON** (Authentication → Sign In / Providers → "Allow anonymous sign-ins"), and **manual linking: ON** ("Allow manual linking"), so the app can make an account without a sign-in and later link Apple or Google to it. Without these, Tono AI and purchases fail for anyone who hasn't signed in.
- Allowed redirect URL: `tono://auth/callback`.

## Tono Plus (RevenueCat)

The app buys through RevenueCat (`react-native-purchases`); the server never
trusts the phone about the plan. It learns the plan two ways, both asking
RevenueCat for the whole picture rather than believing an event:

- the webhook (`revenuecat-webhook`), for renewals, lapses and transfers;
- `me` with `refresh`, which the app sends right after a purchase or restore
  (at most every 10 s per account), and about hourly as a safety net.

Setup, once, in the dashboards:

1. **App Store Connect → Subscriptions.** One group, "Tono Plus", with two
   auto-renewing subscriptions: `com.ahmadgraham.tono.plus.monthly` ($4.99) and
   `com.ahmadgraham.tono.plus.annual` ($49.99). Needs the Paid Apps agreement and
   banking/tax done, and the Small Business Program for the 15% rate.
   **The 14-day trial:** on each product, Subscription Prices → Introductory
   Offers → **Free**, duration **2 weeks**, all territories, no end date. Apple
   gives each Apple ID one introductory offer per subscription group, so
   someone who had the trial on one plan doesn't get it again on the other.
2. **RevenueCat.** New project, iOS app with bundle ID `com.ahmadgraham.tono`
   (add the App Store Connect in-app purchase key). Import the two products.
   Entitlement `plus` containing both. Offering `default` (set as current) with
   the package types Monthly (`$rc_monthly`) and Annual (`$rc_annual`).
3. **RevenueCat webhook.** Project settings → Integrations → Webhooks → URL
   `https://dtqbsdhjwmftwozstpwk.supabase.co/functions/v1/revenuecat-webhook`,
   Authorization header = `REVENUECAT_WEBHOOK_SECRET`. Send the TEST event; it
   should answer 200.
4. **App.** Put RevenueCat's public iOS key (`appl_...`) in
   `src/config/backend.ts` as `REVENUECAT_IOS_KEY` and make a new build (the SDK
   is native). Nothing is offered for sale yet: that is the switch below.
5. **Server.** Set the two secrets above, run the migration, then
   `npx supabase functions deploy --use-api`.

Testing: TestFlight purchases are Apple sandbox purchases (free, and they renew
every few minutes; a 2-week trial lasts about 3 minutes in sandbox). The server
accepts them, marked `sandbox` in `entitlements.environment`. During the trial
`entitlements.plan` is `trial` (from RevenueCat's `period_type`), and
`period_started_at` is when it began. Deleting an account removes the RevenueCat record
but cannot cancel the Apple subscription, which the person cancels in iOS
Settings.

### The launch switch

The purchase code ships in the app, but Tono Plus is only shown when the server
says it is for sale (`plusPurchasable` in the `config` row, returned by `me`).
During the beta it is off and `mode` is `beta` (15 judged takes a month for
testers). To go live, in the SQL editor:

```sql
update public.config
set value = value || '{"mode": "launch", "plusPurchasable": true}'::jsonb
where id = 1;
```

That turns on, within about 30 seconds and with no app update: the Tono Plus
rows, the paywall, and the launch allowance (one free judged take a month, then
the trial or Plus; the phone's measurements are always free). To go back:

```sql
update public.config
set value = value || '{"mode": "beta", "plusPurchasable": false}'::jsonb
where id = 1;
```

Do this order for the App Store: first submit the build with the in-app
purchases attached and `plusPurchasable` **on**, because App Review has to see
and test the paywall (give them a sandbox flow in the review notes). Only then
release. While testing in TestFlight, flip `plusPurchasable` on to try sandbox
purchases and off again afterward.
