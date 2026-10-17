import { useEffect, useState } from "react";
import { View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../navigation";
import { Screen } from "../components/common/Screen";
import { Card } from "../components/common/Card";
import { PrimaryButton } from "../components/common/PrimaryButton";
import { ScaleSlider } from "../components/common/ScaleSlider";
import { SayItAloud } from "../components/common/SayItAloud";
import { Txt } from "../components/common/Txt";
import { showGlobalToast } from "../components/common/ToastProvider";
import { Field } from "../components/conversation/Field";
import { beliefChange, presetById } from "../domain/innerVoice/thoughts";
import { toSecondPerson } from "../domain/innerVoice/secondPerson";
import { addChallenge, getThought, listChallenges, type Challenge, type Thought } from "../services/db/selfTalkRepo";
import { loadEvidence } from "../services/innerVoice/evidence";
import { getUserProfile } from "../services/prefs/prefsStore";
import { success } from "../utils/haptics";
import { makeStyles } from "../theme/ThemeProvider";

type Props = NativeStackScreenProps<RootStackParamList, "ThoughtChallenge">;

const STEPS = ["How true it feels", "What makes it feel true", "What doesn't fit", "A fairer version", "Say it", "How it feels now"] as const;

const dayLabel = (iso: string): string => new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });

// Weighing up one worry (a thought record, after Beck and Padesky): how true
// it feels, what supports it, what doesn't fit, a fairer version said to
// yourself as "you", and how true it feels afterwards.
export function ThoughtChallengeScreen({ route }: Props) {
  const styles = useStyles();
  const navigation = useNavigation();
  const [thought, setThought] = useState<Thought | null>(null);
  const [history, setHistory] = useState<Challenge[]>([]);
  const [evidence, setEvidence] = useState<string[]>([]);
  const [step, setStep] = useState(0);
  const [before, setBefore] = useState<number | null>(null);
  const [after, setAfter] = useState<number | null>(null);
  const [forText, setForText] = useState("");
  const [againstText, setAgainstText] = useState("");
  const [balanced, setBalanced] = useState("");
  const [said, setSaid] = useState(false);
  const [saving, setSaving] = useState(false);
  const name = getUserProfile()?.name?.trim();

  useEffect(() => {
    (async () => {
      const found = await getThought(route.params.thoughtId);
      setThought(found);
      if (!found) return;
      setHistory(await listChallenges(found.id));
      setEvidence(await loadEvidence(found.presetId));
    })();
  }, [route.params.thoughtId]);

  if (!thought) return <Screen title="Talk back" onBack={() => navigation.goBack()} />;

  const spoken = toSecondPerson(balanced, name);
  const canNext = step === 0 ? before != null : step === 3 ? balanced.trim().length >= 6 : step === 5 ? after != null : true;
  const preset = presetById(thought.presetId);

  async function finish() {
    if (saving || before == null) return;
    setSaving(true);
    await addChallenge({ thoughtId: thought!.id, beliefBefore: before, evidenceFor: forText, evidenceAgainst: againstText, balanced, beliefAfter: after });
    success();
    const change = after == null ? "same" : beliefChange(before, after);
    showGlobalToast(
      change === "lighter" ? "It feels less true than it did. That's the point." : change === "heavier" ? "It felt stronger today. That happens, and it isn't failing." : "About the same — and looking at it still counts.",
      "success",
    );
    navigation.goBack();
  }

  function next() {
    if (step === STEPS.length - 1) finish();
    else setStep(step + 1);
  }

  return (
    <Screen
      title={STEPS[step]}
      eyebrow={`Step ${step + 1} of ${STEPS.length}`}
      onBack={() => (step === 0 ? navigation.goBack() : setStep(step - 1))}
      backIcon={step === 0 ? "close" : "chevron-back"}
      contentStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      footer={<PrimaryButton label={step === STEPS.length - 1 ? "Done" : step === 4 && !said ? "Skip" : "Next"} onPress={next} disabled={!canNext || saving} />}
    >
      <Card style={styles.card}>
        <Txt variant="footnote" tone="secondary">
          The thought
        </Txt>
        <Txt variant="title3">“{thought.text}”</Txt>
      </Card>

      {step === 0 ? (
        <View style={styles.block}>
          <Txt variant="callout" tone="secondary">
            Right now, how true does it feel?
          </Txt>
          <ScaleSlider value={before} onChange={setBefore} min={1} max={5} lowLabel="Not at all" highLabel="Completely" accessibilityLabel="How true it feels, 1 to 5" />
          {history.length > 0 ? (
            <Txt variant="footnote" tone="muted">
              Before: {history.map((c) => `${c.beliefBefore}/5 on ${dayLabel(c.createdAt)}`).join(" · ")}
            </Txt>
          ) : null}
        </View>
      ) : null}

      {step === 1 ? (
        <View style={styles.block}>
          <Txt variant="callout" tone="secondary">
            What makes it feel true? Be honest — what has happened that backs it up?
          </Txt>
          <Field value={forText} onChangeText={setForText} placeholder="e.g. last time I lost my place in a meeting" multiline maxLength={400} />
        </View>
      ) : null}

      {step === 2 ? (
        <View style={styles.block}>
          <Txt variant="callout" tone="secondary">
            What doesn't fit? A time it wasn't true. What you'd say to a friend who told you this. What else was going on.
          </Txt>
          {evidence.length > 0 ? (
            <Card tone="raised" style={styles.card}>
              <Txt variant="footnote" weight="600" tone="secondary">
                From your own practice
              </Txt>
              {evidence.map((line) => (
                <Txt key={line} variant="subhead">
                  {line}
                </Txt>
              ))}
            </Card>
          ) : null}
          <Field value={againstText} onChangeText={setAgainstText} placeholder="What doesn't fit?" multiline maxLength={400} />
        </View>
      ) : null}

      {step === 3 ? (
        <View style={styles.block}>
          <Txt variant="callout" tone="secondary">
            A fairer version: not "everything's great", just what's most accurate. Say it as you'd say it to a friend.
          </Txt>
          <Field
            value={balanced}
            onChangeText={setBalanced}
            placeholder={preset?.id === "blank" ? "e.g. Sometimes I pause. I find something to say more often than not." : "e.g. It can go wrong sometimes, and mostly it goes fine."}
            multiline
            maxLength={300}
          />
        </View>
      ) : null}

      {step === 4 ? (
        <View style={styles.block}>
          <Txt variant="callout" tone="secondary">
            Say it to yourself, out loud.
          </Txt>
          <Card style={styles.card}>
            <Txt variant="title3">{spoken}</Txt>
            <SayItAloud text={spoken} onDone={() => setSaid(true)} actionLabel="Say it to yourself" />
          </Card>
        </View>
      ) : null}

      {step === 5 ? (
        <View style={styles.block}>
          <Txt variant="callout" tone="secondary">
            Now, how true does the original thought feel?
          </Txt>
          <ScaleSlider value={after} onChange={setAfter} min={1} max={5} lowLabel="Not at all" highLabel="Completely" accessibilityLabel="How true it feels now, 1 to 5" />
          {before != null ? (
            <Txt variant="footnote" tone="muted">
              You said {before}/5 at the start.
            </Txt>
          ) : null}
        </View>
      ) : null}
    </Screen>
  );
}

const useStyles = makeStyles((t) => ({
  content: { gap: t.space.md },
  card: { gap: t.space.xs + 2 },
  block: { gap: t.space.md },
}));
