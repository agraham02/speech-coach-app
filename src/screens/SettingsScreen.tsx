import { useEffect, useState } from "react";
import { Alert, Linking, Pressable, ScrollView, Switch, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../navigation";
import { ScreenContainer } from "../components/common/ScreenContainer";
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
  getNotionPageId,
  getNotionToken,
  setAssemblyAiApiKey,
  setGeminiApiKey,
  setNotionPageId,
  setNotionToken,
} from "../services/secrets/secretsStore";
import { formatReminderHour, REMINDER_HOUR_MAX, REMINDER_HOUR_MIN } from "../domain/reminderSettings";
import { defaultExtraHours, type DailyGoal } from "../domain/dailyGoal";
import { ChipGroup } from "../components/common/Chip";
import { getDailySessionGoal, getVideoRetentionDays, setDailySessionGoal } from "../services/prefs/prefsStore";
import { cancelDailyReminder, requestNotificationPermission, syncDailyReminder } from "../services/notifications/reminderScheduler";
import { spacing, typography } from "../theme/theme";
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
// (Gemini key, Notion token, Notion page ID) below rather than a bare
// Switch/Slider, since these are pasted-in credentials, not toggled prefs.
function SecretField({ label, caption, value, onChangeText, onBlur }: SecretFieldProps) {
  const styles = useStyles();
  const { colors } = useTheme();
  const [visible, setVisible] = useState(false);
  return (
    <View style={styles.secretField}>
      <Text style={styles.switchLabel}>{label}</Text>
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
      <Text style={styles.sectionSubtitle}>{caption}</Text>
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
  const [notionToken, setNotionTokenField] = useState("");
  const [notionPageId, setNotionPageIdField] = useState("");
  const [assemblyAiEnabled, setAssemblyAiEnabledState] = useState(getAssemblyAiEnabled());
  const [assemblyAiKey, setAssemblyAiKeyField] = useState("");

  useEffect(() => {
    Promise.all([getGeminiApiKey(), getNotionToken(), getNotionPageId(), getAssemblyAiApiKey()]).then(
      ([gemini, token, pageId, assemblyAi]) => {
        setGeminiKeyField(gemini ?? "");
        setNotionTokenField(token ?? "");
        setNotionPageIdField(pageId ?? "");
        setAssemblyAiKeyField(assemblyAi ?? "");
      },
    );
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
  const [onDeviceRecognition] = useState(() => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      return require("expo-speech-recognition").ExpoSpeechRecognitionModule.supportsOnDeviceRecognition() as boolean;
    } catch {
      return false;
    }
  });

  return (
    <ScreenContainer style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={12} accessibilityRole="button" accessibilityLabel="Go back">
          <Ionicons name="chevron-back" size={26} color={colors.textPrimary} />
        </Pressable>
        <Text style={styles.title}>Settings</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
      <Text style={styles.groupLabel}>PRACTICE</Text>
      <Card style={styles.section}>
        <Pressable onPress={() => navigation.navigate("Onboarding", { mode: "profile" })} style={styles.sectionHeaderRow} accessibilityRole="button">
          <View style={styles.sectionHeaderText}>
            <Text style={styles.sectionTitle}>Your profile and goals</Text>
            <Text style={styles.sectionSubtitle}>What gets in your way, where you want to speak better, how you practice.</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
        </Pressable>
      </Card>
      <Card style={styles.section}>
        <View style={styles.sectionHeaderText}>
          <Text style={styles.sectionTitle}>Daily goal</Text>
          <Text style={styles.sectionSubtitle}>
            Sessions a day. The first is your daily plan; the rest are 4-minute top-ups. Your streak only ever needs one.
          </Text>
        </View>
        <ChipGroup
          options={[
            { key: "1", label: "1 a day" },
            { key: "2", label: "2 a day" },
            { key: "3", label: "3 a day" },
          ]}
          value={String(goal)}
          onChange={handleGoalChange}
        />
        <View style={styles.sectionHeaderText}>
          <Text style={styles.sectionSubtitle}>Practice days — a day you leave off never breaks your streak.</Text>
        </View>
        <View style={styles.dayRow}>
          {["S", "M", "T", "W", "T", "F", "S"].map((label, day) => {
            const on = !reminderSettings.practiceDays?.length || reminderSettings.practiceDays.includes(day);
            return (
              <Pressable
                key={day}
                onPress={() => handleToggleDay(day)}
                style={[styles.dayChip, on && { backgroundColor: colors.accent }]}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                accessibilityLabel={["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][day]}
              >
                <Text style={[styles.dayText, on && { color: colors.onAccent }]}>{label}</Text>
              </Pressable>
            );
          })}
        </View>
      </Card>
      <Card style={styles.section}>
        <View style={styles.sectionHeaderRow}>
          <View style={styles.sectionHeaderText}>
            <Text style={styles.sectionTitle}>Reminders</Text>
            <Text style={styles.sectionSubtitle}>{goal > 1 ? "A nudge for each session — skipped once it's done." : "A nudge to practice, once a day."}</Text>
          </View>
          <Switch
            value={reminderSettings.enabled}
            onValueChange={handleReminderToggle}
            trackColor={{ true: colors.accent, false: colors.switchTrackOff }}
          />
        </View>
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
            <Pressable onPress={() => Linking.openSettings()}>
              <Text style={styles.linkText}>Open iOS notification settings</Text>
            </Pressable>
          </>
        ) : null}
      </Card>

      {/* Recording length, Concise mode length, Warm-up, and Prep phase moved
          to the Session options sheet on Home (opened from the icon button
          next to Start Recording) — they only ever matter right before a
          recording, not as standing app configuration like what's left here. */}
      <Card style={styles.section}>
        <View style={styles.sectionHeaderRow}>
          <View style={styles.sectionHeaderText}>
            <Text style={styles.sectionTitle}>Plan your point</Text>
            <Text style={styles.sectionSubtitle}>
              A quick PREP (Point/Reason/Example) sketch before recording starts.
            </Text>
          </View>
          <Switch
            value={planYourPointEnabled}
            onValueChange={handlePlanYourPointToggle}
            trackColor={{ true: colors.accent, false: colors.switchTrackOff }}
          />
        </View>
      </Card>

      <Pressable onPress={() => navigation.navigate("Curriculum")} accessibilityRole="button">
        <Card style={styles.linkCard}>
          <View style={styles.sectionHeaderText}>
            <Text style={styles.sectionTitle}>Level & difficulty</Text>
            <Text style={styles.sectionSubtitle}>See your impromptu level, or pin it manually.</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
        </Card>
      </Pressable>

      <Text style={styles.groupLabel}>ON-DEVICE AI</Text>
      <Card style={styles.section}>
        <StatusLine label="Coaching" value={appleCoach ? "Apple Intelligence (on-device)" : "Built-in rules (on-device)"} ok />
        <StatusLine label="Live recognition" value={onDeviceRecognition ? "On-device" : "System recognizer"} ok={onDeviceRecognition} />
        <StatusLine label="Transcription" value="Whisper base.en (on-device)" ok />
        <Text style={styles.sectionSubtitle}>
          Everything above runs on this phone. Nothing leaves it unless you ask for a deep review or Notion sync.
        </Text>
        {SHOW_DEV_TOOLS ? (
          <Pressable onPress={() => navigation.navigate("AsrLab")}>
            <Text style={styles.linkText}>Compare transcription engines (ASR Lab)</Text>
          </Pressable>
        ) : null}
      </Card>

      <Text style={styles.groupLabel}>CLOUD (OPTIONAL)</Text>
      <Card style={styles.section}>
        <View style={styles.sectionHeaderRow}>
          <View style={styles.sectionHeaderText}>
            <Text style={styles.sectionTitle}>Cloud transcription (AssemblyAI)</Text>
            <Text style={styles.sectionSubtitle}>
              Off by default — on-device transcription is free. Turning this on sends your recording's audio to
              AssemblyAI (~$0.15/hr) for higher-accuracy transcription, especially on disfluencies.
            </Text>
          </View>
          <Switch
            value={assemblyAiEnabled}
            onValueChange={handleAssemblyAiToggle}
            trackColor={{ true: colors.accent, false: colors.switchTrackOff }}
          />
        </View>
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
        <Text style={styles.sectionTitle}>Deep review (Gemini)</Text>
        <Text style={styles.sectionSubtitle}>
          Keys are stored on this device only. Deep reviews are always opt-in, per session.
        </Text>
        <SecretField
          label="Gemini API key"
          caption="From Google AI Studio — only used for optional deep reviews (the cloud upload you choose per session)."
          value={geminiKey}
          onChangeText={setGeminiKeyField}
          onBlur={() => setGeminiApiKey(geminiKey)}
        />
      </Card>

      <Text style={styles.groupLabel}>NOTION JOURNAL</Text>
      <Card style={styles.section}>
        <SecretField
          label="Notion token"
          caption="A Notion integration token — share your journal page with the integration in Notion's UI, or sync will 404."
          value={notionToken}
          onChangeText={setNotionTokenField}
          onBlur={() => setNotionToken(notionToken)}
        />
        <SecretField
          label="Notion page ID"
          caption="Your journal page's ID — where synced transcripts are appended."
          value={notionPageId}
          onChangeText={setNotionPageIdField}
          onBlur={() => setNotionPageId(notionPageId)}
        />
      </Card>

      <Text style={styles.groupLabel}>DATA</Text>
      <Card style={styles.section}>
        <Text style={styles.sectionTitle}>Your data stays on this phone</Text>
        <Text style={styles.sectionSubtitle}>Videos use {formatBytes(videoBytes)}.</Text>
        <Pressable onPress={handleExport} accessibilityRole="button">
          <Text style={styles.linkText}>Export practice data (share sheet)</Text>
        </Pressable>
        <Pressable onPress={handleDeleteOldVideos} accessibilityRole="button">
          <Text style={styles.linkText}>Clear videos older than 30 days (keeps one a month)</Text>
        </Pressable>
      </Card>
      </ScrollView>
    </ScreenContainer>
  );
}

function StatusLine({ label, value, ok }: { label: string; value: string; ok?: boolean }) {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <View style={styles.statusLine}>
      <Ionicons name={ok ? "checkmark-circle" : "ellipse-outline"} size={16} color={ok ? colors.success : colors.textMuted} />
      <Text style={styles.statusLabel}>{label}</Text>
      <Text style={styles.statusValue}>{value}</Text>
    </View>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  groupLabel: { color: colors.textMuted, fontSize: 11, fontWeight: "700", letterSpacing: 0.8, marginTop: spacing.sm },
  linkCard: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  statusLine: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  statusLabel: { color: colors.textPrimary, fontSize: typography.body, fontWeight: "600", flex: 1 },
  statusValue: { color: colors.textSecondary, fontSize: typography.caption },
  container: { gap: spacing.lg },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  headerSpacer: { width: 26 },
  title: { color: colors.textPrimary, fontSize: typography.title, fontWeight: "700" },
  scroll: { flex: 1 },
  scrollContent: { gap: spacing.lg, paddingBottom: spacing.lg },
  section: { gap: spacing.md },
  sectionHeaderRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.md },
  sectionHeaderText: { flex: 1, gap: spacing.xs },
  sectionTitle: { color: colors.textPrimary, fontSize: typography.bodyLarge, fontWeight: "700" },
  sectionSubtitle: { color: colors.textSecondary, fontSize: typography.caption, lineHeight: 18 },
  switchRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  switchLabel: { color: colors.textSecondary, fontSize: typography.body },
  linkText: { color: colors.accent, fontSize: typography.caption, fontWeight: "600" },
  dayRow: { flexDirection: "row", justifyContent: "space-between" },
  dayChip: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center", backgroundColor: colors.surfaceRaised },
  dayText: { color: colors.textSecondary, fontSize: typography.caption, fontWeight: "700" },
  secretField: { gap: spacing.xs },
  secretInputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.surfaceRaised,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  secretInput: { flex: 1, color: colors.textPrimary, fontSize: typography.body, padding: 0 },
}));
