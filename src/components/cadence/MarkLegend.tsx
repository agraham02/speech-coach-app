import { useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import { Txt } from "../common/Txt";
import { countByKind, type Mark, type MarkKind } from "../../domain/cadence/marks";
import { MARK_MEANINGS } from "../../content/markGuide";
import { duration } from "../../theme/motion";
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
// to show or hide that type — practice one element at a time. Below it,
// "What do the marks mean?" opens a plain-words key for the marks shown.
export function MarkLegend({ marks, hidden, onToggle }: Props) {
  const styles = useStyles();
  const { colors } = useTheme();
  const [explaining, setExplaining] = useState(false);
  const counts = countByKind(marks);
  const present = ENTRIES.filter((e) => e.kinds.some((k) => (counts[k] ?? 0) > 0));
  if (!present.length) return null;
  const meanings = present.map((e) => MARK_MEANINGS[e.kinds[0]]).filter((m) => !!m);
  return (
    <View style={styles.wrap}>
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
      <Pressable onPress={() => setExplaining((on) => !on)} style={styles.explainToggle} hitSlop={8} accessibilityRole="button" accessibilityState={{ expanded: explaining }}>
        <Ionicons name="help-circle-outline" size={16} color={colors.textSecondary} />
        <Txt variant="footnote" weight="500" tone="secondary">
          {explaining ? "Hide the key" : "What do the marks mean?"}
        </Txt>
      </Pressable>
      {explaining ? (
        <Animated.View entering={FadeIn.duration(duration.base)} exiting={FadeOut.duration(duration.fast)} style={styles.key}>
          {meanings.map((m) => (
            <View key={m.label} style={styles.keyRow}>
              <Txt variant="subhead" weight="600">
                {m.label} <Txt variant="footnote" tone="muted">· {m.looks}</Txt>
              </Txt>
              <Txt variant="footnote" tone="secondary">
                {m.meaning}
              </Txt>
            </View>
          ))}
        </Animated.View>
      ) : null}
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  wrap: { gap: t.space.sm },
  explainToggle: { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start", paddingVertical: 2 },
  key: { gap: t.space.md, padding: t.space.md, borderRadius: t.radius.md, backgroundColor: t.colors.surfaceRaised },
  keyRow: { gap: 2 },
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
