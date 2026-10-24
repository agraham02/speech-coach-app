import { useState } from "react";
import { Pressable, Switch, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import {
  buildHighlightSegments,
  computeFillerStats,
  detectFillerWords,
  detectRepeatedWordsFromText,
  detectRepeatedWordsFromWords,
  labelForRate,
  locateQuote,
  type AnnotationCategory,
  type LocatedAnnotation,
} from "../../domain/transcriptAnnotations";
import type { AiMark } from "../../domain/results/aiMarks";
import type { TranscriptWord } from "../../domain/sessionTypes";
import { getAnnotationColors, radii, spacing, typography, font } from "../../theme/theme";
import { makeStyles, useTheme } from "../../theme/ThemeProvider";

interface AnnotatedTranscriptProps {
  transcriptVerbatim: string;
  durationSeconds: number;
  fillerWordCount: number | null;
  fillerRatePerMinute: number | null;
  // Word-level timestamps from on-device ASR, if available: the preferred
  // source for repeated-words detection (more reliable than a naive
  // whitespace split); falls back to scanning transcriptVerbatim directly.
  transcriptWords: TranscriptWord[] | null;
  repeatedWordCount: number | null;
  // Tono AI's marks that held up against this transcript (groundAiMarks), and
  // who made them. Empty when the take wasn't judged or none held up.
  aiMarks: AiMark[];
  aiBy: string | null;
}

interface PanelContent {
  category: AnnotationCategory;
  title: string;
  note: string;
}

const CATEGORY_LABELS: Record<AnnotationCategory, string> = {
  filler: "Um or uh",
  filler_contextual: "Maybe a filler",
  structure: "Structure",
  delivery: "Delivery",
  presence: "Presence",
  content: "On the point",
  restated_point: "Repeated idea",
  repeated_words: "Repeated word",
};

// The transcript with what the phone can see in it marked, and, if you ask for
// it, Tono AI's notes. The phone marks fillers (um and uh as one kind; like,
// actually and you know as another, because those are fillers only some of
// the time) and words said twice in a row. Those are counted, not guessed, and
// are always on. Tono AI's marks are off until you turn them on, each one is
// labelled with what it is evidence for and who made it, and only the ones
// whose quote is found, once, in this transcript are offered at all.
export function AnnotatedTranscript({
  transcriptVerbatim,
  durationSeconds,
  fillerWordCount,
  fillerRatePerMinute,
  transcriptWords,
  repeatedWordCount,
  aiMarks,
  aiBy,
}: AnnotatedTranscriptProps) {
  const styles = useStyles();
  const { colors } = useTheme();
  const annotationColors = getAnnotationColors(colors);
  const [showAi, setShowAi] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  // Kept separate from selectedIndex, cleared only after the dismiss
  // animation finishes, so the panel's text fades out with it.
  const [panelContent, setPanelContent] = useState<PanelContent | null>(null);
  const panelProgress = useSharedValue(0);

  const fillerMatches = detectFillerWords(transcriptVerbatim);
  const typed = computeFillerStats(transcriptVerbatim, durationSeconds);
  const stats =
    fillerWordCount !== null && fillerRatePerMinute !== null
      ? { ...typed, count: fillerWordCount, ratePerMinute: fillerRatePerMinute, label: labelForRate(fillerRatePerMinute) }
      : typed;

  const repeatedWordMatches =
    transcriptWords && transcriptWords.length > 0 ? detectRepeatedWordsFromWords(transcriptWords) : detectRepeatedWordsFromText(transcriptVerbatim);
  const repeatedCount = repeatedWordCount ?? repeatedWordMatches.length;

  const nextSearchIndex = new Map<string, number>();
  const located: LocatedAnnotation[] = [
    ...fillerMatches.map((match) => ({
      start: match.start,
      end: match.end,
      category: (match.type === "hesitation" ? "filler" : "filler_contextual") as AnnotationCategory,
      note:
        match.type === "hesitation"
          ? `"${match.word}" is a filler sound. Cut it, or leave a short pause instead.`
          : `"${match.word}" looks like a filler here: it fills a gap instead of adding meaning. It isn't always one, so the phone counts it at half weight.`,
    })),
    ...repeatedWordMatches
      .map((match): LocatedAnnotation | null => {
        const key = match.quote.trim().toLowerCase();
        const span = locateQuote(transcriptVerbatim, match.quote, nextSearchIndex.get(key) ?? 0);
        if (!span) return null;
        nextSearchIndex.set(key, span.end);
        return { ...span, category: "repeated_words" as AnnotationCategory, note: `"${match.quote}": the same word said more than once in a row.` };
      })
      .filter((a): a is NonNullable<typeof a> => a !== null),
    ...(showAi ? aiMarks.map((m): LocatedAnnotation => ({ start: m.start, end: m.end, category: m.category, note: m.note })) : []),
  ];

  const segments = buildHighlightSegments(transcriptVerbatim, located);
  const categoriesPresent = new Set(segments.map((s) => s.category).filter((c): c is AnnotationCategory => c !== null));

  function toggleSegment(index: number) {
    if (selectedIndex === index) {
      dismissPanel();
      return;
    }
    const segment = segments[index];
    if (!segment.category) return;
    const ai = segment.category === "structure" || segment.category === "content" || segment.category === "restated_point";
    const mark = ai ? aiMarks.find((m) => m.note === segment.note) : null;
    setSelectedIndex(index);
    setPanelContent({
      category: segment.category,
      title: ai ? `${mark?.label ?? CATEGORY_LABELS[segment.category]} · ${aiBy ?? "Tono AI"}` : CATEGORY_LABELS[segment.category],
      note: segment.note ?? "",
    });
    panelProgress.value = withTiming(1, { duration: 200 });
  }

  function dismissPanel() {
    setSelectedIndex(null);
    panelProgress.value = withTiming(0, { duration: 180 }, (finished) => {
      if (finished) runOnJS(setPanelContent)(null);
    });
  }

  const panelStyle = useAnimatedStyle(() => ({
    opacity: panelProgress.value,
    transform: [{ translateY: (1 - panelProgress.value) * -8 }],
  }));

  return (
    <View style={styles.container}>
      <Text style={styles.statLine}>
        {stats.count} filler word{stats.count === 1 ? "" : "s"} · {stats.ratePerMinute}/min · {stats.label}
      </Text>
      {typed.count > 0 ? (
        <Text style={styles.statLine}>
          {typed.hesitation.count} um or uh · {typed.contextual.count} like, you know, actually…
        </Text>
      ) : null}
      {repeatedCount > 0 ? (
        <Text style={styles.statLineSecondary}>
          {repeatedCount} repeated word{repeatedCount === 1 ? "" : "s"} in a row
        </Text>
      ) : null}

      {categoriesPresent.size > 0 ? (
        <View style={styles.legend}>
          {Array.from(categoriesPresent).map((category) => (
            <View key={category} style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: annotationColors[category] }]} />
              <Text style={styles.legendText}>{CATEGORY_LABELS[category]}</Text>
            </View>
          ))}
        </View>
      ) : null}

      <Text style={styles.transcript}>
        {segments.map((segment, index) =>
          segment.category ? (
            <Text key={index} style={{ backgroundColor: annotationColors[segment.category], color: colors.textPrimary }} onPress={() => toggleSegment(index)} suppressHighlighting>
              {segment.text}
            </Text>
          ) : (
            <Text key={index}>{segment.text}</Text>
          ),
        )}
      </Text>

      {panelContent ? (
        <Animated.View style={[styles.notePanel, panelStyle]}>
          <View style={styles.notePanelHeader}>
            <Text style={[styles.notePanelLabel, { color: annotationColors[panelContent.category] }]}>{panelContent.title}</Text>
            <Pressable onPress={dismissPanel} hitSlop={12} accessibilityRole="button" accessibilityLabel="Dismiss note">
              <Ionicons name="close" size={16} color={colors.textMuted} />
            </Pressable>
          </View>
          <Text style={styles.notePanelText}>{panelContent.note}</Text>
        </Animated.View>
      ) : null}

      {aiMarks.length > 0 ? (
        <View style={styles.aiRow}>
          <View style={styles.aiText}>
            <Text style={styles.aiTitle}>
              {aiBy ?? "Tono AI"}'s notes ({aiMarks.length})
            </Text>
            <Text style={styles.aiSub}>Moments it pointed at: structure, the point, repeated ideas. Tap a highlight to read why.</Text>
          </View>
          <Switch
            value={showAi}
            onValueChange={(v) => {
              setShowAi(v);
              dismissPanel();
            }}
            trackColor={{ true: colors.success }}
            accessibilityLabel="Show the AI's notes on the transcript"
          />
        </View>
      ) : null}
    </View>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  container: { gap: spacing.sm },
  statLine: { color: colors.warning, fontSize: typography.caption, ...font("700") },
  statLineSecondary: { color: colors.indigo, fontSize: typography.caption, ...font("700") },
  legend: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md },
  legendItem: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  legendDot: { width: 9, height: 9, borderRadius: radii.pill },
  legendText: { ...font("400"), color: colors.textSecondary, fontSize: typography.caption - 1 },
  transcript: { ...font("400"), color: colors.textPrimary, fontSize: typography.bodyLarge, lineHeight: 26 },
  notePanel: { backgroundColor: colors.surfaceRaised, borderRadius: radii.md, padding: spacing.md, gap: spacing.xs },
  notePanelHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  notePanelLabel: { fontSize: 13, ...font("600") },
  notePanelText: { ...font("400"), color: colors.textSecondary, fontSize: typography.body, lineHeight: 20 },
  aiRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingTop: spacing.sm },
  aiText: { flex: 1, gap: 2 },
  aiTitle: { ...font("600"), color: colors.textPrimary, fontSize: typography.body },
  aiSub: { ...font("400"), color: colors.textSecondary, fontSize: typography.caption, lineHeight: 17 },
}));
