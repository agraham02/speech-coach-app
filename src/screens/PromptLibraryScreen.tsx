import { useCallback, useState } from "react";
import { FlatList, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../navigation";
import { ScreenContainer } from "../components/common/ScreenContainer";
import { Card } from "../components/common/Card";
import { Badge } from "../components/common/Badge";
import { SegmentedControl } from "../components/common/SegmentedControl";
import { getAllPrompts } from "../services/db/promptsRepo";
import { colorForCategory } from "../domain/categoryColor";
import type { DifficultyTier, Prompt } from "../domain/sessionTypes";
import { radii, spacing, typography, font } from "../theme/theme";
import { makeStyles, useTheme } from "../theme/ThemeProvider";
import type { Colors } from "../theme/theme";

type Props = NativeStackScreenProps<RootStackParamList, "PromptLibrary">;

type DifficultyFilter = "all" | DifficultyTier;

const DIFFICULTY_FILTERS: { key: DifficultyFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "easy", label: "Easy" },
  { key: "medium", label: "Medium" },
  { key: "hard", label: "Hard" },
];

const difficultyColors = (colors: Colors): Record<DifficultyTier, string> => ({
  easy: colors.success,
  medium: colors.warning,
  hard: colors.danger,
});

export function PromptLibraryScreen({ navigation }: Props) {
  const styles = useStyles();
  const { colors } = useTheme();
  const [prompts, setPrompts] = useState<Prompt[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [difficultyFilter, setDifficultyFilter] = useState<DifficultyFilter>("all");

  // Refresh on focus, not a module-level static init — prompts are DB-backed
  // now, so a prompt just added via AddPromptScreen needs to appear
  // immediately on return, not just on a fresh mount.
  useFocusEffect(
    useCallback(() => {
      getAllPrompts().then(setPrompts);
    }, []),
  );

  const categoryOptions = ["all", ...new Set(prompts.map((p) => p.category))];

  const query = searchQuery.trim().toLowerCase();
  const filteredPrompts = prompts.filter((p) => {
    if (categoryFilter !== "all" && p.category !== categoryFilter) return false;
    if (difficultyFilter !== "all" && p.difficultyTier !== difficultyFilter) return false;
    if (!query) return true;
    return `${p.text} ${p.category}`.toLowerCase().includes(query);
  });

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
        <Text style={styles.title}>Prompts</Text>
        <Pressable
          onPress={() => navigation.navigate("AddPrompt")}
          hitSlop={12}
          style={styles.addButton}
          accessibilityRole="button"
          accessibilityLabel="Add a prompt"
        >
          <Ionicons name="add" size={22} color={colors.accent} />
        </Pressable>
      </View>

      <View style={styles.searchBox}>
        <Ionicons name="search-outline" size={16} color={colors.textMuted} />
        <TextInput
          style={styles.searchInput}
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder="Search prompts"
          placeholderTextColor={colors.textMuted}
          returnKeyType="search"
          accessibilityLabel="Search prompts"
        />
      </View>

      <SegmentedControl options={DIFFICULTY_FILTERS} value={difficultyFilter} onChange={setDifficultyFilter} />

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipRow}
        style={styles.chipScroll}
      >
        {categoryOptions.map((category) => {
          const selected = categoryFilter === category;
          return (
            <Pressable
              key={category}
              onPress={() => setCategoryFilter(category)}
              style={[styles.chip, selected && styles.chipSelected]}
              accessibilityRole="button"
              accessibilityLabel={`Filter by ${category}`}
              accessibilityState={{ selected }}
            >
              <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
                {category === "all" ? "All" : category}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {filteredPrompts.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="chatbubble-outline" size={40} color={colors.textMuted} />
          <Text style={styles.emptyText}>
            {prompts.length === 0 ? "Loading prompts…" : "Nothing matches your search or filters."}
          </Text>
        </View>
      ) : (
        <FlatList
          data={filteredPrompts}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => (
            <Pressable onPress={() => navigation.navigate("Recording", { kind: "prompt", prompt: item })}>
              <Card style={styles.promptCard}>
                <View style={styles.promptCardHeader}>
                  <Badge label={item.category} {...colorForCategory(item.category, colors)} />
                  {item.difficultyTier ? (
                    <Badge
                      label={item.difficultyTier}
                      fg={difficultyColors(colors)[item.difficultyTier]}
                      bg={colors.surfaceRaised}
                    />
                  ) : null}
                </View>
                <Text style={styles.promptText} numberOfLines={2}>
                  {item.text}
                </Text>
              </Card>
            </Pressable>
          )}
        />
      )}
    </ScreenContainer>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  container: { gap: spacing.md },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  title: { color: colors.textPrimary, fontSize: typography.title, ...font("700") },
  addButton: { padding: spacing.xs },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  searchInput: { ...font("400"), flex: 1, color: colors.textPrimary, fontSize: typography.body, padding: 0 },
  chipScroll: { flexGrow: 0 },
  chipRow: { flexDirection: "row", gap: spacing.xs },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radii.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipSelected: { backgroundColor: colors.accentMuted, borderColor: colors.accent },
  chipText: { color: colors.textSecondary, fontSize: typography.caption, ...font("600") },
  chipTextSelected: { color: colors.accent },
  list: { gap: spacing.sm, paddingBottom: spacing.lg },
  promptCard: { gap: spacing.xs },
  promptCardHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  promptText: { color: colors.textPrimary, fontSize: typography.bodyLarge, ...font("600"), lineHeight: 22 },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", gap: spacing.md },
  emptyText: { ...font("400"), color: colors.textMuted, fontSize: typography.body, textAlign: "center", paddingHorizontal: spacing.xl },
}));
