import { useMemo, useState } from "react";
import { Pressable, ScrollView, TextInput, View, type TextStyle } from "react-native";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import { Txt } from "../common/Txt";
import {
  addSpan,
  clearWord,
  cycleGap,
  marksByWord,
  setNote,
  toggleEmphasis,
  toggleInflection,
  type Mark,
  type MarkKind,
  type SpanMarkKind,
} from "../../domain/cadence/marks";
import { makeStyles, useTheme } from "../../theme/ThemeProvider";

export type EditorTool = "emphasis" | "rise" | "fall" | "pause" | SpanMarkKind | "note" | "eraser";

const TOOL_INFO: Record<EditorTool, { label: string; glyph: string; hint: string }> = {
  emphasis: { label: "Stress", glyph: "B", hint: "Tap the word that carries the news." },
  rise: { label: "Rise", glyph: "↗", hint: "Tap the last word of a phrase that goes up." },
  fall: { label: "Fall", glyph: "↘", hint: "Tap the last word of a phrase that comes down." },
  pause: { label: "Pause", glyph: "|", hint: "Tap the word before the pause. Tap again for a long pause ‖, again to clear." },
  slow: { label: "Slow", glyph: "s l o w", hint: "Tap the first word to slow down on, then the last." },
  fast: { label: "Fast", glyph: "fast", hint: "Tap the first word to speed through, then the last." },
  louder: { label: "Louder", glyph: "A", hint: "Tap the first word to say louder, then the last." },
  softer: { label: "Softer", glyph: "a", hint: "Tap the first word to say softer, then the last." },
  note: { label: "Note", glyph: "✎", hint: "Tap a word to put a tone note above its phrase." },
  eraser: { label: "Erase", glyph: "⌫", hint: "Tap a word to clear every mark on it." },
};

export function toolsFor(kinds: MarkKind[]): EditorTool[] {
  const tools: EditorTool[] = [];
  if (kinds.includes("emphasis")) tools.push("emphasis");
  if (kinds.includes("rise")) tools.push("rise");
  if (kinds.includes("fall")) tools.push("fall");
  if (kinds.includes("pause") || kinds.includes("long_pause")) tools.push("pause");
  for (const k of ["slow", "fast", "louder", "softer"] as const) if (kinds.includes(k)) tools.push(k);
  if (kinds.includes("note")) tools.push("note");
  tools.push("eraser");
  return tools;
}

export const ALL_TOOLS: EditorTool[] = ["emphasis", "rise", "fall", "pause", "slow", "louder", "softer", "fast", "note", "eraser"];

interface Props {
  text: string;
  marks: Mark[];
  onChange: (marks: Mark[]) => void;
  tools?: EditorTool[];
  // Marks shown but not editable (the coach's stress while you add pauses).
  locked?: Mark[];
}

