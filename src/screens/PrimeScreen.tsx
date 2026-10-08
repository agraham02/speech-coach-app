import { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../navigation";
import { ScreenContainer } from "../components/common/ScreenContainer";
import { Header } from "../components/common/Header";
import { Card } from "../components/common/Card";
import { Txt } from "../components/common/Txt";
import { Chip } from "../components/common/Chip";
import { PrimaryButton } from "../components/common/PrimaryButton";
import { Field } from "../components/conversation/Field";
import { ScaleChips } from "../components/conversation/ScaleChips";
import { OUTWARD_GOALS, STORY_QUESTIONS, TOPIC_IDEAS } from "../content/conversationContent";
import { createPrimedEvent } from "../services/db/socialRepo";
import { showGlobalToast } from "../components/common/ToastProvider";
import { logger } from "../utils/logger";
import { makeStyles } from "../theme/ThemeProvider";

type Props = NativeStackScreenProps<RootStackParamList, "Prime">;

// Before a conversation or event: a minute of prep. Three topics, two
// story questions, one outward goal, and a prediction to check afterwards
// (Today → Debrief). Topic prep measurably eases the nerves; the prediction
// is a small experiment against the "liking gap".
export function PrimeScreen({ navigation }: Props) {
  const styles = useStyles();
  const [label, setLabel] = useState("");
  const [topics, setTopics] = useState(["", "", ""]);
  const [questions, setQuestions] = useState(["", ""]);
  const [goal, setGoal] = useState<string | null>(null);
  const [predicted, setPredicted] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  // Tapping a suggestion fills the first empty slot.
  function fill(list: string[], set: (v: string[]) => void, text: string) {
    if (list.includes(text)) return;
    const i = list.findIndex((t) => !t.trim());
    if (i === -1) return;
    const next = [...list];
    next[i] = text;
    set(next);
  }

  async function save() {
    if (saving) return;
    setSaving(true);
    try {
      await createPrimedEvent({ label, topics, questions, outwardGoal: goal, predictedAwkward: predicted });
      showGlobalToast("Primed. Afterwards, debrief it from Today.", "success");
      navigation.goBack();
    } catch (error) {
      logger.error(`[prime] save failed — ${(error as Error).message}`);
      showGlobalToast("Couldn't save that.", "error");
      setSaving(false);
    }
  }

  const unusedTopics = TOPIC_IDEAS.filter((t) => !topics.includes(t)).slice(0, 4);
  const unusedQuestions = STORY_QUESTIONS.filter((q) => !questions.includes(q)).slice(0, 4);

  return (
    <ScreenContainer style={styles.container}>
      <Header eyebrow="Before you go · about a minute" title="Prime" onBack={() => navigation.goBack()} backIcon="close" />
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <Field label="What's coming up?" value={label} onChangeText={setLabel} placeholder="e.g. Dinner with Jamie's coworkers" />

          <Card style={styles.card}>
            <Txt variant="headline">Three things you could talk about</Txt>
            {topics.map((t, i) => (
              <Field key={i} value={t} onChangeText={(v) => setTopics(topics.map((x, j) => (j === i ? v : x)))} placeholder={`Topic ${i + 1}`} />
            ))}
            <View style={styles.chips}>
              {unusedTopics.map((t) => (
                <Chip key={t} label={t} onPress={() => fill(topics, setTopics, t)} />
              ))}
            </View>
          </Card>

          <Card style={styles.card}>
            <Txt variant="headline">Two questions that invite a story</Txt>
            <Txt variant="footnote" tone="secondary">
              “What was the best part?” gets a story. “Did you like it?” gets a yes.
            </Txt>
            {questions.map((q, i) => (
              <Field key={i} value={q} onChangeText={(v) => setQuestions(questions.map((x, j) => (j === i ? v : x)))} placeholder={`Question ${i + 1}`} />
            ))}
            <View style={styles.chips}>
              {unusedQuestions.map((q) => (
                <Chip key={q} label={q} onPress={() => fill(questions, setQuestions, q)} />
              ))}
            </View>
          </Card>

          <Card style={styles.card}>
            <Txt variant="headline">One outward goal</Txt>
            <Txt variant="footnote" tone="secondary">
              Something about them, not about how you come across.
            </Txt>
            <View style={styles.chips}>
              {OUTWARD_GOALS.map((g) => (
                <Chip key={g} label={g} selected={goal === g} onPress={() => setGoal(goal === g ? null : g)} />
              ))}
            </View>
          </Card>

          <Card style={styles.card}>
            <Txt variant="headline">How awkward do you expect it to be?</Txt>
            <ScaleChips value={predicted} onChange={setPredicted} lowLabel="Easy" highLabel="Very awkward" accessibilityLabel="Expected awkwardness, 0 to 10" />
            <Txt variant="caption1" tone="muted">
              A forecast, not a fact. You'll compare it with how it actually went.
            </Txt>
          </Card>
        </ScrollView>
      </KeyboardAvoidingView>
      <PrimaryButton label="I'm ready" onPress={save} loading={saving} />
    </ScreenContainer>
  );
}

const useStyles = makeStyles((t) => ({
  container: { gap: t.space.md },
  flex: { flex: 1 },
  scroll: { gap: t.space.md, paddingBottom: t.space.xl },
  card: { gap: t.space.sm },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: t.space.sm },
}));
