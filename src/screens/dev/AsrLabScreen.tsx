import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, Share, TextInput, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../../navigation";
import { Screen } from "../../components/common/Screen";
import { Card } from "../../components/common/Card";
import { Chip } from "../../components/common/Chip";
import { IconButton } from "../../components/common/IconButton";
import { ListGroup, ListRow } from "../../components/common/ListRow";
import { PrimaryButton } from "../../components/common/PrimaryButton";
import { Txt } from "../../components/common/Txt";
import { Mono } from "../../components/dev/Mono";
import { getAllSessions } from "../../services/db/sessionsRepo";
import { resolveVideoUri } from "../../services/storage/videoStorage";
import { ASR_ENGINES, decodeForLab, type AsrEngine, type AsrOutput } from "../../services/asr/asrEngines";
import { WHISPER_MODELS, cancelDownload, deleteModel, downloadedModelBytes, formatModelSize, formatSpeed, getDownloadState, isModelDownloaded, pauseDownload, startDownload, subscribeDownloads, type WhisperModelId } from "../../services/asr/whisperModels";
import { releaseWhisperContext } from "../../services/asr/whisperRn";
import { ASR_HISTORY_KEY as HISTORY_KEY, ASR_REFERENCES_KEY as REFERENCES_KEY, getDevJson, setDevJson } from "../../services/dev/devStore";
import { historyToCsv, summarizeHistory, upsertRun, type AsrRunRecord } from "../../domain/dev/asrHistory";
import { countFillers, fillerRetention, matchFillers, wordErrorRate } from "../../domain/eval/wer";
import { describeTranscriptProblems, findTranscriptProblems } from "../../domain/asr/transcriptSanity";
import { getArtifact } from "../../services/db/artifactsRepo";
import type { CloudTranscriptArtifact } from "../../services/pipeline/steps/cloudReviewStep";
import type { DecodedAudio } from "../../domain/audioAnalysis";
import type { Session } from "../../domain/sessionTypes";
import { logger } from "../../utils/logger";
import { copyJson, exportFileName, shareJsonFile } from "../../utils/shareJson";
import { buildAsrExport } from "../../domain/dev/exportData";
import { exportContext } from "../../services/dev/devInfo";
import { beginRun } from "../../services/dev/deviceMetrics";
import { describeRun, type MetricRun } from "../../domain/dev/metrics";
import { makeStyles, useTheme } from "../../theme/ThemeProvider";

type Props = NativeStackScreenProps<RootStackParamList, "AsrLab">;


interface EngineRun {
  status: "running" | "done" | "error";
  text?: string;
  ms?: number;
  words?: AsrOutput["words"];
  error?: string;
  // Peak memory and CPU while it ran (dev builds with the metrics module).
  device?: MetricRun | null;
}

const pctText = (n: number | null | undefined) => (n === null || n === undefined ? "n/a" : Math.round(n * 100) + "%");

// The take's stored deep-review transcript joins the comparison under this id.
const DEEP_REVIEW_ID = "deep-review";

