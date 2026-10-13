import { buildSpeakerContext } from "../../domain/reviewerContext";
import { getShareProfileWithReviews, getUserProfile } from "../prefs/prefsStore";
import { todayISODate } from "../../utils/dateUtils";

// The note about the speaker added to a deep review's prompt: what they
// answered in onboarding, unless they've turned that off. Empty when there's
// nothing to say.
export function speakerContextForReview(): string {
  if (!getShareProfileWithReviews()) return "";
  return buildSpeakerContext(getUserProfile(), todayISODate());
}
