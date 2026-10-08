import { useCallback, useState } from "react";
import { FlatList, Pressable, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../navigation";
import { ScreenContainer } from "../components/common/ScreenContainer";
import { Card } from "../components/common/Card";
import { Badge } from "../components/common/Badge";
import { SegmentedControl } from "../components/common/SegmentedControl";
import { TONGUE_TWISTERS } from "../data/tongueTwisters";
import { computeStreaks, type StreakResult } from "../domain/streaks";
import { getDrillCompletionDates } from "../services/db/drillsRepo";
import { getEffectiveCurriculumLevel } from "../services/db/curriculumRepo";
import { levelToDifficultyTier } from "../domain/curriculum";
import type { DifficultyTier } from "../domain/sessionTypes";
import { spacing, typography } from "../theme/theme";
import { makeStyles, useTheme } from "../theme/ThemeProvider";
import type { Colors } from "../theme/theme";

type Props = NativeStackScreenProps<RootStackParamList, "Drills">;

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

const EMPTY_STREAK: StreakResult = { currentStreak: 0, longestStreak: 0 };

export function DrillsScreen({ navigation }: Props) {
  const styles = useStyles();
  const { colors } = useTheme();
  // Soft default, not a hard gate — pre-selects the curriculum-implied tier
  // (with a "Recommended for you" hint) but the user can freely browse
  // other tiers ad hoc, same as any other SegmentedControl choice.
  const [recommendedTier] = useState<DifficultyTier>(() => levelToDifficultyTier(getEffectiveCurriculumLevel().level));
  const [difficultyFilter, setDifficultyFilter] = useState<DifficultyFilter>(recommendedTier);
  const [streak, setStreak] = useState<StreakResult>(EMPTY_STREAK);

  useFocusEffect(
    useCallback(() => {
      getDrillCompletionDates()
        .then((dates) => setStreak(computeStreaks(dates)))
        .catch(() => setStreak(EMPTY_STREAK));
    }, []),
  );

  const filteredTwisters =
    difficultyFilter === "all" ? TONGUE_TWISTERS : TONGUE_TWISTERS.filter((t) => t.difficulty === difficultyFilter);

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
        <Text style={styles.title}>Drills</Text>
        <View style={{ width: 24 }} />
      </View>

      <Card style={styles.streakCard}>
        <Ionicons name="flame" size={28} color={streak.currentStreak > 0 ? colors.warning : colors.textMuted} />
        <View style={styles.streakTextGroup}>
          <Text style={styles.streakNumber}>
            {streak.currentStreak} day{streak.currentStreak === 1 ? "" : "s"} streak
          </Text>
          <Text style={styles.streakSubtext}>
            Short daily reps beat occasional long ones — a few seconds counts.
          </Text>
        </View>
      </Card>

      <SegmentedControl options={DIFFICULTY_FILTERS} value={difficultyFilter} onChange={setDifficultyFilter} />
      {difficultyFilter === recommendedTier ? (
        <Text style={styles.recommendedHint}>★ Recommended for you, based on your curriculum level</Text>
      ) : null}

      <FlatList
        data={filteredTwisters}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        renderItem={({ item }) => (
          <Pressable onPress={() => navigation.navigate("DrillSession", { twisterId: item.id })}>
            <Card style={styles.twisterCard}>
              <View style={styles.twisterCardHeader}>
                <Badge label={item.difficulty} fg={difficultyColors(colors)[item.difficulty]} bg={colors.surfaceRaised} />
                <Text style={styles.repeatHint}>×{item.repeatCount}</Text>
              </View>
              <Text style={styles.twisterText}>{item.text}</Text>
            </Card>
          </Pressable>
        )}
      />
    </ScreenContainer>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  container: { gap: spacing.md },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  title: { color: colors.textPrimary, fontSize: typography.title, fontWeight: "700" },
  streakCard: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  streakTextGroup: { flex: 1, gap: 2 },
  streakNumber: { color: colors.textPrimary, fontSize: typography.bodyLarge, fontWeight: "700" },
  streakSubtext: { color: colors.textMuted, fontSize: typography.caption },
  recommendedHint: { color: colors.accent, fontSize: typography.caption - 1, fontWeight: "600" },
  list: { gap: spacing.sm, paddingBottom: spacing.lg },
  twisterCard: { gap: spacing.xs },
  twisterCardHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  repeatHint: { color: colors.textMuted, fontSize: typography.caption, fontWeight: "600" },
  twisterText: { color: colors.textPrimary, fontSize: typography.bodyLarge, fontWeight: "600", lineHeight: 22 },
}));
