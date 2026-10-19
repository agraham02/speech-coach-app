import { memo, useEffect, useState } from "react";
import { StyleSheet, View, type LayoutChangeEvent } from "react-native";
import { Canvas, LinearGradient, Path, Skia, vec } from "@shopify/react-native-skia";
import { useDerivedValue, useFrameCallback, useSharedValue } from "react-native-reanimated";
import { BAR_COUNT, MIN_BAR, RING, STALE_MS, barForVolume, barX, newWave, stepWave, type WaveState } from "../../domain/rewind/waveform";
import { withAlpha } from "../../utils/color";

interface WaveformProps {
  height: number;
  color: string;
  // Calls back with each volume reading (-2..10), returning the way to stop
  // (LiveSpeechSession.onVolume). Not listening while `live` is false.
  subscribe: (listener: (value: number) => void) => () => void;
  live: boolean;
}

// A big live waveform for a take: mirrored bars that scroll left at a steady
// speed as you speak, loud at the right edge, fading out on the left.
//
// It draws every display frame from its own clock (domain/rewind/waveform.ts),
// not when a volume reading arrives. An iPhone delivers readings about every
// 100 ms and unevenly; tying the motion to them made it move, stop, and move.
// Readings only set the level to aim for. The bars are one Skia path built on
// the UI thread, so nothing here touches React or the JS thread.
function WaveformView({ height, color, subscribe, live }: WaveformProps) {
  const [width, setWidth] = useState(0);
  const target = useSharedValue(MIN_BAR);
  const lastReadingAt = useSharedValue(0);
  const wave = useSharedValue<WaveState>(newWave());
  const step = width / BAR_COUNT;

  useEffect(() => {
    if (!live) return;
    return subscribe((value) => {
      target.value = barForVolume(value);
      lastReadingAt.value = Date.now();
    });
  }, [live, subscribe, target, lastReadingAt]);

  const frame = useFrameCallback((info) => {
    "worklet";
    // A long gap (the app was away) must not replay as a burst of bars.
    const dt = Math.min(info.timeSincePreviousFrame ?? 16, 100);
    const aim = Date.now() - lastReadingAt.value > STALE_MS ? MIN_BAR : target.value;
    wave.modify((w) => {
      "worklet";
      stepWave(w, aim, dt);
      return w;
    });
  }, false);

  useEffect(() => {
    frame.setActive(live);
  }, [frame, live]);

  const path = useDerivedValue(() => {
    const p = Skia.Path.Make();
    if (step <= 0) return p;
    const w = wave.value;
    const cy = height / 2;
    const max = height * 0.92;
    for (let age = 0; age < RING; age++) {
      const x = barX(age, w.phase, width, step);
      if (x < -step || x > width + step) continue;
      const half = (w.bars[(w.head - age + RING) % RING] * max) / 2;
      p.moveTo(x, cy - half);
      p.lineTo(x, cy + half);
    }
    return p;
  }, [width, height, step]);

  return (
    <View style={[styles.wrap, { height }]} onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)} pointerEvents="none">
      {width > 0 ? (
        <Canvas style={{ width, height }}>
          <Path path={path} style="stroke" strokeWidth={Math.max(2, step * 0.5)} strokeCap="round">
            {/* Older sound fades out toward the left edge. */}
            <LinearGradient start={vec(0, 0)} end={vec(width, 0)} colors={[withAlpha(color, 0), color, color]} positions={[0, 0.3, 1]} />
          </Path>
        </Canvas>
      ) : null}
    </View>
  );
}

export const Waveform = memo(WaveformView);

const styles = StyleSheet.create({
  wrap: { width: "100%", overflow: "hidden" },
});
