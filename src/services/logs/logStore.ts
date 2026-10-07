import { createMMKV } from "react-native-mmkv";

export type LogLevel = "info" | "warn" | "error";

export interface LogEntry {
  id: string;
  timestamp: string;
  level: LogLevel;
  message: string;
}

// Persisted so that what happened before a crash or restart can still be
// read (and shared) on the phone — there's no Mac console to look at on
// this setup.
const MAX_ENTRIES = 500;
const STORAGE_KEY = "entries";
const PERSIST_DEBOUNCE_MS = 1000;

const storage = createMMKV({ id: "speech-coach-logs" });
let entries: LogEntry[] = loadPersisted();
const listeners = new Set<(entries: LogEntry[]) => void>();
let persistTimer: ReturnType<typeof setTimeout> | null = null;

function loadPersisted(): LogEntry[] {
  try {
    const raw = storage.getString(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as LogEntry[]).slice(0, MAX_ENTRIES) : [];
  } catch {
    return [];
  }
}

function schedulePersist() {
  if (persistTimer) return;
  persistTimer = setTimeout(() => {
    persistTimer = null;
    try {
      storage.set(STORAGE_KEY, JSON.stringify(entries));
    } catch {
      // Logging must never break the app.
    }
  }, PERSIST_DEBOUNCE_MS);
}

function notify() {
  for (const listener of listeners) listener(entries);
}

export function pushLog(level: LogLevel, message: string): void {
  const entry: LogEntry = {
    id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    timestamp: new Date().toISOString(),
    level,
    message,
  };
  entries = [entry, ...entries].slice(0, MAX_ENTRIES);
  schedulePersist();
  notify();
}

export function getLogs(): LogEntry[] {
  return entries;
}

export function clearLogs(): void {
  entries = [];
  schedulePersist();
  notify();
}

export function subscribeLogs(listener: (entries: LogEntry[]) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// Plain-text export, oldest first, for the Share sheet.
export function formatLogsForSharing(): string {
  return [...entries]
    .reverse()
    .map((e) => `${e.timestamp} [${e.level}] ${e.message}`)
    .join("\n");
}
