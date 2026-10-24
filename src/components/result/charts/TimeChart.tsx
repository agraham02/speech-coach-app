import { useId, useMemo, useRef, useState } from "react";
import { PanResponder, Pressable, View, type GestureResponderEvent, type LayoutChangeEvent } from "react-native";
import Svg, { ClipPath, Defs, G, Line, Path, Rect, Text as SvgText } from "react-native-svg";
import { Ionicons } from "@expo/vector-icons";
import { Txt } from "../../common/Txt";
import { makeStyles, useTheme } from "../../../theme/ThemeProvider";
import { font } from "../../../theme/tokens";
import { useTimeline } from "./TimelineContext";
import type { Axis } from "../../../domain/results/charts";
import { areaPath, clock, MIN_SPAN_MS, msOfX, runPath, seriesRuns, spanOf, timeTicks, valueAtMs, xOfMs, ZOOM_STEP, type Series } from "../../../domain/results/timeline";
import { tick } from "../../../utils/haptics";

export interface ChartLayer {
  series: Series;
  color: string;
  // Filled down to the zero line (or the floor) as well as stroked.
  area?: boolean;
}

export interface ChartBand {
  from: number;
  to: number;
  color: string;
}

interface TimeChartProps {
  title: string;
  // The unit the axis is in, said in words next to the title.
  unit: string;
  axis: Axis;
  layers: ChartLayer[];
  bands?: ChartBand[];
  // The reading at a moment, for the line above the chart while you point at it.
  readout: (ms: number) => string | null;
  // What the shaded band means, under the chart.
  caption?: string;
  height?: number;
}

const GUTTER = 30;
const RIGHT = 6;
const TOP = 6;
const AXIS_H = 18;
const DOUBLE_TAP_MS = 300;

