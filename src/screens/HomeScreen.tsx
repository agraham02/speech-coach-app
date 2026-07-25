import { useCallback, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { RootStackParamList } from "../navigation";
import { ScreenContainer } from "../components/common/ScreenContainer";
import { PrimaryButton } from "../components/common/PrimaryButton";
import { LoadingSpinner } from "../components/common/LoadingSpinner";
import { Card } from "../components/common/Card";
import { Badge } from "../components/common/Badge";
import { Banner } from "../components/common/Banner";
import { AVOID_REPEAT_LAST_N, pickTodaysPrompt } from "../domain/pickTodaysPrompt";
import { FREE_RECORD_PROMPT } from "../data/topics";
import { getAllPrompts } from "../services/db/promptsRepo";
import { getRecentlyUsedPromptIds, getTodaysSession } from "../services/db/sessionsRepo";
import type { Prompt } from "../domain/sessionTypes";
import { colors, spacing, typography } from "../theme/theme";

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

export function HomeScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [prompt, setPrompt] = useState<Prompt | null>(null);
  const [alreadyPracticedToday, setAlreadyPracticedToday] = useState(false);

  useFocusEffect(
    useCallback(() => {
      getRecentlyUsedPromptIds(AVOID_REPEAT_LAST_N)
        .then((excludeIds) => setPrompt(pickTodaysPrompt(getAllPrompts(), excludeIds)))
        .catch(() => setPrompt(pickTodaysPrompt(getAllPrompts())));

      getTodaysSession()
        .then((session) => setAlreadyPracticedToday(session?.status === "done"))
        .catch(() => setAlreadyPracticedToday(false));
    }, []),
  );

  if (!prompt) {
    return (
      <ScreenContainer style={styles.centered}>
        <LoadingSpinner />
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.eyebrow}>{getGreeting()}</Text>
          <Text style={styles.appName}>Speech Coach</Text>
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
        <Card style={styles.promptCard}>
          <Badge label={prompt.category} />
          <Text style={styles.promptText}>{prompt.text}</Text>
        </Card>

        {alreadyPracticedToday ? (
          <Banner
            tone="success"
            text="You've already practiced today — recording again just adds another session."
          />
        ) : (
          <Text style={styles.hint}>Take a breath, then respond in 1–5 minutes. There's no wrong answer.</Text>
        )}
      </View>

      <View style={styles.actions}>
        <PrimaryButton
          label={alreadyPracticedToday ? "Practice Again" : "Start Recording"}
          onPress={() => navigation.navigate("Recording", { prompt })}
        />
        <PrimaryButton
          label="Free Record (no prompt)"
          variant="ghost"
          onPress={() => navigation.navigate("Recording", { prompt: FREE_RECORD_PROMPT })}
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
  eyebrow: { color: colors.textSecondary, fontSize: typography.body },
  appName: { color: colors.textPrimary, fontSize: typography.title, fontWeight: "700" },
  middle: { flex: 1, justifyContent: "center", gap: spacing.lg },
  promptCard: { gap: spacing.md },
  promptText: { color: colors.textPrimary, fontSize: typography.headline, fontWeight: "600", lineHeight: 36 },
  hint: { color: colors.textMuted, fontSize: typography.body, textAlign: "center" },
});
