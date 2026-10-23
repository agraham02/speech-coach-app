# Tono AI backend

Supabase project `tono` (ref `dtqbsdhjwmftwozstpwk`). The app talks to it only
through the edge functions below; the database is closed to direct access
(row level security on every table, no table grants to `anon` or
`authenticated`).

## Layout

| Path | What it is |
|---|---|
| `migrations/` | The schema. `20261019000000_tono_ai.sql` is applied to the live project; run `20261020000000_plus_sync.sql` (one column) in the SQL editor before deploying the Plus functions. |
| `functions/_shared/` | Rules and helpers. The pure ones (allowance, pricing, config, request checks) are tested with jest; the Deno-only ones (ledger, gemini, secrets, apple, http, auth) with `deno test`. |
| `functions/ai-upload-start` | Asks Google for an upload URL (key stays server-side) and returns only the URL. |
| `functions/ai-file` | Poll a file's state; proves the file belongs to the caller. |
| `functions/ai-generate` | The one place a model runs: reserve, call Gemini, record real cost, refund on failure. |
| `functions/me` | The caller's allowance and which kinds of call would be accepted. |
| `functions/apple-token` | Trades a Sign in with Apple code for a refresh token, kept encrypted so it can be revoked. |
| `functions/delete-account` | Revokes the Apple grant, writes the starter tombstone, removes the person from RevenueCat, deletes the account. |
| `functions/revenuecat-webhook` | RevenueCat calls this when a subscription changes. It only learns who changed, then asks RevenueCat for the truth and writes `entitlements`. |

## Function secrets (Dashboard -> Edge Functions -> Secrets)

| Name | Value |
|---|---|
| `GEMINI_API_KEY` | The `tono-server` key from the `tono-ai` Google Cloud project (paid tier). |
| `TONO_SECRET` | 32 random bytes, base64. Make one with `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`. Keys the identity hash and encrypts the Apple token. Losing it means stored Apple tokens cannot be revoked. |
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
kill switch, every limit, the model for each role, and the token prices. Edit
it in the SQL editor, for example:

```sql
-- stop all hosted AI spend at once
update public.config set value = jsonb_set(value, '{killSwitch}', 'true') where id = 1;

-- switch the video review model (the new model must have a price row)
update public.config set value = jsonb_set(value, '{models,review_video,primary}', '"gemini-3.8-flash"') where id = 1;

-- go from beta to launch rules
update public.config set value = jsonb_set(value, '{mode}', '"launch"') where id = 1;
```

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

It checks the reservation under concurrency (five calls at once with one review
left: exactly one wins), refunds, idempotency, the starter pack, the Plus cost
cap, the shared free budget and the daily ceiling.

## Sign-in setup (already done in the dashboards)

- Apple: provider enabled, client ID `com.ahmadgraham.tono` (native sign-in needs no secret there).
- Google: web client `928705319351-pblphc4tr60qdnpcis4r3bhlgjnc6hjh.apps.googleusercontent.com`,
  used by Supabase's browser-based flow (full nonce checks, no "skip nonce" setting).
  The provider also needs that client's secret, entered by hand.
- Email provider is off. Anonymous sign-ins are off.
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
every few minutes). The server accepts them as Plus, marked `sandbox` in
`entitlements.environment`. Deleting an account removes the RevenueCat record
but cannot cancel the Apple subscription, which the person cancels in iOS
Settings.

### The launch switch

The purchase code ships in the app, but Tono Plus is only shown when the server
says it is for sale (`plusPurchasable` in the `config` row, returned by `me`).
During the beta it is off and `mode` is `beta` (15 free reviews a month). To go
live, in the SQL editor:

```sql
update public.config
set value = value || '{"mode": "launch", "plusPurchasable": true}'::jsonb
where id = 1;
```

That turns on, within about 30 seconds and with no app update: the Get Tono Plus
rows, the paywall, and the launch allowance (5 free reviews once, then Plus, an
own key, or the phone). To go back:

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
