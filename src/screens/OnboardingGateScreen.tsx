import { useEffect } from "react";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../navigation";
import { ScreenContainer } from "../components/common/ScreenContainer";
import { LoadingSpinner } from "../components/common/LoadingSpinner";
import { completeOnboarding, hasPracticeHistory, resetToTabs } from "../services/onboarding/onboarding";
import { getUserProfile, setUserProfile } from "../services/prefs/prefsStore";
import { EMPTY_PROFILE } from "../domain/profile";
import { todayISODate } from "../utils/dateUtils";
import { logger } from "../utils/logger";

// First launch only. Anyone who already practiced (before onboarding
// existed) goes straight to the app — Progress offers them the profile
// questions and the skill check instead. Everyone else starts onboarding.
export function OnboardingGateScreen({ navigation }: NativeStackScreenProps<RootStackParamList, "OnboardingGate">) {
  useEffect(() => {
    hasPracticeHistory()
      .then((existing) => {
        if (existing) {
          if (!getUserProfile()) setUserProfile(EMPTY_PROFILE(todayISODate()));
          completeOnboarding();
          resetToTabs(navigation);
        } else {
          navigation.replace("Onboarding");
        }
      })
      .catch((error) => {
        logger.error(`[onboarding] gate check failed — ${(error as Error).message}`);
        navigation.replace("Onboarding");
      });
  }, [navigation]);
  return (
    <ScreenContainer>
      <LoadingSpinner />
    </ScreenContainer>
  );
}