// The dev bench for choosing the transcription engine from real numbers: the
// same recording through every engine, scored against a reference you type,
// then averaged across takes. Models are downloaded here on demand.
export function AsrLabScreen({ navigation }: Props) {
  const styles = useStyles();
  const { colors } = useTheme();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [selected, setSelected] = useState<Session | null>(null);
  const [reference, setReference] = useState("");
  const [runs, setRuns] = useState<Record<string, EngineRun>>({});
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState<AsrRunRecord[]>(() => getDevJson<AsrRunRecord[]>(HISTORY_KEY, []));
  const [, setModelTick] = useState(0);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [deepReview, setDeepReview] = useState<CloudTranscriptArtifact | null>(null);
  const audio = useRef<{ sessionId: string; decoded: DecodedAudio } | null>(null);

  useEffect(() => {
    getAllSessions().then((all) => setSessions(all.filter((s) => !s.videoDeletedAt).slice(0, 12)));
    return () => {
      releaseWhisperContext().catch(() => undefined);
    };
  }, []);
  // Downloads run in the background and outlive this screen: just redraw.
  useEffect(() => subscribeDownloads(() => setModelTick((n) => n + 1)), []);

  function selectSession(session: Session) {
    setSelected(session);
    setRuns({});
    setExpanded(null);
    setReference(getDevJson<Record<string, string>>(REFERENCES_KEY, {})[session.id] ?? "");
    setDeepReview(null);
    getArtifact<CloudTranscriptArtifact>(session.id, "cloud_transcript")
      .then((stored) => setDeepReview(stored?.verbatim ? stored : null))
      .catch(() => setDeepReview(null));
  }

  // Only a review that transcribed the audio itself says anything about
  // what the model heard; older Gemini ones copied the phone transcript.
  const reviewHeardAudio = !!deepReview && (deepReview.heardAudio === true || (deepReview.provider !== undefined && deepReview.provider !== "gemini"));

  function saveRecord(record: AsrRunRecord) {
    setHistory((h) => {
      const next = upsertRun(h, record);
      setDevJson(HISTORY_KEY, next);
      return next;
    });
  }

  function addDeepReviewToComparison() {
    const typed = reference.trim();
    if (!selected || !deepReview || !typed) return;
    saveRecord({
      sessionId: selected.id,
      engineId: DEEP_REVIEW_ID,
      at: new Date().toISOString(),
      audioSeconds: selected.durationSeconds,
      ms: 0,
      words: deepReview.verbatim.split(/\s+/).filter(Boolean).length,
      wer: wordErrorRate(typed, deepReview.verbatim),
      fillerRetention: fillerRetention(typed, deepReview.verbatim),
      fillers: countFillers(deepReview.verbatim),
      inventedFillers: matchFillers(typed, deepReview.verbatim).invented,
    });
  }

  function changeReference(text: string) {
    setReference(text);
    if (selected) setDevJson(REFERENCES_KEY, { ...getDevJson<Record<string, string>>(REFERENCES_KEY, {}), [selected.id]: text });
  }

  function confirmDelete(id: WhisperModelId, label: string) {
    Alert.alert("Delete " + label + "?", "It can be downloaded again.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          await releaseWhisperContext();
          await cancelDownload(id);
          deleteModel(id);
          setModelTick((n) => n + 1);
        },
      },
    ]);
  }

  const ensureAudio = useCallback(async (session: Session): Promise<DecodedAudio | null> => {
    if (audio.current?.sessionId === session.id) return audio.current.decoded;
    const decoded = await decodeForLab(resolveVideoUri(session));
    if (decoded) audio.current = { sessionId: session.id, decoded };
    return decoded;
  }, []);

  async function runEngines(engines: AsrEngine[]) {
    if (!selected || engines.length === 0) return;
    setBusy(true);
    const decoded = await ensureAudio(selected);
    if (!decoded) {
      Alert.alert("Couldn't decode", "This recording's audio couldn't be decoded.");
      setBusy(false);
      return;
    }
    const audioSeconds = decoded.waveform.length / decoded.sampleRate;
    const typed = reference.trim();
    for (const engine of engines) {
      setRuns((r) => ({ ...r, [engine.id]: { status: "running" } }));
      const started = Date.now();
      const metrics = beginRun("asr", engine.label, { sessionId: selected.id, detail: { engine: engine.id, audioSeconds: Math.round(audioSeconds) } });
      try {
        const out = await engine.transcribe(decoded);
        const ms = Date.now() - started;
        const device = metrics.end({ ok: true });
        setRuns((r) => ({ ...r, [engine.id]: { status: "done", text: out.text, ms, words: out.words, device } }));
        logger.info("[asr-lab] " + engine.id + ": " + ms + " ms, " + out.text.split(/\s+/).length + " words, fillers=" + countFillers(out.text));
        if (typed) {
          const record: AsrRunRecord = {
            sessionId: selected.id,
            engineId: engine.id,
            at: new Date().toISOString(),
            audioSeconds,
            ms,
            words: out.text.split(/\s+/).filter(Boolean).length,
            wer: wordErrorRate(typed, out.text),
            fillerRetention: fillerRetention(typed, out.text),
            fillers: countFillers(out.text),
            inventedFillers: matchFillers(typed, out.text).invented,
          };
          saveRecord(record);
        }
      } catch (error) {
        metrics.end({ ok: false });
        setRuns((r) => ({ ...r, [engine.id]: { status: "error", error: (error as Error).message } }));
      }
    }
    setBusy(false);
  }

  // Everything on screen as JSON: the reference, what each engine heard, the
  // scores, the cross-take averages and the saved history.
  function asrExport() {
    const decoded = audio.current;
    return buildAsrExport({
      context: exportContext(),
      take: selected && decoded ? { sessionId: selected.id, recordedAt: selected.recordedAt, audioSeconds: decoded.decoded.waveform.length / decoded.decoded.sampleRate } : null,
      reference,
      runs: ASR_ENGINES.filter((e) => runs[e.id]).map((e) => ({
        id: e.id,
        label: e.label,
        model: e.model,
        status: runs[e.id].status,
        text: runs[e.id].text,
        ms: runs[e.id].ms,
        words: runs[e.id].words,
        error: runs[e.id].error,
        device: runs[e.id].device,
      })),
      deepReview: deepReview
        ? { provider: deepReview.provider ?? "gemini", model: deepReview.model ?? null, heardAudio: reviewHeardAudio, text: deepReview.verbatim }
        : null,
      history,
      models: WHISPER_MODELS.map((m) => ({ id: m.id, label: m.label, bytes: m.bytes, license: m.license, downloaded: isModelDownloaded(m.id) })),
    });
  }

  async function exportResults(how: "copy" | "share") {
    try {
      const data = asrExport();
      if (how === "copy") {
        if (await copyJson(data)) Alert.alert("Copied", "The results JSON is on the clipboard.");
      } else {
        await shareJsonFile(exportFileName("asr-lab"), data);
      }
    } catch (error) {
      Alert.alert("Couldn't export", (error as Error).message);
    }
  }

  const available = ASR_ENGINES.filter((e) => e.isAvailable());
  const summary = useMemo(() => summarizeHistory(history), [history]);
  const labelFor = (id: string) => (id === DEEP_REVIEW_ID ? "Deep review (AI)" : ASR_ENGINES.find((e) => e.id === id)?.label ?? id);
  const typed = reference.trim();

  return (
    <Screen title="ASR Lab" eyebrow="Dev" onBack={navigation.goBack}>
      <ListGroup title="Models">
        {WHISPER_MODELS.map((model) => {
          const have = isModelDownloaded(model.id);
          const dl = getDownloadState(model.id);
          const percent = Math.round((dl?.progress ?? 0) * 100);
          const secondsLeft = dl?.status === "downloading" && dl.bytesPerSecond > 0 ? (model.bytes * (1 - dl.progress)) / dl.bytesPerSecond : 0;
          const size = formatModelSize(have ? downloadedModelBytes(model.id) || model.bytes : model.bytes) + " · " + model.license;
          let detail = model.note;
          if (!have && dl?.status === "downloading") {
            detail = percent + "% at " + formatSpeed(dl.bytesPerSecond) + (secondsLeft > 0 ? ", about " + formatEta(secondsLeft) + " left" : "") + ". Keeps going if you leave this screen.";
          } else if (!have && dl?.status === "paused") {
            detail = "Paused at " + percent + "%. Resume picks up where it stopped.";
          } else if (!have && dl?.status === "failed") {
            detail = "Failed: " + dl.error;
          }
          return (
            <ListRow
              key={model.id}
              title={model.label}
              subtitle={size + " · " + detail}
              right={
                have ? (
                  <IconButton icon="trash-outline" variant="plain" size={36} accessibilityLabel={"Delete " + model.label} onPress={() => confirmDelete(model.id, model.label)} />
                ) : dl?.status === "downloading" ? (
                  <View style={styles.progress}>
                    <Mono>{percent + "%"}</Mono>
                    <IconButton icon="pause" variant="plain" size={32} accessibilityLabel="Pause download" onPress={() => pauseDownload(model.id).catch(() => undefined)} />
                  </View>
                ) : dl ? (
                  <View style={styles.progress}>
                    <IconButton icon={dl.status === "failed" ? "refresh" : "play"} variant="plain" size={36} accessibilityLabel="Resume download" onPress={() => startDownload(model.id)} />
                    <IconButton icon="close" variant="plain" size={32} accessibilityLabel="Discard the partial download" onPress={() => cancelDownload(model.id)} />
                  </View>
                ) : (
                  <IconButton icon="download-outline" variant="plain" size={36} accessibilityLabel={"Download " + model.label} onPress={() => startDownload(model.id)} />
                )
              }
            />
          );
        })}
      </ListGroup>
      <Txt variant="caption1" tone="muted">
        Download over Wi-Fi. Models live in the app documents folder until deleted.
      </Txt>

      <View style={styles.section}>
        <Txt variant="footnote" weight="500" tone="secondary">
          Take
        </Txt>
        <View style={styles.chips}>
          {sessions.map((s) => (
            <Chip key={s.id} label={new Date(s.recordedAt).toLocaleDateString() + " · " + Math.round(s.durationSeconds) + "s"} selected={selected?.id === s.id} onPress={() => selectSession(s)} />
          ))}
        </View>
      </View>

      <View style={styles.section}>
        <Txt variant="footnote" weight="500" tone="secondary">
          Reference transcript (type exactly what was said, ums included)
        </Txt>
        <TextInput
          value={reference}
          onChangeText={changeReference}
          multiline
          placeholder="Needed to score accuracy and filler retention"
          placeholderTextColor={colors.textMuted}
          style={styles.input}
        />
      </View>

      <PrimaryButton
        label={"Run " + available.length + " engine" + (available.length === 1 ? "" : "s")}
        onPress={() => runEngines(available)}
        loading={busy}
        disabled={!selected || available.length === 0}
      />
      {selected && !typed ? (
        <Txt variant="caption1" tone="muted">
          Without a reference, runs are shown but not scored or saved to the comparison.
        </Txt>
      ) : null}

      <ListGroup title="Engines">
        {ASR_ENGINES.map((engine) => {
          const run = runs[engine.id];
          const ok = engine.isAvailable();
          return (
            <ListRow
              key={engine.id}
              title={engine.label}
              subtitle={ok ? (run?.status === "running" ? "Running..." : run?.status === "done" ? (run.device?.measured ? describeRun(run.device) : (run.ms ?? 0) / 1000 + " s") : "Ready") : engine.model ? "Download the model first" : "Not available on this device"}
              right={<IconButton icon="play" variant="plain" size={36} disabled={!ok || !selected || busy} accessibilityLabel={"Run " + engine.label} onPress={() => runEngines([engine])} />}
            />
          );
        })}
      </ListGroup>

      {ASR_ENGINES.filter((e) => runs[e.id]).map((engine) => {
        const run = runs[engine.id];
        const wer = typed && run.text != null ? wordErrorRate(typed, run.text) : null;
        const keep = typed && run.text != null ? fillerRetention(typed, run.text) : null;
        const invented = typed && run.text != null ? matchFillers(typed, run.text).invented : 0;
        const open = expanded === engine.id;
        const lastWord = run.words?.length ? run.words[run.words.length - 1] : null;
        const audioSeconds = audio.current ? audio.current.decoded.waveform.length / audio.current.decoded.sampleRate : 0;
        const problems = run.status === "done" ? describeTranscriptProblems(findTranscriptProblems({ text: run.text ?? "", words: run.words, audioSeconds })) : null;
        return (
          <Card key={engine.id} style={styles.result} onPress={() => setExpanded(open ? null : engine.id)} accessibilityLabel={engine.label}>
            <Txt variant="headline">{engine.label}</Txt>
            {run.status === "running" ? (
              <Mono tone="secondary">Running...</Mono>
            ) : run.status === "error" ? (
              <Mono tone="danger" selectable>
                {run.error}
              </Mono>
            ) : (
              <>
                <Mono tone="secondary">
                  {(run.ms ?? 0) / 1000 + " s · fillers " + countFillers(run.text ?? "") + (wer != null ? " · WER " + (wer * 100).toFixed(1) + "%" : "") + (keep != null ? " · kept " + pctText(keep) : "") + (invented > 0 ? " · invented " + invented : "")}
                </Mono>
                {problems ? (
                  <Txt variant="footnote" tone="danger">
                    {problems}
                  </Txt>
                ) : null}
                {run.words ? (
                  <Mono variant="caption2" tone="muted">
                    {run.words.length + " timed words" + (lastWord ? ", last ends at " + (lastWord.endMs / 1000).toFixed(1) + " s of " + audioSeconds.toFixed(1) + " s" : "")}
                  </Mono>
                ) : null}
                <Txt variant="subhead" numberOfLines={open ? undefined : 3} selectable={open}>
                  {run.text || "(empty)"}
                </Txt>
              </>
            )}
          </Card>
        );
      })}

      {deepReview ? (
        <Card style={styles.result} onPress={() => setExpanded(expanded === DEEP_REVIEW_ID ? null : DEEP_REVIEW_ID)} accessibilityLabel="Deep review transcript">
          <View style={styles.sectionHead}>
            <Txt variant="headline" style={styles.engineCol}>
              {"Deep review (" + (deepReview.model ?? deepReview.provider ?? "AI") + ")"}
            </Txt>
            {typed && reviewHeardAudio ? (
              <IconButton icon="add" variant="plain" size={32} accessibilityLabel="Add the deep review to the comparison" onPress={addDeepReviewToComparison} />
            ) : null}
          </View>
          <Mono tone="secondary">
            {"stored · fillers " +
              countFillers(deepReview.verbatim) +
              (typed ? " · WER " + (wordErrorRate(typed, deepReview.verbatim) * 100).toFixed(1) + "% · kept " + pctText(fillerRetention(typed, deepReview.verbatim)) : "") +
              (typed && matchFillers(typed, deepReview.verbatim).invented > 0 ? " · invented " + matchFillers(typed, deepReview.verbatim).invented : "")}
          </Mono>
          {!reviewHeardAudio ? (
            <Txt variant="footnote" tone="danger">
              Made while Gemini was given the phone transcript, so it copied it. Re-run the deep review (Dev, Pipeline) to see what Gemini hears.
            </Txt>
          ) : null}
          <Txt variant="subhead" numberOfLines={expanded === DEEP_REVIEW_ID ? undefined : 3} selectable={expanded === DEEP_REVIEW_ID}>
            {deepReview.verbatim}
          </Txt>
        </Card>
      ) : null}

      <ListGroup title="Export">
        <ListRow
          icon="copy-outline"
          title="Copy results as JSON"
          subtitle="The reference, what each engine heard, scores, and the across-takes history"
          onPress={() => exportResults("copy")}
        />
        <ListRow icon="share-outline" title="Share results as a file" onPress={() => exportResults("share")} />
      </ListGroup>

      <View style={styles.section}>
        <View style={styles.sectionHead}>
          <Txt variant="title2">Across takes</Txt>
          {history.length > 0 ? (
            <View style={styles.sectionActions}>
              <IconButton icon="share-outline" size={36} accessibilityLabel="Share as CSV" onPress={() => Share.share({ message: historyToCsv(history) }).catch(() => undefined)} />
              <IconButton
                icon="trash-outline"
                size={36}
                accessibilityLabel="Clear comparison"
                onPress={() =>
                  Alert.alert("Clear the comparison?", "All saved scored runs are deleted.", [
                    { text: "Cancel", style: "cancel" },
                    {
                      text: "Clear",
                      style: "destructive",
                      onPress: () => {
                        setHistory([]);
                        setDevJson(HISTORY_KEY, []);
                      },
                    },
                  ])
                }
              />
            </View>
          ) : null}
        </View>
        {summary.length === 0 ? (
          <Txt variant="subhead" tone="muted">
            Run engines on a take with a reference transcript. Each scored run is saved here and averaged per engine.
          </Txt>
        ) : (
          <Card style={styles.table}>
            <View style={styles.row}>
              <Mono variant="caption2" tone="muted" style={styles.engineCol}>
                engine
              </Mono>
              <Mono variant="caption2" tone="muted" style={styles.num}>
                takes
              </Mono>
              <Mono variant="caption2" tone="muted" style={styles.num}>
                WER
              </Mono>
              <Mono variant="caption2" tone="muted" style={styles.num}>
                fillers
              </Mono>
              <Mono variant="caption2" tone="muted" style={styles.num}>
                speed
              </Mono>
            </View>
            {summary.map((s) => (
              <View key={s.engineId} style={styles.row}>
                <Txt variant="footnote" style={styles.engineCol} numberOfLines={2}>
                  {labelFor(s.engineId)}
                </Txt>
                <Mono style={styles.num}>{String(s.takes)}</Mono>
                <Mono style={styles.num}>{(s.avgWer * 100).toFixed(1) + "%"}</Mono>
                <Mono style={styles.num}>{pctText(s.avgFillerRetention)}</Mono>
                <Mono style={styles.num}>{s.avgRealtimeFactor === null ? "n/a" : s.avgRealtimeFactor.toFixed(2) + "x"}</Mono>
              </View>
            ))}
            <Txt variant="caption1" tone="muted">
              WER: lower is better. Fillers: share of your ums and uhs kept in the right place (ones an engine invents do not count). Speed: processing time over audio length, so under 1x is faster than real time.
            </Txt>
          </Card>
        )}
      </View>
    </Screen>
  );
}

const useStyles = makeStyles((t) => ({
  section: { gap: t.space.sm },
  sectionHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  sectionActions: { flexDirection: "row", gap: t.space.xs },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: t.space.sm },
  input: {
    minHeight: 96,
    padding: t.space.md,
    borderRadius: t.radius.md,
    backgroundColor: t.colors.surfaceRaised,
    color: t.colors.textPrimary,
    textAlignVertical: "top",
    ...t.type.subhead,
  },
  progress: { flexDirection: "row", alignItems: "center", gap: t.space.xs },
  result: { gap: t.space.xs },
  table: { gap: t.space.sm },
  row: { flexDirection: "row", alignItems: "center", gap: t.space.xs },
  engineCol: { flex: 1 },
  num: { width: 52, textAlign: "right" },
}));

function formatEta(seconds: number): string {
  if (seconds < 90) return Math.round(seconds) + " s";
  if (seconds < 5400) return Math.round(seconds / 60) + " min";
  return (seconds / 3600).toFixed(1) + " h";
}
