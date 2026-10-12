import { useEffect, useState } from "react";
import { ScrollView, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../navigation";
import { ScreenContainer } from "../components/common/ScreenContainer";
import { Header } from "../components/common/Header";
import { Card } from "../components/common/Card";
import { Txt } from "../components/common/Txt";
import { PrimaryButton } from "../components/common/PrimaryButton";
import { MarkEditor } from "../components/cadence/MarkEditor";
import { MarkedTextView } from "../components/cadence/MarkedTextView";
import { getMarkedText, saveMarkedText, type SavedMarkedText } from "../services/db/markedTextsRepo";
import { autoMark } from "../domain/cadence/autoMark";
import type { Mark } from "../domain/cadence/marks";
import { makeStyles } from "../theme/ThemeProvider";

type Props = NativeStackScreenProps<RootStackParamList, "MarkEdit">;

// Check and change the marks on one of your own texts. Edits save as you
// go; the preview shows exactly what you'll read.
export function MarkEditScreen({ route, navigation }: Props) {
  const { id } = route.params;
  const styles = useStyles();
  const [item, setItem] = useState<SavedMarkedText | null>(null);
  const [marks, setMarks] = useState<Mark[]>([]);

  useEffect(() => {
    getMarkedText(id).then((t) => {
      setItem(t);
      setMarks(t?.marks ?? []);
    });
  }, [id]);

  async function change(next: Mark[]) {
    setMarks(next);
    if (item) await saveMarkedText({ id: item.id, title: item.title, shelf: item.shelf, sourceId: item.sourceId, text: item.text, marks: next, autoMarked: false });
  }

  if (!item) return <ScreenContainer />;

  return (
    <ScreenContainer style={styles.container}>
      <Header eyebrow="Mark it up · yours" title="Edit the marks" onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <Card style={styles.card}>
          <MarkEditor text={item.text} marks={marks} onChange={change} />
        </Card>
        <Card style={styles.card}>
          <Txt variant="caption2" tone="muted" uppercase>
            How it reads
          </Txt>
          <MarkedTextView marked={{ text: item.text, marks }} size="medium" />
        </Card>
        <View style={styles.row}>
          <PrimaryButton label="Re-mark with the rules" variant="ghost" style={styles.flex} onPress={() => change(autoMark(item.text).marks)} />
          <PrimaryButton label="Clear" variant="ghost" style={styles.flex} onPress={() => change([])} />
        </View>
      </ScrollView>
      <PrimaryButton label="Practice it" onPress={() => navigation.replace("LineRep", { mineIds: [item.id] })} disabled={!marks.length} />
    </ScreenContainer>
  );
}

const useStyles = makeStyles((t) => ({
  container: { gap: t.space.md },
  scroll: { gap: t.space.md, paddingBottom: t.space.lg },
  card: { gap: t.space.md },
  row: { flexDirection: "row", gap: t.space.sm },
  flex: { flex: 1 },
}));
