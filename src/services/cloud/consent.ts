import { Alert } from "react-native";
import { denialMessage, usedUpLine } from "../../domain/aiAllowance";
import { navigationRef } from "../../navigation/navigationRef";
import { purchasesEnabled } from "../purchases/purchases";
import { ensureAccount, getAccount, refreshAccount } from "../account/accountStore";
import { hasTonoConsent, setTonoConsent } from "../prefs/prefsStore";
import { whatGetsSent } from "./disclosure";
import { tonoAgeGated } from "./routing";

// Asks once before anything is sent to Tono AI: App Review 5.1.2(i) wants the
// app to say where personal data goes (including a third-party AI) and get
// explicit permission first. Allowing it also makes the behind-the-scenes
// account (no sign-in), so the free judged take can be counted.
export function askTonoConsent(): Promise<boolean> {
  return new Promise((resolve) => {
    Alert.alert(
      "Let Tono AI judge your takes?",
      `${whatGetsSent()} You can turn it off any time in Settings → Tono AI, or for one take on its save screen.`,
      [
        { text: "Not now", style: "cancel", onPress: () => resolve(false) },
        {
          text: "Allow",
          onPress: () => {
            setTonoConsent(true);
            void ensureAccount().catch(() => undefined);
            resolve(true);
          },
        },
      ],
      { cancelable: true, onDismiss: () => resolve(false) },
    );
  });
}

export function openPaywall(): void {
  if (navigationRef.isReady()) navigationRef.navigate("Paywall");
}

// A quiet offer of Plus, only where Plus is actually for sale. Otherwise just
// the explanation: the free path is never a dead end.
export function offerPlus(title: string, message: string): void {
  if (!purchasesEnabled()) {
    Alert.alert(title, message);
    return;
  }
  Alert.alert(title, message, [
    { text: "Not now", style: "cancel" },
    { text: "See Tono Plus", onPress: openPaywall },
  ]);
}

// What has to be true before a judged analysis is asked for on someone's
// behalf, asked in the moment when it isn't. `exercise`: notes on a Rewind or
// Say it short, or AI marks, which are Plus (and trial) features. Resolves
// true when it's fine to go ahead.
export async function readyForTono(options: { exercise: boolean }): Promise<boolean> {
  if (tonoAgeGated()) {
    Alert.alert("Tono AI is for 18 and over", "Everything your phone measures, and its tips, work as always.");
    return false;
  }
  // Asked for by the person (a button, a switch): an account is worth making
  // now, so their real tier is known (a TestFlight tester has exercise notes
  // without Plus). Making it sends nothing about them.
  if (getAccount().status !== "signedIn") {
    try {
      await ensureAccount();
    } catch {
      Alert.alert("Couldn't reach Tono AI", "Check your connection and try again. Your phone's measurements and tips work offline.");
      return false;
    }
  }
  const account = getAccount();
  if (account.killSwitch) {
    Alert.alert(denialMessage("disabled", null), "Your phone's measurements and tips still work.");
    return false;
  }
  if (options.exercise && (account.allowance?.tier ?? "free") === "free") {
    offerPlus("Notes from Tono AI are part of Plus", "Your counts and tips from the phone are here as always. Tono Plus adds notes on what you said.");
    return false;
  }
  // A "nothing left" from earlier may be out of date (a new month began):
  // ask the server once before saying no.
  const count = options.exercise ? "text" : "take";
  if (!account.allowed[count]) await refreshAccount();
  const now = getAccount();
  if (!now.allowed[count]) {
    const allowance = now.allowance;
    const paying = allowance?.plan === "plus" || allowance?.plan === "trial";
    const message = allowance ? usedUpLine(allowance) : "Your phone's measurements and tips are here as always.";
    if (paying) Alert.alert(denialMessage("quota_exhausted", allowance), message);
    else offerPlus(denialMessage("quota_exhausted", allowance), message);
    return false;
  }
  if (hasTonoConsent()) return true;
  return askTonoConsent();
}
