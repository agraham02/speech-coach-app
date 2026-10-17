import { useCallback, useEffect, useState } from "react";
import { Card } from "../common/Card";
import { Txt } from "../common/Txt";
import { ScaleChips } from "../conversation/ScaleChips";
import { getArtifact, putArtifact } from "../../services/db/artifactsRepo";
import { makeStyles } from "../../theme/ThemeProvider";

export interface FeltObserved {
  felt: number | null; // 1-5, before watching: how you think you came across
  observed: number | null; // 1-5, after watching: how it actually came across
}

export interface FeltObservedState {
  value: FeltObserved;
  loaded: boolean;
  update: (patch: Partial<FeltObserved>) => void;
}

// The ratings for one take, shared by the two halves of the exercise (the
// first question at the top of the result, the second beside the video).
export function useFeltObserved(sessionId: string): FeltObservedState {
  const [value, setValue] = useState<FeltObserved>({ felt: null, observed: null });
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    getArtifact<FeltObserved>(sessionId, "felt_observed")
      .then((v) => {
        if (v) setValue(v);
      })
      .finally(() => setLoaded(true));
  }, [sessionId]);

  const update = useCallback(
    (patch: Partial<FeltObserved>) => {
      setValue((prev) => {
        const next = { ...prev, ...patch };
        putArtifact(sessionId, "felt_observed", next).catch(() => undefined);
        return next;
      });
    },
    [sessionId],
  );

  return { value, loaded, update };
}

// Felt vs observed: rate how you think you came across *before* watching
// the take, then again after. The gap is usually in your favor: the video
// step of CBT for social anxiety, in miniature. This is the first half, at
// the top of the result, before the score and the video.
export function FeltCard({ state }: { state: FeltObservedState }) {
  const styles = useStyles();
  if (!state.loaded) return null;
  const { felt } = state.value;
  return (
    <Card style={styles.card}>
      <Txt variant="caption2" tone="muted" uppercase>
        Felt vs observed
      </Txt>
      <Txt variant="headline">Before you watch: how do you think you came across?</Txt>
      <ScaleChips value={felt} onChange={(n) => state.update({ felt: n })} min={1} max={5} lowLabel="Awkward" highLabel="Great" accessibilityLabel="How you think you came across, 1 to 5" />
      {felt != null ? (
        <Txt variant="footnote" tone="secondary">
          Locked in. Watch it below, then say how it actually came across.
        </Txt>
      ) : null}
    </Card>
  );
}

// The second half, right by the video: how it actually came across, and what
// the gap says. Waits until the first question has an answer.
export function ObservedCard({ state }: { state: FeltObservedState }) {
  const styles = useStyles();
  if (!state.loaded || state.value.felt == null) return null;
  const { felt, observed } = state.value;
  return (
    <Card style={styles.card}>
      <Txt variant="headline">Now watch it back. How did it actually come across?</Txt>
      <ScaleChips value={observed} onChange={(n) => state.update({ observed: n })} min={1} max={5} lowLabel="Awkward" highLabel="Great" accessibilityLabel="How it actually came across, 1 to 5" />
      {observed != null ? (
        <Txt variant="footnote" tone="secondary">
          {observed > felt
            ? `Felt like a ${felt}, looked like a ${observed}. You come across better than it feels from the inside.`
            : observed === felt
              ? "What you felt matched what you saw: a fair read of yourself."
              : `Felt like a ${felt}, looked like a ${observed}. Note one specific thing to try next time: just one.`}
        </Txt>
      ) : null}
    </Card>
  );
}

const useStyles = makeStyles((t) => ({
  card: { gap: t.space.sm },
}));
