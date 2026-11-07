import { View } from "react-native";
import Animated from "react-native-reanimated";
import { Card } from "../common/Card";
import { Txt } from "../common/Txt";
import { DeltaBar } from "./DeltaBar";
import { NOT_COUNTED } from "./trailToast";
import type { ProgressChange } from "../../services/db/progressRepo";
import { formatDelta, trailLine } from "../../domain/scoring/rollup";
import { nextStageHint, stageName, stageProgress, type Stage } from "../../domain/levels";
import { SKILL_LABELS } from "../../theme/tokens";
import { enter } from "../../theme/motion";
import { makeStyles, useTheme } from "../../theme/ThemeProvider";

// Under a drill's result: the trail, from the leaf it moved up to Overall (plan
// 6.3), its pillar within the stage's bar, and a step up in difficulty when one
// came. A stage earned gets the full celebration on top (CelebrationHost).
export function DrillProgressLine({ change, attempts, drillTitle }: { change: ProgressChange; attempts?: number; drillTitle: string }) {
  const styles = useStyles();
  const { colors } = useTheme();
  if (!change.trail) {
    return (
      <Animated.View entering={enter(2)}>
        <Card style={styles.card}>
          <Txt variant="footnote" tone="secondary">
            {NOT_COUNTED}
          </Txt>
        </Card>
      </Animated.View>
    );
  }
  const c = colors.skill[change.skill];
  const stage = (change.stageAfter ?? 1) as Stage;
  const crossed = !!change.stagedUp;
  const delta = change.ratingAfter - change.ratingBefore;
  const up = delta > 0;
  return (
    <Animated.View entering={enter(2)}>
      <Card style={styles.card}>
        <View style={styles.top}>
          <View style={styles.name}>
            <View style={[styles.dot, { backgroundColor: c.fg }]} />
            <Txt variant="subhead" weight="600">
              {SKILL_LABELS[change.skill]}
            </Txt>
            <Txt variant="caption1" tone="muted">
              {stageName(stage)}
            </Txt>
          </View>
          <Txt variant="subhead" weight="600" tabular color={up ? colors.success : colors.textMuted}>
            {formatDelta({ delta, level: "pillar" })}
          </Txt>
        </View>
        <DeltaBar value={stageProgress(change.ratingAfter, stage)} from={crossed ? 0 : stageProgress(change.ratingBefore, stage)} color={c.fg} trackColor={c.bg} delay={350} />
        <Txt variant="footnote" weight="500" accessibilityLabel={`What moved: ${trailLine(change.trail)}`}>
          {trailLine(change.trail)}
        </Txt>
        <Txt variant="footnote" tone="secondary">
          {change.leveledUp
            ? `Step up: ${drillTitle.toLowerCase()} gets a little harder now.`
            : attempts != null
              ? nextStageHint(change.ratingAfter, attempts, stage)
              : delta >= 0
                ? "Counted toward your stage."
                : "One attempt is noise. It's the trend that counts."}
        </Txt>
      </Card>
    </Animated.View>
  );
}

const useStyles = makeStyles((t) => ({
  card: { gap: t.space.sm },
  top: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: t.space.sm },
  name: { flexDirection: "row", alignItems: "center", gap: t.space.sm - 2, flexShrink: 1 },
  dot: { width: 8, height: 8, borderRadius: 4 },
}));
