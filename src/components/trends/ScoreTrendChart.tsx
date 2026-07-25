import { LineChart } from "react-native-gifted-charts";
import { colors } from "../../theme/theme";

export interface TrendPoint {
  value: number;
  label: string;
}

export function ScoreTrendChart({ data }: { data: TrendPoint[] }) {
  return (
    <LineChart
      data={data}
      height={180}
      color={colors.accent}
      thickness={3}
      curved
      areaChart
      startFillColor={colors.accent}
      startOpacity={0.25}
      endOpacity={0}
      maxValue={10}
      noOfSections={5}
      initialSpacing={12}
      endSpacing={12}
      rulesColor={colors.border}
      rulesType="dashed"
      xAxisColor={colors.border}
      yAxisColor={colors.border}
      yAxisTextStyle={{ color: colors.textMuted, fontSize: 10 }}
      xAxisLabelTextStyle={{ color: colors.textMuted, fontSize: 10 }}
      dataPointsColor={colors.accent}
      isAnimated
      animationDuration={600}
    />
  );
}
