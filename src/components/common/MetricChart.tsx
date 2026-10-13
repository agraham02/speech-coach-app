import { View } from "react-native";
import { LineChart } from "react-native-gifted-charts";
import { makeStyles, useTheme } from "../../theme/ThemeProvider";
import { fontFamilies } from "../../theme/tokens";
import { Txt } from "./Txt";

// A small themed line chart for one metric over time, with the latest value
// called out.
export function MetricChart({
  title,
  values,
  color,
  maxValue,
  unit,
  emptyText = "Not enough data yet.",
}: {
  title: string;
  values: number[];
  color?: string;
  maxValue?: number;
  unit?: string;
  emptyText?: string;
}) {
  const styles = useStyles();
  const { colors } = useTheme();
  const stroke = color ?? colors.accent;
  const latest = values[values.length - 1];
  const max = maxValue ?? Math.max(10, Math.ceil((Math.max(...values, 1) * 1.2) / 10) * 10);
  return (
    <View style={styles.wrap}>
      <View style={styles.head}>
        <Txt variant="headline" style={styles.title}>
          {title}
        </Txt>
        {latest != null ? (
          <View style={styles.latest}>
            <Txt variant="title1" style={styles.value}>
              {Math.round(latest)}
            </Txt>
            {unit ? (
              <Txt variant="footnote" tone="secondary">
                {unit}
              </Txt>
            ) : null}
          </View>
        ) : null}
      </View>
      {values.length >= 2 ? (
        <LineChart
          data={values.map((value) => ({ value }))}
          height={100}
          color={stroke}
          thickness={2.5}
          curved
          areaChart
          startFillColor={stroke}
          startOpacity={0.22}
          endOpacity={0}
          maxValue={max}
          noOfSections={3}
          initialSpacing={6}
          endSpacing={6}
          adjustToWidth
          hideDataPoints={values.length > 12}
          dataPointsColor={stroke}
          dataPointsRadius={3}
          rulesColor={colors.separator}
          rulesType="dashed"
          xAxisColor="transparent"
          yAxisColor="transparent"
          yAxisTextStyle={{ color: colors.textMuted, fontSize: 10, fontFamily: fontFamilies.regular }}
          yAxisLabelWidth={28}
          isAnimated
          animationDuration={700}
        />
      ) : (
        <Txt variant="footnote" tone="muted">
          {emptyText}
        </Txt>
      )}
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  wrap: { gap: t.space.sm },
  head: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", gap: t.space.md },
  title: { flex: 1, paddingBottom: 4 },
  latest: { flexDirection: "row", alignItems: "baseline", gap: 4 },
  value: { fontSize: 24, lineHeight: 30, letterSpacing: -0.8 },
}));
