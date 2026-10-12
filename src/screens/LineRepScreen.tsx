import { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../navigation";
import { ScreenContainer } from "../components/common/ScreenContainer";
import { Header } from "../components/common/Header";
import { Card } from "../components/common/Card";
import { Txt } from "../components/common/Txt";
import { PrimaryButton } from "../components/common/PrimaryButton";
import { RatingScale } from "../components/common/RatingScale";
import { MarkedTextView } from "../components/cadence/MarkedTextView";
import { MarkLegend } from "../components/cadence/MarkLegend";
import { MarkEditor, toolsFor } from "../components/cadence/MarkEditor";
import { useTakeRecorder } from "../hooks/useTakeRecorder";
import { getLines, LINE_CATEGORIES, type LineCategory } from "../content/lines";
import { lineRepConfig, pickLines, kindsYouMark, type LineRepConfig } from "../domain/cadence/lineRep";
import { compareMarks, keepKinds, type Mark, type MarkKind, type MarkedText } from "../domain/cadence/marks";
import { remixEmphasis } from "../domain/cadence/autoMark";
import { scoreSelfRating } from "../domain/drills/drillSpecs";
import { getDrillLevel, recordDrillOutcome } from "../services/db/progressRepo";
import { getMarkedText, getRecentLineIds, markTextsPracticed } from "../services/db/markedTextsRepo";
import { completePracticeStep } from "../services/practice/practiceEvents";
import { makeStyles, useTheme } from "../theme/ThemeProvider";

type Props = NativeStackScreenProps<RootStackParamList, "LineRep">;

interface RepLine extends MarkedText {
  id: string;
  credit?: string;
  mine: boolean;
}

type Stage = "mark" | "compare" | "read" | "remix" | "rate";

const READS = [
  { level: "full" as const, title: "Slow and exaggerated", detail: "Hit every mark — bigger than feels natural." },
  { level: "full" as const, title: "Natural speed", detail: "Same marks, at the speed you'd really say it." },
  { level: "none" as const, title: "Marks hidden", detail: "Keep the same music without the map." },
];

// Mark It Up's main loop (practice-expansion-plan.md §4.2): a few lines of
// one or two sentences, each marked (or checked), read twice with the marks
// and once without. Line of the day is a one-line version with no rating.
export function LineRepScreen({ route, navigation }: Props) {
  const { lineIds, mineIds, category, mode = "rep", practice } = route.params ?? {};
  const styles = useStyles();
  const { colors } = useTheme();
  const recorder = useTakeRecorder();
  const [level, setLevel] = useState(1);
  const [lines, setLines] = useState<RepLine[] | null>(null);
  const [index, setIndex] = useState(0);
  const [stage, setStage] = useState<Stage>("read");
  const [read, setRead] = useState(0);
  const [mine, setMine] = useState<Mark[]>([]);
  const [chosen, setChosen] = useState<Mark[] | null>(null);
  const [hidden, setHidden] = useState<Set<MarkKind>>(new Set());
  const [takes, setTakes] = useState<Record<string, string>>({});
  const [agreement, setAgreement] = useState<{ id: string; shared: number; coach: number }[]>([]);
  const [rating, setRating] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const lineOfDay = mode === "lineOfDay";
  const config: LineRepConfig = useMemo(() => {
    const c = lineRepConfig(level);
    return lineOfDay ? { ...c, mode: "given", lines: 1, remix: false } : c;
  }, [level, lineOfDay]);

  useEffect(() => {
    (async () => {
      const lvl = await getDrillLevel("marked_reading");
      setLevel(lvl);
      const cfg = lineRepConfig(lvl);
      if (mineIds?.length) {
        const saved = (await Promise.all(mineIds.map(getMarkedText))).filter((t): t is NonNullable<typeof t> => !!t);
        setLines(saved.map((t) => ({ id: t.id, text: t.text, marks: t.marks, mine: true })));
        return;
      }
      const all = getLines();
      if (mode === "lineOfDay" && lineIds?.length) {
        const line = all.find((l) => l.id === lineIds[0]);
        setLines(line ? [{ ...line, mine: false }] : []);
        return;
      }
      const recent = await getRecentLineIds();
      const picked = pickLines(all, cfg, Math.floor(Math.random() * 10_000), {
        category: category && LINE_CATEGORIES.some((c) => c.id === category) ? category : undefined,
        firstId: lineIds?.[0],
        recentIds: recent,
      });
      setLines(picked.map((l) => ({ ...l, mine: false })));
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const line = lines?.[index];
  // Your own texts: your marks are the marks — nothing to compare against.
  const markingMode = line?.mine ? "given" : config.mode;

  useEffect(() => {
    if (!line) return;
    setRead(0);
    setChosen(null);
    setHidden(new Set());
    if (markingMode === "given") {
      setStage("read");
    } else {
      setMine([]);
      setStage("mark");
    }
  }, [line, markingMode]);

  if (!lines) return <ScreenContainer />;
  if (!line) {
    return (
      <ScreenContainer style={styles.container}>
        <Header title="Mark it up" onBack={() => navigation.goBack()} backIcon="close" />
        <Txt tone="secondary">Couldn't find those lines.</Txt>
      </ScreenContainer>
    );
  }

  // The coach's marks you're given at this level (the rest are yours).
  const given = markingMode === "add_pauses" ? keepKinds(line.marks, ["emphasis"]) : [];
  const yours = [...given, ...mine];
  const readMarks = chosen ?? line.marks;
  const readText: MarkedText = { text: line.text, marks: readMarks };
  const takeKey = `${index}:${stage === "remix" ? "remix" : read}`;
  const remix = remixEmphasis({ text: line.text, marks: readMarks }, index * 3 + line.text.length);

  function toggleHidden(kinds: MarkKind[]) {
    setHidden((prev) => {
      const next = new Set(prev);
      const allHidden = kinds.every((k) => next.has(k));
      kinds.forEach((k) => (allHidden ? next.delete(k) : next.add(k)));
      return next;
    });
  }

  function compare() {
    const result = compareMarks(yours, line!.marks);
    setAgreement((a) => [...a.filter((x) => x.id !== line!.id), { id: line!.id, shared: result.shared, coach: result.shared + result.coachOnly }]);
    setStage("compare");
  }

  async function toggleRecording() {
    if (recorder.state === "recording") {
      const take = await recorder.stop();
      if (take.uri) setTakes((t) => ({ ...t, [takeKey]: take.uri! }));
      return;
    }
    await recorder.start();
  }

  async function stopIfRecording() {
    if (recorder.state === "recording") {
      const take = await recorder.stop();
      if (take.uri) setTakes((t) => ({ ...t, [takeKey]: take.uri! }));
    }
  }

  async function nextRead() {
    await stopIfRecording();
    if (read < READS.length - 1) {
      setRead((r) => r + 1);
      return;
    }
    if ((config.remix || category === "contrast") && remix && !lineOfDay) {
      setStage("remix");
      return;
    }
    nextLine();
  }

  async function nextLine() {
    await stopIfRecording();
    if (index < lines!.length - 1) {
      setIndex((i) => i + 1);
      return;
    }
    if (lineOfDay) {
      await completePracticeStep(practice, null);
      navigation.goBack();
      return;
    }
    setStage("rate");
  }

  async function save() {
    if (rating == null || saving) return;
    setSaving(true);
    const outcome = scoreSelfRating(rating);
    const builtIn = lines!.filter((l) => !l.mine).map((l) => l.id);
    await recordDrillOutcome({
      drillType: "marked_reading",
      outcome,
      level,
      contentId: builtIn.length ? builtIn.join(",") : undefined,
      lessonId: practice?.lessonId,
      metrics: { mode: config.mode, lines: lines!.map((l) => l.id), agreement },
    });
    await markTextsPracticed(lines!.filter((l) => l.mine).map((l) => l.id));
    await completePracticeStep(practice, outcome.score);
    navigation.goBack();
  }

  const eyebrow = lineOfDay ? "Line of the day" : `Mark it up · line ${index + 1} of ${lines.length}`;

  return (
    <ScreenContainer style={styles.container}>
      <Header eyebrow={eyebrow} title={stageTitle(stage, read, markingMode)} onBack={() => navigation.goBack()} backIcon="close" />
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        {stage === "mark" ? (
          <Card style={styles.card}>
            <Txt variant="subhead" tone="secondary">
              {markingMode === "add_pauses"
                ? "The stressed words are marked. Add the pauses and where the pitch rises or falls — then compare with the coach."
                : "Mark it yourself: stress, pauses, rises and falls. Then compare with the coach."}
            </Txt>
            <MarkEditor text={line.text} marks={mine} onChange={setMine} tools={toolsFor(kindsYouMark(markingMode))} locked={given} />
          </Card>
        ) : null}

        {stage === "compare" ? <CompareCards line={line} yours={yours} onChoose={(m) => { setChosen(m); setStage("read"); }} /> : null}

        {stage === "read" ? (
          <>
            <Card style={styles.readCard}>
              <View style={styles.readHead}>
                <Txt variant="caption2" tone="accent" uppercase>
                  Read {read + 1} of {READS.length} · {READS[read].title}
                </Txt>
                <Txt variant="footnote" tone="secondary">
                  {READS[read].detail}
                </Txt>
              </View>
              <MarkedTextView marked={readText} level={READS[read].level} hidden={hidden} size="large" layout={READS[read].level === "none" ? "flow" : "phrases"} />
              {line.credit ? (
                <Txt variant="caption1" tone="muted">
                  — {line.credit}
                </Txt>
              ) : null}
            </Card>
            {READS[read].level !== "none" ? <MarkLegend marks={readMarks} hidden={hidden} onToggle={toggleHidden} /> : null}
          </>
        ) : null}

        {stage === "remix" && remix ? (
          <Card style={styles.readCard}>
            <Txt variant="caption2" tone="accent" uppercase>
              Remix · same line, stress moved
            </Txt>
            <MarkedTextView marked={remix} size="large" />
            <Txt variant="footnote" tone="secondary">
              Read it with the new stress. What does it mean now?
            </Txt>
          </Card>
        ) : null}

        {stage === "rate" ? (
          <Card style={styles.card}>
            <Txt variant="headline">How close did your reads sound to the marks?</Txt>
            <RatingScale value={rating} onChange={setRating} />
            {agreement.length ? (
              <Txt variant="footnote" tone="secondary">
                You placed {agreement.reduce((s, a) => s + a.shared, 0)} of the coach's {agreement.reduce((s, a) => s + a.coach, 0)} marks the same way.
                Different isn't wrong — it's a different reading.
              </Txt>
            ) : null}
          </Card>
        ) : null}
      </ScrollView>

      {(stage === "read" || stage === "remix") && recorder.canSave ? (
        <View style={styles.takeRow}>
          <Pressable
            onPress={toggleRecording}
            style={[styles.takeButton, recorder.state === "recording" && { backgroundColor: colors.dangerMuted }]}
            accessibilityRole="button"
            accessibilityLabel={recorder.state === "recording" ? "Stop recording" : "Record this read"}
          >
            <Ionicons name={recorder.state === "recording" ? "stop-circle" : "mic-outline"} size={20} color={recorder.state === "recording" ? colors.danger : colors.textSecondary} />
            <Txt variant="footnote" weight="600" tone="secondary">
              {recorder.state === "recording" ? "Stop" : "Record this read"}
            </Txt>
          </Pressable>
          {takes[takeKey] && recorder.state !== "recording" ? (
            <Pressable onPress={() => recorder.play(takes[takeKey])} style={styles.takeButton} accessibilityRole="button" accessibilityLabel="Play it back">
              <Ionicons name={recorder.playing === takes[takeKey] ? "pause" : "play"} size={20} color={colors.accent} />
              <Txt variant="footnote" weight="600" tone="accent">
                {recorder.playing === takes[takeKey] ? "Stop" : "Play it back"}
              </Txt>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {stage === "mark" ? <PrimaryButton label="Compare with the coach" onPress={compare} disabled={!mine.length} /> : null}
      {stage === "read" ? <PrimaryButton label={read < READS.length - 1 ? "Next read" : lineOfDay ? "Done" : "Next"} onPress={nextRead} loading={recorder.state === "stopping"} /> : null}
      {stage === "remix" ? <PrimaryButton label={index < lines.length - 1 ? "Next line" : "Finish"} onPress={nextLine} loading={recorder.state === "stopping"} /> : null}
      {stage === "rate" ? <PrimaryButton label="Done" onPress={save} disabled={rating == null} loading={saving} /> : null}
    </ScreenContainer>
  );
}

function stageTitle(stage: Stage, read: number, mode: string): string {
  if (stage === "mark") return mode === "add_pauses" ? "Add the pauses" : "Mark it";
  if (stage === "compare") return "Compare";
  if (stage === "remix") return "Remix";
  if (stage === "rate") return "How did it go?";
  return read === 2 ? "Without the marks" : "Read it aloud";
}

function CompareCards({ line, yours, onChoose }: { line: RepLine; yours: Mark[]; onChoose: (marks: Mark[]) => void }) {
  const styles = useStyles();
  const result = compareMarks(yours, line.marks);
  return (
    <>
      <Txt variant="subhead" tone="secondary">
        {result.shared} of your marks match the coach's. Where they differ, both can be right — pick the reading you want to practice.
      </Txt>
      <Card style={styles.card}>
        <Txt variant="caption2" tone="muted" uppercase>
          Yours
        </Txt>
        <MarkedTextView marked={{ text: line.text, marks: yours }} size="medium" />
        <PrimaryButton label="Read mine" variant="secondary" onPress={() => onChoose(yours)} />
      </Card>
      <Card style={styles.card}>
        <Txt variant="caption2" tone="muted" uppercase>
          Coach's
        </Txt>
        <MarkedTextView marked={line} size="medium" />
        <PrimaryButton label="Read the coach's" onPress={() => onChoose(line.marks)} />
      </Card>
    </>
  );
}

export function categoryLabel(category: LineCategory | undefined): string {
  return LINE_CATEGORIES.find((c) => c.id === category)?.label ?? "Lines";
}

const useStyles = makeStyles((t) => ({
  container: { gap: t.space.md },
  scroll: { gap: t.space.md, paddingBottom: t.space.lg },
  card: { gap: t.space.md },
  readCard: { gap: t.space.lg, paddingVertical: t.space.xl },
  readHead: { gap: 2 },
  takeRow: { flexDirection: "row", gap: t.space.sm, justifyContent: "center" },
  takeButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: t.space.md,
    paddingVertical: t.space.sm,
    borderRadius: t.radius.pill,
    backgroundColor: t.colors.surfaceRaised,
  },
}));
