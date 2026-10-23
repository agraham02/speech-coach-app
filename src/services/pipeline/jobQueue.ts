// Two small concurrency guards for the analysis pipeline.

const inFlight = new Map<string, Promise<unknown>>();

// Runs `task` at most once at a time per key. A second call while the first
// is running gets the *same* promise — so a double-tapped "Retry" or "Get
// deep review" can never start two pipelines for one session.
export function runExclusive<T>(key: string, task: () => Promise<T>): Promise<T> {
  const existing = inFlight.get(key);
  if (existing) return existing as Promise<T>;
  const promise = task().finally(() => inFlight.delete(key));
  inFlight.set(key, promise);
  return promise;
}

// Serializes memory-heavy work (audio decode, Whisper) across sessions so two
// models are never loaded at once.
let heavyChain: Promise<unknown> = Promise.resolve();

export function runHeavy<T>(task: () => Promise<T>): Promise<T> {
  const next = heavyChain.then(task, task);
  heavyChain = next.catch(() => undefined);
  return next;
}
