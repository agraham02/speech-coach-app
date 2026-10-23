import { useEffect, useMemo, useState } from "react";
import { Linking, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../navigation";
import { Screen } from "../components/common/Screen";
import { Card } from "../components/common/Card";
import { ListGroup, ListRow } from "../components/common/ListRow";
import { PrimaryButton } from "../components/common/PrimaryButton";
import { Txt } from "../components/common/Txt";
import { Confetti } from "../components/celebrate/Confetti";
import { FURTHER_READING, FURTHER_READING_NOTE, type FurtherReading } from "../content/furtherReading";
import { describeFinale, FINALE_QUOTE, type FinaleFacts } from "../domain/pathFinale";
import { getPathView } from "../services/path/pathService";
import { getSkillStates, speakerLevelOf } from "../services/db/progressRepo";
import { getPathFinaleSeenAt, setPathFinaleSeenAt } from "../services/prefs/prefsStore";
import { SKILLS } from "../domain/mastery";
import { makeStyles, useTheme } from "../theme/ThemeProvider";
import { success } from "../utils/haptics";

type Props = NativeStackScreenProps<RootStackParamList, "PathFinale">;

const KIND_ICON: Record<FurtherReading["kind"], "book-outline" | "person-outline" | "people-outline" | "radio-outline"> = {
  book: "book-outline",
  coach: "person-outline",
  club: "people-outline",
  listen: "radio-outline",
};

// The end of the path: every unit done. One screen, once, after the last
// unit's own card (it can be reopened from Today or Learn): what you got
// through, a line to carry, what Tono keeps doing for you, and where to
// keep learning. Calm like the other moments, with one fall of confetti.
export function PathFinaleScreen({ navigation, route }: Props) {
  const styles = useStyles();
  const { colors } = useTheme();
  const [facts, setFacts] = useState<FinaleFacts | null>(null);
  const confettiColors = useMemo(() => [...SKILLS.map((s) => colors.skill[s].fg), colors.textPrimary], [colors]);

  useEffect(() => {
    // A Dev preview leaves the real moment alone.
    if (!route.params?.preview && !getPathFinaleSeenAt()) setPathFinaleSeenAt(new Date().toISOString());
    const haptic = setTimeout(success, 250);
    Promise.all([getPathView(), getSkillStates()])
      .then(([view, skills]) => {
        const done = view.units.filter((u) => u.status === "done");
        setFacts({
          units: done.length,
          lessons: done.reduce((sum, u) => sum + u.total, 0),
          shown: view.units.filter((u) => u.status === "tested_out").length,
          speakerLevel: speakerLevelOf(skills),
        });
      })
      .catch(() => setFacts(null));
    return () => clearTimeout(haptic);
  }, [route.params?.preview]);

  function open(url: string) {
    Linking.openURL(url).catch(() => undefined);
  }

  return (
    <View style={styles.root}>
      <Screen
        title="You finished your path"
        eyebrow="Every lesson, done"
        onBack={navigation.goBack}
        backIcon="close"
        footer={<PrimaryButton label="Back to practice" onPress={navigation.goBack} />}
      >
        <Txt variant="callout" tone="secondary">
          {facts && facts.units > 0
            ? `${describeFinale(facts)} That's the whole curriculum, start to finish.`
            : "That's the whole curriculum, start to finish."}
          {facts?.speakerLevel != null ? ` You're at speaker level ${facts.speakerLevel}.` : ""}
        </Txt>

        <Card style={styles.quote}>
          <Txt variant="title3" weight="500">
            {"“" + FINALE_QUOTE.text + "”"}
          </Txt>
          <Txt variant="footnote" tone="secondary">
            {FINALE_QUOTE.attribution}
          </Txt>
        </Card>

        <View style={styles.section}>
          <Txt variant="headline">What happens now</Txt>
          <Txt variant="subhead" tone="secondary">
            Your daily practice keeps going. Lessons come back for a short review as they start to fade, your events still shape what you practice, and your stages keep counting. Retake the skill check any time to hear how far you've come.
          </Txt>
          <PrimaryButton
            label="Retake the skill check"
            variant="secondary"
            size="sm"
            onPress={() => navigation.navigate("SkillCheck", { retake: true })}
            style={styles.inline}
          />
        </View>

        <View style={styles.section}>
          <Txt variant="headline">Where to go from here</Txt>
          <Txt variant="subhead" tone="secondary">
            Be sure to check out these to keep becoming a better speaker. Each one shaped a part of what you practiced here.
          </Txt>
        </View>
        <ListGroup>
          {FURTHER_READING.map((item) => (
            <ListRow
              key={item.title}
              icon={KIND_ICON[item.kind]}
              title={item.title}
              subtitle={(item.by ? item.by + ". " : "") + item.why}
              right={item.url ? <Ionicons name="open-outline" size={16} color={colors.textMuted} /> : undefined}
              onPress={item.url ? () => open(item.url!) : undefined}
              accessibilityLabel={item.url ? `${item.title}, opens in your browser` : item.title}
            />
          ))}
        </ListGroup>
        <Txt variant="caption1" tone="muted" style={styles.note}>
          {FURTHER_READING_NOTE}
        </Txt>
      </Screen>
      <Confetti colors={confettiColors} />
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  root: { flex: 1, backgroundColor: t.colors.background },
  quote: { gap: t.space.sm },
  section: { gap: t.space.sm },
  inline: { alignSelf: "flex-start" },
  note: { paddingHorizontal: 4 },
}));
