import { Fragment } from "react";
import { Linking, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { Screen } from "../components/common/Screen";
import { Card } from "../components/common/Card";
import { PressableScale } from "../components/common/PressableScale";
import { Txt } from "../components/common/Txt";
import { SOURCE_GROUPS, type Source } from "../content/sources";
import type { SkillId } from "../theme/tokens";
import { makeStyles, useTheme } from "../theme/ThemeProvider";

interface Framework {
  skill?: SkillId;
  title: string;
  description: string;
  points: string[];
  tryThis: string;
  // Short credit; the full reference is under Sources below.
  from: string;
}

const FRAMEWORKS: Framework[] = [
  {
    skill: "impromptu",
    title: "Organize on the spot",
    description: "A shape to fall back on when you're put on the spot, so you never start from a blank page.",
    points: [
      "What, so what, now what: the point, why it matters, what to do about it.",
      "PREP: point, reason, example — then the point again to close the loop.",
      "Point first: lead with the answer, then back it up.",
      "Rule of three: three supporting points, no more.",
    ],
    tryThis: "Pick an object near you and give it 60 seconds of what, so what, now what — out loud.",
    from: "Matt Abrahams, Think Faster, Talk Smarter; Toastmasters",
  },
  {
    skill: "impromptu",
    title: "The Story Spine",
    description: "An improv tool for shaping a story so each beat causes the next — it keeps a story moving instead of circling one idea.",
    points: ["Once upon a time…", "Every day…", "But one day…", "Because of that… (as many times as you need)", "Until finally…", "Ever since then…"],
    tryThis: "Before a story, run it through the spine in your head. If a beat doesn't cause the next one, cut it.",
    from: "Kenn Adams, How to Improvise a Full-Length Play",
  },
  {
    skill: "cadence",
    title: "Five vocal foundations",
    description: "How something is said, separate from what is said.",
    points: [
      "Rate: slow down for weight, speed up for energy.",
      "Volume: get louder or softer on purpose — never stay flat.",
      "Pitch and melody: let the voice rise and fall instead of droning.",
      "Tonality: match the feeling of the words — your face drives it.",
      "Pausing: pause to let a point land, instead of filling the gap with 'um'.",
    ],
    tryThis: "Read one line three times: once fast, once slow, once with a full pause before the key word. Notice which one lands.",
    from: "Vinh Giang",
  },
  {
    skill: "confidence",
    title: "Breath support",
    description: "Breath is the engine under pace, volume and a steady voice.",
    points: [
      "Breathe low: belly and lower ribs move, shoulders stay still.",
      "One breath, one phrase: top up at commas and full stops, never mid-thought.",
      "Volume comes from more breath, not a tighter throat.",
      "Long out-breaths calm you down — two breaths in, one slow breath out.",
    ],
    tryThis: "Breathe in low, then count out loud at an easy pace on one breath. Note the number — it grows with practice.",
    from: "Winkworth et al. (1995, 1997); Hoit et al. (1988); Balban et al. (2023); Linklater",
  },
  {
    title: "Three pillars",
    description: "Structure, content and delivery are judged separately — a well-shaped answer can still say little, and a great point can be delivered badly.",
    points: [
      "Content stands on its own: specifics, not general filler.",
      "Say something new in each sentence instead of restating the last one.",
      "Fillers: about 5 a minute barely registers; over 10 starts to distract.",
    ],
    tryThis: "Read a transcript back and circle any sentence that only repeats an earlier one in new words.",
    from: "Toastmasters evaluation",
  },
  {
    skill: "conversation",
    title: "TALK",
    description: "Four habits of people who are good to talk to.",
    points: [
      "Topics: prepare a few, and move between them.",
      "Asking: ask, then follow up on the answer.",
      "Levity: react, laugh, play along — you don't need jokes.",
      "Kindness: make it about them, too.",
    ],
    tryThis: "In your next conversation, ask one follow-up question before you share anything of your own.",
    from: "Alison Wood Brooks, Talk; Huang et al. (2017)",
  },
  {
    skill: "confidence",
    title: "Name it finer",
    description: "Putting a feeling into precise words takes some of its edge off, and makes what you say more vivid.",
    points: ["Start broad (glad, sad, scared, mad), then pick a finer word.", "Say where you felt it and what set it off.", "Keep it short and true."],
    tryThis: "Describe one moment from today using a feeling word you rarely use.",
    from: "Willcox's Feeling Wheel; Lieberman et al. (2007)",
  },
  {
    title: "How Tono practices",
    description: "Why sessions look the way they do.",
    points: [
      "Drills adjust so you succeed about 85% of the time — hard enough to learn from, not so hard you stall.",
      "Short sessions spread through the day stick better than one long one.",
      "A plan tied to a habit ('After my coffee, I'll practice') makes you far likelier to follow through.",
    ],
    tryThis: "Pick the moment in your day that comes before practice, and set your reminder just after it.",
    from: "Wilson et al. (2019); Cepeda et al. (2006); Gollwitzer (1999)",
  },
];

// "*Title.* Rest" → the title in italics.
function Citation({ text }: { text: string }) {
  return (
    <Txt variant="subhead">
      {text.split("*").map((part, i) => (
        <Fragment key={i}>{i % 2 === 1 ? <Txt variant="subhead" italic>{part}</Txt> : part}</Fragment>
      ))}
    </Txt>
  );
}

function SourceRow({ source }: { source: Source }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const body = (
    <>
      <View style={styles.flex}>
        <Citation text={source.citation} />
        <Txt variant="footnote" tone="secondary">
          {source.usedFor}
        </Txt>
      </View>
      {source.url ? <Ionicons name="open-outline" size={16} color={colors.textMuted} style={styles.linkIcon} /> : null}
    </>
  );
  if (!source.url) return <View style={styles.sourceRow}>{body}</View>;
  const url = source.url;
  return (
    <PressableScale
      onPress={() => Linking.openURL(url).catch(() => undefined)}
      scaleTo={0.99}
      style={styles.sourceRow}
      accessibilityRole="link"
      accessibilityHint="Opens in your browser"
    >
      {body}
    </PressableScale>
  );
}

export function TipsScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const navigation = useNavigation();
  return (
    <Screen title="Frameworks" onBack={() => navigation.goBack()} contentStyle={styles.content}>
      <Txt variant="callout" tone="secondary">
        The models behind your lessons and scores, how to practice each, and where they come from.
      </Txt>

      {FRAMEWORKS.map((f) => {
        const tint = f.skill ? colors.skill[f.skill] : null;
        return (
          <Card key={f.title} style={styles.card}>
            <View style={styles.titleRow}>
              {tint ? <View style={[styles.dot, { backgroundColor: tint.fg }]} /> : null}
              <Txt variant="title3">{f.title}</Txt>
            </View>
            <Txt variant="subhead" tone="secondary">
              {f.description}
            </Txt>
            <View style={styles.points}>
              {f.points.map((point) => (
                <View key={point} style={styles.point}>
                  <View style={[styles.bullet, { backgroundColor: tint?.fg ?? colors.textMuted }]} />
                  <Txt variant="callout" style={styles.flex}>
                    {point}
                  </Txt>
                </View>
              ))}
            </View>
            <View style={[styles.tryBox, { backgroundColor: tint?.bg ?? colors.surfaceRaised }]}>
              <Txt variant="footnote" weight="600" color={tint?.fg ?? colors.textPrimary}>
                Try this
              </Txt>
              <Txt variant="callout">{f.tryThis}</Txt>
            </View>
            <Txt variant="footnote" tone="muted">
              From {f.from}
            </Txt>
          </Card>
        );
      })}

      <View style={styles.sourcesHead}>
        <Txt variant="title2">Sources</Txt>
        <Txt variant="subhead" tone="secondary">
          Every lesson names where its idea comes from. Here's the full list — tap one with a link to read it.
        </Txt>
      </View>
      {SOURCE_GROUPS.map((group) => (
        <View key={group.title} style={styles.group}>
          <Txt variant="footnote" weight="500" tone="secondary" style={styles.groupTitle}>
            {group.title}
          </Txt>
          <Card style={styles.groupCard}>
            {group.sources.map((source, i) => (
              <Fragment key={source.citation}>
                {i > 0 ? <View style={styles.hairline} /> : null}
                <SourceRow source={source} />
              </Fragment>
            ))}
          </Card>
        </View>
      ))}
    </Screen>
  );
}

const useStyles = makeStyles((t) => ({
  content: { gap: t.space.md },
  card: { gap: t.space.sm + 2 },
  titleRow: { flexDirection: "row", alignItems: "center", gap: t.space.sm },
  dot: { width: 8, height: 8, borderRadius: 4 },
  points: { gap: t.space.sm, marginTop: 2 },
  point: { flexDirection: "row", alignItems: "flex-start", gap: t.space.sm + 2 },
  bullet: { width: 5, height: 5, borderRadius: 2.5, marginTop: 9 },
  flex: { flex: 1, gap: 3 },
  tryBox: { borderRadius: t.radius.md - 4, padding: t.space.md - 2, gap: 4, marginTop: 2 },
  sourcesHead: { gap: 4, marginTop: t.space.lg, paddingHorizontal: 4 },
  group: { gap: t.space.sm },
  groupTitle: { paddingHorizontal: 4 },
  groupCard: { paddingVertical: 4 },
  sourceRow: { flexDirection: "row", alignItems: "flex-start", gap: t.space.md, paddingVertical: t.space.sm + 4 },
  linkIcon: { marginTop: 3 },
  hairline: { height: 1, backgroundColor: t.colors.separator },
}));
