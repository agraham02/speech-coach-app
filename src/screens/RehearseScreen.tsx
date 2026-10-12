import { useEffect, useMemo, useState } from "react";
import { Pressable, View } from "react-native";
import * as Haptics from "expo-haptics";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../navigation";
import { ScreenContainer } from "../components/common/ScreenContainer";
import { Header } from "../components/common/Header";
import { Txt } from "../components/common/Txt";
import { PrimaryButton } from "../components/common/PrimaryButton";
import { MarkedTextView } from "../components/cadence/MarkedTextView";
import { useLiveSpeech } from "../hooks/useLiveSpeech";
import { getSpeech } from "../content/speeches";
import { getScriptById } from "../services/db/scriptsRepo";
import { phrases, sliceMarked, wordsOf } from "../domain/cadence/marks";
import { buildTarget, followLive } from "../domain/speech/speechAlignment";
import { tokenizeHeard } from "../domain/speech/normalize";
import { makeStyles } from "../theme/ThemeProvider";

type Props = NativeStackScreenProps<RootStackParamList, "Rehearse">;

// Rehearse a speech with no camera and no clock: one breath group at a time
// — the current one bright, the next one dim. It moves on as you say it
// (live recognition follows the words), or tap anywhere to move on.
export function RehearseScreen({ route, navigation }: Props) {
  const { speechId, markLevel = "full" } = route.params;
  const styles = useStyles();
  const speech = useMemo(() => getSpeech(speechId), [speechId]);
  const live = useLiveSpeech();
  const [listening, setListening] = useState(false);
  const [phrase, setPhrase] = useState(0);
  const groups = useMemo(() => (speech ? phrases(speech) : []), [speech]);

  // The alignment splits hyphenated words and skips bare dashes, so map its
  // positions back to the speech's word indices.
  const { target, targetToWord } = useMemo(() => {
    const words = speech ? wordsOf(speech.text) : [];
    const map: number[] = [];
    words.forEach((w, i) => buildTarget(w).forEach(() => map.push(i)));
    return { target: speech ? buildTarget(speech.text) : [], targetToWord: map };
  }, [speech]);

  const heard = useMemo(() => tokenizeHeard(live.text).tokens, [live.text]);
  const cursorWord = useMemo(() => {
    if (!listening || !target.length) return -1;
    const state = followLive(target, heard);
    return state.cursor > 0 ? targetToWord[Math.min(state.cursor, targetToWord.length) - 1] : -1;
  }, [listening, target, heard, targetToWord]);

  // Move on once the last word of the current breath group has been said.
  useEffect(() => {
    if (cursorWord < 0) return;
    const at = groups.findIndex((g) => cursorWord >= g.from && cursorWord <= g.to);
    if (at >= 0 && cursorWord === groups[at].to && at + 1 > phrase) {
      setPhrase(at + 1);
      Haptics.selectionAsync().catch(() => undefined);
    }
  }, [cursorWord, groups, phrase]);

  useEffect(() => () => live.session.abort(), [live.session]);

  if (!speech) return <ScreenContainer />;
  const done = phrase >= groups.length;

  async function startListening() {
    const ready = await live.session.prepare();
    if (ready !== "ready") return;
    // Recognition restarts on silence and keeps everything heard, so long
    // deliberate pauses don't lose the place.
    live.session.start({ keepAlive: true, maxRestarts: 200 });
    setListening(true);
  }

  async function finish() {
    if (listening) await live.session.stop();
    setListening(false);
  }

  function advance() {
    if (done) return;
    setPhrase((p) => p + 1);
    Haptics.selectionAsync().catch(() => undefined);
  }

  const visible = [phrase - 1, phrase, phrase + 1].filter((i) => i >= 0 && i < groups.length);

  return (
    <ScreenContainer style={styles.container}>
      <Header eyebrow={`Rehearse · ${Math.min(phrase + 1, groups.length)} of ${groups.length}`} title={speech.title} onBack={() => navigation.goBack()} backIcon="close" />
      <Pressable style={styles.stage} onPress={advance} accessibilityRole="button" accessibilityLabel="Next phrase">
        {done ? (
          <View style={styles.doneBox}>
            <Txt variant="title2" align="center">
              That's the whole speech.
            </Txt>
            <Txt variant="subhead" tone="secondary" align="center">
              Run it again, or take it to camera.
            </Txt>
          </View>
        ) : (
          visible.map((i) => (
            <View key={i} style={[styles.line, { opacity: i === phrase ? 1 : i === phrase + 1 ? 0.4 : 0.18 }]}>
              <MarkedTextView marked={sliceMarked(speech, groups[i].from, groups[i].to)} level={markLevel} size={i === phrase ? "large" : "medium"} layout="flow" />
            </View>
          ))
        )}
      </Pressable>
      <Txt variant="footnote" tone="muted" align="center">
        {listening ? "Listening — it moves on as you say each line. Pause as long as the marks ask." : "Tap anywhere for the next line, or turn on follow-along."}
      </Txt>
      <View style={styles.actions}>
        {done ? (
          <>
            <PrimaryButton label="Again" variant="secondary" style={styles.flex} onPress={() => setPhrase(0)} />
            <PrimaryButton
              label="Perform on camera"
              style={styles.flex}
              onPress={async () => {
                await finish();
                const script = getScriptById(speechId);
                if (script) navigation.replace("Recording", { kind: "script", script, cuesEnabled: markLevel !== "none", markLevel });
              }}
            />
          </>
        ) : listening ? (
          <PrimaryButton label="Stop following" variant="secondary" style={styles.flex} onPress={finish} />
        ) : (
          <PrimaryButton label="Follow my voice" variant="secondary" style={styles.flex} onPress={startListening} />
        )}
      </View>
    </ScreenContainer>
  );
}

const useStyles = makeStyles((t) => ({
  container: { gap: t.space.md },
  stage: { flex: 1, justifyContent: "center", gap: t.space.lg },
  line: {},
  doneBox: { gap: t.space.sm, alignItems: "center" },
  actions: { flexDirection: "row", gap: t.space.sm },
  flex: { flex: 1 },
}));
