import { useCallback, useState } from "react";
import { Pressable, ScrollView, TextInput, View } from "react-native";
import { KeyboardForm } from "../components/common/KeyboardForm";
import { useFocusEffect } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../navigation";
import { ScreenContainer } from "../components/common/ScreenContainer";
import { Header } from "../components/common/Header";
import { PrimaryButton } from "../components/common/PrimaryButton";
import { SegmentedControl } from "../components/common/SegmentedControl";
import { useToast } from "../components/common/ToastProvider";
import { getAllPrompts, insertUserPrompt } from "../services/db/promptsRepo";
import type { DifficultyTier } from "../domain/sessionTypes";
import { radii, spacing } from "../theme/theme";
import { typeScale } from "../theme/tokens";
import { Txt } from "../components/common/Txt";
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
      <Header title="Add a prompt" onBack={() => navigation.goBack()} backIcon="close"
      />

      <KeyboardForm
        contentContainerStyle={styles.scroll}
        footer={
            <PrimaryButton label="Save Prompt" onPress={handleSave} disabled={!canSave} loading={saving} />
        }
      >
        <View style={styles.field}>
          <Txt variant="footnote" tone="secondary" weight="600">Prompt</Txt>
          <TextInput maxLength={300}
            style={styles.textArea}
            value={text}
            onChangeText={(value) => setText(value.slice(0, TEXT_MAX_LENGTH))}
            placeholder="What should you talk about?"
            placeholderTextColor={colors.textMuted}
            multiline
            textAlignVertical="top"
            accessibilityLabel="Prompt text"
          />
          <Txt variant="footnote" tone="muted" align="right">
            {trimmedText.length}/{TEXT_MAX_LENGTH}
          </Txt>
        </View>

        <View style={styles.field}>
          <Txt variant="footnote" tone="secondary" weight="600">Category</Txt>
          <TextInput maxLength={40}
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
                  <Txt variant="footnote" tone="secondary" weight="600">{existing}</Txt>
                </Pressable>
              ))}
            </ScrollView>
          ) : null}
        </View>

        <View style={styles.field}>
          <Txt variant="footnote" tone="secondary" weight="600">Difficulty</Txt>
          <SegmentedControl options={DIFFICULTY_OPTIONS} value={difficultyTier} onChange={setDifficultyTier} />
        </View>
      </KeyboardForm>
    </ScreenContainer>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  container: { gap: spacing.lg },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  headerSpacer: { width: 24 },
  field: { gap: spacing.sm },
  input: {
    ...typeScale.callout,
    backgroundColor: colors.surfaceRaised,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    color: colors.textPrimary,
  },
  textArea: {
    ...typeScale.callout,
    backgroundColor: colors.surfaceRaised,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    color: colors.textPrimary,
    minHeight: 110,
  },
  chipRow: { flexDirection: "row", gap: spacing.xs, marginTop: spacing.xs },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radii.pill,
    backgroundColor: colors.surfaceRaised,
  },
  scroll: { gap: spacing.lg, paddingBottom: spacing.md },
}));
