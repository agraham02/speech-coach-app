import { getJudgeInput, getShareProfileWithReviews } from "../prefs/prefsStore";

// What Tono AI is sent, in plain sentences, for the consent prompt, onboarding,
// Settings and the save screen. It must match what the code sends
// (services/analysis/inputs.ts) and docs/privacy.md.

export function whatGetsSent(): string {
  const take =
    getJudgeInput() === "video"
      ? "For each take Tono AI judges, its video (with the audio) goes to Tono's server and Google Gemini, together with your phone's transcript of it and your phone's measurements (pace, pauses, pitch, loudness, eye contact, expression). The video is deleted from Google as soon as the take is judged."
      : "For each take Tono AI judges, your phone's transcript of it (with its timing) and your phone's measurements (pace, pauses, pitch, loudness, eye contact, expression) go to Tono's server and Google Gemini, as text. The video and audio stay on your phone.";
  const about = getShareProfileWithReviews()
    ? " A short note on your goals and what gets in your way (from setup) goes with it, so the feedback fits you. You can see it and turn it off in Settings."
    : "";
  const exercises = " When you ask for notes on a Rewind or Say it short, or for marks in Mark it up, those words go the same way, as text.";
  const keeping =
    " It's used only to judge it. Tono keeps the token counts and cost, never the content. Google keeps a short-lived log for abuse checks and doesn't use it to improve its products.";
  return `${take}${about}${exercises}${keeping}`;
}
