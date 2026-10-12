import { TextInput, View } from "react-native";
import { makeStyles, useTheme } from "../../theme/ThemeProvider";
import { Txt } from "../common/Txt";

// A labeled, themed text field for the Prime and Debrief forms.
export function Field({
  label,
  value,
  onChangeText,
  placeholder,
  multiline,
  maxLength = 280,
}: {
  label?: string;
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  multiline?: boolean;
  maxLength?: number;
}) {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <View style={styles.wrap}>
      {label ? (
        <Txt variant="subhead" weight="600">
          {label}
        </Txt>
      ) : null}
      <TextInput
        style={[styles.input, multiline && styles.multiline]}
        value={value}
        onChangeText={(t) => onChangeText(t.slice(0, maxLength))}
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
        multiline={multiline}
        textAlignVertical={multiline ? "top" : "center"}
        accessibilityLabel={label ?? placeholder}
      />
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  wrap: { gap: t.space.xs },
  input: {
    backgroundColor: t.colors.surfaceRaised,
    borderRadius: t.radius.md,
    paddingHorizontal: t.space.md,
    paddingVertical: t.space.sm + 2,
    minHeight: 44,
    color: t.colors.textPrimary,
    ...t.type.callout,
  },
  multiline: { minHeight: 72 },
}));
