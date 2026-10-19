import { useState } from "react";
import { ActivityIndicator, Alert, Linking, Modal, Platform, Share, View } from "react-native";
import { CommonActions, useNavigation } from "@react-navigation/native";
import { ListGroup, ListRow, SwitchRow } from "../common/ListRow";
import { Txt } from "../common/Txt";
import { useToast } from "../common/ToastProvider";
import { FEEDBACK_URL } from "../../config/feedback";
import { formatLogsForSharing } from "../../services/logs/logStore";
import { resetApp } from "../../services/data/resetApp";
import { exportPracticeData, formatBytes } from "../../services/data/dataExport";
import { storageBreakdown, type StorageLine } from "../../services/dev/storageInfo";
import { deleteTempMedia } from "../../services/storage/videoStorage";
import { setMediaBackupEnabled } from "../../services/storage/mediaBackup";
import { deleteOldVideos } from "../../services/data/videoKeepsakes";
import { getAudioRetentionDays, getMediaBackup, getVideoRetentionDays, resetGuide, setAudioRetentionDays } from "../../services/prefs/prefsStore";
import { deleteOldRewindAudio } from "../../services/rewind/rewindCleanup";
import { Card } from "../common/Card";
import { SegmentedControl } from "../common/SegmentedControl";
import { makeStyles, useTheme } from "../../theme/ThemeProvider";

const STORAGE_ICONS: Record<StorageLine["key"], "film-outline" | "mic-outline" | "hardware-chip-outline" | "server-outline" | "time-outline"> = {
  videos: "film-outline",
  rewinds: "mic-outline",
  models: "hardware-chip-outline",
  data: "server-outline",
  temp: "time-outline",
};

const AUDIO_RETENTION = [
  { key: "30", label: "30 days" },
  { key: "90", label: "90 days" },
  { key: "365", label: "1 year" },
  { key: "0", label: "Forever" },
];

// Settings → Help & data: the app tips, diagnostics, your data, and a clean
// slate.
export function HelpDataSettings() {
  const styles = useStyles();
  const { colors } = useTheme();
  const showToast = useToast();
  const navigation = useNavigation();
  const [storage, setStorage] = useState<StorageLine[]>(() => storageBreakdown());
  const [mediaBackup, setMediaBackup] = useState(getMediaBackup());
  const bytesOf = (key: StorageLine["key"]) => storage.find((l) => l.key === key)?.bytes ?? 0;
  const [resetting, setResetting] = useState(false);
  const [audioDays, setAudioDays] = useState(getAudioRetentionDays());

  async function handleExport() {
    try {
      await exportPracticeData();
    } catch (error) {
      Alert.alert("Export failed", (error as Error).message);
    }
  }

  function handleDeleteOldVideos() {
    const days = getVideoRetentionDays() || 30;
    Alert.alert(
      `Clear videos older than ${days} days?`,
      "The best and the toughest take from each month are kept (compressed), so you can see how far you've come — find them under Library → Progress videos. Transcripts, analysis and scores are always kept. This can't be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Clear",
          style: "destructive",
          onPress: async () => {
            const { deleted, kept } = await deleteOldVideos(days);
            setStorage(storageBreakdown());
            Alert.alert("Done", `Removed ${deleted} video${deleted === 1 ? "" : "s"}. ${kept} progress video${kept === 1 ? "" : "s"} kept.`);
          },
        },
      ],
    );
  }

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

  return (
    <>
      <ListGroup title="Help">
        {FEEDBACK_URL ? (
          <ListRow
            icon="chatbubble-ellipses-outline"
            title="Send feedback"
            subtitle="Tell me what's confusing, broken or missing. Opens a short form."
            chevron
            onPress={() => Linking.openURL(FEEDBACK_URL).catch(() => Alert.alert("Couldn't open the form", FEEDBACK_URL))}
          />
        ) : null}
        <ListRow
          icon="sparkles-outline"
          title="Show tips again"
          subtitle="A short tour the first time you reach each part of the app"
          onPress={() => {
            resetGuide();
            showToast("Tips will show again as you go.", "success");
          }}
        />
        <ListRow
          icon="bug-outline"
          title="Share diagnostics"
          subtitle="The app's recent log, for reporting a problem. No recordings or keys."
          onPress={() => Share.share({ message: formatLogsForSharing() }).catch(() => undefined)}
        />
      </ListGroup>

      <ListGroup title="Storage">
        {storage.map((line) => (
          <ListRow key={line.key} icon={STORAGE_ICONS[line.key]} title={line.label} value={formatBytes(line.bytes)} />
        ))}
        <ListRow icon="trash-outline" title="Clear old videos" subtitle="Keeps the best and the toughest take from each month" destructive onPress={handleDeleteOldVideos} />
        {bytesOf("temp") > 0 ? (
          <ListRow
            icon="sparkles-outline"
            title="Clear temporary files"
            subtitle="Leftovers from recording and sharing. Nothing you've saved."
            onPress={() => {
              deleteTempMedia();
              setStorage(storageBreakdown());
              showToast("Temporary files cleared.", "success");
            }}
          />
        ) : null}
        {Platform.OS === "ios" ? (
          <SwitchRow
            icon="cloud-upload-outline"
            title="Back up videos and recordings"
            subtitle="Include them in your iCloud backup. They can take a lot of space; your progress backs up either way."
            value={mediaBackup}
            onValueChange={(enabled) => {
              setMediaBackup(enabled);
              setMediaBackupEnabled(enabled);
            }}
          />
        ) : null}
      </ListGroup>
      <Txt variant="footnote" tone="secondary" style={styles.note}>
        The transcription model can be removed under Coaching & AI.
      </Txt>

      <ListGroup title="Your data">
        <ListRow icon="share-outline" title="Export practice data" chevron onPress={handleExport} />
      </ListGroup>
      <Card style={styles.retention}>
        <View style={styles.retentionText}>
          <Txt variant="headline">Keep Rewind audio for</Txt>
          <Txt variant="footnote" tone="secondary">
            Older recordings of your days are deleted. What you said and the notes stay.
          </Txt>
        </View>
        <SegmentedControl
          options={AUDIO_RETENTION}
          value={String(audioDays)}
          onChange={(key) => {
            const days = Number(key);
            setAudioDays(days);
            setAudioRetentionDays(days);
            if (days) deleteOldRewindAudio(days).catch(() => undefined);
          }}
        />
      </Card>
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
    </>
  );
}

const useStyles = makeStyles((t) => ({
  resetOverlay: { flex: 1, alignItems: "center", justifyContent: "center", gap: t.space.md, backgroundColor: t.colors.overlayScrim },
  note: { paddingHorizontal: 4, marginTop: -t.space.sm },
  retention: { gap: t.space.md },
  retentionText: { gap: 2 },
}));
