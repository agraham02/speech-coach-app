import { useMemo, useState } from "react";
import { ScrollView, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../navigation";
import { ScreenContainer } from "../components/common/ScreenContainer";
import { Header } from "../components/common/Header";
import { Card } from "../components/common/Card";
import { Txt } from "../components/common/Txt";
import { ChipGroup } from "../components/common/Chip";
import { PrimaryButton } from "../components/common/PrimaryButton";
import { MarkedTextView } from "../components/cadence/MarkedTextView";
import { MarkLegend } from "../components/cadence/MarkLegend";
import { getScriptById } from "../services/db/scriptsRepo";
import { filterMarks, sliceMarked, type MarkKind, type MarkLevel } from "../domain/cadence/marks";
import { getSpeech } from "../content/speeches";
import { formatDuration } from "../utils/dateUtils";
import { makeStyles } from "../theme/ThemeProvider";

type Props = NativeStackScreenProps<RootStackParamList, "SpeechStudy">;

const LEVELS: { key: MarkLevel; label: string }[] = [
  { key: "full", label: "All marks" },
  { key: "light", label: "Pauses + stress" },
  { key: "none", label: "No marks" },
];

// Study a speech before reading it: the whole text, one breath group per
// line, with a legend that shows or hides each kind of mark. Then rehearse
// it at your own pace, or perform it on camera.
export function SpeechStudyScreen({ route, navigation }: Props) {
  const { speechId } = route.params;
  const styles = useStyles();
  const speech = useMemo(() => getSpeech(speechId), [speechId]);
  const script = useMemo(() => getScriptById(speechId), [speechId]);
  const [level, setLevel] = useState<MarkLevel>("full");
  const [hidden, setHidden] = useState<Set<MarkKind>>(new Set());

  if (!speech || !script) {
    return (
      <ScreenContainer style={styles.container}>
        <Header title="Speech" onBack={() => navigation.goBack()} />
        <Txt tone="secondary">Couldn't find that speech.</Txt>
      </ScreenContainer>
    );
  }

  const paragraphs = speech.paragraphs.map((from, i) => sliceMarked(speech, from, (speech.paragraphs[i + 1] ?? speech.text.split(/\s+/).length) - 1));

  function toggleHidden(kinds: MarkKind[]) {
    setHidden((prev) => {
      const next = new Set(prev);
      const allHidden = kinds.every((k) => next.has(k));
      kinds.forEach((k) => (allHidden ? next.delete(k) : next.add(k)));
      return next;
    });
  }

  return (
    <ScreenContainer style={styles.container}>
      <Header eyebrow={`${speech.category} · about ${formatDuration(speech.targetDurationSeconds)}`} title={speech.title} onBack={() => navigation.goBack()} />
      <ChipGroup options={LEVELS} value={level} onChange={setLevel} />
      {level !== "none" ? <MarkLegend marks={filterMarks(speech.marks, level)} hidden={hidden} onToggle={toggleHidden} /> : null}
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Card style={styles.card}>
          {paragraphs.map((p, i) => (
            <MarkedTextView key={i} marked={p} level={level} hidden={hidden} size="small" layout={level === "none" ? "flow" : "phrases"} />
          ))}
        </Card>
        <Txt variant="footnote" tone="muted">
          The time is a guide, not a limit — reading with the pauses takes longer, and that's the point.
        </Txt>
      </ScrollView>
      <View style={styles.actions}>
        <PrimaryButton label="Rehearse" variant="secondary" style={styles.flex} onPress={() => navigation.navigate("Rehearse", { speechId, markLevel: level })} />
        <PrimaryButton
          label="Perform on camera"
          style={styles.flex}
          onPress={() => navigation.navigate("Recording", { kind: "script", script, cuesEnabled: level !== "none", markLevel: level })}
        />
      </View>
    </ScreenContainer>
  );
}

const useStyles = makeStyles((t) => ({
  container: { gap: t.space.md },
  scroll: { gap: t.space.md, paddingBottom: t.space.lg },
  card: { gap: t.space.lg },
  actions: { flexDirection: "row", gap: t.space.sm },
  flex: { flex: 1 },
}));
