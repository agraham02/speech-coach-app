import { useEffect, useRef, useState } from "react";
import { Linking, View } from "react-native";
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

// The meter's 0-1 level from the recognizer's -2..10 volume.
const levelOf = (volume: number) => Math.max(0, Math.min(1, (volume + 2) / 12));
// A reading at or above this is a voice, not the room.
const VOICE_LEVEL = 0.45;
// About half a second of voice (a reading every 100 ms) proves the mic.
const VOICE_READINGS = 5;
// How long the mic step waits for the camera to let go of the audio session.
const MIC_SETTLE_MS = 600;

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
  const [micSettled, setMicSettled] = useState(false);
  const [voiceReadings, setVoiceReadings] = useState(0);
  const [listenedFor, setListenedFor] = useState(0);
  const [problem, setProblem] = useState<"denied" | "failed" | null>(null);
  const retried = useRef(false);
  const heardVoice = voiceReadings >= VOICE_READINGS;

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

  // The camera step's capture session can still be letting go of the audio
  // when this step opens; starting into it fails with "the audio input is
  // busy".
  useEffect(() => {
    if (step !== "mic") return;
    setMicSettled(false);
    const t = setTimeout(() => setMicSettled(true), MIC_SETTLE_MS);
    return () => clearTimeout(t);
  }, [step]);

  // A voice on the meter proves the mic even when no words are recognized.
  useEffect(() => {
    if (!listening) return;
    return speech.session.onVolume((v) => {
      if (levelOf(v) >= VOICE_LEVEL) setVoiceReadings((n) => n + 1);
    });
  }, [listening, speech.session]);

  useEffect(() => {
    if (!listening) return;
    const t = setInterval(() => setListenedFor((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [listening]);

  // Recognition that stops by itself (the mic was busy, a call came in) used
  // to leave this step on "Listening…" for good. Try once more quietly, then
  // say what happened.
  useEffect(() => {
    if (!listening) return;
    if (speech.status === "permission-denied") {
      setListening(false);
      setProblem("denied");
    } else if (speech.status === "error" || speech.status === "paused") {
      speech.session.abort();
      setListening(false);
      if (!retried.current) {
        retried.current = true;
        setTimeout(() => startMic(), MIC_SETTLE_MS);
      } else {
        setProblem("failed");
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listening, speech.status]);

  async function startMic() {
    setProblem(null);
    const ready = await speech.session.prepare();
    if (ready !== "ready") {
      setListening(false);
      setProblem(ready === "denied" ? "denied" : "failed");
      return;
    }
    speech.session.start({ volumeMeter: true, volumeIntervalMs: 100 });
    setListenedFor(0);
    setListening(true);
  }

  function retryMic() {
    retried.current = false;
    startMic();
  }

  async function finishMic() {
    if (listening) await speech.session.stop();
    setListening(false);
    setStep("done");
  }

  const level = listening ? levelOf(speech.volume) : 0;
  const recognitionWorks = speech.status !== "unavailable";
  const micWorks = heardWords || heardVoice;

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
          <CameraPreview cameraRef={cameraRef} isActive onFaceFrame={onFaceFrame} audio={false} />
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
              {problem === "denied"
                ? "Tono can't use the microphone or speech recognition. Turn both on for Tono in your phone's Settings, then come back."
                : problem === "failed"
                  ? micWorks
                    ? "The mic stopped, but it heard you first — your mic works."
                    : "The mic didn't start. Try again — if it still won't, skip this; drills ask again when they need it."
                  : !listening
                    ? "Tap Start, then speak at your normal volume."
                    : heardWords
                      ? `Heard: “${speech.text.trim()}” — your mic and speech recognition both work.`
                      : heardVoice
                        ? listenedFor >= 8
                          ? "Your mic hears you, but no words have come through yet. Word-following drills may use a self-rating instead."
                          : "Your mic hears you. Listening for words…"
                        : listenedFor >= 4 && level < 0.25
                          ? "Quiet — move a little closer, or speak up a bit."
                          : "Listening…"}
            </Txt>
            {!recognitionWorks ? (
              <Txt variant="footnote" tone="warning">
                Live speech recognition isn't available here, so word-following drills will use a self-rating instead.
              </Txt>
            ) : null}
          </Card>
          {problem === "denied" ? <PrimaryButton label="Open Settings" variant="secondary" icon="open-outline" onPress={() => Linking.openSettings()} /> : null}
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
        listening || micWorks ? (
          <PrimaryButton label={micWorks ? "Next" : "Skip"} variant={micWorks ? "primary" : "secondary"} onPress={finishMic} />
        ) : problem ? (
          <View style={styles.row}>
            <PrimaryButton label="Skip" variant="secondary" style={styles.flex} onPress={finishMic} />
            <PrimaryButton label="Try again" style={styles.flex} onPress={retryMic} />
          </View>
        ) : (
          <PrimaryButton label="Start" onPress={startMic} loading={!micSettled} />
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
