---
title: Tono Privacy Policy
---

# Tono Privacy Policy

Effective October 19, 2026

Tono is a speaking-practice app made by Ahmad Graham ("I", "me"). This policy explains what Tono does with your information. I wrote it to be read, so it is plain on purpose.

## The short version

- **Your recordings stay on your phone.** Your videos, transcripts, scores, face and voice measurements, and settings are stored on your device. I do not keep copies on a server.
- **Nothing is sent anywhere unless you turn on AI reviews.** There are two ways to get them. With **Tono AI**, you sign in and your take is reviewed through my service by Google's Gemini. With **your own API key**, your phone sends it straight to the AI company you choose, and it never passes through me.
- **An account exists only for Tono AI.** The rest of Tono, including reviews with your own key, works without one.
- **No ads, no analytics, no tracking, and I do not sell your information.**
- **If you buy Tono Plus** (once it is offered), Apple takes the payment and I never see your card details.
- **You can delete everything:** your account from Settings → Account, and the data on your phone from Settings or by deleting the app.

## Who to contact

Questions, or anything you want to know about this policy: **ahmadgrahamdev@gmail.com**

## What stays on your phone

Tono stores the following on your device only:

- **Recordings:** the videos you record, and the audio in them.
- **Transcripts and measurements:** the text of what you said, how fast you spoke, your pauses and filler words, your pitch and loudness, and scores built from them.
- **Face measurements:** while you record, Tono uses your camera to measure things like where you are looking, head position, and expression. This is calculated on your phone, saved as numbers, and used only to give you feedback. Tono does not identify or recognize you, and does not build a face profile.
- **What you tell Tono:** your name, goals, what gets in your way, any event you are preparing for, how comfortable you feel speaking, and anything you write in the app (for example in Talk back, Rewind, or your "why").
- **Your progress:** streaks, practice history, and reminders you set.
- **Your AI provider key**, if you add one. It is kept in the iPhone Keychain.
- **Your Tono sign-in**, if you use Tono AI. It is kept in encrypted storage on your phone, and the key to it is in the iPhone Keychain.

Tono asks for permission to use the **camera**, **microphone** and **speech recognition**. You can change these at any time in iOS Settings. The app needs the camera and microphone to record, and works best with all three.

### On-device processing

Turning your speech into text and analyzing your voice and face happens on your phone, using a speech model that you download once. No audio or video is uploaded for this. Where your iPhone supports it, Tono's coaching text can also be written by Apple Intelligence, which runs on the device.

## What leaves your phone, and only when you choose

### 1. AI reviews (optional)

You choose who writes the AI review of a take, in Settings → Deep reviews. Which data is sent depends on that choice:

| Choice | What is sent for a review | Where it goes |
|---|---|---|
| Tono AI | The video of the take, including its audio, and the measurements your phone made of it (pace, pauses, pitch, loudness, eye contact, expression). Not the phone's transcript. | The video goes from your phone straight to Google Gemini and does not pass through my service. The measurements and prompt go through my service to Google. |
| Your own Google Gemini key | The video of the take, including its audio | From your phone straight to Google |
| Your own OpenAI, Anthropic Claude or OpenRouter key | The transcript, the timing of your pauses, and the measurements your phone made (pace, pitch, loudness, eye contact, expression). Never the video or audio. | From your phone straight to that company |

With every review, Tono also sends the prompt or script you were answering. Unless you switch it off in Settings, it also sends a short note about you so the feedback fits: where you want to speak better, what gets in your way, any upcoming event (including any note you wrote about it), your training and comfort level, whether English is your first language, and any note you wrote about your voice. It does not send your name, your "why", or your Talk back entries. If you tell Tono you stutter, the review is also told to judge your speech accordingly.

The Say it short drills and Rewind send the words you said (and, for Say it short, the prompt) as text, never audio or video. With Tono AI, Mark it up also sends the one or two sentences you choose to mark, as text.

Tono asks for your permission before the first review with each choice, and you can turn reviews off, or choose differently, at any time.

#### With Tono AI

Tono AI needs an account, so that I can give each person a fair share of a service that costs money to run. How it works:

