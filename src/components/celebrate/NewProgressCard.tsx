import { useCallback, useEffect, useState } from "react";
import { View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import Animated from "react-native-reanimated";
import type { RootStackParamList } from "../../navigation";
import { Card } from "../common/Card";
import { IconButton } from "../common/IconButton";
import { PressableScale } from "../common/PressableScale";
import { Txt } from "../common/Txt";
import { getUnseenMoments, markProgressSeen, type UnseenMoment } from "../../services/progress/progressMoments";
import { subscribeToProgress } from "../../services/progress/progressEvents";
import { enter } from "../../theme/motion";
import { makeStyles, useTheme } from "../../theme/ThemeProvider";

// On Today: a take whose progress landed after you'd left its Result —
// usually because the deep review took a while. Tapping plays the moment
// there; the cross lets it go.
export function NewProgressCard() {
  const styles = useStyles();
  const { colors } = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [moment, setMoment] = useState<UnseenMoment | null>(null);
  const [more, setMore] = useState(0);

  const load = useCallback(() => {
    getUnseenMoments()
      .then((all) => {
        setMoment(all[0] ?? null);
        setMore(Math.max(0, all.length - 1));
      })
      .catch(() => undefined);
  }, []);

  useFocusEffect(load);
  useEffect(() => subscribeToProgress(load), [load]);

  if (!moment) return null;
  return (
    <Animated.View entering={enter(1)}>
      <PressableScale
        onPress={() => navigation.navigate("Result", { sessionId: moment.sessionId })}
        accessibilityRole="button"
        accessibilityLabel={`New progress: ${moment.headline}, from ${moment.title}. Opens the take`}
      >
        <Card style={styles.card}>
          <View style={[styles.icon, { backgroundColor: colors.successMuted }]}>
            <Ionicons name="sparkles" size={18} color={colors.success} />
          </View>
          <View style={styles.flex}>
            <Txt variant="footnote" weight="500" tone="secondary">
              New progress{more ? ` · ${more + 1} takes` : ""}
            </Txt>
            <Txt variant="headline">{moment.headline}</Txt>
            <Txt variant="footnote" tone="muted" numberOfLines={1}>
              From “{moment.title}”
            </Txt>
          </View>
          <IconButton
            icon="close"
            size={34}
            onPress={() => {
              markProgressSeen(moment.sessionId).then(load).catch(() => undefined);
            }}
            accessibilityLabel="Dismiss"
          />
        </Card>
      </PressableScale>
    </Animated.View>
  );
}

const useStyles = makeStyles((t) => ({
  card: { flexDirection: "row", alignItems: "center", gap: t.space.sm + 4 },
  icon: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  flex: { flex: 1, gap: 2 },
}));
