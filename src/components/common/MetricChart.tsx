import { View } from "react-native";
import { LineChart } from "react-native-gifted-charts";
import { useTheme } from "../../theme/ThemeProvider";
import { Txt } from "./Txt";

// A small themed line chart for one metric over time.
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
  const { colors } = useTheme();
  const stroke = color ?? colors.accent;
  const latest = values[values.length - 1];
  const max = maxValue ?? Math.max(10, Math.ceil((Math.max(...values, 1) * 1.2) / 10) * 10);
  return (
    <View style={{ gap: 8 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" }}>
        <Txt variant="headline">{title}</Txt>
        {latest != null ? (
          <Txt variant="subhead" weight="700" color={stroke}>
            {Math.round(latest)}
            {unit ? ` ${unit}` : ""}
          </Txt>
        ) : null}
      </View>
      {values.length >= 2 ? (
        <LineChart
          data={values.map((value) => ({ value }))}
          height={110}
          color={stroke}
          thickness={3}
          curved
          areaChart
          startFillColor={stroke}
          startOpacity={0.2}
          endOpacity={0}
          maxValue={max}
          noOfSections={3}
          initialSpacing={8}
          endSpacing={8}
          adjustToWidth
          hideDataPoints={values.length > 12}
          dataPointsColor={stroke}
          rulesColor={colors.separator}
          rulesType="dashed"
          xAxisColor={colors.border}
          yAxisColor="transparent"
          yAxisTextStyle={{ color: colors.textMuted, fontSize: 10 }}
          yAxisLabelWidth={28}
        />
      ) : (
        <Txt variant="footnote" tone="muted">
          {emptyText}
        </Txt>
      )}
    </View>
  );
}
