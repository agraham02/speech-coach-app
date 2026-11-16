import { useState } from "react";
import { View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { Screen } from "../../components/common/Screen";
import { Card } from "../../components/common/Card";
import { ListGroup, SwitchRow } from "../../components/common/ListRow";
import { PrimaryButton } from "../../components/common/PrimaryButton";
import { Txt } from "../../components/common/Txt";
import { Accordion, AccordionGroup, BandStack, BigNumber, CapsuleBar, Ladder, SayHeadline, WeekStrip } from "../../components/ui";
import { ChecklistRows, CompareTrack, DayPicker, FilterChips, OptionCards, RatingTrack, SegmentedControl, ValueRow } from "../../components/ui/inputs";
import { PILLAR_KEYS } from "../../theme/tokens";
import { makeStyles, useTheme } from "../../theme/ThemeProvider";

// Dev: every shared component of the "Words and bands" look (task 8.2) on one
// page, to check them in both themes and at large text sizes.
export function ComponentsScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const navigation = useNavigation();
  const [minutes, setMinutes] = useState<string>("10");
  const [challenge, setChallenge] = useState("standard");
  const [days, setDays] = useState([1, 2, 3, 4, 5]);
  const [felt, setFelt] = useState<number | null>(3);
  const [obstacles, setObstacles] = useState<string[]>(["ramble"]);
  const [filter, setFilter] = useState<string[]>([]);
  const [view, setView] = useState("overview");
  const [on, setOn] = useState(true);

  return (
    <Screen eyebrow="Dev" title="Components" onBack={() => navigation.goBack()}>
      <Section title="Type">
        <SayHeadline segments={[{ text: "Morning, Sam. ", strong: true }, { text: "Ten minutes", onPress: () => undefined, accessibilityLabel: "Ten minutes, change" }, { text: " on the power of the pause today." }]} />
        <SayHeadline size="s" segments={[{ text: "A smaller sentence, ", strong: true }, { text: "for cards." }]} />
        <BigNumber value={72} unit="Overall" />
        <Txt variant="label" tone="secondary">
          Section label
        </Txt>
        <Txt variant="quote">“Tell me about a time you changed your mind.”</Txt>
      </Section>

      <Section title="Buttons and cards">
        <PrimaryButton label="Start session" iconRight="arrow-forward" onPress={() => undefined} />
        <PrimaryButton label="Secondary" variant="secondary" onPress={() => undefined} />
        <View style={styles.row}>
          {[0, 1, 2, 3, 4].map((t) => (
            <Card key={t} tint={t} style={styles.swatch}>
              <Txt variant="footnote">Tint {t + 1}</Txt>
            </Card>
          ))}
        </View>
        <View style={styles.row}>
          {PILLAR_KEYS.map((p) => (
            <View key={p} style={[styles.tag, { backgroundColor: colors.pillar[p].bg }]}>
              <Txt variant="caption1" weight="600" color={colors.pillar[p].fg}>
                {p[0].toUpperCase() + p.slice(1)}
              </Txt>
            </View>
          ))}
        </View>
      </Section>

      <Section title="Bands">
        <BandStack
          bands={[
            { id: "1", number: 1, title: "Warm up", meta: "1 min", state: "done" },
            { id: "2", number: 2, title: "Learn", subtitle: "Pause before the point", meta: "2 min" },
            { id: "3", number: 3, title: "Drill", meta: "2 min", onPress: () => undefined },
            { id: "4", number: 4, title: "Record + review", meta: "4 min", state: "locked" },
          ]}
        />
        <CapsuleBar
          steps={[
            { minutes: 1, state: "done", name: "Warm up" },
            { minutes: 2, state: "done", name: "Learn" },
            { minutes: 2, state: "current", name: "Drill" },
            { minutes: 4, state: "todo", name: "Record" },
            { minutes: 1, state: "todo", name: "Reflect" },
          ]}
        />
        <Ladder count={5} current={3} names={["Starting", "Building", "Steady", "Strong", "Natural"]} />
        <WeekStrip days={["full", "part", "frozen", "missed", "full", "future", "future"]} todayIndex={4} />
      </Section>

      <Section title="Controls">
        <SegmentedControl
          options={[
            { key: "overview", label: "Overview" },
            { key: "transcript", label: "Transcript" },
            { key: "details", label: "Details" },
          ]}
          value={view}
          onChange={setView}
        />
        <ListGroup outlined>
          <ValueRow
            label="Challenge"
            value={challenge}
            options={[
              { key: "gentle", label: "Gentle" },
              { key: "standard", label: "Standard" },
              { key: "push", label: "Push me" },
            ]}
            onChange={setChallenge}
          />
          <SwitchRow title="Reminders" value={on} onValueChange={setOn} />
        </ListGroup>
        <OptionCards
          options={[
            { key: "5", lead: "5", title: "5 minutes", detail: "Warm up, learn, a take" },
            { key: "10", lead: "10", title: "10 minutes", detail: "Warm up, lesson, drill, take, reflect" },
            { key: "20", lead: "20", title: "20 minutes", detail: "Two blocks of 10" },
          ]}
          value={minutes}
          onChange={setMinutes}
          accessibilityLabel="Minutes a day"
        />
        <DayPicker value={days} onChange={setDays} />
        <RatingTrack value={felt} onChange={setFelt} lowLabel="Rough" highLabel="Great" accessibilityLabel="How did it go?" />
        <CompareTrack felt={3} after={4} measured={3.6} />
        <ChecklistRows
          items={[
            { key: "ramble", label: "I ramble" },
            { key: "blank", label: "I go blank" },
            { key: "fast", label: "I talk too fast" },
          ]}
          value={obstacles}
          onChange={setObstacles}
        />
        <FilterChips options={PILLAR_KEYS.map((p) => ({ key: p, label: p[0].toUpperCase() + p.slice(1), pillar: p }))} value={filter} onChange={setFilter} multiple allowClear />
      </Section>

      <Section title="Fold">
        <AccordionGroup>
          <Accordion title="How we scored this" subtitle="What was checked">
            <Txt variant="subhead" tone="secondary">
              The phone measured your voice and pauses; Tono AI read what you said.
            </Txt>
          </Accordion>
          <Accordion title="Analysis">
            <Txt variant="subhead" tone="secondary">
              Steps, retries and cost.
            </Txt>
          </Accordion>
        </AccordionGroup>
      </Section>
    </Screen>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const styles = useStyles();
  return (
    <View style={styles.section}>
      <Txt variant="label" tone="secondary">
        {title}
      </Txt>
      {children}
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  section: { gap: t.space.md },
  row: { flexDirection: "row", flexWrap: "wrap", gap: t.space.sm },
  swatch: { padding: t.space.md },
  tag: { paddingHorizontal: 10, height: 24, borderRadius: 12, justifyContent: "center" },
}));
