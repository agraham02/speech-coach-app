import { useCallback, useState } from "react";
import { Alert, View } from "react-native";
import { CommonActions, useFocusEffect } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../../navigation";
import { Screen } from "../../components/common/Screen";
import { Card } from "../../components/common/Card";
import { Chip } from "../../components/common/Chip";
import { ListGroup, ListRow, SwitchRow } from "../../components/common/ListRow";
import { PrimaryButton } from "../../components/common/PrimaryButton";
import { Txt } from "../../components/common/Txt";
import { useToast } from "../../components/common/ToastProvider";
import { AGE_CHOICES, type AgeChoice, type ThemeChoice } from "../../domain/dev/statePresets";
import { setSkipModelDownload, skipModelDownloadActive } from "../../services/dev/skipModel";
import { applyOnboardedPreset, presetSummary, resetToFreshInstall, setAgeAnswer, setConsent, setRemindersOff, setTheme, setTips, type PresetSummary } from "../../services/dev/statePresets";
import { makeStyles } from "../../theme/ThemeProvider";

type Props = NativeStackScreenProps<RootStackParamList, "DevPresets">;

const THEMES: { key: ThemeChoice; label: string }[] = [
  { key: "light", label: "Light" },
  { key: "dark", label: "Dark" },
  { key: "system", label: "Follow the phone" },
];

