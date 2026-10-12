import { useCallback, useState } from "react";
import { Pressable, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../../navigation";
import { Card } from "../common/Card";
import { Txt } from "../common/Txt";
import { getFeelingWeek, type FeelingWeek } from "../../services/db/feelingsRepo";
import { ANGLES, getEmotion } from "../../domain/feelings";
import { makeStyles, useTheme } from "../../theme/ThemeProvider";

// The weekly ritual on Today — outside the skill rotation, on its own beat.
export function FeelingWeekCard({ featured = false }: { featured?: boolean }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [week, setWeek] = useState<FeelingWeek | null>(null);

  useFocusEffect(
    useCallback(() => {
      getFeelingWeek().then(setWeek);
    }, []),
  );

  if (!week) return null;
  const emotion = getEmotion(week.emotion);
  const done = week.reps > 0;
  const next = ANGLES[week.reps % ANGLES.length].title(emotion.label);

  return (
    <Pressable onPress={() => navigation.navigate("Feeling")} accessibilityRole="button" accessibilityLabel={`Feeling of the week: ${emotion.label}`}>
      <Card style={[styles.card, featured && !done && { borderColor: colors.skill.conversation.fg }]}>
        <View style={styles.row}>
          <View style={[styles.icon, { backgroundColor: colors.skill.conversation.bg }]}>
            <Ionicons name={done ? "checkmark" : "heart-outline"} size={20} color={colors.skill.conversation.fg} />
          </View>
          <View style={styles.flex}>
            <Txt variant="caption2" tone="muted" uppercase>
              Feeling of the week
            </Txt>
            <Txt variant="headline">{emotion.label}</Txt>
            <Txt variant="footnote" tone="secondary">
              {done ? `Done this week · another angle: ${next.toLowerCase()}` : `${next} — a minute or two, as honest as you can.`}
            </Txt>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
        </View>
      </Card>
    </Pressable>
  );
}

const useStyles = makeStyles((t) => ({
  card: { padding: t.space.md },
  row: { flexDirection: "row", alignItems: "center", gap: t.space.md },
  icon: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  flex: { flex: 1, gap: 2 },
}));
