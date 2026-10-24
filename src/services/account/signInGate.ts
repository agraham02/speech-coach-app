import { navigationRef } from "../../navigation/navigationRef";
import { getAccount } from "./accountStore";
import { isAdultNow } from "../cloud/routing";

// The one place that asks someone to sign in, in the moment they ask for
// something that needs an account (Tono AI, Tono Plus, a live conversation).
// Tono AI needs two things from a person: an account (Apple or Google) and a
// birthday, so the 18-and-over rule holds as people grow up (the sign-in
// screen asks for both; services/cloud/routing.ts reads the birthday).
//
// askToSignIn opens the sign-in screen and resolves true when both are in
// place, false when the person closes it or turns out to be under 18.

export type SignInReason = "tono_ai" | "plus" | "conversation" | "settings";

export interface SignInNeeds {
  signIn: boolean;
  birthday: boolean;
}

// What is still missing. Both false: nothing to ask.
export function signInNeeds(): SignInNeeds {
  return { signIn: getAccount().status !== "signedIn", birthday: isAdultNow() === null };
}

let pending: ((ok: boolean) => void) | null = null;

export function askToSignIn(reason: SignInReason): Promise<boolean> {
  const needs = signInNeeds();
  if (!needs.signIn && !needs.birthday) return Promise.resolve(true);
  if (!navigationRef.isReady()) return Promise.resolve(false);
  return new Promise((resolve) => {
    // A second ask while one is open ends the first as "no".
    pending?.(false);
    pending = resolve;
    navigationRef.navigate("SignIn", { reason });
  });
}

// The sign-in screen reports how it ended (it also reports `false` when it is
// closed any other way, so nothing waits forever).
export function finishSignIn(ok: boolean): void {
  const done = pending;
  pending = null;
  done?.(ok);
}
