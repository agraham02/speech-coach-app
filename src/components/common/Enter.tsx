import type { ReactNode } from "react";
import type { StyleProp, ViewStyle } from "react-native";
import Animated from "react-native-reanimated";
import { enter } from "../../theme/motion";

// Fades a block up into place on first mount, `index` steps into the
// stagger — for screens that want their sections to arrive in turn.
export function Enter({ index = 0, style, children }: { index?: number; style?: StyleProp<ViewStyle>; children: ReactNode }) {
  return (
    <Animated.View entering={enter(index)} style={style}>
      {children}
    </Animated.View>
  );
}
