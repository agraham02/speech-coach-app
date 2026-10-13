import { useCallback, useMemo, useState } from "react";
import { View } from "react-native";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp, NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../navigation";
import { Screen } from "../components/common/Screen";
import { Card } from "../components/common/Card";
import { ListGroup, ListRow } from "../components/common/ListRow";
import { PrimaryButton } from "../components/common/PrimaryButton";
import { Txt } from "../components/common/Txt";
import { THREE_THINGS_PROMPTS } from "../content/threeThings";
import { toSecondPerson } from "../domain/innerVoice/secondPerson";
import type { RunMode } from "../domain/innerVoice/run";
import { listSelfLikes, type SelfLike } from "../services/db/selfLikesRepo";
import { getSelfLikesRun, getUserProfile, setSelfLikesRun } from "../services/prefs/prefsStore";
import { success } from "../utils/haptics";
import { makeStyles } from "../theme/ThemeProvider";

type Props = NativeStackScreenProps<RootStackParamList, "ThreeThingsList">;

// Everything you've written, grouped by the angle you took. After thirty
// days it's the wrap-up: read the whole list aloud once, then choose what's
// next.
export function ThreeThingsListScreen({ route }: Props) {
  const styles = useStyles();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const capstone = !!route.params?.capstone;
  const [entries, setEntries] = useState<SelfLike[] | null>(null);
  const [read, setRead] = useState(false);
  const name = getUserProfile()?.name?.trim();

  useFocusEffect(
    useCallback(() => {
      listSelfLikes().then(setEntries);
    }, []),
  );

  const all = entries ?? [];
  const groups = useMemo(() => {
    const byPrompt = new Map<string, SelfLike[]>();
    for (const like of all) {
      const key = like.promptId ?? "other";
      byPrompt.set(key, [...(byPrompt.get(key) ?? []), like]);
    }
    const labelled = THREE_THINGS_PROMPTS.filter((p) => byPrompt.has(p.id)).map((p) => ({ title: p.label, items: byPrompt.get(p.id)! }));
    return byPrompt.has("other") ? [...labelled, { title: "In your own words", items: byPrompt.get("other")! }] : labelled;
  }, [all]);

  function choose(mode: RunMode, nextRound: boolean) {
    const current = getSelfLikesRun();
    setSelfLikesRun({ round: nextRound ? current.round + 1 : current.round, mode });
    success();
    navigation.navigate("Tabs", { screen: "You" });
  }

  const dayCount = new Set(all.map((e) => e.date)).size;

  return (
    <Screen title={capstone ? "Your thirty days" : "Your list"} onBack={() => navigation.goBack()} contentStyle={styles.content}>
      <Txt variant="callout" tone="secondary">
        {all.length} {all.length === 1 ? "thing" : "things"} across {dayCount} {dayCount === 1 ? "day" : "days"}. Each one is yours.
      </Txt>

      {capstone ? (
        <Card style={styles.card}>
          <Txt variant="headline">Read it all aloud</Txt>
          <Txt variant="subhead" tone="secondary">
            Read your list from the top, slowly, to yourself. It's a lot of good things, and every one is true.
          </Txt>
          <PrimaryButton label={read ? "Read it aloud ✓" : "I've read it aloud"} variant={read ? "secondary" : "primary"} onPress={() => setRead(true)} />
        </Card>
      ) : null}

      {groups.map((group) => (
        <View key={group.title} style={styles.group}>
          <Txt variant="footnote" weight="500" tone="secondary" style={styles.groupTitle}>
            {group.title}
          </Txt>
          <Card style={styles.list}>
            {group.items.map((like, i) => (
              <View key={like.id} style={[styles.row, i > 0 && styles.divided]}>
                <Txt variant="body" weight="500">
                  {toSecondPerson(like.text, name)}
                </Txt>
              </View>
            ))}
          </Card>
        </View>
      ))}

      {all.length >= 3 ? (
        <PrimaryButton label="Say a few as lines" variant="secondary" icon="mic-outline" onPress={() => navigation.navigate("LineRep", { aboutYou: true })} />
      ) : null}

      {capstone ? (
        <>
          <Txt variant="title3" style={styles.next}>
            What next?
          </Txt>
          <ListGroup>
            <ListRow icon="repeat-outline" title="Another 30" subtitle="A new round — still nothing you've written before" chevron onPress={() => choose("run", true)} />
            <ListRow icon="leaf-outline" title="Keep it light" subtitle="One a day, with no end" chevron onPress={() => choose("light", false)} />
            <ListRow icon="pause-outline" title="Take a break" subtitle="Nothing daily; an old one turns up on Today now and then" chevron onPress={() => choose("paused", false)} />
          </ListGroup>
        </>
      ) : null}
    </Screen>
  );
}

const useStyles = makeStyles((t) => ({
  content: { gap: t.space.md },
  card: { gap: t.space.sm + 2 },
  group: { gap: t.space.sm },
  groupTitle: { paddingHorizontal: 4 },
  list: { paddingVertical: t.space.xs },
  row: { paddingVertical: t.space.md },
  divided: { borderTopWidth: 1, borderTopColor: t.colors.separator },
  next: { marginTop: t.space.md, paddingHorizontal: 4 },
}));
