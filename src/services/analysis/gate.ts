import { Alert } from "react-native";
import type { AnalysisKind } from "../../domain/analysis/types";
import { getAccount } from "../account/accountStore";
import { askCloudConsent, readyForDeepReview } from "../cloud/consent";
import { currentProvider, hasConsent, hasProviderKey, PROVIDERS, type CloudProvider } from "../cloud/providers";
import { getRewindCloudConsent, setRewindCloudConsent } from "../prefs/prefsStore";

// What has to be true before a judged analysis is asked for on someone's
// behalf, asked in the moment when it isn't (sign in, allow sending, add a
// key). App Review 5.1.2(i): say where the data goes and get permission first.
// Resolves true when it's fine to go ahead. The AnalysisService itself never
// asks anything; this is the one place that does.

// A Rewind sends only its words, so with an own key it has its own consent,
// separate from the deep-review one (which for Gemini covers video).
function askRewindCloudConsent(provider: CloudProvider): Promise<boolean> {
  return new Promise((resolve) => {
    Alert.alert(
      `Send this transcript to ${provider.company}?`,
      `Only the words of this Rewind are sent to ${provider.company} for notes — no audio or video. It's billed to your own ${provider.name} key, and ${provider.company}'s terms and privacy policy cover what you send. It doesn't go through any server of ours.`,
      [
        { text: "Not now", style: "cancel", onPress: () => resolve(false) },
        {
          text: "Allow",
          onPress: () => {
            setRewindCloudConsent(provider.id);
            resolve(true);
          },
        },
      ],
      { cancelable: true, onDismiss: () => resolve(false) },
    );
  });
}

export async function prepareFor(kind: AnalysisKind, openSettings: () => void): Promise<boolean> {
  if (kind === "take_review") return readyForDeepReview(openSettings);
  const provider = currentProvider();
  if (provider.id === "tono") {
    if (getAccount().status !== "signedIn") {
      Alert.alert("Sign in to use Tono AI", "Notes from Tono AI need an account. Sign in with Apple or Google in Settings → Deep reviews.", [
        { text: "Not now", style: "cancel" },
        { text: "Open Settings", onPress: openSettings },
      ]);
      return false;
    }
    return hasConsent("tono") || askCloudConsent(PROVIDERS.tono);
  }
  if (!(await hasProviderKey(provider.id))) {
    Alert.alert("Add an API key first", `Notes from the cloud use your own AI key. Add a ${provider.name} key in Settings → Deep reviews.`, [
      { text: "Not now", style: "cancel" },
      { text: "Open Settings", onPress: openSettings },
    ]);
    return false;
  }
  if (kind === "rewind_notes") return getRewindCloudConsent().includes(provider.id) || askRewindCloudConsent(provider);
  return hasConsent(provider.id) || askCloudConsent(provider);
}