// One chart on the shared time axis. It fits the screen width by default, so
// a whole take is visible at once; pinch, double tap or the buttons zoom in
// (every chart follows), a two-finger drag moves along the take, and dragging
// one finger or tapping points at a moment, which every chart marks. The
// y-axis is fixed by the unit (see domain/results/charts.ts), the line is
// straight between measurements (no smoothing), and a gap is a gap.
export function TimeChart({ title, unit, axis, layers, bands, readout, caption, height = 112 }: TimeChartProps) {
  const styles = useStyles();
  const { colors } = useTheme();
  const tl = useTimeline();
  const [width, setWidth] = useState(0);
  const clipId = "clip" + useId().replace(/[^a-zA-Z0-9]/g, "");

  const plotW = Math.max(0, width - GUTTER - RIGHT);
  const plotH = height - TOP - AXIS_H;
  const yOf = (value: number) => TOP + (1 - (Math.max(axis.min, Math.min(axis.max, value)) - axis.min) / (axis.max - axis.min)) * plotH;
  const zeroY = yOf(Math.max(axis.min, Math.min(axis.max, 0)));

  // The latest values for the gesture handlers, which are created once.
  const live = useRef({ tl, plotW });
  live.current = { tl, plotW };
  const touch = useRef({ originX: 0, pageX0: 0, mode: "none" as "none" | "scrub" | "pinch", startVp: tl.viewport, startDist: 0, anchorMs: 0, lastTap: 0 });

  const xFromPage = (pageX: number) => touch.current.originX + (pageX - touch.current.pageX0) - GUTTER;

  function distance(e: GestureResponderEvent) {
    const [a, b] = e.nativeEvent.touches;
    return Math.hypot(a.pageX - b.pageX, a.pageY - b.pageY);
  }

  const responder = useMemo(
    () =>
      PanResponder.create({
        // Only a sideways drag or a second finger takes the touch, so
        // scrolling the screen from over a chart still scrolls.
        onMoveShouldSetPanResponderCapture: (e, g) => e.nativeEvent.touches.length >= 2 || (Math.abs(g.dx) > 6 && Math.abs(g.dx) > Math.abs(g.dy) * 1.2),
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: (e) => {
          const t = touch.current;
          t.mode = e.nativeEvent.touches.length >= 2 ? "pinch" : "scrub";
          t.originX = e.nativeEvent.locationX;
          t.pageX0 = e.nativeEvent.pageX;
          t.startVp = live.current.tl.viewport;
          if (t.mode === "pinch") {
            t.startDist = distance(e);
            const mid = (e.nativeEvent.touches[0].pageX + e.nativeEvent.touches[1].pageX) / 2;
            t.anchorMs = msOfX(xFromPage(mid), t.startVp, live.current.plotW);
          }
        },
        onPanResponderMove: (e) => {
          const t = touch.current;
          const { tl: state, plotW: w } = live.current;
          if (w <= 0) return;
          if (e.nativeEvent.touches.length >= 2) {
            if (t.mode !== "pinch") {
              t.mode = "pinch";
              t.startVp = state.viewport;
              t.startDist = distance(e);
              const mid = (e.nativeEvent.touches[0].pageX + e.nativeEvent.touches[1].pageX) / 2;
              t.anchorMs = msOfX(xFromPage(mid), t.startVp, w);
              return;
            }
            const mid = (e.nativeEvent.touches[0].pageX + e.nativeEvent.touches[1].pageX) / 2;
            const factor = t.startDist > 0 ? distance(e) / t.startDist : 1;
            const span = spanOf(t.startVp) / Math.max(0.05, factor);
            const frac = Math.min(1, Math.max(0, xFromPage(mid) / w));
            const start = t.anchorMs - frac * span;
            state.setViewport({ startMs: start, endMs: start + span });
            return;
          }
          if (t.mode === "pinch") return; // one finger left after a pinch: wait for a new touch
          state.setCursorMs(Math.max(0, Math.min(state.durationMs, msOfX(xFromPage(e.nativeEvent.pageX), state.viewport, w))));
        },
        onPanResponderRelease: () => {
          touch.current.mode = "none";
        },
        onPanResponderTerminate: () => {
          touch.current.mode = "none";
        },
      }),
    [],
  );

  function onTap(e: GestureResponderEvent) {
    const w = live.current.plotW;
    if (w <= 0) return;
    const x = e.nativeEvent.locationX - GUTTER;
    if (x < 0 || x > w) return;
    const ms = Math.max(0, Math.min(tl.durationMs, msOfX(x, tl.viewport, w)));
    const now = Date.now();
    if (now - touch.current.lastTap < DOUBLE_TAP_MS) {
      touch.current.lastTap = 0;
      tick();
      if (spanOf(tl.viewport) <= MIN_SPAN_MS * 1.01) tl.reset();
      else tl.zoomBy(ZOOM_STEP, ms);
      return;
    }
    touch.current.lastTap = now;
    tl.setCursorMs(ms);
  }

  const vp = tl.viewport;
  const ticks = useMemo(() => timeTicks(vp), [vp]);
  const cursorX = tl.cursorMs != null && tl.cursorMs >= vp.startMs && tl.cursorMs <= vp.endMs ? GUTTER + xOfMs(tl.cursorMs, vp, plotW) : null;
  const reading = tl.cursorMs != null ? readout(tl.cursorMs) : null;

  const drawn = useMemo(
    () =>
      layers.map((layer) => {
        const runs = seriesRuns(layer.series, vp, plotW, yOf);
        return { layer, paths: runs.map((r) => runPath(r)), areas: layer.area ? runs.map((r) => areaPath(r, zeroY)) : [] };
      }),
    // yOf and zeroY are derived from axis, height and plotW
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [layers, vp, plotW, axis, height],
  );

  return (
    <View style={styles.wrap}>
      <View style={styles.head}>
        <Txt variant="footnote" weight="600" style={styles.title} numberOfLines={1}>
          {title} <Txt variant="footnote" tone="muted">· {unit}</Txt>
        </Txt>
        <View style={styles.buttons}>
          <ZoomButton icon="remove" label="Zoom out" disabled={!tl.zoomed} onPress={() => tl.zoomBy(1 / ZOOM_STEP)} />
          <ZoomButton icon="add" label="Zoom in" disabled={spanOf(vp) <= MIN_SPAN_MS * 1.01} onPress={() => tl.zoomBy(ZOOM_STEP)} />
          {tl.zoomed ? <ZoomButton icon="expand-outline" label="Show the whole take" onPress={tl.reset} /> : null}
        </View>
      </View>
      <View style={styles.readout}>
        {reading != null && tl.cursorMs != null ? (
          <>
            <Txt variant="footnote" weight="600" tabular>
              {clock(tl.cursorMs)}
            </Txt>
            <Txt variant="footnote" tone="secondary" tabular style={styles.flex}>
              {reading}
            </Txt>
            {tl.playFrom ? (
              <Pressable onPress={() => tl.playFrom?.(tl.cursorMs ?? 0)} style={styles.play} accessibilityRole="button" accessibilityLabel={`Play the recording from ${clock(tl.cursorMs)}`}>
                <Ionicons name="play" size={11} color={colors.onAccent} />
                <Txt variant="caption1" weight="600" tone="onAccent">
                  Play from here
                </Txt>
              </Pressable>
            ) : null}
          </>
        ) : (
          <Txt variant="caption1" tone="muted" numberOfLines={1}>
            {tl.zoomed ? `${clock(vp.startMs)} to ${clock(vp.endMs)}. Drag with two fingers to move along.` : "Drag across to read a moment. Pinch or double tap to zoom in."}
          </Txt>
        )}
      </View>

      <View
        style={{ height }}
        onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}
        {...responder.panHandlers}
        accessible
        accessibilityLabel={`${title} chart over time, ${tl.zoomed ? `showing ${clock(vp.startMs)} to ${clock(vp.endMs)}` : "the whole take"}`}
      >
        <Pressable style={{ height }} onPress={onTap} accessible={false}>
          {width > 0 ? (
            <Svg width={width} height={height} pointerEvents="none">
              <Defs>
                <ClipPath id={clipId}>
                  <Rect x={GUTTER} y={TOP} width={plotW} height={plotH} />
                </ClipPath>
              </Defs>
              {bands?.map((b, i) => (
                <Rect key={i} x={GUTTER} y={yOf(b.to)} width={plotW} height={Math.max(0, yOf(b.from) - yOf(b.to))} fill={b.color} opacity={0.14} />
              ))}
              {axis.ticks.map((t) => (
                <G key={t.value}>
                  <Line x1={GUTTER} x2={GUTTER + plotW} y1={yOf(t.value)} y2={yOf(t.value)} stroke={colors.textMuted} strokeWidth={t.value === 0 && axis.min < 0 ? 1 : 0.5} opacity={t.value === 0 && axis.min < 0 ? 0.5 : 0.22} />
                  <SvgText x={GUTTER - 5} y={yOf(t.value) + 3.5} fontSize={10} fill={colors.textMuted} textAnchor="end" fontFamily={font("400").fontFamily}>
                    {t.label}
                  </SvgText>
                </G>
              ))}
              {ticks.map((t) => {
                const x = GUTTER + xOfMs(t, vp, plotW);
                if (x < GUTTER - 1 || x > GUTTER + plotW + 1) return null;
                return (
                  <G key={t}>
                    <Line x1={x} x2={x} y1={TOP + plotH} y2={TOP + plotH + 3} stroke={colors.textMuted} strokeWidth={1} opacity={0.5} />
                    <SvgText x={x} y={height - 3} fontSize={10} fill={colors.textMuted} textAnchor="middle" fontFamily={font("400").fontFamily}>
                      {clock(t)}
                    </SvgText>
                  </G>
                );
              })}
              <G clipPath={`url(#${clipId})`}>
                {drawn.map(({ layer, paths, areas }, li) => (
                  <G key={li}>
                    {areas.map((d, i) => (d ? <Path key={`a${i}`} d={d} fill={layer.color} opacity={0.18} /> : null))}
                    {paths.map((d, i) => (
                      <Path key={`l${i}`} d={d} stroke={layer.color} strokeWidth={1.75} fill="none" strokeLinejoin="round" strokeLinecap="round" />
                    ))}
                  </G>
                ))}
              </G>
              {cursorX != null ? <Line x1={cursorX} x2={cursorX} y1={TOP} y2={TOP + plotH} stroke={colors.textPrimary} strokeWidth={1} opacity={0.7} /> : null}
            </Svg>
          ) : null}
        </Pressable>
      </View>
      {caption ? (
        <Txt variant="caption1" tone="muted">
          {caption}
        </Txt>
      ) : null}
    </View>
  );
}

