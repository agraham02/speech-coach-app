import { useContext } from "react";
import { Platform } from "react-native";
import { BottomTabBarHeightContext } from "react-native-bottom-tabs";

// Android's JS tab bar (see navigation/index.tsx) reserves its own space in
// the layout, so screens there already sit above it with no extra padding
// needed. iOS's native Liquid Glass tab bar floats over content by design
// instead of reserving space — that's what lets content scroll translucently
// beneath it — so fixed bottom-pinned content (buttons, the end of a scroll
// view) needs to explicitly pad for its height, or it renders hidden
// underneath the glass.
//
// Reads the context directly rather than useBottomTabBarHeight(), which
// throws outside a tab: some of these screens are also pushed onto the root
// stack (Practice, Frameworks, Trends), where there's no tab bar to clear.
export function useTabBarBottomInset(): number {
  const height = useContext(BottomTabBarHeightContext);
  return Platform.OS === "ios" ? (height ?? 0) : 0;
}
