import { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../navigation";
import { ScreenContainer } from "../components/common/ScreenContainer";
import { PrimaryButton } from "../components/common/PrimaryButton";
import { LoadingSpinner } from "../components/common/LoadingSpinner";
import { Card } from "../components/common/Card";
import { Badge } from "../components/common/Badge";
import { Banner } from "../components/common/Banner";
import { getSessionById } from "../services/db/sessionsRepo";
import { getPrompt } from "../services/db/promptsRepo";
import type { Session } from "../domain/sessionTypes";
import { formatDuration } from "../utils/dateUtils";
import { colors, spacing, typography } from "../theme/theme";

type Props = NativeStackScreenProps<RootStackParamList, "Result">;

export function ResultScreen({ route, navigation }: Props) {
  const { sessionId } = route.params;
  const [session, setSession] = useState<Session | null>(null);
  const [showVerbatim, setShowVerbatim] = useState(false);

  useEffect(() => {
    getSessionById(sessionId).then(setSession);
  }, [sessionId]);

  if (!session) {
    return (
      <ScreenContainer style={styles.centered}>
        <LoadingSpinner />
      </ScreenContainer>
    );
  }

  const prompt = getPrompt(session.promptId);

  return (
    <ScreenContainer style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <Banner
          tone={session.notionSyncedAt ? "success" : "warning"}
          text={session.notionSyncedAt ? "Saved to Notion" : "Saved locally — not yet synced to Notion"}
        />

        {prompt ? (
          <Card style={styles.promptCard}>
            <Badge label={prompt.category} />
            <Text style={styles.promptText}>{prompt.text}</Text>
          </Card>
        ) : null}

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionLabel}>YOUR RESPONSE</Text>
          <Text style={styles.duration}>{formatDuration(session.durationSeconds)}</Text>
        </View>
        <Card>
          <Text style={styles.transcript}>{session.transcriptClean}</Text>
        </Card>

        <Pressable style={styles.verbatimToggle} onPress={() => setShowVerbatim((v) => !v)}>
          <Text style={styles.verbatimToggleText}>
            {showVerbatim ? "Hide verbatim transcript" : "Show verbatim transcript"}
          </Text>
          <Ionicons
            name={showVerbatim ? "chevron-up" : "chevron-down"}
            size={16}
            color={colors.accent}
          />
        </Pressable>
        {showVerbatim ? (
          <Card style={styles.verbatimCard}>
            <Text style={styles.verbatim}>{session.transcriptVerbatim}</Text>
          </Card>
        ) : null}
      </ScrollView>

      <PrimaryButton label="Done" onPress={() => navigation.popToTop()} />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.md },
  centered: { alignItems: "center", justifyContent: "center" },
  scrollContent: { gap: spacing.md, paddingBottom: spacing.lg },
  promptCard: { gap: spacing.sm },
  promptText: { color: colors.textSecondary, fontSize: typography.body, lineHeight: 21, fontStyle: "italic" },
  sectionHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: spacing.sm },
  sectionLabel: { color: colors.accent, fontSize: typography.caption - 1, fontWeight: "700", letterSpacing: 1 },
  duration: { color: colors.textMuted, fontSize: typography.caption },
  transcript: { color: colors.textPrimary, fontSize: typography.bodyLarge, lineHeight: 25 },
  verbatimToggle: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.xs, paddingVertical: spacing.sm },
  verbatimToggleText: { color: colors.accent, fontSize: typography.body, fontWeight: "600" },
  verbatimCard: { backgroundColor: colors.surfaceRaised },
  verbatim: { color: colors.textSecondary, fontSize: typography.body, lineHeight: 21, fontStyle: "italic" },
});
