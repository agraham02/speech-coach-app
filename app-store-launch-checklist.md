# App Store launch checklist

From this repo to "Ready for Sale" on the App Store, iPhone only. The Apple Developer Program membership is already in place. Items marked `[x]` are already done in the repo.

The app's shape matters for several answers below: there is **no account and no server**. Everything runs on the phone, and the only network traffic is (a) a one-time speech-model download and (b) optional AI deep reviews, which the user sends with **their own API key** to a provider they choose (Google Gemini, OpenAI, Anthropic or OpenRouter), after an in-app consent prompt.

---

## 1. Decide before you build

- [x] **App name.** The App Store listing is **Tono: Speaking Coach**, and the app calls itself **Tono** (`name` in `app.config.ts`). Names are unique across the store, so reserve it as soon as you create the App Store Connect record (step 3). Run a quick USPTO trademark search first. Limits: name 30 characters, subtitle 30.
- [ ] **Where the privacy policy and support pages live.** Both URLs are required. A free GitHub Pages site or any simple one-page host is enough. You need the URLs before you can submit.
- [ ] **Category.** Education as primary, with Productivity as an optional secondary.
- [ ] **Price.** Free, no in-app purchases.

## 2. Repo prep

Already done:

- [x] Permission prompts say what each one is for and where the data goes: camera, microphone, speech recognition (`app.config.ts`, Guideline 5.1.1).
- [x] Face ID prompt removed. The app never uses Face ID, so declaring it would be an unused permission.
- [x] Consent before anything goes to an AI provider, per provider (Guideline 5.1.2(i)).
- [x] Export compliance: `ITSAppUsesNonExemptEncryption: false`. The app only uses HTTPS, which is exempt, so no export questions come up at upload.
- [x] The Dev tab and lab screens are hidden in production builds (`SHOW_DEV_TOOLS` is only on for `__DEV__` or the `preview` profile).
- [x] No API keys are bundled. `.env` is gitignored and never uploaded to EAS, and nothing reads it at runtime.
- [x] Build numbers auto-increment on EAS (`eas.json` → production `autoIncrement: true`, version source `remote`).
- [x] Reset app exists (Settings → Start over), and old installs are offered a fresh start.
- [x] Built-in quotes are all public domain: Lincoln, Shakespeare, Dickens, JFK and others. The speeches are original writing.
- [x] New app icon in the Quiet Studio palette: a spoken phrase that rises, falls and lands, then a red full stop. It's 1024×1024 with no transparency, and Android gets adaptive and themed (monochrome) layers. The masters are in `assets/brand/`, and `python assets/brand/render.py` regenerates every PNG.
- [x] Splash screen (`expo-splash-screen`): the mark on paper in light mode and on ink in dark mode. It stays up until fonts load and the first screen is ready, then fades. Check it on the TestFlight build; development builds don't show every splash setting.

Still to do:

- [ ] **Version.** `version` in `app.config.ts` is `1.0.0`, which is what users see. Bump it in the app config for each App Store release. EAS only bumps the build number.
- [ ] **Health check.** Run `npx expo-doctor` and `npx expo install --check`, and fix anything they flag.
- [ ] **Privacy manifest.** Expo packages and React Native ship their own `PrivacyInfo.xcprivacy` files, but Apple doesn't read all of them from static CocoaPods. After the first upload (step 4), watch your email: Apple lists any missing "required reason" APIs within minutes. Add those reasons under `ios.privacyManifests` in `app.config.ts` and rebuild. Expo's guide: docs.expo.dev/guides/apple-privacy.

## 3. App Store Connect record

