// Counts blinks frame by frame. The face timeline is sampled every 200 ms,
// and a blink (about 100-150 ms) usually falls between two samples, so
// counting from the timeline missed most of them: a minute-long take read
// 0 blinks a minute. This runs on every face frame instead. Pure.

// Eye closure is MediaPipe's eyeBlink blendshapes averaged (0 open, 1 shut).
// Closed above CLOSE, open again below OPEN: the gap keeps one blink from
// flickering into two.
export const BLINK_CLOSE = 0.55;
export const BLINK_OPEN = 0.35;
// Shut for longer than this is not a blink: eyes closed on purpose, or a
// look down at notes, which also raises eyeBlink.
export const MAX_BLINK_MS = 500;

export interface BlinkState {
  closedAt: number | null;
  count: number;
}

export const newBlinkState = (): BlinkState => ({ closedAt: null, count: 0 });

export function feedBlink(state: BlinkState, closure: number, tMs: number): BlinkState {
  if (state.closedAt === null) return closure >= BLINK_CLOSE ? { ...state, closedAt: tMs } : state;
  if (closure > BLINK_OPEN) return state;
  const blinked = tMs - state.closedAt <= MAX_BLINK_MS;
  return { closedAt: null, count: state.count + (blinked ? 1 : 0) };
}

// The face left the frame: a half-seen blink does not count.
export const loseFace = (state: BlinkState): BlinkState => (state.closedAt === null ? state : { ...state, closedAt: null });
