import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ScrollView, Text, View, type LayoutChangeEvent } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import Animated, { FadeIn, FadeOut, useReducedMotion } from "react-native-reanimated";
import type { TranscriptWord } from "../../domain/sessionTypes";
import { activeWordIndex, seekTargetForWord } from "../../domain/playback/followAlong";
import { PressableScale } from "../common/PressableScale";
import { Txt } from "../common/Txt";
import { makeStyles, useTheme } from "../../theme/ThemeProvider";
import { withAlpha } from "../../utils/color";

// One line of the transcript. The box shows seven of them: the middle five
// clear, the top and bottom one fading out.
export const LINE_HEIGHT = 27;
const VISIBLE_LINES = 7;
const BOX_HEIGHT = LINE_HEIGHT * VISIBLE_LINES;
const FADE_HEIGHT = LINE_HEIGHT * 1.4;
// The current line sits this many lines from the top of the box.
const FOLLOW_LINE = 2;

type WordState = "said" | "current" | "ahead";

interface FollowAlongTranscriptProps {
  words: TranscriptWord[] | null;
  // Shown, still, when there are no word timings.
  fallbackText: string | null;
  positionMs: number;
  // Has playback started (or been moved) — before that nothing is marked.
  started: boolean;
  onSeek: (ms: number) => void;
  // The surface behind the box, for the fades.
  background: string;
}

// The transcript of a take, following the playback: words already said are
// full ink, the current one is marked, the rest wait in a lighter tone. Tap
// a word to jump there. It keeps the current line in view; scroll it by
// hand and it stops following until you tap "Back to now".
export function FollowAlongTranscript({ words, fallbackText, positionMs, started, onSeek, background }: FollowAlongTranscriptProps) {
  const styles = useStyles();
  const { colors } = useTheme();
  const reduceMotion = useReducedMotion();
  const scroll = useRef<ScrollView>(null);
  const lineTops = useRef<number[]>([]);
  const lastScrolledTop = useRef<number | null>(null);
  const [following, setFollowing] = useState(true);

  const timed = !!words?.length;
  const active = timed && started ? activeWordIndex(words!, positionMs) : -1;

  const onSeekRef = useRef(onSeek);
  onSeekRef.current = onSeek;
  const onWord = useCallback(
    (index: number) => {
      const word = words?.[index];
      if (!word) return;
      setFollowing(true);
      lastScrolledTop.current = null;
      onSeekRef.current(seekTargetForWord(word));
    },
    [words],
  );

  const onWordLayout = useCallback((index: number, top: number) => {
    lineTops.current[index] = top;
  }, []);

  useEffect(() => {
    lineTops.current = [];
    lastScrolledTop.current = null;
  }, [words]);

  // Scroll only when the current word moves to another line, so the box
  // steps line by line instead of twitching every word.
  useEffect(() => {
    if (!following || active < 0) return;
    const top = lineTops.current[active];
    if (top == null || top === lastScrolledTop.current) return;
    lastScrolledTop.current = top;
    // `top` is within the words; the content starts a line down (padding).
    scroll.current?.scrollTo({ y: Math.max(0, LINE_HEIGHT + top - FOLLOW_LINE * LINE_HEIGHT), animated: !reduceMotion });
  }, [active, following, reduceMotion]);

  // Rebuilt only when the current word changes, not on every position tick.
  const rendered = useMemo(
    () =>
      words?.map((w, i) => (
        <Word key={i} index={i} text={w.text} state={i < active ? "said" : i === active ? "current" : started ? "ahead" : "said"} onPress={onWord} onTop={onWordLayout} />
      )),
    [words, active, started, onWord, onWordLayout],
  );

  const spokenText = useMemo(() => (timed ? words!.map((w) => w.text).join(" ") : fallbackText ?? ""), [timed, words, fallbackText]);

  return (
    <View style={styles.box}>
      <ScrollView
        ref={scroll}
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        nestedScrollEnabled
        onScrollBeginDrag={() => timed && setFollowing(false)}
        scrollEventThrottle={64}
      >
        {timed ? (
          <View
            style={styles.words}
            accessible
            accessibilityRole="text"
            accessibilityLabel={spokenText}
            accessibilityHint="The transcript of this take. Use the playback position to move through it."
          >
            {rendered}
          </View>
        ) : (
          <Text style={styles.plain}>{fallbackText ?? ""}</Text>
        )}
      </ScrollView>

      <LinearGradient colors={[background, withAlpha(background, 0)]} style={[styles.fade, styles.fadeTop]} pointerEvents="none" />
      <LinearGradient colors={[withAlpha(background, 0), background]} style={[styles.fade, styles.fadeBottom]} pointerEvents="none" />

      {!following && active >= 0 ? (
        <Animated.View entering={reduceMotion ? undefined : FadeIn.duration(160)} exiting={reduceMotion ? undefined : FadeOut.duration(120)} style={styles.nowWrap}>
          <PressableScale
            onPress={() => {
              lastScrolledTop.current = null;
              setFollowing(true);
            }}
            style={styles.now}
            accessibilityRole="button"
            accessibilityLabel="Back to the current word"
          >
            <Ionicons name="locate-outline" size={14} color={colors.onAccent} />
            <Txt variant="caption1" tone="onAccent">
              Back to now
            </Txt>
          </PressableScale>
        </Animated.View>
      ) : null}
    </View>
  );
}

// A word on its own, so changing the marked word re-renders two of these,
// not the whole transcript.
const Word = memo(function Word({
  index,
  text,
  state,
  onPress,
  onTop,
}: {
  index: number;
  text: string;
  state: WordState;
  onPress: (index: number) => void;
  onTop: (index: number, top: number) => void;
}) {
  const styles = useStyles();
  return (
    <Text
      onPress={() => onPress(index)}
      onLayout={(e: LayoutChangeEvent) => onTop(index, e.nativeEvent.layout.y)}
      suppressHighlighting
      style={[styles.word, state === "current" ? styles.current : state === "ahead" ? styles.ahead : styles.said]}
    >
      {text}
    </Text>
  );
});

const useStyles = makeStyles((t) => ({
  box: { height: BOX_HEIGHT, overflow: "hidden" },
  scroll: { flex: 1 },
  // A faded line's worth of space above and below, so the first and last
  // lines can scroll clear of the fades.
  content: { paddingVertical: LINE_HEIGHT },
  words: { flexDirection: "row", flexWrap: "wrap" },
  // Spoken words are set in medium (design language). Every word carries the
  // same padding, so marking one never reflows the line.
  word: {
    ...t.font("500"),
    fontSize: 17,
    lineHeight: LINE_HEIGHT,
    letterSpacing: -0.1,
    paddingHorizontal: 3,
    marginRight: 1,
    borderRadius: 6,
    overflow: "hidden",
  },
  said: { color: t.colors.textPrimary },
  ahead: { color: t.colors.textMuted },
  current: { color: t.colors.textPrimary, backgroundColor: t.colors.accentMuted },
  plain: { ...t.font("500"), fontSize: 17, lineHeight: LINE_HEIGHT, color: t.colors.textSecondary, paddingHorizontal: 3 },
  fade: { position: "absolute", left: 0, right: 0, height: FADE_HEIGHT },
  fadeTop: { top: 0 },
  fadeBottom: { bottom: 0 },
  nowWrap: { position: "absolute", right: 0, bottom: 4 },
  now: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: t.radius.pill,
    backgroundColor: t.colors.accent,
  },
}));
