import { useEffect, useRef, useState } from "react";
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
import { subscribePracticeSteps } from "../services/practice/practiceEvents";
import { getLatestDrillMetrics, listSkillChecks, saveSkillCheck, type SkillCheckPieces } from "../services/db/skillChecksRepo";
import { getAllPrompts } from "../services/db/promptsRepo";
import { getDrillLevel } from "../services/db/progressRepo";
import { paramsFor } from "../domain/drills/drillSpecs";
import { summarizeAttempt } from "../domain/conversation/attemptMetrics";
import { isFreeRecordPrompt } from "../data/topics";
import type { Prompt } from "../domain/sessionTypes";
import { completeOnboarding, resetToTabs } from "../services/onboarding/onboarding";
import { setSkillCheckPending } from "../services/prefs/prefsStore";
import { makeStyles, useTheme } from "../theme/ThemeProvider";

type Props = NativeStackScreenProps<RootStackParamList, "SkillCheck">;
type PieceId = "read" | "category" | "reply" | "talk";

const PIECES: { id: PieceId; title: string; detail: string; time: string }[] = [
  { id: "read", title: "Read a short passage", detail: "How clearly your words come through, and your pace.", time: "30 s" },
  { id: "category", title: "Name as many animals as you can", detail: "How quickly words come to you.", time: "30 s" },
  { id: "reply", title: "Reply to one line", detail: "How you pick up a conversation.", time: "20 s" },
  { id: "talk", title: "Talk about a topic", detail: "Pace, pauses, pitch, fillers, eye contact and shape — up to two minutes.", time: "≤ 2½ min" },
];

const READ_PASSAGE = "pace_coffee";
const CATEGORY = "animals";
const SKILL_CHECK_DATE = "skillcheck";

