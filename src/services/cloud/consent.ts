import { Alert } from "react-native";
import { denialMessage, nextSteps } from "../../domain/aiAllowance";
import { navigationRef } from "../../navigation/navigationRef";
import { purchasesEnabled } from "../purchases/purchases";
import { getAccount, refreshAccount } from "../account/accountStore";
import { setCloudConsent } from "../prefs/prefsStore";
import { currentProvider, hasConsent, hasProviderKey, PROVIDERS, whatGetsSent, type CloudProvider } from "./providers";

// Asks once per provider before anything is sent to it — App Review
// 5.1.2(i): say where personal data goes (including third-party AI) and get
// explicit permission first.
export function askCloudConsent(provider: CloudProvider): Promise<boolean> {
  const body =
    provider.id === "tono"
      ? `${whatGetsSent(provider)} Tono's Google account is on Google's paid tier, where what you send isn't used to improve Google's products. You can turn this off any time in Settings → Deep reviews.`
      : `${whatGetsSent(provider)} It's billed to your own ${provider.name} key, and ${provider.company}'s terms and privacy policy cover what you send. It doesn't go through any server of ours.`;
  return new Promise((resolve) => {
    Alert.alert(
      provider.id === "tono" ? "Send your takes to Tono AI?" : `Send your take to ${provider.company}?`,
      body,
      [
        { text: "Not now", style: "cancel", onPress: () => resolve(false) },
        {
          text: "Allow",
          onPress: () => {
            setCloudConsent(provider.id, true);
            resolve(true);
          },
        },
      ],
      { cancelable: true, onDismiss: () => resolve(false) },
    );
  });
}

// Tono AI needs an account with something left, then the person's permission.
async function readyForTono(openSettings: () => void): Promise<boolean> {
  const account = getAccount();
  if (account.status !== "signedIn") {
    Alert.alert("Sign in to use Tono AI", "Tono AI reviews your takes and fits your plan to them. Sign in with Apple or Google in Settings. It takes a few seconds, and you can use your own key instead.", [
      { text: "Not now", style: "cancel" },
      { text: "Open Settings", onPress: openSettings },
    ]);
    return false;
  }
  // A "no reviews left" from earlier may be out of date (a new month began):
  // ask the server once before saying no.
  if (!account.allowed.review) await refreshAccount();
  if (!getAccount().allowed.review) {
    const steps = nextSteps("quota_exhausted", getAccount().allowance?.plan ?? "free").filter((s) => purchasesEnabled() || s !== "get_plus");
    const buttons = [
      { text: "Not now", style: "cancel" as const },
      ...(steps.includes("get_plus") ? [{ text: "Get Tono Plus", onPress: () => {
            if (navigationRef.isReady()) navigationRef.navigate("Paywall");
          } }] : []),
      ...(steps.includes("own_key") ? [{ text: steps.includes("get_plus") ? "Use my own key" : "Open Settings", onPress: openSettings }] : []),
    ];
    Alert.alert(
      denialMessage("quota_exhausted", getAccount().allowance),
      steps.includes("get_plus")
        ? "Everything on your phone still works. For more AI reviews, get Tono Plus or add your own key."
        : steps.includes("own_key")
          ? "Everything on your phone still works. To keep getting AI reviews, add your own key in Settings."
          : "Everything on your phone still works.",
      buttons,
    );
    return false;
  }
  if (hasConsent("tono")) return true;
  return askCloudConsent(PROVIDERS.tono);
}

// Every deep-review entry point calls this first: the chosen provider must be
// ready (Tono AI: signed in with reviews left; otherwise a key), then consent.
// Resolves true when it's OK to go ahead.
export async function readyForDeepReview(openSettings: () => void): Promise<boolean> {
  const provider = currentProvider();
  if (provider.id === "tono") return readyForTono(openSettings);
  if (!(await hasProviderKey(provider.id))) {
    Alert.alert(
      "Add an API key first",
      `Deep reviews with ${provider.name} use your own AI key. Add a ${provider.name} key — or choose another provider — in Settings.`,
      [
        { text: "Not now", style: "cancel" },
        { text: "Open Settings", onPress: openSettings },
      ],
    );
    return false;
  }
  if (hasConsent(provider.id)) return true;
  return askCloudConsent(provider);
}
