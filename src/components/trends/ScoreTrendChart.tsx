import { LineChart } from "react-native-gifted-charts";
import { useTheme } from "../../theme/ThemeProvider";

export interface TrendPoint {
  value: number;
  label: string;
}

interface ScoreTrendChartProps {
  data: TrendPoint[];
  // Defaults match the original 0-10 score usage — pass a smaller value
  // (e.g. 5, for the curriculum level's 1-5 range) so a narrower-range
  // series doesn't render as a flat line hugging the bottom half.
  maxValue?: number;
  noOfSections?: number;
  height?: number;
}

export function ScoreTrendChart({ data, maxValue = 10, noOfSections = 5, height = 180 }: ScoreTrendChartProps) {
  const { colors } = useTheme();
  return (
    <LineChart
      data={data}
      height={height}
      color={colors.accent}
      thickness={3}
      curved
      areaChart
      startFillColor={colors.accent}
      startOpacity={0.25}
      endOpacity={0}
      maxValue={maxValue}
      noOfSections={noOfSections}
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
