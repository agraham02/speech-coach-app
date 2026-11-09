import { useEffect, useMemo, useRef, useState } from "react";
import { View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../navigation";
import { ScreenContainer } from "../components/common/ScreenContainer";
import { Header } from "../components/common/Header";
import { Card } from "../components/common/Card";
import { HeroCard } from "../components/common/HeroCard";
import { Txt } from "../components/common/Txt";
import { PrimaryButton } from "../components/common/PrimaryButton";
import { GateNote } from "../components/celebrate/GateNote";
import { DrillProgressLine } from "../components/celebrate/DrillProgressLine";
import { MarkedTextView } from "../components/cadence/MarkedTextView";
import { MarkLegend } from "../components/cadence/MarkLegend";
import { GuideTip, TourScrollContext, TourTarget, useTourScroll } from "../components/common/GuideTip";
import { MarkEditor, toolsFor } from "../components/cadence/MarkEditor";
import { useTakeRecorder } from "../hooks/useTakeRecorder";
import { getLines, LINE_CATEGORIES } from "../content/lines";
import { lineRepConfig, pickLines, kindsYouMark, type LineRepConfig } from "../domain/cadence/lineRep";
import { compareMarks, keepKinds, type Mark, type MarkKind, type MarkedText } from "../domain/cadence/marks";
import { autoMark, remixEmphasis } from "../domain/cadence/autoMark";
import { outcome } from "../domain/drills/drillSpecs";
import { scoreLineReads, type LineReadsInput, type LineScore } from "../domain/cadence/lineReads";
import { defaultsFromProfile } from "../domain/profile";
import { transcribeDrillClips } from "../services/speech/clipTranscript";
import { getDrillLevel, recordDrillOutcome, type ProgressChange } from "../services/db/progressRepo";
import { getMarkedText, getRecentLineIds, markTextsPracticed } from "../services/db/markedTextsRepo";
import { getPhrasesByIds, markPhrasesPracticed } from "../services/db/phrasebookRepo";
import { listSelfLikes } from "../services/db/selfLikesRepo";
import { toSecondPerson } from "../domain/innerVoice/secondPerson";
import { getUserProfile } from "../services/prefs/prefsStore";
import { completePracticeStep } from "../services/practice/practiceEvents";
import { ACTIVITY_IDS, drillActivityId } from "../content/activities";
import { makeStyles, useTheme } from "../theme/ThemeProvider";

type Props = NativeStackScreenProps<RootStackParamList, "LineRep">;

interface RepLine extends MarkedText {
  id: string;
  credit?: string;
  mine: boolean;
  // Your own saved phrases are read like your own marked texts, but keep
  // their own practice count.
  phrase?: boolean;
}

type Stage = "mark" | "compare" | "read" | "remix" | "checking" | "result";

const READS = [
  { level: "full" as const, title: "Slow and exaggerated", detail: "Hit every mark — bigger than feels natural." },
  { level: "full" as const, title: "Natural speed", detail: "Same marks, at the speed you'd really say it." },
  { level: "none" as const, title: "Marks hidden", detail: "Keep the same music without the map." },
];

// Mark It Up's main loop: a few lines of
// one or two sentences, each marked (or checked), read twice with the marks
// and once without. Line of the day is a one-line version. Your recorded reads
// are the number (domain/cadence/lineReads.ts), never a self-rating (task 3c.3).
export function LineRepScreen({ route, navigation }: Props) {
  const { lineIds, mineIds, phraseIds, aboutYou, category, mode = "rep", practice } = route.params ?? {};
  const styles = useStyles();
  const { colors } = useTheme();
  const recorder = useTakeRecorder();
  const { tourScroll, scrollProps } = useTourScroll();
  const [level, setLevel] = useState(1);
  const [lines, setLines] = useState<RepLine[] | null>(null);
  const [index, setIndex] = useState(0);
  const [stage, setStage] = useState<Stage>("read");
  const [read, setRead] = useState(0);
  const [mine, setMine] = useState<Mark[]>([]);
  const [chosen, setChosen] = useState<Mark[] | null>(null);
  const [hidden, setHidden] = useState<Set<MarkKind>>(new Set());
  // Each recorded read, by "line:read": its clip and what the phone heard live.
  const [takes, setTakes] = useState<Record<string, { uri: string; text: string }>>({});
  const takesRef = useRef<Record<string, { uri: string; text: string }>>({});
  function keep(key: string, entry: { uri: string; text: string }) {
    takesRef.current = { ...takesRef.current, [key]: entry };
    setTakes(takesRef.current);
  }
  const [agreement, setAgreement] = useState<{ id: string; shared: number; coach: number }[]>([]);
  const [result, setResult] = useState<{ scored: LineScore; quick: boolean; change: ProgressChange | null } | null>(null);
  const [saving, setSaving] = useState(false);
  const lineOfDay = mode === "lineOfDay";
  // Reading saved phrases is the Phrasebook; anything else is a line rep.
  const repActivity = phraseIds?.length ? ACTIVITY_IDS.phrasebook : drillActivityId("marked_reading");
  const config: LineRepConfig = useMemo(() => {
    const c = lineRepConfig(level);
    return lineOfDay ? { ...c, mode: "given", lines: 1, remix: false } : c;
  }, [level, lineOfDay]);

  useEffect(() => {
    (async () => {
      const lvl = await getDrillLevel("marked_reading");
      setLevel(lvl);
      const cfg = lineRepConfig(lvl);
      if (aboutYou) {
        // What you like about yourself, said to yourself: a few of them, in
        // the second person, marked by the coach.
        const name = getUserProfile()?.name;
        const likes = (await listSelfLikes()).sort(() => Math.random() - 0.5).slice(0, 4);
        setLines(
          likes.map((l) => {
            const spoken = toSecondPerson(l.text, name);
            return { id: l.id, text: spoken, marks: autoMark(spoken).marks, mine: true, phrase: true };
          }),
        );
        return;
      }
      if (phraseIds?.length) {
        // A saved phrase has no marks of its own: it gets the coach's.
        const saved = await getPhrasesByIds(phraseIds);
        setLines(saved.map((p) => ({ id: p.id, text: p.text, marks: autoMark(p.text).marks, mine: true, phrase: true })));
        return;
      }
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
  const take: string | undefined = takes[takeKey]?.uri;
  const recording = recorder.state === "recording";
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
      if (take.uri) keep(takeKey, { uri: take.uri, text: take.transcript });
      return;
    }
    await recorder.start();
  }

  async function stopIfRecording() {
    if (recorder.state === "recording") {
      const take = await recorder.stop();
      if (take.uri) keep(takeKey, { uri: take.uri, text: take.transcript });
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
    await finish();
  }

  // Whisper reads every recorded read; the reads are the number.
  async function finish() {
    setStage("checking");
    // From the ref: the last read was saved in this same tap, after this render.
    const all = takesRef.current;
    let quick = false;
    const inputs: LineReadsInput[] = [];
    for (let i = 0; i < lines!.length; i++) {
      const reads = [];
      for (const [key, rec] of Object.entries(all)) {
        if (!key.startsWith(`${i}:`)) continue;
        const whisper = await transcribeDrillClips([rec.uri]);
        if (!whisper) quick = true;
        reads.push({ text: whisper?.text ?? rec.text, words: whisper?.words ?? null });
      }
      inputs.push({ line: lines![i], reads });
    }
    const coach = agreement.reduce((sum, a) => sum + a.coach, 0);
    const shared = agreement.reduce((sum, a) => sum + a.shared, 0);
    const scored = scoreLineReads(inputs, coach > 0 ? { shared, coach } : null, { relaxed: defaultsFromProfile(getUserProfile()).relaxAccuracy });
    const builtIn = lines!.filter((l) => !l.mine).map((l) => l.id);
    let change: ProgressChange | null = null;
    try {
      const score = scored.score ?? 0;
      change = await recordDrillOutcome({
        drillType: "marked_reading",
        outcome: outcome(score, `${Math.round(score * 100)}% · words read${coach > 0 ? " and marks matched" : ""}`),
        level,
        contentId: builtIn.length ? builtIn.join(",") : undefined,
        lessonId: practice?.lessonId,
        metrics: { mode: config.mode, lines: lines!.map((l) => l.id), agreement, accuracyPercent: scored.accuracyPercent },
        accuracyPercent: scored.accuracyPercent,
        activityId: repActivity,
        source: "measured",
        leafScores: scored.leafScores,
        gate: scored.gate,
        quick,
      });
    } catch {
      // The reads are still shown; the toast below says it didn't count.
    }
    await markTextsPracticed(lines!.filter((l) => l.mine && !l.phrase).map((l) => l.id));
    await markPhrasesPracticed(lines!.filter((l) => l.phrase).map((l) => l.id));
    setResult({ scored, quick, change });
    setStage("result");
  }

  async function done() {
    if (saving) return;
    setSaving(true);
    await completePracticeStep(repActivity, practice, result?.scored.gate.passed ? result.scored.score : null, { quick: result?.quick });
    navigation.goBack();
  }

  const eyebrow = lineOfDay ? "Line of the day" : `Mark it up · line ${index + 1} of ${lines.length}`;

  return (
    <ScreenContainer style={styles.container}>
      <Header eyebrow={eyebrow} title={stageTitle(stage, read, markingMode)} onBack={() => navigation.goBack()} backIcon="close" />
      <TourScrollContext.Provider value={tourScroll}>
      <KeyboardAwareScrollView {...(scrollProps as object)} bottomOffset={24} contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
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
            <TourTarget id="lineRep.text">
            <HeroCard accent={colors.skill.cadence.fg} contentStyle={styles.readCard}>
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
            </HeroCard>
            </TourTarget>
            {READS[read].level !== "none" ? (
              <TourTarget id="lineRep.legend">
                <MarkLegend marks={readMarks} hidden={hidden} onToggle={toggleHidden} />
              </TourTarget>
            ) : null}
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

        {stage === "checking" ? (
          <Card style={styles.card}>
            <Txt variant="headline">Checking your reads…</Txt>
          </Card>
        ) : null}

        {stage === "result" && result ? (
          <>
            {result.scored.score != null ? (
              <Card style={styles.card}>
                <Txt variant="largeTitle">{Math.round(result.scored.score * 100)}%</Txt>
                {result.scored.parts.map((p, i) => (
                  <View key={i}>
                    <Txt variant="subhead">{p.note}</Txt>
                    <Txt variant="caption1" tone="muted">
                      {p.label}
                    </Txt>
                  </View>
                ))}
                {agreement.length ? (
                  <Txt variant="footnote" tone="secondary">
                    Different marks aren't wrong. They're a different reading.
                  </Txt>
                ) : null}
              </Card>
            ) : null}
            {!result.scored.gate.passed ? <GateNote gate={result.scored.gate} /> : null}
            {result.change ? <DrillProgressLine change={result.change} drillTitle={lineOfDay ? "Line of the day" : "Mark it up"} /> : null}
            {result.quick ? (
              <Txt variant="footnote" tone="muted">
                Quick check: scored from what your phone heard live, so it counts a little less. Download the transcription model (Settings, Coaching & AI) for the full check.
              </Txt>
            ) : null}
          </>
        ) : null}
      </KeyboardAwareScrollView>
      </TourScrollContext.Provider>

      {stage === "read" || stage === "remix" ? (
        <TourTarget id="lineRep.record" style={styles.actions}>
          {/* Saying the line aloud is the point, so recording it is the main
              action; moving on is secondary. Where the phone can't keep the
              audio, moving on is all there is. */}
          {recorder.canSave ? (
            <PrimaryButton
              label={recording ? "Stop recording" : take ? "Re-record this read" : "Record this read"}
              icon={recording ? "stop" : take ? "refresh" : "mic"}
              variant={recording ? "danger" : "primary"}
              onPress={toggleRecording}
              loading={recorder.state === "stopping"}
            />
          ) : null}
          <View style={styles.actionRow}>
            {take && !recording ? (
              <PrimaryButton
                label={recorder.playing === take ? "Stop" : "Play it back"}
                icon={recorder.playing === take ? "pause" : "play"}
                variant="secondary"
                size="md"
                style={styles.flex}
                onPress={() => recorder.play(take)}
              />
            ) : null}
            <PrimaryButton
              label={stage === "remix" ? (index < lines.length - 1 ? "Next line" : "Finish") : read < READS.length - 1 ? "Next read" : lineOfDay ? "Done" : "Next"}
              iconRight={stage === "read" && read < READS.length - 1 ? "arrow-forward" : undefined}
              variant={recorder.canSave ? "secondary" : "primary"}
              size={recorder.canSave ? "md" : "lg"}
              style={styles.flex}
              onPress={stage === "remix" ? nextLine : nextRead}
              disabled={recorder.state === "stopping"}
            />
          </View>
        </TourTarget>
      ) : null}

      {stage === "mark" ? <PrimaryButton label="Compare with the coach" onPress={compare} disabled={!mine.length} /> : null}
      {stage === "result" ? <PrimaryButton label="Done" onPress={done} loading={saving} /> : null}
      {/* Once there are marks to read (Mark it up starts with marking). */}
      {stage === "read" ? <GuideTip id="lineRep" /> : null}
    </ScreenContainer>
  );
}

function stageTitle(stage: Stage, read: number, mode: string): string {
  if (stage === "mark") return mode === "add_pauses" ? "Add the pauses" : "Mark it";
  if (stage === "compare") return "Compare";
  if (stage === "remix") return "Remix";
  if (stage === "checking" || stage === "result") return "Your reads";
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

const useStyles = makeStyles((t) => ({
  container: { gap: t.space.md },
  scroll: { gap: t.space.md, paddingBottom: t.space.lg },
  card: { gap: t.space.md },
  readCard: { gap: t.space.lg, paddingVertical: t.space.xl },
  readHead: { gap: 2 },
  actions: { gap: t.space.sm },
  actionRow: { flexDirection: "row", gap: t.space.sm },
  flex: { flex: 1 },
}));
