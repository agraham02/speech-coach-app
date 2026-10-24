import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { clampViewport, fullViewport, isZoomed, panViewport, zoomViewport, type Viewport } from "../../../domain/results/timeline";

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
}

const Context = createContext<TimelineState | null>(null);

export function TimelineProvider({ durationMs, playFrom, children }: { durationMs: number; playFrom?: (ms: number) => void; children: ReactNode }) {
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

  const value = useMemo<TimelineState>(
    () => ({ durationMs, viewport, zoomed: isZoomed(viewport, durationMs), cursorMs, setCursorMs, setViewport, zoomBy, panBy, reset, playFrom }),
    [durationMs, viewport, cursorMs, setViewport, zoomBy, panBy, reset, playFrom],
  );
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useTimeline(): TimelineState {
  const value = useContext(Context);
  if (!value) throw new Error("useTimeline needs a TimelineProvider");
  return value;
}
