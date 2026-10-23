import * as SecureStore from "expo-secure-store";
import type { KeyProviderId } from "../cloud/providers";

// Keychain (iOS) / Keystore (Android) backed storage for the API secrets
// this app needs — deliberately separate from services/prefs/prefsStore.ts
// (plain MMKV), since these are secrets entered by the user in Settings, not
// preferences, and must never be baked into the built app the way they used
// to be via app.config.ts's extra block.
const KEYS = {
  geminiApiKey: "geminiApiKey",
} as const;

// One key per deep-review provider (services/cloud/providers.ts). Gemini
// keeps its original item name so existing keys carry over.
const PROVIDER_KEYS: Record<KeyProviderId, string> = {
  gemini: KEYS.geminiApiKey,
  openai: "openaiApiKey",
  anthropic: "anthropicApiKey",
  openrouter: "openrouterApiKey",
};

export function getProviderKey(id: KeyProviderId): Promise<string | null> {
  return getSecret(PROVIDER_KEYS[id]);
}

export function setProviderKey(id: KeyProviderId, value: string): Promise<void> {
  return setSecret(PROVIDER_KEYS[id], value);
}

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


// Secrets for features that no longer exist (the Notion journal and
// AssemblyAI transcription, both removed 2026-10-12). Deleting a missing
// item is a no-op, so this runs on every launch.
const REMOVED_SECRETS = ["notionToken", "notionPageId", "assemblyAiApiKey"];

export async function deleteRemovedSecrets(): Promise<void> {
  await Promise.all(REMOVED_SECRETS.map((key) => SecureStore.deleteItemAsync(key)));
}
