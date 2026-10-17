import { View } from "react-native";
import { IconButton } from "../common/IconButton";
import { Txt } from "../common/Txt";
import { Mono } from "./Mono";
import { makeStyles } from "../../theme/ThemeProvider";

interface StepperProps {
  label: string;
  hint?: string;
  valueText: string;
  // The value differs from the default: show it as changed.
  changed?: boolean;
  onMinus: () => void;
  onPlus: () => void;
}

// A value with minus and plus buttons: precise and quick to nudge on a phone.
export function Stepper({ label, hint, valueText, changed, onMinus, onPlus }: StepperProps) {
  const styles = useStyles();
  return (
    <View style={styles.row}>
      <View style={styles.text}>
        <Txt variant="headline">{label}</Txt>
        {hint ? (
          <Txt variant="caption1" tone="secondary">
            {hint}
          </Txt>
        ) : null}
      </View>
      <IconButton icon="remove" size={36} accessibilityLabel={"Decrease " + label} onPress={onMinus} />
      <Mono variant="subhead" tone={changed ? "accent" : "primary"} style={styles.value}>
        {valueText}
      </Mono>
      <IconButton icon="add" size={36} accessibilityLabel={"Increase " + label} onPress={onPlus} />
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  row: { flexDirection: "row", alignItems: "center", gap: t.space.sm, paddingVertical: t.space.sm, minHeight: 56 },
  text: { flex: 1, gap: 1 },
  value: { width: 54, textAlign: "center" },
}));
