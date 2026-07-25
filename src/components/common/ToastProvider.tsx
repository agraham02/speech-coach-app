import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { StyleSheet, Text } from "react-native";
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withSpring, withTiming } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, radii, spacing, typography } from "../../theme/theme";

type ToastTone = "success" | "error" | "info";

interface ToastMessage {
  id: string;
  text: string;
  tone: ToastTone;
}

const TONE_COLOR: Record<ToastTone, string> = {
  success: colors.success,
  error: colors.danger,
  info: colors.accent,
};

const DISMISS_AFTER_MS = 2800;

const ToastContext = createContext<((text: string, tone?: ToastTone) => void) | null>(null);

// Lets non-component code (the background processing pipeline, which has no
// access to React context) surface a toast too — e.g. "session graded" or a
// streak milestone, regardless of which screen happens to be open when the
// pipeline finishes. No-ops if the provider hasn't mounted yet.
let globalShow: ((text: string, tone?: ToastTone) => void) | null = null;
export function showGlobalToast(text: string, tone: ToastTone = "info"): void {
  globalShow?.(text, tone);
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const insets = useSafeAreaInsets();
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const opacity = useSharedValue(0);
  const translateY = useSharedValue(-16);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = useCallback((text: string, tone: ToastTone = "info") => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);

    setToast({ id: `${Date.now()}`, text, tone });
    opacity.value = withTiming(1, { duration: 180 });
    translateY.value = withSpring(0, { damping: 16, stiffness: 180 });

    timeoutRef.current = setTimeout(() => {
      opacity.value = withTiming(0, { duration: 220 });
      translateY.value = withTiming(-16, { duration: 220 }, (finished) => {
        if (finished) runOnJS(setToast)(null);
      });
    }, DISMISS_AFTER_MS);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
          style={[styles.toast, animatedStyle, { top: insets.top + spacing.sm, borderColor: TONE_COLOR[toast.tone] }]}
          pointerEvents="none"
        >
          <Text style={styles.text}>{toast.text}</Text>
        </Animated.View>
      ) : null}
    </ToastContext.Provider>
  );
}

export function useToast(): (text: string, tone?: ToastTone) => void {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within a ToastProvider");
  return ctx;
}

const styles = StyleSheet.create({
  toast: {
    position: "absolute",
    left: spacing.lg,
    right: spacing.lg,
    backgroundColor: colors.surfaceRaised,
    borderWidth: 1,
    borderRadius: radii.md,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.md,
    zIndex: 100,
  },
  text: { color: colors.textPrimary, fontSize: typography.body, fontWeight: "600", textAlign: "center" },
});
