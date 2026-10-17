import { View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Card } from "./Card";
import { PrimaryButton } from "./PrimaryButton";
import { Txt } from "./Txt";
import { useTranscriptionModel } from "../../hooks/useTranscriptionModel";
import { formatSpeed } from "../../services/asr/whisperModels";
import { makeStyles, useTheme } from "../../theme/ThemeProvider";

// Shown wherever a take is about to be made or saved, until the
// transcription model is on the phone: not downloaded, downloading, paused,
// stopped by an error, or discarded. Without the model a recording can't be
// turned into text. Takes saved meanwhile are transcribed by themselves once
// the download finishes (services/pipeline/retryWaitingTakes.ts).
export function TranscriptionBanner() {
  const styles = useStyles();
  const { colors } = useTheme();
  const model = useTranscriptionModel();
  if (model.status === "ready") return null;

  const failed = model.status === "failed";
  const content = {
    missing: {
      title: "Download the transcription model",
      detail: "Your recordings can't be turned into text until it's on this phone. It's a one-time download of about 574 MB, best over Wi-Fi.",
      action: "Download",
      onPress: model.start,
    },
    downloading: {
      title: "Downloading the transcription model: " + model.percent + "%",
      detail: formatSpeed(model.bytesPerSecond) + ". You can keep using Tono. Takes you save now are transcribed when it finishes.",
      action: "Pause",
      onPress: () => model.pause().catch(() => undefined),
    },
    paused: {
      title: "Download paused at " + model.percent + "%",
      detail: "Takes you save are transcribed once the model finishes downloading.",
      action: "Resume",
      onPress: model.start,
    },
    failed: {
      title: "The model download stopped",
      detail: model.error ?? "Check your connection, then try again.",
      action: "Try again",
      onPress: model.start,
    },
  }[model.status];

  return (
    <Card style={styles.card} accessibilityLabel={content.title}>
      <View style={styles.head}>
        <Ionicons name={failed ? "alert-circle-outline" : "cloud-download-outline"} size={20} color={failed ? colors.danger : colors.textSecondary} />
        <View style={styles.flex}>
          <Txt variant="headline">{content.title}</Txt>
          <Txt variant="footnote" tone={failed ? "danger" : "secondary"}>
            {content.detail}
          </Txt>
        </View>
      </View>
      {model.status === "downloading" ? (
        <View style={styles.track}>
          <View style={[styles.fill, { width: `${Math.max(2, model.percent)}%` }]} />
        </View>
      ) : null}
      <PrimaryButton label={content.action} variant={model.status === "downloading" ? "ghost" : "secondary"} size="md" onPress={content.onPress} />
    </Card>
  );
}

const useStyles = makeStyles((t) => ({
  card: { gap: t.space.md },
  head: { flexDirection: "row", gap: t.space.md - 4, alignItems: "flex-start" },
  flex: { flex: 1, gap: 2 },
  track: { height: 4, borderRadius: 2, backgroundColor: t.colors.background, overflow: "hidden" },
  fill: { height: 4, borderRadius: 2, backgroundColor: t.colors.accent },
}));
