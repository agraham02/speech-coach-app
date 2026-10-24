import { useCallback, useRef, useState } from "react";
import type { LayoutChangeEvent, NativeScrollEvent, NativeSyntheticEvent } from "react-native";

interface Rect {
  y: number;
  h: number;
}

// Which parts of a scrolling screen can be seen right now, so something can
// wait to play until the person is looking at it (a progress animation played
// while they were reading further down is an animation nobody saw). Parts are
// direct children of the scroll view's content, each wrapped in a View given
// `bind(key)`. A part counts as seen when its top is on screen with a little
// room to spare. Re-renders only when something comes into or leaves view.
export function useScrollVisibility(spare = 60) {
  const frame = useRef({ y: 0, h: 0, rects: {} as Record<string, Rect> });
  const [visible, setVisible] = useState<Record<string, boolean>>({});

  const recompute = useCallback(() => {
    const { y, h, rects } = frame.current;
    const next: Record<string, boolean> = {};
    for (const key of Object.keys(rects)) {
      const r = rects[key];
      next[key] = h > 0 && r.y < y + h - spare && r.y + r.h > y + spare;
    }
    setVisible((prev) => {
      const keys = Object.keys(next);
      return keys.length === Object.keys(prev).length && keys.every((k) => prev[k] === next[k]) ? prev : next;
    });
  }, [spare]);

  const onScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      frame.current.y = e.nativeEvent.contentOffset.y;
      recompute();
    },
    [recompute],
  );

  const onLayout = useCallback(
    (e: LayoutChangeEvent) => {
      frame.current.h = e.nativeEvent.layout.height;
      recompute();
    },
    [recompute],
  );

  const bind = useCallback(
    (key: string) => ({
      onLayout: (e: LayoutChangeEvent) => {
        const { y, height } = e.nativeEvent.layout;
        frame.current.rects[key] = { y, h: height };
        recompute();
      },
    }),
    [recompute],
  );

  const getY = useCallback(() => frame.current.y, []);

  return { onScroll, onLayout, bind, visible, getY };
}
