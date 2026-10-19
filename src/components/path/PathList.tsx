import { useState } from "react";
import { View } from "react-native";
import { Card } from "../common/Card";
import { HeroCard } from "../common/HeroCard";
import { SectionHeader } from "../common/SectionHeader";
import { StepTimeline, type TimelineStep } from "../common/StepTimeline";
import { PrimaryButton } from "../common/PrimaryButton";
import { TourTarget } from "../common/GuideTip";
import { SkeletonCard } from "../common/Skeleton";
import { Txt } from "../common/Txt";
import { DeltaBar } from "../celebrate/DeltaBar";
import type { PathView } from "../../services/path/pathService";
import { SKILL_LABELS } from "../../theme/tokens";
import { makeStyles, useTheme } from "../../theme/ThemeProvider";

type PathUnitView = PathView["units"][number];

const UP_NEXT_SHOWN = 6;

// Learn's "Your path": every unit in your order — what's on the go now,
// what's next and why, what's done, and what the skill check showed you
// already have. Tapping a unit opens its next lesson.
export function PathList({ view, onOpenUnit }: { view: PathView | null; onOpenUnit: (unit: PathUnitView) => void }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const [showAll, setShowAll] = useState(false);
  if (!view) return <SkeletonCard lines={5} />;

  const active = view.units.filter((u) => u.status === "active");
  const upcoming = view.units.filter((u) => u.status === "upcoming");
  const done = view.units.filter((u) => u.status === "done");
  const shown = view.units.filter((u) => u.status === "tested_out");
  const total = done.length + active.length + upcoming.length;
  // What the order was built from, in your words.
  const builtFrom = [...new Set(view.units.flatMap((u) => u.reasons).filter((r) => r.kind === "obstacle" || r.kind === "event" || r.kind === "skill_check").map((r) => r.text))].slice(0, 3);

  const step = (u: PathUnitView, state: TimelineStep["state"], showReason = true): TimelineStep => ({
    id: u.unitId,
    title: u.title,
    subtitle: [u.status === "active" || u.done > 0 ? `${u.done} of ${u.total} lessons` : null, showReason ? u.reasons[0]?.text : null].filter(Boolean).join(" · ") || undefined,
    meta: SKILL_LABELS[u.skill],
    metaColor: colors.skill[u.skill].fg,
    color: colors.skill[u.skill].fg,
    state,
    onPress: () => onOpenUnit(u),
  });

  return (
    <View style={styles.body}>
      <HeroCard contentStyle={styles.hero}>
        <Txt variant="footnote" weight="500" tone="secondary">
          Your path
        </Txt>
        <Txt variant="title1">
          {done.length === total ? "All done" : `Unit ${done.length + 1} of ${total}`}
        </Txt>
        <DeltaBar value={total ? done.length / total : 0} color={colors.textPrimary} growIn />
        <Txt variant="footnote" tone="secondary">
          {builtFrom.length ? `Ordered for you: ${builtFrom.map((t) => t.charAt(0).toLowerCase() + t.slice(1)).join("; ")}.` : "Foundations first, skills taking turns. Tell us what gets in your way and it orders itself around that."}
        </Txt>
      </HeroCard>

      {active.length ? (
        <TourTarget id="learn.path" style={styles.section}>
          <SectionHeader title="Now" subtitle="Two at a time, from different skills. Your days take turns between them." />
          <Card style={styles.path}>
            <StepTimeline steps={active.map((u) => step(u, "current"))} />
          </Card>
        </TourTarget>
      ) : null}

      {upcoming.length ? (
        <View style={styles.section}>
          <SectionHeader title="Up next" />
          <Card style={styles.path}>
            <StepTimeline steps={(showAll ? upcoming : upcoming.slice(0, UP_NEXT_SHOWN)).map((u) => step(u, "todo"))} />
            {upcoming.length > UP_NEXT_SHOWN ? (
              <PrimaryButton
                label={showAll ? "Show fewer" : `Show all ${upcoming.length}`}
                variant="ghost"
                size="sm"
                onPress={() => setShowAll((v) => !v)}
              />
            ) : null}
          </Card>
        </View>
      ) : null}

      {done.length ? (
        <View style={styles.section}>
          <SectionHeader title="Done" subtitle="Their lessons come back for review on a schedule." />
          <Card style={styles.path}>
            <StepTimeline steps={done.map((u) => step(u, "done", false))} />
          </Card>
        </View>
      ) : null}

      {shown.length ? (
        <View style={styles.section}>
          <SectionHeader title="You showed these already" subtitle="Your skill check covered them, so the path skips ahead. They're still open." />
          <Card style={styles.path}>
            <StepTimeline steps={shown.map((u) => step(u, "todo", false))} />
          </Card>
        </View>
      ) : null}
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  body: { gap: t.space.lg },
  hero: { gap: t.space.sm },
  section: { gap: t.space.sm + 4 },
  path: { paddingBottom: t.space.sm + 4 },
}));
