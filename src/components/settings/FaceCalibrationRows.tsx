import { useCallback, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../../navigation";
import { ListRow } from "../common/ListRow";
import { showGlobalToast } from "../common/ToastProvider";
import { clearFaceCalibration, getFaceCalibration } from "../../services/prefs/prefsStore";
import { useTheme } from "../../theme/ThemeProvider";

// Settings → Coaching & AI: the face check's result, with a way to redo it
// or go back to the defaults.
export function FaceCalibrationRows() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { colors } = useTheme();
  const [calibration, setCalibration] = useState(getFaceCalibration);

  // The face check runs on its own screen, so read the saved result again
  // each time this one comes back into view.
  useFocusEffect(
    useCallback(() => {
      setCalibration(getFaceCalibration());
    }, []),
  );

  function reset() {
    clearFaceCalibration();
    setCalibration(null);
    showGlobalToast("Back to the default settings.", "success");
  }

  const when = calibration ? new Date(calibration.at).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : null;
  return (
    <>
      <ListRow
        title="Face calibration"
        subtitle={calibration ? `Calibrated to your face on ${when}` : "Not done yet, so eye contact uses the defaults"}
        right={<Ionicons name={calibration ? "checkmark-circle" : "ellipse-outline"} size={18} color={calibration ? colors.success : colors.textMuted} />}
        chevron
        onPress={() => navigation.navigate("FaceCheck")}
      />
      {calibration ? <ListRow title="Reset face calibration" subtitle="Go back to the default settings" destructive onPress={reset} /> : null}
    </>
  );
}
