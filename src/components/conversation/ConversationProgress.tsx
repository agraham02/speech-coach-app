import { useCallback, useState } from "react";
import { View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { Card } from "../common/Card";
import { Txt } from "../common/Txt";
import { StatTile } from "../common/StatTile";
import { MetricChart } from "../common/MetricChart";
import { getConversationAttemptSummaries } from "../../services/db/progressRepo";
import { getPredictionPairs } from "../../services/db/socialRepo";
import { predictionMessage, summarizePredictions, type PredictionSummary } from "../../domain/conversation/realWorld";
import type { AttemptSummary } from "../../domain/conversation/attemptMetrics";
import { makeStyles, useTheme } from "../../theme/ThemeProvider";

// Conversation on Progress: where your attention goes, and predicted vs
// actual awkwardness — the two things this skill is really trying to move.
// Reply time is shown, but framed as ease, not speed.
export function ConversationProgress() {
  const styles = useStyles();
  const { colors } = useTheme();
  const c = colors.skill.conversation;
  const [attempts, setAttempts] = useState<AttemptSummary[]>([]);
  const [predictions, setPredictions] = useState<PredictionSummary | null>(null);
  const [actualSeries, setActualSeries] = useState<number[]>([]);

  useFocusEffect(
    useCallback(() => {
      getConversationAttemptSummaries(60).then(setAttempts).catch(() => setAttempts([]));
      getPredictionPairs(30)
        .then((pairs) => {
          setPredictions(summarizePredictions(pairs));
          setActualSeries(pairs.map((p) => p.actual));
        })
        .catch(() => setPredictions(summarizePredictions([])));
    }, []),
  );

  const selfFocus = attempts.map((a) => a.selfFocusAfter).filter((v): v is number => v != null);
  const latency = attempts.map((a) => (a.latencyMs != null ? Math.round(a.latencyMs / 100) / 10 : null)).filter((v): v is number => v != null);
  const askedFlags = attempts.map((a) => a.asked).filter((v): v is boolean => v != null);
  const askedShare = askedFlags.length ? Math.round((askedFlags.filter(Boolean).length / askedFlags.length) * 100) : null;

  return (
    <>
      <Card style={styles.card}>
        <Txt variant="headline">Predicted vs actual</Txt>
        {predictions && predictions.count > 0 ? (
          <View style={styles.row}>
            <StatTile value={`${predictions.avgPredicted}`} label="expected awkward" />
            <StatTile value={`${predictions.avgActual}`} label="actually awkward" color={c.fg} />
            <StatTile value={`${predictions.count}`} label="debriefs" />
          </View>
        ) : null}
        <Txt variant="footnote" tone="secondary">
          {predictions ? predictionMessage(predictions) : ""}
        </Txt>
        {actualSeries.length >= 2 ? <MetricChart title="How awkward it actually was" values={actualSeries} maxValue={10} color={c.fg} /> : null}
      </Card>

      <Card style={styles.card}>
        <MetricChart
          title="Attention on yourself"
          values={selfFocus}
          maxValue={10}
          color={c.fg}
          emptyText="Rate your attention after a few conversation drills to see it shift."
        />
        <Txt variant="footnote" tone="secondary">
          0 is all on them, 10 is all on you. Lower over time means more of you is free to listen.
        </Txt>
      </Card>

      <Card style={styles.card}>
        <MetricChart title="Time to reply" values={latency} unit="s" color={c.fg} emptyText="Do a few conversation drills to see this." />
        <Txt variant="footnote" tone="secondary">
          Not a race — a pause is fine. A shorter wait just means the words are coming more easily.
        </Txt>
        {askedShare != null ? (
          <Txt variant="footnote" tone="secondary">
            You asked a question in {askedShare}% of the drills that look for one.
          </Txt>
        ) : null}
      </Card>
    </>
  );
}

const useStyles = makeStyles((t) => ({
  card: { gap: t.space.md },
  row: { flexDirection: "row", gap: t.space.sm },
}));
