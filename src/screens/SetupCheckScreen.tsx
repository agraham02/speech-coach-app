import { useEffect, useRef, useState } from "react";
import { Linking, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../navigation";
import { ScreenContainer } from "../components/common/ScreenContainer";
import { Header } from "../components/common/Header";
import { Card } from "../components/common/Card";
import { Txt } from "../components/common/Txt";
import { PrimaryButton } from "../components/common/PrimaryButton";
import { FaceCheck } from "../components/setup/FaceCheck";
import { LevelBars, levelOf } from "../components/setup/LevelBars";
import { LiveWords } from "../components/setup/LiveWords";
import { PermissionRows } from "../components/settings/PermissionRows";
import { useCameraPermissions } from "../hooks/useCameraPermissions";
import { usePermissions } from "../hooks/usePermissions";
import { useLiveSpeech } from "../hooks/useLiveSpeech";
import { defaultsFromProfile } from "../domain/profile";
import { getUserProfile } from "../services/prefs/prefsStore";
import { success } from "../utils/haptics";
import { makeStyles, useTheme } from "../theme/ThemeProvider";

type Props = NativeStackScreenProps<RootStackParamList, "SetupCheck">;
type Step = "permissions" | "camera" | "mic" | "done";

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
  const perms = useCameraPermissions({ autoRequest: false });
  const permissions = usePermissions();
  const stillAskable = permissions.lines?.some((l) => l.state === "ask") ?? false;
  const cameraOrMicOff = perms.cameraBlocked || perms.microphoneBlocked;
  const speech = useLiveSpeech();
  const [step, setStep] = useState<Step>("permissions");
  const [heardWords, setHeardWords] = useState(false);
  const [listening, setListening] = useState(false);
  const [micSettled, setMicSettled] = useState(false);
  const [voiceReadings, setVoiceReadings] = useState(0);
  const [listenedFor, setListenedFor] = useState(0);
  const [problem, setProblem] = useState<"denied" | "failed" | null>(null);
  const retried = useRef(false);
  const heardVoice = voiceReadings >= VOICE_READINGS;

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

  // The moment Tono first hears you gets a tap.
  useEffect(() => {
    if (micWorks) success();
  }, [micWorks]);

  return (
    <ScreenContainer style={styles.container}>
      <Header eyebrow="Setup check" title={step === "camera" ? "See what Tono sees" : step === "mic" ? "Check your mic" : step === "done" ? "All set" : "Camera and mic"} />

      {step === "permissions" ? (
        <View style={styles.body}>
          <Card style={styles.card}>
            <Ionicons name="videocam-outline" size={28} color={colors.accent} />
            <Txt variant="callout">
              Recordings stay on this phone. The camera is for eye contact and expression; the mic is for everything else. Notifications are for your practice reminders, and you can turn any of these off or on later in Settings.
            </Txt>
          </Card>
          {permissions.lines ? <PermissionRows lines={permissions.lines} onPress={permissions.act} /> : null}
          {cameraOrMicOff ? (
            <Txt variant="footnote" tone="warning">
              Recording needs the camera and mic. Tap a row that says Off to turn it on in your phone's Settings, or carry on and do it later.
            </Txt>
          ) : null}
        </View>
      ) : null}

      {step === "camera" ? <FaceCheck onDone={() => setStep("mic")} /> : null}

      {step === "mic" ? (
        <View style={styles.body}>
          <Card style={styles.card}>
            <Txt variant="title3">Say: “Hi, I'm ___, and I'm here to practice.”</Txt>
            <LiveWords text={listening ? speech.text : ""} placeholder="Your words will appear here as you speak." />
            <LevelBars session={speech.session} active={listening} voiceLevel={VOICE_LEVEL} />
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
                      ? "Keep going if you like, or tap Next."
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
          {micWorks ? (
            <Card tone="raised" style={styles.heard}>
              <Ionicons name="checkmark-circle" size={28} color={colors.success} />
              <View style={styles.heardText}>
                <Txt variant="headline">{heardWords ? "Tono heard you." : "Tono hears your voice."}</Txt>
                <Txt variant="footnote" tone="secondary">
                  {heardWords
                    ? `${speech.onDevice ? "Recognized on this phone. " : ""}That's live recognition, the kind the drills use. After a recorded take, a slower on-device model transcribes it more carefully, and that one catches every um.`
                    : "No words came through yet, so word-following drills may ask you to rate yourself instead."}
                </Txt>
              </View>
            </Card>
          ) : null}
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
        stillAskable ? (
          <PrimaryButton label="Allow access" onPress={permissions.askAll} />
        ) : (
          <PrimaryButton label="Next" onPress={() => setStep(audioFirst || !perms.hasCameraPermission ? "mic" : "camera")} />
        )
      ) : null}
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
  heard: { flexDirection: "row", alignItems: "flex-start", gap: t.space.md },
  heardText: { flex: 1, gap: 4 },
  row: { flexDirection: "row", gap: t.space.sm },
  flex: { flex: 1 },
}));
