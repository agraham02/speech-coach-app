import { useCallback, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../navigation";
import { Screen } from "../components/common/Screen";
import { Card } from "../components/common/Card";
import { HeroCard } from "../components/common/HeroCard";
import { ProgressRing } from "../components/common/ProgressRing";
import { SectionHeader } from "../components/common/SectionHeader";
import { SkeletonRows } from "../components/common/Skeleton";
import { Txt } from "../components/common/Txt";
import { getSkillEvents, getSkillStates, type SkillEvent, type SkillState } from "../services/db/progressRepo";
import { HOW_RATINGS_WORK, SKILL_GUIDE } from "../content/skillGuide";
import { SKILL_LABELS } from "../theme/tokens";
import { makeStyles, useTheme } from "../theme/ThemeProvider";

type Props = NativeStackScreenProps<RootStackParamList, "SkillDetail">;

const pct = (x: number) => `${Math.round(x * 100)}%`;
const signed = (n: number) => (n > 0 ? `+${n}` : `${n}`);

function when(iso: string): string {
  const d = new Date(iso);
  const days = Math.floor((Date.now() - d.getTime()) / 86_400_000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

// One skill's rating, opened from the skill rings: what the number means,
// what feeds it, what raises and lowers it, and every recent change with
// its cause — how you did against what the rating predicted.
export function SkillDetailScreen({ route, navigation }: Props) {
  const { skill } = route.params;
  const styles = useStyles();
  const { colors } = useTheme();
  const c = colors.skill[skill];
  const guide = SKILL_GUIDE[skill];
  const [state, setState] = useState<SkillState | null>(null);
  const [events, setEvents] = useState<SkillEvent[] | null>(null);

  useFocusEffect(
    useCallback(() => {
      getSkillStates().then((s) => setState(s[skill]));
      getSkillEvents(skill).then(setEvents);
    }, [skill]),
  );

  const rating = state ? Math.round(state.rating) : null;

  return (
    <Screen title={SKILL_LABELS[skill]} eyebrow="Skill" onBack={() => navigation.goBack()}>
      <HeroCard accent={c.fg} contentStyle={styles.hero}>
        <ProgressRing size={128} strokeWidth={8} progress={(rating ?? 0) / 100} color={c.fg} trackColor={c.bg}>
          <Txt variant="display" tabular style={styles.heroNumber}>
            {rating ?? "–"}
          </Txt>
          <Txt variant="caption1" tone="muted">
            out of 100
          </Txt>
        </ProgressRing>
        <Txt variant="callout" tone="secondary" align="center">
          {guide.what}
        </Txt>
        {state && state.attempts > 0 ? (
          <Txt variant="footnote" tone="muted" align="center">
            {state.attempts} scored {state.attempts === 1 ? "attempt" : "attempts"} so far
          </Txt>
        ) : null}
      </HeroCard>

      <View style={styles.section}>
        <SectionHeader title="How this number works" />
        <Card>
          <Txt variant="subhead" tone="secondary">
            {HOW_RATINGS_WORK}
          </Txt>
        </Card>
      </View>

      <View style={styles.section}>
        <SectionHeader title="What feeds it" />
        <Card style={styles.list}>
          {guide.feeds.map((f) => (
            <Bullet key={f} icon="ellipse" color={c.fg} text={f} small />
          ))}
        </Card>
      </View>

      <View style={styles.section}>
        <SectionHeader title="What moves it" />
        <Card style={styles.list}>
          <Txt variant="caption1" weight="600" tone="success">
            Raises it
          </Txt>
          {guide.raises.map((r) => (
            <Bullet key={r} icon="arrow-up-circle" color={colors.success} text={r} />
          ))}
          <Txt variant="caption1" weight="600" tone="warning" style={styles.gapTop}>
            Lowers it
          </Txt>
          {guide.lowers.map((l) => (
            <Bullet key={l} icon="arrow-down-circle" color={colors.warning} text={l} />
          ))}
        </Card>
      </View>

      <View style={styles.section}>
        <SectionHeader title="Recent changes" subtitle="Each one: how you did, against what your rating predicted." />
        {events == null ? (
          <SkeletonRows count={3} />
        ) : events.length === 0 ? (
          <Card>
            <Txt variant="subhead" tone="secondary">
              {state && state.attempts > 0
                ? "Changes are listed from this update on. Your next scored drill or take will show here, with what moved it."
                : "Nothing yet. Your first scored drill or take will show here, with what moved it."}
            </Txt>
          </Card>
        ) : (
          <Card style={styles.events}>
            {events.map((e, i) => (
              <EventRow
                key={e.id}
                event={e}
                last={i === events.length - 1}
                onOpen={e.sessionId ? () => navigation.navigate("Result", { sessionId: e.sessionId! }) : undefined}
              />
            ))}
          </Card>
        )}
      </View>
    </Screen>
  );
}

function Bullet({ icon, color, text, small }: { icon: keyof typeof Ionicons.glyphMap; color: string; text: string; small?: boolean }) {
  const styles = useStyles();
  return (
    <View style={styles.bullet}>
      <Ionicons name={icon} size={small ? 8 : 18} color={color} style={small ? styles.dot : undefined} />
      <Txt variant="subhead" style={styles.flex}>
        {text}
      </Txt>
    </View>
  );
}

function EventRow({ event: e, last, onOpen }: { event: SkillEvent; last: boolean; onOpen?: () => void }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const delta = Math.round((e.ratingAfter - e.ratingBefore) * 10) / 10;
  const why =
    e.source === "seed"
      ? `Your starting point: ${Math.round(e.ratingAfter)}.`
      : e.score != null && e.expected != null
        ? `Scored ${pct(e.score)} where ${pct(e.expected)} was expected${e.level != null ? ` at level ${e.level.toFixed(1)}` : ""} — ${e.score > e.expected ? "better than predicted" : e.score < e.expected ? "below what was predicted" : "right on it"}.`
        : null;
  const sources =
    e.detail && (e.detail.local != null || e.detail.cloud != null)
      ? [e.detail.local != null ? `phone ${pct(e.detail.local)}` : null, e.detail.cloud != null ? `AI coach ${pct(e.detail.cloud)}` : null].filter(Boolean).join(" · ")
      : null;
  return (
    <Pressable onPress={onOpen} disabled={!onOpen} style={[styles.event, !last && styles.eventRule]} accessibilityRole={onOpen ? "button" : undefined}>
      <View style={styles.flex}>
        <Txt variant="subhead" weight="600" numberOfLines={1}>
          {e.label}
        </Txt>
        {why ? (
          <Txt variant="footnote" tone="secondary">
            {why}
          </Txt>
        ) : null}
        {sources ? (
          <Txt variant="caption1" tone="muted">
            From {sources}
          </Txt>
        ) : null}
        <Txt variant="caption1" tone="muted">
          {when(e.at)}
        </Txt>
      </View>
      <View style={styles.eventRight}>
        <Txt variant="headline" tabular color={delta > 0 ? colors.success : delta < 0 ? colors.warning : colors.textMuted}>
          {e.source === "seed" ? "Start" : signed(delta)}
        </Txt>
        {onOpen ? <Ionicons name="chevron-forward" size={16} color={colors.textMuted} /> : null}
      </View>
    </Pressable>
  );
}

const useStyles = makeStyles((t) => ({
  hero: { alignItems: "center", gap: t.space.md, paddingVertical: t.space.xl },
  heroNumber: { fontSize: 44, lineHeight: 50, letterSpacing: -1.6 },
  section: { gap: t.space.sm + 4 },
  list: { gap: t.space.sm + 2 },
  bullet: { flexDirection: "row", gap: t.space.sm + 2, alignItems: "flex-start" },
  dot: { marginTop: 7 },
  gapTop: { marginTop: t.space.sm },
  flex: { flex: 1 },
  events: { paddingVertical: t.space.xs },
  event: { flexDirection: "row", gap: t.space.md, paddingVertical: t.space.md - 2, alignItems: "center" },
  eventRule: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: t.colors.separator },
  eventRight: { flexDirection: "row", alignItems: "center", gap: 4 },
}));
