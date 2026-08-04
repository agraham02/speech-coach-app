import { ScrollView, StyleSheet, Text, View } from "react-native";
import { ScreenContainer } from "../components/common/ScreenContainer";
import { Card } from "../components/common/Card";
import { useTabBarBottomInset } from "../hooks/useTabBarBottomInset";
import { colors, spacing, typography } from "../theme/theme";

interface Framework {
  accent: string;
  accentMuted: string;
  title: string;
  description: string;
  tips: string[];
  drillLabel: string;
  drillText: string;
}

const FRAMEWORKS: Framework[] = [
  {
    accent: colors.violet,
    accentMuted: colors.violetMuted,
    title: "Structure — organize on the fly",
    description:
      "A shape to fall back on when you're put on the spot, so you're never starting from a blank page.",
    tips: [
      "What/Why/How: say what your point is, why it matters, then how it plays out.",
      "Story arc: beginning, middle, end — a situation, a turn, a resolution.",
      "PREP: Point → Reason → Example → Point again, to close the loop.",
      "Rule of Three: pick exactly three supporting points, no more, no fewer.",
    ],
    drillLabel: "TRY THIS",
    drillText: "Pick a random object nearby and give a 60-second what/why/how on it, out loud.",
  },
  {
    accent: colors.pink,
    accentMuted: colors.pinkMuted,
    title: "Storytelling — the Pixar Story Spine",
    description:
      "A 7-beat template Pixar and Disney writers train on. Each beat causally follows the last, so the story keeps moving instead of circling one idea.",
    tips: [
      "Once upon a time…",
      "Every day…",
      "Until one day…",
      "Because of that…",
      "Because of that…",
      "Until finally…",
      "Ever since then…",
    ],
    drillLabel: "TRY THIS",
    drillText:
      "Before you record, run your response through the story spine — even just mentally — to make sure it actually goes somewhere instead of restating the same point in different words.",
  },
  {
    accent: colors.accent,
    accentMuted: colors.accentMuted,
    title: "Delivery — vocal foundations & archetypes",
    description: "Vinh Giang's five levers for how something is said, plus four communication styles.",
    tips: [
      "Rate: vary your pace — slow down for weight, speed up for energy.",
      "Volume: don't stay flat — get louder or softer on purpose.",
      "Pitch & melody: let your pitch rise and fall naturally, don't monotone.",
      "Tonality: match your tone to the emotion of what you're saying.",
      "Pausing: pause on purpose to let a point land — don't fill silence with \"um.\"",
      "Archetypes: Motivator (high energy), Educator (clear & measured), Coach (direct & encouraging), Friend (warm & casual) — which fits your topic?",
    ],
    drillLabel: "TRY THIS",
    drillText: "The \"Exaggerated Vocal Melody\" drill: re-read a past response while deliberately over-emphasizing pitch rises on contrasting words, and smiling visibly on key phrases.",
  },
  {
    accent: colors.teal,
    accentMuted: colors.tealMuted,
    title: "Content & Evaluation — Toastmasters' 3 pillars",
    description:
      "Toastmasters judges a speech on Structure, Content, and Delivery as three separate, equally-weighted pillars — this app grades the same way.",
    tips: [
      "Content is graded on its own: does it actually address the prompt with specifics, not generic filler?",
      "Coherence matters as much as relevance — clear sentences, logical flow, an actual point of view.",
      "Filler words: 5/min or fewer barely registers, 5-10/min is noticeable, more than 10/min is distracting.",
      "Watch for restating the same point in different words instead of adding something new.",
    ],
    drillLabel: "TRY THIS",
    drillText: "After a session, read your verbatim transcript back and circle any sentence that just repeats an earlier one in different words.",
  },
];

