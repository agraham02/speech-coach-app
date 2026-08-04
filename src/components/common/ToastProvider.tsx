import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { Pressable, StyleSheet, Text } from "react-native";
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withSpring, withTiming } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, radii, spacing, typography } from "../../theme/theme";

type ToastTone = "success" | "error" | "info";
type ShowToast = (text: string, tone?: ToastTone, onPress?: () => void) => void;

interface ToastMessage {
  id: string;
  text: string;
  tone: ToastTone;
  onPress?: () => void;
}

const TONE_COLOR: Record<ToastTone, string> = {
  success: colors.success,
  error: colors.danger,
  info: colors.accent,
};

const DISMISS_AFTER_MS = 2800;

const ToastContext = createContext<ShowToast | null>(null);

// Lets non-component code (the background processing pipeline, which has no
// access to React context) surface a toast too — e.g. "session graded" or a
// streak milestone, regardless of which screen happens to be open when the
// pipeline finishes. No-ops if the provider hasn't mounted yet. `onPress` lets
// the pipeline attach a tap-to-view action (e.g. jump to the Result screen)
// without ever forcing that navigation automatically.
let globalShow: ShowToast | null = null;
export function showGlobalToast(text: string, tone: ToastTone = "info", onPress?: () => void): void {
  globalShow?.(text, tone, onPress);
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const insets = useSafeAreaInsets();
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const opacity = useSharedValue(0);
  const translateY = useSharedValue(-16);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const dismiss = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    opacity.value = withTiming(0, { duration: 220 });
    translateY.value = withTiming(-16, { duration: 220 }, (finished) => {
      if (finished) runOnJS(setToast)(null);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const show = useCallback<ShowToast>((text, tone = "info", onPress) => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);

    setToast({ id: `${Date.now()}`, text, tone, onPress });
    opacity.value = withTiming(1, { duration: 180 });
    translateY.value = withSpring(0, { damping: 16, stiffness: 180 });

    timeoutRef.current = setTimeout(dismiss, DISMISS_AFTER_MS);
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
          style={[styles.toast, animatedStyle, { top: insets.top + spacing.sm, borderColor: TONE_COLOR[toast.tone] }]}
          pointerEvents={toast.onPress ? "auto" : "none"}
        >
          {toast.onPress ? (
            <Pressable
              onPress={() => {
                toast.onPress?.();
                dismiss();
              }}
            >
              <Text style={styles.text}>{toast.text}</Text>
            </Pressable>
          ) : (
            <Text style={styles.text}>{toast.text}</Text>
          )}
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
