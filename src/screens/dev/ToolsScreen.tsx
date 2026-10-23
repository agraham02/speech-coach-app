import { useCallback, useMemo, useState } from "react";
import { Alert, Modal, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import * as Notifications from "expo-notifications";
import * as Updates from "expo-updates";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../../navigation";
import { Screen } from "../../components/common/Screen";
import { Card } from "../../components/common/Card";
import { ListGroup, ListRow } from "../../components/common/ListRow";
import { Txt } from "../../components/common/Txt";
import { useToast } from "../../components/common/ToastProvider";
import { Mono } from "../../components/dev/Mono";
import { WelcomeIntro } from "../../components/onboarding/WelcomeIntro";
import { Waveform } from "../../components/rewind/Waveform";
import { Chip } from "../../components/common/Chip";
import { PrimaryButton } from "../../components/common/PrimaryButton";
import { CADENCES, syntheticVolume } from "../../services/dev/syntheticVolume";
import { GUIDES } from "../../content/guide";
import { getCloudCallsToday, getGuideSeen, resetCloudCallsToday, resetGuide, unmarkGuideSeen } from "../../services/prefs/prefsStore";
import { requestNotificationPermission } from "../../services/notifications/reminderScheduler";
import { storageBreakdown, type StorageLine } from "../../services/dev/storageInfo";
import { mediaBackupStatus } from "../../services/storage/mediaBackup";
import { modelBackupStatus, reapplyBackupExclusion, type ModelBackupStatus } from "../../services/asr/whisperModels";
import { formatBytes } from "../../domain/dev/jsonView";
import { DAILY_REVIEW_LIMIT } from "../../services/cloud/inputGuards";
import { todayISODate } from "../../utils/dateUtils";
import { makeStyles, useTheme } from "../../theme/ThemeProvider";
import { ProgressReveal } from "../../components/celebrate/ProgressReveal";
import { celebrate } from "../../components/celebrate/CelebrationHost";
import { buildMoment, type MomentInput } from "../../domain/progressMoment";

// Made-up takes for previewing the progress moment: nothing is read or saved.
const SAMPLE_MOMENTS: { label: string; input: MomentInput }[] = [
  {
    label: "Stage earned",
    input: {
      score: 7.4,
      previousScores: [6.8, 6.9, 6.5, 6.6],
      previousBest: 7.6,
      moves: [
        { skill: "impromptu", ratingBefore: 33.5, ratingAfter: 36.2, stageBefore: 1, stageAfter: 2 },
        { skill: "cadence", ratingBefore: 41, ratingAfter: 42.3, stageBefore: 2, stageAfter: 2 },
      ],
      speakerLevelBefore: 2,
      speakerLevelAfter: 3,
      path: { unitTitle: "Just start talking", lessonIndex: 2, lessonCount: 3 },
    },
  },
  {
    label: "Personal best",
    input: {
      score: 8.2,
      previousScores: [7.1, 7.4, 6.9],
      previousBest: 7.6,
      moves: [{ skill: "confidence", ratingBefore: 47, ratingAfter: 49.4, stageBefore: 3, stageAfter: 3 }],
      streakDays: 6,
    },
  },
  {
    label: "Off day",
    input: {
      score: 6.1,
      previousScores: [7.0, 6.4, 6.2, 6.0, 6.3],
      previousBest: 7.6,
      moves: [
        { skill: "impromptu", ratingBefore: 44, ratingAfter: 42.8, stageBefore: 2, stageAfter: 2 },
        { skill: "conversation", ratingBefore: 38, ratingAfter: 38.6, stageBefore: 2, stageAfter: 2 },
      ],
      goal: { done: 2, goal: 3 },
    },
  },
];

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
  const { colors } = useTheme();
  const showToast = useToast();
  const [seen, setSeen] = useState<string[]>(getGuideSeen());
  const [calls, setCalls] = useState(() => getCloudCallsToday(todayISODate()));
  const [scheduled, setScheduled] = useState<Scheduled[] | null>(null);
  const [storage, setStorage] = useState<StorageLine[]>([]);
  const [backup, setBackup] = useState<ModelBackupStatus | null>(null);
  const [intro, setIntro] = useState(false);
  const [checking, setChecking] = useState(false);
  const [waveOpen, setWaveOpen] = useState(false);
  const [momentIndex, setMomentIndex] = useState<number | null>(null);
  const [momentRun, setMomentRun] = useState(0);
  const [cadenceIndex, setCadenceIndex] = useState(2);
  const subscribeSynthetic = useMemo(() => syntheticVolume(CADENCES[cadenceIndex]), [cadenceIndex]);

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

  // EAS Update by hand: check, download, restart into it. Off in
  // development builds, which always load JS from Metro.
  const updatesLive = Updates.isEnabled && !__DEV__;
  async function checkForUpdate() {
    if (!updatesLive || checking) return;
    setChecking(true);
    try {
      const check = await Updates.checkForUpdateAsync();
      if (!check.isAvailable) {
        showToast("Already on the latest update.", "success");
        return;
      }
      await Updates.fetchUpdateAsync();
      await Updates.reloadAsync();
    } catch (error) {
      showToast(`Update check failed: ${(error as Error).message}`, "error");
    } finally {
      setChecking(false);
    }
  }

  return (
    <Screen title="App tools" eyebrow="Dev" onBack={navigation.goBack}>
      <ListGroup title="Over-the-air updates">
        <ListRow title="Channel" value={Updates.channel ?? "none"} />
        <ListRow title="Runtime" subtitle={Updates.runtimeVersion ?? "unknown"} />
        <ListRow
          title="Running"
          subtitle={!updatesLive ? "A development build: JS comes from Metro, not from updates" : Updates.isEmbeddedLaunch ? "The JS built into this binary" : `Update ${Updates.updateId ?? "unknown"}`}
        />
        {updatesLive ? <ListRow title={checking ? "Checking…" : "Check for an update"} subtitle="Downloads it and restarts right away" onPress={checkForUpdate} chevron /> : null}
      </ListGroup>

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

      <ListGroup title="Previews">
        <ListRow icon="pulse-outline" title="Preview the live waveform" subtitle="Simulated speech at different reading rates" chevron onPress={() => setWaveOpen(true)} />
        <ListRow icon="play-outline" title="Preview the welcome intro" subtitle="Plays it over this screen; nothing is saved" chevron onPress={() => setIntro(true)} />
        <ListRow icon="sparkles-outline" title="Preview a progress moment" subtitle="What a take's Result plays once its progress lands" chevron onPress={() => setMomentIndex(0)} />
        <ListRow
          icon="ribbon-outline"
          title="Preview a stage celebration"
          subtitle="Cadence reaching Steady"
          chevron
          onPress={() => celebrate({ kind: "stage", skill: "cadence", stage: 3, speakerLevel: 6 })}
        />
        <ListRow
          icon="checkmark-done-outline"
          title="Preview a unit celebration"
          subtitle="Finishing The power of the pause"
          chevron
          onPress={() =>
            celebrate({
              kind: "unit",
              skill: "cadence",
              unitTitle: "The power of the pause",
              lessons: ["Pause on purpose", "Pause instead of um", "Hold the silence"],
              ratingFrom: 31,
              ratingTo: 38.5,
              next: "Just start talking",
            })
          }
        />
        <ListRow
          icon="trophy-outline"
          title="Preview the path finale"
          subtitle="The screen for finishing every unit; not marked seen"
          chevron
          onPress={() => navigation.navigate("PathFinale", { preview: true })}
        />
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
        {mediaBackupStatus().map((m) => (
          <ListRow key={m.folder} title={`${m.folder}/ kept out of backups`} value={m.excluded == null ? "?" : m.excluded ? "Yes" : "No"} />
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

      <Modal visible={waveOpen} animationType="fade" onRequestClose={() => setWaveOpen(false)}>
        <View style={styles.wavePreview}>
          <Txt variant="title3">Live waveform</Txt>
          <Txt variant="footnote" tone="secondary">
            Simulated speech. The real thing gets readings about every 100 ms on an iPhone, and unevenly. The motion should stay smooth in all three.
          </Txt>
          <View style={styles.waveChips}>
            {CADENCES.map((c, i) => (
              <Chip key={c.label} label={c.label} selected={i === cadenceIndex} onPress={() => setCadenceIndex(i)} />
            ))}
          </View>
          <Waveform height={220} color={colors.skill.conversation.fg} subscribe={subscribeSynthetic} live={waveOpen} />
          <PrimaryButton label="Close" variant="secondary" onPress={() => setWaveOpen(false)} />
        </View>
      </Modal>

      <Modal visible={momentIndex != null} animationType="fade" onRequestClose={() => setMomentIndex(null)}>
        <View style={styles.wavePreview}>
          <Txt variant="title3">Progress moment</Txt>
          <View style={styles.waveChips}>
            {SAMPLE_MOMENTS.map((m, i) => (
              <Chip
                key={m.label}
                label={m.label}
                selected={momentIndex === i}
                onPress={() => {
                  setMomentIndex(i);
                  setMomentRun((r) => r + 1);
                }}
              />
            ))}
          </View>
          {momentIndex != null ? <ProgressReveal key={momentRun} beats={buildMoment(SAMPLE_MOMENTS[momentIndex].input)} animate /> : null}
          <PrimaryButton label="Replay" variant="secondary" onPress={() => setMomentRun((r) => r + 1)} />
          <PrimaryButton label="Close" variant="ghost" onPress={() => setMomentIndex(null)} />
        </View>
      </Modal>

      <Modal visible={intro} animationType="fade" onRequestClose={() => setIntro(false)}>
        <WelcomeIntro onDone={() => setIntro(false)} />
      </Modal>
    </Screen>
  );
}

const useStyles = makeStyles((t) => ({
  wavePreview: { flex: 1, backgroundColor: t.colors.background, padding: t.layout.gutter, paddingTop: 80, gap: t.space.lg },
  waveChips: { flexDirection: "row", flexWrap: "wrap", gap: t.space.sm },
  block: { gap: t.space.sm },
  line: { gap: 2 },
}));
