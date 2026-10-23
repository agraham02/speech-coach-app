import { useEffect, useRef, useState } from "react";
import { View, type AccessibilityActionEvent, type GestureResponderEvent, type LayoutChangeEvent } from "react-native";
import { Txt } from "../common/Txt";
import { makeStyles } from "../../theme/ThemeProvider";
import { clampMs, formatClock, msAtX, spokenClock } from "../../domain/playback/followAlong";
import { tick } from "../../utils/haptics";

// How far one VoiceOver / TalkBack swipe moves the playhead.
const A11Y_STEP_MS = 10_000;
// After a drag lets go, the thumb holds where it was dropped until the
// player catches up, instead of flicking back for a frame.
const HOLD_AFTER_RELEASE_MS = 600;

interface ScrubberProps {
  positionMs: number;
  durationMs: number;
  onSeek: (ms: number) => void;
  disabled?: boolean;
}

// A thin seek bar with elapsed and remaining time. Drag anywhere on it, or
// tap a spot to jump there. Built on the responder system (no gesture
// library), and it keeps the touch once it has it, so a slightly vertical
// drag inside a scrolling screen doesn't turn into a scroll.
export function Scrubber({ positionMs, durationMs, onSeek, disabled }: ScrubberProps) {
  const styles = useStyles();
  const [width, setWidth] = useState(0);
  const [dragMs, setDragMs] = useState<number | null>(null);
  const [heldMs, setHeldMs] = useState<number | null>(null);
  const grab = useRef({ x: 0, pageX: 0 });
  const latest = useRef(0);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (holdTimer.current) clearTimeout(holdTimer.current);
  }, []);

  const enabled = !disabled && durationMs > 0;
  const shown = dragMs ?? heldMs ?? positionMs;
  const fraction = durationMs > 0 ? Math.min(1, Math.max(0, shown / durationMs)) : 0;

  function at(event: GestureResponderEvent): number {
    const x = grab.current.x + (event.nativeEvent.pageX - grab.current.pageX);
    return msAtX(x, width, durationMs);
  }

  function commit(ms: number) {
    setDragMs(null);
    setHeldMs(ms);
    if (holdTimer.current) clearTimeout(holdTimer.current);
    holdTimer.current = setTimeout(() => setHeldMs(null), HOLD_AFTER_RELEASE_MS);
    onSeek(ms);
  }

  function onAccessibilityAction(event: AccessibilityActionEvent) {
    const step = event.nativeEvent.actionName === "increment" ? A11Y_STEP_MS : event.nativeEvent.actionName === "decrement" ? -A11Y_STEP_MS : 0;
    if (step) onSeek(clampMs(positionMs + step, durationMs));
  }

  return (
    <View
      style={styles.wrap}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel="Playback position"
      accessibilityValue={{ text: `${spokenClock(shown)} of ${spokenClock(durationMs)}` }}
      accessibilityActions={enabled ? [{ name: "increment" }, { name: "decrement" }] : []}
      onAccessibilityAction={onAccessibilityAction}
      accessibilityState={{ disabled: !enabled }}
    >
      <View
        style={styles.hit}
        onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}
        onStartShouldSetResponder={() => enabled}
        onMoveShouldSetResponder={() => enabled}
        onResponderTerminationRequest={() => false}
        onResponderGrant={(e) => {
          grab.current = { x: e.nativeEvent.locationX, pageX: e.nativeEvent.pageX };
          latest.current = msAtX(e.nativeEvent.locationX, width, durationMs);
          setDragMs(latest.current);
          tick();
        }}
        onResponderMove={(e) => {
          latest.current = at(e);
          setDragMs(latest.current);
        }}
        onResponderRelease={() => commit(latest.current)}
        onResponderTerminate={() => commit(latest.current)}
      >
        <View style={styles.track} pointerEvents="none">
          <View style={[styles.fill, { width: `${fraction * 100}%` }]} />
        </View>
        <View
          pointerEvents="none"
          style={[styles.thumb, dragMs != null && styles.thumbActive, { left: fraction * width - (dragMs != null ? 9 : 6) }, !enabled && styles.thumbOff]}
        />
      </View>
      <View style={styles.times} pointerEvents="none">
        <Txt variant="caption1" tone={dragMs != null ? "primary" : "muted"} tabular>
          {formatClock(shown)}
        </Txt>
        <Txt variant="caption1" tone="muted" tabular>
          -{formatClock(Math.max(0, durationMs - shown))}
        </Txt>
      </View>
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  wrap: { gap: 2 },
  // Tall enough to grab (the bar itself is 4 pt).
  hit: { height: 28, justifyContent: "center" },
  track: { height: 4, borderRadius: 2, backgroundColor: t.colors.switchTrackOff, overflow: "hidden" },
  fill: { height: 4, backgroundColor: t.colors.accent },
  thumb: { position: "absolute", top: 8, width: 12, height: 12, borderRadius: 6, backgroundColor: t.colors.accent },
  thumbActive: { top: 5, width: 18, height: 18, borderRadius: 9 },
  thumbOff: { opacity: 0 },
  times: { flexDirection: "row", justifyContent: "space-between" },
}));
