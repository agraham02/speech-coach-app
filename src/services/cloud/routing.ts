import { denialMessage } from "../../domain/aiAllowance";
import type { AnalysisContext, AnalysisKind, Producer } from "../../domain/analysis/types";
import { getAccount, refreshAccount } from "../account/accountStore";
import { getCloudProvider, getCloudReviewDefault, getJudgeInput, getRewindCloudConsent } from "../prefs/prefsStore";
import { hasConsent, hasProviderKey, PROVIDER_ORDER, PROVIDERS, type KeyProviderId } from "./providers";

// The facts routing needs, gathered from the account, the consent, the saved
// keys and the prefs. The order itself is a pure function, written once and
// tested, in domain/analysis/routing.ts.

async function readyKeyProvider(kind?: AnalysisKind): Promise<KeyProviderId | null> {
  const chosen = getCloudProvider();
  // A Rewind's words have their own consent with an own key (analysis/gate.ts).
  const consented = (id: KeyProviderId) => hasConsent(id) || (kind === "rewind_notes" && getRewindCloudConsent().includes(id));
  // Someone who picked their own provider has not asked for Tono AI.
  const candidates: KeyProviderId[] = chosen === "tono" ? PROVIDER_ORDER : [chosen];
  for (const id of candidates) {
    if ((await hasProviderKey(id)) && consented(id)) return id;
  }
  return null;
}

export interface ContextArgs {
  hasVideo: boolean;
  hasTranscript: boolean;
  // The per-take switch. Omitted: the "Review every take" default.
  takeOptIn?: boolean;
  // Ask the server once when the cached allowance says no (a new month may
  // have begun). For requests about to run, not for screens deciding a label.
  refresh?: boolean;
  forceProducer?: Producer;
  // The kind about to be asked for, where it changes what counts as ready.
  kind?: AnalysisKind;
}

export async function analysisContext(args: ContextArgs): Promise<AnalysisContext> {
  const wantsTono = getCloudProvider() === "tono";
  if (args.refresh && wantsTono) {
    const a = getAccount();
    if (a.status === "signedIn" && (!a.allowed.review || !a.allowed.text)) await refreshAccount();
  }
  const account = getAccount();
  const signedIn = wantsTono && account.status === "signedIn";
  return {
    wantsTono,
    tono: {
      signedIn,
      consent: hasConsent("tono"),
      allowed: signedIn ? account.allowed : { review: false, text: false, insight: false },
      killSwitch: account.killSwitch,
    },
    ownKey: await readyKeyProvider(args.kind),
    takeOptIn: args.takeOptIn ?? getCloudReviewDefault(),
    judgeInput: getJudgeInput(),
    hasVideo: args.hasVideo,
    hasTranscript: args.hasTranscript,
    flags: args.forceProducer ? { forceProducer: args.forceProducer } : {},
  };
}

// Why a take review cannot run, in words for the step's error line.
export async function whyNoDeepReview(): Promise<string> {
  const chosen = getCloudProvider();
  if (chosen === "tono") {
    const account = getAccount();
    if (account.status !== "signedIn") return "Sign in to use Tono AI in Settings → Deep reviews, or add your own key there.";
    if (!hasConsent("tono")) return "Deep reviews with Tono AI haven't been allowed yet — tap Get to review what's sent, or choose another provider in Settings.";
    if (account.killSwitch) return denialMessage("disabled", null);
    if (!account.allowed.review || !account.allowed.text) return `${denialMessage("quota_exhausted", account.allowance)} Add your own key in Settings → Deep reviews to keep getting reviews.`;
    return "Tono AI isn't available right now. Try again in a moment.";
  }
  const provider = PROVIDERS[chosen];
  if (!hasConsent(chosen)) return `Deep reviews with ${provider.name} haven't been allowed yet — tap Get to review what's sent, or choose a provider in Settings.`;
  return `Add a ${provider.name} key in Settings → Deep reviews to run a deep review.`;
}
