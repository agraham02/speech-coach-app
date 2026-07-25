import { useState } from "react";
import { Linking, Pressable, StyleSheet, Switch, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../navigation";
import { ScreenContainer } from "../components/common/ScreenContainer";
import { Card } from "../components/common/Card";
import { LabeledSlider } from "../components/common/LabeledSlider";
import { useToast } from "../components/common/ToastProvider";
import {
  getPrepPhaseSettings,
  getRecordingDurationSettings,
  getReminderSettings,
  setPrepPhaseSettings,
  setRecordingDurationSettings,
  setReminderSettings,
} from "../services/prefs/prefsStore";
import {
  PREP_DURATION_MAX_SECONDS,
  PREP_DURATION_MIN_SECONDS,
  PREP_DURATION_STEP_SECONDS,
  RECORDING_DURATION_MAX_SECONDS,
  RECORDING_DURATION_MIN_SECONDS,
  RECORDING_DURATION_STEP_SECONDS,
} from "../domain/recordingSettings";
import { formatReminderHour, REMINDER_HOUR_MAX, REMINDER_HOUR_MIN } from "../domain/reminderSettings";
import { cancelDailyReminder, requestNotificationPermission, scheduleDailyReminder } from "../services/notifications/reminderScheduler";
import { colors, spacing, typography } from "../theme/theme";

type Props = NativeStackScreenProps<RootStackParamList, "Settings">;

function minutesLabel(seconds: number): string {
  const minutes = seconds / 60;
  return `${minutes} min`;
}

function secondsLabel(seconds: number): string {
  return `${seconds}s`;
}

export function SettingsScreen({ navigation }: Props) {
  const showToast = useToast();
  const [durationSettings, setDurationSettingsState] = useState(getRecordingDurationSettings());
  const [prepSettings, setPrepSettingsState] = useState(getPrepPhaseSettings());
  const [reminderSettings, setReminderSettingsState] = useState(getReminderSettings());

  function updateDuration(next: typeof durationSettings) {
    setDurationSettingsState(next);
    setRecordingDurationSettings(next);
  }

  function updatePrep(next: typeof prepSettings) {
    setPrepSettingsState(next);
    setPrepPhaseSettings(next);
  }

  async function handleReminderToggle(enabled: boolean) {
    if (!enabled) {
      const next = { ...reminderSettings, enabled: false };
      setReminderSettingsState(next);
      setReminderSettings(next);
      await cancelDailyReminder();
      return;
    }

    const granted = await requestNotificationPermission();
    if (!granted) {
      showToast("Notifications are disabled — enable them in iOS Settings first", "error");
      return;
    }

    const next = { ...reminderSettings, enabled: true };
    setReminderSettingsState(next);
    setReminderSettings(next);
    await scheduleDailyReminder(next.hour);
    showToast(`Daily reminder set for ${formatReminderHour(next.hour)}`, "success");
  }

  async function handleReminderHourChange(hour: number) {
    const next = { ...reminderSettings, hour };
    setReminderSettingsState(next);
    setReminderSettings(next);
    if (next.enabled) {
      await scheduleDailyReminder(hour);
    }
  }

  return (
    <ScreenContainer style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={12} accessibilityRole="button" accessibilityLabel="Go back">
          <Ionicons name="chevron-back" size={26} color={colors.textPrimary} />
        </Pressable>
        <Text style={styles.title}>Settings</Text>
        <View style={styles.headerSpacer} />
      </View>

      <Card style={styles.section}>
        <View style={styles.sectionHeaderRow}>
          <View style={styles.sectionHeaderText}>
            <Text style={styles.sectionTitle}>Daily reminder</Text>
            <Text style={styles.sectionSubtitle}>A nudge to practice, once a day.</Text>
          </View>
          <Switch
            value={reminderSettings.enabled}
            onValueChange={handleReminderToggle}
            trackColor={{ true: colors.accent, false: "rgba(255,255,255,0.2)" }}
          />
        </View>
        {reminderSettings.enabled ? (
          <>
            <LabeledSlider
              label="Time"
              value={reminderSettings.hour}
              minimumValue={REMINDER_HOUR_MIN}
              maximumValue={REMINDER_HOUR_MAX}
              step={1}
              formatValue={formatReminderHour}
              onChange={handleReminderHourChange}
            />
            <Pressable onPress={() => Linking.openSettings()}>
              <Text style={styles.linkText}>Open iOS notification settings</Text>
            </Pressable>
          </>
        ) : null}
      </Card>

      <Card style={styles.section}>
        <Text style={styles.sectionTitle}>Recording length</Text>
        <Text style={styles.sectionSubtitle}>How long you aim to speak for. You can always stop early.</Text>
        <LabeledSlider
          label="Length"
          value={durationSettings.fixedSeconds}
          minimumValue={RECORDING_DURATION_MIN_SECONDS}
          maximumValue={RECORDING_DURATION_MAX_SECONDS}
          step={RECORDING_DURATION_STEP_SECONDS}
          formatValue={minutesLabel}
          disabled={durationSettings.mode === "random"}
          onChange={(fixedSeconds) => updateDuration({ mode: "fixed", fixedSeconds })}
        />
        <View style={styles.switchRow}>
          <Text style={styles.switchLabel}>Randomize each session</Text>
          <Switch
            value={durationSettings.mode === "random"}
            onValueChange={(isRandom) => updateDuration({ ...durationSettings, mode: isRandom ? "random" : "fixed" })}
            trackColor={{ true: colors.accent, false: "rgba(255,255,255,0.2)" }}
          />
        </View>
      </Card>

      <Card style={styles.section}>
        <View style={styles.sectionHeaderRow}>
          <View style={styles.sectionHeaderText}>
            <Text style={styles.sectionTitle}>Prep phase</Text>
            <Text style={styles.sectionSubtitle}>A countdown to brainstorm before recording starts.</Text>
          </View>
          <Switch
            value={prepSettings.enabled}
            onValueChange={(enabled) => updatePrep({ ...prepSettings, enabled })}
            trackColor={{ true: colors.accent, false: "rgba(255,255,255,0.2)" }}
          />
        </View>
        {prepSettings.enabled ? (
          <>
            <LabeledSlider
              label="Prep time"
              value={prepSettings.fixedSeconds}
              minimumValue={PREP_DURATION_MIN_SECONDS}
              maximumValue={PREP_DURATION_MAX_SECONDS}
              step={PREP_DURATION_STEP_SECONDS}
              formatValue={secondsLabel}
              disabled={prepSettings.mode === "random"}
              onChange={(fixedSeconds) => updatePrep({ ...prepSettings, mode: "fixed", fixedSeconds })}
            />
            <View style={styles.switchRow}>
              <Text style={styles.switchLabel}>Randomize each session</Text>
              <Switch
                value={prepSettings.mode === "random"}
                onValueChange={(isRandom) => updatePrep({ ...prepSettings, mode: isRandom ? "random" : "fixed" })}
                trackColor={{ true: colors.accent, false: "rgba(255,255,255,0.2)" }}
              />
            </View>
          </>
        ) : null}
      </Card>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.lg },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  headerSpacer: { width: 26 },
  title: { color: colors.textPrimary, fontSize: typography.title, fontWeight: "700" },
  section: { gap: spacing.md },
  sectionHeaderRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.md },
  sectionHeaderText: { flex: 1, gap: spacing.xs },
  sectionTitle: { color: colors.textPrimary, fontSize: typography.bodyLarge, fontWeight: "700" },
  sectionSubtitle: { color: colors.textSecondary, fontSize: typography.caption, lineHeight: 18 },
  switchRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  switchLabel: { color: colors.textSecondary, fontSize: typography.body },
  linkText: { color: colors.accent, fontSize: typography.caption, fontWeight: "600" },
});
