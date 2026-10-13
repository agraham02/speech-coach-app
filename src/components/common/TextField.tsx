import { useState } from "react";
import { Pressable, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { makeStyles, useTheme } from "../../theme/ThemeProvider";
import { Txt } from "./Txt";

interface TextFieldProps {
  label: string;
  caption?: string;
  value: string;
  onChangeText: (text: string) => void;
  // Saves on blur, on end editing and on return — blur alone isn't reliable
  // when leaving the screen.
  onCommit: () => void;
  placeholder?: string;
  // Masked with a show/hide eye (API keys).
  secret?: boolean;
  maxLength?: number;
}

// A labeled single-line field for settings: keys, model IDs.
export function TextField({ label, caption, value, onChangeText, onCommit, placeholder = "Not set", secret, maxLength = 200 }: TextFieldProps) {
  const styles = useStyles();
  const { colors } = useTheme();
  const [visible, setVisible] = useState(false);
  return (
    <View style={styles.field}>
      <Txt variant="subhead" weight="600">
        {label}
      </Txt>
      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          value={value}
          onChangeText={onChangeText}
          onBlur={onCommit}
          onEndEditing={onCommit}
          onSubmitEditing={onCommit}
          returnKeyType="done"
          placeholder={placeholder}
          placeholderTextColor={colors.textMuted}
          secureTextEntry={secret && !visible}
          maxLength={maxLength}
          autoCapitalize="none"
          autoCorrect={false}
          spellCheck={false}
          accessibilityLabel={label}
        />
        {secret ? (
          <Pressable
            onPress={() => setVisible((v) => !v)}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel={visible ? `Hide ${label}` : `Show ${label}`}
          >
            <Ionicons name={visible ? "eye-off-outline" : "eye-outline"} size={18} color={colors.textMuted} />
          </Pressable>
        ) : null}
      </View>
      {caption ? (
        <Txt variant="footnote" tone="secondary">
          {caption}
        </Txt>
      ) : null}
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  field: { gap: t.space.xs + 2 },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: t.space.sm,
    backgroundColor: t.colors.surfaceRaised,
    borderRadius: t.radius.md - 4,
    paddingHorizontal: t.space.md,
    height: 46,
  },
  input: { ...t.type.callout, flex: 1, color: t.colors.textPrimary, padding: 0 },
}));
