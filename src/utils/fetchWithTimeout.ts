export class TimeoutError extends Error {
  constructor(what: string, timeoutMs: number) {
    super(`${what} timed out after ${Math.round(timeoutMs / 1000)}s`);
    this.name = "TimeoutError";
  }
}

// fetch() with an AbortController deadline. Plain fetch has no timeout, so a
// stalled request (common when iOS suspends the app mid-upload) used to hang
// a pipeline step forever instead of failing so it could be retried.
export async function fetchWithTimeout(
  input: string,
  init: RequestInit = {},
  timeoutMs: number,
  what = "Request",
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (error) {
    if (controller.signal.aborted) throw new TimeoutError(what, timeoutMs);
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

// Rejects with TimeoutError if `promise` doesn't settle in time (unlike
// withTimeout, which resolves to a fallback value).
export function withDeadline<T>(promise: Promise<T>, timeoutMs: number, what: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new TimeoutError(what, timeoutMs)), timeoutMs);
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
