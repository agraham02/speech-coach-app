import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import {
  BackHandler,
  Platform,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { BottomTabBarHeightContext } from "@react-navigation/bottom-tabs";
import { useIsFocused } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import Animated, { FadeIn, FadeInDown, FadeInUp, FadeOut, useAnimatedProps, useSharedValue, withTiming } from "react-native-reanimated";
import Svg, { Path } from "react-native-svg";
import { GUIDES, type GuideId, type GuideStep, type TourTargetId } from "../../content/guide";
import { getGuideSeen, isGuideOff, isOnboardingComplete, markGuideSeen, setGuideOff } from "../../services/prefs/prefsStore";
import { useTabBarBottomInset } from "../../hooks/useTabBarBottomInset";
import { duration, easeOut } from "../../theme/motion";
import { tick } from "../../utils/haptics";
import { makeStyles, useTheme } from "../../theme/ThemeProvider";
import { PrimaryButton } from "./PrimaryButton";
import { PressableScale } from "./PressableScale";
import { Txt } from "./Txt";

// The app guide (content/guide.ts): a short tour the first time you reach
// each tab or feature. Screens drop in <GuideTip id="…" />, which renders
// nothing in place — the tour itself is drawn by one host at the app root,
// so only one ever shows at a time.
//
// A step that points at something (<TourTarget id="…">) scrolls it into
// view, dims the rest of the screen and cuts a spotlight around it, with
// the card beside it. A single tip with nothing to point at stays the quiet
// floating card it always was, and doesn't block the screen.

// Lets the screen settle (and its entrance animation finish) first.
const SHOW_AFTER_MS = 700;
// How long a scroll into view takes before the spotlight measures again.
const SCROLL_SETTLE_MS = 420;
const HOLE_PADDING = 8;
const HOLE_RADIUS = 18;
const SCRIM = "rgba(0,0,0,0.62)";

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

// How a scrolling screen brings a target into view (see Screen.tsx).
// `reveal` takes the target's window position and scrolls if it isn't
// comfortably visible; it returns whether it scrolled.
export interface TourScroll {
  reveal: (windowY: number, height: number) => boolean;
}

export const TourScrollContext = createContext<TourScroll | null>(null);

interface Target {
  ref: RefObject<View | null>;
  scroll: TourScroll | null;
}

interface Active {
  id: GuideId;
  steps: GuideStep[];
  // Room to leave at the bottom (the tab bar, on tab screens).
  bottomOffset: number;
}

interface GuideApi {
  show: (id: GuideId, bottomOffset: number) => void;
  hide: (id: GuideId) => void;
  register: (id: TourTargetId, target: Target) => void;
  unregister: (id: TourTargetId, target: Target) => void;
}

const GuideContext = createContext<GuideApi | null>(null);

export function GuideProvider({ children }: { children: ReactNode }) {
  const [active, setActive] = useState<Active | null>(null);
  const targets = useRef(new Map<TourTargetId, Target>());

  const show = useCallback((id: GuideId, bottomOffset: number) => {
    // Only the steps that can show here: a target that isn't on screen
    // (a card that only appears some days) drops its step.
    const steps = (GUIDES[id] as GuideStep[]).filter((s) => !s.target || targets.current.has(s.target));
    if (steps.length) setActive({ id, steps, bottomOffset });
  }, []);
  const hide = useCallback((id: GuideId) => setActive((current) => (current?.id === id ? null : current)), []);
  const register = useCallback((id: TourTargetId, target: Target) => {
    targets.current.set(id, target);
  }, []);
  const unregister = useCallback((id: TourTargetId, target: Target) => {
    if (targets.current.get(id) === target) targets.current.delete(id);
  }, []);
  const api = useMemo(() => ({ show, hide, register, unregister }), [show, hide, register, unregister]);

  const finish = useCallback(() => {
    setActive((current) => {
      if (current) markGuideSeen(current.id);
      return null;
    });
  }, []);

  const tour = active && (active.steps.length > 1 || !!active.steps[0].target);
  return (
    <GuideContext.Provider value={api}>
      {children}
      {active && tour ? <TourOverlay key={active.id} active={active} targets={targets.current} onClose={finish} /> : null}
      {active && !tour ? <TipCard key={active.id} active={active} onClose={() => setActive(null)} /> : null}
    </GuideContext.Provider>
  );
}

const eligible = (id: GuideId) => isOnboardingComplete() && !isGuideOff() && !getGuideSeen().includes(id);

// Asks for this screen's tour while it's focused, if it hasn't been seen.
// `inline` draws a single tip right here instead — for screens presented as
// native modals (Settings), which cover anything drawn at the app root.
export function GuideTip({ id, inline }: { id: GuideId; inline?: boolean }) {
  const api = useContext(GuideContext);
  const focused = useIsFocused();
  // The tab bar to clear: iOS's floating native bar, or Android's JS one.
  const nativeTabBar = useTabBarBottomInset();
  const jsTabBar = useContext(BottomTabBarHeightContext);
  const tabBar = Platform.OS === "ios" ? nativeTabBar : (jsTabBar ?? 0);
  const [shownInline, setShownInline] = useState(false);

  useEffect(() => {
    if (!api || !focused || !eligible(id)) return;
    const timer = setTimeout(() => (inline ? setShownInline(true) : api.show(id, tabBar)), SHOW_AFTER_MS);
    return () => {
      clearTimeout(timer);
      // Leaving the screen takes its tip with it (still unseen).
      api.hide(id);
    };
  }, [api, focused, id, tabBar, inline]);

  if (!inline || !shownInline) return null;
  function done(turnOff: boolean) {
    markGuideSeen(id);
    if (turnOff) setGuideOff(true);
    setShownInline(false);
  }
  return (
    <Animated.View entering={FadeInDown.duration(duration.slow).easing(easeOut)} exiting={FadeOut.duration(duration.fast)}>
      <TipBody step={GUIDES[id][0]} onDone={() => done(false)} onTurnOff={() => done(true)} />
    </Animated.View>
  );
}

// For a screen with its own ScrollView rather than <Screen>: spread
// `scrollProps` on the ScrollView and wrap it in
// <TourScrollContext.Provider value={tourScroll}>, so a tour can scroll
// to targets inside it.
export function useTourScroll(reservedBottom = 200) {
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const ref = useRef<ScrollView>(null);
  const y = useRef(0);
  const tourScroll = useMemo<TourScroll>(
    () => ({
      reveal: (windowY, h) => {
        const top = insets.top + 64;
        const bottom = height - reservedBottom;
        if (windowY >= top && windowY + Math.min(h, bottom - top) <= bottom) return false;
        ref.current?.scrollTo({ y: Math.max(0, y.current + windowY - top - 8), animated: true });
        return true;
      },
    }),
    [height, insets.top, reservedBottom],
  );
  const scrollProps = {
    ref,
    scrollEventThrottle: 32,
    onScroll: (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      y.current = e.nativeEvent.contentOffset.y;
    },
  };
  return { tourScroll, scrollProps };
}

// Marks part of a screen a tour can point at. Renders a plain View around
// its children, so give it the layout style the children had, if any.
// Without an id it's just that View (for one item of a list).
export function TourTarget({ id, children, style }: { id?: TourTargetId; children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const api = useContext(GuideContext);
  const scroll = useContext(TourScrollContext);
  const ref = useRef<View>(null);
  useEffect(() => {
    if (!api || !id) return;
    const target = { ref, scroll };
    api.register(id, target);
    return () => api.unregister(id, target);
  }, [api, id, scroll]);
  return (
    <View ref={ref} collapsable={false} style={style}>
      {children}
    </View>
  );
}

function measure(ref: RefObject<View | null>): Promise<Rect | null> {
  return new Promise((resolve) => {
    const node = ref.current;
    if (!node) return resolve(null);
    node.measureInWindow((x, y, width, height) => resolve(width > 0 && height > 0 ? { x, y, width, height } : null));
  });
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const AnimatedPath = Animated.createAnimatedComponent(Path);

function TourOverlay({ active, targets, onClose }: { active: Active; targets: Map<TourTargetId, Target>; onClose: () => void }) {
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const { width: W, height: H } = useWindowDimensions();
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const [measuring, setMeasuring] = useState(false);
  const step = active.steps[index];
  const last = index === active.steps.length - 1;

  // The spotlight's hole, eased from one target to the next; no target is
  // a zero-size hole in the middle (a plain dimmed screen).
  const hx = useSharedValue(W / 2);
  const hy = useSharedValue(H / 2);
  const hw = useSharedValue(0);
  const hh = useSharedValue(0);

  useEffect(() => {
    let cancelled = false;
    setRect(null);
    const target = step.target ? targets.get(step.target) : undefined;
    if (!target) {
      setMeasuring(false);
      return;
    }
    setMeasuring(true);
    (async () => {
      const first = await measure(target.ref);
      if (cancelled) return;
      if (!first) {
        // Nothing to point at after all (it rendered empty): just the card.
        setMeasuring(false);
        return;
      }
      if (target.scroll?.reveal(first.y, first.height)) await wait(SCROLL_SETTLE_MS);
      const r = (await measure(target.ref)) ?? first;
      if (cancelled) return;
      setRect(r);
      setMeasuring(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [step, targets]);

  useEffect(() => {
    const timing = { duration: duration.slow, easing: easeOut };
    if (rect) {
      hx.value = withTiming(rect.x - HOLE_PADDING, timing);
      hy.value = withTiming(rect.y - HOLE_PADDING, timing);
      hw.value = withTiming(rect.width + HOLE_PADDING * 2, timing);
      hh.value = withTiming(rect.height + HOLE_PADDING * 2, timing);
    } else if (!measuring) {
      hx.value = withTiming(W / 2, timing);
      hy.value = withTiming(H / 2, timing);
      hw.value = withTiming(0, timing);
      hh.value = withTiming(0, timing);
    }
  }, [rect, measuring, W, H, hx, hy, hw, hh]);

  const hole = useAnimatedProps(() => {
    const x = hx.value;
    const y = hy.value;
    const w = hw.value;
    const h = hh.value;
    const r = Math.min(HOLE_RADIUS, w / 2, h / 2);
    return {
      d:
        `M0 0H${W}V${H}H0Z ` +
        `M${x + r} ${y}H${x + w - r}A${r} ${r} 0 0 1 ${x + w} ${y + r}V${y + h - r}A${r} ${r} 0 0 1 ${x + w - r} ${y + h}` +
        `H${x + r}A${r} ${r} 0 0 1 ${x} ${y + h - r}V${y + r}A${r} ${r} 0 0 1 ${x + r} ${y}Z`,
    };
  });

  // Android's back button leaves the tour, like Skip.
  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      onClose();
      return true;
    });
    return () => sub.remove();
  }, [onClose]);

  function go(next: number) {
    tick();
    if (next >= active.steps.length) onClose();
    else setIndex(Math.max(0, next));
  }

  // The card goes on whichever side of the spotlight has more room;
  // untargeted steps sit where the step asks.
  let cardPosition: ViewStyle;
  if (rect) {
    const above = rect.y - HOLE_PADDING - insets.top;
    const below = H - (rect.y + rect.height + HOLE_PADDING) - insets.bottom;
    cardPosition =
      below >= above
        ? { top: Math.min(rect.y + rect.height + HOLE_PADDING + 12, H - insets.bottom - 200) }
        : { bottom: Math.min(H - rect.y + HOLE_PADDING + 12, H - insets.top - 200) };
  } else {
    const bottom = active.bottomOffset > 0 ? active.bottomOffset + 8 : Math.max(insets.bottom, 12) + 8;
    cardPosition = step.placement === "top" ? { top: insets.top + 56 } : { bottom };
  }

  return (
    <Animated.View
      entering={FadeIn.duration(duration.base)}
      exiting={FadeOut.duration(duration.fast)}
      style={StyleSheet.absoluteFill}
      accessibilityViewIsModal
    >
      <Svg width={W} height={H} style={StyleSheet.absoluteFill} pointerEvents="none">
        <AnimatedPath animatedProps={hole} fill={SCRIM} fillRule="evenodd" />
      </Svg>
      {rect ? (
        <Animated.View
          key={`ring-${index}`}
          entering={FadeIn.delay(duration.base).duration(duration.base)}
          pointerEvents="none"
          style={[
            styles.ring,
            {
              left: rect.x - HOLE_PADDING,
              top: rect.y - HOLE_PADDING,
              width: rect.width + HOLE_PADDING * 2,
              height: rect.height + HOLE_PADDING * 2,
            },
          ]}
        />
      ) : null}
      {!measuring ? (
        <Animated.View
          key={`card-${index}`}
          entering={(rect && "top" in cardPosition ? FadeInDown : FadeInUp).duration(duration.slow).easing(easeOut)}
          style={[styles.wrap, cardPosition]}
        >
          <View style={[styles.card, styles.floating]} accessibilityRole="alert" accessibilityLiveRegion="polite">
            <TipHead title={step.title} />
            <TipText body={step.body} />
            <View style={styles.actions}>
              <View style={styles.tourLeft}>
                {active.steps.length > 1 ? (
                  <Txt variant="caption1" weight="500" style={styles.count}>
                    {index + 1} of {active.steps.length}
                  </Txt>
                ) : null}
                {!last ? (
                  <PressableScale onPress={onClose} hitSlop={10} accessibilityRole="button" accessibilityLabel="Skip the tour">
                    <Txt variant="footnote" weight="500" style={styles.dimOnAccent}>
                      Skip
                    </Txt>
                  </PressableScale>
                ) : (
                  <PressableScale
                    onPress={() => {
                      setGuideOff(true);
                      onClose();
                    }}
                    hitSlop={10}
                    accessibilityRole="button"
                    accessibilityHint="Stops showing tips. Settings can bring them back."
                  >
                    <Txt variant="footnote" weight="500" style={styles.dimOnAccent}>
                      Turn off tips
                    </Txt>
                  </PressableScale>
                )}
              </View>
              <View style={styles.tourButtons}>
                {index > 0 ? (
                  <PressableScale onPress={() => go(index - 1)} hitSlop={10} style={styles.back} accessibilityRole="button">
                    <Txt variant="footnote" weight="600" style={styles.dimOnAccent}>
                      Back
                    </Txt>
                  </PressableScale>
                ) : null}
                <PrimaryButton label={last ? "Got it" : "Next"} size="sm" variant="secondary" onPress={() => go(index + 1)} />
              </View>
            </View>
          </View>
        </Animated.View>
      ) : null}
    </Animated.View>
  );
}

function TipCard({ active, onClose }: { active: Active; onClose: () => void }) {
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const step = active.steps[0];
  const top = step.placement === "top";
  // A tab bar already includes the bottom safe area.
  const bottom = active.bottomOffset > 0 ? active.bottomOffset + 8 : Math.max(insets.bottom, 12) + 8;
  const position = top ? { top: insets.top + 56 } : { bottom };
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <Animated.View
        entering={(top ? FadeInUp : FadeInDown).duration(duration.slow).easing(easeOut)}
        exiting={FadeOut.duration(duration.fast)}
        style={[styles.wrap, position]}
      >
        <TipBody
          step={step}
          floating
          onDone={() => {
            markGuideSeen(active.id);
            onClose();
          }}
          onTurnOff={() => {
            markGuideSeen(active.id);
            setGuideOff(true);
            onClose();
          }}
        />
      </Animated.View>
    </View>
  );
}

function TipHead({ title }: { title: string }) {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <View style={styles.head}>
      <Ionicons name="sparkles-outline" size={16} color={colors.onAccent} />
      <Txt variant="headline" color={colors.onAccent} style={styles.flex}>
        {title}
      </Txt>
    </View>
  );
}

function TipText({ body }: { body: string }) {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <Txt variant="subhead" color={colors.onAccent} style={styles.body}>
      {body}
    </Txt>
  );
}

