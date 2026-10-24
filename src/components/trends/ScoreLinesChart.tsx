import { useState } from "react";
import { View, type LayoutChangeEvent } from "react-native";
import Svg, { Circle, G, Line, Path, Text as SvgText } from "react-native-svg";
import { Txt } from "../common/Txt";
import { makeStyles, useTheme } from "../../theme/ThemeProvider";
import { font } from "../../theme/tokens";
import { runPath, type Point } from "../../domain/results/timeline";
import type { ScorePoint } from "../../domain/trends";

// Score by take, 0 to 10, with the two layers as two lines: what Tono AI
// judged, and what the phone measured. A take with no judgement leaves a gap
// in the judged line, never a zero, and the lines are never joined or averaged.
const HEIGHT = 170;
const GUTTER = 24;
const TOP = 8;
const BOTTOM = 20;

export function ScoreLinesChart({ points }: { points: ScorePoint[] }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const [width, setWidth] = useState(0);
  const plotW = Math.max(0, width - GUTTER - 8);
  const plotH = HEIGHT - TOP - BOTTOM;
  const x = (i: number) => GUTTER + (points.length > 1 ? (i / (points.length - 1)) * plotW : plotW / 2);
  const y = (v: number) => TOP + (1 - v / 10) * plotH;

  function runsOf(pick: (p: ScorePoint) => number | null): Point[][] {
    const runs: Point[][] = [];
    let run: Point[] = [];
    points.forEach((p, i) => {
      const v = pick(p);
      if (v == null) {
        if (run.length) runs.push(run);
        run = [];
      } else run.push({ x: x(i), y: y(v) });
    });
    if (run.length) runs.push(run);
    return runs;
  }

  const lines = [
    { name: "Judged by Tono AI", color: colors.accent, runs: runsOf((p) => p.judged?.overall ?? null) },
    { name: "Measured on this phone", color: colors.textMuted, runs: runsOf((p) => p.measured?.overall ?? null) },
  ].filter((l) => l.runs.length > 0);

  const first = points[0] && new Date(points[0].recordedAt).toLocaleDateString(undefined, { month: "numeric", day: "numeric" });
  const last = points.length > 1 && new Date(points[points.length - 1].recordedAt).toLocaleDateString(undefined, { month: "numeric", day: "numeric" });

  return (
    <View style={styles.wrap}>
      <View onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)} style={{ height: HEIGHT }}>
        {width > 0 ? (
          <Svg width={width} height={HEIGHT}>
            {[0, 5, 10].map((v) => (
              <G key={v}>
                <Line x1={GUTTER} x2={GUTTER + plotW} y1={y(v)} y2={y(v)} stroke={colors.textMuted} strokeWidth={0.5} opacity={0.3} />
                <SvgText x={GUTTER - 5} y={y(v) + 3.5} fontSize={10} fill={colors.textMuted} textAnchor="end" fontFamily={font("400").fontFamily}>
                  {v}
                </SvgText>
              </G>
            ))}
            {first ? (
              <SvgText x={GUTTER} y={HEIGHT - 4} fontSize={10} fill={colors.textMuted} textAnchor="start" fontFamily={font("400").fontFamily}>
                {first}
              </SvgText>
            ) : null}
            {last ? (
              <SvgText x={GUTTER + plotW} y={HEIGHT - 4} fontSize={10} fill={colors.textMuted} textAnchor="end" fontFamily={font("400").fontFamily}>
                {last}
              </SvgText>
            ) : null}
            {lines.map((line) =>
              line.runs.map((run, i) => (
                <G key={`${line.name}${i}`}>
                  <Path d={runPath(run)} stroke={line.color} strokeWidth={2} fill="none" strokeLinejoin="round" strokeLinecap="round" />
                  {run.map((p, k) => (
                    <Circle key={k} cx={p.x} cy={p.y} r={2.5} fill={line.color} />
                  ))}
                </G>
              )),
            )}
          </Svg>
        ) : null}
      </View>
      <View style={styles.legend}>
        {lines.map((line) => (
          <View key={line.name} style={styles.legendItem}>
            <View style={[styles.swatch, { backgroundColor: line.color }]} />
            <Txt variant="caption1" tone="secondary">
              {line.name}
            </Txt>
          </View>
        ))}
      </View>
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  wrap: { gap: t.space.sm },
  legend: { flexDirection: "row", flexWrap: "wrap", gap: t.space.md },
  legendItem: { flexDirection: "row", alignItems: "center", gap: t.space.xs },
  swatch: { width: 14, height: 3, borderRadius: 2 },
}));
