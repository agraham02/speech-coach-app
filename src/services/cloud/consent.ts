import { Alert } from "react-native";
import { setCloudConsent } from "../prefs/prefsStore";
import { currentProvider, hasConsent, hasProviderKey, whatGetsSent, type CloudProvider } from "./providers";

// Asks once per provider before anything is sent to it — App Review
// 5.1.2(i): say where personal data goes (including third-party AI) and get
// explicit permission first.
export function askCloudConsent(provider: CloudProvider): Promise<boolean> {
  return new Promise((resolve) => {
    Alert.alert(
      `Send your take to ${provider.company}?`,
      `${whatGetsSent(provider)} It's billed to your own ${provider.name} key, and ${provider.company}'s terms and privacy policy cover what you send. It doesn't go through any server of ours.`,
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

// Every deep-review entry point calls this first: a key for the chosen
// provider (else offer Settings), then consent. Resolves true when it's OK
// to go ahead.
export async function readyForDeepReview(openSettings: () => void): Promise<boolean> {
  const provider = currentProvider();
  if (!(await hasProviderKey(provider.id))) {
    Alert.alert(
      "Add an API key first",
      `Deep reviews use your own AI key, so the app stays free. Add a ${provider.name} key — or choose another provider — in Settings.`,
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
