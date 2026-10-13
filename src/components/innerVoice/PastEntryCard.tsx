import { useCallback, useState } from "react";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../../navigation";
import { Card } from "../common/Card";
import { Txt } from "../common/Txt";
import { resurfaced } from "../../domain/innerVoice/run";
import { toSecondPerson } from "../../domain/innerVoice/secondPerson";
import { listSelfLikes } from "../../services/db/selfLikesRepo";
import { getSelfLikesRun, getUserProfile } from "../../services/prefs/prefsStore";
import { todayISODate } from "../../utils/dateUtils";
import { makeStyles } from "../../theme/ThemeProvider";

// While Three things is on a break, a line you wrote earlier turns up on
// Today in the morning — the same one all day, a different one tomorrow.
export function PastEntryCard() {
  const styles = useStyles();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [line, setLine] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (getSelfLikesRun().mode !== "paused" || new Date().getHours() >= 12) {
        setLine(null);
        return;
      }
      listSelfLikes().then((all) => {
        const pick = resurfaced(all, todayISODate());
        setLine(pick ? toSecondPerson(pick.text, getUserProfile()?.name) : null);
      });
    }, []),
  );

  if (!line) return null;
  return (
    <Card onPress={() => navigation.navigate("ThreeThings")} style={styles.card} accessibilityLabel="From your list">
      <Txt variant="footnote" weight="500" tone="secondary">
        From your list
      </Txt>
      <Txt variant="title3">{line}</Txt>
    </Card>
  );
}

const useStyles = makeStyles((t) => ({
  card: { gap: t.space.xs + 2 },
}));
