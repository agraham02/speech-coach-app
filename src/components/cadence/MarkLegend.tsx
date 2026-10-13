import { Pressable, ScrollView } from "react-native";
import { Txt } from "../common/Txt";
import { countByKind, type Mark, type MarkKind } from "../../domain/cadence/marks";
import { makeStyles, useTheme } from "../../theme/ThemeProvider";
import { font } from "../../theme/tokens";

const ENTRIES: { kinds: MarkKind[]; sample: string; label: string }[] = [
  { kinds: ["emphasis"], sample: "word", label: "Stress" },
  { kinds: ["rise"], sample: "↗", label: "Rise" },
  { kinds: ["fall"], sample: "↘", label: "Fall" },
  { kinds: ["pause"], sample: "|", label: "Pause" },
  { kinds: ["long_pause"], sample: "‖", label: "Long pause" },
  { kinds: ["slow"], sample: "s l o w", label: "" },
  { kinds: ["fast"], sample: "fast", label: "" },
  { kinds: ["louder"], sample: "LOUDER", label: "" },
  { kinds: ["softer"], sample: "softer", label: "" },
];

interface Props {
  marks: Mark[];
  hidden: ReadonlySet<MarkKind>;
  onToggle?: (kinds: MarkKind[]) => void;
}

// One chip per mark type that's actually in the text, with its count. Tap
// to show or hide that type — practice one element at a time.
export function MarkLegend({ marks, hidden, onToggle }: Props) {
  const styles = useStyles();
  const { colors } = useTheme();
  const counts = countByKind(marks);
  const present = ENTRIES.filter((e) => e.kinds.some((k) => (counts[k] ?? 0) > 0));
  if (!present.length) return null;
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.scroller} contentContainerStyle={styles.row}>
      {present.map((e) => {
        const off = e.kinds.every((k) => hidden.has(k));
        const n = e.kinds.reduce((sum, k) => sum + (counts[k] ?? 0), 0);
        const sampleStyle =
          e.kinds[0] === "emphasis"
            ? styles.stress
            : e.kinds[0] === "louder"
              ? styles.louder
              : e.kinds[0] === "softer"
                ? styles.softer
                : e.kinds[0] === "fast"
                  ? styles.fast
                  : { color: colors.skill.cadence.fg, ...font("700") };
        return (
          <Pressable
            key={e.kinds.join()}
            onPress={onToggle ? () => onToggle(e.kinds) : undefined}
            disabled={!onToggle}
            style={[styles.chip, off && styles.chipOff]}
            accessibilityRole={onToggle ? "button" : "text"}
            accessibilityState={{ selected: !off }}
            accessibilityLabel={`${e.label || e.sample}: ${n}, ${off ? "hidden" : "shown"}`}
          >
            <Txt variant="footnote" style={sampleStyle}>
              {e.sample}
            </Txt>
            {e.label ? (
              <Txt variant="footnote" tone="secondary">
                {e.label}
              </Txt>
            ) : null}
            <Txt variant="caption1" tone="muted">
              {n}
            </Txt>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const useStyles = makeStyles((t) => ({
  // A horizontal ScrollView in a flex column otherwise shrinks to a sliver.
  scroller: { flexGrow: 0, flexShrink: 0 },
  row: { gap: t.space.xs },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: t.space.sm + 2,
    paddingVertical: 6,
    borderRadius: t.radius.pill,
    backgroundColor: t.colors.surfaceRaised,
  },
  chipOff: { opacity: 0.4 },
  stress: { ...font("800"), textDecorationLine: "underline", color: t.colors.textPrimary },
  louder: { ...font("800"), fontSize: 12, color: t.colors.textPrimary },
  softer: { ...font("400"), fontSize: 12, color: t.colors.textSecondary },
  fast: { fontStyle: "italic", color: t.colors.textPrimary },
}));
