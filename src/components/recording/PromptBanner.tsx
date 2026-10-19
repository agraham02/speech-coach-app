import { StyleSheet, Text, View } from "react-native";
import { darkColors as colors, fontDisplay, radii, spacing } from "../../theme/theme";

// The prompt over the camera — spoken words, so in the medium weight. A
// prompt that asks for something specific ("Closing only") says so above it,
// so the task is in front of you while you speak.
export function PromptBanner({ text, task }: { text: string; task?: string | null }) {
  return (
    <View style={styles.container}>
      {task ? <Text style={styles.task}>{task}</Text> : null}
      <Text style={styles.text} numberOfLines={4}>
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
  task: { fontFamily: fontDisplay.spoken, color: colors.textSecondary, fontSize: 13, lineHeight: 18, textAlign: "center", marginBottom: 4 },
  text: { fontFamily: fontDisplay.spoken, color: colors.textPrimary, fontSize: 19, lineHeight: 26, letterSpacing: -0.2, textAlign: "center" },
});
