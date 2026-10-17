import { View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { PrimaryButton } from "../common/PrimaryButton";
import { Txt } from "../common/Txt";
import { useTranscriptionModel } from "../../hooks/useTranscriptionModel";
import { DEFAULT_ASR_MODEL, formatModelSize, formatSpeed, modelInfo } from "../../services/asr/whisperModels";
import { makeStyles, useTheme } from "../../theme/ThemeProvider";

// Onboarding's transcription step: the speech-to-text model is too big to
// ship inside the app, so it is fetched once here (or later in Settings,
// Coaching & AI). It downloads in the background, so Continue never waits.
export function TranscriptionSetup() {
  const styles = useStyles();
  const { colors } = useTheme();
  const model = useTranscriptionModel();
  const size = formatModelSize(modelInfo(DEFAULT_ASR_MODEL).bytes);

  return (
    <View style={styles.block}>
      <View style={styles.points}>
        <Point icon="text-outline" text="Turns each recording into text on your phone. Pace, fillers and your transcript all start from it." />
        <Point icon="ear-outline" text="It catches every um and uh, so your filler count is honest." />
        <Point icon="lock-closed-outline" text="Nothing is uploaded: the model runs on this phone, even in airplane mode." />
      </View>

      {model.status === "ready" ? (
        <View style={styles.status}>
          <Ionicons name="checkmark-circle" size={20} color={colors.success} />
          <Txt variant="headline">Ready on this phone</Txt>
        </View>
      ) : model.status === "downloading" ? (
        <View style={styles.status}>
          <View style={styles.flex}>
            <Txt variant="headline">{"Downloading " + model.percent + "%"}</Txt>
            <Txt variant="footnote" tone="secondary">
              {formatSpeed(model.bytesPerSecond) + ". It keeps going while you finish setting up, even if you leave the app."}
            </Txt>
          </View>
          <PrimaryButton label="Pause" variant="ghost" size="md" onPress={() => model.pause().catch(() => undefined)} />
        </View>
      ) : model.status === "missing" ? (
        <View style={styles.status}>
          <PrimaryButton label={"Download " + size} icon="download-outline" style={styles.flex} onPress={model.start} />
          <Txt variant="footnote" tone="muted">
            Best over Wi-Fi.
          </Txt>
        </View>
      ) : (
        <View style={styles.status}>
          <View style={styles.flex}>
            <Txt variant="headline">{model.status === "failed" ? "The download stopped" : "Download paused at " + model.percent + "%"}</Txt>
            {model.error ? (
              <Txt variant="footnote" tone="danger">
                {model.error}
              </Txt>
            ) : null}
          </View>
          <PrimaryButton label={model.status === "failed" ? "Try again" : "Resume"} variant="secondary" size="md" onPress={model.start} />
        </View>
      )}
    </View>
  );
}

function Point({ icon, text }: { icon: keyof typeof Ionicons.glyphMap; text: string }) {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <View style={styles.point}>
      <Ionicons name={icon} size={18} color={colors.textSecondary} />
      <Txt variant="subhead" tone="secondary" style={styles.flex}>
        {text}
      </Txt>
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  block: { gap: t.space.lg },
  points: { gap: t.space.md },
  point: { flexDirection: "row", gap: t.space.md - 4, alignItems: "flex-start" },
  status: { flexDirection: "row", alignItems: "center", gap: t.space.md, padding: t.space.md, borderRadius: t.radius.md + 2, backgroundColor: t.colors.surfaceRaised },
  flex: { flex: 1 },
}));
