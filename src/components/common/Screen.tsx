import { useState, type ReactNode, type Ref } from "react";
import { StyleSheet, View, type LayoutChangeEvent, type ScrollViewProps, type StyleProp, type ViewStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import Animated, { interpolate, useAnimatedScrollHandler, useAnimatedStyle, useSharedValue, Extrapolation } from "react-native-reanimated";
import { makeStyles, useTheme } from "../../theme/ThemeProvider";
import { enter } from "../../theme/motion";
import { useTabBarBottomInset } from "../../hooks/useTabBarBottomInset";
import { withAlpha } from "../../utils/color";
import { IconButton } from "./IconButton";
import { Txt } from "./Txt";

interface ScreenProps {
  title?: string;
  eyebrow?: string;
  // Tab roots: the 40pt serif title. Pushed screens get a 30pt one.
  large?: boolean;
  onBack?: () => void;
  backIcon?: "chevron-back" | "close";
  // Actions on the right of the top bar (IconButtons).
  right?: ReactNode;
  // Pinned to the bottom above a fade — the screen's primary action.
  footer?: ReactNode;
  // Inside the tab navigator: no bottom safe-area edge, and room for the
  // floating iOS tab bar.
  tabRoot?: boolean;
  // false: children fill a plain flex column (for lists that scroll
  // themselves). The title doesn't collapse then.
  scroll?: boolean;
  // The title, then the content, fade up on first mount. (Not per child: a
  // child component that renders nothing would still take a slot. Use
  // <Enter> for finer staggering.)
  stagger?: boolean;
  contentStyle?: StyleProp<ViewStyle>;
  refreshControl?: ScrollViewProps["refreshControl"];
  keyboardShouldPersistTaps?: ScrollViewProps["keyboardShouldPersistTaps"];
  scrollRef?: Ref<Animated.ScrollView>;
  children?: ReactNode;
}

const BAR_HEIGHT = 44;

// The layout every scrolling screen shares: a top bar (back, actions), a
// serif title that hands off to a small one in the bar as you scroll, the
// content in a column with the screen gutter, and an optional pinned footer.
export function Screen({
  title,
  eyebrow,
  large,
  onBack,
  backIcon = "chevron-back",
  right,
  footer,
  tabRoot,
  scroll = true,
  stagger = true,
  contentStyle,
  refreshControl,
  keyboardShouldPersistTaps,
  scrollRef,
  children,
}: ScreenProps) {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const tabInset = useTabBarBottomInset();
  const scrollY = useSharedValue(0);
  const [titleBottom, setTitleBottom] = useState(60);
  const [footerHeight, setFooterHeight] = useState(0);
  const bottomInset = tabRoot ? tabInset : insets.bottom;

  const onScroll = useAnimatedScrollHandler((e) => {
    scrollY.value = e.contentOffset.y;
  });
  const compactTitle = useAnimatedStyle(() => ({
    opacity: interpolate(scrollY.value, [titleBottom - 16, titleBottom + 4], [0, 1], Extrapolation.CLAMP),
    transform: [{ translateY: interpolate(scrollY.value, [titleBottom - 16, titleBottom + 4], [6, 0], Extrapolation.CLAMP) }],
  }));
  const barEdge = useAnimatedStyle(() => ({
    opacity: interpolate(scrollY.value, [0, 12], [0, 1], Extrapolation.CLAMP),
  }));

  const showBar = !!(onBack || right || (scroll && title));
  const titleBlock =
    title || eyebrow ? (
      <Animated.View entering={stagger ? enter(0) : undefined} style={styles.titleBlock} onLayout={(e: LayoutChangeEvent) => setTitleBottom(e.nativeEvent.layout.y + e.nativeEvent.layout.height)}>
        {eyebrow ? (
          <Txt variant="footnote" weight="500" tone="secondary">
            {eyebrow}
          </Txt>
        ) : null}
        {title ? (
          <Txt variant={large ? "largeTitle" : "title1"} numberOfLines={3}>
            {title}
          </Txt>
        ) : null}
      </Animated.View>
    ) : null;


  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      {showBar ? (
        <View style={styles.bar}>
          <View style={styles.barSide}>
            {onBack ? <IconButton icon={backIcon} onPress={onBack} accessibilityLabel={backIcon === "close" ? "Close" : "Back"} size={38} /> : null}
          </View>
          {scroll && title ? (
            <Animated.View style={[styles.barTitle, compactTitle]} pointerEvents="none">
              <Txt variant="headline" numberOfLines={1}>
                {title}
              </Txt>
            </Animated.View>
          ) : null}
          <View style={[styles.barSide, styles.barRight]}>{right}</View>
          {scroll ? <Animated.View style={[styles.barEdge, barEdge]} /> : null}
        </View>
      ) : null}

      {scroll ? (
        <Animated.ScrollView
          ref={scrollRef}
          onScroll={onScroll}
          scrollEventThrottle={16}
          showsVerticalScrollIndicator={false}
          refreshControl={refreshControl}
          keyboardShouldPersistTaps={keyboardShouldPersistTaps}
          contentContainerStyle={[styles.content, { paddingBottom: (footer ? footerHeight : bottomInset) + 32, paddingTop: showBar ? 4 : 16 }]}
        >
          {titleBlock}
          <Animated.View entering={stagger ? enter(1) : undefined} style={[styles.stack, contentStyle]}>
            {children}
          </Animated.View>
        </Animated.ScrollView>
      ) : (
        <View style={[styles.content, styles.fill, { paddingBottom: footer ? footerHeight : bottomInset }]}>
          {titleBlock}
          <Animated.View entering={stagger ? enter(1) : undefined} style={[styles.stack, styles.fill, contentStyle]}>
            {children}
          </Animated.View>
        </View>
      )}

      {footer ? (
        <View style={styles.footer} onLayout={(e: LayoutChangeEvent) => setFooterHeight(e.nativeEvent.layout.height)}>
          <LinearGradient colors={[withAlpha(colors.background, 0), colors.background]} style={styles.footerFade} pointerEvents="none" />
          <View style={[styles.footerBody, { paddingBottom: Math.max(bottomInset, 12) + 8 }]}>{footer}</View>
        </View>
      ) : null}
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  root: { flex: 1, backgroundColor: t.colors.background },
  fill: { flex: 1 },
  bar: {
    height: BAR_HEIGHT,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: t.layout.gutter - 4,
    backgroundColor: t.colors.background,
    zIndex: 2,
  },
  barSide: { minWidth: 44, flexDirection: "row", alignItems: "center", gap: t.space.xs },
  barRight: { justifyContent: "flex-end" },
  barTitle: { position: "absolute", left: 72, right: 72, alignItems: "center" },
  barEdge: { position: "absolute", left: 0, right: 0, bottom: 0, height: StyleSheet.hairlineWidth, backgroundColor: t.colors.separator },
  content: { paddingHorizontal: t.layout.gutter, gap: t.space.md },
  stack: { gap: t.space.md + 4 },
  titleBlock: { gap: 2, marginBottom: t.space.xs },
  footer: { position: "absolute", left: 0, right: 0, bottom: 0 },
  footerFade: { height: 28 },
  footerBody: { backgroundColor: t.colors.background, paddingHorizontal: t.layout.gutter, gap: t.space.sm },
}));
