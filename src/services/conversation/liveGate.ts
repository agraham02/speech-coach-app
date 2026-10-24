import { Alert } from "react-native";
import { conversationMinutesLine } from "../../domain/aiAllowance";
import { liveConversationGate } from "../../domain/analysis/routing";
import type { Unavailable } from "../../domain/analysis/types";
import { isAdultFromAge } from "../../domain/profile";
import { ensureAccount, getAccount, refreshAccount } from "../account/accountStore";
import { askTonoConsent } from "../cloud/consent";
import { getUserProfile, hasTonoConsent } from "../prefs/prefsStore";

// Whether the live conversation can run for this person, from what the phone
// already knows (no server call), and the one place that asks in the moment
// (consent, a fresh look at the minutes) before starting one.

export type LiveGate = { open: true } | { open: false; reason: Unavailable; locked: boolean };

export function liveGateNow(): LiveGate {
  const account = getAccount();
  const a = account.allowance;
  // Before there is an account the tier isn't known; in beta mode (TestFlight)
  // a tester has minutes without Plus, so the screen lets them try and the
  // start button finds out.
  const tier = a?.tier ?? (account.mode === "beta" ? "beta" : "free");
  return liveConversationGate(
    {
      tier,
      tono: { consent: hasTonoConsent(), allowed: account.allowed, killSwitch: account.killSwitch },
      isAdult: isAdultFromAge(getUserProfile()?.ageRange),
      minorsMayUseAi: account.minorsMayUseAi,
    },
    { total: a?.conversationMinutesTotal ?? null, left: a?.conversationMinutesLeft ?? null },
  );
}

// Plain words for a gate that is shut and not "locked" (a locked one shows
// the Plus line instead).
export function whyNoLiveConversation(reason: Unavailable): string {
  switch (reason) {
    case "age_gate":
      return "Live conversation uses Tono AI, which is for 18 and over. The drills in this lesson work as always.";
    case "kill_switch":
      return "Live conversation is switched off for a moment. Try again soon.";
    case "quota":
      return conversationMinutesLine(getAccount().allowance) || "You've used this month's conversation minutes.";
    case "offline":
      return "Live conversation needs a connection. The drills in this lesson work offline.";
    default:
      return "Live conversation isn't available right now.";
  }
}

// Before starting: make sure there's an account (made behind the scenes),
// the minutes are current, and Tono AI is allowed. Resolves true to go ahead.
export async function readyForLiveConversation(): Promise<LiveGate> {
  if (getAccount().status !== "signedIn") {
    try {
      await ensureAccount();
    } catch {
      return { open: false, reason: "offline", locked: false };
    }
  } else {
    await refreshAccount().catch(() => undefined);
  }
  const gate = liveGateNow();
  if (gate.open) return gate;
  if (gate.reason !== "no_consent") return gate;
  const allowed = await askTonoConsent();
  if (!allowed) return gate;
  return liveGateNow();
}

export function alertGate(gate: Extract<LiveGate, { open: false }>): void {
  if (gate.reason === "no_consent") return;
  Alert.alert("Live conversation", whyNoLiveConversation(gate.reason));
}
