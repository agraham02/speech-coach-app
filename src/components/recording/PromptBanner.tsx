import { StyleSheet, Text, View } from "react-native";
import { darkColors as colors, fontDisplay, radii, spacing } from "../../theme/theme";

// The prompt over the camera — spoken words, so in the medium weight.
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
  text: { fontFamily: fontDisplay.spoken, color: colors.textPrimary, fontSize: 19, lineHeight: 26, letterSpacing: -0.2, textAlign: "center" },
});
