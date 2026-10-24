import { useEffect, useState } from "react";
import { Alert, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../navigation";
import { ScreenContainer } from "../components/common/ScreenContainer";
import { LoadingSpinner } from "../components/common/LoadingSpinner";
import { PrimaryButton } from "../components/common/PrimaryButton";
import { Txt } from "../components/common/Txt";
import { Enter } from "../components/common/Enter";
import { completeOnboarding, hasPracticeHistory, resetToTabs } from "../services/onboarding/onboarding";
import { resetApp } from "../services/data/resetApp";
import { getUserProfile, setUserProfile } from "../services/prefs/prefsStore";
import { EMPTY_PROFILE } from "../domain/profile";
import { todayISODate } from "../utils/dateUtils";
import { logger } from "../utils/logger";
import { makeStyles, useTheme } from "../theme/ThemeProvider";

// First launch only. With no practice yet, onboarding starts. With practice
// from an earlier version (before onboarding existed), the choice is yours:
// start fresh — old recordings and progress are cleared — or keep it all and
// go straight to the app, where Progress offers the profile questions and a
// skill check.
export function OnboardingGateScreen({ navigation }: NativeStackScreenProps<RootStackParamList, "OnboardingGate">) {
  const styles = useStyles();
  const { colors } = useTheme();
  const [state, setState] = useState<"checking" | "existing" | "resetting">("checking");

  useEffect(() => {
    hasPracticeHistory()
      .then((existing) => (existing ? setState("existing") : navigation.replace("Onboarding")))
      .catch((error) => {
        logger.error(`[onboarding] gate check failed — ${(error as Error).message}`);
        navigation.replace("Onboarding");
      });
  }, [navigation]);

  function keep() {
    if (!getUserProfile()) setUserProfile(EMPTY_PROFILE(todayISODate()));
    completeOnboarding();
    resetToTabs(navigation);
  }

  function startFresh() {
    Alert.alert(
      "Start fresh?",
      "This deletes your old recordings, videos, scores and progress, then sets the app up from scratch. This can't be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Start fresh",
          style: "destructive",
          onPress: async () => {
            setState("resetting");
            try {
              await resetApp();
              navigation.replace("Onboarding");
            } catch (error) {
              setState("existing");
              Alert.alert("Couldn't reset", (error as Error).message);
            }
          },
        },
      ],
    );
  }

  if (state !== "existing") {
    return (
      <ScreenContainer style={styles.center}>
        <LoadingSpinner label={state === "resetting" ? "Clearing old data…" : undefined} />
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer style={styles.container}>
      <View style={styles.body}>
        <Enter index={0}>
          <View style={styles.icon}>
            <Ionicons name="sparkles-outline" size={26} color={colors.textPrimary} />
          </View>
        </Enter>
        <Enter index={1}>
          <Txt variant="largeTitle">A new version of Tono</Txt>
        </Enter>
        <Enter index={2}>
          <Txt variant="body" tone="secondary">
            There's practice on this phone from an earlier version. Start fresh for a clean slate with the new onboarding and curriculum, or keep
            your recordings and history.
          </Txt>
        </Enter>
      </View>
      <Enter index={3} style={styles.actions}>
        <PrimaryButton label="Start fresh" onPress={startFresh} />
        <PrimaryButton label="Keep my practice" variant="secondary" onPress={keep} />
      </Enter>
    </ScreenContainer>
  );
}

const useStyles = makeStyles((t) => ({
  center: { alignItems: "center", justifyContent: "center" },
  container: { justifyContent: "space-between" },
  body: { flex: 1, justifyContent: "center", gap: t.space.md },
  icon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: t.colors.surfaceRaised,
    marginBottom: t.space.sm,
  },
  actions: { gap: t.space.sm },
}));