// Onboarding chapter 5 (and the 30-day retake): four short pieces through
// the app's own drill and recording screens. Nothing here is graded on
// screen; the results show on the Starting point screen.
export function SkillCheckScreen({ route, navigation }: Props) {
  const { defer, retake } = route.params ?? {};
  const styles = useStyles();
  const { colors } = useTheme();
  const [done, setDone] = useState<Partial<Record<PieceId, boolean>>>({});
  const [skipped, setSkipped] = useState<Partial<Record<PieceId, boolean>>>({});
  const [pieces, setPieces] = useState<SkillCheckPieces>({});
  const [topic, setTopic] = useState<Prompt | null>(null);
  const [rerolled, setRerolled] = useState(false);
  const [retakeOf, setRetakeOf] = useState<string | null>(null);
  const [stage, setStage] = useState<"pieces" | "felt">("pieces");
  const [felt, setFelt] = useState<number | null>(null);
  const startedAt = useRef(new Date().toISOString());
  const categoryTarget = useRef(8);

  // "Tomorrow, as Day 1": finish onboarding now and leave a card on Today.
  useEffect(() => {
    if (!defer) return;
    completeOnboarding({ deferSkillCheck: true });
    resetToTabs(navigation);
  }, [defer, navigation]);

  // The topic: an easy one — or, for the retake, the same one as last time.
  useEffect(() => {
    (async () => {
      const prompts = (await getAllPrompts()).filter((p) => !isFreeRecordPrompt(p.id));
      if (retake) {
        const first = (await listSkillChecks()).filter((c) => !c.retakeOf).pop();
        if (first) {
          setRetakeOf(first.id);
          const same = prompts.find((p) => p.id === first.topicId);
          if (same) {
            setTopic(same);
            return;
          }
        }
      }
      const easy = prompts.filter((p) => p.difficultyTier === "easy");
      const pool = easy.length ? easy : prompts;
      setTopic(pool[Math.floor(Math.random() * pool.length)] ?? null);
    })();
  }, [retake]);

  useEffect(
    () =>
      subscribePracticeSteps(async (event) => {
        if (event.context.planDate !== SKILL_CHECK_DATE) return;
        const piece = event.context.planStepId as PieceId;
        if (piece === "read") {
          const m = await getLatestDrillMetrics("pace_reading", startedAt.current);
          setPieces((p) => ({ ...p, read: m ? { accuracyPercent: m.accuracy, wpm: m.wpm } : null }));
        } else if (piece === "category") {
          const m = await getLatestDrillMetrics("category_fluency", startedAt.current);
          const counted = (m?.metrics as { counted?: string[] } | null)?.counted ?? [];
          setPieces((p) => ({ ...p, category: m ? { count: counted.length, target: categoryTarget.current } : null }));
        } else if (piece === "reply") {
          const m = await getLatestDrillMetrics("conv_reply", startedAt.current);
          const summary = m ? summarizeAttempt(m.metrics) : null;
          setPieces((p) => ({ ...p, reply: summary ? { latencyMs: summary.latencyMs, asked: summary.asked } : null }));
        } else if (piece === "talk") {
          setPieces((p) => ({ ...p, talkSessionId: event.sessionId ?? null }));
        }
        setDone((d) => ({ ...d, [piece]: true }));
      }),
    [],
  );

  if (defer) return <ScreenContainer />;

  async function start(piece: PieceId) {
    const practice = { planDate: SKILL_CHECK_DATE, planStepId: piece };
    if (piece === "read") navigation.navigate("Drill", { drill: "pace_reading", contentId: READ_PASSAGE, practice });
    if (piece === "category") {
      categoryTarget.current = paramsFor("category_fluency", await getDrillLevel("category_fluency")).target ?? 8;
      navigation.navigate("Drill", { drill: "category_fluency", contentId: CATEGORY, practice });
    }
    if (piece === "reply") navigation.navigate("Conversation", { drill: "conv_reply", practice });
    if (piece === "talk" && topic) {
      navigation.navigate("Recording", { kind: "prompt", prompt: topic, prepSeconds: 30, targetSeconds: 120, skillCheck: true, practice });
    }
  }

  async function reroll() {
    const prompts = (await getAllPrompts()).filter((p) => !isFreeRecordPrompt(p.id) && p.difficultyTier === "easy" && p.id !== topic?.id);
    if (prompts.length) setTopic(prompts[Math.floor(Math.random() * prompts.length)]);
    setRerolled(true);
  }

  async function save() {
    const checkId = await saveSkillCheck({
      topicId: done.talk ? topic?.id ?? null : null,
      sessionId: pieces.talkSessionId ?? null,
      pieces,
      felt,
      retakeOf,
    });
    setSkillCheckPending(false);
    navigation.replace("StartingPoint", { checkId });
  }

  function skipAll() {
    if (!retake) completeOnboarding();
    setSkillCheckPending(false);
    if (retake) navigation.goBack();
    else resetToTabs(navigation);
  }

  const settled = PIECES.every((p) => done[p.id] || skipped[p.id]);
  const anyDone = PIECES.some((p) => done[p.id]);

  if (stage === "felt") {
    return (
      <ScreenContainer style={styles.container}>
        <Header eyebrow="Skill check" title="Before you see anything" />
        <View style={styles.center}>
          <Card style={styles.card}>
            <Txt variant="title3">How do you think that went?</Txt>
            <RatingScale value={felt} onChange={setFelt} lowLabel="Badly" highLabel="Really well" />
            <Txt variant="footnote" tone="secondary">
              Your gut feeling, before any numbers — people who are hard on themselves are often surprised.
            </Txt>
          </Card>
        </View>
        <PrimaryButton label="See your starting point" onPress={save} disabled={felt == null} />
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer style={styles.container}>
      <Header eyebrow={retake ? "30-day check" : "Skill check · about 5 min"} title={retake ? "Same check, one month on" : "Where you're starting"} onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Txt variant="callout" tone="secondary">
          {retake
            ? "The same passage, the same topic. Then we'll put the two side by side."
            : "Four short pieces, in any order. Nothing is graded — it just tells your plan where to start. Skip anything you don't want to do."}
        </Txt>
        {PIECES.map((p) => {
          const isDone = done[p.id];
          const isSkipped = skipped[p.id];
          return (
            <Card key={p.id} style={[styles.card, isDone && { borderColor: colors.success }]}>
              <View style={styles.row}>
                <Ionicons name={isDone ? "checkmark-circle" : isSkipped ? "remove-circle-outline" : "ellipse-outline"} size={22} color={isDone ? colors.success : colors.textMuted} />
                <View style={styles.flex}>
                  <Txt variant="headline">{p.title}</Txt>
                  <Txt variant="footnote" tone="secondary">
                    {p.detail} · {p.time}
                  </Txt>
                </View>
              </View>
              {p.id === "talk" && topic && !isDone ? (
                <View style={styles.topic}>
                  <Txt variant="callout" weight="600">
                    “{topic.text}”
                  </Txt>
                  <Txt variant="footnote" tone="muted">
                    30 seconds to think, then talk for up to two minutes. Stopping early is fine — that's useful too.
                  </Txt>
                  {!rerolled && !retake ? (
                    <Pressable onPress={reroll} accessibilityRole="button">
                      <Txt variant="footnote" tone="accent">
                        Different topic
                      </Txt>
                    </Pressable>
                  ) : null}
                </View>
              ) : null}
              {!isDone ? (
                <View style={styles.row}>
                  <PrimaryButton label="Start" style={styles.flex} onPress={() => start(p.id)} disabled={p.id === "talk" && !topic} />
                  {!isSkipped ? (
                    <Pressable onPress={() => setSkipped((s) => ({ ...s, [p.id]: true }))} hitSlop={8} accessibilityRole="button">
                      <Txt variant="footnote" tone="muted">
                        Skip
                      </Txt>
                    </Pressable>
                  ) : null}
                </View>
              ) : null}
            </Card>
          );
        })}
      </ScrollView>
      {settled && anyDone ? <PrimaryButton label="Done" onPress={() => setStage("felt")} /> : null}
      {!anyDone ? <PrimaryButton label={retake ? "Not now" : "Skip the check for now"} variant="ghost" onPress={skipAll} /> : null}
    </ScreenContainer>
  );
}

const useStyles = makeStyles((t) => ({
  container: { gap: t.space.md },
  scroll: { gap: t.space.md, paddingBottom: t.space.lg },
  center: { flex: 1, justifyContent: "center" },
  card: { gap: t.space.md },
  row: { flexDirection: "row", alignItems: "center", gap: t.space.md },
  topic: { gap: t.space.xs, padding: t.space.md, borderRadius: t.radius.md, backgroundColor: t.colors.surfaceRaised },
  flex: { flex: 1 },
}));
