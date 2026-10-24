import { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import * as Speech from "expo-speech";
import { Screen } from "../../components/common/Screen";
import { Card } from "../../components/common/Card";
import { Chip } from "../../components/common/Chip";
import { PrimaryButton } from "../../components/common/PrimaryButton";
import { Txt } from "../../components/common/Txt";
import { useToast } from "../../components/common/ToastProvider";
import { Mono } from "../../components/dev/Mono";
import { assignPartnerVoices } from "../../domain/conversation/voices";
import { LAB_EXTRA_VOICES, PARTNER_VOICES, SPEED_STEPS } from "../../domain/conversation/live/voices";
import { addRun, LAB_HISTORY_KEY, LAB_LINES, LAB_RATINGS_KEY, LAB_TURN, labTable, type LabRun } from "../../domain/dev/partnerVoiceLab";
import { converse, newConversationId } from "../../services/conversation/converseClient";
import { PartnerLinePlayer, setPartnerSession, type PartnerSession } from "../../services/conversation/partnerAudio";
import { getDevJson, setDevJson } from "../../services/dev/devStore";
import { copyJson } from "../../utils/shareJson";
import { makeStyles } from "../../theme/ThemeProvider";

// Dev → Partner voices: hear the live conversation's candidate voices on the
// phone, at the speeds the app offers, on the speaker or AirPods, next to the
// phone's own voice; time each line (to the words, to the first sound); time
// whole partner turns (the line written, then spoken); rate each voice. The
// table and the export are what the device test plan (K) asks for.
//
// Every play is a real Tono AI call: it uses conversation minutes (a few
// seconds each) on the account this phone has.

const ALL_VOICES = [...PARTNER_VOICES, ...LAB_EXTRA_VOICES];
const DEVICE = "Phone's own voice";

export function PartnerVoicesLabScreen() {
  const styles = useStyles();
  const showToast = useToast();
  const [voice, setVoice] = useState(ALL_VOICES[0].id);
  const [lineIndex, setLineIndex] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [session, setSession] = useState<PartnerSession>("conversation");
  const [history, setHistory] = useState<LabRun[]>(() => getDevJson<LabRun[]>(LAB_HISTORY_KEY, []));
  const [ratings, setRatings] = useState<Record<string, number>>(() => getDevJson<Record<string, number>>(LAB_RATINGS_KEY, {}));
  const [busy, setBusy] = useState(false);
  const [last, setLast] = useState<LabRun | null>(null);
  const playerRef = useRef<PartnerLinePlayer | null>(null);

  useEffect(() => {
    setPartnerSession(session);
  }, [session]);

  useEffect(
    () => () => {
      playerRef.current?.stop();
      Speech.stop();
      setPartnerSession("conversation");
    },
    [],
  );

  function save(run: LabRun) {
    setLast(run);
    setHistory((prev) => {
      const next = addRun(prev, run);
      setDevJson(LAB_HISTORY_KEY, next);
      return next;
    });
  }

  async function playServer(kind: "speak" | "turn") {
    if (busy) return;
    setBusy(true);
    playerRef.current?.stop();
    const line = LAB_LINES[lineIndex];
    const sentAt = Date.now();
    const run: LabRun = {
      at: new Date().toISOString(),
      kind,
      voice,
      speed,
      session,
      line: kind === "speak" ? line.text : "(partner turn)",
      toLineMs: null,
      toFirstSoundMs: null,
      totalMs: null,
      server: null,
      audioSeconds: null,
      streamed: null,
    };
    let player: PartnerLinePlayer | null = null;
    try {
      await new Promise<void>((resolve, reject) => {
        let finished = false;
        const end = () => {
          if (finished) return;
          finished = true;
          run.totalMs = Date.now() - sentAt;
          resolve();
        };
        converse(
          kind === "speak"
            ? { op: "speak", conversationId: newConversationId(), voice, text: line.text, mood: line.mood }
            : { op: "turn", conversationId: newConversationId(), voice, ...LAB_TURN },
          {
            onEvent: (event) => {
              if (event.type === "line") {
                run.toLineMs = Date.now() - sentAt;
                if (kind === "turn") run.line = event.line;
                player = new PartnerLinePlayer(speed, {
                  onStart: () => {
                    run.toFirstSoundMs = Date.now() - sentAt;
                  },
                  onEnd: end,
                });
                playerRef.current = player;
              } else if (event.type === "audio") {
                player?.push(event.pcm);
              } else if (event.type === "done") {
                run.server = { llmMs: event.timing.llmMs, ttsFirstAudioMs: event.timing.ttsFirstAudioMs, totalMs: event.timing.totalMs };
                run.audioSeconds = event.voice?.seconds ?? null;
                run.streamed = event.voice?.streamed ?? null;
                if (event.voice && player) player.finish();
                else {
                  run.error = event.noVoice ?? "no voice";
                  end();
                }
              } else if (event.type === "error") {
                run.error = event.code;
              }
            },
          },
        ).catch(reject);
      });
    } catch (error) {
      run.error = (error as Error)?.message ?? String(error);
      showToast(`Failed: ${run.error}`, "error");
    } finally {
      save(run);
      setBusy(false);
    }
  }

  async function playDevice() {
    if (busy) return;
    setBusy(true);
    const line = LAB_LINES[lineIndex];
    const sentAt = Date.now();
    const run: LabRun = {
      at: new Date().toISOString(),
      kind: "device",
      voice: DEVICE,
      speed,
      session,
      line: line.text,
      toLineMs: 0,
      toFirstSoundMs: null,
      totalMs: null,
      server: null,
      audioSeconds: null,
      streamed: null,
    };
    try {
      const voices = await Speech.getAvailableVoicesAsync().catch(() => []);
      const style = assignPartnerVoices(voices).a;
      await new Promise<void>((resolve) => {
        Speech.speak(line.text, {
          voice: style.voice,
          rate: speed,
          onStart: () => {
            run.toFirstSoundMs = Date.now() - sentAt;
          },
          onDone: () => resolve(),
          onError: () => resolve(),
          onStopped: () => resolve(),
        });
      });
      run.totalMs = Date.now() - sentAt;
    } finally {
      save(run);
      setBusy(false);
    }
  }

  function rate(v: string, stars: number) {
    setRatings((prev) => {
      const next = { ...prev, [v]: stars };
      setDevJson(LAB_RATINGS_KEY, next);
      return next;
    });
  }

  async function exportAll() {
    const ok = await copyJson({ exportedAt: new Date().toISOString(), table: labTable(history, ratings), ratings, runs: history });
    showToast(ok ? "Copied the lab's results" : "Couldn't copy", ok ? "success" : "error");
  }

  function clear() {
    setHistory([]);
    setDevJson(LAB_HISTORY_KEY, []);
  }

  const table = labTable(history, ratings);
  const ms = (v: number | null | undefined) => (v == null ? "-" : `${Math.round(v)} ms`);

  return (
    <Screen eyebrow="Dev" title="Partner voices">
      <Card style={styles.card}>
        <Txt variant="footnote" tone="secondary">
          Each play is a real Tono AI call and uses a few seconds of conversation minutes. Try the speaker and AirPods. Pass: a voice you'd happily hear for ten
          minutes, first sound under 1 s for a line, and a partner turn under 2.5 s (median).
        </Txt>
      </Card>

      <Card style={styles.card}>
        <Txt variant="caption1" weight="700">
          Voice
        </Txt>
        <View style={styles.chips}>
          {ALL_VOICES.map((v) => (
            <Chip key={v.id} label={`${v.id} · ${v.description}`} selected={voice === v.id} onPress={() => setVoice(v.id)} />
          ))}
        </View>
        <Txt variant="caption1" weight="700">
          Line
        </Txt>
        <View style={styles.chips}>
          {LAB_LINES.map((l, i) => (
            <Chip key={l.mood} label={l.mood} selected={lineIndex === i} onPress={() => setLineIndex(i)} />
          ))}
        </View>
        <Txt variant="footnote" tone="secondary">
          {LAB_LINES[lineIndex].text}
        </Txt>
        <Txt variant="caption1" weight="700">
          Speed
        </Txt>
        <View style={styles.chips}>
          {SPEED_STEPS.map((s) => (
            <Chip key={s} label={`${s}×`} selected={speed === s} onPress={() => setSpeed(s)} />
          ))}
        </View>
        <Txt variant="caption1" weight="700">
          iPhone audio session
        </Txt>
        <View style={styles.chips}>
          <Chip label="Conversation (record + play)" selected={session === "conversation"} onPress={() => setSession("conversation")} />
          <Chip label="Playback only" selected={session === "playback"} onPress={() => setSession("playback")} />
        </View>
      </Card>

      <View style={styles.row}>
        <PrimaryButton label="Play line" onPress={() => playServer("speak")} loading={busy} style={styles.flex} />
        <PrimaryButton label="Partner turn" variant="secondary" onPress={() => playServer("turn")} disabled={busy} style={styles.flex} />
      </View>
      <PrimaryButton label="Same line, phone's own voice" variant="ghost" onPress={playDevice} disabled={busy} />

      {last ? (
        <Card style={styles.card}>
          <Txt variant="caption1" weight="700">
            Last play
          </Txt>
          <Mono>
            {[
              `${last.kind} · ${last.voice} · ${last.speed}× · ${last.session}`,
              `words ${ms(last.toLineMs)} · first sound ${ms(last.toFirstSoundMs)} · total ${ms(last.totalMs)}`,
              `server: llm ${ms(last.server?.llmMs)} · tts first audio ${ms(last.server?.ttsFirstAudioMs)} · total ${ms(last.server?.totalMs)}`,
              `audio ${last.audioSeconds ?? "-"} s · streamed ${last.streamed ?? "-"}${last.error ? ` · error ${last.error}` : ""}`,
              last.line,
            ].join("\n")}
          </Mono>
        </Card>
      ) : null}

      <Card style={styles.card}>
        <Txt variant="caption1" weight="700">
          Your ratings (would you listen for ten minutes?)
        </Txt>
        <View style={styles.chips}>
          {[1, 2, 3, 4, 5].map((n) => (
            <Chip key={n} label={`${voice}: ${n}`} selected={ratings[voice] === n} onPress={() => rate(voice, n)} />
          ))}
        </View>
        <Mono>
          {table.length
            ? table
                .map((r) => `${r.voice.padEnd(16)} ${String(r.rating ?? "-").padEnd(2)} line ${ms(r.firstSoundMedianMs)} (p90 ${ms(r.firstSoundP90Ms)}) · turn ${ms(r.turnFirstSoundMedianMs)} · ${r.runs} runs`)
                .join("\n")
            : "No runs yet."}
        </Mono>
      </Card>

      <View style={styles.row}>
        <PrimaryButton label="Copy results" variant="secondary" onPress={exportAll} style={styles.flex} />
        <PrimaryButton label="Clear runs" variant="ghost" onPress={clear} style={styles.flex} />
      </View>
    </Screen>
  );
}

const useStyles = makeStyles((t) => ({
  card: { gap: t.space.sm },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: t.space.xs },
  row: { flexDirection: "row", gap: t.space.sm },
  flex: { flex: 1 },
}));
