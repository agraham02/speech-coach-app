import { StyleSheet, Text, View } from "react-native";
import { darkColors as colors, fontDisplay, radii, spacing } from "../../theme/theme";

// The prompt over the camera — spoken words, so in serif.
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
    backgroundColor: "rgba(10,10,8,0.6)",
    borderRadius: radii.lg,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  text: { fontFamily: fontDisplay.regular, color: colors.textPrimary, fontSize: 22, lineHeight: 27, textAlign: "center" },
});
