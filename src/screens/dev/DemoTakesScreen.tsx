import { useCallback, useState } from "react";
import { Alert, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../../navigation";
import { Screen } from "../../components/common/Screen";
import { Card } from "../../components/common/Card";
import { ListGroup, ListRow, SwitchRow } from "../../components/common/ListRow";
import { PrimaryButton } from "../../components/common/PrimaryButton";
import { Txt } from "../../components/common/Txt";
import { useToast } from "../../components/common/ToastProvider";
import { DEMO_CHAINS, DEMO_REWINDS, DEMO_TAKES } from "../../domain/dev/demoTakes";
import { addDemoData, countDemoData, removeDemoData, type DemoCounts } from "../../services/dev/seedDemo";
import { makeStyles } from "../../theme/ThemeProvider";

type Props = NativeStackScreenProps<RootStackParamList, "DevDemoTakes">;

// Dev, App tools, Add demo takes: a set of made-up takes written the way the
// recording pipeline writes them (services/dev/seedDemo.ts), so the Result
// tabs, charts, Library, Trends, the streak and the delete flow can be looked
// at without a working microphone. Only in development and preview builds.
export function DemoTakesScreen({ navigation }: Props) {
  const styles = useStyles();
  const showToast = useToast();
  const [counts, setCounts] = useState<DemoCounts | null>(null);
  const [busy, setBusy] = useState<"add" | "remove" | null>(null);
  const [placeholderMedia, setPlaceholderMedia] = useState(false);
  const [moveRatings, setMoveRatings] = useState(false);

  const refresh = useCallback(() => {
    countDemoData()
      .then(setCounts)
      .catch(() => setCounts(null));
  }, []);
  useFocusEffect(refresh);

  async function add() {
    if (busy) return;
    setBusy("add");
    try {
      const result = await addDemoData({ placeholderMedia, moveRatings });
      showToast(
        result.takes + result.rewinds + result.drills === 0
          ? "The demo takes are already here."
          : `Added ${result.takes} takes, ${result.rewinds} Rewinds and ${result.drills} drill attempts.`,
        "success",
      );
    } catch (error) {
      Alert.alert("Couldn't add the demo takes", (error as Error).message);
    } finally {
      setBusy(null);
      refresh();
    }
  }

  async function remove() {
    if (busy) return;
    setBusy("remove");
    try {
      const removed = await removeDemoData();
      showToast(`Removed ${removed.takes} takes, ${removed.rewinds} Rewinds and ${removed.drills} drill attempts.`, "success");
    } catch (error) {
      Alert.alert("Couldn't remove the demo takes", (error as Error).message);
    } finally {
      setBusy(null);
      refresh();
    }
  }

  const total = counts ? counts.takes + counts.rewinds + counts.drills : 0;
  return (
    <Screen title="Demo takes" eyebrow="Dev" onBack={navigation.goBack}>
      <Card style={styles.block}>
        <Txt variant="headline" testID="dev-demo-count">
          {counts === null ? "Counting…" : total === 0 ? "No demo data on this phone" : `${counts.takes} takes, ${counts.rewinds} Rewinds, ${counts.drills} drill attempts`}
        </Txt>
        <Txt variant="footnote" tone="secondary">
          Made-up takes with measured score sheets, a transcript with word timings, voice and face tracks, and (for two of them) a Tono AI review marked as a demo. Nothing is recorded, sent or paid for. Remove deletes them through the app's own delete flow.
        </Txt>
      </Card>

      <ListGroup title="Options">
        <SwitchRow
          title="Placeholder video files"
          subtitle="Off: a demo take has no video file, so the Result screen says the video was removed. On: a 2 KB file stands in so file sizes and deleting files can be checked; it won't play."
          value={placeholderMedia}
          onValueChange={setPlaceholderMedia}
          testID="dev-demo-placeholder-media"
        />
        <SwitchRow
          title="Also move skill ratings"
          subtitle="Settles each take's progress like a real one (Skill detail, progress moments). Removing demo takes doesn't put ratings back; Reset app does."
          value={moveRatings}
          onValueChange={setMoveRatings}
          testID="dev-demo-move-ratings"
        />
      </ListGroup>

      <View style={styles.buttons}>
        <PrimaryButton label="Add demo takes" icon="add-circle-outline" loading={busy === "add"} disabled={!!busy} onPress={add} testID="dev-demo-add" />
        <PrimaryButton label="Remove demo takes" variant="secondary" loading={busy === "remove"} disabled={!!busy || total === 0} onPress={remove} testID="dev-demo-remove" />
      </View>

      <ListGroup title={`What the set holds (${DEMO_TAKES.length} takes)`}>
        {DEMO_TAKES.map((take) => (
          <ListRow key={take.key} title={take.key} subtitle={`${take.daysAgo === 0 ? "Today" : `${take.daysAgo} days ago`}${take.judged ? " · judged (demo)" : ""}. ${take.purpose}`} />
        ))}
        {DEMO_REWINDS.map((rewind) => (
          <ListRow key={rewind.key} title={`Rewind: ${rewind.key}`} subtitle={`${rewind.daysAgo} days ago. ${rewind.purpose}`} />
        ))}
        {DEMO_CHAINS.map((chain) => (
          <ListRow key={chain.key} title={chain.drill === "word_chain" ? "Word Chain attempt" : "Bridge Chain attempt"} subtitle={`${chain.daysAgo} days ago. Counts toward the streak and progress; the link-by-link list isn't kept by the app.`} />
        ))}
      </ListGroup>
    </Screen>
  );
}

const useStyles = makeStyles((t) => ({
  block: { gap: t.space.sm },
  buttons: { gap: t.space.sm },
}));
