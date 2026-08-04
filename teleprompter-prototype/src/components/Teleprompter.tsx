import { useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  animate,
  motion,
  useMotionValue,
  useMotionValueEvent,
  useTransform,
  AnimatePresence,
  type AnimationPlaybackControls,
} from "motion/react";
import {
  Flame,
  Hourglass,
  Pause as PauseIcon,
  TrendingDown,
  TrendingUp,
  Volume1,
  Volume2,
} from "lucide-react";
import { tokenizeScript, type Script, type ScriptCue, type CueType } from "@/data/sampleScript";
import { cn } from "@/lib/utils";

const CUE_ICON: Record<CueType, typeof TrendingUp> = {
  pitch_up: TrendingUp,
  pitch_down: TrendingDown,
  volume_up: Volume2,
  volume_down: Volume1,
  pause: PauseIcon,
  emphasis: Flame,
  slow_down: Hourglass,
};

const CUE_LABEL: Record<CueType, string> = {
  pitch_up: "Pitch up",
  pitch_down: "Pitch down",
  volume_up: "Louder",
  volume_down: "Softer",
  pause: "Pause",
  emphasis: "Emphasize",
  slow_down: "Slow down",
};

const CUE_LOOKAHEAD_WORDS = 8;
const CUE_TRAILING_WORDS = 3;

function findActiveCue(cues: ScriptCue[], currentWordIndex: number): ScriptCue | undefined {
  return cues
    .filter((cue) => {
      const distance = cue.wordIndex - currentWordIndex;
      return distance >= -CUE_TRAILING_WORDS && distance <= CUE_LOOKAHEAD_WORDS;
    })
    .sort((a, b) => a.wordIndex - b.wordIndex)[0];
}

// Natural pacing: a flat "totalDuration / wordCount per word" clock is what
// felt robotic — real speech lingers on longer words and pauses after
// punctuation. Each word gets a weight (length + a bonus for trailing
// punctuation); the cumulative, normalized weights become the timing curve —
// heavier words consume more of the time budget, so the clock visits them
// more slowly without needing any per-frame logic.
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

export interface TeleprompterProps {
  script: Script;
  cuesEnabled: boolean;
  lineHeight: number;
  fontSize: number;
  panelFraction: number; // 0-0.5, how much of the screen each top/bottom panel covers
  solidFraction: number; // 0-1, how much of EACH panel is flat solid vs. the blurred transition strip
  playToken: number; // bump to (re)start playback from current position
  playbackRate: number;
  isPlaying: boolean;
  onProgress?: (elapsedSeconds: number) => void;
  onDone?: () => void;
  seekTo?: number | null; // seconds, set to jump the scroll position
}

// Most of each panel is just flat, solid black — a plain div, zero risk of
// banding because there's nothing gradient-y about it. Only a thin strip
// right at the boundary with the clear middle does any blur work. How much
// is "most" is tunable (see Teleprompter's solidFraction prop) rather than
// fixed, since a wider transition strip = a softer/longer fade and a
// narrower one = a crisper, more sudden reveal.
const PANEL_OPACITY = 0.97;

// The actual anti-seam technique (ported from reactbits.dev's GradualBlur):
// non-overlapping bands — each with its own flat blur and a hard edge where
// the next one starts — is exactly what reads as "sectioned," because
// there's a literal discontinuity at every boundary. The fix is to give each
// layer a WIDE mask-image window that overlaps its neighbors on both sides
// (transparent -> opaque -> opaque -> transparent, sliding forward by one
// increment per layer) instead of a tight non-overlapping slice. At any given
// point, 2-3 layers are always partially visible and blending together, so
// the blur strength drifts continuously instead of jumping between fixed
// values at hard cutoffs.
const TRANSITION_LAYER_COUNT = 8;
const MAX_BLUR_PX = 14;

const easeInOut = (p: number) => (p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2);

