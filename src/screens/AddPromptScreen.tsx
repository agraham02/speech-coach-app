import { useCallback, useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../navigation";
import { ScreenContainer } from "../components/common/ScreenContainer";
import { PrimaryButton } from "../components/common/PrimaryButton";
import { SegmentedControl } from "../components/common/SegmentedControl";
import { useToast } from "../components/common/ToastProvider";
import { getAllPrompts, insertUserPrompt } from "../services/db/promptsRepo";
import type { DifficultyTier } from "../domain/sessionTypes";
import { radii, spacing, typography } from "../theme/theme";
import { makeStyles, useTheme } from "../theme/ThemeProvider";

type Props = NativeStackScreenProps<RootStackParamList, "AddPrompt">;

const DIFFICULTY_OPTIONS: { key: DifficultyTier; label: string }[] = [
  { key: "easy", label: "Easy" },
  { key: "medium", label: "Medium" },
  { key: "hard", label: "Hard" },
];

const TEXT_MAX_LENGTH = 280;

export function AddPromptScreen({ navigation }: Props) {
  const styles = useStyles();
  const { colors } = useTheme();
  const showToast = useToast();
  const [text, setText] = useState("");
  const [category, setCategory] = useState("");
  const [difficultyTier, setDifficultyTier] = useState<DifficultyTier>("medium");
  const [existingCategories, setExistingCategories] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  useFocusEffect(
    useCallback(() => {
      getAllPrompts().then((prompts) => {
        setExistingCategories([...new Set(prompts.map((p) => p.category))]);
      });
    }, []),
  );

  const trimmedText = text.trim();
  const trimmedCategory = category.trim();
  const canSave = trimmedText.length > 0 && trimmedCategory.length > 0 && !saving;

  async function handleSave() {
    if (!canSave) return;
    setSaving(true);
    try {
      await insertUserPrompt({ category: trimmedCategory, text: trimmedText, difficultyTier });
      showToast("Prompt added", "success");
      navigation.goBack();
    } catch {
      showToast("Couldn't save that prompt — try again", "error");
    } finally {
      setSaving(false);
    }
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
        <Text style={styles.title}>Add a Prompt</Text>
        <View style={styles.headerSpacer} />
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>Prompt</Text>
        <TextInput
          style={styles.textArea}
          value={text}
          onChangeText={(value) => setText(value.slice(0, TEXT_MAX_LENGTH))}
          placeholder="What should you talk about?"
          placeholderTextColor={colors.textMuted}
          multiline
          textAlignVertical="top"
          accessibilityLabel="Prompt text"
        />
        <Text style={styles.charCount}>
          {trimmedText.length}/{TEXT_MAX_LENGTH}
        </Text>
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>Category</Text>
        <TextInput
          style={styles.input}
          value={category}
          onChangeText={setCategory}
          placeholder="e.g. Opinion, Story, Explain…"
          placeholderTextColor={colors.textMuted}
          accessibilityLabel="Prompt category"
        />
        {existingCategories.length > 0 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
            {existingCategories.map((existing) => (
              <Pressable
                key={existing}
                onPress={() => setCategory(existing)}
                style={styles.chip}
                accessibilityRole="button"
                accessibilityLabel={`Use category ${existing}`}
              >
                <Text style={styles.chipText}>{existing}</Text>
              </Pressable>
            ))}
          </ScrollView>
        ) : null}
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>Difficulty</Text>
        <SegmentedControl options={DIFFICULTY_OPTIONS} value={difficultyTier} onChange={setDifficultyTier} />
      </View>

      <View style={styles.spacer} />
      <PrimaryButton label="Save Prompt" onPress={handleSave} disabled={!canSave} loading={saving} />
    </ScreenContainer>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  container: { gap: spacing.lg },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  headerSpacer: { width: 24 },
  title: { color: colors.textPrimary, fontSize: typography.title, fontWeight: "700" },
  field: { gap: spacing.sm },
  label: { color: colors.textSecondary, fontSize: typography.caption, fontWeight: "700", letterSpacing: 0.4 },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    color: colors.textPrimary,
    fontSize: typography.body,
  },
  textArea: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    color: colors.textPrimary,
    fontSize: typography.body,
    minHeight: 110,
  },
  charCount: { color: colors.textMuted, fontSize: typography.caption, textAlign: "right" },
  chipRow: { flexDirection: "row", gap: spacing.xs, marginTop: spacing.xs },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radii.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipText: { color: colors.textSecondary, fontSize: typography.caption, fontWeight: "600" },
  spacer: { flex: 1 },
}));
