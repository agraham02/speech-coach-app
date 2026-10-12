import { useCallback, useMemo, useState } from "react";
import { Alert, FlatList, Pressable, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../navigation";
import { ScreenContainer } from "../components/common/ScreenContainer";
import { Header } from "../components/common/Header";
import { Card } from "../components/common/Card";
import { Txt } from "../components/common/Txt";
import { ChipGroup } from "../components/common/Chip";
import { PrimaryButton } from "../components/common/PrimaryButton";
import { Badge } from "../components/common/Badge";
import { EmptyState } from "../components/common/EmptyState";
import { MarkedTextView } from "../components/cadence/MarkedTextView";
import { getLines, LINE_CATEGORIES, type LineCategory } from "../content/lines";
import { getSpeeches } from "../content/speeches";
import { deleteMarkedText, listMarkedTexts, type SavedMarkedText } from "../services/db/markedTextsRepo";
import { markSummary } from "../domain/cadence/notation";
import { sliceMarked } from "../domain/cadence/marks";
import { colorForCategory } from "../domain/categoryColor";
import { formatDuration } from "../utils/dateUtils";
import { makeStyles, useTheme } from "../theme/ThemeProvider";

type Props = NativeStackScreenProps<RootStackParamList, "MarkItUp">;
type Shelf = "lines" | "mine" | "speeches";

// The Mark It Up library: built-in lines (the main shelf), your own texts,
// and full speeches for read-throughs. Replaces the Script Practice list.
export function MarkItUpScreen({ route, navigation }: Props) {
  const styles = useStyles();
  const { colors } = useTheme();
  const [shelf, setShelf] = useState<Shelf>(route.params?.shelf ?? "lines");
  const [category, setCategory] = useState<LineCategory | "all">("all");
  const [mine, setMine] = useState<SavedMarkedText[]>([]);
  const lines = useMemo(() => getLines(), []);
  const speeches = useMemo(() => getSpeeches(), []);
  const shown = category === "all" ? lines : lines.filter((l) => l.category === category);

  useFocusEffect(
    useCallback(() => {
      listMarkedTexts().then(setMine);
    }, []),
  );

  function confirmDelete(item: SavedMarkedText) {
    Alert.alert("Delete this text?", item.title, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          await deleteMarkedText(item.id);
          setMine(await listMarkedTexts());
        },
      },
    ]);
  }

  return (
    <ScreenContainer style={styles.container}>
      <Header eyebrow="Cadence" title="Mark it up" onBack={() => navigation.goBack()} backIcon="close" />
      <ChipGroup
        options={[
          { key: "lines", label: "Lines" },
          { key: "mine", label: `Mine${mine.length ? ` · ${mine.length}` : ""}` },
          { key: "speeches", label: "Speeches" },
        ]}
        value={shelf}
        onChange={setShelf}
      />

      {shelf === "lines" ? (
        <FlatList
          data={shown}
          keyExtractor={(l) => l.id}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={
            <View style={styles.listHeader}>
              <Txt variant="subhead" tone="secondary">
                A sentence or two at a time: read it with the marks, then without. Pick a line, or start a rep with a few chosen for your level.
              </Txt>
              <PrimaryButton
                label={category === "all" ? "Start a rep" : `Start a ${LINE_CATEGORIES.find((c) => c.id === category)?.label.toLowerCase()} rep`}
                onPress={() => navigation.navigate("LineRep", { category: category === "all" ? undefined : category })}
              />
              <ChipGroup
                scroll
                options={[{ key: "all", label: "All" }, ...LINE_CATEGORIES.map((c) => ({ key: c.id, label: c.label }))]}
                value={category}
                onChange={(k) => setCategory(k as LineCategory | "all")}
              />
              {category !== "all" ? (
                <Txt variant="footnote" tone="muted">
                  {LINE_CATEGORIES.find((c) => c.id === category)?.practices}
                </Txt>
              ) : null}
            </View>
          }
          renderItem={({ item }) => (
            <Pressable onPress={() => navigation.navigate("LineRep", { lineIds: [item.id], category: item.category })} accessibilityRole="button">
              <Card style={styles.lineCard}>
                <MarkedTextView marked={item} size="small" layout="flow" />
                {item.credit ? (
                  <Txt variant="caption1" tone="muted">
                    — {item.credit}
                  </Txt>
                ) : null}
              </Card>
            </Pressable>
          )}
        />
      ) : null}

      {shelf === "mine" ? (
        <FlatList
          data={mine}
          keyExtractor={(t) => t.id}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={
            <View style={styles.listHeader}>
              <PrimaryButton label="From your own text" onPress={() => navigation.navigate("AddText")} />
              <Txt variant="footnote" tone="muted">
                Paste a paragraph from a book or article — or tap the text field and use your keyboard's Scan Text to grab a page — then pick a sentence or two.
              </Txt>
            </View>
          }
          ListEmptyComponent={<EmptyState icon="create-outline" title="Nothing here yet" body="Lines you mark yourself show up here." />}
          renderItem={({ item }) => {
            const s = markSummary(item.marks);
            return (
              <Card style={styles.lineCard}>
                <Pressable onPress={() => navigation.navigate("LineRep", { mineIds: [item.id] })} accessibilityRole="button" accessibilityLabel={`Practice ${item.title}`}>
                  <MarkedTextView marked={item} size="small" layout="flow" numberOfLines={4} />
                </Pressable>
                <View style={styles.mineRow}>
                  <Txt variant="caption1" tone="muted" style={styles.flex}>
                    {s.pauses} pauses · {s.inflections} rises/falls · {s.stresses} stressed{item.autoMarked ? " · auto-marked" : ""}
                  </Txt>
                  <Pressable onPress={() => navigation.navigate("MarkEdit", { id: item.id })} hitSlop={10} accessibilityRole="button" accessibilityLabel="Edit marks">
                    <Ionicons name="create-outline" size={20} color={colors.textSecondary} />
                  </Pressable>
                  <Pressable onPress={() => confirmDelete(item)} hitSlop={10} accessibilityRole="button" accessibilityLabel="Delete">
                    <Ionicons name="trash-outline" size={20} color={colors.textMuted} />
                  </Pressable>
                </View>
              </Card>
            );
          }}
        />
      ) : null}

      {shelf === "speeches" ? (
        <FlatList
          data={speeches}
          keyExtractor={(s) => s.id}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={
            <Txt variant="subhead" tone="secondary">
              Full speeches for a read-through. Study the marks first, rehearse at your own pace, then perform it on camera.
            </Txt>
          }
          renderItem={({ item }) => {
            const s = markSummary(item.marks);
            return (
              <Pressable onPress={() => navigation.navigate("SpeechStudy", { speechId: item.id })} accessibilityRole="button">
                <Card style={styles.lineCard}>
                  <View style={styles.speechHead}>
                    <Badge label={item.category} {...colorForCategory(item.category, colors)} />
                    <Txt variant="caption1" tone="muted">
                      about {formatDuration(item.targetDurationSeconds)}
                    </Txt>
                  </View>
                  <Txt variant="headline">{item.title}</Txt>
                  {/* Only the opening — a full speech is hundreds of styled words. */}
                  <MarkedTextView marked={sliceMarked(item, 0, 23)} size="small" layout="flow" numberOfLines={2} />
                  <Txt variant="caption1" tone="muted">
                    {s.pauses} pauses · {s.inflections} rises/falls · {s.stresses} stressed
                  </Txt>
                </Card>
              </Pressable>
            );
          }}
        />
      ) : null}
    </ScreenContainer>
  );
}

const useStyles = makeStyles((t) => ({
  container: { gap: t.space.md },
  list: { gap: t.space.sm, paddingBottom: t.space.xl },
  listHeader: { gap: t.space.md, marginBottom: t.space.sm },
  lineCard: { gap: t.space.sm, padding: t.space.md },
  mineRow: { flexDirection: "row", alignItems: "center", gap: t.space.md },
  speechHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  flex: { flex: 1 },
}));
