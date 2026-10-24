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
import { StatTile } from "../components/common/StatTile";
import { describeFinale, FINALE_QUOTE, type FinaleFacts } from "../domain/pathFinale";
import { biggestMover, describeJourney, EMPTY_JOURNEY, scoreStory, skillsThatGrew, type JourneyFacts } from "../domain/journey";
import { stageName } from "../domain/levels";
import { SKILL_LABELS } from "../theme/tokens";
import { loadJourney } from "../services/path/journey";
import { getPathView } from "../services/path/pathService";
import { getSkillStates, speakerLevelOf } from "../services/db/progressRepo";
import { getPathFinaleSeenAt, setPathFinaleSeenAt } from "../services/prefs/prefsStore";
import { SKILLS } from "../domain/mastery";
import { dateFromISODate } from "../utils/dateUtils";
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
  const [journey, setJourney] = useState<JourneyFacts>(EMPTY_JOURNEY);
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
    loadJourney()
      .then(setJourney)
      .catch(() => undefined);
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

        <JourneySection journey={journey} onOpenTake={(sessionId) => navigation.navigate("Result", { sessionId })} />

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

const shortDate = (iso: string) => dateFromISODate(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });

// How far you came, from the phone's own records: what you did, how each
// skill's stage moved from the skill check to now, and your first take
// beside your latest. Whatever there is no record of is left out.
function JourneySection({ journey, onOpenTake }: { journey: JourneyFacts; onOpenTake: (sessionId: string) => void }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const summary = describeJourney(journey);
  const grew = skillsThatGrew(journey);
  const mover = biggestMover(journey);
  const story = scoreStory(journey);
  const tiles = [
    { value: journey.takes, label: journey.takes === 1 ? "take recorded" : "takes recorded" },
    { value: journey.speakingMinutes, label: "minutes of speaking" },
    { value: journey.practiceDays, label: "days practiced" },
    { value: journey.longestStreak, label: "day best streak" },
  ].filter((t) => t.value > 0);
  if (!summary && journey.skills.length === 0) return null;
  const stageRows = journey.skills.filter((s) => s.nowStage > 1 || s.startStage > 1 || s.nowRating !== s.startRating);

  return (
    <View style={styles.section}>
      <Txt variant="headline">Your journey</Txt>
      {summary ? (
        <Txt variant="subhead" tone="secondary">
          {summary}
        </Txt>
      ) : null}
      {tiles.length > 0 ? (
        <View style={styles.tiles}>
          {tiles.slice(0, 4).map((t) => (
            <StatTile key={t.label} value={String(t.value)} label={t.label} />
          ))}
        </View>
      ) : null}

      {stageRows.length > 0 ? (
        <Card style={styles.journeyCard}>
          <Txt variant="subhead" weight="600">
            Where you started, and where you are
          </Txt>
          {journey.speakerLevelStart != null && journey.speakerLevelNow != null && journey.speakerLevelNow > journey.speakerLevelStart ? (
            <Txt variant="footnote" tone="secondary">
              {`Speaker level ${journey.speakerLevelStart} to ${journey.speakerLevelNow}${grew.length ? `, with ${grew.length} ${grew.length === 1 ? "skill" : "skills"} up a stage` : ""}.`}
            </Txt>
          ) : null}
          {stageRows.map((s) => {
            const c = colors.skill[s.skill];
            const grewHere = s.nowStage > s.startStage;
            return (
              <View key={s.skill} style={styles.skillRow}>
                <View style={[styles.dot, { backgroundColor: c.fg }]} />
                <Txt variant="subhead" style={styles.flex}>
                  {SKILL_LABELS[s.skill]}
                </Txt>
                <Txt variant="footnote" tone={grewHere ? "primary" : "muted"}>
                  {grewHere ? `${stageName(s.startStage)} to ${stageName(s.nowStage)}` : stageName(s.nowStage)}
                </Txt>
              </View>
            );
          })}
          {mover ? (
            <Txt variant="footnote" tone="secondary">
              {`${SKILL_LABELS[mover.skill]} moved the most.`}
            </Txt>
          ) : null}
        </Card>
      ) : null}

      {story || journey.firstTake ? (
        <Card style={styles.journeyCard}>
          <Txt variant="subhead" weight="600">
            Your voice, take by take
          </Txt>
          {story ? (
            <Txt variant="footnote" tone="secondary">
              {`Your first scored take measured ${story.first} out of 10. Your latest ${story.over} average ${story.now}${story.change > 0 ? `, up ${story.change}` : story.change < 0 ? `, ${Math.abs(story.change)} lower` : ", level"}. The same formula scores every take, so they compare fairly.`}
            </Txt>
          ) : null}
        </Card>
      ) : null}
      {journey.firstTake || journey.bestTake ? (
        <ListGroup>
          {journey.firstTake ? (
            <ListRow
              icon="play-circle-outline"
              title="Your first take"
              subtitle={shortDate(journey.firstTake.date) + (journey.firstTake.score != null ? ` · ${journey.firstTake.score} out of 10` : "")}
              chevron
              onPress={() => onOpenTake(journey.firstTake!.sessionId)}
            />
          ) : null}
          {journey.bestTake && journey.bestTake.sessionId !== journey.firstTake?.sessionId ? (
            <ListRow
              icon="trophy-outline"
              title="Your best take"
              subtitle={shortDate(journey.bestTake.date) + ` · ${journey.bestTake.score} out of 10`}
              chevron
              onPress={() => onOpenTake(journey.bestTake!.sessionId)}
            />
          ) : null}
        </ListGroup>
      ) : null}
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  root: { flex: 1, backgroundColor: t.colors.background },
  tiles: { flexDirection: "row", gap: t.space.sm },
  journeyCard: { gap: t.space.sm },
  skillRow: { flexDirection: "row", alignItems: "center", gap: t.space.sm },
  dot: { width: 8, height: 8, borderRadius: 4 },
  flex: { flex: 1 },
  quote: { gap: t.space.sm },
  section: { gap: t.space.sm },
  inline: { alignSelf: "flex-start" },
  note: { paddingHorizontal: 4 },
}));
