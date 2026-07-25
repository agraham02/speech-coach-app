import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import {
  buildHighlightSegments,
  computeFillerStats,
  detectFillerWords,
  labelForRate,
  locateQuote,
  type AnnotationCategory,
  type GeminiQuoteAnnotation,
  type LocatedAnnotation,
} from "../../domain/transcriptAnnotations";
import { annotationColors, colors, radii, spacing, typography } from "../../theme/theme";

interface AnnotatedTranscriptProps {
  transcriptVerbatim: string;
  durationSeconds: number;
  fillerWordCount: number | null;
  fillerRatePerMinute: number | null;
  annotations: GeminiQuoteAnnotation[];
}

const CATEGORY_LABELS: Record<AnnotationCategory, string> = {
  filler: "Filler word",
  structure: "Structure",
  delivery: "Delivery",
  presence: "Presence",
  content: "Content",
};

export function AnnotatedTranscript({
  transcriptVerbatim,
  durationSeconds,
  fillerWordCount,
  fillerRatePerMinute,
  annotations,
}: AnnotatedTranscriptProps) {
  const fillerMatches = detectFillerWords(transcriptVerbatim);
  const stats =
    fillerWordCount !== null && fillerRatePerMinute !== null
      ? { count: fillerWordCount, ratePerMinute: fillerRatePerMinute, label: labelForRate(fillerRatePerMinute) }
      : computeFillerStats(transcriptVerbatim, durationSeconds);

  const located: LocatedAnnotation[] = [
    ...fillerMatches.map((match) => ({
      start: match.start,
      end: match.end,
      category: "filler" as AnnotationCategory,
      note: `Filler word ("${match.word}") — cut it or replace it with a deliberate pause.`,
    })),
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

  return (
    <View style={styles.container}>
      <Text style={styles.statLine}>
        {stats.count} filler word{stats.count === 1 ? "" : "s"} · {stats.ratePerMinute}/min · {stats.label}
      </Text>

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
              onPress={() => Alert.alert(CATEGORY_LABELS[segment.category!], segment.note ?? "")}
              suppressHighlighting
            >
              {segment.text}
            </Text>
          ) : (
            <Text key={index}>{segment.text}</Text>
          ),
        )}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.sm },
  statLine: { color: colors.warning, fontSize: typography.caption, fontWeight: "700" },
  legend: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md },
  legendItem: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  legendDot: { width: 9, height: 9, borderRadius: radii.pill },
  legendText: { color: colors.textSecondary, fontSize: typography.caption - 1 },
  transcript: { color: colors.textPrimary, fontSize: typography.bodyLarge, lineHeight: 26 },
});
