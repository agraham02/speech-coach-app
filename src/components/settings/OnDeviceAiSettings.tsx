import { useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../../navigation";
import { ListGroup, ListRow } from "../common/ListRow";
import { Txt } from "../common/Txt";
import { isAppleModelAvailable } from "../../services/onDeviceLlm/onDeviceCoach";
import { SHOW_DEV_TOOLS } from "../../config/devTools";
import { makeStyles, useTheme } from "../../theme/ThemeProvider";

// Settings → Coaching & AI: what runs on the phone, and what it runs on.
export function OnDeviceAiSettings() {
  const styles = useStyles();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
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
        <StatusLine label="Transcription" value="Whisper base.en" ok />
        {SHOW_DEV_TOOLS ? <ListRow title="ASR Lab" subtitle="Compare transcription engines" chevron onPress={() => navigation.navigate("AsrLab")} /> : null}
      </ListGroup>
      <Txt variant="footnote" tone="secondary" style={styles.note}>
        All of this runs on your phone. Nothing leaves it unless you ask for a deep review.
      </Txt>
    </>
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
