import { View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../navigation";
import { ScreenContainer } from "../components/common/ScreenContainer";
import { Header } from "../components/common/Header";
import { Card } from "../components/common/Card";
import { Txt } from "../components/common/Txt";
import { PrimaryButton } from "../components/common/PrimaryButton";
import { showGlobalToast } from "../components/common/ToastProvider";
import { FaceCheck } from "../components/setup/FaceCheck";
import { useCameraPermissions } from "../hooks/useCameraPermissions";
import { makeStyles } from "../theme/ThemeProvider";

type Props = NativeStackScreenProps<RootStackParamList, "FaceCheck">;

// The face check again, from Settings: look at the lens, try the things, and
// Tono re-learns your center. Same screen as in setup, on its own.
export function FaceCheckScreen({ navigation }: Props) {
  const styles = useStyles();
  const perms = useCameraPermissions();

  return (
    <ScreenContainer style={styles.container}>
      <Header eyebrow="Face calibration" title="See what Tono sees" onBack={() => navigation.goBack()} backIcon="close" />
      {perms.hasCameraPermission ? (
        <FaceCheck
          onDone={(saved) => {
            if (saved) showGlobalToast("Calibrated to your face.", "success");
            navigation.goBack();
          }}
        />
      ) : (
        <View style={styles.body}>
          <Card style={styles.card}>
            <Txt variant="callout">The face check needs the camera. Recordings stay on this phone.</Txt>
          </Card>
          <PrimaryButton label={perms.cameraBlocked ? "Open Settings" : "Allow camera"} onPress={perms.requestCameraPermission} />
        </View>
      )}
    </ScreenContainer>
  );
}

const useStyles = makeStyles((t) => ({
  container: { gap: t.space.md },
  body: { flex: 1, justifyContent: "center", gap: t.space.md },
  card: { gap: t.space.md },
}));
