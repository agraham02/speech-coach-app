import type { KeyProviderId } from "../services/cloud/providers";

// Which AI does each feature use? Pure, so the order is written down once and
// tested: Tono AI first, then the user's own key, then the phone. Any failure
// or limit falls through to the next, so a take is never blocked.

export type AiFeature =
  | "video_review" // the deep review of a take's video
  | "coaching" // strength, tip, focus skill and follow-up on a take
  | "summary_notes" // Say it short
  | "rewind_notes"
  | "mark_up" // auto-mark a script
  | "insight"; // progress report, Then vs now (Tono Plus)

export type AiRoute = "tono" | "own_key" | "on_device" | "none";

// Where a take's coaching comes from.
export type CoachingSource = "from_review" | "text_call" | "on_device";

export interface TonoAvailability {
  signedIn: boolean;
  // The single "tono" consent from onboarding.
  consent: boolean;
  // From the last known allowance (the server has the final say). Unknown counts as true.
  allowed: { review: boolean; text: boolean; insight: boolean };
}

export interface RouteState {
  // The "Review every take" switch, or the switch on this take's save screen.
  cloudReviewOn: boolean;
  hasVideo: boolean;
  tono: TonoAvailability;
  // A bring-your-own-key provider that has a key AND the user's consent.
  ownKeyProvider: KeyProviderId | null;
}

function tonoReady(s: RouteState, kind: keyof TonoAvailability["allowed"]): boolean {
  return s.cloudReviewOn && s.tono.signedIn && s.tono.consent && s.tono.allowed[kind];
}

// The route for one feature. "none" means the feature has no on-device
// version (a video review or an insight), so the caller shows nothing.
export function routeFor(feature: AiFeature, s: RouteState): AiRoute {
  switch (feature) {
    case "insight":
      return tonoReady(s, "insight") ? "tono" : "none";

    case "video_review":
      if (!s.hasVideo) return s.ownKeyProvider && s.ownKeyProvider !== "gemini" ? "own_key" : "none";
      if (tonoReady(s, "review")) return "tono";
      return s.cloudReviewOn && s.ownKeyProvider ? "own_key" : "none";

    case "coaching":
      // Coaching is part of a Tono video review, so the review route decides.
      if (routeFor("video_review", s) === "tono") return "tono";
      return tonoReady(s, "text") ? "tono" : "on_device";

    case "summary_notes":
    case "rewind_notes":
      if (tonoReady(s, "text")) return "tono";
      return s.cloudReviewOn && s.ownKeyProvider ? "own_key" : "on_device";

    case "mark_up":
      // Only Tono AI and the phone mark up a script; own-key providers never did.
      return tonoReady(s, "text") ? "tono" : "on_device";
  }
}

export function coachingSource(s: RouteState): CoachingSource {
  if (routeFor("video_review", s) === "tono") return "from_review";
  return tonoReady(s, "text") ? "text_call" : "on_device";
}
