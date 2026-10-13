import { useState } from "react";
import { Pressable, Text, View } from "react-native";
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
  type GeminiQuoteAnnotation,
  type LocatedAnnotation,
} from "../../domain/transcriptAnnotations";
import type { TranscriptWord } from "../../domain/sessionTypes";
import { getAnnotationColors, radii, spacing, typography, font } from "../../theme/theme";
import { makeStyles, useTheme } from "../../theme/ThemeProvider";

interface AnnotatedTranscriptProps {
  transcriptVerbatim: string;
  durationSeconds: number;
  fillerWordCount: number | null;
  fillerRatePerMinute: number | null;
  // Word-level timestamps from on-device ASR, if available —
  // preferred source for repeated-words detection (more reliable than a
  // naive whitespace split); falls back to scanning transcriptVerbatim
  // directly when null (Gemini self-transcribed, no word array exists).
  transcriptWords: TranscriptWord[] | null;
  repeatedWordCount: number | null;
  annotations: GeminiQuoteAnnotation[];
}

interface PanelContent {
  category: AnnotationCategory;
  note: string;
}

const CATEGORY_LABELS: Record<AnnotationCategory, string> = {
  filler: "Filler word",
  structure: "Structure",
  delivery: "Delivery",
  presence: "Presence",
  content: "Content",
  restated_point: "Restated point",
  repeated_words: "Repeated speech pattern",
};

export function AnnotatedTranscript({
  transcriptVerbatim,
  durationSeconds,
  fillerWordCount,
  fillerRatePerMinute,
  transcriptWords,
  repeatedWordCount,
  annotations,
}: AnnotatedTranscriptProps) {
  const styles = useStyles();
  const { colors } = useTheme();
  const annotationColors = getAnnotationColors(colors);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  // Kept separate from selectedIndex, cleared only after the dismiss
  // animation finishes — otherwise the panel's text would vanish instantly
  // instead of fading out with it.
  const [panelContent, setPanelContent] = useState<PanelContent | null>(null);
  const panelProgress = useSharedValue(0);

  const fillerMatches = detectFillerWords(transcriptVerbatim);
  const stats =
    fillerWordCount !== null && fillerRatePerMinute !== null
      ? { count: fillerWordCount, ratePerMinute: fillerRatePerMinute, label: labelForRate(fillerRatePerMinute) }
      : computeFillerStats(transcriptVerbatim, durationSeconds);

  const repeatedWordMatches =
    transcriptWords && transcriptWords.length > 0
      ? detectRepeatedWordsFromWords(transcriptWords)
      : detectRepeatedWordsFromText(transcriptVerbatim);
  const repeatedCount = repeatedWordCount ?? repeatedWordMatches.length;

  const located: LocatedAnnotation[] = [
    ...fillerMatches.map((match) => ({
      start: match.start,
      end: match.end,
      category: "filler" as AnnotationCategory,
      note: `Filler word ("${match.word}") — cut it or replace it with a deliberate pause.`,
    })),
    ...(() => {
      // Same "advance past claimed spans" tracking as the Gemini-annotation
      // resolver below — a repeated run like "the the" could legitimately
      // occur more than once in a transcript.
      const nextSearchIndex = new Map<string, number>();
      return repeatedWordMatches
        .map((match): LocatedAnnotation | null => {
          const key = match.quote.trim().toLowerCase();
          const span = locateQuote(transcriptVerbatim, match.quote, nextSearchIndex.get(key) ?? 0);
          if (!span) return null;
          nextSearchIndex.set(key, span.end);
          return {
            ...span,
            category: "repeated_words" as AnnotationCategory,
            note: `Repeated speech pattern ("${match.quote}") — a secondary signal distinct from restated ideas; not a diagnosis.`,
          };
        })
        .filter((a): a is NonNullable<typeof a> => a !== null);
    })(),
    ...(() => {
      // Track where the search left off for each distinct quote string, so if
      // the same quote is annotated more than once, each occurrence resolves
      // to a different spot in the transcript instead of all of them
      // collapsing onto the first match.
      const nextSearchIndex = new Map<string, number>();
      return annotations
        .map((annotation): LocatedAnnotation | null => {
          const key = annotation.quote.trim().toLowerCase();
          const span = locateQuote(transcriptVerbatim, annotation.quote, nextSearchIndex.get(key) ?? 0);
          if (!span) return null;
          nextSearchIndex.set(key, span.end);
          return { ...span, category: annotation.category, note: annotation.note };
        })
        .filter((a): a is NonNullable<typeof a> => a !== null);
    })(),
  ];

  const segments = buildHighlightSegments(transcriptVerbatim, located);
  const categoriesPresent = new Set(located.map((a) => a.category));

  function toggleSegment(index: number) {
    if (selectedIndex === index) {
      dismissPanel();
      return;
    }
    const segment = segments[index];
    if (!segment.category) return;
    setSelectedIndex(index);
    setPanelContent({ category: segment.category, note: segment.note ?? "" });
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
      {repeatedCount > 0 ? (
        <Text style={styles.statLineSecondary}>
          {repeatedCount} repeated speech pattern{repeatedCount === 1 ? "" : "s"}
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
            <Text
              key={index}
              style={{ backgroundColor: annotationColors[segment.category], color: colors.textPrimary }}
              onPress={() => toggleSegment(index)}
              suppressHighlighting
            >
              {segment.text}
            </Text>
          ) : (
            <Text key={index}>{segment.text}</Text>
          ),
        )}
      </Text>

      {panelContent ? (
        <Animated.View style={[styles.notePanel, { borderColor: annotationColors[panelContent.category] }, panelStyle]}>
          <View style={styles.notePanelHeader}>
            <Text style={[styles.notePanelLabel, { color: annotationColors[panelContent.category] }]}>
              {CATEGORY_LABELS[panelContent.category]}
            </Text>
            <Pressable onPress={dismissPanel} hitSlop={12} accessibilityRole="button" accessibilityLabel="Dismiss note">
              <Ionicons name="close" size={16} color={colors.textMuted} />
            </Pressable>
          </View>
          <Text style={styles.notePanelText}>{panelContent.note}</Text>
        </Animated.View>
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
  notePanel: {
    backgroundColor: colors.surfaceRaised,
    borderWidth: 1,
    borderRadius: radii.md,
    padding: spacing.md,
    gap: spacing.xs,
  },
  notePanelHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  notePanelLabel: { fontSize: 13, ...font("600") },
  notePanelText: { ...font("400"), color: colors.textSecondary, fontSize: typography.body, lineHeight: 20 },
}));
