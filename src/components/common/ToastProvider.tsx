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
type ShowToast = (text: string, tone?: ToastTone, onPress?: () => void) => void;

interface ToastMessage {
  id: string;
  text: string;
  tone: ToastTone;
  onPress?: () => void;
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
export function showGlobalToast(text: string, tone: ToastTone = "info", onPress?: () => void): void {
  globalShow?.(text, tone, onPress);
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const styles = useStyles();
  const { colors } = useTheme();
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
    if (tone === "success") hapticSuccess();
    else if (tone === "error") hapticWarn();
    opacity.value = withTiming(1, { duration: 180 });
    translateY.value = withSpring(0, spring.gentle);

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
            {toast.onPress ? (
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
}));
