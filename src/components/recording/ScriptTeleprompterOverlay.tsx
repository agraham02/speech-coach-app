import { Component, useEffect, useMemo, useState, type ReactNode } from "react";
import { Pressable, StyleSheet, Text, View, type GestureResponderEvent, type LayoutChangeEvent } from "react-native";
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import { BlurView } from "expo-blur";
import MaskedView from "@react-native-masked-view/masked-view";
import { tokenizeScript, type Script, type ScriptCue } from "../../domain/scriptTypes";
import { withAlpha } from "../../utils/color";
import { colors, radii, spacing, typography } from "../../theme/theme";
import { logger } from "../../utils/logger";

// expo-blur and @react-native-masked-view/masked-view are NATIVE modules —
// unlike a JS change, they only exist in the app after a real native rebuild
// (expo prebuild + reinstall, or a fresh dev-client build), not a Metro/Fast
// Refresh reload. If the app hasn't been rebuilt since these were added,
// rendering BlurView/MaskedView throws, which (without this boundary) would
// take the ENTIRE overlay down with it — dark tint, scrolling text, all of
// it — since React unmounts the whole failed subtree up to the nearest
// boundary. This isolates that failure to just the panels, and logs it so
// it's visible in the Metro/device logs instead of silently vanishing.
class PanelErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  state = { hasError: false };
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(error: unknown) {
    logger.error(
      `[teleprompter] blur panel crashed (likely a native module that needs a rebuild): ${(error as Error).message}`,
    );
  }
  render() {
    if (this.state.hasError) return null;
    return this.props.children;
  }
}

interface ScriptTeleprompterOverlayProps {
  script: Script;
  cuesEnabled: boolean;
  isRecording: boolean;
}

// Plain-text glyphs (not an icon font) so the cue marker can sit inline as
// just another word in the paragraph's Text tree — no separate floating
// card, no font-linking to worry about. Deliberately restricted to
// single-UTF-16-code-unit characters (BMP, U+0000–U+FFFF) — Android's
// nested-Text tap hit-testing (how RN implements onPress on inline text
// spans) computes touch targets from character offsets, and surrogate-pair
// glyphs (astral-plane emoji like 🔊 or 🐢, U+10000+) throw that off, making
// the span untappable or routing the tap to a neighboring span instead.
// Confirmed on-device: "❗" (BMP) was tappable, "🔊"/"🐢" (astral) were not.
const CUE_GLYPH: Record<ScriptCue["type"], string> = {
  pitch_up: "↑",
  pitch_down: "↓",
  volume_up: "▲",
  volume_down: "▼",
  pause: "⏸",
  emphasis: "❗",
  slow_down: "⏳",
};

const CUE_LABEL: Record<ScriptCue["type"], string> = {
  pitch_up: "Pitch up",
  pitch_down: "Pitch down",
  volume_up: "Louder",
  volume_down: "Softer",
  pause: "Pause",
  emphasis: "Emphasize",
  slow_down: "Slow down",
};

// Settled on the web prototype (teleprompter-prototype/) — porting the exact
// tuned values rather than re-guessing them here.
const FONT_SIZE = 20;
const LINE_HEIGHT = 36;
const PANEL_FRACTION = 0.4; // each top/bottom panel covers 40% of the screen
// The outer edge of each panel's darkening gradient goes all the way to
// fully opaque (1, not e.g. 0.97) deliberately — a
// semi-transparent color here doesn't composite reliably against the
// scrolling text underneath (it sits on its own GPU layer from the
// reanimated transform), so a "nearly opaque" value can still let text
// show through much more than the alpha number suggests. Fully opaque has
// no such ambiguity — confirmed by testing with an opaque debug color, which
// hid the text completely as expected.
const PANEL_OPACITY = 1;

