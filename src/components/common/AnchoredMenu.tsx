import { useEffect, useRef, useState, type ReactNode } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { PressableScale } from "./PressableScale";
import { Txt } from "./Txt";
import { duration, easeOut } from "../../theme/motion";
import { makeStyles, useTheme } from "../../theme/ThemeProvider";

export interface MenuOption {
  key: number;
  label: string;
  suffix?: string;
  disabled?: boolean;
  // Read out on a disabled option, to say why it can't be picked.
  disabledHint?: string;
}

interface AnchoredMenuProps {
  options: MenuOption[];
  selected: number;
  onPick: (key: number) => void;
  // The pill that opens the menu; `open` is true while the menu is showing.
  renderTrigger: (state: { open: boolean; onPress: () => void }) => ReactNode;
}

interface Anchor {
  x: number;
  y: number;
  width: number;
  height: number;
}

const ROW_HEIGHT = 44;
const VISIBLE_ROWS = 5;
const GAP = 6;
const PAD = 4;

// A traditional dropdown: a small panel that floats under the pill that
// opened it, only as wide as its options, over the screen — so opening it
// never moves anything else. Flips above the pill when there's no room below.
// It lives in a transparent Modal so a scrolling parent can't clip it and the
// back button closes it.
export function AnchoredMenu({ options, selected, onPick, renderTrigger }: AnchoredMenuProps) {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const window = useWindowDimensions();
  const reduceMotion = useReducedMotion();
  const triggerRef = useRef<View>(null);
  const scroll = useRef<ScrollView>(null);
  const progress = useSharedValue(0);
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const [visible, setVisible] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (closeTimer.current) clearTimeout(closeTimer.current);
    },
    [],
  );

  function open() {
    triggerRef.current?.measureInWindow((x, y, width, height) => {
      setAnchor({ x, y, width, height });
      setVisible(true);
      progress.value = withTiming(1, { duration: duration.base, easing: easeOut });
    });
  }

  function close(then?: () => void) {
    progress.value = withTiming(0, { duration: duration.fast });
    closeTimer.current = setTimeout(() => {
      setVisible(false);
      then?.();
    }, duration.fast);
  }

  const visibleRows = Math.min(options.length, VISIBLE_ROWS);
  const menuHeight = visibleRows * ROW_HEIGHT + PAD * 2;
  const below = anchor ? anchor.y + anchor.height + GAP + menuHeight <= window.height - insets.bottom - 12 : true;
  const selectedIndex = Math.max(0, options.findIndex((o) => o.key === selected));

  const panelAnimation = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ scale: reduceMotion ? 1 : 0.9 + 0.1 * progress.value }],
  }));

  const placement = anchor
    ? {
        // Right edges line up: the pills sit at the end of their row.
        right: Math.max(12, window.width - (anchor.x + anchor.width)),
        ...(below ? { top: anchor.y + anchor.height + GAP } : { bottom: window.height - anchor.y + GAP }),
        transformOrigin: below ? "top right" : "bottom right",
      }
    : null;

  return (
    <>
      <View ref={triggerRef} collapsable={false}>
        {renderTrigger({ open: visible, onPress: open })}
      </View>
      <Modal visible={visible} transparent animationType="none" onRequestClose={() => close()} statusBarTranslucent navigationBarTranslucent>
        <Pressable style={StyleSheet.absoluteFill} onPress={() => close()} accessibilityRole="button" accessibilityLabel="Close menu" />
        {placement ? (
          <Animated.View style={[styles.panel, placement as object, panelAnimation]}>
            <ScrollView
              ref={scroll}
              style={{ maxHeight: VISIBLE_ROWS * ROW_HEIGHT }}
              scrollEnabled={options.length > VISIBLE_ROWS}
              showsVerticalScrollIndicator={false}
              // Open with the current pick in view, a row from the top.
              onLayout={() => scroll.current?.scrollTo({ y: Math.max(0, (selectedIndex - 1) * ROW_HEIGHT), animated: false })}
            >
              {options.map((option) => {
                const on = option.key === selected;
                return (
                  <PressableScale
                    key={option.key}
                    onPress={() => close(() => onPick(option.key))}
                    disabled={option.disabled}
                    haptic="tick"
                    scaleTo={0.98}
                    style={[styles.option, on && styles.optionOn, option.disabled && styles.optionDisabled]}
                    accessibilityRole="button"
                    accessibilityLabel={option.suffix ? `${option.label} ${option.suffix}` : option.label}
                    accessibilityHint={option.disabled ? option.disabledHint : undefined}
                    accessibilityState={{ selected: on, disabled: option.disabled }}
                  >
                    <Txt variant="callout" weight={on ? "600" : "400"} tabular numberOfLines={1} color={on ? colors.onAccent : colors.textPrimary} style={styles.label}>
                      {option.label}
                      {option.suffix ? (
                        <Txt variant="callout" color={on ? colors.onAccent : colors.textSecondary}>
                          {` ${option.suffix}`}
                        </Txt>
                      ) : null}
                    </Txt>
                    {on ? <Ionicons name="checkmark" size={16} color={colors.onAccent} /> : null}
                  </PressableScale>
                );
              })}
            </ScrollView>
          </Animated.View>
        ) : null}
      </Modal>
    </>
  );
}

const useStyles = makeStyles((t) => ({
  panel: {
    position: "absolute",
    minWidth: 120,
    padding: PAD,
    borderRadius: 16,
    backgroundColor: t.colors.surfaceRaised,
    ...t.shadow.float,
  },
  option: { flexDirection: "row", alignItems: "center", height: ROW_HEIGHT, paddingHorizontal: t.space.md, borderRadius: 12, gap: t.space.sm },
  optionOn: { backgroundColor: t.colors.accent },
  optionDisabled: { opacity: 0.35 },
  label: { flex: 1 },
}));
