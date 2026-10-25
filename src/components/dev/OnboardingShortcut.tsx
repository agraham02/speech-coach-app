import { useEffect, useState } from "react";
import { View } from "react-native";
import { CommonActions } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { SHOW_DEV_TOOLS } from "../../config/devTools";
import { navigationRef } from "../../navigation/navigationRef";
import { applyOnboardedPreset } from "../../services/dev/statePresets";
import { makeStyles } from "../../theme/ThemeProvider";
import { PressableScale } from "../common/PressableScale";
import { Txt } from "../common/Txt";

// Dev builds only: a small pill at the top of the onboarding screens that
// finishes onboarding with the standard answers and goes to Today (the same
// as Dev, App tools, State presets, "Onboarded, standard answers", which is
// out of reach while onboarding is showing because the Dev tab does not exist
// yet). Rendered only behind SHOW_DEV_TOOLS (App.tsx).
const ONBOARDING_ROUTES = ["OnboardingGate", "Onboarding", "SetupCheck"];

function onboardingShowing(): boolean {
  if (!navigationRef.isReady()) return false;
  const route = navigationRef.getCurrentRoute();
  if (!route || !ONBOARDING_ROUTES.includes(route.name)) return false;
  // "Your profile and goals" in Settings reuses the questions: not onboarding.
  return (route.params as { mode?: string } | undefined)?.mode !== "profile";
}

export function OnboardingShortcut() {
  if (!SHOW_DEV_TOOLS) return null;
  return <Pill />;
}

function Pill() {
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const update = () => setVisible(onboardingShowing());
    update();
    const stopState = navigationRef.addListener("state", update);
    // The container may not be ready when this mounts.
    const timer = setInterval(update, 1000);
    return () => {
      stopState();
      clearInterval(timer);
    };
  }, []);

  if (!visible) return null;

  async function skip() {
    if (busy) return;
    setBusy(true);
    try {
      await applyOnboardedPreset({ age: "adult" });
      navigationRef.dispatch(CommonActions.reset({ index: 0, routes: [{ name: "Tabs" }] }));
    } finally {
      setBusy(false);
    }
  }

  return (
    <View pointerEvents="box-none" style={[styles.wrap, { top: insets.top + 2 }]}>
      <PressableScale onPress={skip} accessibilityRole="button" accessibilityLabel="Dev: skip onboarding" testID="dev-skip-onboarding" style={styles.pill}>
        <Txt variant="caption2" weight="600" color={styles.text.color}>
          {busy ? "Working…" : "Dev: skip onboarding"}
        </Txt>
      </PressableScale>
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  wrap: { position: "absolute", left: 0, right: 0, alignItems: "center", zIndex: 9997, elevation: 9997 },
  pill: { paddingHorizontal: t.space.sm + 2, paddingVertical: 4, borderRadius: 999, backgroundColor: t.colors.warning },
  text: { color: "#1A1400" },
}));
