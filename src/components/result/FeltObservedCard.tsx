import { useEffect, useState } from "react";
import { Card } from "../common/Card";
import { Txt } from "../common/Txt";
import { ScaleChips } from "../conversation/ScaleChips";
import { getArtifact, putArtifact } from "../../services/db/artifactsRepo";
import { makeStyles } from "../../theme/ThemeProvider";

interface FeltObserved {
  felt: number | null; // 1-5, before watching: how you think you came across
  observed: number | null; // 1-5, after watching: how it actually came across
}

// Felt vs observed: rate how you think you came across *before* watching
// the take, then again after. The gap is usually in your favor — the video
// step of CBT for social anxiety, in miniature.
export function FeltObservedCard({ sessionId }: { sessionId: string }) {
  const styles = useStyles();
  const [value, setValue] = useState<FeltObserved>({ felt: null, observed: null });
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    getArtifact<FeltObserved>(sessionId, "felt_observed")
      .then((v) => {
        if (v) setValue(v);
      })
      .finally(() => setLoaded(true));
  }, [sessionId]);

  function update(patch: Partial<FeltObserved>) {
    const next = { ...value, ...patch };
    setValue(next);
    putArtifact(sessionId, "felt_observed", next).catch(() => undefined);
  }

  if (!loaded) return null;
  const { felt, observed } = value;

  return (
    <Card style={styles.card}>
      <Txt variant="caption2" tone="muted" uppercase>
        Felt vs observed
      </Txt>
      <Txt variant="headline">Before you watch: how do you think you came across?</Txt>
      <ScaleChips value={felt} onChange={(n) => update({ felt: n })} min={1} max={5} lowLabel="Awkward" highLabel="Great" accessibilityLabel="How you think you came across, 1 to 5" />
      {felt != null ? (
        <>
          <Txt variant="headline">Now watch it back. How did it actually come across?</Txt>
          <ScaleChips value={observed} onChange={(n) => update({ observed: n })} min={1} max={5} lowLabel="Awkward" highLabel="Great" accessibilityLabel="How it actually came across, 1 to 5" />
        </>
      ) : null}
      {felt != null && observed != null ? (
        <Txt variant="footnote" tone="secondary">
          {observed > felt
            ? `Felt like a ${felt}, looked like a ${observed}. You come across better than it feels from the inside.`
            : observed === felt
              ? "What you felt matched what you saw — a fair read of yourself."
              : `Felt like a ${felt}, looked like a ${observed}. Note one specific thing to try next time — just one.`}
        </Txt>
      ) : null}
    </Card>
  );
}

const useStyles = makeStyles((t) => ({
  card: { gap: t.space.sm },
}));
