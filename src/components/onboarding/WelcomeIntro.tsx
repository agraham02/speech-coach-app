import { useEffect, useRef, useState, type ReactNode } from "react";
import { ScrollView, useWindowDimensions, View, type NativeScrollEvent, type NativeSyntheticEvent } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import Animated, {
  Easing,
  FadeIn,
  type SharedValue,
  FadeInDown,
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import Svg, { Circle, Rect } from "react-native-svg";
import { Aura } from "../common/Aura";
import { PrimaryButton } from "../common/PrimaryButton";
import { PressableScale } from "../common/PressableScale";
import { ProgressRing } from "../common/ProgressRing";
import { SkillRings } from "../common/SkillRings";
import { Txt } from "../common/Txt";
import { SKILL_LABELS, type SkillId } from "../../theme/tokens";
import { duration, easeOut, spring } from "../../theme/motion";
import { tick } from "../../utils/haptics";
import { makeStyles, useTheme } from "../../theme/ThemeProvider";

// The first thing a new person sees: what Tono is, what a day of it looks
// like, and why it works — before any questions. Swipe or tap through; the
// last page is the old welcome, which leads into onboarding. Each page's
// picture plays when you reach it.

interface Page {
  eyebrow?: string;
  title: string;
  body: string;
  art: (active: boolean) => ReactNode;
}

const PAGES: Page[] = [
  {
    title: "Tono",
    body: "Your speaking coach, in your pocket. A few minutes a day to get clearer, calmer and quicker on your feet.",
    art: (active) => <BrandMark play={active} />,
  },
  {
    eyebrow: "Every day",
    title: "A short plan, made for you",
    body: "Each session takes 5 to 12 minutes: a warm-up, a line to say with feeling, then a lesson picked for what you need next. It gets harder as you get better.",
    art: (active) => <PlanSteps play={active} />,
  },
  {
    eyebrow: "After every take",
    title: "Feedback you can act on",
    body: "Record yourself answering a prompt. An AI coach watches the video for structure, tone and presence, and your phone measures pace, pauses, fillers and eye contact. You get a score, a strength, and one thing to fix.",
    art: (active) => <ScorePreview play={active} />,
  },
  {
    eyebrow: "Real situations",
    title: "Practice the hard parts",
    body: "Answer questions you haven't seen, keep a back-and-forth going, read lines marked for stress and pauses, and recall your day out loud. It's built for rambling, blanking and nerves.",
    art: (active) => <SkillChips play={active} />,
  },
  {
    eyebrow: "Over weeks",
    title: "Watch yourself improve",
    body: "Five skills that rise as you beat your level, a streak with freezes for busy days, and progress videos so you can see how far you've come.",
    art: (active) => (active ? <SkillRings mastery={{ articulation: 46, cadence: 38, impromptu: 52, confidence: 41, conversation: 34 }} /> : null),
  },
];

export function WelcomeIntro({ onDone }: { onDone: () => void }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const scroller = useRef<ScrollView>(null);
  const [page, setPage] = useState(0);
  const total = PAGES.length + 1;
  const last = page === total - 1;

  function goTo(index: number) {
    scroller.current?.scrollTo({ x: index * width, animated: true });
    setPage(index);
  }

  function onScrollEnd(e: NativeSyntheticEvent<NativeScrollEvent>) {
    const index = Math.round(e.nativeEvent.contentOffset.x / width);
    if (index !== page) {
      tick();
      setPage(index);
    }
  }

  return (
    <View style={styles.root}>
      <Aura color={colors.skill.cadence.fg} secondary={colors.skill.conversation.fg} strength={0.42} at={{ x: 0.2, y: 0.1 }} />
      <SafeAreaView style={styles.safe}>
        <View style={styles.topBar}>
          {!last ? (
            <PressableScale onPress={() => goTo(total - 1)} hitSlop={12} accessibilityRole="button" accessibilityLabel="Skip the introduction">
              <Txt variant="subhead" weight="500" tone="secondary">
                Skip
              </Txt>
            </PressableScale>
          ) : null}
        </View>
        <ScrollView
          ref={scroller}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={onScrollEnd}
          style={styles.flex}
        >
          {PAGES.map((p, i) => (
            <View key={p.title} style={[styles.page, { width }]} accessibilityElementsHidden={i !== page} importantForAccessibility={i === page ? "auto" : "no-hide-descendants"}>
              <View style={styles.art}>{p.art(i === page)}</View>
              {i === page ? (
                <Animated.View entering={FadeInDown.duration(duration.slow).easing(easeOut).withInitialValues({ transform: [{ translateY: 12 }] })} style={styles.copy}>
                  {p.eyebrow ? (
                    <Txt variant="footnote" weight="500" tone="secondary">
                      {p.eyebrow}
                    </Txt>
                  ) : null}
                  <Txt variant={i === 0 ? "display" : "title1"} style={i === 0 ? styles.brandTitle : undefined}>
                    {p.title}
                  </Txt>
                  <Txt variant="body" tone="secondary">
                    {p.body}
                  </Txt>
                </Animated.View>
              ) : (
                <View style={styles.copy} />
              )}
            </View>
          ))}
          <View style={[styles.page, styles.finalPage, { width }]}>
            {last ? (
              <Animated.View entering={FadeIn.duration(duration.slow)} style={styles.copy}>
                <Waveform />
                <Txt variant="display" style={styles.welcomeTitle}>
                  Speaking well is a skill, not a trait.
                </Txt>
                <Txt variant="body" tone="secondary">
                  First, a few questions (about three minutes), a quick camera and mic check, then a short skill check so your plan starts where you are. Nothing is graded, and you can skip anything.
                </Txt>
              </Animated.View>
            ) : null}
          </View>
        </ScrollView>
        <View style={styles.footer}>
          <View style={styles.dots} accessibilityLabel={`Page ${page + 1} of ${total}`}>
            {Array.from({ length: total }, (_, i) => (
              <Dot key={i} active={i === page} />
            ))}
          </View>
          <PrimaryButton label={last ? "Let's start" : "Next"} iconRight="arrow-forward" onPress={() => (last ? onDone() : goTo(page + 1))} />
        </View>
      </SafeAreaView>
    </View>
  );
}

function Dot({ active }: { active: boolean }) {
  const styles = useStyles();
  const w = useSharedValue(active ? 22 : 7);
  useEffect(() => {
    w.value = withSpring(active ? 22 : 7, spring.gentle);
  }, [active, w]);
  const style = useAnimatedStyle(() => ({ width: w.value }));
  return <Animated.View style={[styles.dot, active && styles.dotActive, style]} />;
}

// --- The pictures ------------------------------------------------------------

const AnimatedRect = Animated.createAnimatedComponent(Rect);
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

// The Tono mark, the same geometry as assets/brand/render.py: a waveform of
// a phrase that rises, falls and lands, and the red stop as its last beat,
// all on one baseline.
const BASELINE = 631;
const BAR_WIDTH = 52;
const BAR_STEP = 78;
const BAR_HEIGHTS = [96, 184, 262, 196, 150, 170, 124];
const FIRST_BAR_X = 200;
const STOP_RADIUS = 39;
const STOP_CX = FIRST_BAR_X + BAR_HEIGHTS.length * BAR_STEP + STOP_RADIUS;
// The bars rise one beat apart; the stop lands on the next beat.
const BEAT_MS = 70;
const FIRST_BEAT_MS = 150;
const RISE_MS = 420;
const TOTAL_MS = FIRST_BEAT_MS + BAR_HEIGHTS.length * BEAT_MS + RISE_MS;

function BrandMark({ play }: { play: boolean }) {
  const { colors } = useTheme();
  const clock = useSharedValue(0);
  const dot = useSharedValue(0);
  useEffect(() => {
    if (!play) return;
    clock.value = 0;
    dot.value = 0;
    clock.value = withTiming(TOTAL_MS, { duration: TOTAL_MS, easing: Easing.linear });
    dot.value = withDelay(FIRST_BEAT_MS + BAR_HEIGHTS.length * BEAT_MS, withSpring(1, { damping: 9, stiffness: 220, mass: 0.7 }));
  }, [play, clock, dot]);
  const stop = useAnimatedProps(() => ({ r: STOP_RADIUS * dot.value }));
  return (
    // The mark's box (200 369 624 262) with room around it for the overshoot.
    <Svg width={210} height={100} viewBox="180 336 664 316" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {BAR_HEIGHTS.map((h, i) => (
        <BeatBar key={i} index={i} height={h} clock={clock} color={colors.textPrimary} />
      ))}
      <AnimatedCircle cx={STOP_CX} cy={BASELINE - STOP_RADIUS} fill={colors.record} animatedProps={stop} />
    </Svg>
  );
}

// One bar, rising from the baseline with a small overshoot on its beat.
function BeatBar({ index, height, clock, color }: { index: number; height: number; clock: SharedValue<number>; color: string }) {
  const props = useAnimatedProps(() => {
    const x = Math.min(1, Math.max(0, (clock.value - FIRST_BEAT_MS - index * BEAT_MS) / RISE_MS)) - 1;
    // easeOutBack
    const rise = 1 + 2.2 * x * x * x + 1.2 * x * x;
    const h = Math.max(0, height * rise);
    return { y: BASELINE - h, height: h };
  });
  return <AnimatedRect x={FIRST_BAR_X + index * BAR_STEP} width={BAR_WIDTH} rx={BAR_WIDTH / 2} fill={color} animatedProps={props} />;
}

const PLAN = [
  { icon: "flame-outline" as const, label: "Warm-up", detail: "Breath and voice" },
  { icon: "musical-notes-outline" as const, label: "Line of the day", detail: "Stress, pauses and pitch" },
  { icon: "school-outline" as const, label: "Lesson", detail: "Learn a move, then use it" },
];

function PlanSteps({ play }: { play: boolean }) {
  const styles = useStyles();
  const { colors } = useTheme();
  if (!play) return null;
  return (
    <View style={styles.planCard}>
      {PLAN.map((s, i) => (
        <Animated.View
          key={s.label}
          entering={FadeInDown.delay(150 + i * 220).duration(duration.slow).easing(easeOut).withInitialValues({ transform: [{ translateY: 10 }] })}
          style={styles.planRow}
        >
          <View style={styles.planIcon}>
            <Ionicons name={s.icon} size={18} color={colors.textPrimary} />
          </View>
          <View style={styles.flex}>
            <Txt variant="headline">{s.label}</Txt>
            <Txt variant="footnote" tone="secondary">
              {s.detail}
            </Txt>
          </View>
          <Ionicons name="checkmark-circle" size={20} color={colors.success} />
        </Animated.View>
      ))}
    </View>
  );
}

const SAMPLE_BARS: { label: string; value: number; skill: SkillId }[] = [
  { label: "Structure", value: 0.78, skill: "impromptu" },
  { label: "Pace and pauses", value: 0.66, skill: "cadence" },
  { label: "Eye contact", value: 0.84, skill: "confidence" },
];

function ScorePreview({ play }: { play: boolean }) {
  const styles = useStyles();
  const { colors } = useTheme();
  if (!play) return null;
  return (
    <View style={styles.scoreRow}>
      <ProgressRing size={112} strokeWidth={7} progress={0.74} color={colors.success}>
        <Txt variant="title1" tabular>
          7.4
        </Txt>
      </ProgressRing>
      <View style={styles.bars}>
        {SAMPLE_BARS.map((b, i) => (
          <View key={b.label} style={styles.barRow}>
            <Txt variant="footnote" tone="secondary">
              {b.label}
            </Txt>
            <GrowingBar value={b.value} color={colors.skill[b.skill].fg} delay={300 + i * 160} />
          </View>
        ))}
      </View>
    </View>
  );
}

function GrowingBar({ value, color, delay }: { value: number; color: string; delay: number }) {
  const styles = useStyles();
  const w = useSharedValue(0);
  useEffect(() => {
    w.value = withDelay(delay, withTiming(value, { duration: duration.slow * 2, easing: easeOut }));
  }, [value, delay, w]);
  const style = useAnimatedStyle(() => ({ width: `${w.value * 100}%` }));
  return (
    <View style={styles.barTrack}>
      <Animated.View style={[styles.barFill, { backgroundColor: color }, style]} />
    </View>
  );
}

const CHIPS: SkillId[] = ["impromptu", "conversation", "cadence", "articulation", "confidence"];

function SkillChips({ play }: { play: boolean }) {
  const styles = useStyles();
  const { colors } = useTheme();
  if (!play) return null;
  return (
    <View style={styles.chips}>
      {CHIPS.map((s, i) => (
        <Animated.View
          key={s}
          entering={FadeInDown.delay(100 + i * 120).springify().damping(14)}
          style={[styles.chip, { backgroundColor: colors.skill[s].bg }]}
        >
          <View style={[styles.chipDot, { backgroundColor: colors.skill[s].fg }]} />
          <Txt variant="subhead" weight="600" color={colors.skill[s].fg}>
            {SKILL_LABELS[s]}
          </Txt>
        </Animated.View>
      ))}
    </View>
  );
}

// The last page's flourish: a voice's waveform rising into place.
const BARS = [0.35, 0.6, 0.45, 0.85, 1, 0.7, 0.5, 0.8, 0.55, 0.3, 0.65, 0.4];
export function Waveform() {
  const styles = useStyles();
  return (
    <View style={styles.wave} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {BARS.map((h, i) => (
        <WaveBar key={i} height={h} index={i} />
      ))}
    </View>
  );
}

function WaveBar({ height, index }: { height: number; index: number }) {
  const styles = useStyles();
  const v = useSharedValue(0.08);
  useEffect(() => {
    v.value = withDelay(200 + index * 45, withSpring(height, spring.gentle));
  }, [height, index, v]);
  const style = useAnimatedStyle(() => ({ height: 56 * v.value }));
  return <Animated.View style={[styles.waveBar, style]} />;
}

const useStyles = makeStyles((t) => ({
  root: { flex: 1, backgroundColor: t.colors.background },
  safe: { flex: 1 },
  flex: { flex: 1 },
  topBar: { height: 44, flexDirection: "row", justifyContent: "flex-end", alignItems: "center", paddingHorizontal: t.layout.gutter },
  page: { flex: 1, paddingHorizontal: t.layout.gutter, justifyContent: "center", gap: t.space.xl },
  finalPage: { justifyContent: "center" },
  // Fixed height, so the words sit at the same place on every page.
  art: { height: 220, justifyContent: "center", alignItems: "center" },
  copy: { gap: t.space.sm, minHeight: 200 },
  brandTitle: { fontSize: 56, lineHeight: 62, letterSpacing: -2.2 },
  welcomeTitle: { fontSize: 44, lineHeight: 50, letterSpacing: -1.6, marginTop: t.space.lg },
  footer: { paddingHorizontal: t.layout.gutter, paddingBottom: t.space.md, gap: t.space.lg },
  dots: { flexDirection: "row", justifyContent: "center", gap: 6 },
  dot: { height: 7, borderRadius: 4, backgroundColor: t.colors.textMuted, opacity: 0.45 },
  dotActive: { backgroundColor: t.colors.textPrimary, opacity: 1 },
  planCard: { alignSelf: "stretch", gap: t.space.md, padding: t.space.md, borderRadius: t.radius.lg, backgroundColor: t.colors.surface },
  planRow: { flexDirection: "row", alignItems: "center", gap: t.space.md },
  planIcon: { width: 36, height: 36, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: t.colors.surfaceRaised },
  scoreRow: { flexDirection: "row", alignItems: "center", gap: t.space.lg, alignSelf: "stretch" },
  bars: { flex: 1, gap: t.space.md },
  barRow: { gap: 6 },
  barTrack: { height: 6, borderRadius: 3, backgroundColor: t.colors.surfaceRaised, overflow: "hidden" },
  barFill: { height: 6, borderRadius: 3 },
  chips: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: t.space.sm },
  chip: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: t.space.md, paddingVertical: t.space.sm + 2, borderRadius: t.radius.pill },
  chipDot: { width: 8, height: 8, borderRadius: 4 },
  wave: { flexDirection: "row", alignItems: "center", gap: 5, height: 56 },
  waveBar: { width: 5, borderRadius: 3, backgroundColor: t.colors.textPrimary },
}));
