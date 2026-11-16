import { useCallback, useState } from "react";
import { FlatList, Pressable, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../navigation";
import { ScreenContainer } from "../components/common/ScreenContainer";
import { Header } from "../components/common/Header";
import { Card } from "../components/common/Card";
import { Badge } from "../components/common/Badge";
import { SegmentedControl } from "../components/common/SegmentedControl";
import { TONGUE_TWISTERS } from "../data/tongueTwisters";
import type { StreakResult } from "../domain/streaks";
import { getStreakState } from "../services/db/progressRepo";
import { getTakeLevel } from "../services/prefs/prefsStore";
import { takeTier } from "../domain/difficulty/scale";
import type { DifficultyTier } from "../domain/sessionTypes";
import { spacing } from "../theme/theme";
import { Txt } from "../components/common/Txt";
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
  const [recommendedTier] = useState<DifficultyTier>(() => takeTier(getTakeLevel()));
  const [difficultyFilter, setDifficultyFilter] = useState<DifficultyFilter>(recommendedTier);
  const [streak, setStreak] = useState<StreakResult>(EMPTY_STREAK);

  useFocusEffect(
    useCallback(() => {
      getStreakState()
        .then(setStreak)
        .catch(() => setStreak(EMPTY_STREAK));
    }, []),
  );

  const filteredTwisters =
    difficultyFilter === "all" ? TONGUE_TWISTERS : TONGUE_TWISTERS.filter((t) => t.difficulty === difficultyFilter);

  return (
    <ScreenContainer style={styles.container}>
      <Header title="Drills" onBack={() => navigation.goBack()} backIcon="close"
      />

      <Card style={styles.streakCard}>
        <Ionicons name="flame" size={28} color={streak.currentStreak > 0 ? colors.warning : colors.textMuted} />
        <View style={styles.streakTextGroup}>
          <Txt variant="headline">
            {streak.currentStreak} day{streak.currentStreak === 1 ? "" : "s"} streak
          </Txt>
          <Txt variant="footnote" tone="muted">
            Short daily reps beat occasional long ones — a few seconds counts.
          </Txt>
        </View>
      </Card>

      <SegmentedControl options={DIFFICULTY_FILTERS} value={difficultyFilter} onChange={setDifficultyFilter} />
      {difficultyFilter === recommendedTier ? (
        <Txt variant="caption1" tone="accent" weight="600">★ Recommended for you, from your take difficulty</Txt>
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
                <Txt variant="footnote" tone="muted" weight="600">×{item.repeatCount}</Txt>
              </View>
              <Txt variant="headline">{item.text}</Txt>
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
  streakCard: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  streakTextGroup: { flex: 1, gap: 2 },
  list: { gap: spacing.sm, paddingBottom: spacing.lg },
  twisterCard: { gap: spacing.xs },
  twisterCardHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
}));
