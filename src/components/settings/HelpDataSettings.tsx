import { useState } from "react";
import { ActivityIndicator, Alert, Modal, Share, View } from "react-native";
import { CommonActions, useNavigation } from "@react-navigation/native";
import { ListGroup, ListRow } from "../common/ListRow";
import { Txt } from "../common/Txt";
import { useToast } from "../common/ToastProvider";
import { formatLogsForSharing } from "../../services/logs/logStore";
import { resetApp } from "../../services/data/resetApp";
import { exportPracticeData, formatBytes, getVideoStorageBytes } from "../../services/data/dataExport";
import { deleteOldVideos } from "../../services/data/videoKeepsakes";
import { getVideoRetentionDays, resetGuide } from "../../services/prefs/prefsStore";
import { makeStyles, useTheme } from "../../theme/ThemeProvider";

// Settings → Help & data: the app tips, diagnostics, your data, and a clean
// slate.
export function HelpDataSettings() {
  const styles = useStyles();
  const { colors } = useTheme();
  const showToast = useToast();
  const navigation = useNavigation();
  const [videoBytes, setVideoBytes] = useState(() => getVideoStorageBytes());
  const [resetting, setResetting] = useState(false);

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
        <ListRow
          icon="sparkles-outline"
          title="Show tips again"
          subtitle="A short tip the first time you reach each part of the app"
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
    </>
  );
}

const useStyles = makeStyles((t) => ({
  resetOverlay: { flex: 1, alignItems: "center", justifyContent: "center", gap: t.space.md, backgroundColor: t.colors.overlayScrim },
  note: { paddingHorizontal: 4, marginTop: -t.space.sm },
}));
