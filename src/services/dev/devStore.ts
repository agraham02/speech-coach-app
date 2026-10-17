import { createMMKV } from "react-native-mmkv";
import { DEFAULT_PRESENCE_THRESHOLDS, type PresenceThresholds } from "../../domain/presenceMetrics";

// Storage for the Dev tab only. Kept apart from the app prefs so nothing
// here can change how production scoring behaves.
const storage = createMMKV({ id: "speech-coach-dev" });

export function getDevJson<T>(key: string, fallback: T): T {
  try {
    const raw = storage.getString(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function setDevJson(key: string, value: unknown): void {
  try {
    storage.set(key, JSON.stringify(value));
  } catch {
    // Dev tooling must never break the app.
  }
}

export function removeDevKey(key: string): void {
  try {
    storage.remove(key);
  } catch {
    // ignore
  }
}

const THRESHOLDS_KEY = "faceThresholds";

// The thresholds the Face Lab is trying. Missing or odd values fall back to
// the defaults one by one.
export function getFaceThresholds(): PresenceThresholds {
  const saved = getDevJson<Partial<Record<keyof PresenceThresholds, unknown>>>(THRESHOLDS_KEY, {});
  const out = { ...DEFAULT_PRESENCE_THRESHOLDS };
  for (const key of Object.keys(out) as (keyof PresenceThresholds)[]) {
    const value = saved[key];
    if (typeof value === "number" && Number.isFinite(value)) out[key] = value;
  }
  return out;
}

export function setFaceThresholds(t: PresenceThresholds): void {
  setDevJson(THRESHOLDS_KEY, t);
}

export function resetFaceThresholds(): void {
  removeDevKey(THRESHOLDS_KEY);
}
