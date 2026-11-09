import { useState } from "react";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../../navigation";
import { ListGroup, ListRow, SwitchRow } from "../common/ListRow";
import { getPlanYourPointEnabled, getRewindDeliveryEnabled, setPlanYourPointEnabled, setRewindDeliveryEnabled } from "../../services/prefs/prefsStore";

// Settings → Practice: who you're practicing as, and how a recording starts.
export function PracticeSettings() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [planYourPoint, setPlanYourPoint] = useState(getPlanYourPointEnabled());
  const [rewindDelivery, setRewindDelivery] = useState(getRewindDeliveryEnabled());

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
