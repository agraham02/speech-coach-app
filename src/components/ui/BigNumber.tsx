import type { StyleProp, TextStyle } from "react-native";
import { Txt } from "../common/Txt";
import { bigNumberLabel, bigNumberStyle, bigNumberUnitText } from "./displayLogic";

export interface BigNumberProps {
  value: string | number;
  // A small suffix after the number: "min", "wpm", "%", "/100".
  unit?: string;
  // Font size of the numeral (default 52; 76 for a hero). Line height and
  // tracking scale with it.
  size?: number;
  style?: StyleProp<TextStyle>;
  accessibilityLabel?: string;
  testID?: string;
}

// The big light numeral: tabular, never bold, with an optional quiet unit that
// shares its baseline.
export function BigNumber({ value, unit, size, style, accessibilityLabel, testID }: BigNumberProps) {
  return (
    <Txt
      variant="display"
      tabular
      style={[bigNumberStyle(size), style]}
      accessibilityLabel={accessibilityLabel ?? bigNumberLabel(value, unit)}
      testID={testID}
    >
      {String(value)}
      {unit ? (
        <Txt variant="subhead" tone="secondary" style={{ letterSpacing: 0 }}>
          {bigNumberUnitText(unit)}
        </Txt>
      ) : null}
    </Txt>
  );
}
