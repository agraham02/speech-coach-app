import { useNavigation } from "@react-navigation/native";
import { Screen } from "../components/common/Screen";
import { Txt } from "../components/common/Txt";
import { SourceList } from "../components/learn/SourceList";
import { makeStyles } from "../theme/ThemeProvider";

// Where every lesson's idea comes from: the books, research, coaches and
// practices behind the curriculum.
export function SourcesScreen() {
  const styles = useStyles();
  const navigation = useNavigation();
  return (
    <Screen title="Sources" onBack={() => navigation.goBack()} contentStyle={styles.content}>
      <Txt variant="callout" tone="secondary">
        Every lesson names where its idea comes from. Tono explains these ideas in its own words — read the originals for the full story. Tap a source with a link to open it.
      </Txt>
      <SourceList />
    </Screen>
  );
}

const useStyles = makeStyles((t) => ({
  content: { gap: t.space.md },
}));
