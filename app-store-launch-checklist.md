# App Store launch checklist

From this repo to "Ready for Sale" on the App Store, iPhone only. The Apple Developer Program membership is already in place. Items marked `[x]` are already done in the repo or the dashboards.

The app's shape matters for several answers below:

- **Free, no account:** recording, the on-device transcript, every measurement, scores and tips, the curriculum and the drills. Nothing leaves the phone.
- **Tono AI** (optional, after one in-app consent): the take's transcript and the phone's measurements go, as text, through Tono's Supabase backend to Google Gemini (paid tier). The video stays on the phone (a Dev setting can send it; not in production builds).
- **Accounts:** none is ever required. The first Tono AI call or purchase makes an **anonymous** Supabase account behind the scenes (linked to RevenueCat by its id), so App Review never sees forced registration before a purchase (Guideline 5.1.1(v)). Sign in with Apple or Google is optional and links that account.
- **Tono Plus:** auto-renewing subscriptions, $4.99 a month and $49.99 a year, both with a **14-day free trial** (an introductory offer). Free users get one judged take a month.
- **Age:** onboarding asks an age range. Under 18, Tono AI is off (the Gemini API terms ask for 18 or older; `docs/decisions/tiers-and-trial.md`).

---

## 1. Decide before you build

- [x] **App name.** The App Store listing is **Tono: Speaking Coach**, and the app calls itself **Tono** (`name` in `app.config.ts`).
- [ ] **Where the privacy policy and support pages live.** `docs/privacy.md` and `docs/terms.md` publish to `www.ahmadgraham.me/tono/...` (the URLs in `src/domain/plus.ts`). Republish them from this branch: the live privacy page still describes own keys and "no account".
- [ ] **Category.** Education as primary, with Productivity as an optional secondary.
- [x] **Price.** Free download with in-app subscriptions: Tono Plus monthly ($4.99) and yearly ($49.99).
- [ ] **Age rating.** See section 3: answer honestly (AI-generated text, no user-to-user content). Decide with legal advice whether to rate the app 18+ (see `docs/decisions/tiers-and-trial.md`, "Minors").

## 2. Repo prep

Already done:

- [x] Permission prompts say what each one is for and where the data goes: camera, microphone, speech recognition (`app.config.ts`, Guideline 5.1.1).
- [x] One consent before anything goes to Tono AI, with exactly what is sent shown above the button (Guideline 5.1.2(i)); the save screen has a per-take switch.
- [x] No sign-in before purchase: the anonymous account is made behind the scenes (Guideline 5.1.1(v)). Account deletion is in Settings → Account & Plus for any account, anonymous or linked.
- [x] The paywall shows trial length, price after the trial, that it renews, how to cancel, Restore, Terms and Privacy next to the button (Guideline 3.1.2). It promises a trial only when the App Store says the Apple ID is eligible.
- [x] Export compliance: `ITSAppUsesNonExemptEncryption: false`. HTTPS only.
- [x] The Dev tab and lab screens are hidden in production builds (`SHOW_DEV_TOOLS` is only on for `__DEV__` or the `preview` profile). That includes the "judge from the video" setting.
- [x] No secret keys are bundled. `src/config/backend.ts` holds only the public Supabase URL, the publishable key and RevenueCat's public iOS key.
- [x] Bring-your-own-key is gone; testers' stored keys are deleted from the keychain at launch (`src/services/secrets/secretsStore.ts`).
- [x] Build numbers auto-increment on EAS.
- [x] Built-in quotes are public domain; the speeches are original writing.
- [x] App icon and splash screen.

Still to do:

- [ ] **Version.** Bump `version` in `app.config.ts` for this build: `react-native-purchases` and the sign-in plugins are native.
- [ ] **Health check.** Run `npx expo-doctor` and `npx expo install --check`, and fix anything they flag.
- [ ] **Privacy manifest.** After the first upload, watch your email for missing "required reason" APIs and add them under `ios.privacyManifests` in `app.config.ts`.

## 3. App Store Connect record

