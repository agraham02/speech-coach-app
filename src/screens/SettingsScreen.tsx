import { useEffect, useState } from "react";
import { Linking, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../navigation";
import { ScreenContainer } from "../components/common/ScreenContainer";
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
import { cancelDailyReminder, requestNotificationPermission, syncDailyReminder } from "../services/notifications/reminderScheduler";
import { colors, spacing, typography } from "../theme/theme";

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
  const showToast = useToast();
  const [reminderSettings, setReminderSettingsState] = useState(getReminderSettings());
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
            trackColor={{ true: colors.accent, false: "rgba(255,255,255,0.2)" }}
          />
        </View>
      </Card>

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
            trackColor={{ true: colors.accent, false: "rgba(255,255,255,0.2)" }}
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
        <Text style={styles.sectionTitle}>API keys</Text>
        <Text style={styles.sectionSubtitle}>
          Stored on this device only — never compiled into the app itself. Grading and Notion sync fail with a
          reminder here if you try to use them before adding the relevant key.
        </Text>
        <SecretField
          label="Gemini API key"
          caption="From Google AI Studio — only used for optional deep reviews (the cloud upload you choose per session)."
          value={geminiKey}
          onChangeText={setGeminiKeyField}
          onBlur={() => setGeminiApiKey(geminiKey)}
        />
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
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
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
});
