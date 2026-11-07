import { useEffect, useState } from "react";
import { completePracticeStep } from "../services/practice/practiceEvents";
import { ACTIVITY_IDS } from "../content/activities";
import { View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../navigation";
import { Screen } from "../components/common/Screen";
import { Card } from "../components/common/Card";
import { Txt } from "../components/common/Txt";
import { Chip } from "../components/common/Chip";
import { StopTrack } from "../components/common/StopTrack";
import { PrimaryButton } from "../components/common/PrimaryButton";
import { ScaleSlider } from "../components/common/ScaleSlider";
import { Field } from "../components/conversation/Field";
import { formatEventDate } from "../components/common/DatePicker";
import { showGlobalToast } from "../components/common/ToastProvider";
import { eventName, FOCUS_RESULTS, nervesSummary, WENT_LABELS, type FocusResult, type SpeakingEvent } from "../domain/events";
import { EVENT_CONTEXT } from "../domain/profile";
import { randomContextPrompt } from "../data/contextPrompts";
import { getEvent, saveAfterCheckIn, saveBeforeCheckIn } from "../services/db/eventsRepo";
import { logger } from "../utils/logger";
import { makeStyles } from "../theme/ThemeProvider";

type Props = NativeStackScreenProps<RootStackParamList, "EventCheckIn">;

// A minute before an event and a couple after. Before: how nervous you
// expect to be, and one thing to do well. After: how nervous it actually
// felt, how it went, whether you did your focus, what went okay, one thing
// for next time. Nothing is scored; the after
// check-in only puts the forecast next to what happened.
export function EventCheckInScreen({ route, navigation }: Props) {
  const styles = useStyles();
  const { eventId, phase } = route.params;
  const [event, setEvent] = useState<SpeakingEvent | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [nerves, setNerves] = useState<number | null>(null);
  const [focus, setFocus] = useState("");
  const [went, setWent] = useState<number | null>(null);
  const [focusResult, setFocusResult] = useState<FocusResult | null>(null);
  const [wentOkay, setWentOkay] = useState("");
  const [tryNext, setTryNext] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getEvent(eventId)
      .then((e) => {
        setEvent(e);
        if (e && phase === "before" && e.before) {
          setNerves(e.before.nerves);
          setFocus(e.before.focus);
        }
        if (e && phase === "after" && e.after) {
          setNerves(e.after.nerves);
          setWent(e.after.went);
          setFocusResult(e.after.focusResult);
          setWentOkay(e.after.wentOkay);
          setTryNext(e.after.tryNext);
        }
      })
      .catch(() => setEvent(null))
      .finally(() => setLoaded(true));
  }, [eventId, phase]);

  const name = event ? eventName(event) : "event";
  const expected = event?.before?.nerves ?? null;
  const savedFocus = event?.before?.focus.trim() ?? "";

  async function save(): Promise<boolean> {
    if (!event || saving) return false;
    setSaving(true);
    try {
      if (phase === "before") {
        await saveBeforeCheckIn(event.id, { nerves, focus });
        showGlobalToast("Checked in. Good luck.", "success");
      } else {
        await saveAfterCheckIn(event.id, { nerves, went, focusResult: savedFocus ? focusResult : null, wentOkay, tryNext });
        showGlobalToast(nervesSummary(expected, nerves) ?? "Saved. Well done for doing it.", "success");
      }
      completePracticeStep(phase === "before" ? ACTIVITY_IDS.eventBefore : ACTIVITY_IDS.eventAfter, undefined, null).catch(() => undefined);
      return true;
    } catch (error) {
      logger.error(`[events] check-in save failed — ${(error as Error).message}`);
      showGlobalToast("Couldn't save that.", "error");
      setSaving(false);
      return false;
    }
  }

  // A rep with a prompt from the event's own kind of situation.
  async function practice() {
    if (!event) return;
    if (nerves != null || focus.trim()) {
      if (!(await save())) return;
    }
    const prompt = randomContextPrompt(EVENT_CONTEXT[event.kind]);
    navigation.replace("Recording", { kind: "prompt", prompt });
  }

  if (loaded && !event) {
    return (
      <Screen title="Check in" onBack={() => navigation.goBack()} backIcon="close">
        <Txt tone="secondary">This event isn't here anymore.</Txt>
      </Screen>
    );
  }

  return (
    <Screen
      eyebrow={event ? `${phase === "before" ? "Before" : "After"} · ${formatEventDate(event.date)}` : undefined}
      title={phase === "before" ? `Your ${name}` : `How did your ${name} go?`}
      onBack={() => navigation.goBack()}
      backIcon="close"
      keyboardShouldPersistTaps="handled"
      footer={
        <View style={styles.footer}>
          <PrimaryButton
            label="Save"
            onPress={async () => {
              if (await save()) navigation.goBack();
            }}
            loading={saving}
            disabled={!event}
          />
          {phase === "before" ? <PrimaryButton label="Practice for it now" variant="ghost" onPress={practice} disabled={!event || saving} /> : null}
        </View>
      }
    >
      {phase === "before" ? (
        <>
          <Card style={styles.card}>
            <Txt variant="headline">How nervous do you feel about it?</Txt>
            <ScaleSlider key={loaded ? "loaded" : "loading"} value={nerves} onChange={setNerves} lowLabel="Calm" highLabel="Very nervous" accessibilityLabel="How nervous you feel, 0 to 10" />
          </Card>
          <Field label="One thing you want to do well" value={focus} onChangeText={setFocus} placeholder="e.g. Pause before the main point" maxLength={120} />
          <Txt variant="caption1" tone="muted">
            Most people expect it to feel worse than it does. After it's done, you'll see how your guess compares.
          </Txt>
        </>
      ) : (
        <>
          <Card style={styles.card}>
            <Txt variant="headline">How did it go?</Txt>
            <StopTrack labels={WENT_LABELS} value={went} onChange={setWent} accessibilityLabel="How it went, from rough to great" />
          </Card>
          {savedFocus ? (
            <Card style={styles.card}>
              <Txt variant="headline">Did you do your focus?</Txt>
              <Txt variant="footnote" tone="secondary">
                Your focus was: {savedFocus}
              </Txt>
              <View style={styles.chips}>
                {FOCUS_RESULTS.map((r) => (
                  <Chip key={r.key} label={r.label} selected={focusResult === r.key} onPress={() => setFocusResult(r.key)} />
                ))}
              </View>
            </Card>
          ) : null}
          <Card style={styles.card}>
            <Txt variant="headline">How nervous did it actually feel?</Txt>
            {expected != null ? (
              <Txt variant="footnote" tone="secondary">
                Before, you expected {expected} out of 10.
              </Txt>
            ) : null}
            <ScaleSlider key={loaded ? "loaded" : "loading"} value={nerves} onChange={setNerves} lowLabel="Calm" highLabel="Very nervous" accessibilityLabel="How nervous it felt, 0 to 10" />
          </Card>
          <Card style={styles.card}>
            <Field label="What went okay?" value={wentOkay} onChangeText={setWentOkay} placeholder="Even something small counts" multiline />
            <Field label="One thing to try next time" value={tryNext} onChangeText={setTryNext} placeholder="Just one" multiline />
          </Card>
          <Txt variant="caption1" tone="muted">
            That's all. No need to go over the whole thing again: replaying it tends to make the next one feel harder, not easier.
          </Txt>
        </>
      )}
    </Screen>
  );
}

const useStyles = makeStyles((t) => ({
  card: { gap: t.space.sm },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: t.space.sm },
  footer: { gap: t.space.xs },
}));
