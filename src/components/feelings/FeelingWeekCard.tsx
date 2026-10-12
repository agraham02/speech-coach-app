import { useCallback, useState } from "react";
import { View } from "react-native";
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
// `featured` (from onboarding: feelings are hard to put into words) gives it
// a colored edge until this week's rep is done.
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
  const c = colors.skill.conversation;

  return (
    <Card
      onPress={() => navigation.navigate("Feeling")}
      accessibilityLabel={`Feeling of the week: ${emotion.label}`}
      style={[styles.card, featured && !done && { borderWidth: 1.5, borderColor: c.fg }]}
    >
      <View style={styles.row}>
        <View style={[styles.icon, { backgroundColor: c.bg }]}>
          <Ionicons name={done ? "checkmark" : "heart"} size={20} color={c.fg} />
        </View>
        <View style={styles.flex}>
          <Txt variant="footnote" weight="500" tone="secondary">
            Feeling of the week
          </Txt>
          <Txt variant="title1" style={styles.emotion}>
            {emotion.label}
          </Txt>
          <Txt variant="footnote" tone="secondary">
            {done ? `Done this week · another angle: ${next.toLowerCase()}` : `${next} — a minute or two, as honest as you can.`}
          </Txt>
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
      </View>
    </Card>
  );
}

const useStyles = makeStyles((t) => ({
  card: { paddingVertical: t.space.md + 2 },
  row: { flexDirection: "row", alignItems: "center", gap: t.space.md },
  icon: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  flex: { flex: 1, gap: 1 },
  emotion: { fontSize: 22, lineHeight: 28, letterSpacing: -0.5 },
}));
