import { View } from "react-native";
import { Card } from "../common/Card";
import { Txt } from "../common/Txt";
import { MARK_MEANINGS } from "../../content/markGuide";
import type { MarkKind } from "../../domain/cadence/marks";
import { makeStyles, useTheme } from "../../theme/ThemeProvider";
import { font } from "../../theme/tokens";

const SAMPLE: Partial<Record<MarkKind, string>> = { emphasis: "word", rise: "↗", fall: "↘", pause: "|", long_pause: "‖" };

// A lesson's heads-up before it hands you marked lines: the few marks
// you'll meet, each drawn the way the reader draws it, with what to do.
export function MarkKey({ kinds = ["emphasis", "rise", "fall", "pause"] }: { kinds?: MarkKind[] }) {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <Card style={styles.card}>
      <Txt variant="headline">How to read the marks</Txt>
      {kinds.map((k) => {
        const m = MARK_MEANINGS[k];
        if (!m) return null;
        return (
          <View key={k} style={styles.row}>
            <View style={styles.sample}>
              <Txt variant="callout" style={k === "emphasis" ? styles.stress : { color: colors.skill.cadence.fg, ...font("700") }}>
                {SAMPLE[k] ?? ""}
              </Txt>
            </View>
            <View style={styles.flex}>
              <Txt variant="subhead" weight="600">
                {m.label}
              </Txt>
              <Txt variant="footnote" tone="secondary">
                {m.meaning}
              </Txt>
            </View>
          </View>
        );
      })}
    </Card>
  );
}

const useStyles = makeStyles((t) => ({
  card: { gap: t.space.md },
  row: { flexDirection: "row", gap: t.space.md, alignItems: "flex-start" },
  sample: { width: 44, height: 32, borderRadius: t.radius.sm, alignItems: "center", justifyContent: "center", backgroundColor: t.colors.surfaceRaised },
  stress: { ...font("800"), textDecorationLine: "underline", color: t.colors.textPrimary },
  flex: { flex: 1 },
}));
