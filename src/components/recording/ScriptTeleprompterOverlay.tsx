import { Component, Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Pressable, StyleSheet, Text, View, type LayoutChangeEvent, type TextStyle } from "react-native";
import Animated, { cancelAnimation, Easing, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import { BlurView } from "expo-blur";
import MaskedView from "@react-native-masked-view/masked-view";
import { tokenizeScript, type Script } from "../../domain/scriptTypes";
import { fillPlaceholder, filterMarks, marksByWord, type MarkLevel, type WordMarks } from "../../domain/cadence/marks";
import { getUserProfile } from "../../services/prefs/prefsStore";
import { darkColors as colors, radii, spacing, typography } from "../../theme/theme";
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
  markLevel: MarkLevel;
  isRecording: boolean;
  // Space at the bottom kept clear for the record controls.
  bottomInset: number;
}

const FONT_SIZE = 22;
const LINE_HEIGHT = 34;
const PANEL_FRACTION = 0.3; // each top/bottom panel covers 30% of the text area
// See the note in the original prototype: a fully opaque outer edge is the
// only value that reliably hides the text layer underneath.
const PANEL_OPACITY = 1;
// Reading with the marked pauses takes longer than the plain ~130 wpm the
// target is based on.
const MARKED_PACE_ALLOWANCE = 1.15;
const SPEEDS = [0.8, 1, 1.25] as const;

