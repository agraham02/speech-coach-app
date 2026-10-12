import { StyleSheet, Text, View } from "react-native";
import { darkColors as colors, radii, spacing, typography, font } from "../../theme/theme";

export function PromptBanner({ text }: { text: string }) {
  return (
    <View style={styles.container}>
      <Text style={styles.text} numberOfLines={3}>
        {text}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: "rgba(0,0,0,0.55)",
    borderRadius: radii.md,
    padding: spacing.md,
  },
  text: { ...font("400"), color: colors.textPrimary, fontSize: typography.body, lineHeight: 20, textAlign: "center" },
});
