import { StyleSheet, View } from "react-native";
import { Txt } from "../common/Txt";
import { darkColors as colors, radii, spacing } from "../../theme/theme";

// The prompt over the camera — spoken words, so in the medium weight. A
// prompt that asks for something specific ("Closing only") says so above it,
// so the task is in front of you while you speak.
export function PromptBanner({ text, task }: { text: string; task?: string | null }) {
  return (
    <View style={styles.container}>
      {task ? <Txt variant="footnote" weight="500" style={styles.task}>{task}</Txt> : null}
      <Txt variant="quote" style={styles.text} numberOfLines={4}>
        {text}
      </Txt>
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
  task: { color: colors.textSecondary, textAlign: "center", marginBottom: 4 },
  text: { color: colors.textPrimary, textAlign: "center" },
});