// Natural pacing: a flat "totalDuration / wordCount per word" clock reads as
// robotic — real speech lingers on longer words and pauses after
// punctuation. Each word gets a weight (length + a bonus for trailing
// punctuation); the cumulative, normalized weights become the timing curve —
// heavier words consume more of the time budget, so the clock visits them
// more slowly without any per-frame logic.
function computeWordWeights(tokens: string[]): number[] {
  return tokens.map((word) => {
    let weight = 1 + word.length * 0.28;
    if (/[.!?]["')\]]?$/.test(word)) weight += 3.2;
    else if (/[,;:—–-]["')\]]?$/.test(word)) weight += 1.4;
    return weight;
  });
}

function buildCumulativeFractions(weights: number[]): number[] {
  const total = weights.reduce((a, b) => a + b, 0) || 1;
  let running = 0;
  return weights.map((w) => {
    running += w;
    return running / total;
  });
}

// First index whose cumulative fraction is >= target (weights are all
// positive, so this array is strictly increasing — no ties to worry about).
function wordIndexForFraction(cumulative: number[], target: number): number {
  let lo = 0;
  let hi = cumulative.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (cumulative[mid] < target) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

// The panel is blur + darkening the WHOLE way from the clear middle to the
// screen edge — no flat, un-blurred solid block anymore. That flat block was
// hiding the camera completely partway into the panel; blurring continuously
// all the way to the edge means the camera stays dimly visible (just
// increasingly blurred and darkened) right up to the edge, while the text —
// which sits on its own layer above the blur, so blur alone can't hide it —
// gets fully covered by the darken gradient reaching true opaque black at
// the outer edge.
function Panel({ side, height }: { side: "top" | "bottom"; height: number }) {
  // Local top->bottom of the panel: for the top panel, the panel's own top
  // edge IS the screen edge (fully dark) and its bottom edge is adjacent to
  // the clear middle (fully transparent) — the bottom panel is the mirror
  // image.
  const darkenColors: [string, string] =
    side === "top" ? [`rgba(8,9,12,${PANEL_OPACITY})`, "rgba(8,9,12,0)"] : ["rgba(8,9,12,0)", `rgba(8,9,12,${PANEL_OPACITY})`];
  const maskColors: [string, string] = side === "top" ? ["white", "transparent"] : ["transparent", "white"];

  return (
    <View pointerEvents="none" style={[styles.panelWrap, side === "top" ? styles.panelTop : styles.panelBottom, { height }]}>
      <MaskedView
        style={StyleSheet.absoluteFill}
        maskElement={<LinearGradient colors={maskColors} style={StyleSheet.absoluteFill} />}
      >
        <BlurView intensity={65} tint="dark" style={StyleSheet.absoluteFill} />
      </MaskedView>
      <LinearGradient colors={darkenColors} style={StyleSheet.absoluteFill} />
    </View>
  );
}

// Simple, on purpose: a full-screen dark overlay with one plain scrolling
// text layer underneath a pair of top/bottom panels — the panels do all the
// hiding (solid block + blurred fade at the boundary), not per-word opacity
// tricks on the text itself.
export function ScriptTeleprompterOverlay({ script, cuesEnabled, isRecording }: ScriptTeleprompterOverlayProps) {
  const tokens = useMemo(() => tokenizeScript(script.text), [script.text]);
  const cumulativeFractions = useMemo(() => buildCumulativeFractions(computeWordWeights(tokens)), [tokens]);
  // Cues render inline, directly on their own word, instead of a floating
  // card — a lookup keyed by word index is all rendering the paragraph needs.
  const cueByWordIndex = useMemo(() => {
    const map = new Map<number, ScriptCue>();
    for (const cue of script.cues) map.set(cue.wordIndex, cue);
    return map;
  }, [script.cues]);

  const [viewportHeight, setViewportHeight] = useState(0);
  const [contentHeight, setContentHeight] = useState(0);

  const scrollY = useSharedValue(0);
  const [currentWordIndex, setCurrentWordIndex] = useState(0);

  // Tapping a cue's glyph shows its instruction as a floating tooltip — it
  // does NOT expand anything inline in the script (that was the previous,
  // rejected design: full label text sitting in the paragraph flow, which
  // crowded out the actual words to read once cues got dense). The tooltip
  // is a sibling of the scrolling text, positioned near where you tapped, so
  // it never affects the text's own layout.
  const [tooltip, setTooltip] = useState<{ cue: ScriptCue; y: number } | null>(null);

  function toggleTooltip(cue: ScriptCue, event: GestureResponderEvent) {
    const y = event.nativeEvent.pageY;
    setTooltip((prev) => (prev && prev.cue === cue ? null : { cue, y }));
  }

  // Constant-velocity scroll, driven entirely on the UI thread — pixel
  // position advances linearly across the WHOLE script over its target
  // duration, exactly how a real teleprompter behaves. Recording only ever
  // starts once per session (no pause/resume mid-take), so this is a single
  // one-shot animation rather than something that needs to track elapsed
  // seconds tick-by-tick.
  useEffect(() => {
    if (!isRecording || contentHeight <= 0) return;
    scrollY.value = withTiming(contentHeight, {
      duration: script.targetDurationSeconds * 1000,
      easing: Easing.linear,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRecording, contentHeight]);

  // The highlighted word is driven by the SAME time fraction as the scroll,
  // sampled off the UI-thread shared value at a throttled ~12fps — enough to
  // read as one-word-at-a-time progress without re-rendering the word list
  // at a wasteful 60fps.
  useEffect(() => {
    if (!isRecording || contentHeight <= 0) return;
    const interval = setInterval(() => {
      const fraction = scrollY.value / contentHeight;
      const nearest = wordIndexForFraction(cumulativeFractions, fraction);
      setCurrentWordIndex((prev) => (prev === nearest ? prev : nearest));
    }, 80);
    return () => clearInterval(interval);
  }, [isRecording, contentHeight, cumulativeFractions]);

  // Centering lives entirely in this transform, NOT in padding on the
  // content view — padding big enough to let the first/last word reach dead
  // center (viewportHeight/2, often 1000px+) inflated the content view's
  // MEASURED size enough to hit a real Android rendering limit: it silently
  // failed to paint at all (no crash, no error — confirmed via
  // "out of bounds transparent region" SurfaceFlinger warnings in logcat).
  // scrollY here means "how many pixels into the text the reading position
  // is," ranging 0 -> contentHeight; offsetting by viewportHeight/2 in the
  // transform achieves the same visual centering without the content view
  // itself ever being larger than the script's own natural text height.
  const scrollStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: viewportHeight / 2 - scrollY.value }],
  }));

  function handleViewportLayout(event: LayoutChangeEvent) {
    setViewportHeight(event.nativeEvent.layout.height);
  }

  function handleContentLayout(event: LayoutChangeEvent) {
    setContentHeight(event.nativeEvent.layout.height);
  }

  const panelHeight = viewportHeight * PANEL_FRACTION;

  // Keep the tooltip clear of the very top/bottom of the screen (the record
  // button group lives below the overlay) regardless of where the tapped
  // glyph happened to be.
  const tooltipTop = tooltip ? Math.min(Math.max(tooltip.y - 56, 24), Math.max(viewportHeight - 200, 24)) : 0;

  return (
    // box-none (not none): most of this overlay still has to pass taps
    // through to the camera/record button behind it, but the cue glyphs
    // themselves — and the tap-away-to-dismiss layer below — need to be
    // real touch targets, and "none" would swallow touches for the whole
    // subtree, glyphs included.
    <View style={styles.wrapper} onLayout={handleViewportLayout} pointerEvents="box-none">
      {/* Base dark tint over the whole camera area */}
      <View style={styles.baseTint} pointerEvents="none" />

      {/* The scrolling text — ONE plain layer. It just scrolls; the panels
          above it do all the hiding. */}
      <Animated.View onLayout={handleContentLayout} style={[styles.textContent, scrollStyle]} pointerEvents="box-none">
        <Text style={styles.paragraph}>
          {tokens.map((word, index) => {
            const cue = cuesEnabled ? cueByWordIndex.get(index) : undefined;
            const isCurrent = index === currentWordIndex;
            const wordStyle = isCurrent ? styles.currentWord : cue ? styles.cueWord : styles.word;
            return (
              <Text key={index}>
                {/* Icon-only marker, anchored right before its own word —
                    unambiguous which word it applies to, but doesn't crowd
                    the script with label text. Tap it for the instruction. */}
                {cue ? (
                  <Text style={styles.cueTag} onPress={(event) => toggleTooltip(cue, event)} suppressHighlighting>
                    {CUE_GLYPH[cue.type]}{" "}
                  </Text>
                ) : null}
                <Text style={wordStyle}>{word}</Text>
                <Text style={styles.word}> </Text>
              </Text>
            );
          })}
        </Text>
      </Animated.View>

      <PanelErrorBoundary>
        <Panel side="top" height={panelHeight} />
        <Panel side="bottom" height={panelHeight} />
      </PanelErrorBoundary>

      {tooltip ? (
        <>
          {/* Tap anywhere outside the tooltip to dismiss it. */}
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setTooltip(null)} />
          <View style={[styles.tooltip, { top: tooltipTop }]} pointerEvents="none">
            <Text style={styles.tooltipType}>
              {CUE_GLYPH[tooltip.cue.type]} {CUE_LABEL[tooltip.cue.type].toUpperCase()}
            </Text>
            <Text style={styles.tooltipLabel}>{tooltip.cue.label}</Text>
          </View>
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { flex: 1, overflow: "hidden" },
  baseTint: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.55)" },
  textContent: { paddingHorizontal: spacing.xl },
  paragraph: { textAlign: "center" },
  word: { color: "white", fontSize: FONT_SIZE, lineHeight: LINE_HEIGHT, fontWeight: "600", letterSpacing: 0.2 },
  // The single unambiguous "you are here" marker — distinct from everything
  // else so it never reads as "the whole line is lit up."
  currentWord: {
    color: "white",
    backgroundColor: colors.accent,
    fontSize: FONT_SIZE,
    lineHeight: LINE_HEIGHT,
    fontWeight: "700",
    letterSpacing: 0.2,
  },
  // The word a cue applies to — a distinct color (amber, vs. the blue "you
  // are here" marker) so the two never read as the same kind of thing, and
  // it's anchored to the exact word rather than a nearby banner.
  cueWord: {
    color: "white",
    backgroundColor: withAlpha(colors.warning, 0.35),
    fontSize: FONT_SIZE,
    lineHeight: LINE_HEIGHT,
    fontWeight: "700",
    letterSpacing: 0.2,
  },
  cueTag: {
    color: colors.warning,
    fontSize: FONT_SIZE,
    lineHeight: LINE_HEIGHT,
    fontWeight: "800",
    letterSpacing: 0.3,
  },
  panelWrap: { position: "absolute", left: 0, right: 0, overflow: "hidden" },
  panelTop: { top: 0 },
  panelBottom: { bottom: 0 },
  // A transient popover, not part of the script's own layout — it's a
  // sibling of the scrolling text, so opening/closing it never reflows or
  // resizes anything the reader is trying to read.
  tooltip: {
    position: "absolute",
    left: "8%",
    right: "8%",
    alignSelf: "center",
    backgroundColor: "rgba(21,22,28,0.96)",
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: withAlpha(colors.warning, 0.4),
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 6,
  },
  tooltipType: {
    color: colors.warning,
    fontSize: typography.caption - 1,
    fontWeight: "800",
    letterSpacing: 0.8,
  },
  tooltipLabel: {
    color: colors.textPrimary,
    fontSize: typography.body,
    fontWeight: "500",
    lineHeight: 20,
  },
});
