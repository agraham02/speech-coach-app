import { useEffect, useState } from "react";
import { View } from "react-native";
import { Card } from "../common/Card";
import { Txt } from "../common/Txt";
import { callsThisMonth, describeUsage, formatTokens, sumUsage, type CloudUsageCall, type UsageTotals } from "../../domain/cloudUsage";
import { getAllUsageCalls } from "../../services/cloud/usageStore";
import { makeStyles } from "../../theme/ThemeProvider";

// What Tono AI has used for your takes, in tokens (the unit AI is billed
// by): this month, all time, and the latest one. Informational: your plan
// counts judged takes, not tokens.
export function DeepReviewUsage() {
  const styles = useStyles();
  const [calls, setCalls] = useState<CloudUsageCall[] | null>(null);

  useEffect(() => {
    getAllUsageCalls()
      .then(setCalls)
      .catch(() => setCalls([]));
  }, []);

  if (calls === null) return null;
  const month = sumUsage(callsThisMonth(calls));
  const all = sumUsage(calls);
  const latest = calls.length ? calls[calls.length - 1] : null;

  return (
    <Card style={styles.card}>
      <Txt variant="headline">Usage</Txt>
      {calls.length === 0 ? (
        <Txt variant="footnote" tone="secondary">
          No judged takes yet. Each one shows here, in tokens: the unit AI is billed by.
        </Txt>
      ) : (
        <>
          <Row label="This month" totals={month} />
          <Row label="All time" totals={all} />
          {latest ? (
            <Txt variant="footnote" tone="muted">
              {"Latest: " + describeUsage(latest) + "."}
            </Txt>
          ) : null}
          <Txt variant="caption1" tone="muted">
            Tokens are how an AI model measures what it reads and writes. Your plan counts judged takes, not tokens: one take is one, whatever it used.
          </Txt>
        </>
      )}
    </Card>
  );
}

function Row({ label, totals }: { label: string; totals: UsageTotals }) {
  const styles = useStyles();
  return (
    <View style={styles.row}>
      <Txt variant="subhead" tone="secondary">
        {label}
      </Txt>
      <Txt variant="subhead" tabular>
        {totals.reviews + (totals.reviews === 1 ? " judged take" : " judged takes") + ", " + formatTokens(totals.totalTokens) + " tokens"}
      </Txt>
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  card: { gap: t.space.sm },
  row: { flexDirection: "row", justifyContent: "space-between", gap: t.space.md },
}));
