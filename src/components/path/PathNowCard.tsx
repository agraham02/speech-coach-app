import { View } from "react-native";
import { Card } from "../common/Card";
import { SectionHeader } from "../common/SectionHeader";
import { PressableScale } from "../common/PressableScale";
import { Txt } from "../common/Txt";
import { DeltaBar } from "../celebrate/DeltaBar";
import { PrimaryButton } from "../common/PrimaryButton";
import { isPathComplete } from "../../domain/pathFinale";
import type { PathView } from "../../services/path/pathService";
import { SKILL_LABELS } from "../../theme/tokens";
import { makeStyles, useTheme } from "../../theme/ThemeProvider";

type PathUnitView = PathView["units"][number];

// "This week": the two units your path has on the go, how far through each
// you are, and why each one is there for you.
export function PathNowCard({
  view,
  onOpenUnit,
  onOpenPath,
  onOpenFinale,
}: {
  view: PathView;
  onOpenUnit: (unit: PathUnitView) => void;
  onOpenPath: () => void;
  onOpenFinale: () => void;
}) {
  const styles = useStyles();
  const active = view.units.filter((u) => u.status === "active");
  const upcoming = view.units.filter((u) => u.status === "upcoming");
  const done = view.units.filter((u) => u.status === "done").length;
  const total = view.units.filter((u) => u.status !== "tested_out").length;
  // Finished: say so, and what the days are for now, rather than vanish.
  if (active.length === 0 && isPathComplete(view.units)) {
    return (
      <View style={styles.section}>
        <SectionHeader title="Your path" subtitle={`All ${done} units done`} action="See it" onAction={onOpenPath} />
        <Card style={styles.card}>
          <Txt variant="headline">Every lesson, done</Txt>
          <Txt variant="footnote" tone="secondary">
            Your daily sessions now keep it fresh: each lesson comes back for a short review as it starts to fade.
          </Txt>
          <PrimaryButton label="Open the finale" variant="ghost" size="sm" onPress={onOpenFinale} style={styles.finale} />
        </Card>
      </View>
    );
  }
  if (active.length === 0) return null;
  return (
    <View style={styles.section}>
      <SectionHeader title="This week" subtitle={`Unit ${done + 1} of ${total} on your path`} action="Your path" onAction={onOpenPath} />
      <Card style={styles.card}>
        {active.map((unit, i) => (
          <UnitRow key={unit.unitId} unit={unit} last={i === active.length - 1} onPress={() => onOpenUnit(unit)} />
        ))}
        {upcoming[0] ? (
          <Txt variant="footnote" tone="muted">
            Then: {upcoming[0].title}
          </Txt>
        ) : null}
      </Card>
    </View>
  );
}

function UnitRow({ unit, last, onPress }: { unit: PathUnitView; last: boolean; onPress: () => void }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const c = colors.skill[unit.skill];
  const reason = unit.reasons[0]?.text;
  return (
    <PressableScale
      onPress={onPress}
      style={[styles.row, !last && styles.rowGap]}
      accessibilityRole="button"
      accessibilityLabel={`${unit.title}, ${SKILL_LABELS[unit.skill]}, ${unit.done} of ${unit.total} lessons${reason ? `. ${reason}` : ""}`}
    >
      <View style={styles.top}>
        <View style={styles.name}>
          <View style={[styles.dot, { backgroundColor: c.fg }]} />
          <Txt variant="headline" numberOfLines={1} style={styles.flex}>
            {unit.title}
          </Txt>
        </View>
        <Txt variant="footnote" tone="secondary" tabular>
          {unit.done} of {unit.total}
        </Txt>
      </View>
      <DeltaBar value={unit.total ? unit.done / unit.total : 0} color={c.fg} trackColor={c.bg} height={6} growIn />
      {reason ? (
        <Txt variant="footnote" tone="secondary">
          {reason}
        </Txt>
      ) : null}
    </PressableScale>
  );
}

const useStyles = makeStyles((t) => ({
  section: { gap: t.space.sm + 4 },
  card: { gap: t.space.md },
  row: { gap: t.space.sm },
  rowGap: { paddingBottom: t.space.xs },
  top: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: t.space.sm },
  name: { flexDirection: "row", alignItems: "center", gap: t.space.sm, flex: 1 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  flex: { flex: 1 },
  finale: { alignSelf: "flex-start", marginLeft: -t.space.sm },
}));
