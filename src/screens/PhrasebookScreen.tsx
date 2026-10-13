import { useCallback, useMemo, useState } from "react";
import { View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../navigation";
import { Screen } from "../components/common/Screen";
import { Card } from "../components/common/Card";
import { PressableScale } from "../components/common/PressableScale";
import { PrimaryButton } from "../components/common/PrimaryButton";
import { Txt } from "../components/common/Txt";
import { showGlobalToast } from "../components/common/ToastProvider";
import { Field } from "../components/conversation/Field";
import { addPhrase, deletePhrase, leastPracticedPhrases, listPhrases, restorePhrase, type SavedPhrase } from "../services/db/phrasebookRepo";
import { success, tick } from "../utils/haptics";
import { makeStyles, useTheme } from "../theme/ThemeProvider";

// The most phrases said aloud in one go.
const ROUND = 5;
// A search box only earns its place once the list is long.
const SEARCH_FROM = 8;

// Phrases, lines and turns of phrase you'd like to be able to say — heard in
// a talk, read in a book, said by a friend. Not a journal: just speech to
// remember, and to say aloud.
export function PhrasebookScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [phrases, setPhrases] = useState<SavedPhrase[] | null>(null);
  const [text, setText] = useState("");
  const [note, setNote] = useState("");
  const [query, setQuery] = useState("");

  useFocusEffect(
    useCallback(() => {
      listPhrases().then(setPhrases);
    }, []),
  );

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q || !phrases) return phrases ?? [];
    return phrases.filter((p) => p.text.toLowerCase().includes(q) || (p.note ?? "").toLowerCase().includes(q));
  }, [phrases, query]);

  async function add() {
    const trimmed = text.trim();
    if (!trimmed) return;
    const phrase = await addPhrase(trimmed, note);
    setPhrases((current) => [phrase, ...(current ?? [])]);
    setText("");
    setNote("");
    success();
  }

  // Gone from the list at once; the toast can bring it back.
  function remove(phrase: SavedPhrase) {
    tick();
    setPhrases((current) => (current ?? []).filter((p) => p.id !== phrase.id));
    deletePhrase(phrase.id).catch(() => undefined);
    showGlobalToast("Phrase removed — tap to undo", "info", () => {
      setPhrases((current) => (current?.some((p) => p.id === phrase.id) ? current : [...(current ?? []), phrase].sort((a, b) => b.createdAt.localeCompare(a.createdAt))));
      restorePhrase(phrase.id).catch(() => undefined);
    });
  }

  async function practice() {
    const picked = await leastPracticedPhrases(ROUND);
    if (picked.length) navigation.navigate("LineRep", { phraseIds: picked.map((p) => p.id) });
  }

  return (
    <Screen title="Phrasebook" onBack={() => navigation.goBack()} contentStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Txt variant="callout" tone="secondary">
        Phrases and lines you'd like to be able to say — from a talk, a book, a friend. Save them here, then say them aloud so they're yours.
      </Txt>

      <Card style={styles.add}>
        <Field value={text} onChangeText={setText} placeholder="A phrase you like" multiline maxLength={280} />
        <Field value={note} onChangeText={setNote} placeholder="Where it's from, or why you like it (optional)" maxLength={140} />
        <PrimaryButton label="Add to phrasebook" icon="add" onPress={add} disabled={!text.trim()} />
      </Card>

      {phrases && phrases.length >= SEARCH_FROM ? <Field value={query} onChangeText={setQuery} placeholder="Search your phrases" maxLength={60} /> : null}

      {phrases && phrases.length === 0 ? (
        <Txt variant="subhead" tone="muted" align="center" style={styles.empty}>
          Nothing here yet. When you hear a line you love, save it.
        </Txt>
      ) : null}

      {shown.length > 0 ? (
        <Card style={styles.list}>
          {shown.map((phrase, i) => (
            <View key={phrase.id} style={[styles.row, i > 0 && styles.divided]}>
              <View style={styles.rowText}>
                <Txt variant="body" weight="500">
                  {phrase.text}
                </Txt>
                {phrase.note ? (
                  <Txt variant="footnote" tone="secondary">
                    {phrase.note}
                  </Txt>
                ) : null}
                <Txt variant="caption1" tone="muted">
                  {phrase.practicedCount === 0 ? "Not said aloud yet" : `Said aloud ${phrase.practicedCount} ${phrase.practicedCount === 1 ? "time" : "times"}`}
                </Txt>
              </View>
              <PressableScale onPress={() => remove(phrase)} hitSlop={10} accessibilityRole="button" accessibilityLabel={`Remove "${phrase.text}"`} style={styles.remove}>
                <Ionicons name="close" size={18} color={colors.textMuted} />
              </PressableScale>
            </View>
          ))}
        </Card>
      ) : phrases && phrases.length > 0 ? (
        <Txt variant="subhead" tone="muted" align="center" style={styles.empty}>
          No phrase matches that.
        </Txt>
      ) : null}

      {phrases && phrases.length > 0 ? (
        <PrimaryButton label={`Say ${Math.min(phrases.length, ROUND)} aloud`} variant="secondary" icon="mic-outline" onPress={practice} />
      ) : null}
    </Screen>
  );
}

const useStyles = makeStyles((t) => ({
  content: { gap: t.space.md },
  add: { gap: t.space.sm + 2 },
  empty: { paddingVertical: t.space.lg },
  list: { paddingVertical: t.space.xs },
  row: { flexDirection: "row", alignItems: "flex-start", gap: t.space.md, paddingVertical: t.space.md },
  divided: { borderTopWidth: 1, borderTopColor: t.colors.separator },
  rowText: { flex: 1, gap: 3 },
  remove: { width: 28, height: 28, alignItems: "center", justifyContent: "center", marginTop: -2 },
}));
