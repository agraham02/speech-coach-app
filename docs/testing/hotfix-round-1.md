# Hotfix round 1: what to check on a phone

Branch `fix/hotfix-round-1`. Nothing below could be run without a device, so each item says what should happen. Tick them and write what you saw.

## Before testing: server setup (once)

- [ ] Run `supabase/migrations/20261025000000_dev_override.sql` in the SQL editor.
- [ ] Add the function secret `DEV_OVERRIDE_PASSWORD` (a long password only you know).
- [ ] Supabase → Authentication → Sign In / Providers: turn **Allow anonymous sign-ins OFF**.
- [ ] Deploy: `npx supabase functions deploy --use-api` (new: `dev-override`; changed: `ai-converse`, `ai-generate`, `me`, and everything that uses `requireUser`).
- [ ] A new build (the app changed: new SignIn screen, birthday step).
- [ ] Republish the privacy and terms pages (`docs/privacy.md`, `docs/terms.md` changed: sign-in is now needed for Tono AI and Plus).

## A. Back buttons and the edge swipe

- [ ] **Result and Preview have a back button.** Open a take's Result: a chevron at the top left goes back (to History, the daily session, wherever you came from). On Preview ("Review your take") the chevron asks "Discard this take?" first.
- [ ] **Scrubbing no longer goes back (iPhone).** On a take's Overview, listen pass: drag the playback bar all the way to the left end and back. The page must not slide away. Same on the Scores tab's player bar.
- [ ] **Charts (iPhone).** On the Scores tab, drag across a chart starting at its left edge and its right edge. Nothing should half-scrub while the screen slides. A drag starting inside the plot scrubs as before. The edge swipe from the very edge still goes back.
- [ ] **Android.** Same two checks with the back gesture from either edge.

## B. Play from here

- [ ] Scores tab → drag on the Pace chart → "Play from here". You stay on Scores, sound starts at that moment, an accent line with a dot moves along every chart, and a bar appears at the bottom (play/pause, scrub bar, close).
- [ ] While it plays, the line above the chart shows the reading at the moving line (pace, pitch, loudness).
- [ ] Zoom a chart in, play: when the line runs off the right edge the charts turn the page.
- [ ] Drag the bar to seek: the line follows. Close (X) stops the sound and hides the bar. Switching to Overview stops the sound.

## C. The Overview settling

- [ ] Record a take and open its Result while analysis runs. Scroll down to the video, wait: when the score and the summary land above you, what you are looking at must not jump.
- [ ] A pill ("Your score is ready", pointing up) appears when the score landed while you were scrolled away; tapping it scrolls to the top; it goes away once the score is on screen or after 10 seconds.
- [ ] Open an impromptu take's Result and scroll past the "Your progress" card before it finishes. The beats stay hidden (the card holds its space), a pill ("See what this moved") appears, and the animation plays when you scroll the card into view. If you leave before seeing it, Today still offers it.
- [ ] If you stay at the top, the progress animation plays by itself as before.

## D. Sign-in, birthday and Tono AI

- [ ] **Signed out, ask for Tono AI.** On a take's save screen turn on "Have Tono AI judge this take" (or tap "Get notes" on a Result): the sign-in sheet opens. With no birthday it asks for one first, then shows Apple/Google. After both, the sheet closes and the consent alert follows.
- [ ] **Under 18.** Enter a birthday under 18: the sheet says Tono AI is for 18 and over, shows no sign-in buttons, and Settings → Tono AI shows the under-18 note. Changing the birthday in Settings → Account & Plus re-opens it.
- [ ] **No "anonymous" error any more.** Signed out, nothing tries to make an anonymous account. An old anonymous session on the phone is dropped at launch (you see "Not signed in").
- [ ] **A previous video.** Signed in, open an older take and run "Tono AI review" from its steps. It either completes or shows a specific reason. If it fails, copy the line from Dev → Logs (tag `[result]`/`[analysis]`) and send it: the error now carries Google's own message.
- [ ] **Plus.** Tap "See Tono Plus" → subscribe while signed out: the sign-in sheet opens first; closing it cancels quietly with no charge.
- [ ] **Live conversation** signed out: Start opens the sign-in sheet; after signing in the conversation starts (or says why not).
- [ ] **Free allowance follows the account.** Delete and reinstall, sign in again: the free judged take for the month is still used, not new.

## E. Developer password and the limits override

- [ ] In a preview/TestFlight build, the Dev tab shows only a password box. A wrong password says "That's not the password." (after a 1.5 s wait).
- [ ] The right password (signed in) opens the Dev tab. The "Tono AI limits" card says "Override on". Judged takes, text calls and conversation minutes now ignore their counts; Settings shows 999.
- [ ] "Back to normal limits" returns the real counts and locks the Dev tab again. It also switches itself off after 6 hours.
- [ ] A phone with another account never sees the override.
- [ ] Signed out, the Dev tab's Unlock opens the sign-in sheet first.

## F. Partner voices lab

- [ ] Dev → Partner voices → Play line. "Last play" now shows `pieces N` (audio pieces that reached the phone). If you hear nothing:
  - `pieces 0` and an error line: send the error (it carries Google's message: a wrong model name, a refused setting, a quota).
  - `pieces N` but no sound: it is the phone's audio session. Switch "iPhone audio session" to "Playback only" and play again, and check the ringer switch and volume. Tell me which worked.
- [ ] Partner turn: the earlier "failed: upstream_failed" now shows Google's reason. The conversation line also retries on the other model by itself, and a refused thinking setting is dropped and retried.

## G. Path finale

- [ ] Dev → App tools (or finish a path): open the finale. Under the opening line there is **Your journey**: how long ago you started, takes, drills, practice days and best streak; tiles for those; "Where you started, and where you are" (each skill's stage from the skill check to now, speaker level, and the skill that moved most); "Your voice, take by take" (first scored take against your latest five, measured with the same formula); and links to your first and best takes.
- [ ] On a phone with little history it shows only what exists and nothing broken.