// Natural pacing: heavier words (and words before a marked pause) take more
// of the time budget, so the clock visits them more slowly.
function computeWordWeights(tokens: string[], words: WordMarks[]): number[] {
  return tokens.map((word, i) => {
    let weight = 1 + word.length * 0.28;
    const gap = words[i]?.gapAfter;
    if (gap === "long_pause") weight += 4;
    else if (gap === "pause") weight += 2;
    else if (/[.!?]["')\]]?$/.test(word)) weight += 3.2;
    else if (/[,;:—–-]["')\]]?$/.test(word)) weight += 1.4;
    if (words[i]?.spans.includes("slow")) weight *= 1.4;
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

function Panel({ side, height }: { side: "top" | "bottom"; height: number }) {
  const darkenColors: [string, string] =
    side === "top" ? [`rgba(8,9,12,${PANEL_OPACITY})`, "rgba(8,9,12,0)"] : ["rgba(8,9,12,0)", `rgba(8,9,12,${PANEL_OPACITY})`];
  const maskColors: [string, string] = side === "top" ? ["white", "transparent"] : ["transparent", "white"];
  return (
    <View pointerEvents="none" style={[styles.panelWrap, side === "top" ? styles.panelTop : styles.panelBottom, { height }]}>
      <MaskedView style={StyleSheet.absoluteFill} maskElement={<LinearGradient colors={maskColors} style={StyleSheet.absoluteFill} />}>
        <BlurView intensity={65} tint="dark" style={StyleSheet.absoluteFill} />
      </MaskedView>
      <LinearGradient colors={darkenColors} style={StyleSheet.absoluteFill} />
    </View>
  );
}

// The Perform teleprompter for a marked speech. The marks render as
// typography (stress bold + underlined, ↗ ↘ after the word, | ‖ ending each
// breath group, which sits on its own line). It scrolls at a pace you
// control — slower/faster, and hold anywhere on the text to pause — and
// never cuts you off; reading with the marks takes as long as it takes.
export function ScriptTeleprompterOverlay({ script, markLevel, isRecording, bottomInset }: ScriptTeleprompterOverlayProps) {
  const tokens = useMemo(() => tokenizeScript(script.text), [script.text]);
  const words = useMemo(() => marksByWord({ text: script.text, marks: filterMarks(script.marks, markLevel) }), [script, markLevel]);
  const cumulativeFractions = useMemo(() => buildCumulativeFractions(computeWordWeights(tokens, words)), [tokens, words]);
  const phraseLines = markLevel !== "none";
  const name = useMemo(() => getUserProfile()?.name?.trim() || undefined, []);

  const [viewportHeight, setViewportHeight] = useState(0);
  const [contentHeight, setContentHeight] = useState(0);
  const [speedIndex, setSpeedIndex] = useState(1);
  const [held, setHeld] = useState(false);
  const scrollY = useSharedValue(0);
  const [currentWordIndex, setCurrentWordIndex] = useState(0);
  const baseDurationMs = script.targetDurationSeconds * 1000 * MARKED_PACE_ALLOWANCE;
  const runningRef = useRef(false);

  // (Re)starts the scroll from wherever it is now, at the chosen speed.
  function run() {
    if (contentHeight <= 0) return;
    const remaining = Math.max(0, contentHeight - scrollY.value);
    runningRef.current = true;
    scrollY.value = withTiming(contentHeight, {
      duration: ((remaining / contentHeight) * baseDurationMs) / SPEEDS[speedIndex],
      easing: Easing.linear,
    });
  }

  useEffect(() => {
    if (!isRecording || contentHeight <= 0 || held) {
      cancelAnimation(scrollY);
      runningRef.current = false;
      return;
    }
    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRecording, contentHeight, held, speedIndex]);

  useEffect(() => {
    if (!isRecording || contentHeight <= 0) return;
    const interval = setInterval(() => {
      const nearest = wordIndexForFraction(cumulativeFractions, scrollY.value / contentHeight);
      setCurrentWordIndex((prev) => (prev === nearest ? prev : nearest));
    }, 80);
    return () => clearInterval(interval);
  }, [isRecording, contentHeight, cumulativeFractions, scrollY]);

  const scrollStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: viewportHeight * 0.38 - scrollY.value }],
  }));

  function handleViewportLayout(event: LayoutChangeEvent) {
    setViewportHeight(event.nativeEvent.layout.height);
  }
  function handleContentLayout(event: LayoutChangeEvent) {
    setContentHeight(event.nativeEvent.layout.height);
  }

  const panelHeight = viewportHeight * PANEL_FRACTION;

  const wordStyle = (w: WordMarks, current: boolean): TextStyle[] => {
    const s: TextStyle[] = [styles.word];
    if (w.spans.includes("louder")) s.push(styles.louder);
    if (w.spans.includes("softer")) s.push(styles.softer);
    if (w.spans.includes("slow")) s.push(styles.slow);
    if (w.spans.includes("fast")) s.push(styles.fast);
    if (w.emphasis) s.push(styles.stress);
    if (current) s.push(styles.currentWord);
    return s;
  };

  return (
    <View style={[styles.wrapper, { bottom: bottomInset }]} onLayout={handleViewportLayout}>
      <View style={styles.baseTint} pointerEvents="none" />

      <Pressable
        style={StyleSheet.absoluteFill}
        onPressIn={() => isRecording && setHeld(true)}
        onPressOut={() => setHeld(false)}
        accessibilityLabel="Hold to pause the scroll"
      >
        <Animated.View onLayout={handleContentLayout} style={[styles.textContent, scrollStyle]}>
          <Text style={styles.paragraph}>
            {words.map((w, index) => (
              <Fragment key={index}>
                {w.note && phraseLines ? <Text style={styles.note}>{`${index > 0 ? "\n" : ""}${w.note}\n`}</Text> : null}
                <Text style={wordStyle(w, isRecording && index === currentWordIndex)}>{fillPlaceholder(w.word, name)}</Text>
                {w.inflection ? <Text style={styles.arrow}>{w.inflection === "rise" ? "↗" : "↘"}</Text> : null}
                {w.gapAfter && phraseLines ? (
                  <Text style={styles.gap}>{w.gapAfter === "long_pause" ? "  ‖\n\n" : "  |\n"}</Text>
                ) : (
                  <Text style={styles.word}> </Text>
                )}
              </Fragment>
            ))}
          </Text>
        </Animated.View>
      </Pressable>

      <PanelErrorBoundary>
        <Panel side="top" height={panelHeight} />
        <Panel side="bottom" height={panelHeight} />
      </PanelErrorBoundary>

      {isRecording ? (
        <View style={styles.controls} pointerEvents="box-none">
          {held ? <Text style={styles.heldText}>Paused — let go to continue</Text> : null}
          <View style={styles.speedRow}>
            <Pressable
              onPress={() => setSpeedIndex((i) => Math.max(0, i - 1))}
              disabled={speedIndex === 0}
              style={[styles.speedButton, speedIndex === 0 && styles.speedDisabled]}
              accessibilityRole="button"
              accessibilityLabel="Scroll slower"
            >
              <Text style={styles.speedText}>Slower</Text>
            </Pressable>
            <Text style={styles.speedValue}>{SPEEDS[speedIndex]}×</Text>
            <Pressable
              onPress={() => setSpeedIndex((i) => Math.min(SPEEDS.length - 1, i + 1))}
              disabled={speedIndex === SPEEDS.length - 1}
              style={[styles.speedButton, speedIndex === SPEEDS.length - 1 && styles.speedDisabled]}
              accessibilityRole="button"
              accessibilityLabel="Scroll faster"
            >
              <Text style={styles.speedText}>Faster</Text>
            </Pressable>
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { position: "absolute", top: 0, left: 0, right: 0, overflow: "hidden" },
  baseTint: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.78)" },
  textContent: { paddingHorizontal: spacing.xl },
  paragraph: { textAlign: "center" },
  word: { color: "white", fontSize: FONT_SIZE, lineHeight: LINE_HEIGHT, fontWeight: "500" },
  stress: { fontWeight: "800", textDecorationLine: "underline" },
  louder: { fontSize: FONT_SIZE * 1.15, fontWeight: "700" },
  softer: { fontSize: FONT_SIZE * 0.88, color: "rgba(255,255,255,0.72)" },
  slow: { letterSpacing: 2.5 },
  fast: { fontStyle: "italic", letterSpacing: -0.3 },
  currentWord: { backgroundColor: colors.accent, color: "white" },
  arrow: { color: colors.skill.cadence.fg, fontSize: FONT_SIZE * 0.8, lineHeight: LINE_HEIGHT, fontWeight: "700" },
  gap: { color: colors.skill.cadence.fg, fontSize: FONT_SIZE, lineHeight: LINE_HEIGHT, fontWeight: "300" },
  note: { color: colors.textMuted, fontSize: typography.caption, lineHeight: 22, fontStyle: "italic" },
  panelWrap: { position: "absolute", left: 0, right: 0, overflow: "hidden" },
  panelTop: { top: 0 },
  panelBottom: { bottom: 0 },
  controls: { position: "absolute", left: 0, right: 0, bottom: spacing.sm, alignItems: "center", gap: spacing.xs },
  heldText: { color: colors.textPrimary, fontSize: typography.caption, fontWeight: "600" },
  speedRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  speedButton: { paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: radii.pill ?? 999, backgroundColor: "rgba(255,255,255,0.12)" },
  speedDisabled: { opacity: 0.35 },
  speedText: { color: colors.textPrimary, fontSize: typography.caption, fontWeight: "600" },
  speedValue: { color: colors.textSecondary, fontSize: typography.caption, fontWeight: "700", minWidth: 40, textAlign: "center" },
});
