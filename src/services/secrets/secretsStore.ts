import * as SecureStore from "expo-secure-store";

// Keychain (iOS) / Keystore (Android) backed storage for the API secrets
// this app needs — deliberately separate from services/prefs/prefsStore.ts
// (plain MMKV), since these are secrets entered by the user in Settings, not
// preferences, and must never be baked into the built app the way they used
// to be via app.config.ts's extra block.
const KEYS = {
  geminiApiKey: "geminiApiKey",
  notionToken: "notionToken",
  notionPageId: "notionPageId",
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

export function getNotionToken(): Promise<string | null> {
  return getSecret(KEYS.notionToken);
}

export function setNotionToken(value: string): Promise<void> {
  return setSecret(KEYS.notionToken, value);
}

export function getNotionPageId(): Promise<string | null> {
  return getSecret(KEYS.notionPageId);
}

export function setNotionPageId(value: string): Promise<void> {
  return setSecret(KEYS.notionPageId, value);
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
