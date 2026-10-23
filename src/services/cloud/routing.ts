import { SIGNED_OUT, tonoAvailability } from "../../domain/account";
import { denialMessage } from "../../domain/aiAllowance";
import { routeFor, type AiFeature, type RouteState } from "../../domain/aiRouting";
import { getAccount } from "../account/accountStore";
import { getCloudProvider, getCloudReviewDefault } from "../prefs/prefsStore";
import { hasConsent, hasProviderKey, PROVIDER_ORDER, PROVIDERS, type CloudProvider, type KeyProviderId } from "./providers";

// Which AI handles a request, from the live state of the account, the consent
// and the saved keys. The order itself is written once, and tested, in
// domain/aiRouting.ts; this only gathers the facts.

// "hosted" goes through Tono's server; "direct" is the person's own key.
export type Transport = "hosted" | "direct";

export interface ResolvedProvider {
  provider: CloudProvider;
  transport: Transport;
}

async function readyKeyProvider(): Promise<KeyProviderId | null> {
  const chosen = getCloudProvider();
  // Someone who picked their own provider has not asked for Tono AI.
  const candidates: KeyProviderId[] = chosen === "tono" ? PROVIDER_ORDER : [chosen];
  for (const id of candidates) {
    if ((await hasProviderKey(id)) && hasConsent(id)) return id;
  }
  return null;
}

// `cloudReviewOn`: the "Review every take" switch for background features. A
// deep review that is already queued was wanted, so its step passes true.
export async function routeState(args: { hasVideo: boolean; cloudReviewOn?: boolean }): Promise<RouteState> {
  const wantsTono = getCloudProvider() === "tono";
  return {
    cloudReviewOn: args.cloudReviewOn ?? getCloudReviewDefault(),
    hasVideo: args.hasVideo,
    tono: tonoAvailability(wantsTono ? getAccount() : SIGNED_OUT, hasConsent("tono")),
    ownKeyProvider: await readyKeyProvider(),
  };
}

// The provider (and how to reach it) for a feature, or null when nothing
// off-phone should run for it.
export async function providerFor(feature: AiFeature, args: { hasVideo: boolean; cloudReviewOn?: boolean }): Promise<ResolvedProvider | null> {
  const state = await routeState(args);
  const route = routeFor(feature, state);
  if (route === "tono") return { provider: PROVIDERS.tono, transport: "hosted" };
  if (route === "own_key" && state.ownKeyProvider) return { provider: PROVIDERS[state.ownKeyProvider], transport: "direct" };
  return null;
}

// Why a deep review cannot run, in words for the step's error line.
export async function whyNoDeepReview(): Promise<string> {
  const chosen = getCloudProvider();
  if (chosen === "tono") {
    const account = getAccount();
    if (account.status !== "signedIn") return "Sign in to use Tono AI in Settings → Deep reviews, or add your own key there.";
    if (!hasConsent("tono")) return "Deep reviews with Tono AI haven't been allowed yet — tap Get to review what's sent, or choose another provider in Settings.";
    if (!account.allowed.review) return `${denialMessage("quota_exhausted", account.allowance)} Add your own key in Settings → Deep reviews to keep getting reviews.`;
    if (account.killSwitch) return denialMessage("disabled", null);
    return "Tono AI isn't available right now. Try again in a moment.";
  }
  const provider = PROVIDERS[chosen];
  if (!hasConsent(chosen)) return `Deep reviews with ${provider.name} haven't been allowed yet — tap Get to review what's sent, or choose a provider in Settings.`;
  return `Add a ${provider.name} key in Settings → Deep reviews to run a deep review.`;
}
