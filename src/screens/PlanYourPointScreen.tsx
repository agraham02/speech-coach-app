import { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../navigation";
import { ScreenContainer } from "../components/common/ScreenContainer";
import { PrimaryButton } from "../components/common/PrimaryButton";
import { colors, radii, spacing, typography } from "../theme/theme";

type Props = NativeStackScreenProps<RootStackParamList, "PlanYourPoint">;

// PREP framework: Point -> Reason -> Example -> Point. All three fields are
// optional — "Start recording" always proceeds, empty fields just mean the
// speaker chose to skip planning rather than an incomplete form.
export function PlanYourPointScreen({ route, navigation }: Props) {
  const { prompt } = route.params;
  const [point, setPoint] = useState("");
  const [reason, setReason] = useState("");
  const [example, setExample] = useState("");

  function handleStart() {
    navigation.navigate("Recording", {
      kind: "prompt",
      prompt,
      planText: { point, reason, example },
    });
  }

  return (
    <ScreenContainer style={styles.container}>
      <View style={styles.header}>
        <Pressable
          onPress={() => navigation.goBack()}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Close"
        >
          <Ionicons name="close" size={24} color={colors.textPrimary} />
        </Pressable>
        <Text style={styles.title}>Plan Your Point</Text>
        <View style={styles.headerSpacer} />
      </View>

      <Text style={styles.subtitle}>
        Quickly sketch your PREP before you record — Point, Reason, Example, Point again. Skip any of it and start
        recording whenever you're ready.
      </Text>

      <View style={styles.promptPreview}>
        <Text style={styles.promptPreviewText} numberOfLines={2}>
          {prompt.text}
        </Text>
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>Point</Text>
        <Text style={styles.hint}>The one thing you want them to remember.</Text>
        <TextInput
          style={styles.textArea}
          value={point}
          onChangeText={setPoint}
          placeholder="What's the main point?"
          placeholderTextColor={colors.textMuted}
          multiline
          textAlignVertical="top"
          accessibilityLabel="Point"
        />
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>Reason</Text>
        <Text style={styles.hint}>Why does that point matter?</Text>
        <TextInput
          style={styles.textArea}
          value={reason}
          onChangeText={setReason}
          placeholder="Why does it matter?"
          placeholderTextColor={colors.textMuted}
          multiline
          textAlignVertical="top"
          accessibilityLabel="Reason"
        />
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>Example</Text>
        <Text style={styles.hint}>A concrete example or story that backs it up.</Text>
        <TextInput
          style={styles.textArea}
          value={example}
          onChangeText={setExample}
          placeholder="What's a specific example?"
          placeholderTextColor={colors.textMuted}
          multiline
          textAlignVertical="top"
          accessibilityLabel="Example"
        />
      </View>

      <View style={styles.spacer} />
      <PrimaryButton label="Start Recording" onPress={handleStart} />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.md },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  headerSpacer: { width: 24 },
  title: { color: colors.textPrimary, fontSize: typography.title, fontWeight: "700" },
  subtitle: { color: colors.textSecondary, fontSize: typography.body, lineHeight: 20 },
  promptPreview: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    padding: spacing.md,
  },
  promptPreviewText: { color: colors.textSecondary, fontSize: typography.body, fontStyle: "italic" },
  field: { gap: spacing.xs },
  label: { color: colors.textSecondary, fontSize: typography.caption, fontWeight: "700", letterSpacing: 0.4 },
  hint: { color: colors.textMuted, fontSize: typography.caption },
  textArea: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    color: colors.textPrimary,
    fontSize: typography.body,
    minHeight: 56,
  },
  spacer: { flex: 1 },
});
