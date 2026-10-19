import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Linking, Modal, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import * as StoreReview from "expo-store-review";
import { Card } from "../common/Card";
import { PrimaryButton } from "../common/PrimaryButton";
import { Txt } from "../common/Txt";
import { FEEDBACK_URL, STORE_REVIEW_LIVE } from "../../config/feedback";
import { afterAnswer, shouldAskForFeedback, type FeedbackAnswer } from "../../domain/feedbackPrompt";
import { getFeedbackPromptState, isOnboardingComplete, setFeedbackPromptState } from "../../services/prefs/prefsStore";
import { getUsageTotals } from "../../services/db/statsRepo";
import { logger } from "../../utils/logger";
import { makeStyles } from "../../theme/ThemeProvider";

type Stage = "ask" | "great" | "better";

// How long Today sits before the question appears, so it never lands on top of
// something you were about to tap.
const SETTLE_MS = 2500;

// "How's Tono going?", once you've used it enough to have an opinion. Great
// goes to Apple's rating sheet once the app is on the App Store, and to "what's
// working?" until then; Could be better goes to the feedback form. Answering
// either way ends it; Not now brings it back after a good while, up to three
// times (domain/feedbackPrompt.ts).
export function FeedbackPrompt() {
  const styles = useStyles();
  const [visible, setVisible] = useState(false);
  const [stage, setStage] = useState<Stage>("ask");
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      if (!FEEDBACK_URL || !isOnboardingComplete()) return;
      getUsageTotals()
        .then((usage) => {
          if (cancelled || !shouldAskForFeedback(usage, getFeedbackPromptState(), new Date())) return;
          timer.current = setTimeout(() => {
            setStage("ask");
            setVisible(true);
          }, SETTLE_MS);
        })
        .catch((err) => logger.warn(`[feedback] couldn't check usage — ${(err as Error).message}`));
      return () => {
        cancelled = true;
        if (timer.current) clearTimeout(timer.current);
      };
    }, []),
  );

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  function record(answer: FeedbackAnswer) {
    setFeedbackPromptState(afterAnswer(getFeedbackPromptState(), answer, new Date()));
  }

  function close(answer: FeedbackAnswer) {
    record(answer);
    setVisible(false);
  }

  async function great() {
    if (STORE_REVIEW_LIVE && (await StoreReview.isAvailableAsync().catch(() => false))) {
      close("great");
      // Apple decides whether the sheet shows, and it's rate-limited.
      StoreReview.requestReview().catch(() => undefined);
      return;
    }
    record("great");
    setStage("great");
  }

  function better() {
    record("better");
    setStage("better");
  }

  function openForm() {
    setVisible(false);
    Linking.openURL(FEEDBACK_URL).catch(() => Alert.alert("Couldn't open the form", FEEDBACK_URL));
  }

  return (
    <Modal transparent animationType="fade" visible={visible} onRequestClose={() => close("later")}>
      <View style={styles.scrim}>
        <Card style={styles.card}>
          {stage === "ask" ? (
            <>
              <View style={styles.text}>
                <Txt variant="title3">How's Tono going?</Txt>
                <Txt variant="callout" tone="secondary">
                  You've been practicing for a bit now. A quick answer helps me make it better.
                </Txt>
              </View>
              <View style={styles.buttons}>
                <PrimaryButton label="Great" onPress={great} />
                <PrimaryButton label="Could be better" variant="secondary" onPress={better} />
                <PrimaryButton label="Not now" variant="ghost" onPress={() => close("later")} />
              </View>
            </>
          ) : (
            <>
              <View style={styles.text}>
                <Txt variant="title3">{stage === "great" ? "Glad it's helping." : "Thanks for saying so."}</Txt>
                <Txt variant="callout" tone="secondary">
                  {stage === "great"
                    ? "What's working for you? A line or two is plenty."
                    : "What's confusing, broken or missing? A line or two is plenty."}
                </Txt>
              </View>
              <View style={styles.buttons}>
                <PrimaryButton label="Tell me" onPress={openForm} />
                <PrimaryButton label="Maybe later" variant="ghost" onPress={() => setVisible(false)} />
              </View>
            </>
          )}
        </Card>
      </View>
    </Modal>
  );
}

const useStyles = makeStyles((t) => ({
  scrim: { flex: 1, alignItems: "center", justifyContent: "center", padding: t.space.lg, backgroundColor: t.colors.overlayScrim },
  card: { alignSelf: "stretch", gap: t.space.lg },
  text: { gap: t.space.xs },
  buttons: { gap: t.space.sm },
}));
