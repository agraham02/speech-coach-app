import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { clampViewport, fullViewport, isZoomed, panViewport, spanOf, zoomViewport, type Viewport } from "../../../domain/results/timeline";

// One time axis for all the Scores tab's charts: the stretch of the take
// they show, and the moment you are pointing at. Zooming or scrubbing any
// chart moves every chart.
interface TimelineState {
  durationMs: number;
  viewport: Viewport;
  zoomed: boolean;
  cursorMs: number | null;
  setCursorMs: (ms: number | null) => void;
  setViewport: (vp: Viewport) => void;
  zoomBy: (factor: number, anchorMs?: number) => void;
  panBy: (deltaMs: number) => void;
  reset: () => void;
  // Hands a moment to whoever can play the recording; absent when nothing can.
  playFrom?: (ms: number) => void;
  // Where the recording is playing now (null when it isn't started): every
  // chart draws a moving line there.
  playheadMs: number | null;
}

const Context = createContext<TimelineState | null>(null);

interface TimelineProviderProps {
  durationMs: number;
  // Plays the recording from a moment (Scores tab's player).
  playFrom?: (ms: number) => void;
  playheadMs?: number | null;
  playing?: boolean;
  children: ReactNode;
}

export function TimelineProvider({ durationMs, playFrom, playheadMs = null, playing = false, children }: TimelineProviderProps) {
  const [viewport, setViewportState] = useState<Viewport>(() => fullViewport(durationMs));
  const [cursorMs, setCursorMs] = useState<number | null>(null);

  const setViewport = useCallback((vp: Viewport) => setViewportState(clampViewport(vp, durationMs)), [durationMs]);
  const zoomBy = useCallback(
    (factor: number, anchorMs?: number) =>
      setViewportState((vp) => zoomViewport(vp, factor, anchorMs ?? (vp.startMs + vp.endMs) / 2, durationMs)),
    [durationMs],
  );
  const panBy = useCallback((deltaMs: number) => setViewportState((vp) => panViewport(vp, deltaMs, durationMs)), [durationMs]);
  const reset = useCallback(() => setViewportState(fullViewport(durationMs)), [durationMs]);

  // Starting from a moment: the readout follows the line, and a zoomed chart
  // that doesn't show the moment moves to it.
  const playFromHere = useMemo(
    () =>
      playFrom
        ? (ms: number) => {
            setCursorMs(null);
            setViewportState((vp) => (ms >= vp.startMs && ms <= vp.endMs ? vp : clampViewport({ startMs: ms - spanOf(vp) * 0.2, endMs: ms + spanOf(vp) * 0.8 }, durationMs)));
            playFrom(ms);
          }
        : undefined,
    [playFrom, durationMs],
  );

  // While it plays, a zoomed chart turns the page when the line runs off its
  // right edge (only then: someone looking elsewhere with two fingers isn't
  // pulled back).
  const wasInside = useRef(true);
  useEffect(() => {
    if (playheadMs == null) {
      wasInside.current = true;
      return;
    }
    const inside = playheadMs >= viewport.startMs && playheadMs <= viewport.endMs;
    if (playing && wasInside.current && !inside && playheadMs > viewport.endMs) {
      setViewportState((vp) => clampViewport({ startMs: playheadMs - spanOf(vp) * 0.1, endMs: playheadMs + spanOf(vp) * 0.9 }, durationMs));
    }
    wasInside.current = inside;
  }, [playheadMs, playing, viewport, durationMs]);

  const value = useMemo<TimelineState>(
    () => ({ durationMs, viewport, zoomed: isZoomed(viewport, durationMs), cursorMs, setCursorMs, setViewport, zoomBy, panBy, reset, playFrom: playFromHere, playheadMs }),
    [durationMs, viewport, cursorMs, setViewport, zoomBy, panBy, reset, playFromHere, playheadMs],
  );
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useTimeline(): TimelineState {
  const value = useContext(Context);
  if (!value) throw new Error("useTimeline needs a TimelineProvider");
  return value;
}
