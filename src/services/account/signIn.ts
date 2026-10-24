import * as AppleAuthentication from "expo-apple-authentication";
import * as Crypto from "expo-crypto";
import * as WebBrowser from "expo-web-browser";
import { logger } from "../../utils/logger";
import { setTonoConsent } from "../prefs/prefsStore";
import { tonoAppleToken, tonoDeleteAccount } from "../tono/tonoApi";
import { clearAccount, getAccount, refreshAccount } from "./accountStore";
import { parseAuthCallback } from "./oauthCallback";
import { getSupabase } from "./supabaseClient";

// Signing in is optional: nobody needs it to practice, to try Tono AI or to
// buy Plus (an anonymous account does that behind the scenes). It is for
// keeping Plus and the account on another phone. When this phone already has
// the anonymous account, signing in LINKS Apple or Google to it, so nothing
// is lost. If that Apple or Google sign-in already belongs to another Tono
// account (made on another phone), this phone switches to that account.
//
// Apple is native (expo-apple-authentication); Google opens Supabase's
// sign-in in the system browser sheet and comes back by deep link. Both keep
// full token checks: Apple with a nonce, Google with PKCE.

export type SignInResult = "signedIn" | "cancelled";

// A failure the person should read, in plain words.
export class SignInError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SignInError";
  }
}

// Where the browser sends the person back. The scheme is app.config.ts's, and
// the address is on Supabase's allowed list.
export const AUTH_REDIRECT = "tono://auth/callback";

function randomNonce(): string {
  return Array.from(Crypto.getRandomBytes(16), (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function signInWithApple(): Promise<SignInResult> {
  // Apple signs the hash into its token; Supabase checks the plain value
  // against it, so a stolen token cannot be replayed.
  const raw = randomNonce();
  const hashed = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, raw);

  let credential: AppleAuthentication.AppleAuthenticationCredential;
  try {
    credential = await AppleAuthentication.signInAsync({
      requestedScopes: [AppleAuthentication.AppleAuthenticationScope.FULL_NAME, AppleAuthentication.AppleAuthenticationScope.EMAIL],
      nonce: hashed,
    });
  } catch (error) {
    if ((error as { code?: string }).code === "ERR_REQUEST_CANCELED") return "cancelled";
    throw new SignInError("Apple couldn't sign you in. Try again.");
  }
  if (!credential.identityToken) throw new SignInError("Apple didn't send a sign-in token. Try again.");

  const auth = getSupabase().auth;
  const credentials = { provider: "apple" as const, token: credential.identityToken, nonce: raw };
  let { error } = getAccount().anonymous ? await auth.linkIdentity(credentials) : await auth.signInWithIdToken(credentials);
  // Already someone's Tono account (another phone): use that one instead.
  if (error && isIdentityTaken(error)) ({ error } = await auth.signInWithIdToken(credentials));
  if (error) {
    logger.warn(`[account] Apple sign-in rejected — ${error.message}`);
    throw new SignInError("Tono couldn't verify that Apple sign-in. Try again.");
  }

  // The one-time code lets the server revoke Apple's grant if the account is
  // ever deleted. Missing it never blocks signing in; it is logged.
  if (credential.authorizationCode) {
    await tonoAppleToken(credential.authorizationCode).catch((e) => logger.warn(`[account] could not store the Apple grant — ${(e as Error).message}`));
  }
  void refreshAccount();
  return "signedIn";
}

function isIdentityTaken(error: { code?: string; message?: string }): boolean {
  return error.code === "identity_already_exists" || /already (linked|exists)/i.test(error.message ?? "");
}

export async function signInWithGoogle(): Promise<SignInResult> {
  const auth = getSupabase().auth;
  const options = { provider: "google" as const, options: { redirectTo: AUTH_REDIRECT, skipBrowserRedirect: true } };
  const link = getAccount().anonymous;
  const { data, error } = link ? await auth.linkIdentity(options) : await auth.signInWithOAuth(options);
  if (error || !data?.url) throw new SignInError("Couldn't start the Google sign-in. Try again.");

  const result = await WebBrowser.openAuthSessionAsync(data.url, AUTH_REDIRECT);
  if (result.type !== "success") return "cancelled";

  const callback = parseAuthCallback(result.url);
  // Linking failed because this Google account is already someone's Tono
  // account: sign in to that one instead.
  if (link && callback.error && /already|exists/i.test(callback.error)) {
    const again = await auth.signInWithOAuth(options);
    if (again.error || !again.data?.url) throw new SignInError("Couldn't start the Google sign-in. Try again.");
    const second = await WebBrowser.openAuthSessionAsync(again.data.url, AUTH_REDIRECT);
    if (second.type !== "success") return "cancelled";
    const code = parseAuthCallback(second.url).code;
    if (!code || (await auth.exchangeCodeForSession(code)).error) throw new SignInError("Tono couldn't finish the Google sign-in. Try again.");
    void refreshAccount();
    return "signedIn";
  }
  if (callback.error) {
    logger.warn(`[account] Google sign-in returned an error — ${callback.error}`);
    throw new SignInError("Google didn't complete the sign-in. Try again.");
  }
  if (!callback.code) throw new SignInError("Google didn't send back a sign-in code. Try again.");

  const exchanged = await auth.exchangeCodeForSession(callback.code);
  if (exchanged.error) {
    logger.warn(`[account] Google code exchange failed — ${exchanged.error.message}`);
    throw new SignInError("Tono couldn't finish the Google sign-in. Try again.");
  }
  void refreshAccount();
  return "signedIn";
}

export async function signOut(): Promise<void> {
  await getSupabase().auth.signOut({ scope: "local" }).catch((e) => logger.warn(`[account] sign-out error — ${(e as Error).message}`));
  clearAccount();
}

// Deletes the account on the server (which also revokes Apple's grant and
// removes the RevenueCat record), then forgets it here. Practice data on the
// phone is untouched, and Tono AI's consent is asked again next time.
export async function deleteAccount(): Promise<void> {
  await tonoDeleteAccount();
  setTonoConsent(false);
  await signOut();
}
