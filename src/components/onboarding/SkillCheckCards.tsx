import { useCallback, useState } from "react";
import { View } from "react-native";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../../navigation";
import { Card } from "../common/Card";
import { Txt } from "../common/Txt";
import { PrimaryButton } from "../common/PrimaryButton";
import { RatingScale } from "../common/RatingScale";
import { listConfidenceCheckins, listSkillChecks, saveConfidenceCheckin } from "../../services/db/skillChecksRepo";
import { getSkillCheckPending, getUserProfile, setUserProfile } from "../../services/prefs/prefsStore";
import { dateFromISODate, daysBetween, todayISODate } from "../../utils/dateUtils";
import { makeStyles } from "../../theme/ThemeProvider";

const RETAKE_AFTER_DAYS = 30;
const CHECKIN_EVERY_DAYS = 30;

function daysSince(iso: string): number {
  return daysBetween(dateFromISODate(iso.slice(0, 10)), dateFromISODate(todayISODate()));
}

// Today: the skill check as Day 1 (when put off), and the 30-day retake.
export function TodaySkillCheckCard() {
  const styles = useStyles();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [state, setState] = useState<"pending" | "retake" | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (getSkillCheckPending()) {
        setState("pending");
        return;
      }
      listSkillChecks().then((checks) => {
        const first = checks.filter((c) => !c.retakeOf).pop();
        const latest = checks[0];
        setState(first && latest && daysSince(first.takenAt) >= RETAKE_AFTER_DAYS && daysSince(latest.takenAt) >= RETAKE_AFTER_DAYS ? "retake" : null);
      });
    }, []),
  );

  if (!state) return null;
  return (
    <Card style={styles.card}>
      <Txt variant="caption2" tone="accent" uppercase>
        {state === "pending" ? "Day 1" : "It's been a month"}
      </Txt>
      <Txt variant="title3">{state === "pending" ? "Your five-minute skill check" : "Retake your skill check"}</Txt>
      <Txt variant="subhead" tone="secondary">
        {state === "pending"
          ? "Four short pieces so your plan starts where you are. Nothing is graded."
          : "Same passage, same topic as your first one — then the two side by side."}
      </Txt>
      <PrimaryButton label="Start" onPress={() => navigation.navigate("SkillCheck", state === "retake" ? { retake: true } : undefined)} />
    </Card>
  );
}

// Progress: profile setup and a first skill check for people who used the
// app before onboarding existed, and the monthly comfort check-in.
export function ProgressProfileCards() {
  const styles = useStyles();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [needsProfile, setNeedsProfile] = useState(false);
  const [needsCheck, setNeedsCheck] = useState(false);
  const [checkinDue, setCheckinDue] = useState<{ last: number | null } | null>(null);
  const [rating, setRating] = useState<number | null>(null);

  useFocusEffect(
    useCallback(() => {
      const profile = getUserProfile();
      setNeedsProfile(!profile || profile.onboardingStep == null);
      Promise.all([listSkillChecks(), listConfidenceCheckins()]).then(([checks, checkins]) => {
        setNeedsCheck(checks.length === 0 && !getSkillCheckPending());
        const last = checkins[checkins.length - 1];
        setCheckinDue(last && daysSince(last.date) >= CHECKIN_EVERY_DAYS ? { last: last.rating } : null);
      });
    }, []),
  );

  async function saveCheckin() {
    if (rating == null) return;
    await saveConfidenceCheckin(todayISODate(), rating);
    const profile = getUserProfile();
    if (profile) setUserProfile({ ...profile, speakingComfort: rating });
    setCheckinDue(null);
  }

  return (
    <View style={styles.stack}>
      {needsProfile ? (
        <Card style={styles.card}>
          <Txt variant="headline">Set up your profile</Txt>
          <Txt variant="subhead" tone="secondary">
            A few questions — what gets in your way, where you want to speak better, how often you'll practice — so your plan fits you.
          </Txt>
          <PrimaryButton label="Set up" variant="secondary" onPress={() => navigation.navigate("Onboarding", { mode: "profile" })} />
        </Card>
      ) : null}
      {needsCheck ? (
        <Card style={styles.card}>
          <Txt variant="headline">Take a skill check</Txt>
          <Txt variant="subhead" tone="secondary">
            Five minutes, four short pieces — a baseline to compare against in a month.
          </Txt>
          <PrimaryButton label="Start" variant="secondary" onPress={() => navigation.navigate("SkillCheck")} />
        </Card>
      ) : null}
      {checkinDue ? (
        <Card style={styles.card}>
          <Txt variant="headline">Monthly check-in</Txt>
          <Txt variant="subhead" tone="secondary">
            How do you feel about speaking in front of people right now?
          </Txt>
          <RatingScale value={rating} onChange={setRating} lowLabel="I avoid it" highLabel="I enjoy it" />
          {checkinDue.last ? (
            <Txt variant="footnote" tone="muted">
              Last time you said {checkinDue.last}.
            </Txt>
          ) : null}
          <View style={styles.row}>
            <PrimaryButton label="Change my goals" variant="ghost" style={styles.flex} onPress={() => navigation.navigate("Onboarding", { mode: "profile" })} />
            <PrimaryButton label="Save" style={styles.flex} onPress={saveCheckin} disabled={rating == null} />
          </View>
        </Card>
      ) : null}
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  stack: { gap: t.space.md },
  card: { gap: t.space.sm },
  row: { flexDirection: "row", gap: t.space.sm },
  flex: { flex: 1 },
}));