// The reading for a chart's first layer at a moment, in the chart's own words.
export function readSeries(layers: ChartLayer[], ms: number, format: (value: number) => string, gapText: string): string {
  const v = valueAtMs(layers[0].series, ms);
  return v == null ? gapText : format(v);
}

function ZoomButton({ icon, label, onPress, disabled }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void; disabled?: boolean }) {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={() => {
        tick();
        onPress();
      }}
      disabled={disabled}
      hitSlop={6}
      style={[styles.zoomButton, disabled && styles.zoomDisabled]}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
    >
      <Ionicons name={icon} size={15} color={colors.textSecondary} />
    </Pressable>
  );
}

const useStyles = makeStyles((t) => ({
  wrap: { gap: t.space.xs },
  head: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: t.space.sm },
  title: { flex: 1 },
  flex: { flex: 1 },
  buttons: { flexDirection: "row", alignItems: "center", gap: t.space.xs },
  zoomButton: { width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: t.colors.surfaceRaised },
  zoomDisabled: { opacity: 0.35 },
  readout: { flexDirection: "row", alignItems: "center", gap: t.space.sm, minHeight: 24 },
  play: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: t.space.sm + 2, paddingVertical: 4, borderRadius: t.radius.pill, backgroundColor: t.colors.accent },
}));
