import { useCallback, useMemo, useState } from "react";
import { View } from "react-native";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../navigation";
import { Screen } from "../components/common/Screen";
import { Card } from "../components/common/Card";
import { Chip } from "../components/common/Chip";
import { DotRing } from "../components/common/DotRing";
import { HeroCard } from "../components/common/HeroCard";
import { ListGroup, ListRow } from "../components/common/ListRow";
import { PrimaryButton } from "../components/common/PrimaryButton";
import { SayItAloud } from "../components/common/SayItAloud";
import { Txt } from "../components/common/Txt";
import { Field } from "../components/conversation/Field";
import { THREE_THINGS_PROMPTS } from "../content/threeThings";
import { similarEntry } from "../domain/innerVoice/similarity";
import { toSecondPerson } from "../domain/innerVoice/secondPerson";
import { atCapstone, dailyAim, MAX_PER_DAY, runDays, RUN_DAYS, type RunState } from "../domain/innerVoice/run";
import { addSelfLike, listSelfLikes, markSelfLikeSaid, type SelfLike } from "../services/db/selfLikesRepo";
import { getSelfLikesRun, getUserProfile, setSelfLikesRun } from "../services/prefs/prefsStore";
import { todayISODate } from "../utils/dateUtils";
import { success } from "../utils/haptics";
import { makeStyles, useTheme } from "../theme/ThemeProvider";

