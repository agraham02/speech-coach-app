import { useCallback, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { RootStackParamList } from "../navigation";
import { ScreenContainer } from "../components/common/ScreenContainer";
import { PrimaryButton } from "../components/common/PrimaryButton";
import { LoadingSpinner } from "../components/common/LoadingSpinner";
import { HeroCard } from "../components/common/HeroCard";
import { Badge } from "../components/common/Badge";
import { Banner } from "../components/common/Banner";
import { AVOID_REPEAT_LAST_N, pickRandomPrompt, pickTodaysPrompt } from "../domain/pickTodaysPrompt";
import { FREE_RECORD_PROMPT } from "../data/topics";
import { computeStreaks, type StreakResult } from "../domain/streaks";
import { colorForCategory } from "../domain/categoryColor";
import { getAllPrompts } from "../services/db/promptsRepo";
import { getRecentlyUsedPromptIds, getTodaysSession } from "../services/db/sessionsRepo";
import { getCompletedSessionDates } from "../services/db/statsRepo";
import { useTabBarBottomInset } from "../hooks/useTabBarBottomInset";
import type { Prompt } from "../domain/sessionTypes";
import { colors, fontDisplay, spacing, typography } from "../theme/theme";

const EMPTY_STREAK: StreakResult = { currentStreak: 0, longestStreak: 0 };

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

export function HomeScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const tabBarInset = useTabBarBottomInset();
  const [prompt, setPrompt] = useState<Prompt | null>(null);
  const [recentPromptIds, setRecentPromptIds] = useState<string[]>([]);
  const [alreadyPracticedToday, setAlreadyPracticedToday] = useState(false);
  const [streak, setStreak] = useState<StreakResult>(EMPTY_STREAK);

  useFocusEffect(
    useCallback(() => {
      getRecentlyUsedPromptIds(AVOID_REPEAT_LAST_N)
        .then((excludeIds) => {
          setRecentPromptIds(excludeIds);
          setPrompt(pickTodaysPrompt(getAllPrompts(), excludeIds));
        })
        .catch(() => setPrompt(pickTodaysPrompt(getAllPrompts())));

      getTodaysSession()
        .then((session) => setAlreadyPracticedToday(session?.status === "done"))
        .catch(() => setAlreadyPracticedToday(false));

      getCompletedSessionDates()
        .then((dates) => setStreak(computeStreaks(dates)))
        .catch(() => setStreak(EMPTY_STREAK));
    }, []),
  );

  // Rerolls to a different prompt, avoiding both the same recently-used
  // window as the daily pick AND whatever's currently on screen, so pressing
  // the dice always changes something instead of occasionally no-opping.
  function rerollPrompt() {
    setPrompt((current) => {
      const excludeIds = current ? [...recentPromptIds, current.id] : recentPromptIds;
      return pickRandomPrompt(getAllPrompts(), excludeIds);
    });
  }

  if (!prompt) {
    return (
      <ScreenContainer style={styles.centered}>
        <LoadingSpinner />
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer style={styles.container} edges={["top", "left", "right"]}>
      <View style={styles.header}>
        <View>
          <Text style={styles.eyebrow}>{getGreeting()}</Text>
          <Text style={styles.appName}>Speech Coach</Text>
          {streak.currentStreak > 0 ? (
            <View style={styles.streakRow}>
              <Ionicons name="flame" size={14} color={colors.warning} />
              <Text style={styles.streakNumber}>{streak.currentStreak}</Text>
              <Text style={styles.streakText}>
                day streak{streak.currentStreak === streak.longestStreak ? " · personal best" : ""}
              </Text>
            </View>
          ) : null}
        </View>
        <Pressable
          onPress={() => navigation.navigate("Settings")}
          hitSlop={12}
          style={styles.settingsButton}
          accessibilityRole="button"
          accessibilityLabel="Settings"
        >
          <Ionicons name="settings-outline" size={24} color={colors.textSecondary} />
        </Pressable>
      </View>

      <View style={styles.middle}>
        <HeroCard
          contentStyle={styles.promptCard}
          accent={colorForCategory(prompt.category).fg}
          accentSecondary={colors.violet}
        >
          <View style={styles.promptCardHeader}>
            <Badge label={prompt.category} {...colorForCategory(prompt.category)} />
            <Pressable
              onPress={rerollPrompt}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel="Get a different prompt"
            >
              <Ionicons name="dice-outline" size={22} color={colors.textSecondary} />
            </Pressable>
          </View>
          <Text style={styles.promptText}>{prompt.text}</Text>
        </HeroCard>

        {alreadyPracticedToday ? (
          <Banner
            tone="success"
            text="You've already practiced today — recording again just adds another session."
          />
        ) : (
          <Text style={styles.hint}>Take a breath, then respond in 1–5 minutes. There's no wrong answer.</Text>
        )}
      </View>

      <View style={[styles.actions, { paddingBottom: tabBarInset }]}>
        <PrimaryButton
          label={alreadyPracticedToday ? "Practice Again" : "Start Recording"}
          onPress={() => navigation.navigate("Recording", { kind: "prompt", prompt })}
        />
        <PrimaryButton
          label="Free Record (no prompt)"
          variant="ghost"
          onPress={() => navigation.navigate("Recording", { kind: "prompt", prompt: FREE_RECORD_PROMPT })}
        />
        <PrimaryButton
          label="Practice a Script"
          variant="ghost"
          onPress={() => navigation.navigate("ScriptLibrary")}
        />
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  container: { justifyContent: "space-between" },
  actions: { gap: spacing.sm },
  centered: { alignItems: "center", justifyContent: "center" },
  header: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" },
  settingsButton: { padding: spacing.xs },
  promptCardHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  eyebrow: { color: colors.textSecondary, fontSize: typography.body },
  appName: { color: colors.textPrimary, fontSize: typography.title, fontWeight: "700" },
  streakRow: { flexDirection: "row", alignItems: "baseline", gap: spacing.xs, marginTop: spacing.xs },
  streakNumber: { color: colors.warning, fontSize: typography.body, fontFamily: fontDisplay.bold },
  streakText: { color: colors.textSecondary, fontSize: typography.caption, fontWeight: "600" },
  middle: { flex: 1, justifyContent: "center", gap: spacing.lg },
  promptCard: { gap: spacing.md },
  promptText: { color: colors.textPrimary, fontSize: typography.headline, fontWeight: "600", lineHeight: 36 },
  hint: { color: colors.textMuted, fontSize: typography.body, textAlign: "center" },
});
