import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Linking, Modal, Pressable, TextInput, View } from "react-native";
import { CommonActions } from "@react-navigation/native";
import { resetApp } from "../services/data/resetApp";
import { Ionicons } from "@expo/vector-icons";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../navigation";
import { Screen } from "../components/common/Screen";
import { Txt } from "../components/common/Txt";
import { ListGroup, ListRow, SwitchRow } from "../components/common/ListRow";
import { SegmentedControl } from "../components/common/SegmentedControl";
import { PressableScale } from "../components/common/PressableScale";
import { PrimaryButton } from "../components/common/PrimaryButton";
import { exportPracticeData, formatBytes, getVideoStorageBytes } from "../services/data/dataExport";
import { deleteOldVideos } from "../services/data/videoKeepsakes";
import { isAppleModelAvailable } from "../services/onDeviceLlm/onDeviceCoach";
import { Card } from "../components/common/Card";
import { LabeledSlider } from "../components/common/LabeledSlider";
import { useToast } from "../components/common/ToastProvider";
import {
  getAssemblyAiEnabled,
  getPlanYourPointEnabled,
  getReminderSettings,
  setAssemblyAiEnabled,
  setPlanYourPointEnabled,
  setReminderSettings,
} from "../services/prefs/prefsStore";
import {
  getAssemblyAiApiKey,
  getGeminiApiKey,
  setAssemblyAiApiKey,
  setGeminiApiKey,
} from "../services/secrets/secretsStore";
import { formatReminderHour, REMINDER_HOUR_MAX, REMINDER_HOUR_MIN } from "../domain/reminderSettings";
import { defaultExtraHours, type DailyGoal } from "../domain/dailyGoal";
import { getDailySessionGoal, getVideoRetentionDays, setDailySessionGoal } from "../services/prefs/prefsStore";
import { cancelDailyReminder, requestNotificationPermission, syncDailyReminder } from "../services/notifications/reminderScheduler";
import { makeStyles, useTheme } from "../theme/ThemeProvider";
import { SHOW_DEV_TOOLS } from "../config/devTools";

type Props = NativeStackScreenProps<RootStackParamList, "Settings">;

interface SecretFieldProps {
  label: string;
  caption: string;
  value: string;
  onChangeText: (text: string) => void;
  onBlur: () => void;
}

// A labeled, maskable text field for one API secret — used for all three
// (Gemini and AssemblyAI keys) below rather than a bare
// Switch/Slider, since these are pasted-in credentials, not toggled prefs.
function SecretField({ label, caption, value, onChangeText, onBlur }: SecretFieldProps) {
  const styles = useStyles();
  const { colors } = useTheme();
  const [visible, setVisible] = useState(false);
  return (
    <View style={styles.secretField}>
      <Txt variant="subhead" weight="600">
        {label}
      </Txt>
      <View style={styles.secretInputRow}>
        <TextInput
          style={styles.secretInput}
          value={value}
          onChangeText={onChangeText}
          onBlur={onBlur}
          // Also save when editing ends or the keyboard's return is pressed —
          // blur alone isn't reliable when leaving the screen.
          onEndEditing={onBlur}
          onSubmitEditing={onBlur}
          returnKeyType="done"
          placeholder="Not set"
          placeholderTextColor={colors.textMuted}
          secureTextEntry={!visible}
          autoCapitalize="none"
          autoCorrect={false}
          spellCheck={false}
        />
        <Pressable
          onPress={() => setVisible((v) => !v)}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel={visible ? `Hide ${label}` : `Show ${label}`}
        >
          <Ionicons name={visible ? "eye-off-outline" : "eye-outline"} size={18} color={colors.textMuted} />
        </Pressable>
      </View>
      <Txt variant="footnote" tone="secondary">
        {caption}
      </Txt>
    </View>
  );
}