- [x] App record exists (app id 6824105151), bundle ID `com.ahmadgraham.tono`.
- [ ] **App Information:** subtitle, category, content rights (Yes, third-party content: public-domain quotes; AI text is generated for the user), and the age rating questionnaire (AI-generated text: yes, in Tono AI's notes).
- [ ] **Agreements:** sign the Paid Apps Agreement, add banking and tax, complete EU trader status. Join the Small Business Program (15%).
- [x] **Subscriptions:** group "Tono Plus" with `com.ahmadgraham.tono.plus.monthly` ($4.99) and `com.ahmadgraham.tono.plus.annual` ($49.99).
- [ ] **Introductory offer on both:** Subscriptions → each product → Subscription Prices → Introductory Offers → Free, 2 weeks, all countries, starting today, no end date.
- [ ] **Review screenshot** for each subscription: a real iPhone paywall shot (with the trial line).
- [ ] **Pricing and Availability:** Free, all countries.

## 4. Backend and RevenueCat (see `supabase/README.md`)

- [ ] Supabase → Authentication → Sign In / Providers → **Allow anonymous sign-ins: on**, and **Allow manual linking: on** (needed to link Apple or Google to the anonymous account). Consider turning on CAPTCHA for anonymous sign-ins later if abuse shows up.
- [ ] Run migration `supabase/migrations/20261023000000_tiers_and_trial.sql` in the SQL editor (it replaces the config row: check `mode` and `plusPurchasable` afterwards).
- [ ] Deploy the functions: `npx supabase functions deploy --use-api`.
- [ ] RevenueCat webhook to `.../functions/v1/revenuecat-webhook` with the Authorization secret; set `REVENUECAT_SECRET_KEY` and `REVENUECAT_WEBHOOK_SECRET` as function secrets.
- [ ] RevenueCat: after the Paid Apps Agreement is signed, re-import the products so they stop showing "Could not check", and confirm both are in the `plus` entitlement and the `default` offering.

## 5. Build and get it on your iPhone

- [ ] `eas build -p ios --profile production` (or `testflight` first).
- [ ] `eas submit -p ios --latest`. Processing takes 5–30 minutes.
- [ ] TestFlight → Internal Testing. Install from the TestFlight app.

## 6. Test the release build on a real iPhone

The device test plan (`docs/testing/device-test-plan.md`, section J) has the full list for tiers and the trial. In short:

- [ ] **The free path, offline and online:** onboarding with "Not now" on Tono AI, a take, the result with measurements and tips, nothing that looks broken or locked twice.
- [ ] **The free judged take:** allow Tono AI, judge one take, then see the next take's save screen say when the next free one comes.
- [ ] **Sandbox trial purchase** on both plans, restore on a reinstall, cancel, and no second trial.
- [ ] **The age question:** under 18 keeps Tono AI and Plus out of sight.
- [ ] **Each permission denied in turn**, interrupted takes, a long take, light and dark mode, the largest Dynamic Type, VoiceOver on the main flow, Reset app.

## 7. Store listing

- [ ] **Screenshots:** 6.9-inch iPhone, 1320 × 2868 portrait, 3 to 10, with real practice data. Suggested: Today, recording, a result with scores, a judged take, a drill.
- [ ] **Description:** what it does, what's on the phone and free, then Tono AI and Tono Plus with the trial. No medical or therapy claims.
- [ ] **Keywords**, support URL, copyright.
- [ ] **In-app purchase promotion** (optional).

## 8. Privacy

- [ ] **Privacy policy page:** republish `docs/privacy.md` (effective 2026-10-24). It says: recordings stay on the phone; free use sends nothing; Tono AI sends the transcript and measurements as text to Tono's server and Google; the anonymous account; RevenueCat; Tono AI is 18+.
- [ ] **App Privacy questionnaire.** For the free path nothing leaves the phone, but the app as a whole collects when Tono AI is used:
  - **Other User Content** (the transcript and exercise text sent to be judged), **Audio Data**: no (not in production; the video setting is Dev-only). If the video setting ever ships, add Audio Data and Photos or Videos.
  - **User ID** (the anonymous account id), **Email Address** (only when the user signs in with Apple or Google), **Purchases** (RevenueCat).
  - Purpose: App Functionality. Linked to the user: Yes (account id). Tracking: No.

## 9. Submit for review

- [ ] Before submitting, flip the launch switch (`supabase/README.md`): `mode` launch and `plusPurchasable` true, so the reviewer sees the paywall.
- [ ] Choose the build, fill in App Review Information, and attach both subscriptions to the version. Review notes, draft:

  > Tono is a public-speaking practice app. No account or sign-in is needed for anything, including purchases: the app makes an anonymous account behind the scenes when the AI feature or a purchase first needs one. Sign in with Apple or Google in Settings is optional and only lets a subscription follow the user to another phone.
  >
  > To try it: finish onboarding, tap Record on Today, speak for 30 seconds, and stop. The result shows pace, pauses, filler words and eye contact, all computed on the device.
  >
  > Tono AI judges a take from its transcript and measurements (text only). Everyone gets one judged take a month free; Tono Plus (monthly or yearly, each with a 14-day free trial) gives more. Before anything is sent, the app shows exactly what is sent and asks for permission. Use a sandbox account to start the trial from Settings → Account & Plus → Tono Plus.
  >
  > Onboarding asks an age range: under 18, the AI feature is not offered, as Google's Gemini API terms require.

- [ ] Release option: **manual release**.
- [ ] Submit. Reply to any rejection in Resolution Center.

## 10. After launch

- [ ] Watch Crashes, Ratings, and the `ai_calls` table (real cost per judged take; see `docs/decisions/tiers-and-trial.md` for what to re-cost).
- [ ] Every update: bump `version` if anything native changed, build, submit.
- [ ] Before each submission, check that the privacy answers still match the app.
