import { View } from "react-native";
import type { Provenance } from "../../domain/analysis/types";
import { producerName } from "../../domain/analysis/provenance";
import type { BridgeStep, JudgedLink } from "../../domain/drills/chainJudging";
import { ListGroup, ListRow } from "../common/ListRow";
import { Txt } from "../common/Txt";
import { makeStyles, useTheme } from "../../theme/ThemeProvider";

// Word Chain and Bridge Chain, link by link: which worked, which didn't, and
// why, as Tono AI judged them (the phone checked the answer against what was
// said). Shown only when a judge actually ran.

export function ChainVerdicts({ links, steps, checkedBy }: { links?: JudgedLink[]; steps?: BridgeStep[]; checkedBy: Provenance | null }) {
  const styles = useStyles();
  const { colors } = useTheme();
  if (!links?.length && !steps?.length) return null;
  const tone = {
    good: { icon: "checkmark-circle" as const, color: colors.success },
    half: { icon: "remove-circle" as const, color: colors.warning },
    bad: { icon: "close-circle" as const, color: colors.danger },
  };
  return (
    <View style={styles.wrap}>
      <ListGroup title={links ? "Link by link" : "Step by step"}>
        {links
          ? links.map((l) => {
              const t = tone[l.verdict === "strong" ? "good" : l.verdict === "loose" ? "half" : "bad"];
              return <ListRow key={l.n} icon={t.icon} iconColor={t.color} title={`${l.from} → ${l.to}`} subtitle={l.reason || (l.verdict === "none" ? "No clear connection" : undefined)} value={l.verdict === "loose" ? "a stretch" : undefined} />;
            })
          : steps!.map((s) => {
              const t = tone[s.verdict === "explained" ? "good" : s.verdict === "thin" ? "half" : "bad"];
              const subtitle = [s.reason ? `“${s.reason}”` : "", s.note].filter(Boolean).join(" · ");
              return <ListRow key={s.n} icon={t.icon} iconColor={t.color} title={s.word} subtitle={subtitle || undefined} value={s.verdict === "thin" ? "vague" : s.verdict === "unexplained" ? "no reason" : undefined} />;
            })}
      </ListGroup>
      <Txt variant="caption1" tone="muted">
        {`Checked by ${producerName(checkedBy)} from the words you said. The words come from your phone's speech recognition, so a misheard word can look like a link that doesn't work.`}
      </Txt>
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  wrap: { gap: t.space.sm },
}));
