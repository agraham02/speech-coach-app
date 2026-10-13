import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { Platform, StyleSheet, View } from "react-native";
import { BottomTabBarHeightContext } from "@react-navigation/bottom-tabs";
import { useIsFocused } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import Animated, { FadeInDown, FadeInUp, FadeOut } from "react-native-reanimated";
import { GUIDE_TIPS, type GuideId } from "../../content/guide";
import { getGuideSeen, isGuideOff, isOnboardingComplete, markGuideSeen, setGuideOff } from "../../services/prefs/prefsStore";
import { useTabBarBottomInset } from "../../hooks/useTabBarBottomInset";
import { duration, easeOut } from "../../theme/motion";
import { makeStyles, useTheme } from "../../theme/ThemeProvider";
import { PrimaryButton } from "./PrimaryButton";
import { PressableScale } from "./PressableScale";
import { Txt } from "./Txt";

// The app guide (content/guide.ts): one tip the first time you reach each
// tab or feature. Screens drop in <GuideTip id="…" />, which renders nothing
// in place — the tip itself floats from one host at the app root, so it sits
// the same on every kind of screen and only one ever shows at a time.

// Lets the screen settle (and its entrance animation finish) first.
const SHOW_AFTER_MS = 700;

interface Active {
  id: GuideId;
  // Room to leave at the bottom (the tab bar, on tab screens).
  bottomOffset: number;
}

interface GuideApi {
  show: (active: Active) => void;
  hide: (id: GuideId) => void;
}

const GuideContext = createContext<GuideApi | null>(null);

export function GuideProvider({ children }: { children: ReactNode }) {
  const [active, setActive] = useState<Active | null>(null);
  const show = useCallback((next: Active) => setActive(next), []);
  const hide = useCallback((id: GuideId) => setActive((current) => (current?.id === id ? null : current)), []);
  const api = useMemo(() => ({ show, hide }), [show, hide]);
  return (
    <GuideContext.Provider value={api}>
      {children}
      {active ? <TipCard key={active.id} active={active} onClose={() => setActive(null)} /> : null}
    </GuideContext.Provider>
  );
}

const eligible = (id: GuideId) => isOnboardingComplete() && !isGuideOff() && !getGuideSeen().includes(id);

// Asks for this screen's tip while it's focused, if it hasn't been seen.
// `inline` draws it right here instead — for screens presented as native
// modals (Settings), which cover anything drawn at the app root.
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
    const timer = setTimeout(() => (inline ? setShownInline(true) : api.show({ id, bottomOffset: tabBar })), SHOW_AFTER_MS);
    return () => {
      clearTimeout(timer);
      // Leaving the screen takes its tip with it (still unseen).
      api.hide(id);
    };
  }, [api, focused, id, tabBar, inline]);

  if (!inline || !shownInline) return null;
  return (
    <Animated.View entering={FadeInDown.duration(duration.slow).easing(easeOut)} exiting={FadeOut.duration(duration.fast)}>
      <TipBody id={id} onClose={() => setShownInline(false)} />
    </Animated.View>
  );
}

function TipCard({ active, onClose }: { active: Active; onClose: () => void }) {
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const top = GUIDE_TIPS[active.id].placement === "top";
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
        <TipBody id={active.id} onClose={onClose} floating />
      </Animated.View>
    </View>
  );
}

function TipBody({ id, onClose, floating }: { id: GuideId; onClose: () => void; floating?: boolean }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const tip = GUIDE_TIPS[id];

  function gotIt() {
    markGuideSeen(id);
    onClose();
  }

  function turnOff() {
    markGuideSeen(id);
    setGuideOff(true);
    onClose();
  }

  return (
    <View style={[styles.card, floating && styles.floating]} accessibilityRole="alert" accessibilityLiveRegion="polite">
      <View style={styles.head}>
        <Ionicons name="sparkles-outline" size={16} color={colors.onAccent} />
        <Txt variant="headline" color={colors.onAccent} style={styles.flex}>
          {tip.title}
        </Txt>
      </View>
      <Txt variant="subhead" color={colors.onAccent} style={styles.body}>
        {tip.body}
      </Txt>
      <View style={styles.actions}>
        <PressableScale onPress={turnOff} hitSlop={10} accessibilityRole="button" accessibilityHint="Stops showing tips. Settings can bring them back.">
          <Txt variant="footnote" weight="500" color={colors.onAccent} style={styles.dim}>
            Turn off tips
          </Txt>
        </PressableScale>
        <PrimaryButton label="Got it" size="sm" variant="secondary" onPress={gotIt} />
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
  dim: { opacity: 0.7 },
}));
