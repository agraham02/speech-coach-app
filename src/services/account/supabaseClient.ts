// Must run before supabase-js: it wants the standard URL classes, which
// Hermes only partly has.
import "react-native-url-polyfill/auto";
import { createClient, type SupabaseClient, type SupportedStorage } from "@supabase/supabase-js";
import * as Crypto from "expo-crypto";
import * as SecureStore from "expo-secure-store";
import { AppState } from "react-native";
import { createMMKV } from "react-native-mmkv";
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "../../config/backend";
import { logger } from "../../utils/logger";
import { installWebCrypto } from "./webCrypto";

// Before the client exists: its PKCE sign-in needs secure random numbers and
// SHA-256, which React Native does not provide (see webCrypto.ts).
installWebCrypto();

// The sign-in session (tokens) is the one thing that must not sit readable on
// disk, and expo-secure-store is too small for it. So the session goes in an
// encrypted MMKV file, and only that file's short key goes in the keychain.

const KEY_ITEM = "tonoSessionKey";

// MMKV keys are at most 16 bytes: 12 random bytes as base64 is exactly 16 characters.
function sessionKey(): string {
  // After first unlock, so a refresh in the background (a take finishing while
  // the phone is locked) can still read it. A key that could not be read must
  // never be replaced by a new one: that would orphan the stored session.
  const options = { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK };
  const existing = SecureStore.getItem(KEY_ITEM, options);
  if (existing) return existing;
  const bytes = Crypto.getRandomBytes(12);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  const created = btoa(binary);
  SecureStore.setItem(KEY_ITEM, created, options);
  return created;
}

function sessionStorage(): SupportedStorage {
  try {
    const store = createMMKV({ id: "tono-session", encryptionKey: sessionKey() });
    return {
      getItem: (key) => store.getString(key) ?? null,
      setItem: (key, value) => store.set(key, value),
      removeItem: (key) => {
        store.remove(key);
      },
    };
  } catch (error) {
    // Better to be signed out after every launch than to crash on start.
    logger.error(`[account] session storage unavailable, using memory — ${(error as Error).message}`);
    const memory = new Map<string, string>();
    return {
      getItem: (key) => memory.get(key) ?? null,
      setItem: (key, value) => void memory.set(key, value),
      removeItem: (key) => void memory.delete(key),
    };
  }
}

let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (client) return client;
  client = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: {
      storage: sessionStorage(),
      autoRefreshToken: true,
      persistSession: true,
      // There is no address bar: sign-in returns by deep link and is handled by hand.
      detectSessionInUrl: false,
      // The Google browser flow trades a one-time code for the session.
      flowType: "pkce",
    },
  });
  // Refreshing tokens only while the app is in front, as Supabase advises for
  // React Native, so a backgrounded timer never fires against a stale network.
  const apply = (state: string) => {
    if (state === "active") client?.auth.startAutoRefresh();
    else client?.auth.stopAutoRefresh();
  };
  apply(AppState.currentState);
  AppState.addEventListener("change", apply);
  return client;
}
