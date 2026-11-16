import { View } from "react-native";

type Direction = "right" | "down";

// The thin hand-drawn chevron: two 2dp strokes of a rotated square. It means
// "this opens something"; the colour is the caller's.
export function Chevron({ color, size = 8, thickness = 2, direction = "right" }: { color: string; size?: number; thickness?: number; direction?: Direction }) {
  const box = size + 4;
  return (
    <View style={{ width: box, height: box, alignItems: "center", justifyContent: "center" }} importantForAccessibility="no" accessibilityElementsHidden>
      <View
        style={{
          width: size,
          height: size,
          borderRightWidth: thickness,
          borderBottomWidth: thickness,
          borderColor: color,
          transform: [{ rotate: direction === "right" ? "-45deg" : "45deg" }],
        }}
      />
    </View>
  );
}