- **Your video** goes from your phone to Google, and does not pass through my service. My service only asks Google for a place to put it, and later asks Google for the review. The review also writes a short coaching note (a strength, one thing to change, and what to work on next) in the same request.
- **The text of a request** (the prompt, the note about you, the phone's measurements, and the words from Say it short, Rewind or Mark it up) does pass through my service on its way to Google, and Google's reply passes back. I do not save any of it. My service keeps only a record that a call happened (see below).
- **Google deletes the video** when the review is done. If a review fails, the video can stay at Google so a retry can reuse it, and Google removes it automatically within 48 hours at the latest.
- **I use Google's paid Gemini service.** Under Google's terms for paid use, Google does not use what you send, or its replies, to improve its products. Google does log prompts and responses for a limited period, only to detect and prevent abuse. It does not publish an exact length of time in those terms. See Google's terms for the current rules.
- **The model can change.** I choose the Gemini model on my server, and may change it without an app update.

#### With your own key

**This data goes from your phone to the provider, under your own account and key.** It does not pass through any server of mine. The provider's terms and privacy policy govern what happens to it there. Some providers keep requests for a period, and the rules can differ by plan: for example, a free-tier key may allow the provider to use your data to improve its products, while a paid key usually does not. Check the policy for the key you use. Google's Gemini service deletes uploaded files automatically after a short time (currently 48 hours).

### 2. Your Tono account (only if you use Tono AI)

You sign in with Apple or Google. Nothing else is needed, and there is no password.

What I hold about you:

- **Sign-in details:** a user ID, which sign-in method you used, the email address from your Apple or Google account (Apple may give me a private relay address instead of your real one), and the name or picture your account shares, if any. Apple and Google run the sign-in itself and tell me only that it was you.
- **Your allowance and plan:** when the account was made, how many free reviews you have used, and whether you have Tono Plus (see below).
- **A record of each Tono AI call:** when it happened, whether it was a video review or a text review, which model ran, how many tokens it used and what that cost, and whether it worked. It holds none of your video, words or results.
- **A short-lived upload record,** linking the video you are sending to your account while it is reviewed. It is removed when the review finishes, or when you delete your account.
- **A Sign in with Apple token,** if you sign in with Apple, stored encrypted and used only to cancel Apple's link to Tono when you delete your account.

My service is hosted by Supabase in the United States. Like any online service, Supabase and Google can see the connection details of a request, such as your IP address and the time. My service's own logs record errors and not your content.

I use this only to run Tono AI: to sign you in, to apply the limits, to keep the cost in check, and to find and fix problems. I do not use it for advertising or tracking.

### 3. Tono Plus purchases (once it is offered)

Tono sells nothing today. If I offer Tono Plus, a paid plan with more Tono AI reviews, it works like this:

- **Apple takes the payment.** You buy through the App Store with your Apple ID. I never see your card or other payment details.
- **RevenueCat manages the subscription.** I use RevenueCat, a subscription service, to check purchases with Apple. It receives your Tono user ID (a random ID, not your name or email), what you bought, the App Store receipt, and your device type and iOS version. It receives none of your recordings, words or scores. RevenueCat works on my behalf and stores this data in the United States.
- **Plus belongs to your account.** You need to be signed in to buy, so that Plus follows you to a new phone. RevenueCat tells my service whether you have Plus, which plan, when it ends, and whether it was a test purchase, and I store that against your account.
- **Restoring and cancelling.** "Restore purchases" asks Apple and RevenueCat to find your past purchases. You cancel in your Apple ID's subscription settings. I cannot cancel it for you, and deleting your Tono account does not cancel it.
- **Test builds.** In TestFlight builds, purchases are Apple "sandbox" purchases and do not charge you.

### 4. The speech model download

The first time you use Tono, it downloads a speech-recognition model from Hugging Face. Hugging Face can see ordinary connection information, such as your IP address, as with any download. No recording or personal data is sent.

### 5. Apple's speech recognition

Some live drills use iOS speech recognition. Where your iPhone supports it, this happens on the device. If it does not, Apple may process the audio on its servers under Apple's privacy policy.

### 6. Apple services

If you install Tono through TestFlight or the App Store, Apple handles the download, and may share crash reports or tester feedback with me if you have allowed that in iOS. Tono's reminders are scheduled on your phone; they are not push notifications from a server.

## What I do not do

- I do not store your recordings, transcripts, scores or answers on a server.
- I do not use analytics, advertising or tracking tools in the app.
- I do not sell or share your information.
- I do not see or store your payment details.
- I do not ask you to create an account, unless you want to use Tono AI.

## Keeping it and deleting it

- **Deleting a take:** when you delete a recording (a take in the Library, or a Rewind), everything about it is erased from your phone for good: the video and audio, the transcript, the word timings, the scores, the coach's and the AI review's notes, and the entries in your progress history that came from it. There is no 30-day hold and no hidden copy. You get about 8 seconds to tap Undo; the erase is finished when that passes, when you leave the app, or the next time it opens. The one thing that stays is the date: so a deleted take does not break your streak, the app keeps a bare calendar date for that day, with nothing else attached. Skill levels, stages and your path that were already worked out are not recalculated, but the deleted take counts toward nothing from then on. If the take's video was at Google for a review, Tono asks Google to delete it at the same time (Google removes it within 48 hours at the latest in any case). My service's record of an AI call holds only counts and cost, never your words or video, so it has nothing of the take in it to delete. Any copy you shared yourself, such as an exported file you sent somewhere, is outside the app and stays where you put it.
- **Freeing up space:** a separate choice that deletes only a take's video and its audio and keeps its transcript and scores. Settings can do this automatically for old videos after the number of days you choose (two "keepsake" takes, the best and the toughest of each month, keep their video).
- **Delete everything on your phone:** Settings → Your data → Reset app erases all recordings, transcripts, scores, progress and settings, and asks Google to delete any video still held for a review. Deleting the app removes all of it, including the speech model.
- **Export:** Settings → Your data lets you save a copy of your practice data.
- **Your account:** Settings → Account → Delete account removes your account and the record of your Tono AI calls, and cancels Apple's link to Tono if you used Sign in with Apple. If you had Tono Plus, it also removes your plan record and your RevenueCat record, but it does not cancel the subscription: do that in your Apple ID's subscription settings. Your recordings and history on the phone are not touched. If you cannot open the app, email me from the address on your account and I will delete it.
- **What I keep after you delete:** a one-way, keyed scrambled version of your sign-in identity, with the number of free reviews it had used. This stops someone deleting and re-creating an account to get the free reviews again. It holds no name or email address, and I cannot turn it back into either.
- **At Google or another provider:** anything sent for a review is under that provider's retention rules. With Tono AI, the video is deleted from Google as described above. With your own key, delete it through your account with that provider, or remove your key from Tono to stop further reviews.

## Your choices and rights

You can use almost all of Tono with no account. If you have an account, you can ask me what I hold about you, ask me to correct it, or ask me to delete it, and deleting it yourself in the app is the quickest way. Depending on where you live, you may have further rights over your information, such as the right to complain to a data-protection authority. Write to the address above and I will answer.

## Security

Your API key is stored in the iPhone Keychain, and reviews are sent over encrypted connections. Your data lives in the app's private storage on your phone, protected by your device's passcode and iOS. The key that lets my service use Google's Gemini lives only on my server and never on your phone. My service refuses requests that do not come from a signed-in account, and my database is locked so that nothing but my service can read it. No system is perfectly secure, so keep your phone locked.

If your device is backed up through iCloud or to a computer, your practice data may be included in that backup, under Apple's terms. The speech model is excluded from backups.

## Children

Tono is not meant for children under 13, and I do not knowingly collect information from them.

## International use

My service and RevenueCat run in the United States, and Google, and the AI providers you choose, may process data in other countries. That is governed by their policies. If you are elsewhere, using Tono AI means your account details and your reviews are handled there.

## Changes to this policy

If I change this policy, I will update the date at the top. If a change affects what is sent off your phone, Tono will ask for your permission again.

## Contact

**ahmadgrahamdev@gmail.com**

## Services you may use, and their policies

- Supabase (hosts my service): <https://supabase.com/privacy>
- RevenueCat (manages Tono Plus purchases): <https://www.revenuecat.com/privacy>
- Google: <https://policies.google.com/privacy>
- Google's Gemini API terms: <https://ai.google.dev/gemini-api/terms>
- OpenAI: <https://openai.com/policies/privacy-policy>
- Anthropic: <https://www.anthropic.com/privacy>
- OpenRouter: <https://openrouter.ai/privacy>
- Hugging Face: <https://huggingface.co/privacy>
- Apple: <https://www.apple.com/legal/privacy/>
