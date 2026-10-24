import { useCallback, useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp, NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../navigation";
import { Screen } from "../components/common/Screen";
import { Card } from "../components/common/Card";
import { HeroCard } from "../components/common/HeroCard";
import { ListGroup, ListRow } from "../components/common/ListRow";
import { PrimaryButton } from "../components/common/PrimaryButton";
import { Txt } from "../components/common/Txt";
import { showGlobalToast } from "../components/common/ToastProvider";
import { partsCovered } from "../domain/rewind/stats";
import { getRewind, type Rewind } from "../services/db/rewindRepo";
import { stopClip } from "../services/audio/clipPlayer";
import { rewindAudioExists, resolveRewindUri } from "../services/rewind/rewindStorage";
import { getNotesState, requestNotes, subscribeNotes } from "../services/rewind/rewindNotes";
import { getRewindStage, isRewindProcessing } from "../services/rewind/rewindProcessor";
import { NotesWorkCard, RewindWorkCard } from "../components/work/RewindWorkCard";
import { useElapsed } from "../hooks/useElapsed";
import { RewindPlayer } from "../components/rewind/RewindPlayer";
import { confirmDeleteRewind } from "../components/rewind/confirmDeleteRewind";
import { retranscribeRewind } from "../services/rewind/rewindProcessor";
import { getAudioRetentionDays } from "../services/prefs/prefsStore";
import { useAccount } from "../services/account/accountStore";
import { openPaywall } from "../services/cloud/consent";
import { tonoAgeGated } from "../services/cloud/routing";
import { purchasesEnabled } from "../services/purchases/purchases";
import { formatDuration } from "../utils/dateUtils";
import { dayLabel } from "../domain/rewind/labels";
import { makeStyles, useTheme } from "../theme/ThemeProvider";

type Props = NativeStackScreenProps<RootStackParamList, "RewindResult">;

const NOTES = [
  ["specificity", "Specificity"],
  ["storytelling", "Storytelling"],
  ["flow", "Flow"],
  ["coverage", "Coverage"],
] as const;

// What came out of a Rewind: how much of the day you covered, the concrete
// details counted, and — where the phone can write them — notes on the
// content. No score, and nothing about how it sounded.
export function RewindResultScreen({ route }: Props) {
  const styles = useStyles();
  const { colors } = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [rewind, setRewind] = useState<Rewind | null>(null);
  const [missing, setMissing] = useState(false);
  const [showText, setShowText] = useState(false);
  const [, redraw] = useState(0);
  const [retrying, setRetrying] = useState(false);
  const audioDays = getAudioRetentionDays();
  const alive = useRef(true);

  const load = useCallback(async () => {
    const found = await getRewind(route.params.id);
    if (!alive.current) return;
    if (found) setRewind(found);
    else setMissing(true);
  }, [route.params.id]);

  useEffect(() => {
    alive.current = true;
    load();
    return () => {
      alive.current = false;
      stopClip();
    };
  }, [load]);

  // A take still being listened back to fills in by itself.
  useEffect(() => {
    if (rewind?.status !== "processing") return;
    const timer = setInterval(load, 2000);
    return () => clearInterval(timer);
  }, [rewind?.status, load]);

  // The notes being written: shown here, and carried on if you leave.
  const notes = getNotesState(route.params.id);
  const notesRunning = notes.status === "running";
  useEffect(
    () =>
      subscribeNotes(() => {
        redraw((n) => n + 1);
        load();
      }),
    [load],
  );
  const notesElapsed = useElapsed(notesRunning);
  const listenElapsed = useElapsed(rewind?.status === "processing");

  function confirmDelete() {
    if (!rewind) return;
    confirmDeleteRewind(rewind, {
      onDeleted: () => navigation.goBack(),
      onFreed: () => {
        load();
        showGlobalToast("Recording deleted. Words and notes kept", "success");
      },
      onFailed: () => showGlobalToast("Couldn't delete that. Try again", "error"),
    });
  }

  // Whisper again, from the saved audio — the phone's recognizer wrote this one.
  async function again() {
    if (!rewind || retrying) return;
    setRetrying(true);
    const ok = await retranscribeRewind(rewind.id);
    setRetrying(false);
    if (ok) load();
    else showGlobalToast("Couldn't write it out again. Check your connection and try later.", "error");
  }

  // Notes are Tono AI, a Plus (and trial) feature; under 18 there are none.
  // Only a known free account sees the Plus card: before there is an
  // account, the button finds out (a tester in beta has notes without Plus).
  const tier = useAccount().allowance?.tier ?? null;

  function askCloud() {
    if (!rewind || notesRunning) return;
    requestNotes(rewind, () => undefined).catch(() => undefined);
  }

  if (missing) {
    return (
      <Screen title="Rewind" onBack={() => navigation.goBack()}>
        <Txt tone="secondary">That take isn't here any more.</Txt>
      </Screen>
    );
  }
  if (!rewind) return <Screen title="Rewind" onBack={() => navigation.goBack()} />;

  const stats = rewind.stats;
  // The judge's checked read of the day beats the phone's keyword guess.
  // (`?.`: a take reviewed before notes carried `parts` has none.)
  const aiParts = rewind.review?.parts;
  const coverage = aiParts ? { morning: aiParts.morning.status !== "missing", midday: aiParts.midday.status !== "missing", evening: aiParts.evening.status !== "missing" } : stats?.coverage;
  const processing = rewind.status === "processing";
  const details = stats?.details;
  const minor = tonoAgeGated();
  const hasAudio = rewindAudioExists(rewind.audioFile);

  return (
    <Screen title={dayLabel(rewind.date)} eyebrow="Rewind" onBack={() => navigation.goBack()} contentStyle={styles.content}>
      {processing ? <RewindWorkCard stage={isRewindProcessing(rewind.id) ? getRewindStage(rewind.id) : null} talkSeconds={rewind.durationSeconds} elapsed={listenElapsed} /> : null}

      {stats && coverage ? (
        <HeroCard accent={colors.skill.conversation.fg} contentStyle={styles.hero}>
          <Txt variant="footnote" tone="secondary">
            The day you covered
          </Txt>
          <View style={styles.parts}>
            {(["morning", "midday", "evening"] as const).map((part) => (
              <View key={part} style={styles.part}>
                <Ionicons name={coverage[part] ? "checkmark-circle" : "ellipse-outline"} size={22} color={coverage[part] ? colors.success : colors.textMuted} />
                <Txt variant="subhead" weight="600" color={coverage[part] ? colors.textPrimary : colors.textMuted}>
                  {part[0].toUpperCase() + part.slice(1)}
                </Txt>
              </View>
            ))}
          </View>
          <Txt variant="footnote" tone="secondary">
            {partsCovered(coverage) === 3 ? "All three parts of the day came up." : `${partsCovered(coverage)} of 3 parts of the day came up.`}
            {aiParts ? ` Read by ${rewind.reviewSource ?? "Tono AI"}.` : ""}
          </Txt>
        </HeroCard>
      ) : null}

      {stats && details ? (
        <ListGroup title="Counted">
          <ListRow icon="time-outline" title="Length" value={formatDuration(rewind.durationSeconds)} />
          <ListRow icon="sparkles-outline" title="Concrete details" subtitle={detailBreakdown(details)} value={String(details.total)} />
          <ListRow icon="pause-outline" title="Longest pause" value={stats.longestPauseSeconds ? `${stats.longestPauseSeconds} s` : "None over 3 s"} />
        </ListGroup>
      ) : null}

      {rewind.review ? (
        <Card style={styles.notes}>
          <Txt variant="headline">Notes</Txt>
          {NOTES.map(([key, label]) => (
            <View key={key} style={styles.note}>
              <Txt variant="footnote" weight="600" tone="secondary">
                {label}
              </Txt>
              <Txt variant="callout">{rewind.review![key]}</Txt>
            </View>
          ))}
          {rewind.review.vividDetail ? (
            <View style={styles.note}>
              <Txt variant="footnote" weight="600" tone="secondary">
                Most vivid
              </Txt>
              <Txt variant="callout" italic>
                “{rewind.review.vividDetail}”
              </Txt>
            </View>
          ) : null}
          <View style={styles.note}>
            <Txt variant="footnote" weight="600" tone="secondary">
              Try tomorrow
            </Txt>
            <Txt variant="callout">{rewind.review.tryTomorrow}</Txt>
          </View>
          <Txt variant="caption1" tone="muted">
            {`Written by ${rewind.reviewSource ?? "Tono AI"} from your transcript, with every quote checked against your words. Not a score.`}
          </Txt>
        </Card>
      ) : !processing && rewind.transcript && !minor ? (
        tier === "free" ? (
          <Card style={styles.notes}>
            <Txt variant="headline">Notes</Txt>
            <Txt variant="subhead" tone="secondary">
              Notes on what you said come with Tono Plus: which parts of the day you covered, the most vivid moment, and one thing to try tomorrow. Your counts above are from this phone.
            </Txt>
            {purchasesEnabled() ? <PrimaryButton label="See Tono Plus" variant="ghost" size="sm" icon="sparkles-outline" onPress={openPaywall} /> : null}
          </Card>
        ) : (
          <Card style={styles.notes}>
            <Txt variant="headline">Notes</Txt>
            {notesRunning ? (
              <NotesWorkCard elapsed={notesElapsed} />
            ) : (
              <>
                {notes.status === "failed" ? (
                  <Txt variant="subhead" tone="danger">
                    {notes.message}
                  </Txt>
                ) : (
                  <Txt variant="subhead" tone="secondary">
                    This phone can't write notes on its own. Tono AI can: only the words of this take are sent.
                  </Txt>
                )}
                <PrimaryButton
                  label={notes.status === "failed" ? "Try again" : "Get notes from Tono AI"}
                  variant="secondary"
                  size="md"
                  icon="cloud-outline"
                  onPress={askCloud}
                />
              </>
            )}
          </Card>
        )
      ) : null}

      {!processing && !rewind.transcript ? (
        <Card style={styles.notes}>
          <Txt variant="headline">No words came through</Txt>
          <Txt variant="subhead" tone="secondary">
            {rewind.status === "failed"
              ? "The app was closed before your words were written out, and what the microphone heard live wasn't enough to keep. Check that the microphone isn't blocked or muted, and try again somewhere quieter."
              : "Nothing was picked up this time. Check that the microphone isn't blocked or muted, and try again somewhere quieter."}
          </Txt>
        </Card>
      ) : null}

      {!hasAudio && !processing && rewind.transcript ? (
        <Txt variant="footnote" tone="muted">
          No recording is kept for this one.{audioDays ? ` Audio is deleted after ${audioDays} days — the words and notes stay.` : ""}
        </Txt>
      ) : null}

      {hasAudio ? (
        <RewindPlayer
          uri={resolveRewindUri(rewind.audioFile!)}
          durationSeconds={rewind.durationSeconds}
          words={rewind.words}
          transcript={rewind.transcript}
          live={rewind.transcriptSource === "live"}
        />
      ) : null}

      {/* Whisper again also brings the word timings the player follows —
          for live-recognizer takes, and for takes from before timings were
          kept. */}
      {hasAudio && !processing && (rewind.transcriptSource === "live" || !rewind.words?.length) ? (
        <PrimaryButton label="Write it out again" variant="ghost" icon="refresh" onPress={again} loading={retrying} />
      ) : null}

      {!hasAudio && rewind.transcript ? (
        <Card style={styles.notes}>
          <Txt variant="headline" onPress={() => setShowText((s) => !s)} accessibilityRole="button">
            {showText ? "Hide what you said" : "Show what you said"}
          </Txt>
          {showText ? <Txt variant="callout">{rewind.transcript}</Txt> : null}
          {showText && rewind.transcriptSource === "live" ? (
            <Txt variant="caption1" tone="muted">
              Written as you spoke, so it may be rougher than usual.
            </Txt>
          ) : null}
        </Card>
      ) : null}

      <ListGroup>
        <ListRow icon="trash-outline" title="Delete or free up space" destructive onPress={confirmDelete} />
      </ListGroup>
    </Screen>
  );
}

function detailBreakdown(d: { numbers: number; times: number; names: number; senses: number }): string {
  const bits = [
    d.names ? `${d.names} ${d.names === 1 ? "name" : "names"}` : "",
    d.times ? `${d.times} ${d.times === 1 ? "time" : "times"}` : "",
    d.numbers ? `${d.numbers} ${d.numbers === 1 ? "number" : "numbers"}` : "",
    d.senses ? `${d.senses} sensory` : "",
  ].filter(Boolean);
  return bits.length ? bits.join(" · ") : "Names, times, numbers, what you saw or heard";
}

const useStyles = makeStyles((t) => ({
  content: { gap: t.space.lg },
  row: { flexDirection: "row", alignItems: "center", gap: t.space.md },
  hero: { gap: t.space.md },
  parts: { flexDirection: "row", gap: t.space.lg },
  part: { flexDirection: "row", alignItems: "center", gap: t.space.xs + 2 },
  notes: { gap: t.space.sm + 2 },
  note: { gap: 2 },
}));