- [ ] App Store Connect → Apps → **+** → New App. Choose iOS, your app name, primary language English (U.S.), bundle ID `com.ahmadgraham.tono`, and a SKU such as `tono`. The bundle ID has to be registered first. EAS registers it on the first build, or you can register it under Certificates, Identifiers & Profiles. `eas submit` can also create the record for you when it doesn't find one.
- [ ] Under **App Information**, set the subtitle, category, content rights (answer **Yes**, it shows third-party content, and **Yes**, you have the rights: the built-in quotes are public domain, and AI review text comes from the user's own provider account), and the age rating questionnaire. Nothing in the app should push the age rating above the lowest tier. Answer honestly that it shows AI-generated text, though only in user-requested deep reviews.
- [ ] Under **Pricing and Availability**, choose Free and pick countries. All countries is fine: the app is English-only, but that doesn't block other storefronts.

## 4. Build and get it on your iPhone

- [ ] `eas build -p ios --profile production`. The first run asks you to log in to your Apple account. Let EAS create and manage the distribution certificate and provisioning profile.
- [ ] `eas submit -p ios --latest`, which uploads to App Store Connect. Processing takes 5–30 minutes.
- [ ] Check your email for privacy-manifest warnings (see step 2).
- [ ] **TestFlight → Internal Testing.** Add yourself and install from the TestFlight app. Internal testers need no Beta App Review. External testers, for example friends without App Store Connect access, need a one-time beta review.
- [ ] If the iPhone still has the old development build, the TestFlight build keeps its data (same bundle ID). Use **Start fresh** when it's offered, or Settings → Start over.

## 5. Test the release build on a real iPhone

A production build behaves differently from the dev client: there's no Metro, no dev menu and no fast refresh, and it runs at release speed. Test these on the TestFlight build:

- [ ] **First launch with no network:** onboarding works, and recording works.
- [ ] **First transcription:** the speech model downloads once (100–200 MB). Try it on cellular and on a weak connection, and make sure a failed download recovers with a retry instead of hanging.
- [ ] **Each permission denied in turn** (camera, microphone, speech recognition, notifications): the app explains what's missing and doesn't crash. Re-enabling access in iOS Settings works without reinstalling.
- [ ] **Every practice mode, end to end:** record a take, then Line reps, Word Chain, Mark It Up, Move It, Rehearse, the drills, Conversation, feelings and the daily goal.
- [ ] **Deep review with each provider you can get a key for:** wrong key, no credit, airplane mode mid-review, then a successful review. The consent prompt appears the first time per provider.
- [ ] **Interrupted takes:** take a phone call during a recording, background the app mid-take, lock the screen.
- [ ] **Long take:** 5+ minutes. Watch storage, review time, and whether the phone runs hot.
- [ ] **Appearance and text:** light and dark mode, and the largest Dynamic Type size (nothing clipped on key screens).
- [ ] **VoiceOver pass** on the main flow: Today → record → result.
- [ ] **Reset app:** everything is cleared and onboarding starts again.
- [ ] **iPad compatibility mode, if you can borrow one.** iPhone-only apps still run on iPads in a phone-sized window, and App Review sometimes tests on iPad. The camera and teleprompter should work there.
- [ ] Note any crashes. App Store Connect → TestFlight → Crashes shows reports from testers who share data. No crash SDK is needed for v1. Adding one such as Sentry would change your privacy answers.

## 6. Store listing

- [ ] **Screenshots:** 6.9-inch iPhone, 1320 × 2868 portrait, between 3 and 10. App Store Connect scales them for smaller phones, and no iPad shots are needed. Take them from the simulator (iPhone 17 Pro Max) or your phone with real practice data, not lorem ipsum. Suggested set: Today, recording with the teleprompter, a result with scores, a drill, progress.
- [ ] **Description:** what it does, then what's on-device, then the optional bring-your-own-key review. Avoid medical or therapy claims. Stuttering mode is a practice setting, not treatment. The current in-app copy is already clean on this, so keep the listing the same.
- [ ] **Keywords** (100 characters, comma-separated, no spaces after commas, and don't repeat words already in the name). For example: public speaking, presentation, filler words, pace, teleprompter, rehearse, confidence.
- [ ] **Support URL** (required), marketing URL (optional), and copyright, e.g. "2026 Ahmad Graham".
- [ ] **Accessibility Nutrition Labels** (optional). Only claim what you tested in step 5.

## 7. Privacy

- [ ] **Privacy policy page.** It must say:
  - Recordings, transcripts and scores stay on the phone. There's no account, no analytics and no tracking.
  - Deep reviews are optional and need your own API key. What gets sent: to Google Gemini, the video; to OpenAI, Anthropic or OpenRouter, the transcript and on-device measurements (never the video). It's sent only after you allow it per provider. The provider handles it under your agreement with them. Link each provider's API data policy, and note that **Gemini's free tier may use submitted content to improve Google's products**.
  - API keys are stored in the iOS keychain on the device.
  - The one-time model download sends no user data.
  - Deletion: delete a take, or Settings → Start over → Reset app, or delete the app.
  - A contact email.
- [ ] **App Privacy questionnaire** in App Store Connect. You never receive any data, but the deep review sends user content to a third party chosen in the app, and those providers keep it for some time. The safe answer is to declare it rather than claim "Data Not Collected":
  - **Audio Data** (Gemini sends the video's audio), **Photos or Videos** (Gemini), **Other User Content** (transcripts).
  - Purpose: App Functionality. Linked to the user's identity: No. Used for tracking: No.

  Over-declaring has no penalty. Under-declaring is a rejection or removal risk.

## 8. Submit for review

- [ ] Choose the build, fill in the **App Review Information** contact, and add review notes. Draft:

  > Tono is a public-speaking practice app. It needs no account and works fully offline after a one-time speech-model download (100–200 MB), which starts with the first transcription.
  >
  > To try it: finish onboarding, tap Record on Today, speak for 30 seconds, and stop — the result screen shows pace, pauses, filler words and eye contact, all computed on the device.
  >
  > Optional "deep reviews" use the user's own API key for an AI provider they choose (Settings → Deep reviews). The app sells nothing and has no in-app purchases; the key is the user's own account with that provider, like an email app's login. Before anything is sent, the app shows which provider receives what and asks for permission. [Optional: a test key with a spending cap: …]

- [ ] Including a capped test key (e.g. an OpenRouter key with $2 of credit) lets the reviewer see the full feature. It isn't required, because the core app works without one.
- [ ] **Known review risk:** Guideline 3.1.1 and bring-your-own-key. Many bring-your-own-key AI apps are on the store, but a reviewer could read the Settings line "you pay them directly, usually a few cents a review" as steering users to outside payment. If it's rejected on that, drop the sentence and keep "connect your own key". The feature itself can stay.
- [ ] Release option: choose **manual release**, so you control the launch day after approval.
- [ ] Submit. First reviews usually take 1–3 days. Reply to any rejection in Resolution Center. Most first rejections are metadata or permission-wording issues that you fix without a new build.

## 9. After launch

- [ ] Watch Crashes and Ratings in App Store Connect for the first week.
- [ ] Every update follows the same steps: bump `version` in `app.config.ts`, then `eas build --profile production`, then `eas submit --latest`, then add notes and submit for review.
- [ ] Before each submission, check that the privacy answers still match the app. A new provider or SDK can change them.
