import { useEffect, useRef, useState } from "react";
import { StyleSheet, View, type LayoutChangeEvent } from "react-native";
import Svg, { Path } from "react-native-svg";
import Animated, { Easing, ReduceMotion, useAnimatedProps, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { BAR_COUNT, barForVolume, emptyBars, pushBar, smoothBar } from "../../domain/rewind/waveform";

const AnimatedPath = Animated.createAnimatedComponent(Path);

interface WaveformProps {
  height: number;
  color: string;
  // Calls back with each volume reading (-2..10), returning the way to stop
  // (LiveSpeechSession.onVolume). Not listening while `live` is false.
  subscribe: (listener: (value: number) => void) => () => void;
  live: boolean;
  // Roughly how often readings arrive, so each new bar slides in over that long.
  sampleMs?: number;
}

// A big live waveform for a take: mirrored bars that scroll to the left as you
// speak, loud at the right edge. It runs off the UI thread — readings go into
// a shared array and the path is built there — so drawing twenty bars a
// second never touches React.
export function Waveform({ height, color, subscribe, live, sampleMs = 50 }: WaveformProps) {
  const [width, setWidth] = useState(0);
  const bars = useSharedValue<number[]>(emptyBars());
  const slide = useSharedValue(0);
  const last = useRef(0);
  const window = useRef<number[]>(emptyBars());
  const step = width / BAR_COUNT;

  useEffect(() => {
    if (!live || step <= 0) return;
    return subscribe((value) => {
      last.current = smoothBar(last.current, barForVolume(value));
      window.current = pushBar(window.current, last.current);
      bars.value = window.current;
      // The row starts one step to the right and glides into place, so it
      // scrolls smoothly instead of jumping a bar at a time.
      slide.value = step;
      slide.value = withTiming(0, { duration: sampleMs, easing: Easing.linear, reduceMotion: ReduceMotion.Never });
    });
  }, [live, subscribe, step, sampleMs, bars, slide]);

  const animatedProps = useAnimatedProps(() => {
    const cy = height / 2;
    const max = height * 0.92;
    const s = step;
    let d = "";
    for (let i = 0; i < bars.value.length; i++) {
      const x = i * s + s / 2;
      const half = (bars.value[i] * max) / 2;
      d += `M${x.toFixed(1)} ${(cy - half).toFixed(1)}L${x.toFixed(1)} ${(cy + half).toFixed(1)}`;
    }
    return { d };
  });

  const glide = useAnimatedStyle(() => ({ transform: [{ translateX: slide.value }] }));

  return (
    <View style={[styles.wrap, { height }]} onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}>
      {width > 0 ? (
        <Animated.View style={[StyleSheet.absoluteFill, glide]}>
          <Svg width={width} height={height}>
            <AnimatedPath animatedProps={animatedProps} stroke={color} strokeWidth={Math.max(2, step * 0.5)} strokeLinecap="round" fill="none" />
          </Svg>
        </Animated.View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: "100%", overflow: "hidden" },
});
