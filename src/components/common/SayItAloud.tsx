import { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { PrimaryButton } from "./PrimaryButton";
import { Txt } from "./Txt";
import { useLiveSpeech } from "../../hooks/useLiveSpeech";
import { saidIt } from "../../domain/innerVoice/said";
import { success } from "../../utils/haptics";
import { makeStyles, useTheme } from "../../theme/ThemeProvider";

interface SayItAloudProps {
  // The sentence to say, as it should be read.
  text: string;
  onDone: () => void;
  // Shown before saying it ("Say it to yourself").
  actionLabel?: string;
}

// Says one sentence out loud, with the phone listening for its words. It
// only checks that the words were said — nothing about how — and "I said it"
// always works, for a phone that can't listen or a quiet corner.
export function SayItAloud({ text, onDone, actionLabel = "Say it aloud" }: SayItAloudProps) {
  const styles = useStyles();
  const { colors } = useTheme();
  const speech = useLiveSpeech();
  const [state, setState] = useState<"idle" | "listening" | "done">("idle");
  const [canListen, setCanListen] = useState(true);
  const finished = useRef(false);

  function finish() {
    if (finished.current) return;
    finished.current = true;
    speech.session.stop().catch(() => undefined);
    setState("done");
    success();
    onDone();
  }

  // The words arrived: that's it.
  useEffect(() => {
    if (state === "listening" && saidIt(text, speech.text)) finish();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [speech.text, state]);

  async function begin() {
    const ready = await speech.session.prepare();
    if (ready !== "ready") {
      setCanListen(false);
      return;
    }
    speech.session.start({});
    setState("listening");
  }

  if (state === "done") {
    return (
      <View style={styles.row}>
        <Ionicons name="checkmark-circle" size={18} color={colors.success} />
        <Txt variant="subhead" tone="secondary">
          Said
        </Txt>
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      {state === "listening" ? (
        <Txt variant="footnote" tone="secondary">
          Listening — say it, and it ticks off by itself.
        </Txt>
      ) : null}
      {!canListen ? (
        <Txt variant="footnote" tone="secondary">
          This phone can't listen right now. Say it aloud, then tap below.
        </Txt>
      ) : null}
      <View style={styles.buttons}>
        {state === "idle" && canListen ? <PrimaryButton label={actionLabel} variant="secondary" size="md" icon="mic-outline" onPress={begin} /> : null}
        <PrimaryButton label="I said it" variant={state === "idle" && canListen ? "ghost" : "secondary"} size="md" onPress={finish} />
      </View>
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  wrap: { gap: t.space.sm },
  row: { flexDirection: "row", alignItems: "center", gap: t.space.xs + 2 },
  buttons: { flexDirection: "row", alignItems: "center", gap: t.space.sm, flexWrap: "wrap" },
}));
