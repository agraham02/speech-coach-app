import { useCallback, useState } from "react";
import { View } from "react-native";
import { useFocusEffect, useNavigation, useRoute, type RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../navigation";
import { Screen } from "../components/common/Screen";
import { HeroCard } from "../components/common/HeroCard";
import { ListGroup, ListRow } from "../components/common/ListRow";
import { PrimaryButton } from "../components/common/PrimaryButton";
import { Txt } from "../components/common/Txt";
import { partsCovered } from "../domain/rewind/stats";
import { getRewindDates, listRewinds, type Rewind } from "../services/db/rewindRepo";
import { getRewindOffer } from "../services/rewind/rewindTiming";
import { canTellDay, rewindWords, type RewindDay } from "../domain/rewind/rewindTiming";
import { dayLabel } from "../domain/rewind/labels";
import { formatDuration } from "../utils/dateUtils";
import { makeStyles, useTheme } from "../theme/ThemeProvider";

// Tips from the cognitive interview, a method investigators use to help
// people recall more of what they saw (Fisher & Geiselman).
const TIPS = [
  { title: "Say everything, however small", body: "The small stuff is what makes a day real, and it pulls other memories with it." },
  { title: "Picture where you were", body: "What could you see and hear? What was the light, the weather, who was around?" },
  { title: "Names, times and numbers", body: "Who exactly? About what time? How many?" },
  { title: "Morning to night", body: "Start when you woke up and move through the day. Stuck? Try going backwards from now." },
];

function summaryLine(r: Rewind): string {
  const parts = [formatDuration(r.durationSeconds)];
  if (r.stats) {
    parts.push(`${partsCovered(r.stats.coverage)} of 3 parts of the day`);
    parts.push(`${r.stats.details.total} ${r.stats.details.total === 1 ? "detail" : "details"}`);
  }
  return parts.join(" · ");
}

// Rewind: tell your day out loud, one to two minutes, morning to night. The
// goal is recall and description — as much concrete detail as you can find,
// however mundane — not a polished story, and never a score.
export function RewindScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<RouteProp<RootStackParamList, "Rewind">>();
  const asked = route.params?.day;
  const [takes, setTakes] = useState<Rewind[]>([]);
  // Which day Start tells: the one asked for if it is still open, else the one
  // on offer right now (yesterday in the morning if it wasn't told), else today.
  const [chosen, setChosen] = useState<RewindDay | null>(null);
  const [yesterdayOpen, setYesterdayOpen] = useState(false);

  useFocusEffect(
    useCallback(() => {
      listRewinds().then(setTakes);
      Promise.all([getRewindOffer(), getRewindDates()])
        .then(([offer, told]) => {
          setYesterdayOpen(canTellDay("yesterday", new Date(), told));
          setChosen(asked && canTellDay(asked, new Date(), told) ? asked : (offer?.day ?? "today"));
        })
        .catch(() => setChosen(asked ?? "today"));
    }, [asked]),
  );

  const day: RewindDay = chosen ?? asked ?? "today";
  const words = rewindWords(day);
  const other: RewindDay = day === "today" ? "yesterday" : "today";
  const showSwitch = day === "yesterday" || yesterdayOpen;

  return (
    <Screen title="Rewind" eyebrow="Tell your day" onBack={() => navigation.goBack()} contentStyle={styles.content}>
      <HeroCard accent={colors.skill.conversation.fg} contentStyle={styles.hero}>
        <Txt variant="title2">{words.hero}</Txt>
        <Txt variant="callout" tone="secondary">
          {words.heroBody}
        </Txt>
        <PrimaryButton label="Start" iconRight="arrow-forward" onPress={() => navigation.navigate("RewindRecord", { day })} />
        {showSwitch ? <PrimaryButton label={other === "yesterday" ? "Tell yesterday instead" : "Tell today instead"} variant="ghost" onPress={() => setChosen(other)} /> : null}
      </HeroCard>

      <View style={styles.tips}>
        <Txt variant="footnote" weight="500" tone="secondary" style={styles.tipsTitle}>
          To remember more
        </Txt>
        {TIPS.map((tip) => (
          <View key={tip.title} style={styles.tip}>
            <Txt variant="headline">{tip.title}</Txt>
            <Txt variant="subhead" tone="secondary">
              {tip.body}
            </Txt>
          </View>
        ))}
      </View>

      {takes.length > 0 ? (
        <ListGroup title="Your days">
          {takes.map((take) => (
            <ListRow
              key={take.id}
              icon="time-outline"
              title={dayLabel(take.date)}
              subtitle={take.status === "processing" ? "Still listening back…" : summaryLine(take)}
              chevron
              onPress={() => navigation.navigate("RewindResult", { id: take.id })}
            />
          ))}
        </ListGroup>
      ) : null}

      <Txt variant="footnote" tone="muted" style={styles.note}>
        Private: it stays on your phone, and nothing is scored. Just the details, counted.
      </Txt>
    </Screen>
  );
}

const useStyles = makeStyles((t) => ({
  content: { gap: t.space.lg },
  hero: { gap: t.space.md },
  tips: { gap: t.space.md },
  tipsTitle: { paddingHorizontal: 4 },
  tip: { gap: 2, paddingHorizontal: 4 },
  note: { paddingHorizontal: 4 },
}));