export function SettingsScreen({ navigation }: Props) {
  const styles = useStyles();
  const { colors } = useTheme();
  const showToast = useToast();
  const [reminderSettings, setReminderSettingsState] = useState(getReminderSettings());
  const [goal, setGoalState] = useState<DailyGoal>(getDailySessionGoal());
  const [planYourPointEnabled, setPlanYourPointEnabledState] = useState(getPlanYourPointEnabled());
  const [geminiKey, setGeminiKeyField] = useState("");
  const [assemblyAiEnabled, setAssemblyAiEnabledState] = useState(getAssemblyAiEnabled());
  const [assemblyAiKey, setAssemblyAiKeyField] = useState("");

  useEffect(() => {
    Promise.all([getGeminiApiKey(), getAssemblyAiApiKey()]).then(([gemini, assemblyAi]) => {
      setGeminiKeyField(gemini ?? "");
      setAssemblyAiKeyField(assemblyAi ?? "");
    });
  }, []);

  function handleAssemblyAiToggle(enabled: boolean) {
    setAssemblyAiEnabledState(enabled);
    setAssemblyAiEnabled(enabled);
  }

  function handlePlanYourPointToggle(enabled: boolean) {
    setPlanYourPointEnabledState(enabled);
    setPlanYourPointEnabled(enabled);
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
    await syncDailyReminder();
    showToast(`Daily reminder set for ${formatReminderHour(next.hour)}`, "success");
  }

  async function handleReminderHourChange(hour: number) {
    const next = { ...reminderSettings, hour };
    setReminderSettingsState(next);
    setReminderSettings(next);
    if (next.enabled) {
      await syncDailyReminder();
    }
  }

  async function handleGoalChange(key: string) {
    const next = Number(key) as DailyGoal;
    setGoalState(next);
    setDailySessionGoal(next);
    // Spread the top-up reminders through the day the first time.
    const extra = reminderSettings.extraHours ?? [];
    if (extra.length < next - 1) {
      const settings = { ...reminderSettings, extraHours: defaultExtraHours(reminderSettings.hour, next) };
      setReminderSettingsState(settings);
      setReminderSettings(settings);
    }
    await syncDailyReminder();
  }

  async function handleExtraHourChange(index: number, hour: number) {
    const extraHours = [...(reminderSettings.extraHours ?? defaultExtraHours(reminderSettings.hour, goal))];
    extraHours[index] = hour;
    const next = { ...reminderSettings, extraHours };
    setReminderSettingsState(next);
    setReminderSettings(next);
    if (next.enabled) await syncDailyReminder();
  }

  async function handleToggleDay(day: number) {
    const current = reminderSettings.practiceDays?.length ? reminderSettings.practiceDays : [0, 1, 2, 3, 4, 5, 6];
    const days = current.includes(day) ? current.filter((d) => d !== day) : [...current, day].sort();
    if (!days.length) return;
    const next = { ...reminderSettings, practiceDays: days.length === 7 ? [] : days };
    setReminderSettingsState(next);
    setReminderSettings(next);
    if (next.enabled) await syncDailyReminder();
  }

  const [appleCoach] = useState(() => isAppleModelAvailable());
  const [videoBytes, setVideoBytes] = useState(() => getVideoStorageBytes());

  async function handleExport() {
    try {
      await exportPracticeData();
    } catch (error) {
      Alert.alert("Export failed", (error as Error).message);
    }
  }

  function handleDeleteOldVideos() {
    Alert.alert(
      "Clear videos older than 30 days?",
      "The best take from each month is kept (compressed) so you can see your progress — find them under Library → Progress. Transcripts, analysis and scores are always kept. This can't be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Clear",
          style: "destructive",
          onPress: async () => {
            const { deleted, kept } = await deleteOldVideos(getVideoRetentionDays() || 30);
            setVideoBytes(getVideoStorageBytes());
            Alert.alert(
              "Done",
              `Removed ${deleted} video${deleted === 1 ? "" : "s"}. ${kept} progress video${kept === 1 ? "" : "s"} kept.`,
            );
          },
        },
      ],
    );
  }
  const [resetting, setResetting] = useState(false);

  // Starts over completely — for old data from an earlier version, or a
  // clean slate. Everything but the API keys goes (see resetApp.ts).
  function confirmReset() {
    Alert.alert(
      "Reset the app?",
      "This deletes every recording and video, your scores, lessons, levels and streak, and your profile and settings — then starts onboarding again. Your API keys are kept. This can't be undone.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Export first", onPress: handleExport },
        { text: "Reset", style: "destructive", onPress: runReset },
      ],
    );
  }

  async function runReset() {
    setResetting(true);
    try {
      await resetApp();
      navigation.dispatch(CommonActions.reset({ index: 0, routes: [{ name: "OnboardingGate" }] }));
    } catch (error) {
      setResetting(false);
      Alert.alert("Couldn't reset", (error as Error).message);
    }
  }

  const [onDeviceRecognition] = useState(() => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      return require("expo-speech-recognition").ExpoSpeechRecognitionModule.supportsOnDeviceRecognition() as boolean;
    } catch {
      return false;
    }
  });

  return (
    <Screen title="Settings" onBack={() => navigation.goBack()} contentStyle={styles.content}>
      <ListGroup title="Practice">
        <ListRow
          icon="person-circle-outline"
          title="Your profile and goals"
          subtitle="What gets in your way, where you want to speak better, how you practice"
          chevron
          onPress={() => navigation.navigate("Onboarding", { mode: "profile" })}
        />
        <ListRow icon="speedometer-outline" title="Level & difficulty" subtitle="See your impromptu level, or pin it manually" chevron onPress={() => navigation.navigate("Curriculum")} />
        <SwitchRow
          icon="git-branch-outline"
          title="Plan your point"
          subtitle="A quick PREP sketch before a recording starts"
          value={planYourPointEnabled}
          onValueChange={handlePlanYourPointToggle}
        />
      </ListGroup>

      <Card style={styles.section}>
        <View style={styles.sectionText}>
          <Txt variant="headline">Daily goal</Txt>
          <Txt variant="footnote" tone="secondary">
            The first session is your daily plan; the rest are 4-minute top-ups. Your streak only ever needs one.
          </Txt>
        </View>
        <SegmentedControl
          options={[
            { key: "1", label: "1 a day" },
            { key: "2", label: "2 a day" },
            { key: "3", label: "3 a day" },
          ]}
          value={String(goal)}
          onChange={handleGoalChange}
        />
        <View style={styles.sectionText}>
          <Txt variant="subhead" weight="600">
            Practice days
          </Txt>
          <Txt variant="footnote" tone="secondary">
            A day you leave off never breaks your streak.
          </Txt>
        </View>
        <View style={styles.dayRow}>
          {["S", "M", "T", "W", "T", "F", "S"].map((label, day) => {
            const on = !reminderSettings.practiceDays?.length || reminderSettings.practiceDays.includes(day);
            return (
              <PressableScale
                key={day}
                onPress={() => handleToggleDay(day)}
                haptic="tick"
                scaleTo={0.9}
                style={[styles.dayChip, on && styles.dayChipOn]}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                accessibilityLabel={["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][day]}
              >
                <Txt variant="subhead" weight="600" color={on ? colors.onAccent : colors.textSecondary}>
                  {label}
                </Txt>
              </PressableScale>
            );
          })}
        </View>
      </Card>

      <Card style={styles.section}>
        <SwitchRow
          title="Reminders"
          subtitle={goal > 1 ? "A nudge for each session — skipped once it's done." : "A nudge to practice, once a day."}
          value={reminderSettings.enabled}
          onValueChange={handleReminderToggle}
        />
        {reminderSettings.enabled ? (
          <>
            <LabeledSlider
              label={goal > 1 ? "Session 1" : "Time"}
              value={reminderSettings.hour}
              minimumValue={REMINDER_HOUR_MIN}
              maximumValue={REMINDER_HOUR_MAX}
              step={1}
              formatValue={formatReminderHour}
              onChange={handleReminderHourChange}
            />
            {Array.from({ length: goal - 1 }, (_, i) => (
              <LabeledSlider
                key={i}
                label={`Session ${i + 2}`}
                value={(reminderSettings.extraHours ?? defaultExtraHours(reminderSettings.hour, goal))[i] ?? REMINDER_HOUR_MAX}
                minimumValue={REMINDER_HOUR_MIN}
                maximumValue={REMINDER_HOUR_MAX}
                step={1}
                formatValue={formatReminderHour}
                onChange={(h) => handleExtraHourChange(i, h)}
              />
            ))}
            <PrimaryButton label="Notification settings" variant="secondary" size="sm" icon="open-outline" onPress={() => Linking.openSettings()} style={styles.inlineButton} />
          </>
        ) : null}
      </Card>

      {/* Recording length, Concise mode length, Warm-up, and Prep phase live
          in the Session options sheet on Practice — they only matter right
          before a recording, not as standing app configuration. */}

      <ListGroup title="On-device AI">
        <StatusLine label="Coaching" value={appleCoach ? "Apple Intelligence" : "Built-in rules"} ok />
        <StatusLine label="Live recognition" value={onDeviceRecognition ? "On-device" : "System recognizer"} ok={onDeviceRecognition} />
        <StatusLine label="Transcription" value="Whisper base.en" ok />
        {SHOW_DEV_TOOLS ? <ListRow title="ASR Lab" subtitle="Compare transcription engines" chevron onPress={() => navigation.navigate("AsrLab")} /> : null}
      </ListGroup>
      <Txt variant="footnote" tone="secondary" style={styles.note}>
        All of this runs on your phone. Nothing leaves it unless you ask for a deep review.
      </Txt>

      <Txt variant="footnote" weight="500" tone="secondary" style={styles.groupTitle}>
        Cloud (optional)
      </Txt>
      <Card style={styles.section}>
        <SwitchRow
          title="Cloud transcription"
          subtitle="AssemblyAI, about $0.15 an hour — better with disfluencies. Off by default; on-device transcription is free."
          value={assemblyAiEnabled}
          onValueChange={handleAssemblyAiToggle}
        />
        {assemblyAiEnabled ? (
          <SecretField
            label="AssemblyAI API key"
            caption="From your AssemblyAI dashboard — required for cloud transcription to run."
            value={assemblyAiKey}
            onChangeText={setAssemblyAiKeyField}
            onBlur={() => setAssemblyAiApiKey(assemblyAiKey)}
          />
        ) : null}
      </Card>

      <Card style={styles.section}>
        <View style={styles.sectionText}>
          <Txt variant="headline">Deep review (Gemini)</Txt>
          <Txt variant="footnote" tone="secondary">
            Keys stay on this device. Deep reviews are always opt-in, per session.
          </Txt>
        </View>
        <SecretField
          label="Gemini API key"
          caption="From Google AI Studio — only used for the deep reviews you choose."
          value={geminiKey}
          onChangeText={setGeminiKeyField}
          onBlur={() => setGeminiApiKey(geminiKey)}
        />
      </Card>

      <ListGroup title="Your data">
        <ListRow icon="film-outline" title="Videos" value={formatBytes(videoBytes)} />
        <ListRow icon="share-outline" title="Export practice data" chevron onPress={handleExport} />
        <ListRow icon="trash-outline" title="Clear old videos" subtitle="Keeps the best take from each month" destructive onPress={handleDeleteOldVideos} />
      </ListGroup>
      <Txt variant="footnote" tone="secondary" style={styles.note}>
        Your recordings and practice history stay on this phone.
      </Txt>

      <ListGroup title="Start over">
        <ListRow
          icon="refresh-outline"
          title="Reset app"
          subtitle="Deletes every recording, video and bit of progress, then starts onboarding again"
          destructive
          onPress={confirmReset}
        />
      </ListGroup>
      <Txt variant="footnote" tone="secondary" style={styles.note}>
        Your API keys are kept.
      </Txt>

      {resetting ? (
        <Modal transparent animationType="fade" visible>
          <View style={styles.resetOverlay}>
            <ActivityIndicator color={colors.textPrimary} />
            <Txt variant="headline">Resetting…</Txt>
          </View>
        </Modal>
      ) : null}
    </Screen>
  );
}

function StatusLine({ label, value, ok }: { label: string; value: string; ok?: boolean }) {
  const { colors } = useTheme();
  return (
    <ListRow
      title={label}
      value={value}
      right={<Ionicons name={ok ? "checkmark-circle" : "ellipse-outline"} size={18} color={ok ? colors.success : colors.textMuted} />}
    />
  );
}

const useStyles = makeStyles((t) => ({
  content: { gap: t.space.lg },
  resetOverlay: { flex: 1, alignItems: "center", justifyContent: "center", gap: t.space.md, backgroundColor: t.colors.overlayScrim },
  section: { gap: t.space.md },
  sectionText: { gap: 2 },
  groupTitle: { paddingHorizontal: 4, marginBottom: -t.space.md },
  note: { paddingHorizontal: 4, marginTop: -t.space.sm },
  inlineButton: { alignSelf: "flex-start" },
  dayRow: { flexDirection: "row", justifyContent: "space-between" },
  dayChip: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: t.colors.surfaceRaised },
  dayChipOn: { backgroundColor: t.colors.accent },
  secretField: { gap: t.space.xs + 2 },
  secretInputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: t.space.sm,
    backgroundColor: t.colors.surfaceRaised,
    borderRadius: t.radius.md - 4,
    paddingHorizontal: t.space.md,
    height: 46,
  },
  secretInput: { ...t.type.callout, flex: 1, color: t.colors.textPrimary, padding: 0 },
}));
