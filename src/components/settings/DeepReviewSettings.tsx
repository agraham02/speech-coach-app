import { useState } from "react";
import { View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Card } from "../common/Card";
import { PrimaryButton } from "../common/PrimaryButton";
import { Txt } from "../common/Txt";
import { SwitchRow } from "../common/ListRow";
import { DeepReviewUsage } from "./DeepReviewUsage";
import { allowanceLine, isPaidPlan } from "../../domain/aiAllowance";
import { speakerFacts, speakerLines } from "../../domain/reviewerContext";
import { useAccount } from "../../services/account/accountStore";
import { askTonoConsent, openPaywall } from "../../services/cloud/consent";
import { whatGetsSent } from "../../services/cloud/disclosure";
import { tonoAgeGated } from "../../services/cloud/routing";
import { purchasesEnabled } from "../../services/purchases/purchases";
import {
  getCloudReviewDefault,
  getNextEvent,
  getShareProfileWithReviews,
  getUserProfile,
  hasTonoConsent,
  setCloudReviewDefault,
  setShareProfileWithReviews,
  setTonoConsent,
} from "../../services/prefs/prefsStore";
import { todayISODate } from "../../utils/dateUtils";
import { makeStyles, useTheme } from "../../theme/ThemeProvider";

// Settings → Tono AI: whether takes are judged, what is sent, and what's
// left. Your phone measures every take on its own, free, with no account;
// Tono AI adds the judgement (Plus and the trial, and one free judged take a
// month for everyone).
export function DeepReviewSettings() {
  const styles = useStyles();
  const { colors } = useTheme();
  const account = useAccount();
  const [allowed, setAllowed] = useState(hasTonoConsent());
  const [shareProfile, setShareProfile] = useState(getShareProfileWithReviews());
  const [everyTake, setEveryTake] = useState(getCloudReviewDefault());
  const minor = tonoAgeGated();
  const paying = isPaidPlan(account.allowance);
  // Exactly what goes with a take about you, one fact per line.
  const contextPreview = speakerLines(speakerFacts(getUserProfile(), todayISODate(), getNextEvent())).join("\n");

  async function toggleAllowed() {
    if (allowed) {
      setTonoConsent(false);
      setAllowed(false);
      return;
    }
    setAllowed(await askTonoConsent());
  }

  if (minor) {
    return (
      <View style={styles.wrap}>
        <Txt variant="footnote" weight="500" tone="secondary" style={styles.groupTitle}>
          Tono AI
        </Txt>
        <Card style={styles.section}>
          <Txt variant="subhead" tone="secondary">
            Tono AI is for people 18 and over, so nothing you record leaves this phone. Your phone still measures every take and gives you tips. If you gave the wrong age, change it in Settings → Practice.
          </Txt>
        </Card>
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      <Txt variant="footnote" weight="500" tone="secondary" style={styles.groupTitle}>
        Tono AI
      </Txt>
      <Txt variant="subhead" tone="secondary" style={styles.intro}>
        Your phone measures pace, pauses, fillers, pitch and eye contact on every take, free. Tono AI adds what a phone can't judge: whether your answer had a shape, stayed on the point and came
        across with conviction, and what to change next. It comes with Tono Plus, and everyone gets one judged take a month free.
      </Txt>

      <Card style={styles.section}>
        <Txt variant="headline">Tono AI</Txt>
        {account.allowance ? (
          <Txt variant="subhead" tone="secondary">
            {allowanceLine(account.allowance)}
          </Txt>
        ) : null}
        <View style={styles.disclosure}>
          <Ionicons name="document-text-outline" size={18} color={colors.textSecondary} />
          <Txt variant="footnote" tone="secondary" style={styles.flex}>
            {whatGetsSent()}
          </Txt>
        </View>
        <PrimaryButton
          label={allowed ? "Stop sending to Tono AI" : "Allow Tono AI"}
          variant={allowed ? "ghost" : "secondary"}
          size="sm"
          onPress={toggleAllowed}
          style={styles.allow}
        />
        {!paying && purchasesEnabled() ? (
          <PrimaryButton label="See Tono Plus" variant="ghost" size="sm" icon="sparkles-outline" onPress={openPaywall} style={styles.allow} />
        ) : null}
      </Card>

      <Card style={styles.section}>
        <SwitchRow
          title="Have Tono AI judge every take"
          subtitle={
            allowed
              ? "Each take you keep is judged while you have judged takes left. Turn it off for one take on its save screen."
              : "On once Tono AI is allowed above. Until then, everything stays on this phone."
          }
          value={everyTake}
          onValueChange={(on) => {
            setEveryTake(on);
            setCloudReviewDefault(on);
          }}
        />
      </Card>

      <Card style={styles.section}>
        <SwitchRow
          title="Tell Tono AI about you"
          subtitle="What you said in setup, so feedback fits what you're working on."
          value={shareProfile}
          onValueChange={(on) => {
            setShareProfile(on);
            setShareProfileWithReviews(on);
          }}
        />
        {shareProfile ? (
          <Txt variant="footnote" tone="secondary">
            {contextPreview || "Nothing to share yet: answer the profile questions in Settings → Practice."}
          </Txt>
        ) : null}
      </Card>
      <DeepReviewUsage />
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  wrap: { gap: t.space.md },
  groupTitle: { paddingHorizontal: 4, marginBottom: -t.space.sm },
  intro: { paddingHorizontal: 4 },
  section: { gap: t.space.md },
  disclosure: { flexDirection: "row", gap: t.space.sm, alignItems: "flex-start" },
  flex: { flex: 1 },
  allow: { alignSelf: "flex-start" },
}));