// Dev, App tools, State presets: named app states in one tap, instead of
// walking onboarding and Settings. Each one writes what the real flow writes.
export function StatePresetsScreen({ navigation }: Props) {
  const styles = useStyles();
  const showToast = useToast();
  const [summary, setSummary] = useState<PresetSummary>(presetSummary);
  const [skipModel, setSkipModel] = useState(skipModelDownloadActive);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(() => {
    setSummary(presetSummary());
    setSkipModel(skipModelDownloadActive());
  }, []);
  useFocusEffect(refresh);

  const toTabs = () => navigation.dispatch(CommonActions.reset({ index: 0, routes: [{ name: "Tabs" }] }));

  async function onboarded(age: AgeChoice) {
    if (busy) return;
    setBusy(true);
    try {
      await applyOnboardedPreset({ age });
      showToast("Onboarding finished with the standard answers.", "success");
      toTabs();
    } catch (error) {
      Alert.alert("Couldn't apply the preset", (error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function confirmReset() {
    Alert.alert("Reset to a fresh install?", "This is Settings, Help & data, Reset app: it erases every take, video, score, setting and the onboarding answers, then starts onboarding. The Tono account, downloaded models and these dev switches are kept.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Reset",
        style: "destructive",
        onPress: async () => {
          setBusy(true);
          try {
            await resetToFreshInstall();
            navigation.dispatch(CommonActions.reset({ index: 0, routes: [{ name: "OnboardingGate" }] }));
          } catch (error) {
            setBusy(false);
            Alert.alert("Couldn't reset", (error as Error).message);
          }
        },
      },
    ]);
  }

  return (
    <Screen title="State presets" eyebrow="Dev" onBack={navigation.goBack}>
      <Card style={styles.block}>
        <Txt variant="headline" testID="dev-presets-summary">
          {summary.onboarded ? "Onboarding is finished" : "Onboarding is not finished"}
        </Txt>
        <Txt variant="footnote" tone="secondary">
          {`Age: ${summary.age}. Tono AI consent: ${summary.consent ? "given" : "not given"}. Reminders: ${summary.remindersOn ? "on" : "off"}. Tips: ${summary.tipsOff ? "off" : "on"}. Transcription model download: ${skipModel ? "skipped" : "normal"}.`}
        </Txt>
        <Txt variant="footnote" tone="muted">
          Camera, microphone and notification permissions belong to the phone: use adb shell pm grant.
        </Txt>
      </Card>

      <ListGroup title="Start from">
        <ListRow
          icon="checkmark-done-outline"
          title="Onboarded, standard answers"
          subtitle="Adult, work meetings, filler words, 5-minute sessions once a day, reminders off, tips off, skill check tomorrow, no Tono AI consent, model step skipped. Lands on Today."
          onPress={() => onboarded("adult")}
          testID="dev-preset-onboarded-adult"
        />
        <ListRow
          icon="school-outline"
          title="Onboarded, under 18"
          subtitle="The same, with the age answer 13 to 17 (no Tono AI switch, no live conversation card)"
          onPress={() => onboarded("under_18")}
          testID="dev-preset-onboarded-minor"
        />
        <ListRow
          icon="refresh-outline"
          title="Reset to fresh install"
          subtitle="The app's own Reset app, then onboarding from the Welcome intro"
          destructive
          onPress={confirmReset}
          testID="dev-preset-reset"
        />
      </ListGroup>

      <ListGroup title="Age answer">
        {AGE_CHOICES.map((choice) => (
          <ListRow
            key={choice.id}
            title={choice.label}
            value={summary.age === (choice.range ?? "not answered") ? "Current" : undefined}
            onPress={() => {
              setAgeAnswer(choice.id);
              refresh();
              showToast(`Age answer: ${choice.label}.`, "success");
            }}
            testID={`dev-preset-age-${choice.id}`}
          />
        ))}
      </ListGroup>

      <ListGroup title="Tono AI consent">
        <ListRow
          title="Consent given"
          subtitle="Sets what Allow Tono AI sets. With no mock account on, a judged flow would then reach the real server."
          value={summary.consent ? "Current" : undefined}
          onPress={() => {
            setConsent(true);
            refresh();
            showToast("Tono AI consent is on. Nothing was sent.", "success");
          }}
          testID="dev-preset-consent-given"
        />
        <ListRow
          title="Consent not given"
          value={!summary.consent ? "Current" : undefined}
          onPress={() => {
            setConsent(false);
            refresh();
            showToast("Tono AI consent is off.", "success");
          }}
          testID="dev-preset-consent-not-given"
        />
      </ListGroup>

      <ListGroup title="Reminders and tips">
        <ListRow
          icon="notifications-off-outline"
          title="Reminders off"
          subtitle="Turns the daily reminder off and cancels what was scheduled"
          onPress={async () => {
            await setRemindersOff();
            refresh();
            showToast("Reminders are off.", "success");
          }}
          testID="dev-preset-reminders-off"
        />
        <ListRow
          title="Tips dismissed"
          subtitle="Turn off tips, as Turn off tips on the first tip card does"
          value={summary.tipsOff ? "Current" : undefined}
          onPress={() => {
            setTips(false);
            refresh();
            showToast("Tips are off.", "success");
          }}
          testID="dev-preset-tips-off"
        />
        <ListRow
          title="Tips shown"
          subtitle="Every tour and tip shows again (Show tips again)"
          value={!summary.tipsOff ? "Current" : undefined}
          onPress={() => {
            setTips(true);
            refresh();
            showToast("Tips will show again as you go.", "success");
          }}
          testID="dev-preset-tips-on"
        />
      </ListGroup>

      <ListGroup title="Theme">
        <View style={styles.chips}>
          {THEMES.map((t) => (
            <Chip
              key={t.key}
              label={t.label}
              onPress={() => {
                setTheme(t.key);
                showToast(`Theme: ${t.label}.`, "success");
              }}
              testID={`dev-preset-theme-${t.key}`}
            />
          ))}
        </View>
      </ListGroup>

      <ListGroup title="Transcription model">
        <SwitchRow
          title="Skip the model download"
          subtitle="The onboarding step and the banners count the 574 MB model as ready. Takes then fail their Transcript step with a message that says the download is skipped. Kept across Reset app."
          value={skipModel}
          onValueChange={(on) => {
            setSkipModelDownload(on);
            setSkipModel(on);
          }}
          testID="dev-preset-skip-model"
        />
      </ListGroup>
    </Screen>
  );
}

const useStyles = makeStyles((t) => ({
  block: { gap: t.space.sm },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: t.space.sm, padding: t.space.md },
}));
