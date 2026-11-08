import { Platform } from "react-native";
import { requireOptionalNativeModule } from "expo-modules-core";

// JS side of the TonoLanguage module (ios/TonoLanguageModule.swift): Apple's
// built-in English word and sentence embeddings. iPhone only. The module is
// missing from builds made before it was added, and from Android, so every call
// degrades to "can't check" instead of throwing.

export type EmbeddingKind = "word" | "sentence";

interface TonoLanguageNative {
  isAvailable(kind: EmbeddingKind): Promise<boolean>;
  vector(kind: EmbeddingKind, text: string): Promise<number[]>;
}

function native(): TonoLanguageNative | null {
  if (Platform.OS !== "ios") return null;
  try {
    return requireOptionalNativeModule<TonoLanguageNative>("TonoLanguage");
  } catch {
    return null;
  }
}

// True when this build has the module and this phone has the embedding.
export async function embeddingAvailable(kind: EmbeddingKind): Promise<boolean> {
  const module = native();
  if (!module) return false;
  try {
    return await module.isAvailable(kind);
  } catch {
    return false;
  }
}

// The vector for a word or sentence, or null when it can't be had.
export async function embed(kind: EmbeddingKind, text: string): Promise<number[] | null> {
  const module = native();
  if (!module || !text.trim()) return null;
  try {
    const vector = await module.vector(kind, text);
    return vector.length > 0 ? vector : null;
  } catch {
    return null;
  }
}

// Whether this build has the native module at all (for the Dev tab's Native check).
export function hasTonoLanguage(): boolean {
  return native() != null;
}