// Tap-to-mark editor. Words are individual tap targets laid out like the
// reader, so what you mark is what you'll read.
export function MarkEditor({ text, marks, onChange, tools = ALL_TOOLS, locked = [] }: Props) {
  const styles = useStyles();
  const { colors } = useTheme();
  const [tool, setTool] = useState<EditorTool>(tools[0]);
  const [spanStart, setSpanStart] = useState<number | null>(null);
  const [history, setHistory] = useState<Mark[][]>([]);
  const [noteWord, setNoteWord] = useState<number | null>(null);
  const [noteDraft, setNoteDraft] = useState("");
  const all = useMemo(() => [...locked, ...marks], [locked, marks]);
  const words = useMemo(() => marksByWord({ text, marks: all }), [text, all]);
  const markColor = colors.skill.cadence.fg;

  function commit(next: Mark[]) {
    setHistory((h) => [...h.slice(-30), marks]);
    onChange(next);
    Haptics.selectionAsync().catch(() => undefined);
  }

  function tap(i: number) {
    switch (tool) {
      case "emphasis":
        if (locked.some((m) => m.kind === "emphasis" && m.word === i)) return;
        commit(toggleEmphasis(marks, i));
        return;
      case "rise":
      case "fall":
        commit(toggleInflection(marks, i, tool));
        return;
      case "pause":
        if (i === words.length - 1) return;
        commit(cycleGap(marks, i));
        return;
      case "note":
        setNoteWord(i);
        setNoteDraft(words[i]?.note ?? "");
        return;
      case "eraser":
        commit(clearWord(marks, i));
        return;
      default:
        if (spanStart == null) {
          setSpanStart(i);
          return;
        }
        commit(addSpan(marks, tool, spanStart, i));
        setSpanStart(null);
    }
  }

  function undo() {
    const previous = history[history.length - 1];
    if (!previous) return;
    setHistory((h) => h.slice(0, -1));
    onChange(previous);
  }

  function chooseTool(next: EditorTool) {
    setTool(next);
    setSpanStart(null);
    setNoteWord(null);
  }

  const wordStyle = (i: number): TextStyle => {
    const w = words[i];
    const style: TextStyle = { fontSize: 22, lineHeight: 30, color: colors.textPrimary, fontWeight: "500" };
    if (w.spans.includes("louder")) style.fontWeight = "700";
    if (w.spans.includes("softer")) style.color = colors.textSecondary;
    if (w.spans.includes("slow")) style.letterSpacing = 2.5;
    if (w.spans.includes("fast")) style.fontStyle = "italic";
    if (w.emphasis) {
      style.fontWeight = "800";
      style.textDecorationLine = "underline";
    }
    return style;
  };

  return (
    <View style={styles.wrap}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tools}>
        {tools.map((t) => {
          const on = t === tool;
          return (
            <Pressable
              key={t}
              onPress={() => chooseTool(t)}
              style={[styles.tool, on && { backgroundColor: colors.accent }]}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              accessibilityLabel={TOOL_INFO[t].label}
            >
              <Txt variant="callout" weight="800" color={on ? colors.onAccent : t === "emphasis" ? colors.textPrimary : markColor} style={t === "emphasis" ? styles.toolStress : undefined}>
                {TOOL_INFO[t].glyph}
              </Txt>
              <Txt variant="caption1" weight="600" color={on ? colors.onAccent : colors.textSecondary}>
                {TOOL_INFO[t].label}
              </Txt>
            </Pressable>
          );
        })}
        <Pressable onPress={undo} disabled={!history.length} style={[styles.tool, !history.length && styles.disabled]} accessibilityRole="button" accessibilityLabel="Undo">
          <Ionicons name="arrow-undo" size={18} color={colors.textSecondary} />
          <Txt variant="caption1" weight="600" tone="secondary">
            Undo
          </Txt>
        </Pressable>
      </ScrollView>

      <Txt variant="footnote" tone="secondary">
        {spanStart != null ? `Now tap the last word (from “${words[spanStart]?.word}”).` : TOOL_INFO[tool].hint}
      </Txt>

      <View style={styles.words}>
        {words.map((w, i) => (
          <View key={i} style={styles.wordWrap}>
            {w.note ? (
              <Txt variant="caption1" tone="muted" style={styles.noteTag} numberOfLines={1}>
                ✎ {w.note}
              </Txt>
            ) : null}
            <Pressable
              onPress={() => tap(i)}
              style={[styles.word, spanStart === i && { backgroundColor: colors.accentMuted }]}
              hitSlop={4}
              accessibilityRole="button"
              accessibilityLabel={`${w.word}${w.emphasis ? ", stressed" : ""}${w.inflection ? `, ${w.inflection}` : ""}${w.gapAfter ? `, ${w.gapAfter === "long_pause" ? "long pause" : "pause"} after` : ""}`}
            >
              <Txt style={wordStyle(i)}>{w.word}</Txt>
              {w.inflection ? (
                <Txt style={[styles.glyph, { color: markColor }]}>{w.inflection === "rise" ? "↗" : "↘"}</Txt>
              ) : null}
              {w.gapAfter ? <Txt style={[styles.glyph, styles.gap, { color: markColor }]}>{w.gapAfter === "long_pause" ? "‖" : "|"}</Txt> : null}
            </Pressable>
          </View>
        ))}
      </View>

      {noteWord != null ? (
        <View style={styles.noteBox}>
          <Txt variant="footnote" tone="secondary">
            Note above “{words[noteWord]?.word}”
          </Txt>
          <TextInput
            value={noteDraft}
            onChangeText={setNoteDraft}
            placeholder="e.g. warmer, like you're smiling"
            placeholderTextColor={colors.textMuted}
            style={styles.noteInput}
            autoFocus
            onSubmitEditing={() => {
              commit(setNote(marks, noteWord, noteDraft));
              setNoteWord(null);
            }}
            returnKeyType="done"
          />
        </View>
      ) : null}
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  wrap: { gap: t.space.md },
  tools: { gap: t.space.xs },
  tool: {
    alignItems: "center",
    gap: 2,
    minWidth: 58,
    paddingHorizontal: t.space.sm,
    paddingVertical: t.space.sm,
    borderRadius: t.radius.md,
    backgroundColor: t.colors.surfaceRaised,
  },
  toolStress: { textDecorationLine: "underline" },
  disabled: { opacity: 0.4 },
  words: { flexDirection: "row", flexWrap: "wrap", rowGap: t.space.sm, columnGap: 2 },
  wordWrap: { alignItems: "flex-start" },
  word: { flexDirection: "row", alignItems: "baseline", paddingHorizontal: 5, paddingVertical: 4, borderRadius: t.radius.sm, backgroundColor: t.colors.surfaceRaised },
  glyph: { fontSize: 20, lineHeight: 30, fontWeight: "700", marginLeft: 2 },
  gap: { marginLeft: 6 },
  noteTag: { fontStyle: "italic", maxWidth: 160, marginLeft: 4 },
  noteBox: { gap: t.space.xs },
  noteInput: {
    borderRadius: t.radius.md,
    backgroundColor: t.colors.surfaceRaised,
    color: t.colors.textPrimary,
    paddingHorizontal: t.space.md,
    paddingVertical: t.space.sm,
    fontSize: 16,
  },
}));
