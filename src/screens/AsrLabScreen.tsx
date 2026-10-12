import { useEffect, useState } from "react";
import { ScrollView, TextInput, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../navigation";
import { ScreenContainer } from "../components/common/ScreenContainer";
import { Header } from "../components/common/Header";
import { Card } from "../components/common/Card";
import { Txt } from "../components/common/Txt";
import { Chip } from "../components/common/Chip";
import { PrimaryButton } from "../components/common/PrimaryButton";
import { SectionHeader } from "../components/common/SectionHeader";
import { getAllSessions } from "../services/db/sessionsRepo";
import { resolveVideoUri } from "../services/storage/videoStorage";
import { ASR_ENGINES, decodeForLab } from "../services/asr/asrEngines";
import { countFillers, fillerRetention, wordErrorRate } from "../domain/eval/wer";
import { logger } from "../utils/logger";
import { makeStyles, useTheme } from "../theme/ThemeProvider";
import type { Session } from "../domain/sessionTypes";

type Props = NativeStackScreenProps<RootStackParamList, "AsrLab">;

interface EngineRun {
  engine: string;
  text?: string;
  ms?: number;
  error?: string;
}

// Dev-only bench for choosing the default transcription engine from real
// numbers: same recording through every available engine, compared on word
// error rate, filler retention ("um"/"uh" kept?) and speed.
export function AsrLabScreen({ navigation }: Props) {
  const styles = useStyles();
  const { colors } = useTheme();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [selected, setSelected] = useState<Session | null>(null);
  const [reference, setReference] = useState("");
  const [runs, setRuns] = useState<EngineRun[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getAllSessions().then((all) => setSessions(all.filter((s) => !s.videoDeletedAt).slice(0, 12)));
  }, []);

  async function runAll() {
    if (!selected) return;
    setBusy(true);
    setRuns([]);
    const audio = await decodeForLab(resolveVideoUri(selected));
    if (!audio) {
      setRuns([{ engine: "decode", error: "Couldn't decode this recording's audio." }]);
      setBusy(false);
      return;
    }
    for (const engine of ASR_ENGINES) {
      if (!engine.isAvailable()) {
        setRuns((r) => [...r, { engine: engine.label, error: "Not available on this device" }]);
        continue;
      }
      const started = Date.now();
      try {
        const text = await engine.transcribe(audio);
        setRuns((r) => [...r, { engine: engine.label, text, ms: Date.now() - started }]);
        logger.info(`[asr-lab] ${engine.id}: ${Date.now() - started} ms, ${text.split(/\s+/).length} words, fillers=${countFillers(text)}`);
      } catch (error) {
        setRuns((r) => [...r, { engine: engine.label, error: (error as Error).message }]);
      }
    }
    setBusy(false);
  }

  return (
    <ScreenContainer style={styles.container}>
      <Header title="ASR Lab" eyebrow="Dev" onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={styles.content}>
        <SectionHeader title="Recording" />
        <View style={styles.chips}>
          {sessions.map((s) => (
            <Chip
              key={s.id}
              label={`${new Date(s.recordedAt).toLocaleDateString()} · ${s.durationSeconds}s`}
              selected={selected?.id === s.id}
              onPress={() => setSelected(s)}
            />
          ))}
        </View>

        <SectionHeader title="Reference transcript (optional, include ums)" />
        <TextInput
          value={reference}
          onChangeText={setReference}
          multiline
          placeholder="Type exactly what was said to score accuracy…"
          placeholderTextColor={colors.textMuted}
          style={styles.input}
        />

        <PrimaryButton label="Run every engine" onPress={runAll} loading={busy} disabled={!selected} />

        {runs.map((run) => {
          const wer = reference && run.text != null ? wordErrorRate(reference, run.text) : null;
          const keep = reference && run.text != null ? fillerRetention(reference, run.text) : null;
          return (
            <Card key={run.engine} style={styles.card}>
              <Txt variant="headline">{run.engine}</Txt>
              {run.error ? (
                <Txt variant="footnote" tone="danger">
                  {run.error}
                </Txt>
              ) : (
                <>
                  <Txt variant="footnote" tone="secondary">
                    {run.ms} ms · fillers kept {countFillers(run.text ?? "")}
                    {wer != null ? ` · WER ${(wer * 100).toFixed(1)}%` : ""}
                    {keep != null ? ` · filler retention ${Math.round(keep * 100)}%` : ""}
                  </Txt>
                  <Txt variant="subhead">{run.text || "(empty)"}</Txt>
                </>
              )}
            </Card>
          );
        })}

        {runs.length > 0 ? (
          <Txt variant="caption1" tone="muted">
            Results are also written to the Dev log, so “Share logs” captures them.
          </Txt>
        ) : null}
      </ScrollView>
    </ScreenContainer>
  );
}

const useStyles = makeStyles((t) => ({
  container: { gap: t.space.md },
  content: { gap: t.space.md, paddingBottom: t.space.xl },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: t.space.sm },
  input: {
    minHeight: 90,
    padding: t.space.md,
    borderRadius: t.radius.md,
    backgroundColor: t.colors.surfaceRaised,
    color: t.colors.textPrimary,
    textAlignVertical: "top",
    ...t.type.subhead,
  },
  card: { gap: t.space.xs },
}));
