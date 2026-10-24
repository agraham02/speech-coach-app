import * as SecureStore from "expo-secure-store";

// Keychain (iOS) / Keystore (Android) items for features that no longer
// exist, deleted on every launch (deleting a missing item is a no-op):
// - the Notion journal and AssemblyAI transcription (removed 2026-10-12);
// - bring-your-own-key: the Gemini, OpenAI, Claude and OpenRouter keys that
//   testers pasted (removed 2026-10-23). Tono AI is the only judge now, so a
//   key left on a phone would only be a secret nobody uses.
// The only secret the app still keeps is the key to its encrypted sign-in
// session (services/account/supabaseClient.ts), which is not listed here.
const REMOVED_SECRETS = ["notionToken", "notionPageId", "assemblyAiApiKey", "geminiApiKey", "openaiApiKey", "anthropicApiKey", "openrouterApiKey"];

export async function deleteRemovedSecrets(): Promise<void> {
  await Promise.all(REMOVED_SECRETS.map((key) => SecureStore.deleteItemAsync(key).catch(() => undefined)));
}
