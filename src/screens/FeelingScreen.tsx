import { useCallback, useState } from "react";
import { ScrollView, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../navigation";
import { ScreenContainer } from "../components/common/ScreenContainer";
import { Header } from "../components/common/Header";
import { Card } from "../components/common/Card";
import { Txt } from "../components/common/Txt";
import { Chip } from "../components/common/Chip";
import { PrimaryButton } from "../components/common/PrimaryButton";
import { ANGLES, DETAIL_PROMPTS, EMOTIONS, GUARDRAIL, RULES, getEmotion, type EmotionId } from "../domain/feelings";
import { getFeelingWeek, swapFeelingWeek, type FeelingWeek } from "../services/db/feelingsRepo";
import { makeAdhocPrompt } from "../domain/sessionTypes";
import { makeStyles, useTheme } from "../theme/ThemeProvider";

type Props = NativeStackScreenProps<RootStackParamList, "Feeling">;

const PREP_SECONDS = 30;
const TARGET_SECONDS = 120;

// Feeling of the Week: one emotion from the wheel, a real time you felt it,
// talked about on camera with as much detail as you can. Private by default
// and never scored — putting it into words is the whole point.
export function FeelingScreen({ route, navigation }: Props) {
  const practice = route.params?.practice;
  const styles = useStyles();
  const { colors } = useTheme();
  const [week, setWeek] = useState<FeelingWeek | null>(null);
  const [swapping, setSwapping] = useState(false);

  useFocusEffect(
    useCallback(() => {
      getFeelingWeek().then(setWeek);
    }, []),
  );

  if (!week) return <ScreenContainer />;
  const emotion = getEmotion(week.emotion);
  const angleIndex = week.reps % ANGLES.length;
  const angle = ANGLES[angleIndex];

  async function swap(id: EmotionId) {
    await swapFeelingWeek(week!.weekStart, id);
    setSwapping(false);
    setWeek(await getFeelingWeek());
  }

  function start() {
    navigation.navigate("Recording", {
      kind: "prompt",
      prompt: makeAdhocPrompt(angle.prompt(emotion.label), "Feeling"),
      feeling: { emotion: emotion.id, angle: angleIndex },
      prepSeconds: PREP_SECONDS,
      targetSeconds: TARGET_SECONDS,
      prepNotes: DETAIL_PROMPTS,
      practice,
    });
  }

  return (
    <ScreenContainer style={styles.container}>
      <Header eyebrow={`Feeling of the week · ${week.reps === 0 ? "not done yet" : `${week.reps} this week`}`} title={emotion.label} onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Card style={styles.card}>
          <Txt variant="caption2" tone="accent" uppercase>
            {angle.title(emotion.label)}
          </Txt>
          <Txt variant="quote">{angle.prompt(emotion.label)}</Txt>
          <Txt variant="subhead" tone="secondary">
            A minute or two, on camera, with as much detail as you can. {RULES.join(" ")}
          </Txt>
        </Card>

        <Card style={styles.card}>
          <Txt variant="headline">Reach for a more exact word than “{emotion.label.toLowerCase()}”</Txt>
          {emotion.ladder.map((rung) => (
            <View key={rung.word} style={styles.rung}>
              <Txt variant="callout" weight="700">
                {rung.word}
              </Txt>
              <Txt variant="subhead" tone="secondary" style={styles.flex}>
                {rung.finer.join(" · ")}
              </Txt>
            </View>
          ))}
        </Card>

        <View style={styles.note}>
          <Ionicons name="heart-outline" size={18} color={colors.textSecondary} />
          <Txt variant="footnote" tone="secondary" style={styles.flex}>
            {GUARDRAIL}
          </Txt>
        </View>
        <View style={styles.note}>
          <Ionicons name="lock-closed-outline" size={18} color={colors.textSecondary} />
          <Txt variant="footnote" tone="secondary" style={styles.flex}>
            Stays on this phone: no cloud review, no Notion, and never kept as a progress video unless you choose to.
          </Txt>
        </View>

        {swapping ? (
          <Card style={styles.card}>
            <Txt variant="headline">Pick this week's feeling</Txt>
            <View style={styles.chips}>
              {EMOTIONS.filter((e) => e.id !== emotion.id).map((e) => (
                <Chip key={e.id} label={e.label} onPress={() => swap(e.id)} />
              ))}
            </View>
          </Card>
        ) : null}
      </ScrollView>
      <View style={styles.row}>
        <PrimaryButton label={swapping ? "Keep it" : "Swap"} variant="ghost" style={styles.flex} onPress={() => setSwapping((s) => !s)} />
        <PrimaryButton label="Start" style={styles.flexWide} onPress={start} />
      </View>
    </ScreenContainer>
  );
}

const useStyles = makeStyles((t) => ({
  container: { gap: t.space.md },
  scroll: { gap: t.space.md, paddingBottom: t.space.lg },
  card: { gap: t.space.sm },
  rung: { flexDirection: "row", gap: t.space.sm, alignItems: "baseline" },
  note: { flexDirection: "row", gap: t.space.sm, alignItems: "flex-start" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: t.space.sm },
  row: { flexDirection: "row", gap: t.space.sm },
  flex: { flex: 1 },
  flexWide: { flex: 2 },
}));
