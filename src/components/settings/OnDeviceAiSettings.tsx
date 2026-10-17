import { useEffect, useState } from "react";
import { View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { IconButton } from "../common/IconButton";
import { ListGroup, ListRow } from "../common/ListRow";
import { DEFAULT_ASR_MODEL, cancelDownload, formatModelSize, formatSpeed, getDownloadState, isModelDownloaded, modelInfo, pauseDownload, startDownload, subscribeDownloads } from "../../services/asr/whisperModels";
import { Txt } from "../common/Txt";
import { isAppleModelAvailable } from "../../services/onDeviceLlm/onDeviceCoach";
import { makeStyles, useTheme } from "../../theme/ThemeProvider";

// Settings → Coaching & AI: what runs on the phone, and what it runs on.
export function OnDeviceAiSettings() {
  const styles = useStyles();
  const [appleCoach] = useState(() => isAppleModelAvailable());
  const [onDeviceRecognition] = useState(() => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      return require("expo-speech-recognition").ExpoSpeechRecognitionModule.supportsOnDeviceRecognition() as boolean;
    } catch {
      return false;
    }
  });

  return (
    <>
      <ListGroup>
        <StatusLine label="Coaching" value={appleCoach ? "Apple Intelligence" : "Built-in rules"} ok />
        <StatusLine label="Live recognition" value={onDeviceRecognition ? "On-device" : "System recognizer"} ok={onDeviceRecognition} />
        <TranscriptionModelRow />
      </ListGroup>
      <Txt variant="footnote" tone="secondary" style={styles.note}>
        All of this runs on your phone. Nothing leaves it unless you ask for a deep review.
      </Txt>
    </>
  );
}

// The better transcription model: bigger than the built-in one, so it is a
// download. Until it is on the phone, takes use the built-in model, which
// leaves out ums and uhs.
function TranscriptionModelRow() {
  const [, redraw] = useState(0);
  useEffect(() => subscribeDownloads(() => redraw((n) => n + 1)), []);
  const { colors } = useTheme();
  const info = modelInfo(DEFAULT_ASR_MODEL);
  const have = isModelDownloaded(DEFAULT_ASR_MODEL);
  const dl = getDownloadState(DEFAULT_ASR_MODEL);
  const percent = Math.round((dl?.progress ?? 0) * 100);

  if (have) return <StatusLine label="Transcription" value="Whisper large-v3-turbo" ok />;
  if (dl?.status === "downloading") {
    return (
      <ListRow
        title="Downloading the transcription model"
        subtitle={percent + "% at " + formatSpeed(dl.bytesPerSecond) + ". It keeps going if you leave the app."}
        right={<IconButton icon="pause" variant="plain" size={36} accessibilityLabel="Pause the download" onPress={() => pauseDownload(DEFAULT_ASR_MODEL).catch(() => undefined)} />}
      />
    );
  }
  if (dl) {
    return (
      <ListRow
        title={dl.status === "failed" ? "Download stopped" : "Download paused at " + percent + "%"}
        subtitle={dl.status === "failed" ? dl.error : "Resume picks up where it stopped."}
        right={
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <IconButton icon={dl.status === "failed" ? "refresh" : "play"} variant="plain" size={36} accessibilityLabel="Resume the download" onPress={() => startDownload(DEFAULT_ASR_MODEL)} />
            <IconButton icon="close" variant="plain" size={32} color={colors.textMuted} accessibilityLabel="Discard the partial download" onPress={() => cancelDownload(DEFAULT_ASR_MODEL)} />
          </View>
        }
      />
    );
  }
  return (
    <ListRow
      title="Download the transcription model"
      subtitle={"Needed to turn your recordings into text, and it catches every um and uh. " + formatModelSize(info.bytes) + ", best over Wi-Fi."}
      right={<IconButton icon="download-outline" variant="plain" size={36} accessibilityLabel="Download the transcription model" onPress={() => startDownload(DEFAULT_ASR_MODEL)} />}
    />
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
  note: { paddingHorizontal: 4, marginTop: -t.space.sm },
}));
