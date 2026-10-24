import { denialMessage, usedUpLine } from "../../domain/aiAllowance";
import { ageGated } from "../../domain/analysis/routing";
import type { AnalysisContext, AnalysisKind, Producer, Unavailable } from "../../domain/analysis/types";
import { isAdultFromAge } from "../../domain/profile";
import { getAccount, refreshAccount } from "../account/accountStore";
import { getCloudReviewDefault, getJudgeInput, getUserProfile, hasTonoConsent } from "../prefs/prefsStore";

// The facts routing needs, gathered from the account, the consent, the age
// answer and the prefs. The order itself is a pure function, written once and
// tested, in domain/analysis/routing.ts.

export interface ContextArgs {
  hasVideo: boolean;
  hasTranscript: boolean;
  // The per-take switch. Omitted: the "Have Tono AI judge every take" default.
  takeOptIn?: boolean;
  // Ask the server once when the cached allowance says no (a new month may
  // have begun). For requests about to run, not for screens deciding a label.
  refresh?: boolean;
  forceProducer?: Producer;
  // The kind about to be asked for.
  kind?: AnalysisKind;
}

export async function analysisContext(args: ContextArgs): Promise<AnalysisContext> {
  if (args.refresh) {
    const a = getAccount();
    if (a.status === "signedIn" && (!a.allowed.take || !a.allowed.text)) await refreshAccount();
  }
  const account = getAccount();
  return {
    tier: account.allowance?.tier ?? "free",
    tono: {
      consent: hasTonoConsent(),
      allowed: account.allowed,
      killSwitch: account.killSwitch,
    },
    isAdult: isAdultFromAge(getUserProfile()?.ageRange),
    minorsMayUseAi: account.minorsMayUseAi,
    takeOptIn: args.takeOptIn ?? getCloudReviewDefault(),
    judgeInput: getJudgeInput(),
    hasVideo: args.hasVideo,
    hasTranscript: args.hasTranscript,
    flags: args.forceProducer ? { forceProducer: args.forceProducer } : {},
  };
}

// Whether Tono AI is off for this person because of the age answer.
export function tonoAgeGated(): boolean {
  return ageGated({ isAdult: isAdultFromAge(getUserProfile()?.ageRange), minorsMayUseAi: getAccount().minorsMayUseAi });
}

// Why a take wasn't judged, in words for the step's line. Never alarming:
// the take's measurements and tips are there either way.
export function whyNotJudged(reason: Unavailable): string {
  const account = getAccount();
  switch (reason) {
    case "no_consent":
      return "Tono AI hasn't been allowed yet. Turn it on in Settings → Tono AI.";
    case "age_gate":
      return "Tono AI is for people 18 and over, so this take stays on your phone.";
    case "kill_switch":
      return denialMessage("disabled", null);
    case "quota":
    case "not_entitled":
      return account.allowance ? usedUpLine(account.allowance) : denialMessage("quota_exhausted", null);
    case "cost_cap":
      return denialMessage("plus_cost_cap", account.allowance);
    case "budget_paused":
      return denialMessage("budget_paused", account.allowance);
    case "offline":
      return "You're offline. It will be judged when you're back online.";
    case "signed_out":
      return "Couldn't reach your Tono account. Check your connection and try again.";
    case "no_input":
      return "There's no transcript and no video to judge.";
    default:
      return "Tono AI isn't available right now. Try again in a moment.";
  }
}
