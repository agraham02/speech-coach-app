import { useCallback, useState } from "react";
import { Alert, Modal, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import * as Notifications from "expo-notifications";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../../navigation";
import { Screen } from "../../components/common/Screen";
import { Card } from "../../components/common/Card";
import { ListGroup, ListRow } from "../../components/common/ListRow";
import { Txt } from "../../components/common/Txt";
import { useToast } from "../../components/common/ToastProvider";
import { Mono } from "../../components/dev/Mono";
import { WelcomeIntro } from "../../components/onboarding/WelcomeIntro";
import { GUIDES } from "../../content/guide";
import { getCloudCallsToday, getGuideSeen, resetCloudCallsToday, resetGuide, unmarkGuideSeen } from "../../services/prefs/prefsStore";
import { requestNotificationPermission } from "../../services/notifications/reminderScheduler";
import { storageBreakdown, type StorageLine } from "../../services/dev/storageInfo";
import { modelBackupStatus, reapplyBackupExclusion, type ModelBackupStatus } from "../../services/asr/whisperModels";
import { formatBytes } from "../../domain/dev/jsonView";
import { DAILY_REVIEW_LIMIT } from "../../services/cloud/inputGuards";
import { todayISODate } from "../../utils/dateUtils";
import { makeStyles } from "../../theme/ThemeProvider";

type Props = NativeStackScreenProps<RootStackParamList, "DevTools">;

const GUIDE_IDS = Object.keys(GUIDES);

interface Scheduled {
  id: string;
  body: string;
  when: string;
}

function describeTrigger(trigger: Notifications.NotificationTrigger | null): string {
  if (!trigger) return "now";
  const t = trigger as { type?: string; value?: number; seconds?: number };
  if (typeof t.value === "number") return new Date(t.value).toLocaleString(undefined, { weekday: "short", hour: "numeric", minute: "2-digit" });
  if (typeof t.seconds === "number") return "in " + t.seconds + " s";
  return t.type ?? "scheduled";
}

// Small utilities for checking things the app only shows once or on a
// schedule: tours, the welcome intro, reminders, the review limit, storage.
export function ToolsScreen({ navigation }: Props) {
  const styles = useStyles();
  const showToast = useToast();
  const [seen, setSeen] = useState<string[]>(getGuideSeen());
  const [calls, setCalls] = useState(() => getCloudCallsToday(todayISODate()));
  const [scheduled, setScheduled] = useState<Scheduled[] | null>(null);
  const [storage, setStorage] = useState<StorageLine[]>([]);
  const [backup, setBackup] = useState<ModelBackupStatus | null>(null);
  const [intro, setIntro] = useState(false);

  const refresh = useCallback(() => {
    setSeen(getGuideSeen());
    setCalls(getCloudCallsToday(todayISODate()));
    setStorage(storageBreakdown());
    setBackup(modelBackupStatus());
    Notifications.getAllScheduledNotificationsAsync()
      .then((list) => setScheduled(list.map((n) => ({ id: n.identifier, body: n.content.body ?? "", when: describeTrigger(n.trigger) }))))
      .catch(() => setScheduled([]));
  }, []);

  useFocusEffect(refresh);

  async function sendTest() {
    if (!(await requestNotificationPermission())) {
      Alert.alert("Notifications are off", "Allow notifications for Tono in Settings first.");
      return;
    }
    await Notifications.scheduleNotificationAsync({
      content: { title: "Tono", body: "Test notification from the Dev tab." },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: 5 },
    });
    showToast("Sending in 5 seconds. Lock the phone or leave the app.", "success");
    refresh();
  }

  return (
    <Screen title="App tools" eyebrow="Dev" onBack={navigation.goBack}>
      <ListGroup title="Tours">
        {GUIDE_IDS.map((id) => {
          const done = seen.includes(id);
          return (
            <ListRow
              key={id}
              title={id}
              subtitle={done ? "Seen. Tap to show it again." : "Not seen yet"}
              value={done ? "seen" : "new"}
              onPress={
                done
                  ? () => {
                      unmarkGuideSeen(id);
                      refresh();
                      showToast("The " + id + " tour will show next time you open that screen.", "success");
                    }
                  : undefined
              }
            />
          );
        })}
        <ListRow
          icon="sparkles-outline"
          title="Show every tour again"
          onPress={() => {
            resetGuide();
            refresh();
            showToast("All tours will show again.", "success");
          }}
        />
      </ListGroup>

      <ListGroup title="Onboarding">
        <ListRow icon="play-outline" title="Preview the welcome intro" subtitle="Plays it over this screen; nothing is saved" chevron onPress={() => setIntro(true)} />
      </ListGroup>

      <ListGroup title="Notifications">
        <ListRow icon="notifications-outline" title="Send a test in 5 seconds" onPress={sendTest} />
      </ListGroup>
      <Card style={styles.block}>
        <Txt variant="footnote" tone="secondary">
          {scheduled === null ? "Loading scheduled reminders..." : scheduled.length + " scheduled"}
        </Txt>
        {(scheduled ?? []).map((n) => (
          <View key={n.id} style={styles.line}>
            <Mono tone="secondary">{n.when}</Mono>
            <Txt variant="footnote" numberOfLines={2}>
              {n.body}
            </Txt>
          </View>
        ))}
      </Card>

      <ListGroup title="Deep review limit">
        <ListRow title="Used today" value={calls + " of " + DAILY_REVIEW_LIMIT} />
        <ListRow
          icon="refresh-outline"
          title="Reset today"
          subtitle="Starts the daily count over"
          onPress={() => {
            resetCloudCallsToday();
            refresh();
          }}
        />
      </ListGroup>

      <ListGroup title="Storage">
        {storage.map((line) => (
          <ListRow key={line.label} title={line.label} value={formatBytes(line.bytes)} />
        ))}
        <ListRow
          title="Models kept out of backups"
          subtitle={
            backup === null || backup.folder === null
              ? "Unknown: this build has no backup control (Android, or an iOS build from before it was added)."
              : backup.files.length === 0
                ? "Folder flagged. No model downloaded yet."
                : backup.files.map((f) => f.name + ": " + (f.excluded ? "excluded" : "NOT excluded")).join("\n") + "\nTap to set the flag again."
          }
          value={backup === null || backup.folder === null ? "?" : backup.folder && backup.files.every((f) => f.excluded) ? "Yes" : "No"}
          onPress={() => setBackup(reapplyBackupExclusion())}
        />
      </ListGroup>

      <Modal visible={intro} animationType="fade" onRequestClose={() => setIntro(false)}>
        <WelcomeIntro onDone={() => setIntro(false)} />
      </Modal>
    </Screen>
  );
}

const useStyles = makeStyles((t) => ({
  block: { gap: t.space.sm },
  line: { gap: 2 },
}));
