// Where beta testers send feedback (a Google Form). The Settings row only
// shows once this is set, so an empty value never opens a dead link.
export const FEEDBACK_URL = "https://forms.gle/ZkgirYMoxiePcjMh7";

// Flip to true once Tono is on the App Store. Apple's rating sheet doesn't
// appear in TestFlight builds, so until then "Great" in the feedback prompt
// asks what's working instead of asking for a rating.
export const STORE_REVIEW_LIVE = false;
