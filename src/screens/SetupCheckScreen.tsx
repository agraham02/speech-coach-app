import { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { Camera as VisionCamera } from "react-native-vision-camera";
import type { RootStackParamList } from "../navigation";
import { ScreenContainer } from "../components/common/ScreenContainer";
import { Header } from "../components/common/Header";
import { Card } from "../components/common/Card";
import { Txt } from "../components/common/Txt";
import { PrimaryButton } from "../components/common/PrimaryButton";
import { CameraPreview } from "../components/recording/CameraPreview";
import { FramingGuideOverlay } from "../components/recording/FramingGuideOverlay";
import { useCameraPermissions } from "../hooks/useCameraPermissions";
import { useFaceDetection } from "../hooks/useFaceDetection";
import { useLiveSpeech } from "../hooks/useLiveSpeech";
import { defaultsFromProfile } from "../domain/profile";
import { getUserProfile } from "../services/prefs/prefsStore";
import { makeStyles, useTheme } from "../theme/ThemeProvider";

type Props = NativeStackScreenProps<RootStackParamList, "SetupCheck">;
type Step = "permissions" | "camera" | "mic" | "done";

// Onboarding chapter 4: camera and mic permission, framing and light, and a
// mic level check that also tells us whether live speech recognition works
// on this phone. Camera parts are skipped for audio-first practice.
export function SetupCheckScreen({ navigation }: Props) {
  const styles = useStyles();
  const { colors } = useTheme();
  const audioFirst = defaultsFromProfile(getUserProfile()).audioFirst;
  const perms = useCameraPermissions();
  const cameraRef = useRef<VisionCamera>(null);
  const { faceDetected, framingStatus, onFaceFrame } = useFaceDetection();
  const speech = useLiveSpeech();
  const [step, setStep] = useState<Step>("permissions");
  const [goodFor, setGoodFor] = useState(0);
  const [heardWords, setHeardWords] = useState(false);
  const [listening, setListening] = useState(false);

  // Framing counts as checked after ~2 s of a well-placed face.
  useEffect(() => {
    if (step !== "camera") return;
    const t = setInterval(() => setGoodFor((g) => (framingStatus === "good" ? g + 1 : 0)), 500);
    return () => clearInterval(t);
  }, [step, framingStatus]);

  useEffect(() => {
    if (listening && speech.text.trim().split(/\s+/).length >= 2) setHeardWords(true);
  }, [listening, speech.text]);

  useEffect(() => () => speech.session.abort(), [speech.session]);

  async function startMic() {
    const ready = await speech.session.prepare();
    if (ready !== "ready") {
      setListening(false);
      return;
    }
    speech.session.start({ volumeMeter: true, volumeIntervalMs: 100 });
    setListening(true);
  }

  async function finishMic() {
    if (listening) await speech.session.stop();
    setListening(false);
    setStep("done");
  }

  const level = Math.max(0, Math.min(1, (speech.volume + 2) / 12));
  const recognitionWorks = speech.status !== "unavailable";

  return (
    <ScreenContainer style={styles.container}>
      <Header eyebrow="Setup check" title={step === "camera" ? "Find your frame" : step === "mic" ? "Check your mic" : step === "done" ? "All set" : "Camera and mic"} />

      {step === "permissions" ? (
        <View style={styles.body}>
          <Card style={styles.card}>
            <Ionicons name="videocam-outline" size={28} color={colors.accent} />
            <Txt variant="callout">
              Recordings stay on this phone. The camera is for eye contact and expression; the mic is for everything else.
            </Txt>
          </Card>
          {perms.hasAllPermissions ? (
            <Txt variant="subhead" tone="success">
              Both are on.
            </Txt>
          ) : null}
        </View>
      ) : null}

      {step === "camera" ? (
        <View style={styles.cameraWrap}>
          <CameraPreview cameraRef={cameraRef} isActive onFaceFrame={onFaceFrame} />
          <FramingGuideOverlay status={framingStatus} />
          <View style={styles.cameraNote}>
            <Txt variant="footnote" color="white" align="center">
              {goodFor >= 4
                ? "Looks good."
                : faceDetected
                  ? "Center your face, eyes about a third of the way down."
                  : "Can't find your face — face a window or a lamp, and hold the phone at eye level."}
            </Txt>
          </View>
        </View>
      ) : null}

      {step === "mic" ? (
        <View style={styles.body}>
          <Card style={styles.card}>
            <Txt variant="title3">Say: “Hello, my name is ___.”</Txt>
            <View style={styles.meter}>
              <View style={[styles.meterFill, { width: `${level * 100}%`, backgroundColor: level > 0.5 ? colors.success : colors.warning }]} />
            </View>
            <Txt variant="footnote" tone="secondary">
              {!listening
                ? "Tap Start, then speak at your normal volume."
                : level < 0.25
                  ? "Quiet — move a little closer."
                  : heardWords
                    ? `Heard: “${speech.text.trim()}” — speech recognition works on this phone.`
                    : "Listening…"}
            </Txt>
            {!recognitionWorks ? (
              <Txt variant="footnote" tone="warning">
                Live speech recognition isn't available here, so word-following drills will use a self-rating instead.
              </Txt>
            ) : null}
          </Card>
        </View>
      ) : null}

      {step === "done" ? (
        <View style={styles.body}>
          <Card style={styles.card}>
            <Ionicons name="checkmark-circle" size={32} color={colors.success} />
            <Txt variant="title3">You're set up.</Txt>
            <Txt variant="callout" tone="secondary">
              Last thing: a short skill check — about five minutes, four little pieces — so your plan starts where you are. Do it now, or make it tomorrow's first session.
            </Txt>
          </Card>
        </View>
      ) : null}

      {step === "permissions" ? (
        perms.hasAllPermissions ? (
          <PrimaryButton label="Next" onPress={() => setStep(audioFirst ? "mic" : "camera")} />
        ) : (
          <PrimaryButton
            label={perms.hasCameraPermission ? "Allow microphone" : "Allow camera"}
            onPress={perms.hasCameraPermission ? perms.requestMicrophonePermission : perms.requestCameraPermission}
          />
        )
      ) : null}
      {step === "camera" ? <PrimaryButton label={goodFor >= 4 ? "Next" : "Skip for now"} variant={goodFor >= 4 ? "primary" : "secondary"} onPress={() => setStep("mic")} /> : null}
      {step === "mic" ? (
        listening ? (
          <PrimaryButton label={heardWords ? "Next" : "Skip"} variant={heardWords ? "primary" : "secondary"} onPress={finishMic} />
        ) : (
          <PrimaryButton label="Start" onPress={startMic} />
        )
      ) : null}
      {step === "done" ? (
        <View style={styles.row}>
          <PrimaryButton label="Tomorrow" variant="secondary" style={styles.flex} onPress={() => navigation.replace("SkillCheck", { defer: true })} />
          <PrimaryButton label="Now" style={styles.flex} onPress={() => navigation.replace("SkillCheck")} />
        </View>
      ) : null}
    </ScreenContainer>
  );
}

const useStyles = makeStyles((t) => ({
  container: { gap: t.space.md },
  body: { flex: 1, justifyContent: "center", gap: t.space.md },
  card: { gap: t.space.md },
  cameraWrap: { flex: 1, borderRadius: t.radius.lg, overflow: "hidden", backgroundColor: "black" },
  cameraNote: { position: "absolute", left: t.space.md, right: t.space.md, bottom: t.space.md, padding: t.space.sm, borderRadius: t.radius.md, backgroundColor: "rgba(0,0,0,0.55)" },
  meter: { height: 18, borderRadius: 9, backgroundColor: t.colors.surfaceRaised, overflow: "hidden" },
  meterFill: { height: "100%", borderRadius: 9 },
  row: { flexDirection: "row", gap: t.space.sm },
  flex: { flex: 1 },
}));
