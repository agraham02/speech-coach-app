import { Fragment, useMemo } from "react";
import { View, type TextStyle } from "react-native";
import { Txt } from "../common/Txt";
import { getUserProfile } from "../../services/prefs/prefsStore";
import { fillPlaceholder, filterMarks, marksByWord, phrases, type MarkKind, type MarkLevel, type MarkedText, type WordMarks } from "../../domain/cadence/marks";
import { makeStyles, useTheme } from "../../theme/ThemeProvider";
import { font } from "../../theme/tokens";

export type MarkedTextSize = "large" | "medium" | "small";

const SIZES: Record<MarkedTextSize, { fontSize: number; lineHeight: number }> = {
  large: { ...font("400"), fontSize: 28, lineHeight: 40 },
  medium: { ...font("400"), fontSize: 21, lineHeight: 31 },
  small: { ...font("400"), fontSize: 16, lineHeight: 23 },
};

interface Props {
  marked: MarkedText;
  level?: MarkLevel;
  hidden?: ReadonlySet<MarkKind>;
  size?: MarkedTextSize;
  // "phrases": one breath group per line (Study / reading). "flow": a plain
  // paragraph (cards, and reading with the marks hidden).
  layout?: "phrases" | "flow";
  // Rehearse: the current breath group is bright, the next dim, the rest faint.
  activePhrase?: number;
  numberOfLines?: number;
}

// Renders delivery marks as typography rather than emoji glyphs:
//   stress        bold + underline
//   ↗ / ↘         after the word, in the cadence color
//   | / ‖         at the end of the breath group (and as white space)
//   slow          letters spaced out          fast   tighter, italic
//   louder        bigger text                 softer smaller, quieter color
//   note          a muted italic line above the phrase
export function MarkedTextView({ marked, level = "full", hidden, size = "medium", layout = "phrases", activePhrase, numberOfLines }: Props) {
  const styles = useStyles();
  const { colors } = useTheme();
  const visible = useMemo(() => ({ text: marked.text, marks: filterMarks(marked.marks, level, hidden) }), [marked, level, hidden]);
  const words = useMemo(() => marksByWord(visible), [visible]);
  const groups = useMemo(() => phrases(visible), [visible]);
  const base = SIZES[size];
  const markColor = colors.skill.cadence.fg;
  const name = useMemo(() => getUserProfile()?.name?.trim() || undefined, []);

  const wordStyle = (w: WordMarks): TextStyle => {
    const style: TextStyle = { ...base, color: colors.textPrimary, ...font("500") };
    if (w.spans.includes("louder")) {
      style.fontSize = Math.round(base.fontSize * 1.18);
      Object.assign(style, font("700"));
    }
    if (w.spans.includes("softer")) {
      style.fontSize = Math.round(base.fontSize * 0.86);
      style.color = colors.textSecondary;
    }
    if (w.spans.includes("slow")) style.letterSpacing = size === "small" ? 1.5 : 3;
    if (w.spans.includes("fast")) {
      style.letterSpacing = -0.4;
      style.fontStyle = "italic";
    }
    if (w.emphasis) {
      Object.assign(style, font("800"));
      style.textDecorationLine = "underline";
      style.color = colors.textPrimary;
    }
    return style;
  };

  const renderWord = (w: WordMarks, i: number, inFlow: boolean, last: boolean) => (
    <Fragment key={i}>
      <Txt style={wordStyle(w)}>{fillPlaceholder(w.word, name)}</Txt>
      {w.inflection ? (
        <Txt style={[styles.arrow, { fontSize: base.fontSize * 0.95, lineHeight: base.lineHeight, color: markColor }]}>
          {w.inflection === "rise" ? "↗" : "↘"}
        </Txt>
      ) : null}
      {inFlow && w.gapAfter ? (
        <Txt style={[base, styles.gap, { color: markColor }]}>{w.gapAfter === "long_pause" ? "  ‖" : "  |"}</Txt>
      ) : null}
      {last ? null : <Txt style={base}> </Txt>}
    </Fragment>
  );

  if (layout === "flow" || level === "none") {
    return (
      <Txt style={base} numberOfLines={numberOfLines}>
        {words.map((w, i) => renderWord(w, i, level !== "none", i === words.length - 1))}
      </Txt>
    );
  }

  return (
    <View style={styles.lines}>
      {groups.map((g, gi) => {
        const last = words[g.to];
        const note = words[g.from]?.note;
        const opacity = activePhrase == null ? 1 : gi === activePhrase ? 1 : gi === activePhrase + 1 ? 0.45 : 0.2;
        return (
          <View key={gi} style={[styles.phrase, { opacity }, last?.gapAfter === "long_pause" && styles.longGap]}>
            {note ? (
              <Txt variant="footnote" tone="muted" style={styles.note}>
                {note}
              </Txt>
            ) : null}
            <Txt style={base}>
              {words.slice(g.from, g.to + 1).map((w, k) => renderWord(w, g.from + k, false, g.from + k === g.to))}
              {last?.gapAfter ? <Txt style={[base, styles.gap, { color: markColor }]}>{last.gapAfter === "long_pause" ? "  ‖" : "  |"}</Txt> : null}
            </Txt>
          </View>
        );
      })}
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  lines: { gap: 2 },
  phrase: {},
  longGap: { marginBottom: t.space.md },
  arrow: { ...font("700") },
  gap: { ...font("300") },
  note: { fontStyle: "italic", marginBottom: 2 },
}));