const dayLabel = (iso: string): string => new Date(`${iso}T12:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" });

// Three things: each day, write one to three things you like about yourself
// — never the same thing twice — then say them to yourself, as "you". Thirty
// days of entries make a round; after that you choose what comes next.
export function ThreeThingsScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [entries, setEntries] = useState<SelfLike[] | null>(null);
  const [run, setRun] = useState<RunState>(getSelfLikesRun());
  const [text, setText] = useState("");
  const [promptId, setPromptId] = useState<string | null>(null);
  const [warning, setWarning] = useState<{ text: string; date: string } | null>(null);
  const [saying, setSaying] = useState<string | null>(null);
  const name = getUserProfile()?.name?.trim();
  const today = todayISODate();

  useFocusEffect(
    useCallback(() => {
      listSelfLikes().then(setEntries);
      setRun(getSelfLikesRun());
    }, []),
  );

  const all = entries ?? [];
  const todays = all.filter((e) => e.date === today);
  const days = runDays(all, run.round);
  const capstone = atCapstone(all, run);
  const aim = dailyAim(run);
  const canAdd = run.mode !== "paused" && !capstone && todays.length < (run.mode === "light" ? 1 : MAX_PER_DAY);
  const prompt = THREE_THINGS_PROMPTS.find((p) => p.id === promptId);
  const history = useMemo(() => all.map((e) => ({ id: e.id, text: e.text, date: e.date })), [all]);

  async function add(force = false) {
    const written = text.trim();
    if (!written || !canAdd) return;
    if (!force) {
      const similar = similarEntry(written, history);
      if (similar) {
        setWarning({ text: similar.entry.text, date: similar.entry.date });
        return;
      }
    }
    const like = await addSelfLike({ text: written, promptId, round: run.round });
    setEntries((current) => [...(current ?? []), like]);
    setText("");
    setPromptId(null);
    setWarning(null);
    setSaying(like.id);
    success();
  }

  function said(like: SelfLike) {
    markSelfLikeSaid(like.id).catch(() => undefined);
    setEntries((current) => (current ?? []).map((e) => (e.id === like.id ? { ...e, saidAt: new Date().toISOString() } : e)));
    setSaying(null);
  }

  function startAgain() {
    const next: RunState = { round: run.round + 1, mode: "run" };
    setSelfLikesRun(next);
    setRun(next);
  }

  const eyebrow = run.mode === "light" ? "Keeping it light" : run.mode === "paused" ? "Paused" : `Round ${run.round}`;

  return (
    <Screen title="Three things" eyebrow={eyebrow} onBack={() => navigation.goBack()} contentStyle={styles.content} keyboardShouldPersistTaps="handled">
      {run.mode === "paused" ? (
        <Card style={styles.card}>
          <Txt variant="headline">On a break</Txt>
          <Txt variant="subhead" tone="secondary">
            Nothing to write for now. An old one from your list turns up on Today now and then. Start a new round whenever you like.
          </Txt>
          <PrimaryButton label="Start a new round" onPress={startAgain} />
        </Card>
      ) : (
        <HeroCard accent={colors.success} contentStyle={styles.hero}>
          {run.mode === "run" ? (
            <DotRing size={112} total={RUN_DAYS} filled={Math.min(days, RUN_DAYS)} color={colors.success}>
              <Txt variant="title2" tabular>
                {Math.min(days, RUN_DAYS)}
              </Txt>
            </DotRing>
          ) : null}
          <View style={styles.heroText}>
            <Txt variant="title3">
              {run.mode === "run" ? `${Math.min(days, RUN_DAYS)} of ${RUN_DAYS} days` : "A day at a time"}
            </Txt>
            <Txt variant="subhead" tone="secondary">
              {todays.length} of {aim} today
            </Txt>
            <Txt variant="footnote" tone="muted">
              Write what you like about yourself — something new each day. Then say it to yourself.
            </Txt>
          </View>
        </HeroCard>
      )}

      {capstone ? (
        <Card style={styles.card}>
          <Txt variant="headline">You've done {RUN_DAYS} days</Txt>
          <Txt variant="subhead" tone="secondary">
            Look at everything you wrote, say it all aloud, and choose what comes next.
          </Txt>
          <PrimaryButton label="See your list" onPress={() => navigation.navigate("ThreeThingsList", { capstone: true })} />
        </Card>
      ) : null}

      {todays.length > 0 ? (
        <Card style={styles.card}>
          <Txt variant="footnote" weight="500" tone="secondary">
            Today
          </Txt>
          {todays.map((like, i) => (
            <View key={like.id} style={[styles.entry, i > 0 && styles.divided]}>
              <Txt variant="body" weight="500">
                {toSecondPerson(like.text, name)}
              </Txt>
              {like.saidAt ? (
                <Txt variant="footnote" tone="secondary">
                  Said aloud
                </Txt>
              ) : saying === like.id ? (
                <SayItAloud text={toSecondPerson(like.text, name)} onDone={() => said(like)} actionLabel="Say it to yourself" />
              ) : (
                <View style={styles.sayRow}>
                  <PrimaryButton label="Say it to yourself" variant="ghost" size="sm" icon="mic-outline" onPress={() => setSaying(like.id)} />
                </View>
              )}
            </View>
          ))}
        </Card>
      ) : null}

      {canAdd ? (
        <Card style={styles.card}>
          <Txt variant="headline">{todays.length === 0 ? "What do you like about yourself?" : "Anything else?"}</Txt>
          <View style={styles.chips}>
            {THREE_THINGS_PROMPTS.map((p) => (
              <Chip key={p.id} label={p.label} selected={promptId === p.id} onPress={() => setPromptId(promptId === p.id ? null : p.id)} />
            ))}
          </View>
          {prompt ? (
            <Txt variant="footnote" tone="secondary">
              {prompt.hint}
            </Txt>
          ) : null}
          <Field
            value={text}
            onChangeText={(t) => {
              setText(t);
              setWarning(null);
            }}
            placeholder="I'm…"
            multiline
            maxLength={160}
          />
          {warning ? (
            <View style={styles.warning}>
              <Txt variant="subhead">
                Close to one you wrote on {dayLabel(warning.date)}: “{warning.text}”
              </Txt>
              <Txt variant="footnote" tone="secondary">
                Every day is a new one — is there another side of it?
              </Txt>
              <View style={styles.sayRow}>
                <PrimaryButton label="Find a new angle" variant="secondary" size="sm" onPress={() => setWarning(null)} />
                <PrimaryButton label="It's different" variant="ghost" size="sm" onPress={() => add(true)} />
              </View>
            </View>
          ) : null}
          <PrimaryButton label="Add" icon="add" onPress={() => add()} disabled={!text.trim() || !!warning} />
        </Card>
      ) : null}

      {!capstone && todays.length >= (run.mode === "light" ? 1 : MAX_PER_DAY) ? (
        <Txt variant="subhead" tone="secondary" align="center">
          {run.mode === "light" ? "That's today's one." : "That's three for today."} See you tomorrow.
        </Txt>
      ) : null}

      {all.length > 0 ? (
        <ListGroup>
          <ListRow icon="list-outline" title="Your list" subtitle={`${all.length} ${all.length === 1 ? "thing" : "things"} so far`} chevron onPress={() => navigation.navigate("ThreeThingsList")} />
        </ListGroup>
      ) : null}
    </Screen>
  );
}

const useStyles = makeStyles((t) => ({
  content: { gap: t.space.md },
  hero: { flexDirection: "row", alignItems: "center", gap: t.space.lg },
  heroText: { flex: 1, gap: 3 },
  card: { gap: t.space.sm + 2 },
  entry: { gap: t.space.sm, paddingVertical: t.space.xs },
  divided: { borderTopWidth: 1, borderTopColor: t.colors.separator, paddingTop: t.space.md },
  sayRow: { flexDirection: "row", gap: t.space.sm, alignItems: "center", flexWrap: "wrap" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: t.space.sm },
  warning: { backgroundColor: t.colors.surfaceRaised, borderRadius: t.radius.md, padding: t.space.md, gap: t.space.xs + 2 },
}));
