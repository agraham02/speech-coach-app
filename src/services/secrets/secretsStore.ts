import * as SecureStore from "expo-secure-store";

// Keychain (iOS) / Keystore (Android) backed storage for the API secrets
// this app needs — deliberately separate from services/prefs/prefsStore.ts
// (plain MMKV), since these are secrets entered by the user in Settings, not
// preferences, and must never be baked into the built app the way they used
// to be via app.config.ts's extra block.
const KEYS = {
  geminiApiKey: "geminiApiKey",
  assemblyAiApiKey: "assemblyAiApiKey",
} as const;

async function getSecret(key: string): Promise<string | null> {
  return SecureStore.getItemAsync(key);
}

// Empty/whitespace-only input clears the secret instead of storing an empty
// string, so "clear the field in Settings" behaves like "unset."
async function setSecret(key: string, value: string): Promise<void> {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    await SecureStore.deleteItemAsync(key);
  } else {
    await SecureStore.setItemAsync(key, trimmed);
  }
}

export function getGeminiApiKey(): Promise<string | null> {
  return getSecret(KEYS.geminiApiKey);
}

export function setGeminiApiKey(value: string): Promise<void> {
  return setSecret(KEYS.geminiApiKey, value);
}


// Only ever read when the opt-in "Use cloud transcription" toggle is on
// (see SettingsScreen.tsx / prefsStore.ts's assemblyAiEnabled) — this key
// existing does not by itself turn on the paid path.
export function getAssemblyAiApiKey(): Promise<string | null> {
  return getSecret(KEYS.assemblyAiApiKey);
}

export function setAssemblyAiApiKey(value: string): Promise<void> {
  return setSecret(KEYS.assemblyAiApiKey, value);
}

// Secrets for features that no longer exist (the Notion journal, removed
// 2026-10-12). Deleting a missing item is a no-op, so this runs on every
// launch.
const REMOVED_SECRETS = ["notionToken", "notionPageId"];

export async function deleteRemovedSecrets(): Promise<void> {
  await Promise.all(REMOVED_SECRETS.map((key) => SecureStore.deleteItemAsync(key)));
}
