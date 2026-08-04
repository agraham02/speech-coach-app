import { Platform } from "react-native";
import { useBottomTabBarHeight } from "react-native-bottom-tabs";

// Android's JS tab bar (see navigation/index.tsx) reserves its own space in
// the layout, so screens there already sit above it with no extra padding
// needed. iOS's native Liquid Glass tab bar floats over content by design
// instead of reserving space — that's what lets content scroll translucently
// beneath it — so fixed bottom-pinned content (buttons, the end of a scroll
// view) needs to explicitly pad for its height, or it renders hidden
// underneath the glass.
//
// Calling useBottomTabBarHeight conditionally on Platform.OS is safe here
// even though it's a hook: Platform.OS never changes for the lifetime of a
// running app, so the branch taken never flips between renders.
export function useTabBarBottomInset(): number {
  if (Platform.OS !== "ios") return 0;
  // eslint-disable-next-line react-hooks/rules-of-hooks
  return useBottomTabBarHeight();
}
