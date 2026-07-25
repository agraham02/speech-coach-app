export type LogLevel = "info" | "warn" | "error";

export interface LogEntry {
  id: string;
  timestamp: string;
  level: LogLevel;
  message: string;
}

const MAX_ENTRIES = 300;
let entries: LogEntry[] = [];
const listeners = new Set<(entries: LogEntry[]) => void>();

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
  notify();
}

export function getLogs(): LogEntry[] {
  return entries;
}

export function clearLogs(): void {
  entries = [];
  notify();
}

export function subscribeLogs(listener: (entries: LogEntry[]) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
