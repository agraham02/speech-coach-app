import type { AccountSnapshot } from "../../domain/account";
import { ensureAccount, refreshAccount } from "../account/accountStore";
import { TonoApiError, tonoDevOverride } from "../tono/tonoApi";

// Who may open the Dev tab, and the developer's Tono AI limits override.
//
// Preview and TestFlight builds carry the Dev tab (so the developer can test
// on a real phone), which means every tester would see it. So in those builds
// it is locked until the developer's password is given. The password is
// checked by the server (supabase/functions/dev-override), never in the app,
// and switching it on also lifts every Tono AI limit for that account for a
// few hours: the same step opens the tab and lets the limits be tested. The
// server reports it back in the allowance, so this file keeps no copy of it.

// A development build (Metro) opens the Dev tab without a password; the
// limits override still needs one.
export function devTabOpen(account: AccountSnapshot): boolean {
  return __DEV__ || account.allowance?.devOverride === true;
}

export function overrideOn(account: AccountSnapshot): boolean {
  return account.allowance?.devOverride === true;
}

// Plain words for a failure.
export function describeOverrideError(error: unknown): string {
  if (error instanceof TonoApiError) {
    if (error.code === "wrong_password") return "That's not the password.";
    if (error.code === "not_available") return "The override isn't switched on for this server.";
    if (error.code === "sign_in_required" || error.code === "signed_out") return "Sign in first (Settings → Account).";
  }
  return "Couldn't reach the server. Try again.";
}

export async function turnOverrideOn(password: string): Promise<void> {
  await ensureAccount();
  await tonoDevOverride({ password });
  await refreshAccount();
}

export async function turnOverrideOff(): Promise<void> {
  await ensureAccount();
  await tonoDevOverride({ off: true });
  await refreshAccount();
}
