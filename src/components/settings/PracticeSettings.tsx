import { useState } from "react";
import { Alert } from "react-native";
import { CHALLENGE_OPTIONS, type Challenge } from "../../domain/difficulty/challenge";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../../navigation";
import { ListGroup, ListRow, SwitchRow } from "../common/ListRow";
import { getChallenge, getPlanYourPointEnabled, getRewindDeliveryEnabled, setChallenge, setPlanYourPointEnabled, setRewindDeliveryEnabled } from "../../services/prefs/prefsStore";

// Settings → Practice: who you're practicing as, and how a recording starts.
export function PracticeSettings() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [planYourPoint, setPlanYourPoint] = useState(getPlanYourPointEnabled());
  const [rewindDelivery, setRewindDelivery] = useState(getRewindDeliveryEnabled());
  const [challenge, setChallengeState] = useState<Challenge>(getChallenge());
  const current = CHALLENGE_OPTIONS.find((o) => o.key === challenge)!;

  // How hard practice gets: where each drill's difficulty settles (plan 6.7, rule 11).
  function pickChallenge() {
    Alert.alert(
      "Challenge",
      "How often you should succeed. Each drill's difficulty settles where you do.",
      [
        ...CHALLENGE_OPTIONS.map((o) => ({
          text: o.key === challenge ? `${o.label} ✓` : o.label,
          onPress: () => {
            setChallenge(o.key);
            setChallengeState(o.key);
          },
        })),
        { text: "Cancel", style: "cancel" as const },
      ],
    );
  }

  return (
    <ListGroup>
      <ListRow
        icon="person-circle-outline"
        title="Your profile and goals"
        subtitle="What gets in your way, where you want to speak better, how you practice"
        chevron
        onPress={() => navigation.navigate("Onboarding", { mode: "profile" })}
      />
      <ListRow
        icon="calendar-clear-outline"
        title="Your events"
        subtitle="Interviews, talks and toasts coming up, with a check-in before and after"
        chevron
        onPress={() => navigation.navigate("Events")}
      />
      <ListRow icon="speedometer-outline" title={`Challenge: ${current.label}`} subtitle={current.detail} chevron onPress={pickChallenge} />
      <SwitchRow
        icon="git-branch-outline"
        title="Plan your point"
        subtitle="A quick PREP sketch before a recording starts"
        value={planYourPoint}
        onValueChange={(enabled) => {
          setPlanYourPoint(enabled);
          setPlanYourPointEnabled(enabled);
        }}
      />
      <SwitchRow
        icon="mic-outline"
        title="Rewinds count toward delivery"
        subtitle="Your ums, likes and stalls in a Rewind move those skills a little"
        value={rewindDelivery}
        onValueChange={(enabled) => {
          setRewindDelivery(enabled);
          setRewindDeliveryEnabled(enabled);
        }}
      />
    </ListGroup>
  );
}
