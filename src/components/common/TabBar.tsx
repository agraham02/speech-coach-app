import { useContext, useEffect, useState } from "react";
import { Pressable, StyleSheet, View, type LayoutChangeEvent } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { BottomTabBarHeightCallbackContext, type BottomTabBarProps } from "@react-navigation/bottom-tabs";
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";
import { makeStyles, useTheme } from "../../theme/ThemeProvider";
import { spring } from "../../theme/motion";
import { tick } from "../../utils/haptics";
import { Txt } from "./Txt";

type IconPair = [keyof typeof Ionicons.glyphMap, keyof typeof Ionicons.glyphMap];

const ICONS: Record<string, IconPair> = {
  Today: ["sunny", "sunny-outline"],
  Learn: ["school", "school-outline"],
  Progress: ["stats-chart", "stats-chart-outline"],
  Library: ["albums", "albums-outline"],
  Dev: ["bug", "bug-outline"],
};

const PILL_WIDTH = 60;

// Android's tab bar (iOS uses the native Liquid Glass bar): ink icons, and a
// soft pill that springs to the active tab.
export function TabBar({ state, descriptors, navigation, insets }: BottomTabBarProps) {
  const styles = useStyles();
  const { colors } = useTheme();
  const [width, setWidth] = useState(0);
  const tabWidth = width / state.routes.length;
  const x = useSharedValue(0);

  useEffect(() => {
    if (tabWidth > 0) x.value = withSpring(state.index * tabWidth + (tabWidth - PILL_WIDTH) / 2, spring.gentle);
  }, [state.index, tabWidth, x]);

  const pill = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));

  // Tells React Navigation the bar's real height, so anything floating above
  // it (the app guide's tips) can clear it.
  const reportHeight = useContext(BottomTabBarHeightCallbackContext);

  return (
    <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, 8) }]} onLayout={(e: LayoutChangeEvent) => reportHeight?.(e.nativeEvent.layout.height)}>
      <View style={styles.row} onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}>
        {width > 0 ? <Animated.View style={[styles.pill, pill]} /> : null}
        {state.routes.map((route, index) => {
          const focused = state.index === index;
          const { options } = descriptors[route.key];
          const label = typeof options.title === "string" ? options.title : route.name;
          const [on, off] = ICONS[route.name] ?? ["ellipse", "ellipse-outline"];
          return (
            <Pressable
              key={route.key}
              style={styles.tab}
              accessibilityRole="tab"
              accessibilityState={{ selected: focused }}
              accessibilityLabel={label}
              onPress={() => {
                const event = navigation.emit({ type: "tabPress", target: route.key, canPreventDefault: true });
                if (!focused && !event.defaultPrevented) {
                  tick();
                  navigation.navigate(route.name, route.params);
                }
              }}
              onLongPress={() => navigation.emit({ type: "tabLongPress", target: route.key })}
            >
              <View style={styles.iconSlot}>
                <Ionicons name={focused ? on : off} size={21} color={focused ? colors.textPrimary : colors.textMuted} />
              </View>
              <Txt variant="caption1" weight={focused ? "600" : "500"} tone={focused ? "primary" : "muted"}>
                {label}
              </Txt>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  bar: {
    backgroundColor: t.colors.background,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: t.colors.separator,
    paddingTop: 8,
  },
  row: { flexDirection: "row" },
  pill: {
    position: "absolute",
    top: 0,
    left: 0,
    width: PILL_WIDTH,
    height: 32,
    borderRadius: 16,
    backgroundColor: t.colors.accentMuted,
  },
  tab: { flex: 1, alignItems: "center", gap: 3 },
  iconSlot: { height: 32, justifyContent: "center" },
}));
