import type { ReactNode } from "react";
import { Pressable, type GestureResponderEvent, type PressableProps, type StyleProp, type ViewStyle } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from "react-native-reanimated";
import { duration, PRESS_SCALE, spring } from "../../theme/motion";
import { tap, tick } from "../../utils/haptics";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

interface PressableScaleProps extends Omit<PressableProps, "style" | "children"> {
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
  // How far it sinks while held (1 = not at all).
  scaleTo?: number;
  haptic?: "tick" | "tap";
}

// The app's press primitive: answers a touch instantly with a small spring
// scale and a slight dim, so every tappable thing feels physical. Buttons,
// cards, rows and chips are built on it.
export function PressableScale({ style, children, scaleTo = PRESS_SCALE, haptic, onPressIn, onPressOut, onPress, disabled, ...props }: PressableScaleProps) {
  const pressed = useSharedValue(0);
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 - (1 - scaleTo) * pressed.value }],
    opacity: 1 - 0.12 * pressed.value,
  }));

  return (
    <AnimatedPressable
      {...props}
      disabled={disabled}
      onPressIn={(e: GestureResponderEvent) => {
        pressed.value = withSpring(1, spring.press);
        onPressIn?.(e);
      }}
      onPressOut={(e: GestureResponderEvent) => {
        pressed.value = withTiming(0, { duration: duration.base });
        onPressOut?.(e);
      }}
      onPress={(e: GestureResponderEvent) => {
        if (haptic === "tap") tap();
        else if (haptic === "tick") tick();
        onPress?.(e);
      }}
      style={[style, animatedStyle]}
    >
      {children}
    </AnimatedPressable>
  );
}