function buildBlurLayers(direction: "to top" | "to bottom") {
  const increment = 100 / TRANSITION_LAYER_COUNT;
  return Array.from({ length: TRANSITION_LAYER_COUNT }, (_, idx) => {
    const i = idx + 1;
    const blur = easeInOut(i / TRANSITION_LAYER_COUNT) * MAX_BLUR_PX;
    const p1 = Math.max(0, increment * i - increment);
    const p2 = increment * i;
    const p3 = increment * i + increment;
    const p4 = increment * i + increment * 2;
    let stops = `transparent ${p1}%, black ${p2}%`;
    if (p3 <= 100) stops += `, black ${p3}%`;
    if (p4 <= 100) stops += `, transparent ${p4}%`;
    const mask = `linear-gradient(${direction}, ${stops})`;
    return { blur, mask };
  });
}

function Panel({
  side,
  height,
  solidFraction,
}: {
  side: "top" | "bottom";
  height: number;
  solidFraction: number;
}) {
  const solidHeight = height * solidFraction;
  const transitionHeight = height - solidHeight;

  // "to bottom" for the bottom panel means position 0% (least blur) sits at
  // the strip's own top — which is the boundary with the clear middle there.
  // The top panel's strip is mirrored (its "near middle" edge is at its own
  // BOTTOM), so it just uses "to top" instead — same layer loop, flipped
  // gradient direction, no need to reorder anything.
  const layers = useMemo(() => buildBlurLayers(side === "top" ? "to top" : "to bottom"), [side]);

  const transitionGradient =
    side === "top"
      ? `linear-gradient(to bottom, rgba(8,9,12,${PANEL_OPACITY}), rgba(8,9,12,0))`
      : `linear-gradient(to bottom, rgba(8,9,12,0), rgba(8,9,12,${PANEL_OPACITY}))`;

  return (
    <div
      className={cn("pointer-events-none absolute inset-x-0", side === "top" ? "top-0" : "bottom-0")}
      style={{ height }}
    >
      {side === "top" ? (
        <div className="absolute inset-x-0 top-0" style={{ height: solidHeight, background: `rgba(8,9,12,${PANEL_OPACITY})` }} />
      ) : null}

      <div
        className="absolute inset-x-0"
        style={{ top: side === "top" ? solidHeight : 0, height: transitionHeight }}
      >
        {layers.map((layer, i) => (
          <div
            key={i}
            className="absolute inset-0"
            style={{
              backdropFilter: `blur(${layer.blur}px)`,
              WebkitBackdropFilter: `blur(${layer.blur}px)`,
              maskImage: layer.mask,
              WebkitMaskImage: layer.mask,
            }}
          />
        ))}
        <div className="absolute inset-0" style={{ background: transitionGradient }} />
      </div>

      {side === "bottom" ? (
        <div
          className="absolute inset-x-0 bottom-0"
          style={{ height: solidHeight, background: `rgba(8,9,12,${PANEL_OPACITY})` }}
        />
      ) : null}
    </div>
  );
}

