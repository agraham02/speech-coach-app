// Races `promise` against a timer — if the timer wins, resolves to
// `fallbackValue` instead of leaving the caller waiting forever. Meant for
// native-bridge calls (audio decode, on-device ASR) that have no internal
// timeout of their own and have been observed to hang indefinitely — never
// resolving or rejecting — rather than fail cleanly when the underlying
// native module is in a bad state (e.g. the ExecuTorch ResourceFetcher-not-
// initialized incident: see sessionProcessor.ts's resolveTranscriptAndAudio).
// A genuine rejection from `promise` still propagates as a rejection — this
// only guards against silence, not against real errors, which callers
// already handle via their own try/catch or .catch().
export function withTimeout<T>(promise: Promise<T>, timeoutMs: number, fallbackValue: T): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => resolve(fallbackValue), timeoutMs);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}
