import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { Pressable, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withSpring, withTiming } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { makeStyles, useTheme } from "../../theme/ThemeProvider";
import type { Colors } from "../../theme/theme";
import { spring } from "../../theme/motion";
import { success as hapticSuccess, warn as hapticWarn } from "../../utils/haptics";
import { Txt } from "./Txt";

type ToastTone = "success" | "error" | "info";
// durationMs: how long it stays (default 2.8 s). actionLabel: a word shown at
// the end that the tap on the toast stands for ("Undo"). exclusive: other
// toasts wait their turn until this one is gone, so a chance to undo isn't
// covered by an unrelated message.
interface ToastOptions {
  durationMs?: number;
  actionLabel?: string;
  exclusive?: boolean;
}
type ShowToast = (text: string, tone?: ToastTone, onPress?: () => void, options?: ToastOptions) => void;

interface ToastMessage {
  id: string;
  text: string;
  tone: ToastTone;
  onPress?: () => void;
  actionLabel?: string;
}

const TONE_ICONS: Record<ToastTone, keyof typeof Ionicons.glyphMap> = {
  success: "checkmark-circle",
  error: "alert-circle",
  info: "sparkles",
};

const toneColors = (colors: Colors): Record<ToastTone, string> => ({
  success: colors.success,
  error: colors.danger,
  info: colors.textSecondary,
});

const DISMISS_AFTER_MS = 2800;

const ToastContext = createContext<ShowToast | null>(null);

// Lets non-component code (the background processing pipeline, which has no
// access to React context) surface a toast too — e.g. "session graded" or a
// streak milestone, regardless of which screen happens to be open when the
// pipeline finishes. No-ops if the provider hasn't mounted yet. `onPress` lets
// the pipeline attach a tap-to-view action (e.g. jump to the Result screen)
// without ever forcing that navigation automatically.
let globalShow: ShowToast | null = null;
export function showGlobalToast(text: string, tone: ToastTone = "info", onPress?: () => void, options?: ToastOptions): void {
  globalShow?.(text, tone, onPress, options);
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const opacity = useSharedValue(0);
  const translateY = useSharedValue(-16);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // While an exclusive toast is up, other toasts are dropped.
  const exclusiveUntil = useRef(0);

  const dismiss = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    exclusiveUntil.current = 0;
    opacity.value = withTiming(0, { duration: 220 });
    translateY.value = withTiming(-16, { duration: 220 }, (finished) => {
      if (finished) runOnJS(setToast)(null);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const show = useCallback<ShowToast>((text, tone = "info", onPress, options) => {
    if (!options?.exclusive && Date.now() < exclusiveUntil.current) return;
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    const duration = options?.durationMs ?? DISMISS_AFTER_MS;
    exclusiveUntil.current = options?.exclusive ? Date.now() + duration : 0;

    setToast({ id: `${Date.now()}`, text, tone, onPress, actionLabel: options?.actionLabel });
    if (tone === "success") hapticSuccess();
    else if (tone === "error") hapticWarn();
    opacity.value = withTiming(1, { duration: 180 });
    translateY.value = withSpring(0, spring.gentle);

    timeoutRef.current = setTimeout(dismiss, duration);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dismiss]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  useEffect(() => {
    globalShow = show;
    return () => {
      globalShow = null;
    };
  }, [show]);

  return (
    <ToastContext.Provider value={show}>
      {children}
      {toast ? (
        <Animated.View
          style={[styles.toast, animatedStyle, { top: insets.top + 8 }]}
          pointerEvents={toast.onPress ? "auto" : "none"}
        >
          <Pressable
            disabled={!toast.onPress}
            onPress={() => {
              toast.onPress?.();
              dismiss();
            }}
            style={styles.body}
          >
            <Ionicons name={TONE_ICONS[toast.tone]} size={18} color={toneColors(colors)[toast.tone]} />
            <Txt variant="subhead" weight="600" style={styles.text}>
              {toast.text}
            </Txt>
            {toast.actionLabel ? (
              <Txt variant="subhead" weight="600" style={styles.action}>
                {toast.actionLabel}
              </Txt>
            ) : toast.onPress ? (
              <View style={styles.chevron}>
                <Ionicons name="chevron-forward" size={15} color={colors.textMuted} />
              </View>
            ) : null}
          </Pressable>
        </Animated.View>
      ) : null}
    </ToastContext.Provider>
  );
}

export function useToast(): ShowToast {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within a ToastProvider");
  return ctx;
}

const useStyles = makeStyles((t) => ({
  toast: {
    position: "absolute",
    alignSelf: "center",
    maxWidth: "88%",
    backgroundColor: t.scheme === "dark" ? t.colors.surfaceRaised : t.colors.surface,
    borderRadius: t.radius.pill,
    zIndex: 100,
    ...t.shadow.float,
  },
  body: { flexDirection: "row", alignItems: "center", gap: t.space.sm, paddingVertical: 11, paddingLeft: 14, paddingRight: 18 },
  text: { flexShrink: 1 },
  chevron: { marginLeft: -2 },
  action: { color: t.colors.accent, marginLeft: t.space.xs },
}));