export function TipsScreen() {
  const tabBarInset = useTabBarBottomInset();
  return (
    <ScreenContainer style={styles.container} edges={["top", "left", "right"]}>
      <View style={styles.header}>
        <Text style={styles.title}>Tips & Frameworks</Text>
        <Text style={styles.subtitle}>The coaching models behind your scores — and how to practice them.</Text>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: spacing.lg + tabBarInset }]}
        showsVerticalScrollIndicator={false}
      >
        {FRAMEWORKS.map((framework) => (
        <Card key={framework.title} style={styles.section}>
          <Text style={[styles.sectionTitle, { color: framework.accent }]}>{framework.title}</Text>
          <Text style={styles.sectionDescription}>{framework.description}</Text>
          <View style={styles.tipsList}>
            {framework.tips.map((tip, index) => (
              <View key={index} style={styles.tipRow}>
                <View style={[styles.tipDot, { backgroundColor: framework.accent }]} />
                <Text style={styles.tipText}>{tip}</Text>
              </View>
            ))}
          </View>
          <View style={[styles.drillBox, { backgroundColor: framework.accentMuted }]}>
            <Text style={[styles.drillLabel, { color: framework.accent }]}>{framework.drillLabel}</Text>
            <Text style={styles.drillText}>{framework.drillText}</Text>
          </View>
        </Card>
      ))}

      <Card style={styles.section}>
        <Text style={styles.sectionTitle}>Warm-ups & practice drills</Text>
        <Text style={styles.sectionDescription}>
          A few minutes of warm-up before recording makes a real difference in how loose and natural you sound.
        </Text>
        <View style={styles.tipsList}>
          <View style={styles.tipRow}>
            <View style={[styles.tipDot, { backgroundColor: colors.textMuted }]} />
            <Text style={styles.tipText}>
              Vocal warm-up: hum for 30 seconds, then a few lip trills, then a tongue twister or two — loosens up
              your voice before you hit record.
            </Text>
          </View>
          <View style={styles.tipRow}>
            <View style={[styles.tipDot, { backgroundColor: colors.textMuted }]} />
            <Text style={styles.tipText}>
              Eye contact drill: look at the camera lens center, then to one side, then the other, then back to
              center — pick one focal point and deliver your first sentence straight to it.
            </Text>
          </View>
          <View style={styles.tipRow}>
            <View style={[styles.tipDot, { backgroundColor: colors.textMuted }]} />
            <Text style={styles.tipText}>
              This app's daily random-prompt format is effectively Toastmasters' "Table Topics" exercise —
              impromptu 1-2 minute responses to an unexpected prompt. Treat every session like a Table Topics turn:
              don't overthink the opening, just start talking.
            </Text>
          </View>
        </View>
      </Card>
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  // See TrendsScreen.tsx for why paddingBottom: 0 — overrides
  // ScreenContainer's default bottom padding, since the ScrollView's own
  // scrollContent already reserves end-of-content breathing room and there's
  // no button below it that needs the extra gap.
  container: { gap: spacing.md, paddingBottom: 0 },
  header: { gap: spacing.xs, paddingBottom: spacing.xs },
  title: { color: colors.textPrimary, fontSize: typography.headline, fontWeight: "700" },
  subtitle: { color: colors.textSecondary, fontSize: typography.caption, lineHeight: 18 },
  scroll: { flex: 1 },
  scrollContent: { gap: spacing.md, paddingBottom: spacing.lg },
  section: { gap: spacing.sm },
  sectionTitle: { color: colors.textPrimary, fontSize: typography.bodyLarge, fontWeight: "700" },
  sectionDescription: { color: colors.textSecondary, fontSize: typography.caption, lineHeight: 18 },
  tipsList: { gap: spacing.sm, marginTop: spacing.xs },
  tipRow: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm },
  tipDot: { width: 6, height: 6, borderRadius: 3, marginTop: 7 },
  tipText: { flex: 1, color: colors.textSecondary, fontSize: typography.body, lineHeight: 20 },
  drillBox: { borderRadius: 10, padding: spacing.md, gap: spacing.xs, marginTop: spacing.xs },
  drillLabel: { fontSize: typography.caption - 1, fontWeight: "700", letterSpacing: 1 },
  drillText: { color: colors.textPrimary, fontSize: typography.body, lineHeight: 20 },
});
