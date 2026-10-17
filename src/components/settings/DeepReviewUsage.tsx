import { useEffect, useState } from "react";
import { View } from "react-native";
import { Card } from "../common/Card";
import { Txt } from "../common/Txt";
import { callsThisMonth, describeUsage, formatTokens, sumUsage, type CloudUsageCall, type UsageTotals } from "../../domain/cloudUsage";
import { getAllUsageCalls } from "../../services/cloud/usageStore";
import { makeStyles } from "../../theme/ThemeProvider";

// What deep reviews have used, in tokens: the unit AI providers bill by, on
// your own account. This month, all time, and the latest one.
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
          No deep reviews yet. Each one shows here, in tokens: the unit your AI provider bills by, on your own account.
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
            Tokens are how a provider measures what it reads and writes. A review of video costs more than one of text. What each costs in money depends on the model you pick, so check your provider.
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
        {totals.reviews + (totals.reviews === 1 ? " review" : " reviews") + ", " + formatTokens(totals.totalTokens) + " tokens"}
      </Txt>
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  card: { gap: t.space.sm },
  row: { flexDirection: "row", justifyContent: "space-between", gap: t.space.md },
}));
