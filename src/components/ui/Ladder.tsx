import { View } from "react-native";
import { makeStyles, useTheme } from "../../theme/ThemeProvider";
import { ladderHeights, ladderLabel, ladderState, LADDER_HEIGHT } from "./displayLogic";

export interface LadderProps {
  // How many stages there are.
  count: number;
  // The 1-based stage the person is on; earlier ones are done.
  current: number;
  // Stage names, for the spoken label ("Stage 3 of 5, Steady").
  names?: readonly string[];
  // "Stage" by default; "Level" where the app says levels.
  noun?: string;
  accessibilityLabel?: string;
  testID?: string;
}

// Rising bars for stages or levels: done in full ink, the current one in ink
// with a 2dp ring set off by a 2dp gap, the rest a light neutral. Heights
// rise evenly, so shape (not just tone) says where you are.
export function Ladder({ count, current, names, noun, accessibilityLabel, testID }: LadderProps) {
  const styles = useStyles();
  const { colors } = useTheme();
  const heights = ladderHeights(count);
  return (
    <View style={styles.row} accessible accessibilityLabel={accessibilityLabel ?? ladderLabel(current, count, names, noun)} testID={testID}>
      {heights.map((h, i) => {
        const state = ladderState(i, current);
        return (
          <View key={i} style={[styles.slot, { height: h }]}>
            <View style={[styles.bar, { backgroundColor: state === "todo" ? colors.accentMuted : colors.textPrimary }]} />
            {state === "current" ? <View style={[styles.ring, { borderColor: colors.textPrimary }]} /> : null}
          </View>
        );
      })}
    </View>
  );
}

const useStyles = makeStyles(() => ({
  // Room above the tallest bar for the ring, which sits outside its bar.
  row: { flexDirection: "row", alignItems: "flex-end", gap: 5, height: LADDER_HEIGHT + 4, paddingTop: 4 },
  slot: { flex: 1 },
  bar: { flex: 1, borderRadius: 4 },
  // Box-shadow: 0 0 0 2px bg, 0 0 0 4px ink. The page shows through the gap.
  ring: { position: "absolute", top: -4, left: -4, right: -4, bottom: -4, borderWidth: 2, borderRadius: 8 },
}));
