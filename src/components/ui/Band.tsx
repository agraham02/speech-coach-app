import type { ReactNode } from "react";
import { View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { makeStyles, useTheme } from "../../theme/ThemeProvider";
import { PressableScale } from "../common/PressableScale";
import { Txt } from "../common/Txt";
import { Chevron } from "./Chevron";
import { bandBox, bandLabel, bandPosition, bandTint, type BandPosition, type BandState } from "./displayLogic";

export interface BandProps {
  // The step number or marker ("1", "2"); a done band shows a check instead.
  number?: string | number;
  title?: string;
  subtitle?: string;
  // Right-aligned meta, such as "2 min".
  meta?: string;
  state?: BandState;
  // Makes the band a button and shows a chevron. Without it the band is plain
  // information: no chevron, no press feedback, no button role.
  onPress?: () => void;
  // Arbitrary content (a "big" band). Without a title, it is all the band holds.
  children?: ReactNode;
  // Overrides the tint cycled in by BandStack.
  tint?: string;
  // Set by BandStack; a lone Band is "only".
  position?: BandPosition;
  // Position in the stack, used for the tint when `tint` is not given.
  index?: number;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  testID?: string;
}

// One tinted block, like an index card. Stack several with BandStack so they
// overlap and tint in order.
export function Band({ number, title, subtitle, meta, state = "default", onPress, children, tint, position = "only", index = 0, accessibilityLabel, accessibilityHint, testID }: BandProps) {
  const styles = useStyles();
  const { colors } = useTheme();
  const big = children !== undefined && children !== null;
  const done = state === "done";
  const locked = state === "locked";
  const box = bandBox(position, state, big);
  const boxStyle = [styles.band, box, { backgroundColor: bandTint(index, colors.bands, tint) }];

  const header = title !== undefined || number !== undefined || meta !== undefined ? (
    <View style={styles.grid}>
      <View style={styles.numberCol}>
        {done ? (
          <Ionicons name="checkmark" size={16} color={colors.textPrimary} style={styles.check} />
        ) : number !== undefined ? (
          <Txt variant="footnote" weight="600" tone={locked ? "muted" : "secondary"} tabular style={styles.number}>
            {number}
          </Txt>
        ) : null}
      </View>
      <View style={styles.nameCol}>
        {title ? (
          done ? (
            <Txt variant="callout" weight="500" tone="secondary" numberOfLines={2}>
              {title}
            </Txt>
          ) : (
            <Txt variant="headline" tone={locked ? "muted" : "primary"} style={styles.name} numberOfLines={2}>
              {title}
            </Txt>
          )
        ) : null}
        {subtitle ? (
          <Txt variant="footnote" tone={locked ? "muted" : "secondary"} numberOfLines={2}>
            {subtitle}
          </Txt>
        ) : null}
      </View>
      {meta || onPress ? (
        <View style={styles.metaCol}>
          {meta ? (
            <Txt variant="footnote" tone={locked ? "muted" : "secondary"} tabular>
              {meta}
            </Txt>
          ) : null}
          {onPress ? <Chevron color={colors.textMuted} /> : null}
        </View>
      ) : null}
    </View>
  ) : null;

  const content = (
    <>
      {header}
      {big ? <View style={[styles.children, header ? styles.childrenAfterHeader : null]}>{children}</View> : null}
    </>
  );

  const label = accessibilityLabel ?? bandLabel({ number, title, subtitle, meta, state });

  if (onPress) {
    return (
      <PressableScale
        onPress={onPress}
        scaleTo={0.99}
        haptic="tick"
        accessibilityRole="button"
        accessibilityLabel={label || undefined}
        accessibilityHint={accessibilityHint}
        style={boxStyle}
        testID={testID}
      >
        {content}
      </PressableScale>
    );
  }
  // Plain information: one element for a screen reader unless it holds its own
  // controls.
  return (
    <View style={boxStyle} accessible={!big} accessibilityLabel={!big && label ? label : undefined} testID={testID}>
      {content}
    </View>
  );
}

// Stacked bands: each tucks 14 under the one above, tints cycle through the
// palette's five, the first is square-bottomed at the top and the last is
// fully rounded.
export function BandStack({ bands }: { bands: (BandProps & { id: string })[] }) {
  return (
    <View>
      {bands.map(({ id, ...band }, i) => (
        <Band key={id} {...band} index={band.index ?? i} position={band.position ?? bandPosition(i, bands.length)} />
      ))}
    </View>
  );
}

const useStyles = makeStyles(() => ({
  band: { paddingHorizontal: 18 },
  grid: { flexDirection: "row", alignItems: "flex-start", columnGap: 8 },
  numberCol: { width: 30 },
  number: { paddingTop: 2 },
  check: { marginTop: 3 },
  nameCol: { flex: 1, gap: 1 },
  // 17/22, a step above the headline's 16.
  name: { fontSize: 17 },
  metaCol: { flexDirection: "row", alignItems: "center", columnGap: 8, paddingTop: 2 },
  children: { gap: 12 },
  childrenAfterHeader: { marginTop: 12 },
}));
