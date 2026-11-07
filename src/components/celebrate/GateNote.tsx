import { Card } from "../common/Card";
import { Txt } from "../common/Txt";
import type { GateVerdict } from "../../domain/gates";
import { makeStyles } from "../../theme/ThemeProvider";

// A result whose gate failed: no number, and why, kindly (plan 6.4, rule 2). Your
// minutes and your check-off still count.
export function GateNote({ gate }: { gate: Extract<GateVerdict, { passed: false }> }) {
  const styles = useStyles();
  return (
    <Card style={styles.card}>
      <Txt variant="headline">{gate.kind === "not_checked" ? "Not checked" : "Not scored"}</Txt>
      <Txt variant="footnote" tone="secondary">
        {gate.reason}
      </Txt>
    </Card>
  );
}

const useStyles = makeStyles((t) => ({
  card: { gap: t.space.xs },
}));
