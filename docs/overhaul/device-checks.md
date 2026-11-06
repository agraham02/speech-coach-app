# iPhone checks

Only the owner can run these. A phase stays open until its checks here have results. Tick each one and write what you saw.

The first three sections are carried over from the hotfix round (the old `hotfix-round-1.md`). They cover things the overhaul doesn't change, so they stay valid. The hotfix checks for screens the overhaul replaces (the Scores tab charts, Play from here, the Overview settling, the Path finale) were dropped, and their lasting parts are in the Phase 6 section.

## Before any phone testing: server setup (once)

- [ ] Run `supabase/migrations/20261025000000_dev_override.sql` in the SQL editor.
- [ ] Add the function secret `DEV_OVERRIDE_PASSWORD` (a long password only you know).
- [ ] Supabase → Authentication → Sign In / Providers: turn **Allow anonymous sign-ins OFF**.
- [ ] Deploy: `npx supabase functions deploy --use-api` (new: `dev-override`; changed: `ai-converse`, `ai-generate`, `me`, and everything that uses `requireUser`).
- [ ] A new build (the app changed: new SignIn screen, birthday step).
- [ ] Republish the privacy and terms pages (`docs/privacy.md`, `docs/terms.md`): sign-in is now needed for Tono AI and Plus, and the privacy text no longer mentions anonymous accounts or an age range.

## Sign-in, birthday and Tono AI

- [ ] **Signed out, ask for Tono AI.** On a take's save screen turn on "Have Tono AI judge this take" (or tap "Get notes" on a Result): the sign-in sheet opens. With no birthday it asks for one first, then shows Apple/Google. After both, the sheet closes and the consent alert follows.
- [ ] **Under 18.** Enter a birthday under 18: the sheet says Tono AI is for 18 and over, shows no sign-in buttons, and Settings → Tono AI shows the under-18 note. Changing the birthday in Settings → Account & Plus re-opens it.
- [ ] **No "anonymous" error any more.** Signed out, nothing tries to make an anonymous account. An old anonymous session on the phone is dropped at launch (you see "Not signed in").
- [ ] **A previous video.** Signed in, open an older take and run "Tono AI review" from its steps. It either completes or shows a specific reason. If it fails, copy the line from Dev → Logs (tag `[result]`/`[analysis]`) and send it: the error now carries Google's own message.
- [ ] **Plus.** Tap "See Tono Plus" → subscribe while signed out: the sign-in sheet opens first; closing it cancels quietly with no charge.
- [ ] **Live conversation** signed out: Start opens the sign-in sheet; after signing in the conversation starts (or says why not).
- [ ] **Free allowance follows the account.** Delete and reinstall, sign in again: the free judged take for the month is still used, not new.

## Developer password and the limits override

- [ ] In a preview/TestFlight build, the Dev tab shows only a password box. A wrong password says "That's not the password." (after a 1.5 s wait).
- [ ] The right password (signed in) opens the Dev tab. The "Tono AI limits" card says "Override on". Judged takes, text calls and conversation minutes now ignore their counts; Settings shows 999.
- [ ] "Back to normal limits" returns the real counts and locks the Dev tab again. It also switches itself off after 6 hours.
- [ ] A phone with another account never sees the override.
- [ ] Signed out, the Dev tab's Unlock opens the sign-in sheet first.

## Partner voices lab

- [ ] Dev → Partner voices → Play line. "Last play" shows `pieces N` (audio pieces that reached the phone). If you hear nothing:
  - `pieces 0` and an error line: send the error (it carries Google's message: a wrong model name, a refused setting, a quota).
  - `pieces N` but no sound: it is the phone's audio session. Switch "iPhone audio session" to "Playback only" and play again, and check the ringer switch and volume. Tell me which worked.
- [ ] Partner turn: a failure shows Google's reason. The conversation line also retries on the other model by itself, and a refused thinking setting is dropped and retried.

## Phase 0: bug fixes

Added when phase 0 is built.

## Phase 6: results flow

Carried over from the hotfix round. These were fixes for gestures on the old screens, and they can come back when the screens are rebuilt.

- [ ] **Back button.** The new Review and Result screens have a chevron at the top left that goes back to where you came from. On the save screen ("Review your take") it asks "Discard this take?" first.
- [ ] **Scrubbing never goes back (iPhone).** Drag the playback bar all the way to the left end and back, on each pass. The page must not slide away.
- [ ] **Charts and the by-phrase strip (iPhone).** A drag that starts inside the strip selects and scrubs without half-moving the screen. The edge swipe from the very edge still goes back.
- [ ] **Android.** Same checks with the back gesture from either edge.
