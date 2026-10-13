import { View } from "react-native";
import Svg, { Circle } from "react-native-svg";
import { useTheme } from "../../theme/ThemeProvider";
import { withAlpha } from "../../utils/color";

interface DotRingProps {
  size: number;
  total: number;
  filled: number;
  color?: string;
  children?: React.ReactNode;
}

// A ring of dots, one per day of a run; the days done are filled, starting at
// the top and going clockwise. Counting days one by one reads as steady
// progress without a "you broke it" edge — a missed day just stays empty.
export function DotRing({ size, total, filled, color, children }: DotRingProps) {
  const { colors } = useTheme();
  const on = color ?? colors.accent;
  // Visible on a plain surface and on a tinted hero card alike.
  const empty = withAlpha(colors.textPrimary, 0.2);
  const dot = Math.max(2.5, Math.min(5, (size * Math.PI) / total / 3.2));
  const radius = size / 2 - dot - 1;
  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      <Svg width={size} height={size} style={{ position: "absolute" }}>
        {Array.from({ length: total }, (_, i) => {
          const angle = (i / total) * Math.PI * 2 - Math.PI / 2;
          return (
            <Circle
              key={i}
              cx={size / 2 + radius * Math.cos(angle)}
              cy={size / 2 + radius * Math.sin(angle)}
              r={dot}
              fill={i < filled ? on : empty}
            />
          );
        })}
      </Svg>
      {children}
    </View>
  );
}
