import { useCallback, useState } from "react";
import { View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../../navigation";
import { Card } from "../common/Card";
import { Txt } from "../common/Txt";
import { rewindCardVisible } from "../../domain/rewind/labels";
import { hasRewindToday } from "../../services/db/rewindRepo";
import { makeStyles, useTheme } from "../../theme/ThemeProvider";

// In the evening, until you've told your day: a way into Rewind.
export function RewindTodayCard() {
  const styles = useStyles();
  const { colors } = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [show, setShow] = useState(false);

  useFocusEffect(
    useCallback(() => {
      hasRewindToday()
        .then((told) => setShow(rewindCardVisible(new Date(), told)))
        .catch(() => setShow(false));
    }, []),
  );

  if (!show) return null;
  const c = colors.skill.conversation;
  return (
    <Card onPress={() => navigation.navigate("Rewind")} accessibilityLabel="Rewind your day" style={styles.card}>
      <View style={styles.row}>
        <View style={[styles.icon, { backgroundColor: c.bg }]}>
          <Ionicons name="play-back" size={18} color={c.fg} />
        </View>
        <View style={styles.text}>
          <Txt variant="headline">Rewind your day</Txt>
          <Txt variant="footnote" tone="secondary">
            Two minutes, morning to night. Details, however small.
          </Txt>
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
      </View>
    </Card>
  );
}

const useStyles = makeStyles((t) => ({
  card: { padding: t.space.md },
  row: { flexDirection: "row", alignItems: "center", gap: t.space.md },
  icon: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  text: { flex: 1, gap: 2 },
}));