function TipBody({ step, onDone, onTurnOff, floating }: { step: GuideStep; onDone: () => void; onTurnOff: () => void; floating?: boolean }) {
  const styles = useStyles();
  return (
    <View style={[styles.card, floating && styles.floating]} accessibilityRole="alert" accessibilityLiveRegion="polite">
      <TipHead title={step.title} />
      <TipText body={step.body} />
      <View style={styles.actions}>
        <PressableScale onPress={onTurnOff} hitSlop={10} accessibilityRole="button" accessibilityHint="Stops showing tips. Settings can bring them back.">
          <Txt variant="footnote" weight="500" style={styles.dimOnAccent}>
            Turn off tips
          </Txt>
        </PressableScale>
        <PrimaryButton label="Got it" size="sm" variant="secondary" onPress={onDone} />
      </View>
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  wrap: { position: "absolute", left: t.layout.gutter, right: t.layout.gutter },
  card: {
    backgroundColor: t.colors.accent,
    borderRadius: t.radius.lg - 4,
    padding: t.space.md,
    gap: t.space.sm,
  },
  floating: { ...t.shadow.float },
  head: { flexDirection: "row", alignItems: "center", gap: t.space.sm },
  flex: { flex: 1 },
  body: { opacity: 0.86 },
  actions: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 2 },
  dimOnAccent: { color: t.colors.onAccent, opacity: 0.7 },
  count: { color: t.colors.onAccent, opacity: 0.6 },
  tourLeft: { flexDirection: "row", alignItems: "center", gap: t.space.md },
  tourButtons: { flexDirection: "row", alignItems: "center", gap: t.space.xs },
  back: { paddingHorizontal: t.space.sm },
  // The spotlight's edge: a soft light line, so the target reads as lifted.
  ring: { position: "absolute", borderRadius: HOLE_RADIUS, borderWidth: 2, borderColor: "rgba(255,255,255,0.85)" },
}));