// Deliberately simple, three-band mental model:
//   1. A solid panel covers the top third of the screen.
//   2. A mirrored solid panel covers the bottom third.
//   3. The middle third is fully open, with a fade+blur seam where each
//      panel meets it.
// The scrolling text is ONE plain layer underneath all of that — the panels
// are what hide/reveal it, not per-word opacity tricks on the text itself.
export function Teleprompter({
  script,
  cuesEnabled,
  lineHeight,
  fontSize,
  panelFraction,
  solidFraction,
  playToken,
  playbackRate,
  isPlaying,
  onProgress,
  onDone,
  seekTo,
}: TeleprompterProps) {
  const tokens = useMemo(() => tokenizeScript(script.text), [script.text]);

  const cumulativeFractions = useMemo(() => buildCumulativeFractions(computeWordWeights(tokens)), [tokens]);

  const wrapRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [viewportHeight, setViewportHeight] = useState(0);
  const [maxScroll, setMaxScroll] = useState(0);

  useLayoutEffect(() => {
    const wrap = wrapRef.current;
    const container = containerRef.current;
    if (!wrap || !container) return;
    const vh = wrap.clientHeight;
    setViewportHeight(vh);
    setMaxScroll(Math.max(0, container.scrollHeight - vh));
  }, [tokens, fontSize, lineHeight]);

  const scrollY = useMotionValue(0);
  const controlsRef = useRef<AnimationPlaybackControls | null>(null);
  const [currentWordIndex, setCurrentWordIndex] = useState(0);

  useMotionValueEvent(scrollY, "change", (latest) => {
    const fraction = latest / Math.max(1, maxScroll);
    const nearest = wordIndexForFraction(cumulativeFractions, fraction);
    setCurrentWordIndex((prev) => (prev === nearest ? prev : nearest));
    onProgress?.(fraction * script.targetDurationSeconds);
  });

  useLayoutEffect(() => {
    controlsRef.current?.stop();
    if (!isPlaying || maxScroll === 0) return;
    const remainingFraction = 1 - scrollY.get() / maxScroll;
    const duration = (script.targetDurationSeconds * remainingFraction) / playbackRate;
    controlsRef.current = animate(scrollY, maxScroll, {
      duration: Math.max(0, duration),
      ease: "linear",
      onComplete: () => onDone?.(),
    });
    return () => controlsRef.current?.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playToken, isPlaying, maxScroll]);

  useLayoutEffect(() => {
    if (seekTo == null || maxScroll === 0) return;
    controlsRef.current?.stop();
    const fraction = Math.min(1, seekTo / script.targetDurationSeconds);
    scrollY.set(fraction * maxScroll);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seekTo, maxScroll]);

  const y = useTransform(scrollY, (v) => -v);
  const activeCue = cuesEnabled ? findActiveCue(script.cues, currentWordIndex) : undefined;
  const ActiveCueIcon = activeCue ? CUE_ICON[activeCue.type] : null;

  const panelHeight = viewportHeight * panelFraction;

  return (
    <div ref={wrapRef} className="relative h-full w-full overflow-hidden">
      {/* Base dark tint over the whole camera area */}
      <div className="absolute inset-0 bg-black/55" />

      {/* The scrolling text — ONE plain layer, no masks or duplicates on it.
          It just scrolls; the panels above it do all the hiding. */}
      <motion.div
        ref={containerRef}
        style={{ y, paddingTop: viewportHeight / 2, paddingBottom: viewportHeight / 2 }}
        className="px-6"
      >
        <p
          className="text-center font-semibold tracking-wide text-balance text-white"
          style={{ fontSize, lineHeight: `${lineHeight}px` }}
        >
          {tokens.map((word, index) => (
            <span
              key={index}
              className={cn(
                "transition-[background-color] duration-150",
                index === currentWordIndex && "rounded-md bg-indigo-500 px-1.5 py-0.5",
              )}
            >
              {word}{" "}
            </span>
          ))}
        </p>
      </motion.div>

      {/* Top/bottom panels: each sliced into bands with progressively more
          blur + opacity moving away from the clear middle, faking a smooth
          blur gradient (backdrop-filter itself only takes one flat value). */}
      <Panel side="top" height={panelHeight} solidFraction={solidFraction} />
      <Panel side="bottom" height={panelHeight} solidFraction={solidFraction} />

      <AnimatePresence mode="wait">
        {activeCue ? (
          <motion.div
            key={activeCue.wordIndex}
            initial={{ opacity: 0, y: 6, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.97 }}
            transition={{ duration: 0.22, ease: "easeOut" }}
            className="absolute bottom-40 left-1/2 flex max-w-[90%] -translate-x-1/2 items-center gap-2.5 rounded-2xl border border-indigo-400/30 bg-neutral-900/90 px-3.5 py-2 shadow-lg shadow-black/40 backdrop-blur-sm"
          >
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-indigo-500/15">
              {ActiveCueIcon ? <ActiveCueIcon size={14} className="text-indigo-400" /> : null}
            </span>
            <span className="flex flex-col gap-0.5 text-left">
              <span className="text-[10px] font-extrabold tracking-wider text-indigo-400 uppercase">
                {CUE_LABEL[activeCue.type]}
              </span>
              <span className="text-xs leading-snug font-medium text-neutral-100">{activeCue.label}</span>
            </span>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
