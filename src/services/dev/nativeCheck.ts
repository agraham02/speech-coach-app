import { TurboModuleRegistry } from "react-native";
import { requireOptionalNativeModule } from "expo-modules-core";
import * as Updates from "expo-updates";
import { embed, embeddingAvailable, hasTonoLanguage } from "../../../modules/tono-language";
import { cosine } from "../language/embeddings";

// Dev, Native check: whether this build has every native piece the rest of the
// overhaul needs, so the owner makes one build and then only sends updates
// (docs/overhaul/DECISIONS.md, D20). A row says what the piece is for. Anything
// shown as missing means a code change that needs it will crash or fall back on
// this build, and it needs a new build.

export interface NativeCheckRow {
  id: string;
  label: string;
  // What needs it.
  usedFor: string;
  present: boolean;
  // Something more the check found.
  detail?: string;
}

function turbo(name: string): boolean {
  try {
    return TurboModuleRegistry.get(name) != null;
  } catch {
    return false;
  }
}

function expoModule(name: string): boolean {
  try {
    return requireOptionalNativeModule(name) != null;
  } catch {
    return false;
  }
}

export async function checkNativeModules(): Promise<NativeCheckRow[]> {
  const [word, sentence] = await Promise.all([embeddingAvailable("word"), embeddingAvailable("sentence")]);
  // A real answer from the phone, not just "the module is there": "dog" and
  // "puppy" should sit closer than "dog" and "thunder".
  let sense: { text: string; ok: boolean } | null = null;
  if (word) {
    const [dog, puppy, thunder] = await Promise.all([embed("word", "dog"), embed("word", "puppy"), embed("word", "thunder")]);
    const near = dog && puppy ? cosine(dog, puppy) : null;
    const far = dog && thunder ? cosine(dog, thunder) : null;
    if (near != null && far != null) sense = { text: `dog and puppy ${near.toFixed(2)}, dog and thunder ${far.toFixed(2)}`, ok: near > far };
  }
  const rows: NativeCheckRow[] = [
    { id: "keyboard", label: "Keyboard", usedFor: "Nothing hides a text field (phase 0)", present: turbo("KeyboardController") },
    {
      id: "tono_language",
      label: "Meaning check (Apple word and sentence vectors)",
      usedFor: "Phone content checks (3b.4)",
      present: hasTonoLanguage() && word && sentence,
      detail: [word ? "word" : null, sentence ? "sentence" : null].filter(Boolean).join(" and ") || undefined,
    },
  ];
  if (sense) rows.push({ id: "tono_language_sense", label: "Meaning check gives sensible answers", usedFor: "Phone content checks (3b.4)", present: sense.ok, detail: sense.text });
  rows.push(
    { id: "apple_embeddings", label: "Apple contextual embeddings", usedFor: "A second way to compare meaning, if the first is too coarse", present: turbo("NativeAppleEmbeddings") },
    { id: "apple_transcription", label: "Apple speech transcription", usedFor: "A possible Whisper replacement with word times (iOS 26)", present: turbo("NativeAppleTranscription") },
    { id: "whisper", label: "Whisper", usedFor: "Scoring drills and takes from the saved clip (3b.3)", present: turbo("RNWhisper") },
    { id: "speech", label: "Live speech recognition and clip saving", usedFor: "Drills, warm-ups and guided exercises with a mic (3b.3, 3c)", present: expoModule("ExpoSpeechRecognition") },
    { id: "audio_api", label: "Audio decoding", usedFor: "Pitch, volume and pauses from a saved clip (3c)", present: turbo("AudioAPIModule") },
    { id: "network", label: "Network type (Wi-Fi or cellular)", usedFor: "Onboarding's model download asks first on cellular (phase 7)", present: expoModule("ExpoNetwork") },
    { id: "backup", label: "Backup exclusion", usedFor: "Keeping media out of iCloud", present: expoModule("BackupExclusion") },
    { id: "metrics", label: "Device metrics", usedFor: "Dev, Metrics", present: expoModule("DeviceMetrics") },
  );
  return rows;
}

export function runtimeLabel(): string {
  return `Runtime ${Updates.runtimeVersion ?? "unknown"}${Updates.updateId ? `, update ${Updates.updateId.slice(0, 8)}` : ", the build's own code"}`;
}
