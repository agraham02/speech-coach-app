import { Children, Fragment, isValidElement, useEffect, useState, type ReactNode } from "react";
import { StyleSheet, View, type LayoutChangeEvent } from "react-native";
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from "react-native-reanimated";
import { makeStyles, useTheme } from "../../theme/ThemeProvider";
import { duration, easeOut } from "../../theme/motion";
import { tick } from "../../utils/haptics";
import { PressableScale } from "../common/PressableScale";
import { Txt } from "../common/Txt";
import { Chevron } from "./Chevron";
import { accordionTiming } from "./displayLogic";

export interface AccordionProps {
  title: string;
  subtitle?: string;
  // Controlled: pass `open` and update it from `onToggle`. Uncontrolled: omit
  // `open` and optionally set `defaultOpen`.
  open?: boolean;
  defaultOpen?: boolean;
  onToggle?: (open: boolean) => void;
  children?: ReactNode;
  accessibilityLabel?: string;
  testID?: string;
}

// A row that opens to show more. The header is a 56dp-tall button (title, an
// optional quiet subtitle, a chevron that turns from down to up); the body
// eases open in height and fades. With Reduce Motion the body shows and hides
// with a short fade and no movement. Each toggle gives a light tick.
export function Accordion({ title, subtitle, open: openProp, defaultOpen = false, onToggle, children, accessibilityLabel, testID }: AccordionProps) {
  const styles = useStyles();
  const { colors } = useTheme();
  const reduced = useReducedMotion();
  const [inner, setInner] = useState(defaultOpen);
  const open = openProp ?? inner;

  // 0 closed, 1 open: drives height and chevron; the fade has its own timing.
  const progress = useSharedValue(open ? 1 : 0);
  const fade = useSharedValue(open ? 1 : 0);
  const measured = useSharedValue(0);

  useEffect(() => {
    const target = open ? 1 : 0;
    const timing = accordionTiming(reduced, duration);
    progress.value = timing.height === 0 ? target : withTiming(target, { duration: timing.height, easing: easeOut });
    fade.value = withTiming(target, { duration: timing.fade, easing: easeOut });
  }, [open, reduced, progress, fade]);

  const bodyStyle = useAnimatedStyle(() => ({ height: progress.value * measured.value, opacity: fade.value }));
  const chevronStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${progress.value * 180}deg` }] }));

  const toggle = () => {
    const next = !open;
    tick();
    if (openProp === undefined) setInner(next);
    onToggle?.(next);
  };

  return (
    <View testID={testID}>
      <PressableScale
        onPress={toggle}
        scaleTo={0.99}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel ?? (subtitle ? `${title}, ${subtitle}` : title)}
        accessibilityState={{ expanded: open }}
        style={styles.header}
      >
        <View style={styles.titles}>
          <Txt variant="headline">{title}</Txt>
          {subtitle ? (
            <Txt variant="footnote" tone="secondary">
              {subtitle}
            </Txt>
          ) : null}
        </View>
        <Animated.View style={chevronStyle}>
          <Chevron color={colors.textMuted} direction="down" />
        </Animated.View>
      </PressableScale>
      <Animated.View
        style={[styles.clip, bodyStyle]}
        pointerEvents={open ? "auto" : "none"}
        importantForAccessibility={open ? "auto" : "no-hide-descendants"}
        accessibilityElementsHidden={!open}
      >
        {/* Laid out at its natural height (absolute, so the clip can't squash
            it) and measured; the clip animates between 0 and that. */}
        <View
          style={styles.measure}
          onLayout={(e: LayoutChangeEvent) => {
            measured.value = e.nativeEvent.layout.height;
          }}
        >
          {children}
        </View>
      </Animated.View>
    </View>
  );
}

// Accordions on one surface with a hairline between them, inset 16.
export function AccordionGroup({ children }: { children: ReactNode }) {
  const styles = useStyles();
  const rows = Children.toArray(children).filter(isValidElement);
  return (
    <View>
      {rows.map((row, i) => (
        <Fragment key={row.key ?? i}>
          {i > 0 ? <View style={styles.hairline} /> : null}
          {row}
        </Fragment>
      ))}
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  header: { minHeight: 56, paddingVertical: 10, paddingHorizontal: 16, flexDirection: "row", alignItems: "center", columnGap: 12 },
  titles: { flex: 1, gap: 1 },
  clip: { overflow: "hidden" },
  measure: { position: "absolute", top: 0, left: 0, right: 0, paddingHorizontal: 16, paddingBottom: 12 },
  hairline: { height: StyleSheet.hairlineWidth, backgroundColor: t.colors.separator, marginLeft: 16 },
}));
