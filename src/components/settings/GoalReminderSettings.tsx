import { useState } from "react";
import { Linking, View } from "react-native";
import { Card } from "../common/Card";
import { SwitchRow } from "../common/ListRow";
import { PressableScale } from "../common/PressableScale";
import { PrimaryButton } from "../common/PrimaryButton";
import { SegmentedControl } from "../common/SegmentedControl";
import { Txt } from "../common/Txt";
import { useToast } from "../common/ToastProvider";
import { ReminderHours } from "./ReminderHours";
import { PracticeHabitSettings } from "./PracticeHabitSettings";
import { blocksFor, MINUTE_CHOICES, type DailyMinutes } from "../../domain/sessionLength";
import { formatReminderHour, planSessionHours, setSessionHour } from "../../domain/reminderSettings";
import { getReminderSettings, getRewindReminder, getUsualMinutes, setReminderSettings, setRewindReminder, setUsualMinutes } from "../../services/prefs/prefsStore";
import { syncRewindReminder } from "../../services/rewind/rewindReminder";
import { cancelDailyReminder, requestNotificationPermission, syncDailyReminder } from "../../services/notifications/reminderScheduler";
import { makeStyles, useTheme } from "../../theme/ThemeProvider";

// Settings → Goal & reminders: your usual minutes a day, which days you plan
// to practice, and when to be nudged.
export function GoalReminderSettings() {
  const styles = useStyles();
  const { colors } = useTheme();
  const showToast = useToast();
  const [reminderSettings, setReminderSettingsState] = useState(getReminderSettings());
  const [usual, setUsualState] = useState<DailyMinutes>(getUsualMinutes());
  // A 20 or 30 minute day is two blocks, each with its reminder.
  const goal = blocksFor(usual).length;
  const sessionHours = (first: number, extra: number[] | undefined, blocks: number) => planSessionHours(first, extra, blocks);
  const [rewind, setRewindState] = useState(getRewindReminder());

  function save(next: typeof reminderSettings) {
    setReminderSettingsState(next);
    setReminderSettings(next);
  }

  async function handleReminderToggle(enabled: boolean) {
    if (!enabled) {
      save({ ...reminderSettings, enabled: false });
      await cancelDailyReminder();
      return;
    }

    const granted = await requestNotificationPermission();
    if (!granted) {
      showToast("Notifications are disabled — enable them in iOS Settings first", "error");
      return;
    }

    const next = { ...reminderSettings, enabled: true };
    save(next);
    await syncDailyReminder();
    showToast(`Daily reminder set for ${formatReminderHour(next.hour)}`, "success");
  }

  async function handleRewindToggle(enabled: boolean) {
    if (enabled && !(await requestNotificationPermission())) {
      showToast("Notifications are disabled — enable them in your phone's settings first", "error");
      return;
    }
    const next = { ...rewind, enabled };
    setRewindState(next);
    setRewindReminder(next);
    await syncRewindReminder();
  }

  async function handleRewindHour(hour: number) {
    const next = { ...rewind, hour };
    setRewindState(next);
    setRewindReminder(next);
    if (next.enabled) await syncRewindReminder();
  }

  async function handleGoalChange(key: string) {
    const minutes = Number(key) as DailyMinutes;
    setUsualState(minutes);
    setUsualMinutes(minutes);
    // A second block gets its own reminder, after the first.
    const next = blocksFor(minutes).length;
    const planned = sessionHours(reminderSettings.hour, reminderSettings.extraHours, next);
    const kept = (reminderSettings.extraHours ?? []).slice(planned.length - 1);
    save({ ...reminderSettings, hour: planned[0], extraHours: [...planned.slice(1), ...kept] });
    await syncDailyReminder();
  }

  async function handleHourChange(index: number, hour: number) {
    const hours = setSessionHour(sessionHours(reminderSettings.hour, reminderSettings.extraHours, goal), index, hour);
    const next = { ...reminderSettings, hour: hours[0], extraHours: hours.slice(1) };
    save(next);
    if (next.enabled) await syncDailyReminder();
  }

  async function handleToggleDay(day: number) {
    const current = reminderSettings.practiceDays?.length ? reminderSettings.practiceDays : [0, 1, 2, 3, 4, 5, 6];
    const days = current.includes(day) ? current.filter((d) => d !== day) : [...current, day].sort();
    if (!days.length) return;
    const next = { ...reminderSettings, practiceDays: days.length === 7 ? [] : days };
    save(next);
    if (next.enabled) await syncDailyReminder();
  }

  return (
    <>
      <Card style={styles.section}>
        <View style={styles.sectionText}>
          <Txt variant="headline">Minutes a day</Txt>
          <Txt variant="footnote" tone="secondary">
            Your usual. Change it for one day on Today. 20 and 30 split into two blocks. Your streak only needs one activity.
          </Txt>
        </View>
        <SegmentedControl
          options={MINUTE_CHOICES.map((m) => ({ key: String(m), label: `${m}` }))}
          value={String(usual)}
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
          subtitle={goal > 1 ? "A nudge for each block — skipped once it's done." : "A nudge to practice, once a day."}
          value={reminderSettings.enabled}
          onValueChange={handleReminderToggle}
        />
        {reminderSettings.enabled ? (
          <>
            <ReminderHours hours={sessionHours(reminderSettings.hour, reminderSettings.extraHours, goal)} onChange={handleHourChange} />
            <PrimaryButton label="Notification settings" variant="secondary" size="sm" icon="open-outline" onPress={() => Linking.openSettings()} style={styles.inlineButton} />
          </>
        ) : null}
      </Card>

      <PracticeHabitSettings firstHour={reminderSettings.hour} onMoveReminder={(hour) => handleHourChange(0, hour)} />

      <Card style={styles.section}>
        <SwitchRow
          title="Rewind reminder"
          subtitle="An evening nudge to tell your day, out loud."
          value={rewind.enabled}
          onValueChange={handleRewindToggle}
        />
        {rewind.enabled ? <ReminderHours hours={[rewind.hour]} onChange={(_, hour) => handleRewindHour(hour)} /> : null}
      </Card>

      {/* Recording length, Concise mode length, Warm-up, and Prep phase live
          in the Session options sheet on Practice — they only matter right
          before a recording, not as standing app configuration. */}
    </>
  );
}

const useStyles = makeStyles((t) => ({
  section: { gap: t.space.md },
  sectionText: { gap: 2 },
  inlineButton: { alignSelf: "flex-start" },
  dayRow: { flexDirection: "row", justifyContent: "space-between" },
  dayChip: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: t.colors.surfaceRaised },
  dayChipOn: { backgroundColor: t.colors.accent },
}));
